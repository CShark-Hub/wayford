/**
 * The Actor loop: one persona walks one task on the target app with one run seed, and every step
 * of it is recorded (`tasks/s2-03-actor-loop.md`). It is our own loop, because the persona is a
 * filter between the page and the model, and only a loop of ours can put it there (`AGENTS.md`):
 * each step measures the page, perceives it through the persona's thresholds, and shows the model
 * the Actor-facing projection of that and nothing else from the page.
 *
 * The model sits behind the Actor backend (`actor-backend.ts`). The ref check and the one retry
 * are the loop's, so every backend obeys them, and success is the browser's to decide
 * (`success.ts`), never the model's. Every event is checked against core's `RunEvent` before it is
 * kept, and the run's `RunResult` is the fold of those events (`runResultFromEvents`), the record
 * s4-03 stores and the dashboard replays.
 *
 * Between the answer and the plan, stage 7's dice may rewrite the action proposed (`behaviour.ts`),
 * each roll the next draw of one behaviour stream per run, `rng(run seed)`, so a stored run replays
 * its rolls. The history the Actor reads holds only as many steps as the persona remembers (M1,
 * `history.ts`), every model call of a run is sent one provider seed (`providerSeedFor`), and the
 * persona's wall-clock budget (B3) ends a run `budget_exceeded`, read from a clock a test can move.
 *
 * The loop derives all three per-run streams from the seed, here and nowhere else: the behaviour
 * stream, the provider seed, and the decision stream (`decisionDrawFor`), from which a backend that
 * draws its action (Jev, s2-06) takes its rolled values. A backend never sees the run seed, and the
 * record keeps how such a backend chose beside the dice, on `actionPlanned`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import {
  type Cost,
  checkActionRef,
  type FinishedOutcome,
  type FullObservation,
  HttpUrl,
  newId,
  type Observation,
  type Profile,
  RunEvent,
  type RunId,
  type RunResult,
  rng,
  runResultFromEvents,
  Seed,
  SuccessCondition,
  type Task,
  toActorObservation,
  WayfordError,
} from "@wayford/core";
import { collect, perceive } from "@wayford/filter";
import type { Logger } from "pino";
import type { Browser } from "playwright";
import { z } from "zod";
import { type Arrival, performAction } from "./act.js";
import {
  type ActorAnswer,
  type ActorBackend,
  type ActorBackendFactory,
  actorTurn,
  decisionDrawFor,
  providerSeedFor,
} from "./actor-backend.js";
import { behave } from "./behaviour.js";
import { type HistoryStep, oneLine } from "./history.js";
import { LlmError } from "./llm.js";
import { openRunContext, type RunContext, type RunRecording } from "./run-context.js";
import { retryOnNavigation, settle } from "./settle.js";
import { startUrlFor, type TargetAppParams } from "./start-url.js";
import { checkSuccessCondition, type SuccessWatch, watchSuccess } from "./success.js";

/**
 * The step cap when the caller sets none: an engine guard, like core's `MAX_WAIT_MS`, about ten
 * times either goal's route on the target app. It is no persona threshold, and the record has no
 * field for it, so it is not read from the environment either.
 */
export const DEFAULT_MAX_STEPS = 20;

