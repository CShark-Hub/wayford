/**
 * A run happens twice: once as a live stream and once as a stored record.
 *
 * `RunEvent` is the stream. The ring watches it to move avatars, the dashboard
 * replays it step by step, the Analyst reads it as evidence. It is a closed
 * union keyed by `type` so a consumer can exhaustively switch on it and a new
 * event kind cannot slip through untyped.
 *
 * `RunResult` is the record at rest. It is not authored by hand at run time; it
 * is what `runResultFromEvents` folds the stream into. That reducer is the
 * contract the ring and the dashboard depend on, so it lives here, in `core`,
 * and is pure: given the same events it returns the same result, with no clock,
 * no disk and no randomness of its own.
 *
 * The Actor/evidence split of `observation.ts` still holds. The Actor is fed
 * `Observation`; the stream and the record carry `FullObservation`, because
 * their readers — the operator, the dashboard, the Analyst — are allowed the
 * evidence the Actor is not. The Actor-facing text stored on each step is a
 * pure projection of that evidence (`toActorObservation` then
 * `renderObservationForModel`), never a second source of truth.
 */
import { z } from "zod";
import { Action } from "./action.js";
import { FullObservation, renderObservationForModel, toActorObservation } from "./observation.js";
import { HttpUrl, Probability, ProfileId, RunId, Seed, TaskId } from "./primitives.js";

// ---------------------------------------------------------------------------
// Roles, cost, outcome
// ---------------------------------------------------------------------------

/** The four LLM roles (`AGENTS.md`, "Separated LLM roles"). */
export const LLM_ROLES = ["extractor", "scout", "actor", "analyst"] as const;

export const LlmRole = z.enum(LLM_ROLES);
export type LlmRole = z.infer<typeof LlmRole>;

/**
 * Which model played each role in this run. Kept per role, not one id, because
 * the bill is driven by a cheap Actor run × N and a single strong Analyst pass
 * (`AGENTS.md`, "AI through one OpenAI-compatible API"): the report has to be
 * able to say which was which.
 */
export const ModelIds = z
  .object({
    extractor: z.string().min(1),
    scout: z.string().min(1),
    actor: z.string().min(1),
    analyst: z.string().min(1),
  })
  .strict();
export type ModelIds = z.infer<typeof ModelIds>;

/** Token counts and dollars for one run. Whole tokens; USD is a real number. */
export const Cost = z
  .object({
    tokensIn: z.number().int().nonnegative(),
    tokensOut: z.number().int().nonnegative(),
    usd: z.number().nonnegative(),
  })
  .strict();
export type Cost = z.infer<typeof Cost>;

/**
 * How a run ended. `gave_up` is the Actor's own decision (a `giveUp` action);
 * `budget_exceeded` is the loop cutting it off; `error` is a crash. They are
 * kept apart because "the person gave up" and "the tool fell over" are
 * different findings (`docs/PLAN.md`, F5 AC5).
 */
export const RUN_OUTCOMES = ["success", "gave_up", "budget_exceeded", "error"] as const;

export const RunOutcome = z.enum(RUN_OUTCOMES);
export type RunOutcome = z.infer<typeof RunOutcome>;

/** The three ways a run finishes without crashing; `error` belongs to `runFailed`. */
export const FINISHED_OUTCOMES = ["success", "gave_up", "budget_exceeded"] as const;

export const FinishedOutcome = z.enum(FINISHED_OUTCOMES);
export type FinishedOutcome = z.infer<typeof FinishedOutcome>;

// ---------------------------------------------------------------------------
// Stored per-step record
// ---------------------------------------------------------------------------

/**
 * One step, as stored. `fullObservation` is the evidence, hidden elements and
 * all; `actorObservationText` is exactly what the model was shown, so a
 * reviewer can read the same lines the Actor read without re-deriving them.
 * `urlBefore` is the page the step observed; `urlAfter` is where the action
 * landed. `diceRoll` is present only when a behaviour rule rolled one.
 */
export const RunStep = z
  .object({
    stepIndex: z.number().int().nonnegative(),
    fullObservation: FullObservation,
    actorObservationText: z.string(),
    action: Action,
    diceRoll: Probability.optional(),
    narration: z.string(),
    screenshotPath: z.string().min(1).optional(),
    urlBefore: z.url(),
    urlAfter: z.url(),
  })
  .strict();
