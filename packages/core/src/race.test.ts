import { expect, test } from "vitest";
import { raceFixture, reportFixture, taskFixture } from "./fixtures/index.js";
import { Race } from "./race.js";

test("the fixture is the hard goal's task whole, and the runs it kept are those its report cites for seed 1", () => {
  expect(raceFixture.task).toStrictEqual(taskFixture("task_past-order"));
  const cited = reportFixture("task_past-order").personas.flatMap(({ profileId, seeds }) =>
    seeds.filter(({ seed }) => seed === 1).map(({ runId }) => ({ id: runId, profileId, seed: 1 })),
  );
  // The fixture is a full one: a stop dropped a run before it started, so no report cites it.
  const dropped = new Set(raceFixture.cancelled?.dequeued);
  expect(dropped.size).toBeGreaterThan(0);
  expect(raceFixture.runs.filter(({ id }) => !dropped.has(id))).toStrictEqual(cited);
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

test("a stop record is accepted, and a race without one still parses", () => {
  // A race stored before #6, or one nobody stopped, carries none.
  const { cancelled: _cancelled, ...unstopped } = raceFixture;
  const ids = raceFixture.runs.map(({ id }) => id);
  // A stop drops the tail of the queue, which can end mid-seed.
  const lastTwo = { at: "2026-09-22T10:00:20.000Z", dequeued: ids.slice(-2) };
  for (const right of [unstopped, raceFixture, { ...raceFixture, cancelled: lastTwo }]) {
    const label = "cancelled" in right ? JSON.stringify(right.cancelled) : "no stop";
    expect(Race.safeParse(right).success, label).toBe(true);
  }
});

test("a stop naming a run outside the race, a run twice or none, with an extra key, or at no datetime is refused", () => {
  const [dropped] = raceFixture.cancelled?.dequeued ?? [];
  const at = "2026-09-22T10:00:20.000Z";
  for (const cancelled of [
    { at, dequeued: ["run_zoya-past-order-1"] },
    { at, dequeued: [dropped, dropped] },
    { at, dequeued: [] },
    // The stop's answer counts the runs under way it ends; the record keeps none of that.
    { at, dequeued: [dropped], stopped: 0 },
    { at: "yesterday", dequeued: [dropped] },
  ]) {
    const wrong = { ...raceFixture, cancelled };
    expect(Race.safeParse(wrong).success, JSON.stringify(cancelled)).toBe(false);
  }
});
