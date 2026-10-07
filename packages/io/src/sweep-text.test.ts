/**
 * How a sweep reads in both printouts (`sweep-text.ts`): the boundary line in each of its three
 * cases, and the route-open share with and without a route table.
 */
import type { SweepValue } from "@wayford/core";
import { expect, test } from "vitest";
import { boundaryLine, routeOpenShare, wallTime } from "./sweep-text.js";

/** One value of a sweep on 10 seeds, with no error and a route table unless told otherwise. */
const row = (value: number, successes: number, more: Partial<SweepValue> = {}): SweepValue => ({
  value,
  runIds: [],
  successes,
  errors: 0,
  routeOpenSeeds: [],
  ...more,
});

test("the boundary line names the first value under 50%, with its rate", () => {
  expect(boundaryLine("contrast", [row(2, 10), row(3, 4)], 10)).toBe("boundary   3.0 (rate 40%)");
});

test("with no value under 50%, there is no boundary up to the last value", () => {
  expect(boundaryLine("maxElements", [row(16, 10), row(14, 5)], 10)).toBe("no boundary up to 14");
});

test("an errored value stops the claim there, even when a later rate falls", () => {
  expect(boundaryLine("contrast", [row(2, 6, { errors: 1 }), row(3, 0)], 10)).toBe(
    "no boundary: 2.0 had errors, so nothing past it is claimed",
  );
});

test("route-open reads '—' for a task with no route table, never 0", () => {
  expect(routeOpenShare(row(2, 0, { routeOpenSeeds: null }), 10)).toBe("—");
  expect(routeOpenShare(row(2, 0, { routeOpenSeeds: [1, 4] }), 10)).toBe("2/10");
  expect(wallTime(126_000)).toBe("2m 06s");
});
