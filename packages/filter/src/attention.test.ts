/**
 * Salience (A1) against `docs/RULES.md` stage 5, "Salience (A1)". The worked values are the ones
 * RULES states (the kebab 0.822 with `S` 0.778 and `P` 0.866, "Order archive" 0.487), so the code
 * is held to RULES and not to itself. No browser: the elements are written here or read from
 * `measurementFixture`, the `/deliveries` page at 1280 × 720.
 *
 * The last part runs `perceive` with stages 4 and 5 on, against the boxes of
 * `tasks/s1-03-knowledge-attention.md` that need no browser: the same Actor text twice on the
 * fixture with the kebab added (`perceive.test.ts` has it on the fixture alone), monotone in the
 * cap, Kai's cut on the fixture, and K1 and K4 on the fixture with the kebab added. The salience
 * order test also holds a cap that cuts nothing to reordering only. What
 * `FullObservation` enforces (refs, state, masks, `hiddenCount`) is left to its parse.
 */
import { readFileSync } from "node:fs";
import {
  type Bbox,
  FullObservation,
  type MeasuredElement,
  type Metrics,
  PageMeasurement,
  type Profile,
} from "@wayford/core";
import {
  kebabElement as KEBAB,
  measurementFixture,
  profileFixture,
  profileFixtures,
} from "@wayford/core/fixtures";
import { describe, expect, test } from "vitest";
import { salience, salienceOrder, salienceTerms } from "./attention.js";
import { perceive } from "./perceive.js";
import {
  actorText,
  K1_K4,
  observed,
  PERSONA_IDS,
  seeds,
  shownKeys,
  withCap,
} from "./test-support.js";

// ---------------------------------------------------------------------------
// The elements
// ---------------------------------------------------------------------------

/** The desktop viewport RULES's worked values are given on. */
const DESKTOP = { width: 1280, height: 720 };

const ARCHIVE = "main//link:Order archive";

/** A link in `main` with the given box and metrics. */
const link = (name: string, bbox: Bbox, metrics: Metrics): MeasuredElement => ({
  key: `main//link:${name}`,
  kind: "control",
  role: "link",
  name,
  bbox,
  metrics,
});

/** The kebab moved so its box's top-left corner is at `x`, `y`. */
const kebabAt = (x: number, y: number): MeasuredElement => ({
  ...KEBAB,
  bbox: { ...KEBAB.bbox, x, y },
});

const fixed = (value: number | undefined) => value?.toFixed(3);

// ---------------------------------------------------------------------------
// The terms
// ---------------------------------------------------------------------------

describe("the three terms of docs/RULES.md", () => {
  /** A 300 × 30 link at the top-left corner with the given metrics. */
  const sized = (metrics: Metrics) => link("a", { x: 0, y: 0, width: 300, height: 30 }, metrics);
  type Row = [claim: string, element: MeasuredElement, term: "size" | "contrast", value: string];
  const ROWS: Row[] = [
    ["S is the font size over 24 px", sized({ fontPx: 18 }), "size", "0.750"],
    ["S stops at 24 px, large-scale text", sized({ fontPx: 24 }), "size", "1.000"],
    ["S stays 1 above 24 px", sized({ fontPx: 40 }), "size", "1.000"],
    // No font size: the smaller side ÷ 1.5 is the font size whose line fills the box. The kebab's
    // 0.778 is in the worked values below.
    ["an icon's box counts its smaller side, 30 of 300 × 30", sized({}), "size", "0.833"],
    ["C is 0 at 1:1", sized({ contrast: 1, fontPx: 16 }), "contrast", "0.000"],
    ["C is linear below 4.5:1", sized({ contrast: 2.75, fontPx: 16 }), "contrast", "0.500"],
    ["C is 1 at 4.5:1, AA for text", sized({ contrast: 4.5, fontPx: 16 }), "contrast", "1.000"],
    ["C stays 1 above 4.5:1", sized({ contrast: 21, fontPx: 16 }), "contrast", "1.000"],
  ];
  test.each(ROWS)("%s", (_claim, element, term, value) => {
    expect(fixed(salienceTerms(element, DESKTOP)[term])).toBe(value);
  });

  test("C is absent when no contrast was measured", () => {
    expect(salienceTerms(KEBAB, DESKTOP)).not.toHaveProperty("contrast");
  });

  type Corner = [claim: string, x: number, y: number, position: string];
  const CORNERS: Corner[] = [
    ["P is 1 along the top edge, at the left", 0, 0, "1.000"],
    ["P is 1 along the top edge, at the right", 1280, 0, "1.000"],
    ["P is 0.5 at the bottom of the left edge", 0, 720, "0.500"],
    ["P is 0 at the bottom-right corner", 1280, 720, "0.000"],
    // Further down, attention keeps to the left: halfway down, the left beats the middle.
    ["P halfway down the left edge", 0, 360, "0.750"],
    ["P halfway down the middle", 640, 360, "0.625"],
  ];
  test.each(CORNERS)("%s", (_claim, x, y, position) => {
    expect(fixed(salienceTerms(kebabAt(x, y), DESKTOP).position)).toBe(position);
  });
});

