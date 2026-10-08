import { type Action, type Behaviour, type FullObservation, RunEvent } from "@wayford/core";
import { actionFixtures, profileFixture } from "@wayford/core/fixtures";
import { expect, test } from "vitest";
import { type Behaved, type BehaveStep, behave } from "./behaviour.js";
import { missProbability } from "./misclick.js";
import { ADA, link, observe, paragraph, refOf } from "./test-support.js";

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

// ---------------------------------------------------------------------------
// The page a proposal was made on
// ---------------------------------------------------------------------------

// Two 160 × 30 links 13 px apart, as on `/settings/data`, under a note. The target's action point,
// the aim point, is (180, 158), so the link above it is 28 px away.
const NOTE = paragraph("We keep these for six years", { x: 100, y: 70, width: 160, height: 24 });
const ABOVE = link("Contact details", { x: 100, y: 100, width: 160, height: 30 });
const TARGET = link("Fulfilment ledger", { x: 100, y: 143, width: 160, height: 30 });

/** The page of every step below that sets none: e3, `CLICK`'s ref, is the 30 px target. */
const PAGE = observe([NOTE, ABOVE, TARGET]);

/** The step `behave` reads: whether the proposal repeats the last one, and its page. */
function step(repeated = false, page: FullObservation = PAGE): BehaveStep {
  return { repeated, page };
}

/** The motor limit of every B4 test, as on `/settings/data` in `docs/RULES.md`'s example. */
const LIMIT = 44;
const MISCLICK: Pick<Behaviour, "misclick"> = {
  misclick: { threshold: LIMIT, provenance: "folk" },
};

test("p 0.5 does not fire on a draw of exactly 0.5", () => {
  const stream = scripted(0.5);
  expect(behave(CLICK, { doubleClick: 0.5 }, stream.draw, step())).toStrictEqual({
    performed: CLICK,
    dice: [{ rule: "B1", p: 0.5, rolled: 0.5, fired: false }],
  });
  expect(stream.taken()).toBe(1);
});

test("p 0.5 fires on the largest draw under 0.5", () => {
  const stream = scripted(JUST_UNDER_HALF);
  expect(behave(CLICK, { doubleClick: 0.5 }, stream.draw, step())).toStrictEqual({
    performed: { type: "doubleClick", ref: "e3" },
    dice: [{ rule: "B1", p: 0.5, rolled: JUST_UNDER_HALF, fired: true }],
  });
  expect(stream.taken()).toBe(1);
});

test("p 0 rolls on every click and never fires, a draw of 0 included", () => {
  // A knob of 0 still rolls, so the log shows B1 was checked; Ada, with no knob, rolls nothing.
  const stream = scripted(...DRAWS);
  for (const rolled of DRAWS) {
    const { performed, dice } = behave(CLICK, { doubleClick: 0 }, stream.draw, step());
    expect(dice).toStrictEqual([{ rule: "B1", p: 0, rolled, fired: false }]);
    expect(performed).toBe(CLICK);
  }
  expect(stream.taken()).toBe(DRAWS.length);
});

test("p 1 fires on every click, the highest draw included, and leaves the proposed click as it was", () => {
  const stream = scripted(...DRAWS);
  for (const rolled of DRAWS) {
    const { performed, dice } = behave(CLICK, { doubleClick: 1 }, stream.draw, step());
    expect(dice).toStrictEqual([{ rule: "B1", p: 1, rolled, fired: true }]);
    expect(performed).toStrictEqual({ type: "doubleClick", ref: "e3" });
  }
  expect(stream.taken()).toBe(DRAWS.length);
  // The loop logs the proposed action next to the performed one, and the history reads it.
  expect(CLICK).toStrictEqual({ type: "click", ref: "e3" });
});

test.each(NOT_CLICKS)("a proposed $type takes no draw and rolls nothing", (proposed) => {
  // p 1 fires on any draw, so only the action's type keeps B1 from rolling, and B4 too rolls on a
  // click only (core's roll audit): the double click names e2, a 30 px link with the target in reach.
  const stream = scripted();
  const behaved = behave(proposed, { doubleClick: 1, ...MISCLICK }, stream.draw, step());
  expect(behaved.performed).toBe(proposed);
  expect(behaved.dice).toStrictEqual([]);
  expect(stream.taken()).toBe(0);
});

