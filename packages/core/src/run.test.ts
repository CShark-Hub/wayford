import { describe, expect, test } from "vitest";
import { runEventFixtures, runResultFixture, taskFixtures } from "./fixtures/index.js";
import {
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

  test("startUrl is required on runStarted and on RunResult", () => {
    const started = runEventFixtures[0];
    if (started?.type !== "runStarted")
      throw new Error("the fixture stream must open with runStarted");
    const { startUrl: _eventUrl, ...startedWithout } = started;
    const { startUrl: _resultUrl, ...resultWithout } = runResultFixture;
    expect(RunEvent.safeParse(startedWithout).success).toBe(false);
    expect(RunResult.safeParse(resultWithout).success).toBe(false);
  });

  test("startUrl must be an http(s) URL", () => {
    const started = runEventFixtures[0];
    if (started?.type !== "runStarted")
      throw new Error("the fixture stream must open with runStarted");
    expect(RunEvent.safeParse({ ...started, startUrl: "localhost:5174" }).success).toBe(false);
    expect(RunEvent.safeParse({ ...started, startUrl: "http:///account" }).success).toBe(false);
    expect(RunResult.safeParse({ ...runResultFixture, startUrl: "localhost:5174" }).success).toBe(
      false,
    );
  });

  test("a step's diceRoll is a probability when present", () => {
    const withRoll = runResultFixture.steps.find((s) => s.diceRoll !== undefined);
    expect(withRoll).toBeDefined();
    expect(withRoll?.diceRoll).toBeGreaterThanOrEqual(0);
    expect(withRoll?.diceRoll).toBeLessThanOrEqual(1);
    const bad = { ...(withRoll as RunStep), diceRoll: 1.5 };
    expect(RunStep.safeParse(bad).success).toBe(false);
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

  test("the start URL is the goto URL, all three target parameters included", () => {
    expect(runResultFixture.startUrl).toBe(
      "http://localhost:5174/?contrast=2&fontPx=16&targetPx=36",
    );
    // Not a task's bare start URL: the harness appends the run's parameters.
    expect(taskFixtures.map((t) => t.startUrl)).not.toContain(runResultFixture.startUrl);
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

  test("carries startUrl from runStarted, not from the first observation", () => {
    const started = runEventFixtures[0];
    if (started?.type !== "runStarted")
      throw new Error("the fixture stream must open with runStarted");
    const result = runResultFromEvents(runEventFixtures);
    expect(result.startUrl).toBe(started.startUrl);
    // The first observation's URL is page.url(), with the parameters stripped.
    expect(result.startUrl).not.toBe(result.steps[0]?.urlBefore);
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
    if (started?.type !== "runStarted")
      throw new Error("the fixture stream must open with runStarted");
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
    expect(result.startUrl).toBe(started.startUrl);
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