// ---------------------------------------------------------------------------
// Salience
// ---------------------------------------------------------------------------

describe("the worked values of docs/RULES.md", () => {
  test("the kebab, 28 × 28 at 224,164 with no contrast: S 0.778, P 0.866, salience 0.822", () => {
    const terms = salienceTerms(KEBAB, DESKTOP);
    expect(fixed(terms.size)).toBe("0.778");
    expect(fixed(terms.position)).toBe("0.866");
    expect(fixed(salience(KEBAB, DESKTOP))).toBe("0.822");
  });

  test('"Order archive" on the fixture: 0.487', () => {
    const archive = measurementFixture.elements.find((e) => e.key === ARCHIVE);
    if (!archive) throw new Error(`the fixture measures ${ARCHIVE}`);
    expect(fixed(salience(archive, measurementFixture.viewport))).toBe("0.487");
  });
});

describe("salience", () => {
  test("with no contrast is the mean of S and P, never a default contrast", () => {
    const { size, position } = salienceTerms(KEBAB, DESKTOP);
    const value = salience(KEBAB, DESKTOP);
    expect(value).toBe((size + position) / 2);
    // Neither end of the contrast range is filled in: 1:1 would rank it lower, 4.5:1 higher.
    const at = (contrast: number) => salience({ ...KEBAB, metrics: { contrast } }, DESKTOP);
    expect(at(1)).toBeLessThan(value);
    expect(at(4.5)).toBeGreaterThan(value);
  });

  test("a box below the fold counts as at the bottom edge: y clamps to 1", () => {
    const bottom = salience(kebabAt(224, 720), DESKTOP);
    expect(salience(kebabAt(224, 721), DESKTOP)).toBe(bottom);
    expect(salience(kebabAt(224, 720 * 4), DESKTOP)).toBe(bottom);
    expect(fixed(salienceTerms(kebabAt(0, 720 * 4), DESKTOP).position)).toBe("0.500");
  });

  test("a box past the right edge clamps x to 1, and one above or left of the viewport to 0", () => {
    expect(salience(kebabAt(1280 * 3, 360), DESKTOP)).toBe(salience(kebabAt(1280, 360), DESKTOP));
    expect(salience(kebabAt(-500, 360), DESKTOP)).toBe(salience(kebabAt(0, 360), DESKTOP));
    expect(salience(kebabAt(640, -200), DESKTOP)).toBe(salience(kebabAt(640, 0), DESKTOP));
  });

  test("is arithmetic only: no Math function but min and max, and no ** operator", () => {
    // Every engine rounds + − × ÷ the same way, but leaves the last bit of Math.log and its kin to
    // the engine, so the browser preview and the Actor could order elements differently.
    const source = readFileSync(new URL("./attention.ts", import.meta.url), "utf8");
    const used = [...new Set(source.match(/\bMath\.\w+/g))];
    expect(used.filter((name) => name !== "Math.min" && name !== "Math.max")).toEqual([]);
    expect(source).not.toMatch(/[\w)\]]\s*\*\*/);
  });
});

// ---------------------------------------------------------------------------
// The order
// ---------------------------------------------------------------------------

