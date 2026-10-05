import { type RunEvent, runResultFromEvents } from "@wayford/core";
import { runEventFixtures } from "@wayford/core/fixtures";
import { expect, test } from "vitest";
import type { AvatarState } from "../avatar/state.js";
import { avatarState, avatarView, placeName, STUCK_STEPS } from "./avatar-state.js";
import { atStep, beforeEnd, failed, finished, fixtureEvent, stuckRun } from "./fixture-race.js";

/** The state after each prefix of `events`, the first event alone up to all of them. */
function statesOf(events: readonly RunEvent[]): AvatarState[] {
  return events.map((_, i) => avatarState(events.slice(0, i + 1)));
}

/** Where `avatarView` says the persona is stuck, after each prefix of `events`. */
function placesOf(events: readonly RunEvent[]): (string | undefined)[] {
  return events.map((_, i) => avatarView(events.slice(0, i + 1)).stuckOn);
}

/**
 * The run's start, then one step per observation of `observed`, each moved to its step: observed,
 * `planned` (an `actionPlanned`, moved to the step) and landed on the step's own page. The last
 * observation gets no action: it is the one that judges the step before it.
 */
function steps(observed: readonly RunEvent[], planned: (step: number) => RunEvent): RunEvent[] {
  return [
    fixtureEvent(0),
    ...observed.flatMap((observation, step) => {
      const seen = atStep(observation, step);
      if (step === observed.length - 1) return [seen];
      if (seen.type !== "stepObserved") throw new Error("steps takes stepObserved events");
      return [
        seen,
        planned(step),
        atStep(fixtureEvent(8), step, { urlAfter: seen.observation.url }),
      ];
    }),
  ];
}

/** Step `step`'s plan: `action`, performed as proposed, with no dice. */
function planning(action: object): (step: number) => RunEvent {
  return (step) =>
    atStep(fixtureEvent(7), step, { proposedAction: action, performedAction: action, dice: [] });
}

// The fixture's observations: 5 and 9 on /deliveries, before and after step 1's scroll; 13 on
// /settings.
const DELIVERIES = fixtureEvent(5);
const SCROLLED = fixtureEvent(9);
const SETTINGS = fixtureEvent(13);

test("every prefix of Vera's run: idle, moving, never stuck, then gave up", () => {
  // The expectations below count on two steps.
  expect(STUCK_STEPS).toBe(2);
  expect(statesOf(runEventFixtures)).toStrictEqual([
    // 0 to 3: the run starts, and step 0 is observed, narrated and planned. No action has landed.
    ...Array<AvatarState>(4).fill("idle"),
    // 4: step 0 lands on /deliveries. Only step 3, the wasted one, left the page as it was: step 4
    // observed the page step 3 saw (event 15). Steps 0 to 2 each changed what the filter saw, so
    // no two steps in a row left the page as it was.
    ...Array<AvatarState>(15).fill("moving"),
    // 19: runFinished, gave_up.
    "gaveUp",
  ]);
  expect(placesOf(runEventFixtures).every((place) => place === undefined)).toBe(true);
});

test("two wasted steps in a row on one page: stuck once the observation after the second arrives, not before", () => {
  // Still a whole run, which folds to Vera's give-up.
  expect(runResultFromEvents(stuckRun).outcome).toBe("gave_up");
  expect(statesOf(stuckRun)).toStrictEqual([
    ...Array<AvatarState>(4).fill("idle"),
    // 16: step 4 is wasted, but its next observation has not arrived: step 4 is not judged yet.
    ...Array<AvatarState>(13).fill("moving"),
    // 17: step 5 observes the page steps 3 and 4 saw. 18 to 20: narrated, planned, landed.
    ...Array<AvatarState>(4).fill("stuck"),
    // 21: runFinished, gave_up.
    "gaveUp",
  ]);
  expect(placesOf(stuckRun).slice(16)).toStrictEqual([
    undefined,
    "/settings",
    "/settings",
    "/settings",
    "/settings",
    undefined,
  ]);
});

test("two scrolls that change what the filter sees are not stuck; two that change nothing are", () => {
  const scroll = (direction: "up" | "down") => planning({ type: "scroll", direction });
  // Down, then back up: each next observation differs from the one before it.
  const downThenUp = steps([DELIVERIES, SCROLLED, DELIVERIES], (step) =>
    scroll(step === 0 ? "down" : "up")(step),
  );
  expect(statesOf(downThenUp).at(-1)).toBe("moving");

  // At the foot of the page a scroll down leaves the page as it was.
  const atTheFoot = steps([SCROLLED, SCROLLED, SCROLLED], scroll("down"));
  expect(statesOf(atTheFoot).slice(-2)).toStrictEqual(["moving", "stuck"]);
  expect(avatarView(atTheFoot).stuckOn).toBe("/deliveries");
});

test("two steps that typed are not stuck, though the page looked the same: the field's value changed", () => {
  const typed = steps(
    [SETTINGS, SETTINGS, SETTINGS],
    planning({ type: "type", ref: "e1", text: "orders" }),
  );
  expect(statesOf(typed).at(-1)).toBe("moving");
  // The same pages with a click each: nothing changed, so stuck.
  const clicked = steps([SETTINGS, SETTINGS, SETTINGS], planning({ type: "click", ref: "e2" }));
  expect(statesOf(clicked).at(-1)).toBe("stuck");
});

test("a step whose next observation differs takes a stuck persona back to moving, once that observation arrives", () => {
  // Vera stuck on /settings at step 5's observation; step 5 clicks through to /deliveries.
  const observed = stuckRun.slice(0, 18);
  const planned = planning({ type: "click", ref: "e1" })(5);
  const landed = atStep(fixtureEvent(8), 5, { urlAfter: "http://localhost:5174/deliveries" });
  const next = atStep(DELIVERIES, 6);
  const events = [...observed, planned, landed, next];
  // Planning and landing judge nothing: only step 6's observation shows what step 5 changed.
  expect(statesOf(events).slice(-4)).toStrictEqual(["stuck", "stuck", "stuck", "moving"]);
  expect(avatarView(events).stuckOn).toBeUndefined();
});

test("a finished run's outcome decides: success is done, budget_exceeded gave up", () => {
  const endedBy = (outcome: string) => [
    ...beforeEnd,
    atStep(finished, finished.stepIndex, { outcome }),
  ];
  expect(avatarState(endedBy("success"))).toBe("done");
  expect(avatarState(endedBy("budget_exceeded"))).toBe("gaveUp");
  expect(avatarState(endedBy("gave_up"))).toBe("gaveUp");
});

test("a crashed run is error, never gave up, even when it was stuck", () => {
  const stuck = stuckRun.slice(0, -1);
  expect(avatarState(stuck)).toBe("stuck");
  expect(avatarView([...stuck, atStep(failed, 5)])).toStrictEqual({
    state: "error",
    stuckOn: undefined,
  });
  // A crash before any step ended.
  expect(avatarState([fixtureEvent(0), fixtureEvent(1), atStep(failed, 0)])).toBe("error");
});

test("the place is the page's path, without its query", () => {
  expect(placeName("http://localhost:5174/settings")).toBe("/settings");
  expect(placeName("https://shop.example/deliveries?page=2")).toBe("/deliveries");
});

test("no events is idle", () => {
  expect(avatarView([])).toStrictEqual({ state: "idle", stuckOn: undefined });
});
