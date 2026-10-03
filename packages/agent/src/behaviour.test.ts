import type { Action } from "@wayford/core";
import { actionFixtures, profileFixture } from "@wayford/core/fixtures";
import { expect, test } from "vitest";
import { behave } from "./behaviour.js";

// A roll fires strictly below p, so the edges are p itself and the largest numbers under it.
const JUST_UNDER_HALF = 0.5 - 2 ** -54;
const HIGHEST_DRAW = 1 - 2 ** -53;

/** Draws across [0, 1), both ends of it included. */
const DRAWS = [0, JUST_UNDER_HALF, 0.5, HIGHEST_DRAW];

const CLICK: Action = { type: "click", ref: "e3" };

// Core's own test holds the fixtures to one action of every type, so this is every other type.
const NOT_CLICKS = actionFixtures.filter((action) => action.type !== "click");

/**
 * A behaviour stream that hands out `values` in order and counts the draws taken. A draw past the
 * script throws, so a rule that draws when it should not fails the test where it draws.
 */
function scripted(...values: number[]): { draw: () => number; taken: () => number } {
  let taken = 0;
  return {
    draw: () => {
      const value = values[taken];
      if (value === undefined) throw new Error(`draw ${taken + 1} was not scripted`);
      taken += 1;
      return value;
    },
    taken: () => taken,
  };
}

test("p 0.5 does not fire on a draw of exactly 0.5", () => {
  const stream = scripted(0.5);
  expect(behave(CLICK, { doubleClick: 0.5 }, stream.draw)).toStrictEqual({
    performed: CLICK,
    dice: [{ rule: "B1", p: 0.5, rolled: 0.5, fired: false }],
  });
  expect(stream.taken()).toBe(1);
});

test("p 0.5 fires on the largest draw under 0.5", () => {
  const stream = scripted(JUST_UNDER_HALF);
  expect(behave(CLICK, { doubleClick: 0.5 }, stream.draw)).toStrictEqual({
    performed: { type: "doubleClick", ref: "e3" },
    dice: [{ rule: "B1", p: 0.5, rolled: JUST_UNDER_HALF, fired: true }],
  });
  expect(stream.taken()).toBe(1);
});

test("p 0 rolls on every click and never fires, a draw of 0 included", () => {
  // A knob of 0 still rolls, so the log shows B1 was checked; Ada, with no knob, rolls nothing.
  const stream = scripted(...DRAWS);
  for (const rolled of DRAWS) {
    const { performed, dice } = behave(CLICK, { doubleClick: 0 }, stream.draw);
    expect(dice).toStrictEqual([{ rule: "B1", p: 0, rolled, fired: false }]);
    expect(performed).toBe(CLICK);
  }
  expect(stream.taken()).toBe(DRAWS.length);
});

test("p 1 fires on every click, the highest draw included, and leaves the proposed click as it was", () => {
  const stream = scripted(...DRAWS);
  for (const rolled of DRAWS) {
    const { performed, dice } = behave(CLICK, { doubleClick: 1 }, stream.draw);
    expect(dice).toStrictEqual([{ rule: "B1", p: 1, rolled, fired: true }]);
    expect(performed).toStrictEqual({ type: "doubleClick", ref: "e3" });
  }
  expect(stream.taken()).toBe(DRAWS.length);
  // The loop logs the proposed action next to the performed one, and the history reads it.
  expect(CLICK).toStrictEqual({ type: "click", ref: "e3" });
});

test.each(NOT_CLICKS)("a proposed $type takes no draw and rolls nothing", (proposed) => {
  // p 1 fires on any draw, so only the action's type keeps B1 from rolling.
  const stream = scripted();
  const behaved = behave(proposed, { doubleClick: 1 }, stream.draw);
  expect(behaved.performed).toBe(proposed);
  expect(behaved.dice).toStrictEqual([]);
  expect(stream.taken()).toBe(0);
});

test("a profile without doubleClick takes no draw on a click and rolls nothing", () => {
  // A rule that does not apply logs nothing (`docs/RULES.md`, stage 7). Ada sets no B1 knob.
  const { behaviour } = profileFixture("prof_ada");
  expect(behaviour.doubleClick).toBeUndefined();
  const stream = scripted();
  const behaved = behave(CLICK, behaviour, stream.draw);
  expect(behaved.performed).toBe(CLICK);
  expect(behaved.dice).toStrictEqual([]);
  expect(stream.taken()).toBe(0);
});
