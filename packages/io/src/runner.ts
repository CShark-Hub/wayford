/**
 * The in-process job runner (s4-03): a run set's persona × seed runs, at most five at once, each
 * run's events published live as they arrive, and each run stored when it ends
 * (`docs/specs/2026-10-02-s4-03-runs-api.md`, "runner.ts"). One Node process, no queue service and
 * no workers (`docs/PLAN.md`, "Architecture"): the runs waiting for a slot are an array in memory.
 *
 * It builds on what `runActor` guarantees: every event stamped with the run's id and handed over
 * synchronously in order, and one terminal event after `runStarted`, with nothing after it. A run
 * that throws, or returns without a terminal event, is still ended and stored. What it stores is
 * its own fold of the events it published, never what `run` returns, so "the stored run is the
 * fold of what was streamed" holds by construction, for a fake too. A run's terminal event is held
 * back until the save has been tried, so a client that sees a stream end finds the run in
 * `GET /runs`, unless the save failed, which is logged.
 *
 * Agent is imported as types only, so loading the runner loads neither agent's runtime nor
 * Playwright (spec, decision log, "The barrel").
 */
import type { ActorBackendFactory, RunActorOptions, TargetAppParams } from "@wayford/agent";
import {
  type Cost,
  newId,
  type Profile,
  type ProfileId,
  RunEvent,
  type RunId,
  type RunResult,
  runResultFromEvents,
  type Seed,
  type Task,
  WayfordError,
} from "@wayford/core";
import type { Logger } from "pino";
import type { Db } from "./db/database.js";
import { saveRun } from "./db/runs.js";

/**
 * `runActor`'s interface without the browser, which belongs to whoever builds the function
 * (`chromium.ts`).
 */
export type RunFn = (options: Omit<RunActorOptions, "browser">) => Promise<RunResult>;

export interface RunnerOptions {
  db: Db;
  run: RunFn;
  /** One backend per run, built by `run`. */
  actor: ActorBackendFactory;
  /** The target app's parameters, the same for every run. */
  params: TargetAppParams;
  /**
   * The target app's jargon list, the same for every run: `@wayford/core/fixtures`
   * `targetAppJargon`, which `runActor` hands to `perceive` for K2.
   */
  jargon: readonly string[];
  /** Absolute. Each run's files go under `<runsDir>/<runId>/`. */
  runsDir: string;
  logger: Logger;
}

/**
 * One run of a set, as `start` hands it back. A run still waiting for a slot has sent no
 * `runStarted`, so the receipt names its persona and seed.
 */
export interface StartedRun {
  id: RunId;
  profileId: ProfileId;
  seed: Seed;
}

/** A run's live side: what the events route streams. */
export interface LiveRun {
  /** Published so far, in order. The terminal event comes last, once the save has been tried. */
  readonly events: readonly RunEvent[];
  /** Set with the terminal event: nothing is published after it. */
  readonly ended: boolean;
  /** Resolves at the next publish or at the end, and at once when the run has already ended. */
  changed(): Promise<void>;
}

export interface Runner {
  /** Mints one id per seed × persona, in seed-major order, and queues the runs. Returns at once. */
  start(task: Task, profiles: readonly Profile[], seeds: readonly Seed[]): StartedRun[];
  /** The run with this id, started by this runner, or `undefined`. */
  live(id: string): LiveRun | undefined;
}

/**
 * Runs at once per `Runner`: five contexts on one Chromium (`docs/PLAN.md`, "Architecture"), and
 * the ring opens at most five streams.
 */
export const MAX_CONCURRENT_RUNS = 5;

/**
 * A runner over one database and one `run`. Its slots and live runs are its own, so two runners
 * share nothing; `createApp` builds one, so an app runs at most five runs at once. Live runs are
 * kept for the runner's life.
 */
