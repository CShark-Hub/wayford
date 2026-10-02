import { expect, test } from "vitest";
import { filterRuns, type RunFilter, RunsSearch } from "./filter.js";
import { fixtureRuns } from "./fixture-runs.js";

/** The ids of the runs `filter` keeps from the fixture list. */
function idsKept(filter: RunFilter): string[] {
  return filterRuns(fixtureRuns, filter).map((run) => run.id);
}

test("no key keeps every run, in the order given", () => {
  expect(filterRuns(fixtureRuns, {})).toStrictEqual(fixtureRuns);
  expect(filterRuns(fixtureRuns, RunsSearch.parse({}))).toStrictEqual(fixtureRuns);
});

test("taskId alone keeps that task's runs", () => {
  expect(idsKept({ taskId: "task_next-parcel" })).toStrictEqual([
    "run_ada-easy-1",
    "run_ada-easy-2",
    "run_ada-easy-3",
    "run_milo-easy-1",
    "run_milo-easy-2",
    "run_vera-easy-1",
    "run_vera-easy-2",
    "run_vera-easy-3",
    "run_zoya-easy-1",
    "run_guest-easy-1",
  ]);
});

test("profileId alone keeps that persona's runs, on every task", () => {
  expect(idsKept({ profileId: "prof_vera" })).toStrictEqual([
    "run_vera-hard-1",
    "run_vera-hard-2",
    "run_vera-hard-3",
    "run_vera-easy-1",
    "run_vera-easy-2",
    "run_vera-easy-3",
  ]);
  // A persona that is not bundled is a filter like any other.
  expect(idsKept({ profileId: "prof_guest" })).toStrictEqual([
    "run_guest-hard-1",
    "run_guest-hard-2",
    "run_guest-easy-1",
  ]);
});

test("outcome alone keeps the runs that ended that way", () => {
  expect(idsKept({ outcome: "error" })).toStrictEqual([
    "run_ada-hard-5",
    "run_milo-hard-1",
    "run_milo-hard-2",
    "run_zoya-hard-2",
    "run_milo-easy-2",
  ]);
  expect(idsKept({ outcome: "budget_exceeded" })).toStrictEqual([
    "run_vera-hard-3",
    "run_zoya-hard-1",
  ]);
});

test("every key at once keeps the runs matching all of them", () => {
  expect(
    idsKept({ taskId: "task_past-order", profileId: "prof_vera", outcome: "gave_up" }),
  ).toStrictEqual(["run_vera-hard-1", "run_vera-hard-2"]);
  // Each key matches some run, but no run matches all three.
  expect(
    idsKept({ taskId: "task_next-parcel", profileId: "prof_zoya", outcome: "error" }),
  ).toStrictEqual([]);
});

test("a present but invalid key comes back as undefined and overrides the raw query", () => {
  // TanStack merges a route's validated search over the raw query: a key the parse left out would
  // let its raw value through. Every key comes back, so the merge keeps none.
  const query = { taskId: "past-order", profileId: 42, outcome: "lost" };
  expect({ ...query, ...RunsSearch.parse(query) }).toStrictEqual({
    taskId: undefined,
    profileId: undefined,
    outcome: undefined,
  });
  // Each key falls back on its own: an uppercase id is no `ProfileId`, the task stays.
  expect(RunsSearch.parse({ taskId: "task_past-order", profileId: "prof_VERA" })).toStrictEqual({
    taskId: "task_past-order",
    profileId: undefined,
  });
  // So a broken link lists every run.
  expect(filterRuns(fixtureRuns, RunsSearch.parse(query))).toStrictEqual(fixtureRuns);
});
