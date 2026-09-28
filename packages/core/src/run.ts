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
import { WayfordError } from "./error.js";
import { FullObservation, renderObservationForModel, toActorObservation } from "./observation.js";
import {
  HttpUrl,
  Probability,
  ProfileId,
  RuleId,
  RunId,
  Seed,
  StepIndex,
  TaskId,
} from "./primitives.js";

// ---------------------------------------------------------------------------
// Roles, cost, outcome
// ---------------------------------------------------------------------------

/** The four LLM roles (`AGENTS.md`, "Separated LLM roles"). */
export const LLM_ROLES = ["extractor", "scout", "actor", "analyst"] as const;

export const LlmRole = z.enum(LLM_ROLES);
export type LlmRole = z.infer<typeof LlmRole>;

/**
 * Which model played the Actor in this run: the LLM's model id, or Jev's on a
 * Jev run (`docs/adr/0001-jev-actor-backend.md`). Keyed by role, like the model
 * config (`docs/PLAN.md`, "AI access"). The Actor is the only role that runs
 * inside a run: the Extractor runs once per task (`POST /tasks`), Scout once
 * per task by hand, and the Analyst once over a whole run set. Their model ids
 * belong on those records; a run that had to carry them would invent them.
 */
export const ModelIds = z
  .object({
    actor: z.string().min(1),
  })
  .strict();
export type ModelIds = z.infer<typeof ModelIds>;

/**
 * Token counts and dollars, for a run or for one step. Whole tokens; USD is a
 * real number. A run's total can exceed the sum of its steps: a step's cost
 * travels on its `actionPlanned`, so the calls of a step the run stopped in
 * before any action was planned are billed in the run's total only.
 */
export const Cost = z
  .object({
    tokensIn: z.number().int().nonnegative(),
    tokensOut: z.number().int().nonnegative(),
    usd: z.number().nonnegative(),
  })
  .strict();
export type Cost = z.infer<typeof Cost>;

/**
 * The sampling settings one LLM call was sent. The adapter returns them for
 * every role; a run keeps the Actor's as `actorSampling`. Sent, not applied: a
 * provider may ignore either value, so they are a record, not a way to make a
 * live model answer the same twice (`docs/PLAN.md` A20, F5 AC1).
 */
export const Sampling = z
  .object({
    /** The OpenAI-compatible range. */
    temperature: z.number().min(0).max(2),
    /** Present only when the caller passed one. Not a `Seed`: it never feeds
     *  `rng`. At most 2^31 - 1, because some providers type `seed` as a signed
     *  32-bit integer and would refuse a larger one. */
    providerSeed: z
      .number()
      .int()
      .min(0)
      .max(2 ** 31 - 1)
      .optional(),
  })
  .strict();
export type Sampling = z.infer<typeof Sampling>;

/**
 * How a run ended. `gave_up` is the Actor's own decision (a `giveUp` action);
 * `budget_exceeded` is the loop cutting it off (`docs/PLAN.md` F5 AC5);
 * `error` is a crash. They are kept apart (`m0-05`, "Constraints") because
 * "the person gave up" and "the tool fell over" are different findings.
 */
export const RUN_OUTCOMES = ["success", "gave_up", "budget_exceeded", "error"] as const;

export const RunOutcome = z.enum(RUN_OUTCOMES);
export type RunOutcome = z.infer<typeof RunOutcome>;

/** The three ways a run finishes without crashing; `error` belongs to `runFailed`. */
export const FINISHED_OUTCOMES = ["success", "gave_up", "budget_exceeded"] as const;

export const FinishedOutcome = z.enum(FINISHED_OUTCOMES);
export type FinishedOutcome = z.infer<typeof FinishedOutcome>;

// ---------------------------------------------------------------------------
// Behaviour dice
// ---------------------------------------------------------------------------

/**
 * The behaviour rules that roll dice (`docs/RULES.md`, stage 7). B3 is a
 * wall-clock budget, not a dice, so it never appears in a step's dice log.
 */
export const DICE_RULES = ["B1", "B2", "B4"] as const;
export const DiceRule = RuleId.extract(DICE_RULES);
export type DiceRule = z.infer<typeof DiceRule>;

/**
 * The firing rule: a roll fires when it is strictly below p. `rolled` is drawn
 * in [0, 1), so p 0 never fires and p 1 always does.
 */
export function diceFires(p: number, rolled: number): boolean {
  return rolled < p;
}

