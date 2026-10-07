import { Sweep } from "@wayford/core";
import { profileFixture } from "@wayford/core/fixtures";
import { expect, test } from "vitest";
import { BOUNDARY_PRESETS, gridValue, proseValue, rangeLabel, seedsLabel } from "./axis.js";
import { fixtureSweeps } from "./fixture-sweeps.js";

const { vera, kai } = fixtureSweeps;

/** A contrast sweep of Vera stored before its first value, on the range given. */
function contrastGrid(from: number, to: number, step: number): Sweep {
  return Sweep.parse({ ...vera, from, to, step, status: "incomplete", values: [], boundary: null });
}

test("each preset names a bundled persona on its own axis", () => {
  for (const [key, preset] of Object.entries(BOUNDARY_PRESETS)) {
    expect(preset.axis).toBe(key);
    expect(profileFixture(preset.profileId).id).toBe(preset.profileId);
  }
});

test("proseValue writes contrast in its shortest form with :1, and a cap as the integer", () => {
  expect(proseValue("contrast", 3)).toBe("3:1");
  expect(proseValue("contrast", 2.5)).toBe("2.5:1");
  expect(proseValue("contrast", 1.25)).toBe("1.25:1");
  expect(proseValue("maxElements", 10)).toBe("10");
});

test("gridValue writes contrast on the grid's precision, with or without the unit", () => {
  expect(gridValue(vera, 3)).toBe("3.0:1");
  expect(gridValue(vera, 2.5)).toBe("2.5:1");
  expect(gridValue(vera, 3, false)).toBe("3.0");
});

test("gridValue keeps a grid's hundredths on a range given strict end first", () => {
  // 4.5 to 1.25 by 0.25 runs 1.25, 1.5, ..., 4.5: two decimals, whatever end comes first.
  const grid = contrastGrid(4.5, 1.25, 0.25);
  expect(gridValue(grid, 1.25)).toBe("1.25:1");
  expect(gridValue(grid, 1.5)).toBe("1.50:1");
  expect(gridValue(grid, 4.5, false)).toBe("4.50");
});

test("gridValue writes at least one decimal and at most the grid's thousandths", () => {
  expect(gridValue(contrastGrid(1, 4, 1), 2)).toBe("2.0:1");
  expect(gridValue(contrastGrid(1, 1.01, 0.005), 1.005)).toBe("1.005:1");
  expect(gridValue(contrastGrid(1, 1.01, 0.005), 1.01)).toBe("1.010:1");
});

test("gridValue writes a cap as the integer, with or without the unit", () => {
  expect(gridValue(kai, 10)).toBe("10");
  expect(gridValue(kai, 10, false)).toBe("10");
});

test("rangeLabel names the axis and its grid's ends, laxest first", () => {
  expect(rangeLabel(vera)).toBe("contrast 1.5–4.5:1");
  expect(rangeLabel(kai)).toBe("maxElements 16–4");
  expect(rangeLabel(contrastGrid(4.5, 1.25, 0.25))).toBe("contrast 1.25–4.50:1");
});

test("rangeLabel ends at the grid's last value when the far end falls off it", () => {
  expect(rangeLabel(contrastGrid(1.5, 4.4, 0.5))).toBe("contrast 1.5–4.0:1");
});

test("seedsLabel joins seeds that run on, and lists the rest", () => {
  expect(seedsLabel([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe("seeds 1–10");
  expect(seedsLabel([5, 6])).toBe("seeds 5–6");
  expect(seedsLabel([1, 3, 7])).toBe("seeds 1, 3, 7");
  expect(seedsLabel([1, 2, 4])).toBe("seeds 1, 2, 4");
  expect(seedsLabel([3, 2, 1])).toBe("seeds 3, 2, 1");
});

test("seedsLabel of one seed is singular", () => {
  expect(seedsLabel([4])).toBe("seed 4");
});
