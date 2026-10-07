/**
 * The start panel's two calls to io, as plain functions of the panel's state and its `dispatch`,
 * so a test drives each with a stubbed `fetch` and a recording dispatch. The screen
 * (`screens/arena.tsx`) calls them; the reducer (`panel-state.ts`) keeps every rule about what an
 * answer may change.
 */
import type { Profile, Seed, Task, TaskId } from "@wayford/core";
import { type Extraction, extractTask, type StartedRun, startRuns } from "../api/runs.js";
import {
  checkedFor,
  type PanelAction,
  type PanelState,
  presetOf,
  runsRequestOf,
  taskRequestOf,
  usesPresetSuccess,
} from "./panel-state.js";

/**
 * A race io has started: the task the check accepted, whose goal the personas got and whose id and
 * success condition the race's goal strip shows; the label of the preset it came from ("Hard
 * goal"); the seed the runs share; and the runs.
 *
 * `presetTask` is the preset's own task, when the goal the personas got is the preset's sentence
 * word for word and its success the preset's: the stored report on that task, the one `seed:demo`
 * writes, is on the same goal. Every race is checked anew (`startSucceeded` spends the check) and
 * the check mints a new task, so the race's own task has no report until its runs are analysed.
 * Undefined when the sentence or the success was edited, or the check rewrote the sentence.
 */
export type Race = {
  task: Task;
  label: string;
  seed: Seed;
  runs: StartedRun[];
  presetTask: TaskId | undefined;
};

/** A rejection's message, for the panel's alert line. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Ask io to check `state`'s sentence with its success and its preset's start URL. What was asked,
 * the preset, the sentence and the success, is read before the call and tags the answer, so the
 * reducer drops an answer to a sentence or a success edited while io was checking.
 */
export async function checkGoal(
  state: PanelState,
  dispatch: (action: PanelAction) => void,
): Promise<void> {
  const asked = checkedFor(state);
  const request = taskRequestOf(state);
  dispatch({ type: "checkStarted" });
  let extraction: Extraction;
  try {
    extraction = await extractTask(request);
  } catch (error) {
    dispatch({ type: "checkFailed", for: asked, message: messageOf(error) });
    return;
  }
  dispatch({ type: "checkAnswered", for: asked, extraction });
}

/**
 * Ask io to start the race `state` describes, the personas in `profiles`' order. The race io
 * started, or `undefined` when it refused (the panel then shows io's reason) or the check is not
 * accepted, which Start's blocker rules out. The reducer only ever sets a preset `GOAL_PRESETS`
 * holds, so a missing one is a bug, and throws.
 */
export async function startRace(
  state: PanelState,
  profiles: readonly Profile[],
  dispatch: (action: PanelAction) => void,
): Promise<Race | undefined> {
  if (state.check.status !== "accepted") return undefined;
  const task = state.check.task;
  const preset = presetOf(state.presetId);
  if (preset === undefined) throw new Error(`no goal preset ${state.presetId}`);
  const request = runsRequestOf(state, profiles);
  dispatch({ type: "startStarted" });
  let runs: StartedRun[];
  try {
    runs = await startRuns(request);
  } catch (error) {
    dispatch({ type: "startFailed", message: messageOf(error) });
    return undefined;
  }
  dispatch({ type: "startSucceeded" });
  const presetTask =
    task.goal === preset.sentence && usesPresetSuccess(state) ? preset.id : undefined;
  return { task, label: preset.label, seed: request.seeds[0], runs, presetTask };
}
