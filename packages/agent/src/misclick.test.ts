/**
 * B4 against `docs/RULES.md` stage 7: `p` against the worked examples of "B4 in detail", computed
 * with Python's `math.erf`, outside our code, and to the bit against "The arithmetic", its series
 * run in Python; the neighbour against "Where a miss lands". The pages are measured by hand and
 * run through the real filter, so every observation here is one `perceive` gives and core's
 * `FullObservation` accepts.
 */
import { elementKey, type MeasuredElement, Profile } from "@wayford/core";
import { describe, expect, test } from "vitest";
import { misclickOf, missProbability } from "./misclick.js";
import { ADA, link, observe, paragraph, refOf } from "./test-support.js";

// ---------------------------------------------------------------------------
// The pages
// ---------------------------------------------------------------------------

/** Ada with a hard P4 cut at 24 px, so a smaller control is invisible and carries no ref. */
const CUT_AT_24 = Profile.parse({
  ...ADA,
  perception: { ...ADA.perception, targetPx: { threshold: 24, provenance: "folk" } },
});

/** The motor limit of every test below but those of `missProbability`. */
const LIMIT = 44;

// A column of 160 × 30 links 13 px apart, as on `/settings/data`. The target's box is
// [100, 260) × [143, 173), so its action point, the aim point, is (180, 158), and a link 13 px
// above or below it is 28 px away.
const TARGET = link("Fulfilment ledger", { x: 100, y: 143, width: 160, height: 30 });
const ABOVE = link("Contact details", { x: 100, y: 100, width: 160, height: 30 });
const BELOW = link("Delivery addresses", { x: 100, y: 186, width: 160, height: 30 });

/** A 160 × 30 link whose top edge is `distance` px straight below the aim point. */
const below = (name: string, distance: number): MeasuredElement =>
  link(name, { x: 100, y: 158 + distance, width: 160, height: 30 });

/** B4 on a click on the target in a page of `elements`, under `LIMIT`. */
function missOnTarget(elements: MeasuredElement[], profile: Profile = ADA) {
  const page = observe(elements, profile);
  return { page, misclick: misclickOf(refOf(page, TARGET.name), page, LIMIT) };
}

// ---------------------------------------------------------------------------
// p
// ---------------------------------------------------------------------------