export function createRunner(options: RunnerOptions): Runner {
  const { db, run, actor, params, jargon, runsDir, logger } = options;
  const lives = new Map<string, LiveRun>();
  const slots = slotQueue(MAX_CONCURRENT_RUNS);

  /**
   * One run, from its slot to its stored record and the end of its stream. Never rejects: what
   * cannot go anywhere else goes to the log.
   */
  async function job(
    runId: RunId,
    inputs: { task: Task; profile: Profile; seed: Seed },
    slot: Promise<void>,
    live: LiveWriter,
  ): Promise<void> {
    const log = logger.child({ runId });
    let held: Terminal | undefined;
    const onEvent = (event: RunEvent): void => {
      if (event.type === "runFinished" || event.type === "runFailed") held = event;
      else live.publish(event);
    };

    try {
      await slot;
      let settled: Settled;
      try {
        await run({ ...inputs, params, jargon, runsDir, backend: actor, logger, runId, onEvent });
        settled = { ok: true };
      } catch (error) {
        settled = { ok: false, error };
      }
      slots.free();
      await closeOut({ db, log, runId, live, held, settled });
    } catch (error) {
      // Only a bug in io gets here. The stream still ends, with no terminal event.
      log.error({ err: error }, "closing the run out failed");
      live.end(undefined);
    }
  }

  return {
    start(task, profiles, seeds) {
      const started: StartedRun[] = [];
      // Seed-major: a set cut short still has whole seeds, comparable across personas (A20).
      for (const seed of seeds) {
        for (const profile of profiles) {
          const id = newId("run");
          const live = liveRun();
          // Stored as a `LiveRun`, so a reader gets no way to publish.
          lives.set(id, live);
          // The slot is asked for now, in call order, so the queue is FIFO across `start` calls.
          void job(id, { task, profile, seed }, slots.take(), live);
          started.push({ id, profileId: profile.id, seed });
        }
      }
      return started;
    },
    live: (id) => lives.get(id),
  };
}

// ---------------------------------------------------------------------------
// Slots and live events
// ---------------------------------------------------------------------------

/**
 * `size` slots and a FIFO of the runs waiting for one. `take` decides a run's place at once, in
 * call order, and `free` hands the slot straight to the next in line, so no later `take` can jump
 * the queue.
 */
function slotQueue(size: number) {
  let open = size;
  const waiting: (() => void)[] = [];
  return {
    take(): Promise<void> {
      if (open > 0) {
        open--;
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        waiting.push(resolve);
      });
    },
    free(): void {
      const next = waiting.shift();
      if (next === undefined) open++;
      else next();
    },
  };
}

/** A run's live events, with the two writes only its job makes. */
interface LiveWriter extends LiveRun {
  publish(event: RunEvent): void;
  /** Publishes the terminal event, when there is one, and ends the run. Later calls do nothing. */
  end(terminal: RunEvent | undefined): void;
}

function liveRun(): LiveWriter {
  const events: RunEvent[] = [];
  let ended = false;
  let waiters: (() => void)[] = [];
  const wake = (): void => {
    const woken = waiters;
    waiters = [];
    for (const resolve of woken) resolve();
  };
  return {
    events,
    get ended() {
      return ended;
    },
    changed() {
      if (ended) return Promise.resolve();
      return new Promise((resolve) => {
        waiters.push(resolve);
      });
    },
    publish(event) {
      events.push(event);
      wake();
    },
    end(terminal) {
      if (ended) return;
      if (terminal !== undefined) events.push(terminal);
      ended = true;
      wake();
    },
  };
}

// ---------------------------------------------------------------------------
// Close-out
// ---------------------------------------------------------------------------

type Terminal = Extract<RunEvent, { type: "runFinished" | "runFailed" }>;

type Settled = { ok: true } | { ok: false; error: unknown };

/**
 * Ends a run whose `run` has settled. A run that started is folded and stored, with the runner's
 * own `runFailed` in place of a terminal event it never sent; then its terminal event is
 * published, which ends its stream. A run that never started is stored nowhere.
 */