test("a profile without doubleClick or misclick takes no draw on a click on a small target and rolls nothing", () => {
  // A rule that does not apply logs nothing (`docs/RULES.md`, stage 7). Ada sets neither knob, and
  // no persona sets a motor limit yet ("P4 and B4"), so their runs replay their rolls as they did.
  const { behaviour } = ADA;
  expect(behaviour.doubleClick).toBeUndefined();
  expect(behaviour.misclick).toBeUndefined();
  const stream = scripted();
  const behaved = behave(CLICK, behaviour, stream.draw, step());
  expect(behaved.performed).toBe(CLICK);
  expect(behaved.dice).toStrictEqual([]);
  expect(stream.taken()).toBe(0);
});

// ---------------------------------------------------------------------------
// B2: scroll when stuck
// ---------------------------------------------------------------------------

const GIVE_UP: Action = { type: "giveUp" };
const BACK: Action = { type: "back" };
const SCROLL_DOWN: Action = { type: "scroll", direction: "down" };
const SCROLL_UP: Action = { type: "scroll", direction: "up" };

test.each<[string, Action, Pick<Behaviour, "scrollWhenStuck">, boolean, number[], Behaved]>([
  [
    "p 1 on a giveUp scrolls down, the roll fired",
    GIVE_UP,
    { scrollWhenStuck: 1 },
    false,
    [HIGHEST_DRAW],
    { performed: SCROLL_DOWN, dice: [{ rule: "B2", p: 1, rolled: HIGHEST_DRAW, fired: true }] },
  ],
  [
    "p 0 on a giveUp rolls and keeps the giveUp",
    GIVE_UP,
    { scrollWhenStuck: 0 },
    false,
    [0],
    { performed: GIVE_UP, dice: [{ rule: "B2", p: 0, rolled: 0, fired: false }] },
  ],
  [
    "p 1 on a repeat scrolls down",
    BACK,
    { scrollWhenStuck: 1 },
    true,
    [0],
    { performed: SCROLL_DOWN, dice: [{ rule: "B2", p: 1, rolled: 0, fired: true }] },
  ],
  [
    "a repeated scroll up is turned down",
    SCROLL_UP,
    { scrollWhenStuck: 1 },
    true,
    [0],
    { performed: SCROLL_DOWN, dice: [{ rule: "B2", p: 1, rolled: 0, fired: true }] },
  ],
  [
    "a repeated scroll down takes no draw, since a fired roll would change nothing",
    SCROLL_DOWN,
    { scrollWhenStuck: 1 },
    true,
    [],
    { performed: SCROLL_DOWN, dice: [] },
  ],
  ["no knob takes no draw on a repeat", BACK, {}, true, [], { performed: BACK, dice: [] }],
])("%s", (_, proposed, behaviour, repeated, draws, behaved) => {
  const stream = scripted(...draws);
  expect(behave(proposed, behaviour, stream.draw, step(repeated))).toStrictEqual(behaved);
  expect(stream.taken()).toBe(draws.length);
});

test("on a repeated click B1 rolls first; when it fires, B2 does not apply and takes no draw", () => {
  // Zoya sets both knobs. Core's audit holds a fired B1 to a double click, so B2 cannot also fire.
  const { behaviour } = profileFixture("prof_zoya");
  expect(behaviour.doubleClick).toBeDefined();
  expect(behaviour.scrollWhenStuck).toBeDefined();
  const firedB1 = scripted(0);
  expect(
    behave(CLICK, { doubleClick: 1, scrollWhenStuck: 1 }, firedB1.draw, step(true)),
  ).toStrictEqual({
    performed: { type: "doubleClick", ref: "e3" },
    dice: [{ rule: "B1", p: 1, rolled: 0, fired: true }],
  });
  expect(firedB1.taken()).toBe(1);

  // B1 rolled and held: the click is still the Actor's repeat, so B2 takes the next draw.
  const heldB1 = scripted(0.5, 0);
  expect(
    behave(CLICK, { doubleClick: 0, scrollWhenStuck: 1 }, heldB1.draw, step(true)),
  ).toStrictEqual({
    performed: SCROLL_DOWN,
    dice: [
      { rule: "B1", p: 0, rolled: 0.5, fired: false },
      { rule: "B2", p: 1, rolled: 0, fired: true },
    ],
  });
});

// ---------------------------------------------------------------------------
// B4: misclick
// ---------------------------------------------------------------------------

/** B4's p for the 30 px target under 44: RULES' 0.120061. */
const P = missProbability(30, LIMIT);

/** Where a miss on the target lands: the link above it, 28 px from the aim point. */
const NEIGHBOUR = refOf(PAGE, ABOVE.name);

