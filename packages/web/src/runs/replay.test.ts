import { ACTION_TYPES, RunResult, type RunStep } from "@wayford/core";
import { actionFixtures, runResultFixture } from "@wayford/core/fixtures";
import { expect, test } from "vitest";
import { fixtureStep } from "./fixture-runs.js";
import { describeAction, observedFrom, RunDetailSearch } from "./replay.js";

/** A complete step with a screenshot: the fixture's step 0, a click. */
const landed = fixtureStep(0);
/** A wasted step: the fixture's step 3, two refused answers and no screenshot. */
const wasted = fixtureStep(3);
/** The fixture's last step, the give-up. */
const gaveUp = fixtureStep(4);

/** `step` at another `stepIndex`. */
function at(step: RunStep, stepIndex: number): RunStep {
  return { ...step, stepIndex };
}

/** `step` without its screenshot, as a step whose capture failed is stored. */
function withoutScreenshot(step: RunStep): RunStep {
  const { screenshotPath: _, ...rest } = step;
  return rest;
}

/** A run of `steps`, parsed, so every constructed run below is one a store could hold. */
function runOf(id: string, steps: RunStep[]): RunResult {
  return RunResult.parse({ ...runResultFixture, id, steps });
}

/** The `stepIndex` of `observedFrom` for each of `indices`. */
function observedFor(run: RunResult, indices: number[]): (number | undefined)[] {
  return indices.map((stepIndex) => observedFrom(run.steps, stepIndex)?.stepIndex);
}

test("a step that is no StepIndex comes back as undefined", () => {
  for (const step of [-1, 1.5, "two", null]) {
    expect(RunDetailSearch.parse({ step }), String(step)).toStrictEqual({ step: undefined });
  }
});

test("on the fixture run, each step observed the page the latest earlier step that ran left", () => {
  // Step 0 observed the start page, which no step's action left. Step 3 is wasted, so step 4
  // observed the page step 2 left, as step 3 did.
  expect(observedFor(runResultFixture, [0, 1, 2, 3, 4])).toStrictEqual([undefined, 0, 1, 2, 2]);
});

test("after wasted steps from the start, no step's screenshot shows the observed page", () => {
  const run = runOf("run_wasted-start", [
    at(wasted, 0),
    at(wasted, 1),
    at(landed, 2),
    at(gaveUp, 3),
  ]);
  expect(observedFor(run, [0, 1, 2, 3])).toStrictEqual([undefined, undefined, undefined, 2]);
});

test("the latest earlier step that ran is the one, even when it has no screenshot", () => {
  // Step 1's action changed the page and kept no picture of it, so step 0's screenshot would show
  // the wrong page: steps 2 and 3 observed what step 1 left, of which there is no picture.
  const run = runOf("run_no-screenshot", [
    at(landed, 0),
    at(withoutScreenshot(landed), 1),
    at(wasted, 2),
    at(gaveUp, 3),
  ]);
  expect(observedFor(run, [0, 1, 2, 3])).toStrictEqual([undefined, 0, 1, 1]);
  expect(observedFrom(run.steps, 3)?.screenshotPath).toBeUndefined();
});

test("steps are found by stepIndex, never by array position", () => {
  // A gap in the indices, and the steps stored out of order.
  const steps = [at(landed, 0), at(landed, 2), at(gaveUp, 5)];
  expect(observedFrom(steps, 5)?.stepIndex).toBe(2);
  expect(observedFrom(steps, 2)?.stepIndex).toBe(0);
  expect(observedFrom(steps.toReversed(), 5)?.stepIndex).toBe(2);
  expect(observedFrom(runResultFixture.steps.toReversed(), 4)?.stepIndex).toBe(2);
});

test("describeAction writes every action type on one line", () => {
  // The fixtures hold one action per member of ACTION_TYPES, in that order.
  expect(actionFixtures.map((action) => action.type)).toStrictEqual([...ACTION_TYPES]);
  expect(actionFixtures.map(describeAction)).toStrictEqual([
    "click e2",
    "doubleClick e2",
    'type e5 "archive"',
    "scroll down",
    "back",
    "wait 500 ms",
    "giveUp",
  ]);
});

test("typed text keeps its quotes and line breaks visible", () => {
  expect(describeAction({ type: "type", ref: "e4", text: 'say "hi"\n' })).toBe(
    'type e4 "say \\"hi\\"\\n"',
  );
  expect(describeAction({ type: "type", ref: "e4", text: "" })).toBe('type e4 ""');
});