async function closeOut(close: {
  db: Db;
  log: Logger;
  runId: RunId;
  live: LiveWriter;
  held: Terminal | undefined;
  settled: Settled;
}): Promise<void> {
  const { db, log, runId, live, held, settled } = close;
  const { events } = live;
  const started = events.find((event) => event.type === "runStarted");
  // What the run threw, or the runner's own error for a run that returned and broke the contract.
  const fault = (code: string, message: string): unknown =>
    settled.ok ? new WayfordError(code, message) : settled.error;

  if (started === undefined) {
    // `RunResult` needs `runStarted`'s fields, the Actor's model id among them, and the runner
    // would have to invent them; the bare `runFailed` only ends the stream (spec, decision log).
    const error = fault("run_not_started", "the run returned without sending runStarted");
    log.error({ err: error }, "the run never started, so nothing is stored");
    live.end(ownFailure(runId, [], undefined, error));
    return;
  }

  let terminal: RunEvent;
  if (held === undefined) {
    const error = fault("run_not_ended", "the run returned without runFinished or runFailed");
    log.error({ err: error }, "the run stopped without a terminal event, so the runner ends it");
    terminal = ownFailure(runId, events, started.timestamp, error);
  } else {
    terminal = held;
    // `runActor` rejects after its terminal event when it could not write `result.json`. The
    // events are whole, so the run is stored all the same.
    if (!settled.ok) log.error({ err: settled.error }, "the run failed after its terminal event");
  }

  try {
    await saveRun(db, runResultFromEvents([...events, terminal]), started.timestamp);
  } catch (error) {
    // The one deliberate exception to "never swallow an error into a log line"
    // (`docs/CONVENTIONS.md`, "Errors"): a run is a background job, and the request that started
    // it was answered 202 long ago, so there is no caller to rethrow to. The stream still ends,
    // and the run is missing from the list.
    log.error({ err: error }, "the run could not be stored");
  }
  live.end(terminal);
}

/**
 * The runner's own `runFailed`, for a run that sent no terminal event. A run that never started
 * has no `startedAt` and no events, so it gets no duration and no cost.
 */
function ownFailure(
  runId: RunId,
  events: readonly RunEvent[],
  startedAt: string | undefined,
  error: unknown,
): RunEvent {
  const now = Date.now();
  return RunEvent.parse({
    type: "runFailed",
    runId,
    // The step `runActor`'s terminal event points at: the last one observed, 0 when none was.
    stepIndex: events.findLast((event) => event.type === "stepObserved")?.stepIndex ?? 0,
    timestamp: new Date(now).toISOString(),
    error: failureText(error),
    durationMs: startedAt === undefined ? 0 : Math.max(0, Math.round(now - Date.parse(startedAt))),
    // What the published events billed. A call that failed mid-step is unknown to the runner.
    cost: billed(events),
  });
}

/** The cost of every published `actionPlanned` and `stepWasted`, summed. */
function billed(events: readonly RunEvent[]): Cost {
  let cost = NO_COST;
  for (const event of events) {
    if (event.type === "actionPlanned" || event.type === "stepWasted") {
      cost = {
        tokensIn: cost.tokensIn + event.cost.tokensIn,
        tokensOut: cost.tokensOut + event.cost.tokensOut,
        usd: cost.usd + event.cost.usd,
      };
    }
  }
  return cost;
}

const NO_COST: Cost = { tokensIn: 0, tokensOut: 0, usd: 0 };

/**
 * `runFailed.error` for what a run threw: `<code>: <message>` for a `WayfordError`, as `runActor`
 * writes its own, and the value as a string otherwise (`<name>: <message>` for an `Error`). Never
 * empty, as the schema asks. Only the stream carries it, since `RunResult` keeps no error text,
 * and the log keeps the whole error.
 */
function failureText(error: unknown): string {
  return error instanceof WayfordError
    ? `${error.code}: ${error.message}`
    : String(error) || "no message";
}
