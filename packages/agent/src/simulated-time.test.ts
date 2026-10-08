/**
 * B3's clock against `docs/RULES.md` stage 7, "B3 in detail": Fitts's law against its worked pairs,
 * computed with Python's `math.log2`, outside our code; each step's operators and the pace that
 * scales them, against the per-step table and "The pace"; where a movement starts and ends, against
 * "Where a movement starts and ends". The page is measured by hand and run through the real
 * filter, as B4's tests do, so it is one `perceive` gives and core's `FullObservation` accepts.
 */
import { type Action, type Bbox, elementKey, type MeasuredElement } from "@wayford/core";
import { profileFixture } from "@wayford/core/fixtures";
import { describe, expect, test } from "vitest";
import type { Point } from "./act.js";
import { movementMs, type Pace, paceOf, plannedStepMs, wastedStepMs } from "./simulated-time.js";
import { ADA, link, observe, paragraph, refOf } from "./test-support.js";

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

/** A text field in `main`: a control, its target size its box's smaller side. */
function field(name: string, bbox: Bbox): MeasuredElement {
  const key = elementKey({ role: "textbox", name, path: [{ role: "main" }] });
  return { ...link(name, bbox), key, role: "textbox" };
}

// The measurement fixture's 1280 × 720 viewport, whose centre is (640, 360). Every element but
// the neighbour has its action point 400 px from that centre, a 240-320-400 or 320-240-400
// triangle, so a first press on any of them travels RULES' worked distance.
/** RULES' worked target: 36 px, action point (400, 40). */
const ARCHIVE = link("Order archive", { x: 320, y: 22, width: 160, height: 36 });
/** A 30 px link just below it, action point (400, 86): where a fired B4 lands. */
const HISTORY = link("Order history", { x: 320, y: 71, width: 160, height: 30 });
/** A 36 px field, action point (960, 120). */
const SEARCH = field("Search orders", { x: 800, y: 102, width: 320, height: 36 });
/** A 30 px box whose label widens the area a click activates to 36, action point (240, 360). */
const REMEMBER = link("Keep me signed in", { x: 160, y: 345, width: 160, height: 30 }, 36);
/** A text block, no `targetPx`: its box's smaller side is 36, action point (880, 680). */
const NOTE = paragraph("Kept for six years", { x: 680, y: 662, width: 400, height: 36 });
/** A control with a box of no size, at (1040, 360): `targetPx` 0. */
const DOT = link("Dot", { x: 1040, y: 360, width: 0, height: 0 });

const PAGE = observe([ARCHIVE, HISTORY, SEARCH, REMEMBER, NOTE, DOT]);
const CENTRE = { x: 640, y: 360 };

const ADA_PACE = paceOf(ADA.behaviour);
const VERA_PACE = paceOf(profileFixture("prof_vera").behaviour);
const ZOYA_PACE = paceOf(profileFixture("prof_zoya").behaviour);

const clickOn = (name: string): Action => ({ type: "click", ref: refOf(PAGE, name) });

/** A step whose proposed action was performed as it was, on `PAGE`. */
function asProposed(action: Action, pace: Pace, from?: Point) {
  return plannedStepMs({ proposed: action, performed: action, page: PAGE, from, pace });
}

// ---------------------------------------------------------------------------
// The operators
// ---------------------------------------------------------------------------

describe("the operators", () => {
  // RULES' printed values, to their 4 decimals, and the same pairs run in Python,
  // `-107 + 223 * math.log2(D / W + 1)`, to 1e-9.
  test.each([
    [400, 36, 695.4118, 695.4118291036189],
    [36, 36, 116, 116],
    [600, 20, 997.7858, 997.7857772162731],
    [1000, 10, 1377.7812, 1377.7811606536502],
  ])(
    "movementMs matches RULES' worked example: D %d and W %d give %f ms",
    (d, w, printed, full) => {
      expect(movementMs(d, w)).toBeCloseTo(printed, 4);
      expect(movementMs(d, w)).toBeCloseTo(full, 9);
    },
  );

  test("a move too short for the intercept is floored at 0, not below", () => {
    // -107 at D 0, and -65.159 at D 5, W 36.
    expect(movementMs(0, 36)).toBe(0);
    expect(movementMs(5, 36)).toBe(0);
  });

  test("W is at least 1 px", () => {
    expect(movementMs(400, 0)).toBe(movementMs(400, 1));
    expect(movementMs(400, 0.5)).toBe(movementMs(400, 1));
    expect(movementMs(400, 1)).toBeCloseTo(1821.3832290994471, 9);
  });
});

// ---------------------------------------------------------------------------
// The pace
// ---------------------------------------------------------------------------