/**
 * One roll, as logged. `p` is the probability the rule resolved for this
 * action (the profile knob for B1 and B2, the effective-width model for B4),
 * `rolled` the value drawn, and `fired` must equal `diceFires(p, rolled)`: a
 * stored flag that disagrees with its own numbers is rejected.
 */
export const DiceRoll = z
  .object({ rule: DiceRule, p: Probability, rolled: Probability.lt(1), fired: z.boolean() })
  .strict()
  .superRefine((roll, ctx) => {
    if (roll.fired !== diceFires(roll.p, roll.rolled)) {
      ctx.addIssue({ code: "custom", path: ["fired"], message: "fired must equal rolled < p" });
    }
  });
export type DiceRoll = z.infer<typeof DiceRoll>;

/** The three audit fields, present together on a step and on `actionPlanned`. */
type DiceAudit = { proposedAction: Action; performedAction: Action; dice: DiceRoll[] };

/**
 * Structural checks only: one roll per rule, B1 and B4 roll on a `click` alone,
 * a fired B1 performs a `doubleClick`, a fired B2 performs a `scroll`, and no
 * rewrite of the proposed action without a fired roll. Whether a rewrite is the
 * right one (which neighbour B4 hit) is s2-03's to test.
 */
function checkDice(audit: DiceAudit, ctx: z.RefinementCtx): void {
  const rules = audit.dice.map((d) => d.rule);
  if (new Set(rules).size !== rules.length) {
    ctx.addIssue({
      code: "custom",
      path: ["dice"],
      message: "a rule rolls at most once per action",
    });
  }
  for (const [i, d] of audit.dice.entries()) {
    if ((d.rule === "B1" || d.rule === "B4") && audit.proposedAction.type !== "click") {
      ctx.addIssue({
        code: "custom",
        path: ["dice", i],
        message: `${d.rule} rolls on a click only`,
      });
    }
    const performs = d.rule === "B1" ? "doubleClick" : d.rule === "B2" ? "scroll" : undefined;
    if (d.fired && performs && audit.performedAction.type !== performs) {
      ctx.addIssue({
        code: "custom",
        path: ["performedAction"],
        message: `a fired ${d.rule} performs a ${performs}`,
      });
    }
  }
  // Stringify is a sound equality here: every `Action` member is strict and
  // flat, and parsed objects keep the schema's key order.
  const same = JSON.stringify(audit.proposedAction) === JSON.stringify(audit.performedAction);
  if (!same && !audit.dice.some((d) => d.fired)) {
    ctx.addIssue({
      code: "custom",
      path: ["performedAction"],
      message: "without a fired roll the performed action is the proposed one",
    });
  }
}

// ---------------------------------------------------------------------------
// Stored per-step record
// ---------------------------------------------------------------------------

/**
 * One step, as stored. `fullObservation` is the evidence, hidden elements and
 * all; `actorObservationText` is exactly what the model was shown, so a
 * reviewer can read the same lines the Actor read without re-deriving them.
 * `urlBefore` is the page the step observed; `urlAfter` is where the action
 * landed. `proposedAction` is the model's output, `performedAction` what ran
 * after the behaviour dice, and `dice` every roll in the order rolled (`[]`
 * when no rule applied).
 *
 * A step is complete unless the run stopped partway through it: a crash
 * (`runFailed`) or the budget running out (`budget_exceeded`) after the
 * observation but before the action landed. That step, and only the last one,
 * is stored as `IncompleteRunStep`: `incomplete: true`, with the three audit
 * fields present together and only if the action was planned, `urlAfter`
 * only if it also landed. `RunResult` enforces the "last step, those two
 * endings" rule. A complete step has no `incomplete` key, so narrow with
 * `"incomplete" in step`, not `step.incomplete`.
 */
const stepBase = {
  stepIndex: StepIndex,
  fullObservation: FullObservation,
  actorObservationText: z.string(),
  narration: z.string(),
  /** When the step's observation was ready: its `stepObserved` timestamp. */
  startedAt: z.iso.datetime(),
  /** When the action landed: its `actionPerformed` timestamp. On an incomplete
   *  step, the timestamp of the `runFailed` or `runFinished` that stopped the
   *  run, so the last step of a cut-short run keeps its length. */
  endedAt: z.iso.datetime(),
  screenshotPath: z.string().min(1).optional(),
  /** `fullObservation.url`, so an `HttpUrl`. `urlAfter` is any URL: see `actionPerformed`. */
  urlBefore: HttpUrl,
};

