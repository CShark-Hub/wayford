/**
 * The arena's start panel as data: which goal, the sentence that goes to the Extractor, what counts
 * as arriving, the personas, the seed, and how far the check and the start have got. Pure, so every
 * rule the panel keeps (three to five personas, Start only after an accepted check of the current
 * sentence and success, a late answer dropped) is a test of a function, and the view only draws a
 * state.
 *
 * The goal's `startUrl` comes from its preset and nothing else. Its `success` is the preset's or
 * the person's, typed in the panel: never the model's, and never read off the sentence, which
 * stays the person's to edit (`tasks/s3-03-ring.md`). The preset's condition belongs to the
 * preset's sentence: a goal written in other words may arrive somewhere else, and one stored with
 * the preset's condition would never count as arriving there (issue #196). So a sentence edited
 * away from the preset's takes the preset's condition with it, and the person says what counts.
 *
 * What counts is a URL pattern, the one kind the panel types: both goals of the target app wait
 * for a page. A pattern that cannot match by how it starts, such as `/account/address`, is held
 * back before the check by core's `matchableUrlPattern`, the rule the Actor loop refuses it by
 * before its first step. One that starts well but does not compile, a brace left open say, passes
 * the panel, and the loop refuses it before the first step of each run.
 */
import {
  matchableUrlPattern,
  type Profile,
  type ProfileId,
  Seed,
  type SuccessCondition,
  type Task,
  type TaskId,
} from "@wayford/core";
import type { Extraction, TaskRequest } from "../api/runs.js";
import { bundledTasks } from "../bundled-fixtures.js";

/** A goal of the target app the panel offers, from one task of `tasks.json`. */
export type GoalPreset = {
  id: TaskId;
  /** "Easy goal" or "Hard goal" (`GOAL_LABELS`), or "Goal" for a task with no label of its own. */
  label: string;
  /** The goal as `tasks.json` states it: where the editable sentence starts. */
  sentence: string;
  startUrl: Task["startUrl"];
  success: SuccessCondition;
};

/** The labels of the target app's two goals, by task id. */
const GOAL_LABELS: ReadonlyMap<TaskId, string> = new Map([
  ["task_next-parcel", "Easy goal"],
  ["task_past-order", "Hard goal"],
]);

/** The goal the panel opens on: the hard one, the demo's (`docs/DEMO.md` beat 4). */
export const DEMO_GOAL: TaskId = "task_past-order";

/** Every task of `tasks.json` as a preset, in file order. */
export const GOAL_PRESETS: readonly GoalPreset[] = bundledTasks.map((task) => ({
  id: task.id,
  label: GOAL_LABELS.get(task.id) ?? "Goal",
  sentence: task.goal,
  startUrl: task.startUrl,
  success: task.success,
}));

/** `docs/PLAN.md` F6 AC1: a race is three to five runs. */
export const MIN_PERSONAS = 3;

/**
 * One `EventSource` per run, and a browser opens at most six HTTP/1.1 connections per origin: five
 * streams leave one for the screenshots and every other request. io's runner has five slots too.
 */
export const MAX_PERSONAS = 5;

/**
 * `success` as the field draws it: its URL pattern. Only the preset's condition is drawn from a
 * `SuccessCondition`, and `GOAL_PRESETS` holds none the field cannot type (a test says so), so an
 * element or a request is a bug, and throws.
 */
function draftOf(success: SuccessCondition): string {
  if (success.type !== "urlMatches") {
    throw new Error(`the start panel types a URL pattern, not a ${success.type} condition`);
  }
  return success.pattern;
}

/** The condition the field's pattern says, trimmed, or `undefined` while it is blank. */
export function successOf(draft: string): SuccessCondition | undefined {
  const pattern = draft.trim();
  return pattern === "" ? undefined : { type: "urlMatches", pattern };
}

/** Whether `draft` is `success` as typed: never so for an element or a request. */
function isSuccess(draft: string, success: SuccessCondition): boolean {
  return success.type === "urlMatches" && draft === success.pattern;
}

/** Where the goal's check has got. Only `accepted` lets the race start. */
export type GoalCheck =
  | { status: "unchecked" }
  | { status: "checking" }
  | { status: "accepted"; task: Task; rewritten: boolean }
  | { status: "refused"; goal: string; survived: string[]; error: string }
  | { status: "failed"; message: string };