describe("salienceOrder", () => {
  const box = (y: number) => ({ x: 224, y, width: 120, height: 30 });

  test("breaks a tie by measurement index, never by key or name", () => {
    const metrics = { contrast: 4.5, fontPx: 16 };
    const forward = [link("Apple", box(400), metrics), link("Zebra", box(400), metrics)];
    const reverse = [link("Zebra", box(400), metrics), link("Apple", box(400), metrics)];
    expect(salienceOrder(forward, DESKTOP)).toEqual([0, 1]);
    expect(salienceOrder(reverse, DESKTOP)).toEqual([0, 1]);
  });

  test("orders every element of the fixture, salience never rising down the order", () => {
    const { elements, viewport } = measurementFixture;
    const order = salienceOrder(elements, viewport);
    expect([...order].sort((a, b) => a - b)).toEqual(elements.map((_, i) => i));
    const values = order.map((i) => salience(elements[i] as MeasuredElement, viewport));
    for (const [n, value] of values.entries()) {
      if (n > 0) expect(value).toBeLessThanOrEqual(values[n - 1] as number);
    }
    // The page's h1 leads, and "Order archive", low on the page in a faint grey, is the least
    // salient of the 14, as the spec's results on `/deliveries` give it.
    expect(elements[order[0] as number]?.key).toBe("main//heading:Deliveries");
    expect(elements[order.at(-1) as number]?.key).toBe(ARCHIVE);
  });
});

// ---------------------------------------------------------------------------
// perceive, with stages 4 and 5
// ---------------------------------------------------------------------------

/** The fixture with the kebab of RULES's worked example added, last in measurement order. */
const WITH_KEBAB = PageMeasurement.parse({
  ...measurementFixture,
  elements: [...measurementFixture.elements, KEBAB],
});

const PAGES: [page: string, measurement: PageMeasurement][] = [
  ["the fixture", measurementFixture],
  ["the fixture with the kebab", WITH_KEBAB],
];

const A1 = { stage: "attention", rule: "A1" };

const keysOf = (measurement: PageMeasurement, indices: readonly number[]) =>
  indices.map((index) => measurement.elements[index]?.key);

/** The element as evidence, without its ref. */
function withoutRef(element: FullObservation["elements"][number]) {
  const copy = { ...element };
  delete copy.ref;
  return copy;
}