export interface RunActorOptions {
  /** The caller's: `runActor` never launches or closes it, so many runs can share one. */
  browser: Browser;
  profile: Profile;
  task: Task;
  /**
   * The run seed, which drives every perception decision, every behaviour roll, the provider
   * seed (`docs/PLAN.md` A20) and the decision stream (ADR 0001 §3).
   */
  seed: Seed;
  params: TargetAppParams;
  /**
   * The target app's jargon list, `@wayford/core/fixtures` `targetAppJargon`, handed to `perceive`
   * each step. Runs only ever drive the target app (`params`), so there is one list. Required, so
   * typecheck finds every caller: a caller that left it out would turn K2 off without a sound. K2
   * fires only for a profile that sets `domainVocabulary` (`docs/RULES.md` stage 4).
   */
  jargon: readonly string[];
  /** The run's files go under `<runsDir>/<runId>/`. */
  runsDir: string;
  /**
   * Called once per run, with the run's logger, so the backend's lines carry the run id, the
   * run's provider seed and the run's decision stream.
   */
  backend: ActorBackendFactory;
  /** The run logs on `logger.child({ runId })`. */
  logger: Logger;
  /** Minted with `newId("run")` when absent. s4-03 passes the one it already returned. */
  runId?: RunId;
  /** Called with each event as it is emitted. */
  onEvent?: (event: RunEvent) => void;
  /** `DEFAULT_MAX_STEPS` when absent. */
  maxSteps?: number;
  /**
   * The clock, in milliseconds since the epoch, `Date.now` when absent. The run reads every time
   * through it: each event's timestamp, `durationMs`, and the persona's budget (B3), the one
   * decision a clock makes, so a test moves it and never waits.
   */
  now?: () => number;
}

/**
 * Runs one persona on one task with one run seed, and returns the run's `RunResult`.
 *
 * Each step observes the page through the persona's filter, asks the backend for one action, rolls
 * the behaviour dice on it, carries out what they leave and records it. The run ends `success`
 * when the task's condition holds after an action, `gave_up` on a performed `giveUp`, and
 * `budget_exceeded` once `maxSteps` steps have run or the persona's `budgetSeconds` have passed
 * (B3). The clock is read once a step's action is planned, and a step past the budget there stays
 * planned and never performed; the cap and the clock are read again at the end of every step,
 * wasted ones included, after the other two checks. Any failure ends it `error`, with the step in
 * progress kept as far as its events went.
 *
 * What a caller, s4-03 first, can rely on:
 * - A run that emitted `runStarted` ends with exactly one terminal event, `runFinished` or
 *   `runFailed`, and emits nothing after it.
 * - Events come in order, step by step, with `stepIndex` 0, 1, … k, and the terminal event carries
 *   the index of the last step observed (0 when none was). Every one passed `RunEvent`.
 * - `onEvent` is called synchronously with each event as it is emitted, and never awaited, so a
 *   listener with slow work queues it itself. A listener that throws before the terminal event
 *   ends the run there, `runFailed` with its error, and still gets that terminal event. The
 *   terminal event is delivered last, once `result.json` is written, or failed to be, so a
 *   listener that throws on it makes `runActor` reject with its error and leaves the record on
 *   disk.
 * - The returned result is `runResultFromEvents` of the events emitted, and the same result is
 *   written to `<runsDir>/<runId>/result.json`.
 * - `screenshotPath`, `videoPath` and `tracePath` are relative to `<runsDir>/<runId>/`, with `/`
 *   separators, so a run's folder can move as a whole.
 * - There is no module state: concurrent runs on one `Browser` share nothing but the browser.
 * - It rejects before any event only where no run can start: with `invalid_run_input` for a
 *   `maxSteps` that is not a positive integer, a seed that is not a `Seed`, an empty `runsDir`, or
 *   a `runStarted` that fails its schema (a bad run id, task id, profile id or start URL); with
 *   `startUrlFor`'s `invalid_target_app_params`; and with whatever the backend factory throws.
 *   Once `runStarted` is out, every failure is the run's own `runFailed`, and `runActor` rejects
 *   only when folding the events or writing `result.json` fails, or when the listener throws on
 *   the terminal event.
 */