export type PanelState = {
  presetId: TaskId;
  /** Editable; starts as the preset's sentence. */
  sentence: string;
  /**
   * The success condition's URL pattern, as typed, so an empty or half-typed one is a state the
   * panel can be in; `successOf` reads the condition it says. Editable; starts as the preset's,
   * and follows the sentence (`successAfter`).
   */
  success: string;
  /** The chosen personas, in the order clicked; `runsRequestOf` sends them in the list's order. */
  profileIds: ProfileId[];
  /** The seed input's text, as typed; `seedOf` reads it. */
  seed: string;
  check: GoalCheck;
  starting: boolean;
  startError?: string;
};

/**
 * The preset, sentence and success a check was asked for, so its answer can be matched to the
 * panel: io stores the task with the success it was sent, so an answer to another one is stale.
 */
export type CheckedFor = { presetId: TaskId; sentence: string; success: string };

export type PanelAction =
  /** Resets the sentence and the success to the preset's, and the check. */
  | { type: "presetChosen"; presetId: TaskId }
  /** Resets the check, and may empty or refill the success (`successAfter`). */
  | { type: "sentenceEdited"; sentence: string }
  /** Its pattern, as typed. Resets the check. */
  | { type: "successEdited"; success: string }
  /** "Use the preset's": the preset's condition, by the person's choice. Resets the check. */
  | { type: "presetSuccessUsed" }
  /** A sixth is refused: the same state comes back. */
  | { type: "personaToggled"; profileId: ProfileId }
  | { type: "seedEdited"; seed: string }
  | { type: "checkStarted" }
  /** Ignored when `for` is not the current preset, sentence and success. */
  | { type: "checkAnswered"; for: CheckedFor; extraction: Extraction }
  /** Ignored when `for` is not the current preset, sentence and success. */
  | { type: "checkFailed"; for: CheckedFor; message: string }
  | { type: "startStarted" }
  /**
   * Clears `starting`, and the check: io mints a task per check, so the next race is checked again
   * and gets a task of its own, and its report reads its runs only.
   */
  | { type: "startSucceeded" }
  | { type: "startFailed"; message: string };

/** The preset under `id`, or `undefined` when none holds it. */
export function presetOf(id: TaskId): GoalPreset | undefined {
  return GOAL_PRESETS.find((preset) => preset.id === id);
}

/** Whether `a` and `b` are the one condition: same type, same fields. */
function sameSuccess(a: SuccessCondition, b: SuccessCondition): boolean {
  switch (a.type) {
    case "urlMatches":
      return b.type === a.type && b.pattern === a.pattern;
    case "selectorPresent":
      return b.type === a.type && b.selector === a.selector;
    case "requestObserved":
      return b.type === a.type && b.method === a.method && b.urlPattern === a.urlPattern;
  }
}

/**
 * The preset a stored task was checked from, with the preset's success. The Extractor stores each
 * checked sentence as a task of its own, so its id names no preset; its start URL is the preset's,
 * and its success too, unless the person typed one of their own (issue #196). None for a task with
 * a success of the person's own, or one checked for another site.
 */
function presetFor(task: Pick<Task, "startUrl" | "success">): GoalPreset | undefined {
  return GOAL_PRESETS.find(
    ({ startUrl, success }) => startUrl === task.startUrl && sameSuccess(success, task.success),
  );
}

/** The label of the preset a stored task was checked from, such as "Hard goal", or "Goal". */
export function goalLabel(task: Pick<Task, "startUrl" | "success">): string {
  return presetFor(task)?.label ?? "Goal";
}

/**
 * The preset's own task, when a stored task's goal is its preset's sentence word for word and its
 * success the preset's: the stored report on that task, the one `seed:demo` writes, is on the same
 * goal. Every race is checked anew (`startSucceeded` spends the check) and the check mints a new
 * task, so a race's own task has no report until its runs are analysed. Undefined when the sentence
 * or the success was edited, or the check rewrote the sentence.
 */
export function presetTaskOf(
  task: Pick<Task, "goal" | "startUrl" | "success">,
): TaskId | undefined {
  const preset = presetFor(task);
  return preset?.sentence === task.goal ? preset.id : undefined;
}

/**
 * The preset the panel is on. `initialPanel` and the reducer only ever set a preset `GOAL_PRESETS`
 * holds, so a missing one is a bug, and throws.
 */
function presetIn(state: PanelState): GoalPreset {
  const preset = presetOf(state.presetId);
  if (preset === undefined) throw new Error(`no goal preset ${state.presetId}`);
  return preset;
}

/**
 * `DEMO_GOAL`, or the first preset when it is gone, with its sentence and success, no persona,
 * seed 1 and nothing checked.
 */
