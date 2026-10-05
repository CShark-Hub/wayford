/**
 * The arena's start panel as data: which goal, the sentence that goes to the Extractor, the
 * personas, the seed, and how far the check and the start have got. Pure, so every rule the panel
 * keeps (three to five personas, Start only after an accepted check of the current sentence, a
 * late answer dropped) is a test of a function, and the view only draws a state.
 *
 * The goal's `startUrl` and `success` come from its preset and nothing else: never from the model
 * and never from the sentence, which stays the user's to edit (`tasks/s3-03-ring.md`).
 */
import {
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
  /** The chosen personas, in the order clicked; `runsRequestOf` sends them in the list's order. */
  profileIds: ProfileId[];
  /** The seed input's text, as typed; `seedOf` reads it. */
  seed: string;
  check: GoalCheck;
  starting: boolean;
  startError?: string;
};

/** The preset and sentence a check was asked for, so its answer can be matched to the panel. */
type CheckedFor = { presetId: TaskId; sentence: string };

export type PanelAction =
  /** Resets the sentence to the preset's, and the check. */
  | { type: "presetChosen"; presetId: TaskId }
  /** Resets the check. */
  | { type: "sentenceEdited"; sentence: string }
  /** A sixth is refused: the same state comes back. */
  | { type: "personaToggled"; profileId: ProfileId }
  | { type: "seedEdited"; seed: string }
  | { type: "checkStarted" }
  /** Ignored when `for` is not the current preset and sentence. */
  | { type: "checkAnswered"; for: CheckedFor; extraction: Extraction }
  /** Ignored when `for` is not the current preset and sentence. */
  | { type: "checkFailed"; for: CheckedFor; message: string }
  | { type: "startStarted" }
  /** Clears `starting`, so the panel can start again after "New race". */
  | { type: "startSucceeded" }
  | { type: "startFailed"; message: string };

/** The preset under `id`, or `undefined` when none holds it. */
function presetOf(id: TaskId): GoalPreset | undefined {
  return GOAL_PRESETS.find((preset) => preset.id === id);
}

/** `DEMO_GOAL`, or the first preset when it is gone, with no persona, seed 1 and nothing checked. */
export function initialPanel(): PanelState {
  const preset = presetOf(DEMO_GOAL) ?? GOAL_PRESETS[0];
  if (preset === undefined) throw new Error("the arena needs a goal: tasks.json holds none");
  return {
    presetId: preset.id,
    sentence: preset.sentence,
    profileIds: [],
    seed: "1",
    check: { status: "unchecked" },
    starting: false,
  };
}

/** Whether an answer was asked for the panel's current preset and sentence. */
function isCurrent(state: PanelState, asked: CheckedFor): boolean {
  return asked.presetId === state.presetId && asked.sentence === state.sentence;
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
      return { ...state, presetId: preset.id, sentence: preset.sentence, check: UNCHECKED };
    }
    case "sentenceEdited":
      return { ...state, sentence: action.sentence, check: UNCHECKED };
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
      return { ...state, starting: false };
    case "startFailed":
      return { ...state, starting: false, startError: action.message };
  }
}

/** The `POST /tasks` body: the sentence, with `startUrl` and `success` from the chosen preset only. */
export function taskRequestOf(state: PanelState): TaskRequest {
  const preset = presetOf(state.presetId);
  if (preset === undefined) throw new Error(`no goal preset ${state.presetId}`);
  return { story: state.sentence, startUrl: preset.startUrl, success: preset.success };
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
 * check, then the personas, then the seed, so the reason is the first thing to do.
 */
export function startBlocker(state: PanelState): string | undefined {
  if (state.starting) return "The race is starting";
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