export async function runActor(options: RunActorOptions): Promise<RunResult> {
  const { browser, profile, task, seed, params, runsDir } = options;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  if (!Number.isInteger(maxSteps) || maxSteps < 1) {
    throw invalidInput(`maxSteps must be a positive integer, got ${maxSteps}`);
  }
  // Here, not only in `runStarted`'s schema: the provider seed and the decision stream are drawn
  // from it before that.
  if (!Seed.safeParse(seed).success) {
    throw invalidInput(`the seed must be an integer from 0 to 4294967295, got ${seed}`);
  }
  if (runsDir.length === 0) {
    throw invalidInput("runsDir is empty, so the run has nowhere to keep its files");
  }
  const startUrl = startUrlFor(task, params);
  const runId = options.runId ?? newId("run");
  const logger = options.logger.child({ runId });
  const backend = options.backend({
    logger,
    providerSeed: providerSeedFor(seed),
    decisionDraw: decisionDrawFor(seed),
  });
  const now = options.now ?? Date.now;
  const t0 = now();
  const started = RunEvent.safeParse({
    type: "runStarted",
    runId,
    stepIndex: 0,
    timestamp: new Date(t0).toISOString(),
    taskId: task.id,
    profileId: profile.id,
    seed,
    startUrl,
    modelIds: { actor: backend.modelId },
    ...(backend.sampling === undefined ? {} : { actorSampling: backend.sampling }),
  });
  if (!started.success) {
    const message = `Invalid run input:\n${z.prettifyError(started.error)}`;
    throw new WayfordError("invalid_run_input", message, { cause: started.error });
  }
  // The behaviour stream (`behaviour.ts`), one per run.
  const draw = rng(seed);

  // The run id parsed, so it is one path segment and the directory stays inside `runsDir`.
  const runDir = resolve(runsDir, runId);
  const events: RunEvent[] = [];
  // Every event before the terminal one. A listener that throws on it ends the run there, in the
  // `catch` below, like any other failure.
  const deliver = (event: RunEvent): void => {
    events.push(event);
    options.onEvent?.(event);
  };
  // Parsed, so only an event its schema takes is kept: only a bug in the loop builds another.
  const emit = (event: Unstamped): void => {
    deliver(RunEvent.parse({ ...event, runId, timestamp: new Date(now()).toISOString() }));
  };
  const stored = (path: string) => relative(runDir, path).split(sep).join("/");
  let cost: Cost = NO_COST;
  let run: RunContext | undefined;
  let watch: SuccessWatch | undefined;
  let ending: Ending;

  try {
    deliver(started.data);
    // Before a context, a video and a trace are opened for a run no step could make succeed. A
    // task that fails its schema is `openRunContext`'s to refuse.
    if (SuccessCondition.safeParse(task.success).success) checkSuccessCondition(task.success);
    run = await openRunContext({ browser, profile, task, seed, runId, params, outputDir: runDir });
    watch = watchSuccess(run.page.context(), task.success);
    const loop: Loop = {
      run,
      watch,
      profile,
      task,
      seed,
      jargon: options.jargon,
      maxSteps,
      draw,
      now,
      t0,
      logger,
      emit,
      stored,
      async answer(turn) {
        const answer = await backend.answer(turn);
        // At once, so a step the run stops in still has its calls in the run's total.
        cost = addCost(cost, answer.cost);
        return answer;
      },
    };
    ending = { outcome: await walk(loop) };
  } catch (error) {
    // What a failed call already billed is billed all the same.
    if (error instanceof LlmError) cost = addCost(cost, error.cost);
    ending = { error };
  }
  // The persona's time ends here. Closing the run is the tool's.
  const endMs = now();
  watch?.stop();

  let recording: RunRecording | undefined;
  let recordingLostToo = false;
  if (run !== undefined) {
    try {
      recording = await run.close();
    } catch (error) {
      if ("outcome" in ending) {
        // F12 promises the recording, so a run that lost it is no clean finish. The message keeps
        // the outcome it reached.
        const message = `the run ended ${ending.outcome}, then saving its recording failed: ${messageText(error)}`;
        ending = { error: new WayfordError("run_close_failed", message, { cause: error }) };
      } else {
        // The first failure is the one the record names.
        logger.error({ err: error }, "saving the recording of the failed run failed too");
        recordingLostToo = true;
      }
    }
  }
  if ("error" in ending) logger.error({ err: ending.error }, "the run failed");

  const end = {
    runId,
    stepIndex: lastObservedStep(events),
    timestamp: new Date(endMs).toISOString(),
    durationMs: Math.round(Math.max(0, endMs - t0)),
    cost,
    ...(recording === undefined
      ? {}
      : { videoPath: stored(recording.videoPath), tracePath: stored(recording.tracePath) }),
  };
  const terminal = RunEvent.parse(
    "outcome" in ending
      ? { type: "runFinished", outcome: ending.outcome, ...end }
      : {
          type: "runFailed",
          error: failureText(ending.error, recordingLostToo ? RECORDING_LOST_TOO : ""),
          ...end,
        },
  );
  events.push(terminal);

  const result = runResultFromEvents(events);
  try {
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  } finally {
    // Last, so a listener that throws on it finds the record complete and on disk, and delivered
    // even when the write failed, so a started run always ends in one terminal event.
    options.onEvent?.(terminal);
  }
  return result;
}