export function initialPanel(): PanelState {
  const preset = presetOf(DEMO_GOAL) ?? GOAL_PRESETS[0];
  if (preset === undefined) throw new Error("the arena needs a goal: tasks.json holds none");
  return {
    presetId: preset.id,
    sentence: preset.sentence,
    success: draftOf(preset.success),
    profileIds: [],
    seed: "1",
    check: { status: "unchecked" },
    starting: false,
  };
}

/** Whether the panel's success is its preset's, exactly: "Use the preset's" shows when it is not. */
export function usesPresetSuccess(state: PanelState): boolean {
  return isSuccess(state.success, presetIn(state).success);
}

/**
 * The success once the sentence goes from `state`'s to `sentence`. The preset's condition belongs
 * to the preset's sentence:
 *
 * - Edited away from the preset's sentence, a success still the preset's empties, so the person
 *   says what counts as arriving for the goal they wrote. Only on leaving the preset's sentence:
 *   once away, a success that is the preset's was put there by "Use the preset's" or typed, so it
 *   is the person's choice, and no later keystroke undoes it.
 * - Edited back to the preset's sentence, an empty success refills from the preset.
 * - Otherwise the success is left as the person set it.
 */
function successAfter(state: PanelState, sentence: string): string {
  const preset = presetIn(state);
  const leaving = state.sentence === preset.sentence && sentence !== preset.sentence;
  if (leaving && isSuccess(state.success, preset.success)) return "";
  const back = sentence === preset.sentence;
  if (back && successOf(state.success) === undefined) return draftOf(preset.success);
  return state.success;
}

/** What a check of the panel at `state` is asked for, to tag its answer with. */
export function checkedFor(state: PanelState): CheckedFor {
  return { presetId: state.presetId, sentence: state.sentence, success: state.success };
}

/** Whether an answer was asked for the panel's current preset, sentence and success. */
function isCurrent(state: PanelState, asked: CheckedFor): boolean {
  return (
    asked.presetId === state.presetId &&
    asked.sentence === state.sentence &&
    asked.success === state.success
  );
}

const UNCHECKED: GoalCheck = { status: "unchecked" };

/** The check an Extractor answer gives. */
function checkOf(extraction: Extraction): GoalCheck {
  return extraction.ok
    ? { status: "accepted", task: extraction.task, rewritten: extraction.rewritten }
    : {
        status: "refused",
        goal: extraction.goal,
        survived: extraction.survived,
        error: extraction.error,
      };
}

/**
 * The panel after `action`. A refused action (a sixth persona, a stale answer, a preset `GOAL_PRESETS`
 * does not hold) hands back `state` itself, so React skips the render.
 */
export function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "presetChosen": {
      const preset = presetOf(action.presetId);
      if (preset === undefined) return state;
      return {
        ...state,
        presetId: preset.id,
        sentence: preset.sentence,
        success: draftOf(preset.success),
        check: UNCHECKED,
      };
    }
    case "sentenceEdited":
      return {
        ...state,
        sentence: action.sentence,
        success: successAfter(state, action.sentence),
        check: UNCHECKED,
      };
    // An accepted task was stored with the success it was checked with, so a new one needs a check.
    case "successEdited":
      return { ...state, success: action.success, check: UNCHECKED };
    case "presetSuccessUsed":
      return { ...state, success: draftOf(presetIn(state).success), check: UNCHECKED };
    case "personaToggled": {
      if (state.profileIds.includes(action.profileId)) {
        return { ...state, profileIds: state.profileIds.filter((id) => id !== action.profileId) };
      }
      if (state.profileIds.length >= MAX_PERSONAS) return state;
      return { ...state, profileIds: [...state.profileIds, action.profileId] };
    }
    case "seedEdited":
      return { ...state, seed: action.seed };
    case "checkStarted":
      return { ...state, check: { status: "checking" } };
    case "checkAnswered":
      if (!isCurrent(state, action.for)) return state;
      return { ...state, check: checkOf(action.extraction) };
    case "checkFailed":
      if (!isCurrent(state, action.for)) return state;
      return { ...state, check: { status: "failed", message: action.message } };
    case "startStarted": {
      const { startError: _cleared, ...rest } = state;
      return { ...rest, starting: true };
    }
    case "startSucceeded":
      return { ...state, starting: false, check: UNCHECKED };
    case "startFailed":
      return { ...state, starting: false, startError: action.message };
  }
}