export type RunStep = z.infer<typeof RunStep>;

// ---------------------------------------------------------------------------
// Stored result
// ---------------------------------------------------------------------------

/**
 * The record at rest. `seed`, `runIndex`, `startUrl` and the ids make one run
 * reproducible and addressable; `videoPath` and `tracePath` are the recording (`F12`);
 * `cost` and `modelIds` are the provenance the report needs.
 */
export const RunResult = z
  .object({
    id: RunId,
    taskId: TaskId,
    profileId: ProfileId,
    seed: Seed,
    runIndex: z.number().int().nonnegative(),
    /** Exactly the URL passed to `goto`, target parameters included. Not
     *  `page.url()`: the target app strips its parameters from the address bar
     *  (`packages/target-app/README.md`), so the first observation's URL is not
     *  it. Not `Task.startUrl` either: the harness appends the run's target
     *  parameters to it (`s2-02`). */
    startUrl: HttpUrl,
    steps: z.array(RunStep),
    outcome: RunOutcome,
    durationMs: z.number().int().nonnegative(),
    videoPath: z.string().min(1).optional(),
    tracePath: z.string().min(1).optional(),
    cost: Cost,
    modelIds: ModelIds,
  })
  .strict();
export type RunResult = z.infer<typeof RunResult>;

// ---------------------------------------------------------------------------
// Live stream
// ---------------------------------------------------------------------------

export const RUN_EVENT_TYPES = [
  "runStarted",
  "stepObserved",
  "actionPlanned",
  "actionPerformed",
  "narration",
  "runFinished",
  "runFailed",
] as const;

export const RunEventType = z.enum(RUN_EVENT_TYPES);
export type RunEventType = z.infer<typeof RunEventType>;

/**
 * Every event carries where it happened. `runId` names the run, `stepIndex`
 * the step it belongs to (run-level events point at the boundary they mark),
 * `timestamp` an ISO instant used for ordering and elapsed time only — never
 * for a decision (`docs/CONVENTIONS.md`, determinism rules).
 */
const eventBase = {
  runId: RunId,
  stepIndex: z.number().int().nonnegative(),
  timestamp: z.iso.datetime(),
};

export const RunEvent = z.discriminatedUnion("type", [
  /** The run opens. Carries everything the result is keyed by, and the inputs
   *  fixed before the first step (`seed`, `startUrl`). */
  z
    .object({
      ...eventBase,
      type: z.literal("runStarted"),
      taskId: TaskId,
      profileId: ProfileId,
      seed: Seed,
      runIndex: z.number().int().nonnegative(),
      startUrl: HttpUrl,
      modelIds: ModelIds,
    })
    .strict(),
  /** The filter has produced a step's observation. Full evidence; the
   *  Actor-facing view is the projection stored on the step. */
  z
    .object({ ...eventBase, type: z.literal("stepObserved"), observation: FullObservation })
    .strict(),
  /** The Actor chose an action, after any behaviour dice rewrote it. */
  z
    .object({
      ...eventBase,
      type: z.literal("actionPlanned"),
      action: Action,
      diceRoll: Probability.optional(),
    })
    .strict(),
  /** The action ran. Carries where it landed and the post-action screenshot. */
  z
    .object({
      ...eventBase,
      type: z.literal("actionPerformed"),
      urlAfter: z.url(),
      screenshotPath: z.string().min(1).optional(),
    })
    .strict(),
  /** Free text the model produced, labelled as narration — interpretation
   *  after the fact, never a measurement (`AGENTS.md`, "Traps"). */
  z.object({ ...eventBase, type: z.literal("narration"), text: z.string() }).strict(),
  /** The run ended without crashing. */
  z
    .object({
      ...eventBase,
      type: z.literal("runFinished"),
      outcome: FinishedOutcome,
      durationMs: z.number().int().nonnegative(),
      cost: Cost,
      videoPath: z.string().min(1).optional(),
      tracePath: z.string().min(1).optional(),
    })
    .strict(),
  /** The run crashed. Distinct from `gave_up`: the outcome is always `error`. */
  z
    .object({
      ...eventBase,
      type: z.literal("runFailed"),
      error: z.string().min(1),
      durationMs: z.number().int().nonnegative(),
      cost: Cost,
      videoPath: z.string().min(1).optional(),
      tracePath: z.string().min(1).optional(),
    })
    .strict(),
]);
export type RunEvent = z.infer<typeof RunEvent>;

