import { describe, expect, test } from "vitest";
import { z } from "zod";
import { WayfordError } from "./error.js";
import { runEventFixtures } from "./fixtures/index.js";
import * as core from "./index.js";
import { type RunEvent, runResultFromEvents } from "./run.js";

/** What `fn` throws. Fails the test when `fn` returns instead. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return expect.unreachable("expected a throw");
}

describe("WayfordError", () => {
  test("keeps the code a caller branches on, the message and the cause", () => {
    const cause = new Error("underneath");
    const error = new WayfordError("some_code", "what went wrong", { cause });
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("some_code");
    expect(error.message).toBe("what went wrong");
    expect(error.cause).toBe(cause);
    expect(String(error)).toBe("WayfordError: what went wrong");
  });

  test("has no cause when none is given", () => {
    expect("cause" in new WayfordError("some_code", "what went wrong")).toBe(false);
  });

  test("is exported from the core barrel", () => {
    expect(core.WayfordError).toBe(WayfordError);
  });
});

describe("runResultFromEvents throws it at the boundary", () => {
  test("for a stream that breaks one of the fold's rules, the plain error on cause", () => {
    const thrown = thrownBy(() => runResultFromEvents([]));
    expect(thrown).toBeInstanceOf(WayfordError);
    expect(thrown).toMatchObject({
      code: "invalid_run_events",
      message: "a run's events must open with runStarted",
    });
    // Exactly an `Error`, not a subclass: that is how the wrapper tells a rejection from a bug.
    const { cause } = thrown as WayfordError;
    expect(Object.getPrototypeOf(cause)).toBe(Error.prototype);
    expect(cause).toHaveProperty("message", "a run's events must open with runStarted");
  });

  test("for a record RunResult rejects, the ZodError on cause", () => {
    const actionless = runEventFixtures.filter(
      (e) => !(e.stepIndex === 0 && (e.type === "actionPlanned" || e.type === "actionPerformed")),
    );
    const thrown = thrownBy(() => runResultFromEvents(actionless));
    expect(thrown).toBeInstanceOf(WayfordError);
    expect(thrown).toMatchObject({
      code: "invalid_run_events",
      message: expect.stringMatching(/step 0 is incomplete but is not the last step/),
      cause: expect.any(z.ZodError),
    });
  });

  test("but lets a bug through as it is, so a defect never reads as bad input", () => {
    // An event that skipped `RunEvent.parse`: the fold trips over the missing
    // observation with a TypeError, the caller's defect, not a rejected stream.
    const unparsed = runEventFixtures.map((e) =>
      e.type === "stepObserved" && e.stepIndex === 0
        ? ({ ...e, observation: undefined } as unknown as RunEvent)
        : e,
    );
    expect(() => runResultFromEvents(unparsed)).toThrow(TypeError);
  });
});