describe("paceOf", () => {
  test("a knob the profile does not set is the norm, 1", () => {
    expect(paceOf({})).toStrictEqual({ thinking: 1, motor: 1 });
    expect(ADA_PACE).toStrictEqual({ thinking: 1, motor: 1 });
    expect(paceOf({ thinkingTime: { factor: 2, provenance: "folk" } })).toStrictEqual({
      thinking: 2,
      motor: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// A step's time
// ---------------------------------------------------------------------------

describe("a step's time", () => {
  test("RULES' worked click, D 400 and W 36: Ada 2245 ms, Vera 4043, Zoya 5841", () => {
    expect(asProposed(clickOn(ARCHIVE.name), ADA_PACE).ms).toBe(2245);
    expect(asProposed(clickOn(ARCHIVE.name), VERA_PACE).ms).toBe(4043);
    expect(asProposed(clickOn(ARCHIVE.name), ZOYA_PACE).ms).toBe(5841);
  });

  // Ada at the norm, and Vera at 2 and 1.5, whose wait and typed characters are not scaled.
  test.each<[string, Action, number, number]>([
    ["giveUp: M", { type: "giveUp" }, 1350, 2700],
    ["scroll: M + K", { type: "scroll", direction: "down" }, 1630, 3120],
    ["back: M + K", { type: "back" }, 1630, 3120],
    ["wait: M + its ms, unscaled", { type: "wait", ms: 2500 }, 3850, 5200],
    ["click: M + P + 2B", clickOn(ARCHIVE.name), 2245, 4043],
    [
      "doubleClick: M + P + 4B",
      { type: "doubleClick", ref: refOf(PAGE, ARCHIVE.name) },
      2445,
      4343,
    ],
    [
      "type: M + P + 2B + K per character, unscaled",
      { type: "type", ref: refOf(PAGE, SEARCH.name), text: "Order 42" },
      4485,
      6283,
    ],
  ])("%s", (_operators, action, ada, vera) => {
    expect(asProposed(action, ADA_PACE).ms).toBe(ada);
    expect(asProposed(action, VERA_PACE).ms).toBe(vera);
  });

  test("a type counts the code points of the one line act.ts types", () => {
    // "Order 42 🙂" once the line break is a space: 10 code points, 11 UTF-16 units, 12 before.
    const text = "Order\r\n42 🙂";
    const typed = asProposed({ type: "type", ref: refOf(PAGE, SEARCH.name), text }, ADA_PACE);
    expect(typed.ms).toBe(5045);
  });

  test("a wasted step costs one M, scaled by the thinking factor", () => {
    expect(wastedStepMs(ADA_PACE)).toBe(1350);
    expect(wastedStepMs(VERA_PACE)).toBe(2700);
    expect(wastedStepMs(ZOYA_PACE)).toBe(4050);
  });
});

// ---------------------------------------------------------------------------
// Where a movement starts and ends
// ---------------------------------------------------------------------------

describe("where a movement starts and ends", () => {
  test("the first movement starts at the centre of the viewport", () => {
    expect(asProposed(clickOn(ARCHIVE.name), ADA_PACE, undefined)).toStrictEqual(
      asProposed(clickOn(ARCHIVE.name), ADA_PACE, CENTRE),
    );
    // From the target's own action point there is no travel: M + 2B.
    expect(asProposed(clickOn(ARCHIVE.name), ADA_PACE, { x: 400, y: 40 }).ms).toBe(1550);
  });

  test("a press ends with the cursor on the target's action point", () => {
    expect(asProposed(clickOn(ARCHIVE.name), ADA_PACE).cursor).toStrictEqual({ x: 400, y: 40 });
    const typed = { type: "type", ref: refOf(PAGE, SEARCH.name), text: "x" } as const;
    expect(asProposed(typed, ADA_PACE, CENTRE).cursor).toStrictEqual({ x: 960, y: 120 });
  });

  test("after a fired B4 the move is timed to the proposed target and ends on the neighbour", () => {
    const step = plannedStepMs({
      proposed: clickOn(ARCHIVE.name),
      performed: clickOn(HISTORY.name),
      page: PAGE,
      from: undefined,
      pace: ADA_PACE,
    });
    // D 400 and W 36 to the target; a click aimed at the neighbour, 364.247 px off and 30 px
    // across, would cost 2272.
    expect(step).toStrictEqual({ ms: 2245, cursor: { x: 400, y: 86 } });
    // The next movement starts on the neighbour: 46 px back up to the target.
    expect(asProposed(clickOn(ARCHIVE.name), ADA_PACE, step.cursor).ms).toBe(1708);
  });

  test("W is the aimed element's targetPx, past its box's smaller side", () => {
    // From the box's 30 px it would be 2300.
    expect(asProposed(clickOn(REMEMBER.name), ADA_PACE).ms).toBe(2245);
  });

  test("a text block's W is its box's smaller side", () => {
    // From its 400 px width it would be 1666.
    expect(asProposed(clickOn(NOTE.name), ADA_PACE).ms).toBe(2245);
  });

  test("a box of no size is aimed at as 1 px wide", () => {
    expect(PAGE.elements.find((element) => element.name === DOT.name)?.metrics.targetPx).toBe(0);
    expect(asProposed(clickOn(DOT.name), ADA_PACE).ms).toBe(3371);
  });

  test.each<[string, Action]>([
    ["scroll", { type: "scroll", direction: "up" }],
    ["back", { type: "back" }],
    ["wait", { type: "wait", ms: 1000 }],
    ["giveUp", { type: "giveUp" }],
  ])("a %s points at nothing and leaves the cursor where it was", (_kind, action) => {
    expect(asProposed(action, ADA_PACE, { x: 400, y: 86 }).cursor).toStrictEqual({ x: 400, y: 86 });
    expect(asProposed(action, ADA_PACE, undefined).cursor).toBeUndefined();
  });

  test("a ref the evidence lacks is a bug, and throws", () => {
    expect(() => asProposed({ type: "click", ref: "e99" }, ADA_PACE)).toThrow(
      "the action names e99, which step 0's evidence lacks",
    );
  });
});
