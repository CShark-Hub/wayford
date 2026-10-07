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
 * Every run of a set runs on one step cap, read from its task's ground truth when the set starts
 * (core's `stepCapOf`, issue #196), and every set of a sweep on the cap its first set read. The
 * Actor gets a number on its options, never Scout's path (`AGENTS.md`, "Scout is mandatory"). A
 * task with no file of its own, such as a Race's, reads the file of the fixture task with its start
 * URL and success condition. With no file, or a goal Scout did not reach, a run gets no cap and
 * `runActor`'s default stands; a file that is no ground truth is a warning, and the set runs on the
 * default.
 *
 * Agent is imported as types only, so loading the runner loads neither agent's runtime nor
 * Playwright (spec, decision log, "The barrel"). `analyst.ts`, whose `readGroundTruth` reads the
 * file, keeps to the same rule.
 */
import { isDeepStrictEqual } from "node:util";
import type {
  ActorBackendFactory,
  ActorBackendName,
  RunActorOptions,
  TargetAppParams,
} from "@wayford/agent";
import {
  type Cost,
  newId,
  type Profile,
  type ProfileId,
  RunEvent,
  type RunId,
  type RunResult,
  type RunSweep,
  runResultFromEvents,
  type Seed,
  stepCapOf,
  type Task,
  WayfordError,
} from "@wayford/core";
import { taskFixtures } from "@wayford/core/fixtures";
import type { Logger } from "pino";
import { readGroundTruth } from "./analyst.js";
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
  /**
   * The Actor's backends by name. A run set runs on one of them and nothing falls back to another
   * (`docs/adr/0001-jev-actor-backend.md`, decision 1). `run` builds one backend per run.
   */
  backends: Readonly<Record<ActorBackendName, ActorBackendFactory>>;
  /** The backend of a set that names none: `LLM_ACTOR_BACKEND`'s (`actor-backends.ts`). */
  defaultBackend: ActorBackendName;
  /**
   * The origin the target app is served on, port included: `http://localhost:5174` for io. A set
   * whose task starts there runs on the target app and gets `params` and `jargon`; any other set
   * gets neither, and `runActor` takes it as another site (`docs/adr/0003-any-target.md`, D2).
   * Parsed when the runner is built, so a bad one fails then.
   */
  targetAppOrigin: string;
  /** The target app's parameters, for every run on `targetAppOrigin`. */
  params: TargetAppParams;
  /**
   * The target app's jargon list, for every run on `targetAppOrigin`: `@wayford/core/fixtures`
   * `targetAppJargon`, which `runActor` hands to `perceive` for K2.
   */
  jargon: readonly string[];
  /** Absolute. Each run's files go under `<runsDir>/<runId>/`. */
  runsDir: string;
  /**
   * Absolute. Where Scout writes each task's ground truth, `<task id>.json`. Every run of a set gets
   * the step cap core's `stepCapOf` gives its task's file; a task with no file, or one Scout did
   * not reach, runs on `runActor`'s default. The Analyst reads the same file for a report's Scout
   * line, and a missing one is a report with no ground truth.
   */
  groundTruthDir: string;
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

/** What a run set runs on beyond its task, personas and seeds, the same for every run of it. */
export interface RunSetOptions {
  /** The Actor backend of every run of the set: the runner's default when absent. */
  backend?: ActorBackendName;
  /**
   * The sweep the set belongs to, which every run keeps on `runStarted` and its record. The
   * caller has already set the swept value on the profiles (s4-05).
   */
  sweep?: RunSweep;
}

export interface Runner {
  /**
   * Mints one id per seed × persona, in seed-major order, and queues the runs, all on `options` and
   * on one step cap, read from the task's ground truth as the set starts. Returns at once, before
   * the read: each run waits for it in its slot. Throws `jev_off_target_app`, minting nothing, for
   * Jev off the target app (`refuseJevOffTargetApp`).
   */
  start(
    task: Task,
    profiles: readonly Profile[],
    seeds: readonly Seed[],
    options?: RunSetOptions,
  ): StartedRun[];
  /** The run with this id, started by this runner, or `undefined`. */
  live(id: string): LiveRun | undefined;
}

/**
 * Runs at once per `Runner`: five contexts on one Chromium (`docs/PLAN.md`, "Architecture"), and
 * the ring opens at most five streams.
 */
export const MAX_CONCURRENT_RUNS = 5;

/**
 * Whether `task` starts on the target app at `targetAppOrigin`, port included
 * (`docs/adr/0003-any-target.md`, D2). `URL.origin` keeps the port and drops a scheme's default
 * one, so `localhost:8080` is never the app on 5174.
 */
export function onTargetApp(task: Pick<Task, "startUrl">, targetAppOrigin: string): boolean {
  return new URL(task.startUrl).origin === new URL(targetAppOrigin).origin;
}

/**
 * Throws `WayfordError("jev_off_target_app")` for Jev on a task off the target app: Jev's gate
 * covered the target app only, so off it every run is on the LLM (`docs/adr/0003-any-target.md`,
 * D9). Anything else passes.
 */
export function refuseJevOffTargetApp(
  task: Task,
  backend: ActorBackendName,
  targetAppOrigin: string,
): void {
  if (backend !== "jev" || onTargetApp(task, targetAppOrigin)) return;
  throw new WayfordError(
    "jev_off_target_app",
    `task ${task.id} starts on ${new URL(task.startUrl).origin}, off the target app, and Jev's ` +
      "gate covered the target app only, so a run off it is on the LLM " +
      "(docs/adr/0003-any-target.md, D9)",
  );
}

/**
 * A runner over one database and one `run`. Its slots and live runs are its own, so two runners
 * share nothing; `createApp` builds one, so an app runs at most five runs at once. Live runs are
 * kept for the runner's life.
 */
export function createRunner(options: RunnerOptions): Runner {
  const { db, run, backends, defaultBackend, params, jargon, runsDir, groundTruthDir, logger } =
    options;
  // Parsed now, so a bad origin fails when the runner is built.
  const targetApp = new URL(options.targetAppOrigin).origin;
  const lives = new Map<string, LiveRun>();
  const slots = slotQueue(MAX_CONCURRENT_RUNS);
  // The sets' step-cap reads, one after another in start order, so runs call `run` in the order
  // they took their slots however long each read takes. A read that rejects fails its own set
  // only, so the chain goes on past it.
  let reads: Promise<unknown> = Promise.resolve();
  // Each sweep's cap, read as its first value starts, so every value runs on one cap and the
  // boundary moves with the swept axis alone, even when Scout rewrites the file mid-sweep. Kept for
  // the runner's life, as live runs are.
  const sweepCaps = new Map<string, Promise<number | undefined>>();

  /**
   * One run, from its slot to its stored record and the end of its stream. Never rejects: what
   * cannot go anywhere else goes to the log.
   */
  async function job(
    runId: RunId,
    inputs: {
      task: Task;
      profile: Profile;
      seed: Seed;
      backend: ActorBackendFactory;
      sweep?: RunSweep;
      params?: TargetAppParams;
      jargon?: readonly string[];
    },
    stepCap: Promise<number | undefined>,
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
        // The set's one read, which rejects only on an error no file explains, failing the run
        // unstarted. Without a cap the key is left out, not set to undefined, and `runActor`'s
        // default stands.
        const maxSteps = await stepCap;
        const capped = maxSteps === undefined ? {} : { maxSteps };
        await run({ ...inputs, ...capped, runsDir, logger, runId, onEvent });
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
    start(task, profiles, seeds, { backend: name = defaultBackend, sweep } = {}) {
      // Before any id is minted, so a refused set starts nothing and stores nothing.
      refuseJevOffTargetApp(task, name, targetApp);
      // Picked once for the whole set, so its runs never mix backends.
      const backend = backends[name];
      // The key is left out of a set that is no sweep's, not set to undefined.
      const inSweep = sweep === undefined ? {} : { sweep };
      // Decided once: a set has one task, so all its runs are on one site. Off the target app both
      // keys are left out, which `runActor` reads as another site.
      const onApp = onTargetApp(task, targetApp);
      const site = onApp ? { params, jargon } : {};
      // Said once per set, so a task typed as `127.0.0.1` for the app's `localhost` does not
      // change how its runs perceive without a word.
      if (!onApp) {
        const origin = new URL(task.startUrl).origin;
        logger.info({ taskId: task.id, origin, targetApp }, "the set runs off the target app");
      }
      // Read once for the whole set, or the whole sweep, as soon as the sets started before it have
      // theirs, so its runs share one cap even when Scout rewrites the file mid-set.
      const swept = sweep === undefined ? undefined : sweepCaps.get(sweep.sweepId);
      const stepCap = reads.then(() => swept ?? stepCapFor(groundTruthDir, task, logger));
      reads = stepCap.catch(() => undefined);
      if (sweep !== undefined && swept === undefined) sweepCaps.set(sweep.sweepId, stepCap);
      const started: StartedRun[] = [];
      // Seed-major: a set cut short still has whole seeds, comparable across personas (A20).
      for (const seed of seeds) {
        for (const profile of profiles) {
          const id = newId("run");
          const live = liveRun();
          // Stored as a `LiveRun`, so a reader gets no way to publish.
          lives.set(id, live);
          // The slot is asked for now, in call order, so the queue is FIFO across `start` calls.
          const inputs = { task, profile, seed, backend, ...inSweep, ...site };
          void job(id, inputs, stepCap, slots.take(), live);
          started.push({ id, profileId: profile.id, seed });
        }
      }
      return started;
    },
    live: (id) => lives.get(id),
  };
}

/**
 * The step cap of every run of a set on `task`: core's `stepCapOf` over the task's ground truth in
 * `dir`, so `undefined`, and `runActor`'s default, with no file or a goal Scout did not reach. The
 * sweep CLI prices a sweep by it too. A file that is no ground truth (`invalid_ground_truth`) is
 * one warning, and no cap; any other error, such as a file it may not read, rejects.
 *
 * A task with no file of its own takes the ground truth of the core fixture task with the same
 * start URL and success condition, when there is one. Scout writes files under the fixture ids,
 * and every Race check stores its goal under a new id (`extractor.ts`), so without this a Race
 * would never run on Scout's cap. The same start and the same condition are the same route to
 * find, whatever words the goal is in.
 */
export async function stepCapFor(
  dir: string,
  task: Task,
  logger: Logger,
): Promise<number | undefined> {
  const taskId = task.id;
  try {
    const own = await readGroundTruth(dir, taskId);
    if (own !== undefined) return stepCapOf(own);
    const twin = taskFixtures.find(
      (fixture) =>
        fixture.id !== taskId &&
        fixture.startUrl === task.startUrl &&
        isDeepStrictEqual(fixture.success, task.success),
    );
    return twin === undefined ? undefined : stepCapOf(await readGroundTruth(dir, twin.id));
  } catch (error) {
    // One of the two deliberate exceptions to "never swallow an error into a log line"
    // (`docs/CONVENTIONS.md`, "Errors"): `start` has returned by now, and the cap is an engine
    // guard, so a file Scout left broken, or is still writing, must not cost the set its runs. They
    // run on the cap a task with no ground truth runs on, and the report still refuses the file
    // (`readGroundTruth`).
    if (!(error instanceof WayfordError && error.code === "invalid_ground_truth")) throw error;
    logger.warn(
      { taskId, err: error },
      "the task's ground truth could not be read, so the set runs on the default step cap",
    );
    return undefined;
  }
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
    // One of the two deliberate exceptions to "never swallow an error into a log line"
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
 * and the log keeps the whole error. A failed Scout job's error is written the same way.
 */
export function failureText(error: unknown): string {
  return error instanceof WayfordError
    ? `${error.code}: ${error.message}`
    : String(error) || "no message";
}
