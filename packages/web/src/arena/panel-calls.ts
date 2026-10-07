/**
 * The start panel's two calls to io, as plain functions of the panel's state and its `dispatch`,
 * so a test drives each with a stubbed `fetch` and a recording dispatch. The screen
 * (`screens/arena.tsx`) calls them; the reducer (`panel-state.ts`) keeps every rule about what an
 * answer may change.
 */
import type { Profile, RaceId } from "@wayford/core";
import { type Extraction, extractTask, type StartedRace, startRuns } from "../api/runs.js";
import {
  checkedFor,
  type PanelAction,
  type PanelState,
  runsRequestOf,
  taskRequestOf,
} from "./panel-state.js";

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
 * Ask io to start the race `state` describes, the personas in `profiles`' order. The id of the race
 * io started, which the screen opens by its URL, or `undefined` when io refused (the panel then
 * shows io's reason) or the check is not accepted, which Start's blocker rules out.
 */
export async function startRace(
  state: PanelState,
  profiles: readonly Profile[],
  dispatch: (action: PanelAction) => void,
): Promise<RaceId | undefined> {
  if (state.check.status !== "accepted") return undefined;
  const request = runsRequestOf(state, profiles);
  dispatch({ type: "startStarted" });
  let started: StartedRace;
  try {
    started = await startRuns(request);
  } catch (error) {
    dispatch({ type: "startFailed", message: messageOf(error) });
    return undefined;
  }
  dispatch({ type: "startSucceeded" });
  return started.raceId;
}