// ---------------------------------------------------------------------------
// The steps
// ---------------------------------------------------------------------------

/** What the steps of one run share. */
interface Loop {
  run: RunContext;
  watch: SuccessWatch;
  profile: Profile;
  task: Task;
  seed: Seed;
  /** The target app's jargon list, for K2 in `perceive`. */
  jargon: readonly string[];
  maxSteps: number;
  /** The run's behaviour stream, `rng(seed)`. */
  draw: () => number;
  /** The run's clock, and its reading when `runStarted` was stamped, where `durationMs` starts. */
  now: () => number;
  t0: number;
  logger: Logger;
  /** Emits one event of the run, stamped with its id and the time. */
  emit(event: Unstamped): void;
  /** A file's path as the record stores it: relative to the run's directory. */
  stored(path: string): string;
  /** One answer from the run's backend. Its cost joins the run's as it arrives. */
  answer: ActorBackend["answer"];
}

/**
 * Steps from 0 until one ends the run, and how it ended. Anything thrown ends the run as a
 * failure, in `runActor`.
 */
async function walk(loop: Loop): Promise<FinishedOutcome> {
  const { run } = loop;
  const history: HistoryStep[] = [];
  for (let k = 0; ; k++) {
    const shown = await observe(loop, k);
    const answer = await ask(loop, k, shown, history);
    if (answer === undefined) {
      // Nothing to roll on, so a wasted step draws nothing from the behaviour stream.
      history.push({ observation: shown, wasted: true });
    } else {
      // 3. Plan: stage 7's dice on the action proposed, and what they leave is what is performed.
      const { action: proposed, narration } = answer.response;
      if (narration !== "") loop.emit({ type: "narration", stepIndex: k, text: narration });
      const { performed, dice } = behave(proposed, loop.profile.behaviour, loop.draw);
      // A backend that drew the action says how, and the record keeps it beside the dice.
      loop.emit({
        type: "actionPlanned",
        stepIndex: k,
        proposedAction: proposed,
        performedAction: performed,
        dice,
        cost: answer.cost,
        ...(answer.decision === undefined ? {} : { decision: answer.decision }),
      });
      // B3 before acting, so no late success is recorded: the step stays planned.
      if (overBudget(loop)) return ranOut(loop, k, "budget");
      // 4. Act.
      const arrival = await performAction(run, performed, shown);
      const met = await land(loop, k, arrival);
      // The proposed action, not the performed one: the history tells what the Actor chose.
      history.push({ observation: shown, proposed });
      // 5. The end checks, success first, so the last step the cap allows can still succeed.
      if (met) return "success";
      // The performed one, which B2 will make a scroll in place of a giveUp (s2-07).
      if (performed.type === "giveUp") return "gave_up";
    }
    // 6. The cap, wasted steps included, so the same seed and answers end a capped run the same.
    if (k + 1 >= loop.maxSteps) return ranOut(loop, k, "steps");
    // B3 again, so a run of wasted steps ends on it too and no call is billed past it.
    if (overBudget(loop)) return ranOut(loop, k, "budget");
  }
}