/** A step whose action landed: the audit fields and `urlAfter` all present. See `RunStep`. */
export const CompleteRunStep = z
  .object({
    ...stepBase,
    proposedAction: Action,
    performedAction: Action,
    dice: z.array(DiceRoll),
    cost: Cost,
    urlAfter: z.url(),
  })
  .strict()
  .superRefine(checkDice);
export type CompleteRunStep = z.infer<typeof CompleteRunStep>;

/** The last step of a run that crashed or ran out of budget mid-step. See `RunStep`. */
export const IncompleteRunStep = z
  .object({
    ...stepBase,
    proposedAction: Action.optional(),
    performedAction: Action.optional(),
    dice: z.array(DiceRoll).optional(),
    urlAfter: z.url().optional(),
    incomplete: z.literal(true),
    /** Present exactly when the audit fields are: the reducer sets all from
     *  `actionPlanned`. The schema does not check the pairing. */
    cost: Cost.optional(),
  })
  .strict()
  .superRefine((step, ctx) => {
    const { proposedAction, performedAction, dice } = step;
    if (proposedAction === undefined && performedAction === undefined && dice === undefined) {
      return;
    }
    if (proposedAction === undefined || performedAction === undefined || dice === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["proposedAction"],
        message: "proposedAction, performedAction and dice are present together or not at all",
      });
      return;
    }
    checkDice({ proposedAction, performedAction, dice }, ctx);
  });
export type IncompleteRunStep = z.infer<typeof IncompleteRunStep>;

/**
 * One stored step: `CompleteRunStep`, or `IncompleteRunStep` for the last
 * step of a crashed or timed-out run (details above `stepBase`). Narrow with
 * `"incomplete" in step`, not `step.incomplete`.
 */
export const RunStep = z.union([CompleteRunStep, IncompleteRunStep]);
export type RunStep = z.infer<typeof RunStep>;

// ---------------------------------------------------------------------------
// Stored result
// ---------------------------------------------------------------------------

/**
 * The record at rest. `seed`, `startUrl` and the ids fix one run's inputs, and
 * `id` makes it addressable: the run has no other number (the `run #` of
 * `docs/PLAN.md` F7 AC4 is `id`). A live model can still answer differently
 * when the seed runs again (`docs/PLAN.md` F5 AC1). `videoPath` and `tracePath`
 * are the recording (`F12`); `cost`, `modelIds` and `actorSampling` are the
 * provenance the report needs.
 *
 * At most the last step is incomplete, and only when the outcome is `error` or
 * `budget_exceeded`. That rule is a refine, so `.omit`, `.pick` and `.partial`
 * throw on this schema (`.extend` with new keys still works; overwriting a
 * key needs `.safeExtend`); derive a summary schema some
 * other way.
 */
export const RunResult = z
  .object({
    id: RunId,
    taskId: TaskId,
    profileId: ProfileId,
    /** The run seed, not the profile's: it drives every perception decision and
     *  every dice roll of this run (`docs/PLAN.md` A20). */
    seed: Seed,
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
    /** The Actor's temperature and the provider seed every Actor call was sent
     *  (`docs/PLAN.md` A20), from `runStarted`. Absent on a Jev run, which
     *  sends neither. */
    actorSampling: Sampling.optional(),
  })
  .strict()
  .superRefine((run, ctx) => {
    const last = run.steps.length - 1;
    run.steps.forEach((step, i) => {
      if (!("incomplete" in step)) return;
      if (step.urlAfter !== undefined && step.performedAction === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["steps", i],
          message: `step ${step.stepIndex} performed an action it never planned`,
        });
      }
      if (i !== last) {
        ctx.addIssue({
          code: "custom",
          path: ["steps", i],
          message: `step ${step.stepIndex} is incomplete but is not the last step`,
        });
      } else if (run.outcome !== "error" && run.outcome !== "budget_exceeded") {
        ctx.addIssue({
          code: "custom",
          path: ["steps", i],
          message: `step ${step.stepIndex} is incomplete but the run ended ${run.outcome}; only error or budget_exceeded may leave the last step incomplete`,
        });
      }
    });
  });
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
  stepIndex: StepIndex,
  timestamp: z.iso.datetime(),
};

