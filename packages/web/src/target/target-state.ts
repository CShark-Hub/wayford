/**
 * The Target screen as data: the form that checks a goal on a site of the person's own, and the
 * goal view that starts Scout and a run set on the goal the check accepted. Pure but for the
 * selector check, which asks the browser's own parser, so every rule the screen keeps (the form's
 * first missing thing, two personas at least, no edit while a set is under way, the set's end) is a
 * test of a function, and the views only draw a state. The report is not here: it is a mutation
 * the Report screen shares (`target-calls.ts`, `reportMutation`).
 *
 * The success condition is the person's, typed: `taskRequestOf` sends it as written, trimmed, and
 * the model never writes one (`tasks/s3-15-target-screen.md`). Off the target app every run and the
 * report are on the LLM (`docs/adr/0003-any-target.md` D9), so `runsRequestOf` names it.
 */
import {
  type GroundTruth,
  HttpUrl,
  type MAX_RUN_SET_SEEDS,
  matchableUrlPattern,
  type Profile,
  type ProfileId,
  type RunId,
  type Seed,
  type StartedRun,
  type Task,
} from "@wayford/core";
import type { Extraction, RunsRequest, TaskRequest } from "../api/runs.js";
import type { ScoutAnswer } from "../api/scout.js";
import { UNMATCHABLE_SUCCESS } from "../arena/panel-state.js";
import { count } from "../components/outcome-words.js";

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

/** How a run knows it got there: the URL it reaches, or an element on its page. */
export type SuccessKind = "urlMatches" | "selectorPresent";

/** Where the form's check has got. An accepted goal leaves the form, so it has no state here. */
export type FormCheck =
  | { status: "unchecked" }
  | { status: "checking" }
  | { status: "refused"; goal: string; survived: string[]; error: string }
  | { status: "failed"; message: string };

export type TargetForm = {
  /** As typed; `formBlocker` reads it through core's `HttpUrl`. */
  startUrl: string;
  /** The goal sentence, as typed. */
  story: string;
  successKind: SuccessKind;
  /** The URL pattern or the CSS selector, as typed: one input, whichever the kind. */
  successValue: string;
  check: FormCheck;
};

export type FormAction =
  /** Each edit resets the check, so no answer stands for a form that has since changed. */
  | { type: "startUrlEdited"; startUrl: string }
  | { type: "storyEdited"; story: string }
  | { type: "successKindChosen"; successKind: SuccessKind }
  | { type: "successValueEdited"; successValue: string }
  | { type: "checkStarted" }
  /** An accepted goal goes back to unchecked: the screen navigates to its task. */
  | { type: "checkAnswered"; extraction: Extraction }
  | { type: "checkFailed"; message: string };

/** Nothing typed, a URL pattern, no check. */
export function initialForm(): TargetForm {
  return {
    startUrl: "",
    story: "",
    successKind: "urlMatches",
    successValue: "",
    check: { status: "unchecked" },
  };
}

const UNCHECKED: FormCheck = { status: "unchecked" };

/** The form after `action`. No action is refused: the fieldset is disabled while a check runs. */
export function formReducer(form: TargetForm, action: FormAction): TargetForm {
  switch (action.type) {
    case "startUrlEdited":
      return { ...form, startUrl: action.startUrl, check: UNCHECKED };
    case "storyEdited":
      return { ...form, story: action.story, check: UNCHECKED };
    case "successKindChosen":
      return { ...form, successKind: action.successKind, check: UNCHECKED };
    case "successValueEdited":
      return { ...form, successValue: action.successValue, check: UNCHECKED };
    case "checkStarted":
      return { ...form, check: { status: "checking" } };
    case "checkAnswered": {
      const { extraction } = action;
      if (extraction.ok) return { ...form, check: UNCHECKED };
      const { goal, survived, error } = extraction;
      return { ...form, check: { status: "refused", goal, survived, error } };
    }
    case "checkFailed":
      return { ...form, check: { status: "failed", message: action.message } };
  }
}

/** What to type when the success condition is empty, by its kind. */
const SUCCESS_BLOCKERS: Record<SuccessKind, string> = {
  urlMatches: "Enter the URL pattern a run reaches when it succeeds",
  selectorPresent: "Enter the CSS selector of the element a run finds when it succeeds",
};

/**
 * Whether `selector` parses as CSS, read by the browser the screen runs in; with no `document`, as
 * in the node tests, every selector does. agent lets any selector through and the page's own error
 * ends the run (`packages/agent/src/success.ts`), so one that is not CSS, Playwright's `text=…` say,
 * would end every run of a set in an error.
 */
