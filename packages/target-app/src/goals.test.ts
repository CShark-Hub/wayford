// GOALS mirrors the two tasks in core's fixtures (issue #43). target-app imports nothing from the
// workspace, so this reads core's tasks.json from disk instead of importing it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { GOALS } from "./pages.js";

const tasksFile = fileURLToPath(new URL("../../core/src/fixtures/tasks.json", import.meta.url));
const tasks: { goal: string; success: unknown }[] = JSON.parse(readFileSync(tasksFile, "utf8"));

describe("GOALS", () => {
  test("match core tasks.json: the same sentences, success conditions and order", () => {
    const goals = GOALS.map((goal) => ({
      goal: goal.sentence,
      success: { type: "urlMatches", pattern: goal.pattern },
    }));
    expect(goals).toEqual(tasks.map((task) => ({ goal: task.goal, success: task.success })));
  });
});
