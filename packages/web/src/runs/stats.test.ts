import { profileFixtures } from "@wayford/core/fixtures";
import { expect, test } from "vitest";
import { filterRuns } from "./filter.js";
import { fixtureRuns } from "./fixture-runs.js";
import { median, type PersonaStats, type TaskStats, taskStats } from "./stats.js";

/** Fixture order, Ada to Zoya, as the screen passes `bundledProfiles`. */
const personaOrder = profileFixtures.map((profile) => profile.id);

/** The stats of one task over the fixture list, in fixture persona order. */
function statsOf(taskId: string): TaskStats {
  const stats = taskStats(fixtureRuns, personaOrder).find((task) => task.taskId === taskId);
  if (stats === undefined) throw new Error(`no stats for ${taskId}`);
  return stats;
}

/** One persona's stats on one task. */
function personaOn(taskId: string, profileId: string): PersonaStats {
  const stats = statsOf(taskId).personas.find((persona) => persona.profileId === profileId);
  if (stats === undefined) throw new Error(`no stats for ${profileId} on ${taskId}`);
  return stats;
}

test("median of an odd count is the middle value, sorted first", () => {
  expect(median([30, 10, 20])).toBe(20);
  expect(median([7])).toBe(7);
});

test("median of an even count is the mean of the two middle values", () => {
  expect(median([4, 1, 3, 2])).toBe(2.5);
  expect(median([18_000, 12_000])).toBe(15_000);
});

test("median of nothing is undefined", () => {
  expect(median([])).toBeUndefined();
});

test("one entry per task, by task id, each persona with its numbers", () => {
  // Every number below can be checked by hand against the rows of fixture-runs.ts. Milo's hard
  // runs all errored, so he has no rate and no median; Vera's never arrived, a rate of 0 and no
  // median; prof_guest, not bundled, comes after every bundled persona.
  expect(taskStats(fixtureRuns, personaOrder)).toStrictEqual([
    {
      taskId: "task_next-parcel",
      personas: [
        stats("prof_ada", 3, 0, 3, 1, 6_000),
        stats("prof_milo", 2, 1, 1, 1, 9_000),
        stats("prof_vera", 3, 0, 2, 2 / 3, 12_000),
        stats("prof_zoya", 1, 0, 1, 1, 11_000),
        stats("prof_guest", 1, 0, 0, 0, undefined),
      ],
    },
    {
      taskId: "task_past-order",
      personas: [
        stats("prof_ada", 5, 1, 3, 3 / 4, 20_000),
        stats("prof_milo", 2, 2, 0, undefined, undefined),
        stats("prof_vera", 3, 0, 0, 0, undefined),
        stats("prof_zoya", 2, 1, 0, 0, undefined),
        stats("prof_guest", 2, 0, 2, 1, 15_000),
      ],
    },
  ]);
});

test("the success rate leaves error runs out", () => {
  // Ada on the hard goal: 3 successes in 5 runs, one of them an error. 3/4, not 3/5.
  expect(personaOn("task_past-order", "prof_ada").successRate).toBe(0.75);
  // Milo on the easy goal: 1 success, 1 error. 1/1, not 1/2.
  expect(personaOn("task_next-parcel", "prof_milo").successRate).toBe(1);
});

test("the median time is over successful runs only", () => {
  // Ada's hard runs last 10, 20, 30, 90 and 95 s: 30 s over all of them, 20 s over the successes.
  expect(personaOn("task_past-order", "prof_ada").medianSuccessMs).toBe(20_000);
  // Vera's easy successes, 14 and 10 s, an even count, around a 25 s give-up.
  expect(personaOn("task_next-parcel", "prof_vera").medianSuccessMs).toBe(12_000);
});

test("the ids in personaOrder come first in that order, then every other id, sorted", () => {
  const order = ["prof_zoya", "prof_vera"];
  for (const task of taskStats(fixtureRuns, order)) {
    expect(task.personas.map((persona) => persona.profileId)).toStrictEqual([
      "prof_zoya",
      "prof_vera",
      "prof_ada",
      "prof_guest",
      "prof_milo",
    ]);
  }
});

test("a persona with no runs on a task has no entry, and a task with no runs neither", () => {
  const vera = filterRuns(fixtureRuns, { profileId: "prof_vera" });
  expect(
    taskStats(vera, personaOrder).map((task) => task.personas.map((p) => p.profileId)),
  ).toStrictEqual([["prof_vera"], ["prof_vera"]]);
  const hard = filterRuns(fixtureRuns, { taskId: "task_past-order" });
  expect(taskStats(hard, personaOrder).map((task) => task.taskId)).toStrictEqual([
    "task_past-order",
  ]);
  expect(taskStats([], personaOrder)).toStrictEqual([]);
});

/** A `PersonaStats`, written as one row. */
function stats(
  profileId: string,
  runs: number,
  errors: number,
  successes: number,
  successRate: number | undefined,
  medianSuccessMs: number | undefined,
): PersonaStats {
  return { profileId, runs, errors, successes, successRate, medianSuccessMs };
}
