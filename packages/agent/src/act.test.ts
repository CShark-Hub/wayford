import type { Bbox, Viewport } from "@wayford/core";
import { describe, expect, test } from "vitest";
import { actionPoint } from "./act.js";

// The fixtures' desktop viewport.
const VIEWPORT: Viewport = { width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false };

/** A box as `getBoundingClientRect` reports it: its top-left corner in the viewport, its size. */
function box(x: number, y: number, width: number, height: number): Bbox {
  return { x, y, width, height };
}

describe("actionPoint", () => {
  test("a box inside the viewport gives its centre, unrounded", () => {
    expect(actionPoint(box(100.5, 40.25, 81, 25), VIEWPORT)).toStrictEqual({ x: 141, y: 52.75 });
  });

  // One row per bound of the viewport: the right, the bottom, then the left and the top at once.
  test.each([
    ["right edge", box(1200, 300, 200, 40), { x: 1240, y: 320 }],
    ["bottom edge", box(100, 780, 80, 60), { x: 140, y: 790 }],
    ["top-left corner", box(-40, -10, 100, 30), { x: 30, y: 10 }],
  ] as const)(
    "a box straddling the %s gives the centre of its part inside the viewport",
    (_where, bbox, point) => {
      expect(actionPoint(bbox, VIEWPORT)).toStrictEqual(point);
    },
  );

  // The last whole pixel is 1279, 799: the viewport is [0, 1280) x [0, 800).
  test.each([
    ["beyond the bottom-right corner", box(1300, 900, 100, 50), { x: 1279, y: 799 }],
    ["beyond the top-left corner", box(-200, -100, 50, 20), { x: 0, y: 0 }],
    ["below the fold", box(100, 820, 80, 30), { x: 140, y: 799 }],
  ] as const)(
    "a box wholly %s gives its centre clamped into the viewport",
    (_where, bbox, point) => {
      expect(actionPoint(bbox, VIEWPORT)).toStrictEqual(point);
    },
  );
});
