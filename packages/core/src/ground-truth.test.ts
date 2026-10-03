import { describe, expect, test } from "vitest";
import { groundTruthFixture, taskFixtures } from "./fixtures/index.js";
import { GroundTruth, groundTruthOf, ScoutAttempt } from "./ground-truth.js";
import type { RunOutcome } from "./run.js";

/** A deep copy of the fixture to break one rule on. */
function copy(): GroundTruth {
  return structuredClone(groundTruthFixture);
}

/** The messages of every issue a ground truth fails with. */
function issues(value: unknown): string[] {
  const parsed = GroundTruth.safeParse(value);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
}

/** The fixture's attempt at `index`, which a test knows is there. */
function attempt(truth: GroundTruth, index: number): ScoutAttempt {
  const found = truth.attempts[index];
  if (found === undefined) throw new Error(`the fixture has no attempt ${index}`);
  return found;
}

/** The fixture with no attempt reached, its attempts ending as `outcomes` say. */
function unreached(outcomes: Exclude<RunOutcome, "success">[]): GroundTruth {
  const { shortest: _shortest, target: _target, ...truth } = copy();
  return {
    ...truth,
    reached: false,
    attempts: truth.attempts.map(({ runId }, i) => ({ runId, outcome: outcomes[i] ?? "gave_up" })),
  };
}

const SHORTEST =
  "shortest must be the first successful attempt with the fewest steps, with its path";
const TARGET = "target must be the last element the shortest path acted on, with its page";

describe("groundTruthOf", () => {
  test("derives the fixture's reached, shortest and target from its attempts", () => {
    const { reached, shortest, target, attempts } = groundTruthFixture;
    expect(groundTruthOf(attempts)).toStrictEqual({ reached, shortest, target });
  });

  test("a tie goes to the earlier attempt", () => {
    const routeA = attempt(copy(), 1);
    const again = { ...structuredClone(routeA), runId: "run_scout-hard-3" };
    expect(groundTruthOf([routeA, again]).shortest?.runId).toBe(routeA.runId);
  });

  test("no success: not reached, no shortest, no target", () => {
    expect(groundTruthOf(unreached([]).attempts)).toStrictEqual({ reached: false });
  });
});

describe("GroundTruth", () => {
  // Loading the fixture already parses it (`fixtures/index.ts`), so only its task is checked here.
  test("the fixture names a task fixture", () => {
    expect(taskFixtures.map((task) => task.id)).toContain(groundTruthFixture.taskId);
  });

  test("not reached parses when every attempt finished, and is refused when one crashed", () => {
    expect(issues(unreached(["gave_up", "budget_exceeded", "gave_up"]))).toEqual([]);
    expect(issues(unreached(["error", "gave_up", "gave_up"]))).toEqual([
      "a crashed attempt is no evidence that the goal is out of reach; run Scout again",
    ]);
  });

  test("an attempt has a path exactly when it succeeded", () => {
    const succeeded = attempt(copy(), 0);
    expect(ScoutAttempt.safeParse({ ...succeeded, outcome: "gave_up" }).success).toBe(false);
    expect(ScoutAttempt.safeParse({ runId: succeeded.runId, outcome: "success" }).success).toBe(
      false,
    );
  });

  test("reached says whether some attempt succeeded", () => {
    const truth = copy();
    truth.reached = false;
    expect(issues(truth)).toContain("reached must say whether some attempt succeeded");
  });

  test("shortest is the first successful attempt with the fewest steps, with its path", () => {
    const missing = copy();
    delete missing.shortest;
    expect(issues(missing)).toEqual([SHORTEST]);

    // The route B attempt: three steps, against route A's two. The target stays route A's.
    const longer = copy();
    const routeB = attempt(longer, 0);
    longer.shortest = { runId: routeB.runId, path: structuredClone(routeB.path) as never };
    expect(issues(longer)).toEqual([SHORTEST]);

    // Route A twice, and shortest naming the second.
    const tie = copy();
    tie.attempts[2] = { ...structuredClone(attempt(tie, 1)), runId: "run_scout-hard-3" };
    if (tie.shortest) tie.shortest.runId = "run_scout-hard-3";
    expect(issues(tie)).toEqual([SHORTEST]);

    const edited = copy();
    edited.shortest?.path.steps.pop();
    expect(issues(edited)).toContain(SHORTEST);
  });

  test("target is the last element the shortest path acted on, and its page", () => {
    const moved = copy();
    if (moved.target) moved.target.page = "http://localhost:5174/";
    expect(issues(moved)).toEqual([TARGET]);

    const missing = copy();
    delete missing.target;
    expect(issues(missing)).toEqual([TARGET]);
  });
});