describe("missProbability", () => {
  test.each([
    [22, 44, 0.262706],
    [24, 48, 0.262706],
    [30, 44, 0.120061],
    [36, 44, 0.052099],
    [46, 48, 0.008878],
    [0, 48, 0.961219],
  ])("a target of %d px under a limit of %d gives RULES' %f", (targetPx, limitPx, p) => {
    expect(missProbability(targetPx, limitPx)).toBeCloseTo(p, 6);
  });

  test("p is RULES' series to the bit, summed from the last term, with k · W divided by L", () => {
    // RULES' recurrence run in Python, the same doubles in the same order, so a stored roll's
    // `fired` replays. A sum from the first term gives other bits for both pairs, k · (W / L) for
    // the second.
    expect(missProbability(24, 48)).toBe(0.2627056270758179);
    expect(missProbability(30, 44)).toBe(0.12006059614142917);
  });

  test("p falls to 0 as the target reaches the limit, with no jump there", () => {
    // The largest number under 44: 44 is in [32, 64), where numbers are 2^-47 apart.
    const justUnder = 44 - 2 ** -47;
    expect(justUnder).toBeLessThan(44);
    // Unfloored, the two sums round a unit apart the wrong way here and give -1.1e-16, which
    // core's roll audit refuses; a width measured as 44 can come out this way in `collect`.
    expect(missProbability(justUnder, 44)).toBe(0);
    expect(missProbability(44 - 2 * 2 ** -47, 44)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Where the miss lands
// ---------------------------------------------------------------------------

describe("misclickOf", () => {
  test("the nearest control in reach wins over a farther one listed first", () => {
    const farther = below("Delivery addresses", 38);
    const { page, misclick } = missOnTarget([TARGET, farther, ABOVE]);
    expect(misclick).toStrictEqual({
      p: missProbability(30, LIMIT),
      neighbour: refOf(page, ABOVE.name),
    });
  });

  test("p comes from the target's targetPx, which its label widens past its box", () => {
    // The box's smaller side is 30; with its label, the area a click activates is 36 px across.
    const labelled = link(TARGET.name, TARGET.bbox, 36);
    const { page, misclick } = missOnTarget([labelled, ABOVE]);
    expect(misclick).toStrictEqual({
      p: missProbability(36, LIMIT),
      neighbour: refOf(page, ABOVE.name),
    });
  });

  test("a text block nearer than any control is never chosen", () => {
    // 3 px below the target, so 18 px from the aim point; the control above is 28.
    const note = paragraph("Kept for six years", { x: 100, y: 176, width: 400, height: 24 });
    const { page, misclick } = missOnTarget([TARGET, note, ABOVE]);
    expect(misclick?.neighbour).toBe(refOf(page, ABOVE.name));
  });

  test("an invisible control is never chosen", () => {
    // 20 px, under the cut at 24, and 18 px from the aim point; the control above is 28.
    const edit = link("Edit", { x: 170, y: 176, width: 20, height: 20 });
    const { page, misclick } = missOnTarget([TARGET, edit, ABOVE], CUT_AT_24);
    expect(page.elements.find((element) => element.name === "Edit")?.state).toBe("invisible");
    expect(misclick?.neighbour).toBe(refOf(page, ABOVE.name));
  });

  test("a control whose box holds the aim point, one that encloses the target, is skipped", () => {
    // Its box holds (180, 158), so its distance is 0; its own action point, (280, 180), is outside
    // the target's box, so only the enclosing rule leaves it out.
    const card = link("Your data", { x: 80, y: 120, width: 400, height: 120 });
    const { page, misclick } = missOnTarget([card, TARGET, ABOVE]);
    expect(misclick?.neighbour).toBe(refOf(page, ABOVE.name));
  });

  // Each box has one edge through the aim point, (180, 158), and its action point above or below
  // the target's box, so only whether it holds the aim point decides.
  test.each([
    ["left", { x: 180, y: 150, width: 140, height: 50 }, "holds it and is skipped", ABOVE.name],
    ["top", { x: 150, y: 158, width: 150, height: 40 }, "holds it and is skipped", ABOVE.name],
    ["right", { x: 40, y: 150, width: 140, height: 50 }, "is nearest, at 0", "Side"],
    ["bottom", { x: 150, y: 118, width: 150, height: 40 }, "is nearest, at 0", "Side"],
  ])(
    "a box holds its left and top edges only: one with its %s edge through the aim point %s",
    (_edge, bbox, _outcome, name) => {
      const { page, misclick } = missOnTarget([link("Side", bbox), TARGET, ABOVE]);
      expect(misclick?.neighbour).toBe(refOf(page, name));
    },
  );

  test("a control whose action point lies inside the target's box is skipped", () => {
    // 10 px right of the aim point, its box not holding it; its action point, (200, 158), is in
    // the target's box, where a click on it would land on the target.
    const copy = link("Copy", { x: 190, y: 148, width: 20, height: 20 });
    const { page, misclick } = missOnTarget([TARGET, copy, ABOVE]);
    expect(misclick?.neighbour).toBe(refOf(page, ABOVE.name));
  });

  test("the aim point is the centre of the part of the target inside the viewport", () => {
    // Scrolled 20 px above the top, the target shows [0, 20), so the aim point is (180, 10). The
    // link below is 40 px from it, in reach, and 50 px, out of reach, from the centre of the whole
    // box, (180, 0).
    const scrolled = link(TARGET.name, { x: 100, y: -20, width: 160, height: 40 });
    const under = link("Delivery addresses", { x: 100, y: 50, width: 160, height: 30 });
    const { page, misclick } = missOnTarget([scrolled, under]);
    expect(misclick?.neighbour).toBe(refOf(page, under.name));
  });

  test("a candidate is pressed at the centre of its part inside the viewport", () => {
    // A tall control over the target's right end, scrolled 40 px above the top. The centre of its
    // whole box, (220, 15), lies inside the target's box, but it is pressed at (220, 35), the
    // centre of the part it shows, below the target. So a click on it lands on it, and at 20 px
    // from the aim point, (180, 15), it is nearer than the link 28 px below.
    const top = link(TARGET.name, { x: 100, y: 0, width: 160, height: 30 });
    const tall = link("Pin", { x: 200, y: -40, width: 40, height: 110 });
    const under = link("Delivery addresses", { x: 100, y: 43, width: 160, height: 30 });
    const { page, misclick } = missOnTarget([top, under, tall]);
    expect(misclick?.neighbour).toBe(refOf(page, tall.name));
  });

  test("the target is never its own neighbour, though a box of no size holds no point", () => {
    // A checkbox drawn with no size inside its label, which gives it its target size: its box
    // holds neither the aim point nor its own action point, so only being the target leaves it out.
    const checkbox: MeasuredElement = {
      key: elementKey({ role: "checkbox", name: "Keep my history", path: [{ role: "main" }] }),
      kind: "control",
      role: "checkbox",
      name: "Keep my history",
      bbox: { x: 180, y: 158, width: 0, height: 0 },
      metrics: { targetPx: 30 },
    };
    const page = observe([checkbox, ABOVE]);
    expect(misclickOf(refOf(page, checkbox.name), page, LIMIT)?.neighbour).toBe(
      refOf(page, ABOVE.name),
    );
  });

  test.each([
    ["the one above, listed first", [ABOVE, TARGET, BELOW], ABOVE.name],
    ["the one below, listed first", [BELOW, TARGET, ABOVE], BELOW.name],
  ])("a tie at 28 px goes to the earlier element: %s", (_which, elements, name) => {
    const { page, misclick } = missOnTarget(elements);
    expect(misclick?.neighbour).toBe(refOf(page, name));
  });

  test.each([
    // The nearest corner of a box 30 px right and 30 px up is 42.43 px off: nearer than a box 43 px
    // straight below, though 60 px off by the sum of the axes, and farther than one 40 px below,
    // though only 30 px off along either axis.
    ["43 px straight below", 43, "Corner"],
    ["40 px straight below", 40, "Straight"],
  ])(
    "distance is Euclidean, to the nearest point of the box: the corner against %s",
    (_against, distance, name) => {
      const corner = link("Corner", { x: 210, y: 98, width: 40, height: 30 });
      const { page, misclick } = missOnTarget([below("Straight", distance), TARGET, corner]);
      expect(misclick?.neighbour).toBe(refOf(page, name));
    },
  );

  test("a control at exactly the limit is in reach, and one a 64th of a px beyond is not", () => {
    const at = missOnTarget([TARGET, below("Delivery addresses", LIMIT)]);
    expect(at.misclick?.neighbour).toBe(refOf(at.page, "Delivery addresses"));
    const beyond = missOnTarget([TARGET, below("Delivery addresses", LIMIT + 1 / 64)]);
    expect(beyond.misclick).toBeUndefined();
  });

  test("a clicked text block, with no target size, gives undefined", () => {
    const page = observe([ABOVE, paragraph("Fulfilment ledger", TARGET.bbox)]);
    expect(misclickOf(refOf(page, "Fulfilment ledger"), page, LIMIT)).toBeUndefined();
  });

  test("a ref the observation lacks throws, since only a bug asks", () => {
    // The loop checks every answer's ref before it rolls, so undefined means only that B4 does
    // not apply.
    const page = observe([ABOVE, TARGET]);
    expect(() => misclickOf("e99", page, LIMIT)).toThrow("the click names e99");
  });
});