describe("perceive with stages 4 and 5", () => {
  test("same measurement, profile and run seed twice give string-equal Actor text", () => {
    // On the kebab page only: `perceive.test.ts` runs every persona on the fixture alone.
    expect(profileFixtures.map((p) => p.id)).toEqual(PERSONA_IDS);
    let renamed = 0;
    let cut = 0;
    for (const profile of profileFixtures) {
      for (const seed of seeds(20)) {
        const at = `${profile.id} at run seed ${seed}`;
        const first = perceive(WITH_KEBAB, profile, seed);
        const second = perceive(WITH_KEBAB, profile, seed);
        expect(actorText(second), at).toBe(actorText(first));
        const parsed = FullObservation.safeParse(first);
        expect(parsed.success, `${at}: ${parsed.error}`).toBe(true);
        renamed += first.elements.filter((e) => e.renamedName !== undefined).length;
        cut += first.hiddenCount;
      }
    }
    // Not vacuous: stage 4 renamed something and stage 5 cut something.
    expect(renamed).toBeGreaterThan(0);
    expect(cut).toBeGreaterThan(0);
  });

  test("lowering maxElements from 20 to 1 never adds a shown element", () => {
    const caps = Array.from({ length: 20 }, (_, i) => 20 - i);
    let cuts = 0;
    for (const [page, measurement] of PAGES) {
      for (const persona of profileFixtures) {
        const free = withCap(persona, undefined);
        const capped = caps.map((cap) => [cap, withCap(persona, cap)] as const);
        for (const seed of seeds(100)) {
          // What stages 1 to 3 leave shown: with no cap, nothing else removes an element.
          const candidates = new Set(shownKeys(perceive(measurement, free, seed)));
          let larger = candidates;
          for (const [cap, profile] of capped) {
            const at = `${persona.id} on ${page} at run seed ${seed}, cap ${cap}`;
            const full = perceive(measurement, profile, seed);
            const shown = new Set(shownKeys(full));
            expect(shown.size, at).toBe(Math.min(cap, candidates.size));
            expect(
              [...shown].filter((key) => !larger.has(key)),
              at,
            ).toEqual([]);
            expect(full.hiddenCount, at).toBe(candidates.size - shown.size);
            cuts += full.hiddenCount;
            larger = shown;
          }
        }
      }
    }
    expect(cuts).toBeGreaterThan(0);
  });

  test("Kai at cap 11: A1 hides the last 3 of the fixture's 14, Order archive last", () => {
    const kai = profileFixture("prof_kai");
    expect(kai.behaviour.maxElements).toBe(11);
    for (const seed of seeds(20)) {
      const full = FullObservation.parse(perceive(measurementFixture, kai, seed));
      // No perception threshold and nothing off screen: every element is a candidate.
      expect(full.elements).toHaveLength(14);
      expect(full.elements.every((e) => e.decisions.every((d) => d.stage === "attention"))).toBe(
        true,
      );
      const hidden = full.elements.filter((e) => e.decisions.length > 0);
      expect(hidden).toHaveLength(3);
      expect(full.hiddenCount).toBe(3);
      expect(full.elements.slice(11)).toStrictEqual(hidden);
      for (const element of hidden) {
        expect(element.decisions, element.key).toStrictEqual([A1]);
      }
      expect(full.elements.at(-1)?.key).toBe(ARCHIVE);
      const text = actorText(full);
      expect(text).not.toContain("Order archive");
      expect(text.endsWith("3 more elements not shown")).toBe(true);
    }
  });

  test("with no cap the evidence keeps measurement order and nothing is hidden", () => {
    const ada = profileFixture("prof_ada");
    expect(ada.behaviour.maxElements).toBeUndefined();
    const kai = withCap(profileFixture("prof_kai"), undefined);
    for (const [page, measurement] of PAGES) {
      const keys = measurement.elements.map((e) => e.key);
      // Not vacuous: salience order is not measurement order on this page.
      const order = salienceOrder(measurement.elements, measurement.viewport);
      expect(keysOf(measurement, order), page).not.toEqual(keys);
      for (const profile of [ada, kai]) {
        for (const seed of seeds(5)) {
          const at = `${profile.id} on ${page} at run seed ${seed}`;
          const full = perceive(measurement, profile, seed);
          expect(
            full.elements.map((e) => e.key),
            at,
          ).toEqual(keys);
          expect(full.hiddenCount, at).toBe(0);
        }
      }
    }
  });

  test("with a cap the evidence follows salience order, and the shown are numbered down it", () => {
    const capped = profileFixtures.filter((p) => p.behaviour.maxElements !== undefined);
    expect(capped.map((p) => p.id)).toEqual(["prof_kai", "prof_milo", "prof_vera", "prof_zoya"]);
    const cutNothing = new Set<string>();
    for (const [page, measurement] of PAGES) {
      const order = keysOf(measurement, salienceOrder(measurement.elements, measurement.viewport));
      for (const profile of capped) {
        const free = withCap(profile, undefined);
        for (const seed of seeds(5)) {
          const at = `${profile.id} on ${page} at run seed ${seed}`;
          // The parse holds the shown ones to `e1..eN` down the evidence, with no gap.
          const full = FullObservation.parse(perceive(measurement, profile, seed));
          expect(
            full.elements.map((e) => e.key),
            at,
          ).toEqual(order);
          // A cap that cuts nothing only reorders: each element is as with no cap, but its ref.
          if (full.hiddenCount > 0) continue;
          cutNothing.add(profile.id);
          const uncapped = perceive(measurement, free, seed);
          for (const element of full.elements) {
            expect(withoutRef(element), `${element.key}, ${at}`).toStrictEqual(
              withoutRef(observed(uncapped, element.key)),
            );
          }
        }
      }
    }
    // Not vacuous: stages 1 to 3 leave Milo, Vera and Zoya fewer elements than their caps.
    expect([...cutNothing]).toEqual(["prof_milo", "prof_vera", "prof_zoya"]);
  });

  test('Kai reads the kebab as button "button": K1 and K4, a visible state and no mask', () => {
    // Stage 4 alone: Kai with no cap, so his knowledge is all that acts on the page.
    const kai = withCap(profileFixture("prof_kai"), undefined);
    expect(kai.knowledge.unknownPatterns).toContain("kebab");
    const ada = profileFixture("prof_ada");
    for (const seed of seeds(20)) {
      // K1 and K4 decide no state: the parse holds it visible, with no mask.
      const full = FullObservation.parse(perceive(WITH_KEBAB, kai, seed));
      const kebab = observed(full, KEBAB.key);
      expect(full.elements.filter((e) => e.decisions.length > 0)).toStrictEqual([kebab]);
      expect(kebab.decisions).toStrictEqual(K1_K4);
      expect(kebab.renamedName).toBe("button");
      expect(kebab.name, "the evidence keeps the real name").toBe("More options");
      // Ada knows the pattern. The rename is the only difference between what the two read.
      const adaText = actorText(perceive(WITH_KEBAB, ada, seed));
      expect(adaText).toContain(`[${kebab.ref}] button "More options" at 224,164`);
      expect(actorText(full)).toBe(
        adaText.replace('button "More options" at', 'button "button" at'),
      );
    }
  });

  test("Kai's cap of 11 cuts the kebab, 12th of 15, and keeps its rename in the evidence", () => {
    // The kebab's 0.822 falls just under "Delivery address" on this page. On the real `/account`
    // it is 10th of 15, inside his cap (the `s1-03` spec, "Results on the target app").
    const kai = profileFixture("prof_kai");
    for (const seed of seeds(20)) {
      const full = FullObservation.parse(perceive(WITH_KEBAB, kai, seed));
      const kebab = observed(full, KEBAB.key);
      expect(full.elements.indexOf(kebab)).toBe(11);
      expect(kebab.decisions).toStrictEqual([...K1_K4, A1]);
      expect(kebab.renamedName).toBe("button");
      expect(full.hiddenCount).toBe(4);
      expect(actorText(full)).not.toContain("button");
    }
  });

  test("Vera loses the kebab to P4 and carries K1 and K4 on it all the same", () => {
    const vera = profileFixture("prof_vera");
    const cut = vera.perception.targetPx;
    if (!cut) throw new Error("Vera sets a target threshold");
    expect(vera.knowledge.unknownPatterns).toContain("kebab");
    for (const seed of seeds(20)) {
      const full = FullObservation.parse(perceive(WITH_KEBAB, vera, seed));
      const kebab = observed(full, KEBAB.key);
      // P4 removed it first, so A1 never ranks it: no attention decision.
      expect(kebab.decisions).toStrictEqual([
        {
          stage: "perception",
          rule: "P4",
          metric: "targetPx",
          value: KEBAB.metrics.targetPx,
          threshold: cut.threshold,
          state: "invisible",
        },
        ...K1_K4,
      ]);
      expect(kebab.renamedName).toBe("button");
      expect(actorText(full)).not.toContain("button");
    }
  });

  test("a renamed element perception degrades has no mask, and the Actor reads it whole", () => {
    // Kai with no cap and a soft target cut of 32, softness 0.5: the kebab's 28 px is in the band.
    const kai = withCap(profileFixture("prof_kai"), undefined);
    const soft: Profile = {
      ...kai,
      perception: {
        ...kai.perception,
        targetPx: { threshold: 32, softness: 0.5, provenance: "folk" },
      },
    };
    let degraded = 0;
    for (const seed of seeds(100)) {
      // The parse holds a renamed element to no mask, degraded or not.
      const full = FullObservation.parse(perceive(WITH_KEBAB, soft, seed));
      const kebab = observed(full, KEBAB.key);
      if (kebab.state !== "degraded") continue;
      degraded += 1;
      expect(kebab.decisions.map((d) => d.rule)).toEqual(["P4", "K1", "K4"]);
      expect(kebab.renamedName).toBe("button");
      // Never "partly legible": a renamed element reads its replacement whole.
      expect(actorText(full).split("\n")).toContain(`[${kebab.ref}] button "button" at 224,164`);
    }
    expect(degraded).toBeGreaterThan(0);
  });

  test("an element A1 cuts carries no mask, though perception degraded it", () => {
    // Vera with a cap of 1: Order archive, in her contrast band, is the least salient element.
    const vera = withCap(profileFixture("prof_vera"), 1);
    let degradedThenCut = 0;
    for (const seed of seeds(100)) {
      // Either way it ends invisible, so the parse holds it to no ref and no mask.
      const full = FullObservation.parse(perceive(measurementFixture, vera, seed));
      const archive = observed(full, ARCHIVE);
      const p1 = archive.decisions[0];
      if (p1?.stage !== "perception") throw new Error(`run seed ${seed}: P1 decides it first`);
      // A1 cuts only what stages 1 to 3 left shown: when P1 removed it, A1 leaves it alone.
      if (p1.state === "invisible") {
        expect(archive.decisions, `run seed ${seed}`).toStrictEqual([p1]);
        continue;
      }
      degradedThenCut += 1;
      expect(archive.decisions, `run seed ${seed}`).toStrictEqual([p1, A1]);
    }
    expect(degradedThenCut).toBeGreaterThan(0);
  });
});