/** B3: whether more than the persona's `budgetSeconds` have passed since `runStarted`. */
function overBudget(loop: Loop): boolean {
  return loop.now() - loop.t0 > loop.profile.behaviour.budgetSeconds * 1000;
}

/**
 * Ends the run `budget_exceeded` at step `k`. The record tells the cap from the clock only by
 * its step count and last step against `durationMs` (`calibration.ts`'s `endOf`), so the log
 * names the limit.
 */
function ranOut(loop: Loop, k: number, limit: "steps" | "budget"): "budget_exceeded" {
  const elapsedMs = loop.now() - loop.t0;
  loop.logger.info({ step: k, elapsedMs, limit }, "the run reached its limit");
  return "budget_exceeded";
}

/**
 * 1. Observe: the page measured once it holds still, perceived through the persona's thresholds,
 * and emitted whole as evidence. Returns the Actor-facing projection, all the model is shown.
 */
async function observe(loop: Loop, k: number): Promise<Observation> {
  const { page, isMobile } = loop.run;
  // A browser error page or about:blank cannot be measured (`FullObservation.url` is an
  // `HttpUrl`), and the loop never steps back on the persona's behalf.
  const url = page.url();
  if (!HttpUrl.safeParse(url).success) {
    throw new WayfordError(
      "off_http_page",
      `step ${k} cannot observe ${url}: the filter measures only http(s) pages`,
    );
  }
  const measurement = await retryOnNavigation(page, async () => {
    // First, so the hover state measured is the one the pointer gives, on a new document too.
    await loop.run.restorePointer();
    await settle(page);
    return collect(page, { isMobile });
  });
  // `perceive` does not know the step, and the fold rejects an observation of another one.
  const full: FullObservation = {
    ...perceive(measurement, loop.profile, loop.seed, { jargon: loop.jargon }),
    stepIndex: k,
  };
  loop.emit({ type: "stepObserved", stepIndex: k, observation: full });
  return toActorObservation(full);
}

/**
 * 2. Ask: the backend's answer for step `k`, and what the step's calls cost. An answer naming a
 * ref the page lacks gets one retry, which carries the refused answer and its ref. `undefined`
 * when the retry misses too: the step is wasted, and emitted so, with both answers as parsed.
 */
async function ask(
  loop: Loop,
  k: number,
  shown: Observation,
  history: readonly HistoryStep[],
): Promise<ActorAnswer | undefined> {
  const turn = actorTurn(loop.task.goal, shown, history, loop.profile.behaviour.memorySteps);
  const first = await loop.answer(turn);
  const firstCheck = checkActionRef(first.response.action, shown);
  if (firstCheck.ok) return first;
  const second = await loop.answer({
    ...turn,
    retry: { refused: first.response, ref: firstCheck.ref },
  });
  const cost = addCost(first.cost, second.cost);
  if (checkActionRef(second.response.action, shown).ok) {
    // Core has no field for an answer refused before one was accepted, so the log keeps it.
    loop.logger.warn(
      { step: k, refused: first.response, ref: firstCheck.ref },
      "the Actor named a ref the page lacks; its retry was accepted",
    );
    // The accepted answer whole, so a decision it carries is not dropped on the way.
    return { ...second, cost };
  }
  loop.emit({
    type: "stepWasted",
    stepIndex: k,
    rejected: [first.response, second.response],
    cost,
  });
  return undefined;
}

/**
 * The rest of 4, once the action's input is in: the navigation it started waited for, the real
 * pointer put back on the last point an action pressed, the page settled, the task's success
 * checked, and where the action landed emitted with the step's screenshot. Returns whether the
 * task's condition holds.
 *
 * The pointer goes back now, so the hover state is decided by this move and not by Chromium's own
 * timer after a navigation or a scroll, and the screenshot and the next observation see the same
 * one. Success is checked on the document the screenshot shows, so a step that ends the run
 * `success` has the evidence of it. The action has landed by then, so a failure here still emits
 * `actionPerformed`, with no screenshot, before it ends the run.
 */
