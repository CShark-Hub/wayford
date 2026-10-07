/**
 * Test data, Node only: this file imports `@wayford/core/fixtures`, which reads its files with
 * `node:fs`, so no screen may import it. The arena's tests share it: synthetic personas and the
 * panel's actions for the start panel's tests, the hard goal's task, Vera's fixture run, its ends
 * and a variant where she gets stuck for the race's, and how a race test finds a run's lane in the
 * markup.
 *
 * It loads only through Vite, as vitest does: `./panel-state.js` reads the bundled fixtures with
 * Vite's `import.meta.glob`, so plain `tsx`, which runs `check:self`, cannot import this file. The
 * race the self-check serves lives in `./demo-race.js` for that reason.
 */
import { Profile, RunEvent, type Task } from "@wayford/core";
import { profileFixture, runEventFixtures, taskFixture } from "@wayford/core/fixtures";
import type { StartedRun } from "../api/runs.js";
import { type PanelAction, type PanelState, panelReducer } from "./panel-state.js";

/** Six personas, one more than the panel takes: five fixture personas exist, so all six are made. */
export const sixProfiles: Profile[] = ["Ana", "Ben", "Cid", "Dot", "Eve", "Fay"].map(
  (label, index) =>
    Profile.parse({ ...profileFixture("prof_ada"), id: `prof_p${index + 1}`, label }),
);

/** `actions` dispatched in order, from `state`. */
export function dispatched(state: PanelState, ...actions: PanelAction[]): PanelState {
  return actions.reduce(panelReducer, state);
}

/** The panel with each of `profiles` toggled on, in order. */
export function withPersonas(state: PanelState, profiles: readonly Profile[]): PanelState {
  return dispatched(
    state,
    ...profiles.map((profile): PanelAction => ({ type: "personaToggled", profileId: profile.id })),
  );
}

/** The hard goal, as the personas get it. */
export const GOAL = "you want to see what you ordered three months ago";

/** The hard goal's task, as io's check accepts it unchanged: the race's goal strip reads it. */
export const hardTask: Task = taskFixture("task_past-order");

/** The fixture's event at `index`: Vera's run on the hard goal, which she gives up on. */
export function fixtureEvent(index: number): RunEvent {
  const event = runEventFixtures[index];
  if (!event) throw new Error(`the fixture stream has no event ${index}`);
  return event;
}

const lastEvent = fixtureEvent(runEventFixtures.length - 1);
if (lastEvent.type !== "runFinished") {
  throw new Error("the fixture stream must end with runFinished");
}

/** The fixture's last event: Vera's `runFinished`, gave up. */
export const finished = lastEvent;

/** Vera's run up to her give-up's `runFinished`, not included. */
export const beforeEnd = runEventFixtures.slice(0, -1);

/** A crash where Vera gave up: the same step, time and bill. */
export const failed = RunEvent.parse({
  type: "runFailed",
  runId: finished.runId,
  stepIndex: finished.stepIndex,
  timestamp: finished.timestamp,
  error: "Target page, context or browser has been closed",
  durationMs: finished.durationMs,
  cost: finished.cost,
});

/** `timestamp` moved `ms` later. */
export function shifted(timestamp: string, ms: number): string {
  return new Date(Date.parse(timestamp) + ms).toISOString();
}

/**
 * `event` moved to step `stepIndex`, its observation with it, and `changes` applied. Re-parsed, so
 * every event built from it is one core's contract accepts.
 */
export function atStep(event: RunEvent, stepIndex: number, changes: object = {}): RunEvent {
  const observation =
    event.type === "stepObserved" ? { observation: { ...event.observation, stepIndex } } : {};
  return RunEvent.parse({ ...event, stepIndex, ...observation, ...changes });
}

/** How much later Vera's give-up comes in `stuckRun`: one more step, as long as her wasted one. */
const STUCK_SHIFT_MS = 3000;

/** The fixture's event at `index`, moved to step `stepIndex` and `STUCK_SHIFT_MS` later. */
function later(index: number, stepIndex: number, changes: object = {}): RunEvent {
  const event = fixtureEvent(index);
  return atStep(event, stepIndex, {
    timestamp: shifted(event.timestamp, STUCK_SHIFT_MS),
    ...changes,
  });
}

/**
 * Vera's run with a second wasted step: step 4 is wasted on /settings as step 3 was, and her
 * give-up moves to step 5, 3 s later, at 18.5 s. Steps 3 and 4 both left the page as it was, so
 * she is stuck once step 5's observation arrives (event 17) until the run ends (event 21).
 */
export const stuckRun: RunEvent[] = [
  // Steps 0 to 3, and step 4's observation: /settings, the page step 3 saw.
  ...runEventFixtures.slice(0, 16),
  // Step 4 wasted, as step 3 was.
  later(14, 4),
  // Step 5 observed: the same page again. Then its narration, the give-up planned and landed.
  later(15, 5),
  later(16, 5),
  later(17, 5),
  later(18, 5, { screenshotPath: `runs/${finished.runId}/step-5.png` }),
  later(19, 5, { durationMs: finished.durationMs + STUCK_SHIFT_MS }),
];

/** The markup inside the lane its heading names `run`, found through its `aria-labelledby`. */
export function tileOf(html: string, run: StartedRun): string {
  const tile = html.match(
    new RegExp(`<article [^>]*aria-labelledby="race-${run.id}"[^>]*>(.*?)</article>`, "s"),
  );
  if (tile?.[1] === undefined) throw new Error(`no lane for ${run.id}`);
  return tile[1];
}

/** The `data-state` of `run`'s avatar, read inside its lane. */
export function avatarStateOf(html: string, run: StartedRun): string {
  const state = tileOf(html, run).match(/<svg[^>]*\sdata-state="([^"]*)"/)?.[1];
  if (state === undefined) throw new Error(`no avatar state in ${run.id}'s lane`);
  return state;
}