/** A click on the element of `page` named `name`. */
function clickOn(page: FullObservation, name: string): Action {
  return { type: "click", ref: refOf(page, name) };
}

/**
 * `behave` on one step, its result held to core's roll audit as the loop emits it: an
 * `actionPlanned` event that `RunEvent` refuses throws here, with zod's issues.
 */
function audited(...args: Parameters<typeof behave>): Behaved {
  const behaved = behave(...args);
  RunEvent.parse({
    type: "actionPlanned",
    runId: "run_b4",
    stepIndex: 0,
    timestamp: "2026-10-08T10:00:00.000Z",
    proposedAction: args[0],
    performedAction: behaved.performed,
    dice: behaved.dice,
    cost: { tokensIn: 0, tokensOut: 0, usd: 0 },
  });
  return behaved;
}

test("B4 fires on a draw of 0, and the click lands on the nearest control in reach", () => {
  expect(CLICK).toStrictEqual(clickOn(PAGE, TARGET.name));
  const stream = scripted(0);
  expect(audited(CLICK, MISCLICK, stream.draw, step())).toStrictEqual({
    performed: { type: "click", ref: NEIGHBOUR },
    dice: [{ rule: "B4", p: P, rolled: 0, fired: true }],
  });
  expect(stream.taken()).toBe(1);
});

test("B4 rolls and holds on the highest draw, and the proposed click is performed as it was", () => {
  const stream = scripted(HIGHEST_DRAW);
  const behaved = audited(CLICK, MISCLICK, stream.draw, step());
  expect(behaved.dice).toStrictEqual([{ rule: "B4", p: P, rolled: HIGHEST_DRAW, fired: false }]);
  expect(behaved.performed).toBe(CLICK);
  expect(stream.taken()).toBe(1);
});

test.each([
  ["at the limit", LIMIT],
  ["above the limit", LIMIT + 1],
])("a target %s takes no draw and rolls nothing, with a control in reach", (_, targetPx) => {
  // The label widens the area a click activates past the box's smaller side.
  const page = observe([NOTE, ABOVE, link(TARGET.name, TARGET.bbox, targetPx)]);
  const proposed = clickOn(page, TARGET.name);
  const stream = scripted();
  const behaved = audited(proposed, MISCLICK, stream.draw, step(false, page));
  expect(behaved.performed).toBe(proposed);
  expect(behaved.dice).toStrictEqual([]);
  expect(stream.taken()).toBe(0);
});

test.each<[string, number[], Behaved]>([
  [
    "B1 and B4 fired make a double click on the neighbour",
    [0, 0],
    {
      performed: { type: "doubleClick", ref: NEIGHBOUR },
      dice: [
        { rule: "B1", p: 1, rolled: 0, fired: true },
        { rule: "B4", p: P, rolled: 0, fired: true },
      ],
    },
  ],
  [
    "B1 fired and B4 held make a double click on the target",
    [0, P],
    {
      performed: { type: "doubleClick", ref: "e3" },
      dice: [
        { rule: "B1", p: 1, rolled: 0, fired: true },
        { rule: "B4", p: P, rolled: P, fired: false },
      ],
    },
  ],
])("B1 rolls before B4 on a click: %s", (_, draws, behaved) => {
  const stream = scripted(...draws);
  expect(audited(CLICK, { doubleClick: 1, ...MISCLICK }, stream.draw, step())).toStrictEqual(
    behaved,
  );
  expect(stream.taken()).toBe(draws.length);
});

test("on a repeated click B2 rolls before B4; when it fires, B4 does not apply and takes no draw", () => {
  // The scroll B2 performs has no target to miss.
  const firedB2 = scripted(0);
  expect(
    audited(CLICK, { scrollWhenStuck: 1, ...MISCLICK }, firedB2.draw, step(true)),
  ).toStrictEqual({
    performed: SCROLL_DOWN,
    dice: [{ rule: "B2", p: 1, rolled: 0, fired: true }],
  });
  expect(firedB2.taken()).toBe(1);

  // B2 rolled and held: the click is still pressed, so B4 takes the next draw.
  const heldB2 = scripted(0.5, 0);
  expect(
    audited(CLICK, { scrollWhenStuck: 0, ...MISCLICK }, heldB2.draw, step(true)),
  ).toStrictEqual({
    performed: { type: "click", ref: NEIGHBOUR },
    dice: [
      { rule: "B2", p: 0, rolled: 0.5, fired: false },
      { rule: "B4", p: P, rolled: 0, fired: true },
    ],
  });
  expect(heldB2.taken()).toBe(2);
});
