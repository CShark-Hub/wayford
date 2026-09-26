import { describe, expect, test } from "vitest";
import { runEventFixtures, runResultFixture } from "./fixtures/index.js";
import {
  type FinishedOutcome,
  RUN_EVENT_TYPES,
  RUN_OUTCOMES,
  RunEvent,
  RunResult,
  RunStep,
  runResultFromEvents,
} from "./run.js";

describe("RunResult and RunEvent schemas", () => {
  test("the fixtures validate", () => {
    expect(RunResult.safeParse(runResultFixture).success).toBe(true);
    expect(RunEvent.array().safeParse(runEventFixtures).success).toBe(true);
  });

  test("RunEvent is a closed union: an unknown type is rejected", () => {
    expect(
      RunEvent.safeParse({
        type: "stepSkipped",
        runId: "run_x",
        stepIndex: 0,
        timestamp: "2026-09-22T10:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  test("every event carries runId, stepIndex and timestamp", () => {
    for (const event of runEventFixtures) {
      expect(typeof event.runId).toBe("string");
      expect(Number.isInteger(event.stepIndex)).toBe(true);
      expect(() => new Date(event.timestamp).toISOString()).not.toThrow();
    }
  });

  test("runFailed's outcome is error, distinct from gave_up", () => {
    // gave_up is a finished outcome; runFailed does not accept it.
    expect(
      RunEvent.safeParse({
        type: "runFailed",
        runId: "run_x",
        stepIndex: 0,
        timestamp: "2026-09-22T10:00:00.000Z",
        error: "target closed the page",
        durationMs: 10,
        cost: { tokensIn: 0, tokensOut: 0, usd: 0 },
      }).success,
    ).toBe(true);
    expect(RUN_OUTCOMES).toContain("error");
    expect(RUN_OUTCOMES).toContain("gave_up");
  });

  test("runFinished accepts only a finished outcome, never error", () => {
    const base = {
      type: "runFinished" as const,
      runId: "run_x",
      stepIndex: 0,
      timestamp: "2026-09-22T10:00:00.000Z",
      durationMs: 10,
      cost: { tokensIn: 0, tokensOut: 0, usd: 0 },
    };
    expect(RunEvent.safeParse({ ...base, outcome: "gave_up" }).success).toBe(true);
    expect(RunEvent.safeParse({ ...base, outcome: "error" }).success).toBe(false);
  });

  test("an extra key on an event is rejected", () => {
    expect(
      RunEvent.safeParse({
        type: "narration",
        runId: "run_x",
        stepIndex: 0,
        timestamp: "2026-09-22T10:00:00.000Z",
        text: "hi",
        mood: "cheerful",
      }).success,
    ).toBe(false);
  });

  test("a step's diceRoll is a probability when present", () => {
    const withRoll = runResultFixture.steps.find((s) => s.diceRoll !== undefined);
    expect(withRoll).toBeDefined();
    expect(withRoll?.diceRoll).toBeGreaterThanOrEqual(0);
    expect(withRoll?.diceRoll).toBeLessThanOrEqual(1);
    const bad = { ...(withRoll as RunStep), diceRoll: 1.5 };
    expect(RunStep.safeParse(bad).success).toBe(false);
  });

  test("RunStep accepts an incomplete step and rejects a silent partial", () => {
    const step = runResultFixture.steps[0];
    if (!step) throw new Error("the fixture run must have a first step");
    const { action: _action, urlAfter: _urlAfter, ...partial } = step;
    expect(RunStep.safeParse({ ...partial, incomplete: true }).success).toBe(true);
    expect(RunStep.safeParse(partial).success).toBe(false);
    expect(RunStep.safeParse({ ...partial, incomplete: false }).success).toBe(false);
  });

  test("RunResult allows an incomplete step only last, and only on error or budget_exceeded", () => {
    const makeIncomplete = (i: number) =>
      runResultFixture.steps.map((s, j) => {
        if (j !== i) return s;
        const { action: _action, urlAfter: _urlAfter, ...partial } = s;
        return { ...partial, incomplete: true };
      });
    const last = runResultFixture.steps.length - 1;

    const notLast = RunResult.safeParse({
      ...runResultFixture,
      outcome: "error",
      steps: makeIncomplete(0),
    });
    expect(notLast.success).toBe(false);
    expect(notLast.error?.issues[0]?.path).toEqual(["steps", 0]);

    const lastSteps = makeIncomplete(last);
    expect(RunResult.safeParse({ ...runResultFixture, steps: lastSteps }).success).toBe(false);
    for (const outcome of ["error", "budget_exceeded"] as const) {
      expect(RunResult.safeParse({ ...runResultFixture, outcome, steps: lastSteps }).success).toBe(
        true,
      );
    }

    const unplanned = runResultFixture.steps.map((s, j) => {
      if (j !== last) return s;
      const { action: _action, ...partial } = s;
      return { ...partial, incomplete: true };
    });
    const landedUnplanned = RunResult.safeParse({
      ...runResultFixture,
      outcome: "error",
      steps: unplanned,
    });
    expect(landedUnplanned.success).toBe(false);
    expect(landedUnplanned.error?.issues[0]?.message).toMatch(/never planned/);
  });

  test("giveUp still emits actionPerformed", () => {
    const planned = runEventFixtures.find(
      (e) => e.type === "actionPlanned" && e.action.type === "giveUp",
    );
    if (!planned) throw new Error("the fixture stream must give up");
    expect(
      runEventFixtures.some(
        (e) => e.type === "actionPerformed" && e.stepIndex === planned.stepIndex,
      ),
    ).toBe(true);
    const lastStep = runResultFromEvents(runEventFixtures).steps.at(-1);
    expect(lastStep && "incomplete" in lastStep).toBe(false);
    expect(lastStep?.action?.type).toBe("giveUp");
  });
});

describe("the fixture run", () => {
  test("has at least four steps and gives up", () => {
    expect(runResultFixture.steps.length).toBeGreaterThanOrEqual(4);
    expect(runResultFixture.outcome).toBe("gave_up");
  });

  test("the stored steps keep the full evidence, hidden elements and all", () => {
    // Step 1 saw an element the filter removed; the Actor never did.
    const step = runResultFixture.steps[1];
    if (!step) throw new Error("the fixture run must have a second step");
    const invisible = step.fullObservation.elements.filter((e) => e.state === "invisible");
    expect(invisible.length).toBeGreaterThan(0);
    expect(step.actorObservationText).not.toContain(invisible[0]?.name ?? "");
  });

  test("serializes to JSON well under 200 KB", () => {
    const bytes = Buffer.byteLength(JSON.stringify(runResultFixture), "utf8");
    expect(bytes).toBeLessThan(200_000);
  });
});

describe("runResultFromEvents", () => {
  test("replaying the fixture events yields the fixture result", () => {
    expect(runResultFromEvents(runEventFixtures)).toEqual(runResultFixture);
  });

  test("is pure: replaying twice yields equal, independent results", () => {
    const a = runResultFromEvents(runEventFixtures);
    const b = runResultFromEvents(runEventFixtures);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  test("recomputes each step's Actor-facing text from the evidence", () => {
    // The reducer never trusts a text off the wire; it projects the full
    // observation itself, so the stored text cannot drift from the filter.
    const result = runResultFromEvents(runEventFixtures);
    for (const step of result.steps) {
      expect(step.actorObservationText).toContain(`URL: ${step.fullObservation.url}`);
    }
  });

  test("a stream must open with runStarted", () => {
    const withoutStart = runEventFixtures.slice(1);
    expect(() => runResultFromEvents(withoutStart)).toThrow(/runStarted/);
  });

  test("a stream must end with a terminal event", () => {
    const withoutEnd = runEventFixtures.filter(
      (e) => e.type !== "runFinished" && e.type !== "runFailed",
    );
    expect(() => runResultFromEvents(withoutEnd)).toThrow(/runFinished or runFailed/);
  });

  test("a runFailed stream reduces to outcome error", () => {
    const started = runEventFixtures[0];
    if (!started) throw new Error("the fixture stream must have a runStarted");
    const failed: RunEvent[] = [
      started,
      {
        type: "runFailed",
        runId: "run_vera-hard-1",
        stepIndex: 0,
        timestamp: "2026-09-22T10:00:01.000Z",
        error: "browser context crashed",
        durationMs: 900,
        cost: { tokensIn: 10, tokensOut: 0, usd: 0.0001 },
      },
    ];
    const result = runResultFromEvents(failed);
    expect(result.outcome).toBe("error");
    expect(result.steps).toHaveLength(0);
  });

  test("RUN_EVENT_TYPES lists exactly the union members", () => {
    // A guard so a new event kind cannot be added to one without the other.
    expect([...RUN_EVENT_TYPES].sort()).toEqual(
      [
        "actionPerformed",
        "actionPlanned",
        "narration",
        "runFailed",
        "runFinished",
        "runStarted",
        "stepObserved",
      ].sort(),
    );
  });
});

describe("a run that stops mid-step", () => {
  const started = runEventFixtures[0];
  if (started?.type !== "runStarted")
    throw new Error("the fixture stream must open with runStarted");
  const stepEvents = (i: number) =>
    runEventFixtures.filter(
      (e) =>
        e.stepIndex === i &&
        e.type !== "runStarted" &&
        e.type !== "runFinished" &&
        e.type !== "runFailed",
    );
  const observed = (i: number) => stepEvents(i).filter((e) => e.type === "stepObserved");
  const upToPlanned = (i: number) => stepEvents(i).filter((e) => e.type !== "actionPerformed");
  const ending = {
    runId: "run_vera-hard-1",
    timestamp: "2026-09-22T10:00:20.000Z",
    durationMs: 20000,
    cost: { tokensIn: 10, tokensOut: 0, usd: 0.0001 },
  };
  const failedAt = (i: number): RunEvent => ({
    ...ending,
    type: "runFailed",
    stepIndex: i,
    error: "llm timeout",
  });
  const finishedAt = (i: number, outcome: FinishedOutcome): RunEvent => ({
    ...ending,
    type: "runFinished",
    stepIndex: i,
    outcome,
  });

  test("runFailed after stepObserved stores the last step as incomplete", () => {
    const result = runResultFromEvents([started, ...observed(0), failedAt(0)]);
    expect(result.outcome).toBe("error");
    expect(result.steps).toHaveLength(1);
    const step = result.steps[0];
    if (!step || !("incomplete" in step)) throw new Error("step 0 must be incomplete");
    expect(step.incomplete).toBe(true);
    expect(step.action).toBeUndefined();
    expect(step.urlAfter).toBeUndefined();
    expect(step.urlBefore).toBe(step.fullObservation.url);
    expect(step.actorObservationText).toContain(`URL: ${step.fullObservation.url}`);
  });

  test("budget_exceeded after stepObserved stores the last step as incomplete", () => {
    const result = runResultFromEvents([
      started,
      ...stepEvents(0),
      ...observed(1),
      finishedAt(1, "budget_exceeded"),
    ]);
    expect(result.outcome).toBe("budget_exceeded");
    expect(result.steps).toHaveLength(2);
    const [first, last] = result.steps;
    expect(first && "incomplete" in first).toBe(false);
    if (!last || !("incomplete" in last)) throw new Error("step 1 must be incomplete");
    expect(last.action).toBeUndefined();
  });

  test("an action planned but never performed is kept on the incomplete step", () => {
    const planned = stepEvents(2).find((e) => e.type === "actionPlanned");
    if (planned?.type !== "actionPlanned" || planned.diceRoll === undefined) {
      throw new Error("fixture step 2 must plan an action with a dice roll");
    }
    const result = runResultFromEvents([
      started,
      ...stepEvents(0),
      ...stepEvents(1),
      ...upToPlanned(2),
      failedAt(2),
    ]);
    const step = result.steps.at(-1);
    if (!step || !("incomplete" in step)) throw new Error("step 2 must be incomplete");
    expect(step.action).toEqual(planned.action);
    expect(step.diceRoll).toBe(planned.diceRoll);
    expect(step.urlAfter).toBeUndefined();
  });

  test("an incomplete step that is not the last one throws", () => {
    expect(() =>
      runResultFromEvents([started, ...observed(0), ...stepEvents(1), failedAt(1)]),
    ).toThrow(/step 0 is incomplete but is not the last step/);
  });

  test.each(["gave_up", "success"] as const)(
    "an incomplete last step under %s throws",
    (outcome) => {
      expect(() => runResultFromEvents([started, ...observed(0), finishedAt(0, outcome)])).toThrow(
        /is incomplete but the run ended/,
      );
    },
  );

  test("a complete last step under runFailed stays complete", () => {
    const events = [...runEventFixtures.filter((e) => e.type !== "runFinished"), failedAt(3)];
    const result = runResultFromEvents(events);
    expect(result.outcome).toBe("error");
    expect(result.steps).toHaveLength(4);
    for (const step of result.steps) expect("incomplete" in step).toBe(false);
  });

  test("a step without an observation still throws, even last under runFailed", () => {
    const narration = stepEvents(0).filter((e) => e.type === "narration");
    expect(() => runResultFromEvents([started, ...narration, failedAt(0)])).toThrow(
      /missing an observation/,
    );
  });

  test("an action performed but never planned throws, even last under runFailed", () => {
    const noPlan = stepEvents(0).filter((e) => e.type !== "actionPlanned");
    expect(() => runResultFromEvents([started, ...noPlan, failedAt(0)])).toThrow(
      /step 0 performed an action it never planned/,
    );
  });
});
