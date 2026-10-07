import type { Sweep, SweepValue } from "@wayford/core";
import { expect, test } from "vitest";
import { fixtureSweeps } from "./fixture-sweeps.js";
import { claimedRows, readSweep, shares } from "./reading.js";

/** The row of `sweep` at `value`. */
function rowAt(sweep: Sweep, value: number): SweepValue {
  const found = sweep.values.find((row) => row.value === value);
  if (found === undefined) throw new Error(`${sweep.id} has no value ${value}`);
  return found;
}

const { vera, kai, noBoundary, stopped, incomplete, noRoutes, empty } = fixtureSweeps;

test("Vera's fixture reads a boundary at 3, the row where 2 of 10 got through", () => {
  expect(readSweep(vera)).toStrictEqual({ kind: "boundary", row: rowAt(vera, 3) });
  expect(rowAt(vera, 3).successes).toBe(2);
});

test("Kai's fixture reads a boundary at 10", () => {
  expect(readSweep(kai)).toStrictEqual({ kind: "boundary", row: rowAt(kai, 10) });
});

test("half or more through at every value, with no error, reads none at the last stored row", () => {
  expect(readSweep(noBoundary)).toStrictEqual({ kind: "none", last: rowAt(noBoundary, 4.5) });
});

test("an error before any value falls under half reads stopped at the first errored row", () => {
  // 4.0 errors too; the walk stops at the first.
  expect(readSweep(stopped)).toStrictEqual({ kind: "stopped", row: rowAt(stopped, 2.5) });
});

test("an incomplete sweep with no stored value reads empty", () => {
  expect(readSweep(empty)).toStrictEqual({ kind: "empty" });
});

test("an incomplete sweep reads its stored values only", () => {
  expect(readSweep(incomplete)).toStrictEqual({ kind: "none", last: rowAt(incomplete, 2.5) });
});

test("claimedRows of a stopped sweep runs up to and including the stopped row", () => {
  expect(claimedRows(stopped, readSweep(stopped)).map((row) => row.value)).toStrictEqual([
    1.5, 2, 2.5,
  ]);
});

test("claimedRows of every other reading is every stored row", () => {
  const all = vera.values.map((row) => row.value);
  expect(claimedRows(vera, readSweep(vera)).map((row) => row.value)).toStrictEqual(all);
  expect(claimedRows(noBoundary, readSweep(noBoundary)).map((row) => row.value)).toStrictEqual(all);
  expect(claimedRows(empty, readSweep(empty))).toStrictEqual([]);
});

test("shares are over the sweep's seeds: got through, and route open", () => {
  expect(shares(vera, rowAt(vera, 3))).toStrictEqual({ through: 2 / 10, routeOpen: 3 / 10 });
});

test("shares read route open as null when the goal has no route table", () => {
  expect(shares(noRoutes, rowAt(noRoutes, 3))).toStrictEqual({ through: 2 / 10, routeOpen: null });
});
