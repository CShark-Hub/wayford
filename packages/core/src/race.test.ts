import { expect, test } from "vitest";
import { raceFixture, reportFixture, taskFixture } from "./fixtures/index.js";
import { Race } from "./race.js";

test("the fixture is the hard goal's task whole, with the runs its report cites for seed 1", () => {
  expect(raceFixture.task).toStrictEqual(taskFixture("task_past-order"));
  const cited = reportFixture("task_past-order").personas.flatMap(({ profileId, seeds }) =>
    seeds.filter(({ seed }) => seed === 1).map(({ runId }) => ({ id: runId, profileId, seed: 1 })),
  );
  expect(raceFixture.runs).toStrictEqual(cited);
});

test("a race of no run, one with a status, or a run with more than its receipt is refused", () => {
  const [first] = raceFixture.runs;
  for (const wrong of [
    { ...raceFixture, runs: [] },
    // Whether a race runs is the runner's to say at read time, never stored.
    { ...raceFixture, status: "running" },
    { ...raceFixture, runs: [{ ...first, outcome: "success" }] },
    { ...raceFixture, id: "run_past-order" },
    { ...raceFixture, startedAt: "yesterday" },
  ]) {
    expect(Race.safeParse(wrong).success, JSON.stringify(wrong).slice(0, 60)).toBe(false);
  }
});