// ---------------------------------------------------------------------------
// The reducer: stream -> record
// ---------------------------------------------------------------------------

type StepDraft = {
  stepIndex: number;
  fullObservation?: FullObservation;
  action?: Action;
  diceRoll?: number;
  narration: string;
  screenshotPath?: string;
  urlBefore?: string;
  urlAfter?: string;
};

/**
 * Fold a run's events into its `RunResult`. Pure: no clock, no disk, no RNG.
 *
 * The events are the whole story — the first must be `runStarted` and the last
 * a `runFinished` or `runFailed` — so the same stream always folds to the same
 * record. Each step's Actor-facing text is recomputed from its evidence here,
 * so it can never drift from what the filter would have shown.
 */
export function runResultFromEvents(events: readonly RunEvent[]): RunResult {
  const start = events[0];
  if (start?.type !== "runStarted") {
    throw new Error("a run's events must open with runStarted");
  }

  const drafts = new Map<number, StepDraft>();
  const draftFor = (stepIndex: number): StepDraft => {
    let draft = drafts.get(stepIndex);
    if (draft === undefined) {
      draft = { stepIndex, narration: "" };
      drafts.set(stepIndex, draft);
    }
    return draft;
  };

  let terminal: Extract<RunEvent, { type: "runFinished" | "runFailed" }> | undefined;

  for (const event of events.slice(1)) {
    switch (event.type) {
      case "runStarted":
        throw new Error("a run has exactly one runStarted, at the start");
      case "stepObserved": {
        const draft = draftFor(event.stepIndex);
        draft.fullObservation = event.observation;
        draft.urlBefore = event.observation.url;
        break;
      }
      case "actionPlanned": {
        const draft = draftFor(event.stepIndex);
        draft.action = event.action;
        if (event.diceRoll !== undefined) draft.diceRoll = event.diceRoll;
        break;
      }
      case "actionPerformed": {
        const draft = draftFor(event.stepIndex);
        draft.urlAfter = event.urlAfter;
        if (event.screenshotPath !== undefined) draft.screenshotPath = event.screenshotPath;
        break;
      }
      case "narration": {
        const draft = draftFor(event.stepIndex);
        draft.narration = draft.narration === "" ? event.text : `${draft.narration}\n${event.text}`;
        break;
      }
      case "runFinished":
      case "runFailed": {
        if (terminal !== undefined) throw new Error("a run ends once");
        terminal = event;
        break;
      }
    }
  }

  if (terminal === undefined) {
    throw new Error("a run's events must end with runFinished or runFailed");
  }

  const steps: RunStep[] = [...drafts.values()]
    .sort((a, b) => a.stepIndex - b.stepIndex)
    .map((draft) => {
      if (
        draft.fullObservation === undefined ||
        draft.action === undefined ||
        draft.urlBefore === undefined ||
        draft.urlAfter === undefined
      ) {
        throw new Error(`step ${draft.stepIndex} is missing an observation, action or url`);
      }
      const step: RunStep = {
        stepIndex: draft.stepIndex,
        fullObservation: draft.fullObservation,
        actorObservationText: renderObservationForModel(toActorObservation(draft.fullObservation)),
        action: draft.action,
        narration: draft.narration,
        urlBefore: draft.urlBefore,
        urlAfter: draft.urlAfter,
      };
      if (draft.diceRoll !== undefined) step.diceRoll = draft.diceRoll;
      if (draft.screenshotPath !== undefined) step.screenshotPath = draft.screenshotPath;
      return step;
    });

  const result: RunResult = {
    id: start.runId,
    taskId: start.taskId,
    profileId: start.profileId,
    seed: start.seed,
    runIndex: start.runIndex,
    startUrl: start.startUrl,
    steps,
    outcome: terminal.type === "runFailed" ? "error" : terminal.outcome,
    durationMs: terminal.durationMs,
    cost: terminal.cost,
    modelIds: start.modelIds,
  };
  if (terminal.videoPath !== undefined) result.videoPath = terminal.videoPath;
  if (terminal.tracePath !== undefined) result.tracePath = terminal.tracePath;

  // Parse before returning: the fold above builds the shape, this proves it.
  return RunResult.parse(result);
}