export const RunEvent = z.discriminatedUnion("type", [
  /** The run opens. Carries everything the result is keyed by, and the inputs
   *  fixed before the first step (`seed`, `startUrl`, `actorSampling`). */
  z
    .object({
      ...eventBase,
      type: z.literal("runStarted"),
      taskId: TaskId,
      profileId: ProfileId,
      seed: Seed,
      startUrl: HttpUrl,
      modelIds: ModelIds,
      actorSampling: Sampling.optional(),
    })
    .strict(),
  /** The filter has produced a step's observation. Full evidence; the
   *  Actor-facing view is the projection stored on the step. */
  z
    .object({ ...eventBase, type: z.literal("stepObserved"), observation: FullObservation })
    .strict(),
  /** The Actor proposed an action; the behaviour dice may have rewritten it.
   *  Both are carried, with every roll. */
  z
    .object({
      ...eventBase,
      type: z.literal("actionPlanned"),
      proposedAction: Action,
      performedAction: Action,
      dice: z.array(DiceRoll),
      /** Every model call made to choose this action, a repair or a retry
       *  included. Here, not on `actionPerformed`, so a run that stops before
       *  the action lands still keeps the step's bill. */
      cost: Cost,
    })
    .strict()
    .superRefine(checkDice),
  /** The action ran. Carries where it landed and the post-action screenshot.
   *  Every action emits it, `giveUp` included: a give-up is a step whose
   *  performed action is `giveUp`, and `urlAfter` is the page the person gave
   *  up on. A missing `actionPerformed` means the run stopped mid-step, never
   *  that the action was `giveUp`. */
  z
    .object({
      ...eventBase,
      type: z.literal("actionPerformed"),
      /** `page.url()` after the action, so any URL, not an `HttpUrl`: a `back`
       *  from the first page lands on `about:blank`, a link to a dead host on
       *  the browser's error page (`chrome-error://chromewebdata/` in Chromium).
       *  An `HttpUrl` would reject this event and store an action that landed
       *  as one that never did. */
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
  proposedAction?: Action;
  performedAction?: Action;
  dice?: DiceRoll[];
  narration: string;
  startedAt?: string;
  endedAt?: string;
  cost?: Cost;
  screenshotPath?: string;
  urlBefore?: string;
  urlAfter?: string;
};

/**
 * Fold a run's events into its `RunResult`. Pure: no clock, no disk, no RNG.
 *
 * The events are the whole story of one run, so the same stream always folds
 * to the same record. Each step's Actor-facing text is recomputed from its
 * evidence here, so it can never drift from what the filter would have shown.
 *
 * The first event is `runStarted` and every other carries its `runId`; the
 * last is a `runFinished` or `runFailed`, and nothing follows it. A step has
 * at most one `stepObserved`, holding that step's own observation, one
 * `actionPlanned` and one `actionPerformed`; `narration` may repeat, and
 * appends. A stream that breaks one of these rules throws instead of folding:
 * several runs stream at once (`docs/PLAN.md` F6), and a misrouted event must
 * fail here, not land quietly in another run's record.
 *
 * A step missing its action or `urlAfter` is stored as incomplete; `RunResult`
 * then rejects it unless it is the last step of a run that failed or ran out
 * of budget.
 *
 * A rejected stream throws a `WayfordError` with code `invalid_run_events`,
 * the original error on `cause`. Any other error is a bug and passes through
 * unchanged, never relabelled as the caller's bad input.
 */
export function runResultFromEvents(events: readonly RunEvent[]): RunResult {
  try {
    return foldRunEvents(events);
  } catch (cause) {
    if (cause instanceof z.ZodError) {
      throw new WayfordError("invalid_run_events", z.prettifyError(cause), { cause });
    }
    if (cause instanceof Error && Object.getPrototypeOf(cause) === Error.prototype) {
      throw new WayfordError("invalid_run_events", cause.message, { cause });
    }
    throw cause;
  }
}

// The fold throws a plain `Error` for every rule a stream breaks, and
// `RunResult.parse` a `ZodError`: that is how the wrapper above tells a
// rejection from a bug, so a check added here throws a plain `Error` too.
function foldRunEvents(events: readonly RunEvent[]): RunResult {
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
  // `stepObserved`, `actionPlanned` and `actionPerformed` come at most once per
  // step, and an exact copy counts as a second. `seen` holds each one met so
  // far as `type@stepIndex`. Narration may repeat: a copied narration cannot be
  // told from a second one, so it is appended like any other.
  const oncePerStep = new Set<RunEventType>(["stepObserved", "actionPlanned", "actionPerformed"]);
  const seen = new Set<string>();

  for (const event of events.slice(1)) {
    if (event.runId !== start.runId) {
      throw new Error(
        `${event.type} at step ${event.stepIndex} belongs to ${event.runId}, not ${start.runId}`,
      );
    }
    if (terminal !== undefined) {
      throw new Error(`${event.type} at step ${event.stepIndex} comes after ${terminal.type}`);
    }
    if (oncePerStep.has(event.type)) {
      const key = `${event.type}@${event.stepIndex}`;
      if (seen.has(key)) throw new Error(`step ${event.stepIndex} has a second ${event.type}`);
      seen.add(key);
    }
    switch (event.type) {
      case "runStarted":
        throw new Error("a run has exactly one runStarted, at the start");
      case "stepObserved": {
        if (event.observation.stepIndex !== event.stepIndex) {
          throw new Error(
            `step ${event.stepIndex} holds the observation of step ${event.observation.stepIndex}`,
          );
        }
        const draft = draftFor(event.stepIndex);
        draft.startedAt = event.timestamp;
        draft.fullObservation = event.observation;
        draft.urlBefore = event.observation.url;
        break;
      }
      case "actionPlanned": {
        const draft = draftFor(event.stepIndex);
        draft.proposedAction = event.proposedAction;
        draft.performedAction = event.performedAction;
        draft.dice = event.dice;
        draft.cost = event.cost;
        break;
      }
      case "actionPerformed": {
        const draft = draftFor(event.stepIndex);
        draft.urlAfter = event.urlAfter;
        if (event.screenshotPath !== undefined) draft.screenshotPath = event.screenshotPath;
        draft.endedAt = event.timestamp;
        break;
      }
      case "narration": {
        const draft = draftFor(event.stepIndex);
        draft.narration = draft.narration === "" ? event.text : `${draft.narration}\n${event.text}`;
        break;
      }
      case "runFinished":
      case "runFailed": {
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
        draft.urlBefore === undefined ||
        draft.startedAt === undefined
      ) {
        throw new Error(`step ${draft.stepIndex} is missing an observation`);
      }
      const base = {
        stepIndex: draft.stepIndex,
        fullObservation: draft.fullObservation,
        actorObservationText: renderObservationForModel(toActorObservation(draft.fullObservation)),
        narration: draft.narration,
        startedAt: draft.startedAt,
        // A step with no actionPerformed was stopped by the run's end, so it ends there.
        endedAt: draft.endedAt ?? terminal.timestamp,
        urlBefore: draft.urlBefore,
      };
      // `actionPlanned` sets the three audit fields together, so one stands for all.
      const { proposedAction, performedAction, dice } = draft;
      const planned =
        proposedAction !== undefined && performedAction !== undefined && dice !== undefined
          ? { proposedAction, performedAction, dice }
          : undefined;
      if (draft.urlAfter !== undefined && planned === undefined) {
        throw new Error(`step ${draft.stepIndex} performed an action it never planned`);
      }
      let step: RunStep;
      if (planned !== undefined && draft.cost !== undefined && draft.urlAfter !== undefined) {
        step = { ...base, ...planned, cost: draft.cost, urlAfter: draft.urlAfter };
      } else {
        // The run stopped mid-step. RunResult.parse below decides whether that is allowed.
        const partial: IncompleteRunStep = { ...base, incomplete: true };
        if (planned !== undefined) Object.assign(partial, planned);
        if (draft.urlAfter !== undefined) partial.urlAfter = draft.urlAfter;
        if (draft.cost !== undefined) partial.cost = draft.cost;
        step = partial;
      }
      if (draft.screenshotPath !== undefined) step.screenshotPath = draft.screenshotPath;
      return step;
    });

  const result: RunResult = {
    id: start.runId,
    taskId: start.taskId,
    profileId: start.profileId,
    seed: start.seed,
    startUrl: start.startUrl,
    steps,
    outcome: terminal.type === "runFailed" ? "error" : terminal.outcome,
    durationMs: terminal.durationMs,
    cost: terminal.cost,
    modelIds: start.modelIds,
  };
  if (terminal.videoPath !== undefined) result.videoPath = terminal.videoPath;
  if (terminal.tracePath !== undefined) result.tracePath = terminal.tracePath;
  if (start.actorSampling !== undefined) result.actorSampling = start.actorSampling;

  // Parse before returning: the fold above builds the shape, this proves it.
  return RunResult.parse(result);
}