function cssSelectorParses(selector: string): boolean {
  if (typeof document === "undefined") return true;
  try {
    document.createDocumentFragment().querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

/**
 * Why "Check the goal" cannot run yet, in words, or `undefined` when it can: the check under way,
 * then the start URL, empty and then one `HttpUrl` refuses, then the sentence, then the success
 * condition, empty and then one that does not start the way core's `matchableUrlPattern` asks or a
 * selector that is not CSS, so the reason is the first thing to do. A pattern that starts well but
 * does not compile, a brace left open say, passes, and agent refuses it at the start of each run.
 * Each field is read trimmed, as it is sent.
 */
export function formBlocker(form: TargetForm): string | undefined {
  if (form.check.status === "checking") return "The goal is being checked";
  const startUrl = form.startUrl.trim();
  if (startUrl === "") return "Enter a start URL: the page every run starts on";
  if (!HttpUrl.safeParse(startUrl).success) {
    return "Enter the start URL as a full http or https address, such as https://example.com/";
  }
  if (form.story.trim() === "") return "Write the goal: what the person wants, in one sentence";
  const successValue = form.successValue.trim();
  if (successValue === "") return SUCCESS_BLOCKERS[form.successKind];
  if (form.successKind === "urlMatches" && !matchableUrlPattern(successValue)) {
    return UNMATCHABLE_SUCCESS;
  }
  if (form.successKind === "selectorPresent" && !cssSelectorParses(successValue)) {
    return "Enter a CSS selector, such as #order-history: Playwright's text= and :has-text are not CSS";
  }
  return undefined;
}

/** The `POST /tasks` body: each field trimmed, `success` built from the kind and value typed. */
export function taskRequestOf(form: TargetForm): TaskRequest {
  const value = form.successValue.trim();
  return {
    story: form.story.trim(),
    startUrl: form.startUrl.trim(),
    success:
      form.successKind === "urlMatches"
        ? { type: "urlMatches", pattern: value }
        : { type: "selectorPresent", selector: value },
  };
}

// ---------------------------------------------------------------------------
// The goal view
// ---------------------------------------------------------------------------

/**
 * Where Scout has got on the goal: io's answer (`api/scout.ts`), or the first read still in flight.
 * A refused `POST` and a read that rejected are `failed` too (`target-calls.ts`).
 */
export type ScoutState = ScoutAnswer | { status: "reading" };

export type RunSet =
  /** `error`: the last start io refused. */
  | { status: "idle"; error?: string }
  | { status: "starting" }
  /** `ended`: the set's runs io has stored, in the order the polls found them. */
  | { status: "running"; runs: StartedRun[]; ended: RunId[]; pollError?: string }
  /**
   * Every run stored, or "Write the report" pressed before then: no run is followed from here on,
   * and the screen asks the Analyst once for the set, as it turns `ended`. A new set may start.
   */
  | { status: "ended" };

/** D10: three seeds by default, and ten, the most one run set takes, as the other choice. */
type SeedCount = 3 | typeof MAX_RUN_SET_SEEDS;

export type GoalState = {
  /** The chosen personas, in the order clicked; `runsRequestOf` sends them in the list's order. */
  profileIds: ProfileId[];
  seedCount: SeedCount;
  scout: ScoutState;
  runSet: RunSet;
};

export type GoalAction =
  /** Refused while the set is starting or running: the same state comes back. */
  | { type: "personaToggled"; profileId: ProfileId }
  /** The same. */
  | { type: "seedCountChosen"; seedCount: SeedCount }
  | { type: "scoutRead"; scout: ScoutState }
  /** From idle or ended; anywhere else the same state comes back. */
  | { type: "runsStarting" }
  | { type: "runsStarted"; runs: StartedRun[] }
  | { type: "runsFailed"; message: string }
  /**
   * One poll's answer: the runs io now has stored, and what failed, if anything. The last run
   * stored ends the set. Outside running, the same state.
   */
  | { type: "runsPolled"; ended: RunId[]; error?: string }
  /** "Write the report" while the set runs: it ends there. Anywhere else the same state. */
  | { type: "reportAsked" };

/** The fewest personas a run set takes: the least that lets the report compare personas. */
const MIN_RUN_SET_PERSONAS = 2;

/** No persona, three seeds, Scout's first read in flight, nothing started. */
export function initialGoal(): GoalState {
  return { profileIds: [], seedCount: 3, scout: { status: "reading" }, runSet: { status: "idle" } };
}

/** A set under way: no persona or seed edit and no new start until it has ended. */
type UnderWay = "starting" | "running";

/** Whether a set at `status` is under way; the view locks the set's choices on the same test. */
export function isUnderWay(status: RunSet["status"]): status is UnderWay {
  return status === "starting" || status === "running";
}

/**
 * A running set after one poll: the newly stored ids of its own runs added once each, the poll's
 * fault kept or cleared, and `ended` once every run is stored. An id that names none of the set's
 * runs is dropped, so the progress line never counts past the set.
 */
function polled(state: GoalState, ended: readonly RunId[], error: string | undefined): GoalState {
  const { runSet } = state;
  if (runSet.status !== "running") return state;
  const ids = new Set(runSet.runs.map((run) => run.id));
  const stored = [...runSet.ended];
  for (const id of ended) if (ids.has(id) && !stored.includes(id)) stored.push(id);
  if (runSet.runs.every((run) => stored.includes(run.id))) {
    return { ...state, runSet: { status: "ended" } };
  }
  const { pollError: _cleared, ...rest } = runSet;
  return {
    ...state,
    runSet: { ...rest, ended: stored, ...(error !== undefined && { pollError: error }) },
  };
}

/**
 * The goal view after `action`. A refused action (an edit or a start while a set is under way, an
 * answer out of turn) hands back `state` itself.
 */
export function goalReducer(state: GoalState, action: GoalAction): GoalState {
  switch (action.type) {
    case "personaToggled": {
      if (isUnderWay(state.runSet.status)) return state;
      const { profileId } = action;
      const profileIds = state.profileIds.includes(profileId)
        ? state.profileIds.filter((id) => id !== profileId)
        : [...state.profileIds, profileId];
      return { ...state, profileIds };
    }
    case "seedCountChosen":
      if (isUnderWay(state.runSet.status)) return state;
      return { ...state, seedCount: action.seedCount };
    case "scoutRead":
      return { ...state, scout: action.scout };
    case "runsStarting":
      if (isUnderWay(state.runSet.status)) return state;
      return { ...state, runSet: { status: "starting" } };
    case "runsStarted":
      return { ...state, runSet: { status: "running", runs: action.runs, ended: [] } };
    case "runsFailed":
      return { ...state, runSet: { status: "idle", error: action.message } };
    case "runsPolled":
      return polled(state, action.ended, action.error);
    case "reportAsked":
      if (state.runSet.status !== "running") return state;
      return { ...state, runSet: { status: "ended" } };
  }
}

/** Seeds 1 to `seedCount`: the seed set the fixtures and `seed:demo` use. */
export function seedsOf(seedCount: SeedCount): Seed[] {
  return Array.from({ length: seedCount }, (_, index) => index + 1);
}

/** Why the run button waits while a set is under way, by where it has got. */
const UNDER_WAY_BLOCKERS: Record<UnderWay, string> = {
  starting: "The runs are starting",
  running: "Wait for these runs to end before you start more",
};

/**
 * Why the run button cannot start a set yet, in words, or `undefined` when it can: a set under way,
 * then the goal's report being written (`writing`), then too few personas, so the reason is the
 * first thing to do.
 */
export function runSetBlocker(state: GoalState, writing: boolean): string | undefined {
  const { status } = state.runSet;
  if (isUnderWay(status)) return UNDER_WAY_BLOCKERS[status];
  if (writing) return "Wait for the report before you start more runs";
  const more = MIN_RUN_SET_PERSONAS - state.profileIds.length;
  if (more > 0) {
    return `Choose ${count(more, "more persona")}: the report compares at least ${MIN_RUN_SET_PERSONAS}`;
  }
  return undefined;
}

/** The run button's words: how many runs it starts, and on what. */
export function runButtonLabel(state: GoalState): string {
  return `Start ${count(state.profileIds.length * state.seedCount, "run")} on the LLM`;
}

/**
 * "4 of 6 runs ended" while the set runs, or `undefined`. Only a running set counts what ended: a
 * report asked mid-set reads what io stored, so after it the line would claim more than is known.
 */
export function progressLine(runSet: RunSet): string | undefined {
  if (runSet.status !== "running") return undefined;
  return `${runSet.ended.length} of ${count(runSet.runs.length, "run")} ended`;
}

/**
 * Scout's line in the Report's words (`screens/report.tsx`, `scoutLine`), from its ground truth:
 * the shortest path's steps when it reached the goal, the attempts made when it did not.
 */
export function scoutLine(truth: GroundTruth): string {
  // `GroundTruth` holds `shortest` exactly when the goal was reached, as io's `scoutLineOf` reads.
  return truth.shortest === undefined
    ? `Scout did not reach it in ${count(truth.attempts.length, "attempt")}`
    : `Scout reached it in ${count(truth.shortest.path.steps.length, "step")}`;
}

/**
 * The `POST /runs` body for the goal's task: the personas in `profiles`' order (Ada to Zoya, so the
 * report keeps one order however they were clicked), seeds 1 to `seedCount`, on the LLM.
 */
export function runsRequestOf(
  task: Task,
  state: GoalState,
  profiles: readonly Profile[],
): RunsRequest & { backend: "llm" } {
  return {
    taskId: task.id,
    profileIds: profiles.filter((p) => state.profileIds.includes(p.id)).map((p) => p.id),
    seeds: seedsOf(state.seedCount),
    backend: "llm",
  };
}