/**
 * The `POST /tasks` body: the sentence, the panel's success trimmed, and `startUrl` from the chosen
 * preset only. Check the goal is unavailable while `successBlocker` has a reason, so a blank
 * success, or one no page could match, is a bug, and throws.
 */
export function taskRequestOf(state: PanelState): TaskRequest {
  const success = successOf(state.success);
  if (success === undefined || successBlocker(state.success) !== undefined) {
    throw new Error(`taskRequestOf needs a URL pattern a page can match, not "${state.success}"`);
  }
  return { story: state.sentence, startUrl: presetIn(state).startUrl, success };
}

/**
 * The seed the input holds: digits only, so "", " ", "1e3", "0x10" and "-1" are none, though
 * `Number` reads most of them, and then within core's `Seed`, so 2^32 is none either.
 */
export function seedOf(text: string): Seed | undefined {
  if (!/^\d+$/.test(text)) return undefined;
  const seed = Seed.safeParse(Number(text));
  return seed.success ? seed.data : undefined;
}

/**
 * Why the goal cannot be checked yet: io stores a task with the success it is sent, and a blank
 * one counts nothing as arriving. Start's first reason too, since the check comes first.
 */
export const NO_SUCCESS = "Say what counts as arriving: a URL pattern";

/**
 * Why a pattern core's `matchableUrlPattern` refuses cannot be checked: it is compared with a
 * page's whole URL, so `/account/address`, the path alone, never matches, and the Actor loop ends
 * every run of it in an error before the first step.
 */
export const UNMATCHABLE_SUCCESS =
  "Start the URL pattern with **/ to match on any site, or with http:// or https://";

/**
 * Why the field's pattern holds the check back, in words, or `undefined` when it can be checked:
 * blank, or one no page's URL could match, trimmed as `successOf` reads it.
 */
export function successBlocker(draft: string): string | undefined {
  const pattern = draft.trim();
  if (pattern === "") return NO_SUCCESS;
  if (!matchableUrlPattern(pattern)) return UNMATCHABLE_SUCCESS;
  return undefined;
}

/** Why the check does not let the race start yet, by where it has got. */
const CHECK_BLOCKERS: Record<Exclude<GoalCheck["status"], "accepted">, string> = {
  unchecked: "Check the goal first: the race starts on a goal the check accepted",
  checking: "The goal is being checked",
  refused: "The goal still names the way: edit the sentence and check it again",
  failed: "The check did not answer: check the goal again",
};

/** How many more personas a race needs, in words, or `undefined` when `chosen` is enough. */
export function tooFewPersonas(chosen: number): string | undefined {
  if (chosen >= MIN_PERSONAS) return undefined;
  const more = MIN_PERSONAS - chosen;
  return `Choose ${more} more ${more === 1 ? "persona" : "personas"}: a race takes ${MIN_PERSONAS} to ${MAX_PERSONAS}`;
}

/**
 * Why Start cannot start yet, in words, or `undefined` when it can: the start under way, then the
 * success, then the check, then the personas, then the seed, so the reason is the first thing to
 * do. A blank or unmatchable success comes before the check because it keeps the check from being
 * asked.
 */
export function startBlocker(state: PanelState): string | undefined {
  if (state.starting) return "The race is starting";
  const success = successBlocker(state.success);
  if (success !== undefined) return success;
  if (state.check.status !== "accepted") return CHECK_BLOCKERS[state.check.status];
  const fewer = tooFewPersonas(state.profileIds.length);
  if (fewer !== undefined) return fewer;
  if (seedOf(state.seed) === undefined) {
    return "Enter a seed: a whole number from 0 to 4294967295";
  }
  return undefined;
}

/**
 * The `POST /runs` body for an accepted check: its task, the personas in `profiles`' order (Ada to
 * Zoya, so the tiles keep one order however they were clicked), one seed. Called only when
 * `startBlocker` has no reason, so a missing check or seed is a bug, and throws.
 */
export function runsRequestOf(
  state: PanelState,
  profiles: readonly Profile[],
): { taskId: TaskId; profileIds: ProfileId[]; seeds: [Seed] } {
  if (state.check.status !== "accepted") throw new Error("runsRequestOf needs an accepted check");
  const seed = seedOf(state.seed);
  if (seed === undefined) throw new Error(`runsRequestOf needs a seed, not "${state.seed}"`);
  return {
    taskId: state.check.task.id,
    profileIds: profiles.filter((p) => state.profileIds.includes(p.id)).map((p) => p.id),
    seeds: [seed],
  };
}