async function land(loop: Loop, k: number, arrival: Arrival): Promise<boolean> {
  const { run, watch } = loop;
  const { page } = run;
  let after: { urlAfter: string; met: boolean; screenshotPath: string };
  try {
    await arrival.wait();
    after = await retryOnNavigation(page, async () => {
      await run.restorePointer();
      await settle(page);
      const urlAfter = page.url();
      const met = await watch.met(page, urlAfter);
      return { urlAfter, met, screenshotPath: loop.stored(await run.screenshot(k)) };
    });
  } catch (error) {
    try {
      loop.emit({ type: "actionPerformed", stepIndex: k, urlAfter: page.url() });
    } catch (listenerError) {
      // The run ends with the listener's error, as on any event, so the step's goes to the log.
      loop.logger.error({ err: error }, "the step failed, then the listener threw on it");
      throw listenerError;
    }
    throw error;
  }
  const { urlAfter, screenshotPath } = after;
  loop.emit({ type: "actionPerformed", stepIndex: k, urlAfter, screenshotPath });
  return after.met;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** `Omit` over each member of a union, so the union stays discriminated by `type`. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** An event as a step builds it: `emit` adds the run id and the time. */
type Unstamped = DistributiveOmit<RunEvent, "runId" | "timestamp">;

/** The step the terminal event points at: the last one observed, 0 when none was. */
function lastObservedStep(events: readonly RunEvent[]): number {
  return events.findLast((event) => event.type === "stepObserved")?.stepIndex ?? 0;
}

// ---------------------------------------------------------------------------
// Endings
// ---------------------------------------------------------------------------

type Ending = { outcome: FinishedOutcome } | { error: unknown };

/** `runFailed.error` is one line of at most this many characters. The log keeps the rest. */
const ERROR_TEXT_LIMIT = 500;

const RECORDING_LOST_TOO = "; saving the recording failed too";

/**
 * `runFailed.error`: `<code>: <message>` for a `WayfordError`, `<name>: <message>` for another
 * `Error`, the thrown value as a string otherwise, and `no message` in place of an empty one,
 * since the field may not be empty. The whole message, on one line: a reason that a message puts
 * after its first line, as zod's issue list and the adapter's schema miss do, is kept. `suffix`
 * is kept whole when the line is cut.
 */
function failureText(error: unknown, suffix: string): string {
  let text: string;
  if (error instanceof Error) {
    const label = (error instanceof WayfordError && error.code) || error.name || "Error";
    text = `${label}: ${messageText(error) || "no message"}`;
  } else {
    text = messageText(error) || "no message";
  }
  const room = ERROR_TEXT_LIMIT - suffix.length;
  return `${text.length > room ? `${text.slice(0, room - 1)}…` : text}${suffix}`;
}

/** What was thrown, on one line: an error's message, any other value as a string. */
function messageText(thrown: unknown): string {
  return oneLine(thrown instanceof Error ? thrown.message : String(thrown)).trim();
}

// ---------------------------------------------------------------------------
// Small parts
// ---------------------------------------------------------------------------

function invalidInput(why: string): WayfordError {
  return new WayfordError("invalid_run_input", `Invalid run input: ${why}`);
}

const NO_COST: Cost = { tokensIn: 0, tokensOut: 0, usd: 0 };

/**
 * Local, so `llm.ts` keeps its own private: exporting that one would put it in the public barrel
 * (`docs/specs/2026-10-01-s2-03-actor-loop.md`, "Cost").
 */
function addCost(a: Cost, b: Cost): Cost {
  return {
    tokensIn: a.tokensIn + b.tokensIn,
    tokensOut: a.tokensOut + b.tokensOut,
    usd: a.usd + b.usd,
  };
}
