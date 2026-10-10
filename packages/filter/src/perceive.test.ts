/**
 * `perceive` against the acceptance boxes of `tasks/s1-01-perceive.md`, one test per box, named as
 * in the spec's acceptance mapping. No browser: the input is `measurementFixture`, measured once by
 * hand, and measurements derived from it. Elements are looked up by key, and measured values are
 * read from the fixture, so `s1-02` can regenerate the numbers without touching this file. The
 * only numbers written here are the ones `docs/RULES.md` states: Vera's 3.0 cut with its 1.5
 * floor, and the hard 3.0 cut of the calibration table.
 *
 * Stages 4 and 5 (`s1-03`) have their own tests in `knowledge.test.ts` and `attention.test.ts`.
 * K2 (`s1-05`) is tested at the end, on the fixture with lists written for the test: the match
 * rule is `vocabulary.test.ts`'s, and the target app's list on a real page is
 * `target-app-routes.browser.test.ts`'s.
 * A test here that is about perception unsets the persona's attention cap, as #113 has the sweep
 * use Vera, so it reads measurement order. That a real cap which cuts nothing only puts the same
 * evidence in salience order is `attention.test.ts`'s, for every capped persona.
 *
 * A control drawn in parts (#124) is tested last, on the fixture with `cardLinkElement` added: a
 * 20 px title and a 14 px description in one link.
 */
import {
  FullObservation,
  hash,
  MeasuredElement,
  type MetricName,
  type ObservedElement,
  PageMeasurement,
  type PerceptionState,
  type Profile,
  toActorObservation,
} from "@wayford/core";
import {
  cardLinkElement,
  kebabElement,
  measurementFixture,
  profileFixture,
  profileFixtures,
} from "@wayford/core/fixtures";
import { expect, test } from "vitest";
import { MASK_GLYPH, maskName } from "./mask.js";
import { type PerceiveProfile, perceive } from "./perceive.js";
import {
  actorText,
  K1_K4,
  observed,
  PERSONA_IDS,
  seeds,
  shownKeys,
  WITH_KEBAB,
  withCap,
  withKnowledge,
} from "./test-support.js";
import { UNFAMILIAR } from "./vocabulary.js";

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

const ARCHIVE = "main//link:Order archive";
const BRAND = "banner//link:Quillmere";
/** The footer's box of text (#219), the fixture's last element, below Order archive. */
const FOOTER = "contentinfo//text:Quillmere is a fictional demo shop. Not a real service.";
const CHECKBOXES = [
  "main//checkbox:Leave with a neighbour if I am out",
  "main//checkbox:Text me on the day of delivery",
];
const HEADINGS = [
  "main//heading:Deliveries",
  "main//heading:On the way",
  "main//heading:Delivery preferences",
];
const NAV_LINKS = [
  "banner/navigation:Main//link:Home",
  "banner/navigation:Main//link:Your account",
  "banner/navigation:Main//link:Deliveries",
  "banner/navigation:Main//link:Settings",
];
/** In Zoya's contrast band, and under her hard font cut. */
const LEAD = "main//paragraph:Parcels on the way and how you like to receive them.";
const ADDRESS_LINK = "main//link:Delivery address";

const KEYS = measurementFixture.elements.map((e) => e.key);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const steps = (from: number, to: number, by: number) =>
  Array.from({ length: Math.round((to - from) / by) + 1 }, (_, i) => from + i * by);

function measured(key: string) {
  const found = measurementFixture.elements.find((e) => e.key === key);
  if (!found) throw new Error(`No measured element ${key}`);
  return found;
}

function metric(key: string, name: MetricName): number {
  const value = measured(key).metrics[name];
  if (value === undefined) throw new Error(`${key} has no ${name}`);
  return value;
}

/** The roll a soft decision on the element stored, if any. */
function rollOf(element: FullObservation["elements"][number]): number | undefined {
  return element.decisions.flatMap((d) =>
    d.stage === "perception" && d.rolled !== undefined ? [d.rolled] : [],
  )[0];
}

/**
 * The fixture as it would be measured after scrolling down by `by` px: every box moves up by as
 * much, since boxes are in viewport coordinates.
 */
function scrolledBy(by: number): PageMeasurement {
  return PageMeasurement.parse({
    ...measurementFixture,
    scroll: { ...measurementFixture.scroll, y: measurementFixture.scroll.y + by },
    elements: measurementFixture.elements.map((e) => ({
      ...e,
      bbox: { ...e.bbox, y: e.bbox.y - by },
    })),
  });
}

const RANK: Record<PerceptionState, number> = { visible: 0, degraded: 1, invisible: 2 };

/**
 * Sweep one threshold upwards, run seed outer and threshold inner. Each element's state, and each
 * part's of a control drawn in parts, is compared with its state at the previous threshold for the
 * same run seed, so the sweep moves the threshold and nothing else. Returns every element or part
 * whose state got better, and how many state changes the sweep saw at all, so a sweep that changes
 * nothing cannot pass for monotone.
 */
function sweep(
  runSeeds: readonly number[],
  thresholds: readonly number[],
  profileAt: (threshold: number) => PerceiveProfile,
  page: PageMeasurement = measurementFixture,
): { improved: string[]; changes: number } {
  const keys = page.elements.map((e) => e.key);
  expect(new Set(keys).size, "keys are unique on the page").toBe(keys.length);
  expect(thresholds.every((t, i) => i === 0 || t > (thresholds[i - 1] ?? t))).toBe(true);
  const improved: string[] = [];
  let changes = 0;
  for (const seed of runSeeds) {
    let previous: Map<string, number> | undefined;
    for (const threshold of thresholds) {
      const full = perceive(page, profileAt(threshold), seed);
      const ranks = new Map(
        full.elements.flatMap((e) => [
          [e.key, RANK[e.state]] as const,
          ...(e.parts ?? []).map((part, i) => [`${e.key} part ${i}`, RANK[part.state]] as const),
        ]),
      );
      if (previous !== undefined) {
        for (const [key, rank] of ranks) {
          const before = previous.get(key);
          if (before === undefined) throw new Error(`${key} vanished from the evidence`);
          if (rank < before) improved.push(`${key} at run seed ${seed}, threshold ${threshold}`);
          if (rank !== before) changes += 1;
        }
      }
      previous = ranks;
    }
  }
  return { improved, changes };
}

/** Pearson's r of two equally long series. */
function correlation(xs: readonly number[], ys: readonly number[]): number {
  const mean = (vs: readonly number[]) => vs.reduce((sum, v) => sum + v, 0) / vs.length;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  xs.forEach((x, i) => {
    const dx = x - mx;
    const dy = (ys[i] ?? 0) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  });
  return sxy / Math.sqrt(sxx * syy);
}

// ---------------------------------------------------------------------------
// Acceptance boxes
// ---------------------------------------------------------------------------

test("same measurement, profile and run seed give the same Actor text", () => {
  expect(profileFixtures.map((p) => p.id)).toEqual(PERSONA_IDS);
  // The fixture, and the fixture with a control drawn in parts (#124).
  for (const page of [measurementFixture, WITH_CARD]) {
    for (const profile of profileFixtures) {
      for (const seed of seeds(100)) {
        const first = perceive(page, profile, seed);
        const second = perceive(page, profile, seed);
        expect(actorText(second), `${profile.id} at run seed ${seed}`).toBe(actorText(first));
        // The evidence too, byte for byte: key order included.
        expect(JSON.stringify(second), `${profile.id} at run seed ${seed}`).toBe(
          JSON.stringify(first),
        );
      }
    }
  }
});

test("the profile seed never changes the Actor text (A20)", () => {
  expect(profileFixtures.map((p) => p.id)).toEqual(PERSONA_IDS);
  for (const profile of profileFixtures) {
    const others = [0, (profile.seed + 1) % 2 ** 32, 2 ** 32 - 1].map((seed) => ({
      ...profile,
      seed,
    }));
    for (const runSeed of seeds(100)) {
      const text = actorText(perceive(measurementFixture, profile, runSeed));
      for (const other of others) {
        expect(
          actorText(perceive(measurementFixture, other, runSeed)),
          `${profile.id} with profile seed ${other.seed} at run seed ${runSeed}`,
        ).toBe(text);
      }
    }
  }
  // Not vacuous: the run seed does change what Vera reads.
  const vera = profileFixture("prof_vera");
  const texts = new Set(
    seeds(100).map((seed) => actorText(perceive(measurementFixture, vera, seed))),
  );
  expect(texts.size).toBeGreaterThan(1);
});

test("Ada sees every element inside the viewport", () => {
  const { viewport } = measurementFixture;
  const inside = measurementFixture.elements.every(
    ({ bbox }) =>
      bbox.x < viewport.width &&
      bbox.x + bbox.width > 0 &&
      bbox.y < viewport.height &&
      bbox.y + bbox.height > 0,
  );
  expect(inside, "every fixture element is inside the viewport").toBe(true);
  const ada = profileFixture("prof_ada");
  for (const seed of [1, 2, 3, 42, 2 ** 32 - 1]) {
    const full = perceive(measurementFixture, ada, seed);
    expect(full.elements.map((e) => e.key)).toEqual(KEYS);
    expect(full.elements.map((e) => e.state)).toEqual(KEYS.map(() => "visible"));
    expect(full.elements.map((e) => e.decisions)).toEqual(KEYS.map(() => []));
    expect(full.elements.map((e) => e.ref)).toEqual(KEYS.map((_, i) => `e${i + 1}`));
    expect(full.elements.some((e) => "maskedName" in e)).toBe(false);
    expect(full.belowFoldCount).toBe(0);
    expect(full.hiddenCount).toBe(0);
  }
});

test("a hard contrast cut of 3.0 removes Order archive", () => {
  const ada = profileFixture("prof_ada");
  const strict: Profile = {
    ...ada,
    perception: { ...ada.perception, contrast: { threshold: 3, provenance: "wcag22" } },
  };
  const expected = [
    {
      stage: "perception",
      rule: "P1",
      metric: "contrast",
      value: metric(ARCHIVE, "contrast"),
      threshold: 3,
      state: "invisible",
    },
  ];
  for (const seed of seeds(20)) {
    const full = perceive(measurementFixture, strict, seed);
    const actor = toActorObservation(full);
    expect(actor.elements.map((e) => e.name)).not.toContain("Order archive");
    expect(actor.elements).toHaveLength(KEYS.length - 1);
    expect(actorText(full)).not.toContain("Order archive");
    const archive = observed(full, ARCHIVE);
    expect(archive.state).toBe("invisible");
    expect("ref" in archive).toBe(false);
    expect(archive.decisions).toStrictEqual(expected);
    // A hard cut draws no roll, and the evidence lists the fields in schema order.
    expect(JSON.stringify(archive.decisions)).toBe(JSON.stringify(expected));
  }
});

test("Vera sees Order archive degraded at its band position", () => {
  const vera = profileFixture("prof_vera");
  const { contrast: cut, fontPx, targetPx } = vera.perception;
  if (!cut || !fontPx || !targetPx) throw new Error("Vera sets all three thresholds");
  // RULES, worked example: a 3.0 cut with softness 0.5, so the band runs from 1.5.
  expect(cut.threshold).toBe(3);
  expect(cut.softness).toBe(0.5);
  // P1 is the only rule it fails: 16 px passes her 16 px cut (`>=` passes), 36 px her 32 px one.
  expect(metric(ARCHIVE, "fontPx")).toBeGreaterThanOrEqual(fontPx.threshold);
  expect(metric(ARCHIVE, "targetPx")).toBeGreaterThanOrEqual(targetPx.threshold);
  const contrast = metric(ARCHIVE, "contrast");
  const position = (contrast - 1.5) / 1.5;
  let degraded = 0;
  let invisible = 0;
  for (const seed of seeds(1000)) {
    const archive = observed(perceive(measurementFixture, vera, seed), ARCHIVE);
    const rolled = hash(seed, ARCHIVE);
    expect(archive.state, `run seed ${seed}`).not.toBe("visible");
    expect(archive.decisions, `run seed ${seed}`).toStrictEqual([
      {
        stage: "perception",
        rule: "P1",
        metric: "contrast",
        value: contrast,
        threshold: cut.threshold,
        rolled,
        state: archive.state,
      },
    ]);
    if (archive.state === "degraded") {
      degraded += 1;
      expect(rolled, `run seed ${seed}`).toBeLessThan(position);
      expect(archive.ref, `run seed ${seed}`).toBeDefined();
      expect(archive.maskedName, `run seed ${seed}`).toBeDefined();
    } else {
      invisible += 1;
      expect(rolled, `run seed ${seed}`).toBeGreaterThanOrEqual(position);
      expect("ref" in archive, `run seed ${seed}`).toBe(false);
      expect("maskedName" in archive, `run seed ${seed}`).toBe(false);
    }
  }
  expect(degraded + invisible).toBe(1000);
  expect(Math.abs(degraded / 1000 - position)).toBeLessThanOrEqual(0.05);
});

test("raising the contrast threshold never improves a state", () => {
  const vera = withCap(profileFixture("prof_vera"), undefined);
  const { contrast } = vera.perception;
  if (!contrast) throw new Error("Vera sets a contrast threshold");
  // Softness held at hers: changing it could move an element back (RULES, "Monotone").
  expect(contrast.softness).toBe(0.5);
  const thresholds = steps(1, 8, 0.25);
  expect(thresholds).toHaveLength(29);
  expect(thresholds.at(-1)).toBe(8);
  const { improved, changes } = sweep(seeds(200), thresholds, (threshold) => ({
    ...vera,
    perception: { ...vera.perception, contrast: { ...contrast, threshold } },
  }));
  expect(improved).toEqual([]);
  expect(changes).toBeGreaterThan(0);
});

test("raising the font threshold never improves a state", () => {
  const vera = withCap(profileFixture("prof_vera"), undefined);
  const { fontPx } = vera.perception;
  if (!fontPx) throw new Error("Vera sets a font threshold");
  expect(fontPx.softness, "her font cut is hard").toBeUndefined();
  for (const softness of [undefined, 0.5]) {
    const { improved, changes } = sweep(seeds(50), steps(8, 32, 1), (threshold) => ({
      ...vera,
      perception: {
        ...vera.perception,
        fontPx:
          softness === undefined ? { ...fontPx, threshold } : { ...fontPx, threshold, softness },
      },
    }));
    expect(improved, `softness ${softness}`).toEqual([]);
    expect(changes, `softness ${softness}`).toBeGreaterThan(0);
  }
});

test("raising the target threshold never improves a state", () => {
  const vera = withCap(profileFixture("prof_vera"), undefined);
  const { targetPx } = vera.perception;
  if (!targetPx) throw new Error("Vera sets a target threshold");
  expect(targetPx.softness, "her target cut is hard").toBeUndefined();
  for (const softness of [undefined, 0.5]) {
    const { improved, changes } = sweep(seeds(50), steps(8, 64, 2), (threshold) => ({
      ...vera,
      perception: {
        ...vera.perception,
        targetPx:
          softness === undefined
            ? { ...targetPx, threshold }
            : { ...targetPx, threshold, softness },
      },
    }));
    expect(improved, `softness ${softness}`).toEqual([]);
    expect(changes, `softness ${softness}`).toBeGreaterThan(0);
  }
});

test("an element below the viewport is cut by V2 and counted", () => {
  const height = 600;
  const short = PageMeasurement.parse({
    ...measurementFixture,
    viewport: { ...measurementFixture.viewport, height },
  });
  const below = short.elements.filter((e) => e.bbox.y >= height).map((e) => e.key);
  expect(below, "only Order archive and the footer start below 600 px").toEqual([ARCHIVE, FOOTER]);

  const ada = profileFixture("prof_ada");
  for (const seed of seeds(5)) {
    const full = perceive(short, ada, seed);
    const archive = observed(full, ARCHIVE);
    expect(archive.state).toBe("invisible");
    expect("ref" in archive).toBe(false);
    expect(archive.decisions).toStrictEqual([{ stage: "viewport", rule: "V2", side: "below" }]);
    expect(observed(full, FOOTER).decisions).toStrictEqual(archive.decisions);
    expect(full.belowFoldCount).toBe(2);
    const others = full.elements.filter((e) => !below.includes(e.key));
    expect(others.every((e) => e.state === "visible" && e.decisions.length === 0)).toBe(true);
    const text = actorText(full);
    expect(text).not.toContain("Order archive");
    expect(text.endsWith("2 more below, scroll to see them")).toBe(true);
  }

  // Every rule it fails is recorded: V2, then the P1 it fails whatever the viewport.
  const vera = profileFixture("prof_vera");
  let degradedOnScreen = 0;
  for (const seed of seeds(50)) {
    const archive = observed(perceive(short, vera, seed), ARCHIVE);
    const onScreen = observed(perceive(measurementFixture, vera, seed), ARCHIVE);
    expect(archive.state, `run seed ${seed}`).toBe("invisible");
    expect(archive.decisions, `run seed ${seed}`).toStrictEqual([
      { stage: "viewport", rule: "V2", side: "below" },
      ...onScreen.decisions,
    ]);
    expect(onScreen.decisions.map((d) => d.rule)).toEqual(["P1"]);
    if (onScreen.state === "degraded") degradedOnScreen += 1;
  }
  // The worst state wins: a seed where P1 alone degrades it still leaves it invisible below.
  expect(degradedOnScreen).toBeGreaterThan(0);

  // On the edge: a box that starts exactly at the viewport's height does not reach into it.
  const scrolled = scrolledBy(measured(ARCHIVE).bbox.y - height);
  const edge = perceive({ ...scrolled, viewport: { ...scrolled.viewport, height } }, ada, 1);
  expect(observed(edge, ARCHIVE).bbox.y).toBe(height);
  expect(observed(edge, ARCHIVE).decisions).toStrictEqual([
    { stage: "viewport", rule: "V2", side: "below" },
  ]);
  // It and the footer under it.
  expect(edge.belowFoldCount).toBe(2);
});

test("an element above the viewport is cut by V2 and not counted", () => {
  const scrolled = scrolledBy(50);
  const ada = profileFixture("prof_ada");
  for (const seed of seeds(5)) {
    const full = perceive(scrolled, ada, seed);
    expect(full.elements.filter((e) => e.decisions.length > 0).map((e) => e.key)).toEqual([BRAND]);
    const brand = observed(full, BRAND);
    expect(brand.state).toBe("invisible");
    expect("ref" in brand).toBe(false);
    expect(brand.decisions).toStrictEqual([{ stage: "viewport", rule: "V2", side: "above" }]);
    expect(full.belowFoldCount).toBe(0);
    // The nav links end 8 px into the viewport: partly on screen is on screen.
    for (const key of NAV_LINKS) expect(observed(full, key).state, key).toBe("visible");
    const text = actorText(full);
    expect(text).not.toContain('link "Quillmere"');
    expect(text).not.toContain("more below");
  }

  // On the edge: a box that ends exactly at the top of the viewport does not reach into it.
  const { bbox } = measured(BRAND);
  const edge = perceive(scrolledBy(bbox.y + bbox.height), ada, 1);
  expect(observed(edge, BRAND).bbox.y + observed(edge, BRAND).bbox.height).toBe(0);
  expect(edge.elements.filter((e) => e.decisions.length > 0).map((e) => e.key)).toEqual([BRAND]);
  expect(observed(edge, BRAND).decisions).toStrictEqual([
    { stage: "viewport", rule: "V2", side: "above" },
  ]);
  expect(edge.belowFoldCount).toBe(0);
});

test("a zero-height box is inside the viewport at its top edge and below it at its bottom", () => {
  // The viewport is [0, height): a box with no height is the point y, inside from 0 up to height.
  const ada = profileFixture("prof_ada");
  const at = (y: number) => {
    const flat = {
      ...measurementFixture,
      elements: measurementFixture.elements.map((e) =>
        e.key === BRAND ? { ...e, bbox: { ...e.bbox, y, height: 0 } } : e,
      ),
    };
    return observed(perceive(flat, ada, 1), BRAND).decisions;
  };
  expect(at(0)).toStrictEqual([]);
  expect(at(719)).toStrictEqual([]);
  expect(at(720)).toStrictEqual([{ stage: "viewport", rule: "V2", side: "below" }]);
  expect(at(-0.5)).toStrictEqual([{ stage: "viewport", rule: "V2", side: "above" }]);
});

test("an element the page paints over is cut by V3, counted nowhere, and takes no slot (#229)", () => {
  // The nav under a cookie wall's backdrop: the four nav links measured as covered.
  const walled = PageMeasurement.parse({
    ...measurementFixture,
    elements: measurementFixture.elements.map((e) =>
      NAV_LINKS.includes(e.key) ? { ...e, covered: true } : e,
    ),
  });
  for (const profile of profileFixtures) {
    for (const seed of seeds(20)) {
      const where = `${profile.id} at run seed ${seed}`;
      const full = perceive(walled, profile, seed);
      const open = perceive(measurementFixture, profile, seed);
      for (const key of NAV_LINKS) {
        const link = observed(full, key);
        expect(link.state, `${where}: ${key}`).toBe("invisible");
        expect("ref" in link, `${where}: ${key}`).toBe(false);
        // V3 first, then every perception rule it fails, as on the open page; never A1.
        const before = observed(open, key).decisions.filter((d) => d.stage !== "attention");
        expect(link.decisions, `${where}: ${key}`).toStrictEqual([
          { stage: "viewport", rule: "V3" },
          ...before,
        ]);
      }
      // Counted nowhere, not even as more below, and the cap never reached it.
      expect(full.belowFoldCount, where).toBe(open.belowFoldCount);
      expect(actorText(full), where).not.toContain('link "Deliveries"');
      const parsed = FullObservation.safeParse(full);
      expect(parsed.success, `${where}: ${parsed.error}`).toBe(true);
    }
  }

  // Kai's cap of 11 cuts 4 of the 15 elements, Order archive the least salient. With four of
  // them covered, 11 are left to show: the cap cuts none, and Order archive reaches him.
  const kai = profileFixture("prof_kai");
  for (const seed of seeds(5)) {
    expect(perceive(measurementFixture, kai, seed).hiddenCount).toBe(4);
    expect(observed(perceive(measurementFixture, kai, seed), ARCHIVE).state).toBe("invisible");
    const full = perceive(walled, kai, seed);
    expect(full.hiddenCount).toBe(0);
    expect(observed(full, ARCHIVE).state).toBe("visible");
  }

  // V2 wins: an element wholly off screen gets V2 alone, whatever the measurement says of it.
  const offScreen = {
    ...walled,
    elements: walled.elements.map((e) =>
      e.key === NAV_LINKS[0] ? { ...e, bbox: { ...e.bbox, x: walled.viewport.width } } : e,
    ),
  };
  const ada = profileFixture("prof_ada");
  expect(observed(perceive(offScreen, ada, 1), NAV_LINKS[0] ?? "").decisions).toStrictEqual([
    { stage: "viewport", rule: "V2", side: "right" },
  ]);
});

test("the mask reads its own draw, not the roll", () => {
  const vera = profileFixture("prof_vera");
  const { name } = measured(ARCHIVE);
  const n = [...name].filter((char) => !/\s/u.test(char)).length;
  const counts: number[] = [];
  const rolls: number[] = [];
  for (const seed of seeds(1000)) {
    const full = perceive(measurementFixture, vera, seed);
    const archive = observed(full, ARCHIVE);
    if (archive.state !== "degraded") continue;
    const again = observed(perceive(measurementFixture, vera, seed), ARCHIVE);
    const masked = archive.maskedName ?? "";
    expect(again.maskedName, `run seed ${seed}`).toBe(masked);
    expect(masked, `run seed ${seed}`).toBe(maskName(seed, ARCHIVE, name));
    const count = [...masked].filter((char) => char === MASK_GLYPH).length;
    expect(count, `run seed ${seed}`).toBeGreaterThanOrEqual(1);
    expect(count, `run seed ${seed}`).toBeLessThanOrEqual(n - 1);
    expect(count, `run seed ${seed}`).toBe(1 + Math.floor(hash(seed, `${ARCHIVE}:mask`) * (n - 1)));
    // The Actor reads the mask, never the name.
    const text = actorText(full);
    expect(text).toContain(`${JSON.stringify(masked)} at`);
    expect(text).not.toContain(JSON.stringify(name));
    const rolled = rollOf(archive);
    if (rolled === undefined)
      throw new Error(`run seed ${seed}: a degraded element stores its roll`);
    counts.push(count);
    rolls.push(rolled);
  }
  expect(counts.length).toBeGreaterThan(200);
  expect(Math.abs(correlation(counts, rolls))).toBeLessThanOrEqual(0.2);
});

// ---------------------------------------------------------------------------
// Also covered, not a box
// ---------------------------------------------------------------------------

test("every observation parses as FullObservation", () => {
  expect(profileFixtures.map((p) => p.id)).toEqual(PERSONA_IDS);
  // The fixture, and the fixture with a control drawn in parts (#124).
  for (const page of [measurementFixture, WITH_CARD]) {
    for (const profile of profileFixtures) {
      for (const seed of seeds(100)) {
        const parsed = FullObservation.safeParse(perceive(page, profile, seed));
        expect(parsed.success, `${profile.id} at run seed ${seed}: ${parsed.error}`).toBe(true);
      }
    }
  }
});

test("what perception removes below the viewport is not counted (#118)", () => {
  // The fixture at viewport height 600, as in the V2 box: Order archive and the footer are below.
  const short = PageMeasurement.parse({
    ...measurementFixture,
    viewport: { ...measurementFixture.viewport, height: 600 },
  });
  const counted = new Map<string, number>();
  for (const profile of profileFixtures) {
    let seedsCounted = 0;
    for (const seed of seeds(50)) {
      const where = `${profile.id} at run seed ${seed}`;
      const full = perceive(short, profile, seed);
      const onScreen = perceive(measurementFixture, profile, seed);
      // Counted only when perception alone leaves it shown: scrolling could bring it into view.
      const shownBelow = (key: string) => {
        // On screen Order archive is the least salient element and the footer the next, and
        // Kai's cap cuts both. Below the viewport A1 never reaches them: V2 removed them first,
        // and A1 cuts only what stages 1 to 3 left shown.
        const before = observed(onScreen, key).decisions.filter((d) => d.stage !== "attention");
        // Every element below keeps its V2 decision, whatever perception did to it.
        expect(observed(full, key).decisions, `${where}: ${key}`).toStrictEqual([
          { stage: "viewport", rule: "V2", side: "below" },
          ...before,
        ]);
        return !before.some((d) => d.stage === "perception" && d.state === "invisible");
      };
      const shown = shownBelow(ARCHIVE);
      const count = [shown, shownBelow(FOOTER)].filter(Boolean).length;
      expect(full.belowFoldCount, where).toBe(count);
      expect(actorText(full).includes("more below"), where).toBe(count > 0);
      const parsed = FullObservation.safeParse(full);
      expect(parsed.success, `${where}: ${parsed.error}`).toBe(true);
      if (shown) seedsCounted += 1;
    }
    counted.set(profile.id, seedsCounted);
  }
  // Ada and Kai always. Milo never (P4), nor Zoya (P1, P3 and P4). Vera on the seeds where P1
  // degrades it.
  expect(counted.get("prof_ada")).toBe(50);
  expect(counted.get("prof_kai")).toBe(50);
  expect(counted.get("prof_milo")).toBe(0);
  expect(counted.get("prof_zoya")).toBe(0);
  expect(counted.get("prof_vera")).toBeGreaterThan(0);
  expect(counted.get("prof_vera")).toBeLessThan(50);
});

test("an element left or right of the viewport is cut by V2 and not counted (#116)", () => {
  const ada = profileFixture("prof_ada");
  const { width, height } = measurementFixture.viewport;
  const { bbox } = measured(BRAND);
  /** Ada on the fixture with the brand link's box moved, everything else in place. */
  const brandAt = (box: { x?: number; y?: number; width?: number }) =>
    perceive(
      {
        ...measurementFixture,
        elements: measurementFixture.elements.map((e) =>
          e.key === BRAND ? { ...e, bbox: { ...e.bbox, ...box } } : e,
        ),
      },
      ada,
      1,
    );
  const decisionsAt = (box: { x?: number; y?: number; width?: number }) =>
    observed(brandAt(box), BRAND).decisions;
  const right = [{ stage: "viewport", rule: "V2", side: "right" }];
  const left = [{ stage: "viewport", rule: "V2", side: "left" }];

  // The viewport is [0, width): a box that starts at the width is right of it, one that ends at 0
  // is left of it, and one that reaches half a pixel into it is inside.
  expect(decisionsAt({ x: width })).toStrictEqual(right);
  expect(decisionsAt({ x: width + 500 })).toStrictEqual(right);
  expect(decisionsAt({ x: width - 0.5 })).toStrictEqual([]);
  expect(decisionsAt({ x: -bbox.width })).toStrictEqual(left);
  expect(decisionsAt({ x: -2000 })).toStrictEqual(left);
  expect(decisionsAt({ x: 0.5 - bbox.width })).toStrictEqual([]);
  // A zero-width box is the line x: inside from 0 up to the width.
  expect(decisionsAt({ x: 0, width: 0 })).toStrictEqual([]);
  expect(decisionsAt({ x: -0.5, width: 0 })).toStrictEqual(left);

  for (const x of [width, -bbox.width]) {
    const full = brandAt({ x });
    const brand = observed(full, BRAND);
    expect(brand.state, `x ${x}`).toBe("invisible");
    expect("ref" in brand, `x ${x}`).toBe(false);
    expect(full.belowFoldCount, `x ${x}`).toBe(0);
    const text = actorText(full);
    expect(text, `x ${x}`).not.toContain('link "Quillmere"');
    expect(text, `x ${x}`).not.toContain("more below");
  }

  // Off a corner the horizontal wins: the Actor scrolls only up and down, so no scroll shows it.
  expect(brandAt({ y: height + 10 }).belowFoldCount).toBe(1);
  const corner = brandAt({ x: width + 10, y: height + 10 });
  expect(observed(corner, BRAND).decisions).toStrictEqual(right);
  expect(corner.belowFoldCount).toBe(0);
  expect(actorText(corner)).not.toContain("more below");
  expect(decisionsAt({ x: -2000, y: -2000 })).toStrictEqual(left);
});

test("Milo loses the brand link and Order archive to P4", () => {
  const milo = withCap(profileFixture("prof_milo"), undefined);
  const cut = milo.perception.targetPx;
  if (!cut) throw new Error("Milo sets a target threshold");
  // A checkbox's target is the area a click activates, its label's box (#117): he keeps both.
  for (const key of CHECKBOXES) {
    expect(metric(key, "targetPx"), key).toBeGreaterThanOrEqual(cut.threshold);
  }
  const lost = [BRAND, ARCHIVE];
  const kept = KEYS.filter((key) => !lost.includes(key));
  expect(kept).toHaveLength(13);
  for (const seed of seeds(10)) {
    const full = perceive(measurementFixture, milo, seed);
    expect(shownKeys(full)).toEqual(kept);
    for (const key of lost) {
      expect(observed(full, key).decisions, key).toStrictEqual([
        {
          stage: "perception",
          rule: "P4",
          metric: "targetPx",
          value: metric(key, "targetPx"),
          threshold: cut.threshold,
          state: "invisible",
        },
      ]);
    }
    const shown = kept.map((key) => observed(full, key));
    expect(shown.map((e) => e.ref)).toEqual(kept.map((_, i) => `e${i + 1}`));
    expect(shown.every((e) => e.state === "visible" && e.decisions.length === 0)).toBe(true);
  }
});

test("Vera loses the brand link to P4", () => {
  const vera = withCap(profileFixture("prof_vera"), undefined);
  const cut = vera.perception.targetPx;
  if (!cut) throw new Error("Vera sets a target threshold");
  // A checkbox's target is the area a click activates, its label's box (#117): she keeps both.
  for (const key of CHECKBOXES) {
    expect(metric(key, "targetPx"), key).toBeGreaterThanOrEqual(cut.threshold);
  }
  const lost = [BRAND];
  // Order archive is in her contrast band: shown or not by the roll, the test above.
  const kept = KEYS.filter((key) => !lost.includes(key) && key !== ARCHIVE);
  expect(kept).toHaveLength(13);
  for (const seed of seeds(10)) {
    const full = perceive(measurementFixture, vera, seed);
    expect(shownKeys(full).filter((key) => key !== ARCHIVE)).toEqual(kept);
    for (const key of lost) {
      expect(observed(full, key).decisions, key).toStrictEqual([
        {
          stage: "perception",
          rule: "P4",
          metric: "targetPx",
          value: metric(key, "targetPx"),
          threshold: cut.threshold,
          state: "invisible",
        },
      ]);
    }
    const shown = kept.map((key) => observed(full, key));
    expect(shown.every((e) => e.state === "visible" && e.decisions.length === 0)).toBe(true);
  }
});

test("Zoya sees only the three headings", () => {
  const zoya = withCap(profileFixture("prof_zoya"), undefined);
  const { contrast, fontPx } = zoya.perception;
  if (!contrast || !fontPx) throw new Error("Zoya sets contrast and font thresholds");
  const floor = contrast.threshold * (1 - (contrast.softness ?? 0));
  const inBand = [LEAD, ADDRESS_LINK];
  for (const key of inBand) {
    expect(metric(key, "contrast"), key).toBeGreaterThanOrEqual(floor);
    expect(metric(key, "contrast"), key).toBeLessThan(contrast.threshold);
  }
  let degradedByP1 = 0;
  for (const seed of seeds(20)) {
    const full = perceive(measurementFixture, zoya, seed);
    expect(shownKeys(full), `run seed ${seed}`).toEqual(HEADINGS);
    for (const key of inBand) {
      const element = observed(full, key);
      expect(element.state, key).toBe("invisible");
      expect(
        element.decisions.map((d) => d.rule),
        key,
      ).toEqual(["P1", "P3"]);
      // Her hard font cut removes it, whatever the roll gave P1.
      expect(element.decisions[1], key).toStrictEqual({
        stage: "perception",
        rule: "P3",
        metric: "fontPx",
        value: metric(key, "fontPx"),
        threshold: fontPx.threshold,
        state: "invisible",
      });
      expect(rollOf(element), key).toBe(hash(seed, key));
      if (
        element.decisions[0]?.stage === "perception" &&
        element.decisions[0].state === "degraded"
      ) {
        degradedByP1 += 1;
      }
    }
  }
  expect(degradedByP1, "P1 alone would have shown some of them").toBeGreaterThan(0);

  // #117: the checkboxes' 46 px label area still fails her 48 px target cut, not only her font cut.
  const { targetPx } = zoya.perception;
  if (!targetPx) throw new Error("Zoya sets a target threshold");
  const full = perceive(measurementFixture, zoya, 1);
  for (const key of CHECKBOXES) {
    expect(observed(full, key).decisions, key).toContainEqual({
      stage: "perception",
      rule: "P4",
      metric: "targetPx",
      value: 46,
      threshold: targetPx.threshold,
      state: "invisible",
    });
  }
});

test("perceive does not change the measurement", () => {
  const vera = profileFixture("prof_vera");
  const before = structuredClone(measurementFixture);
  const full = perceive(measurementFixture, vera, 7);
  expect(measurementFixture).toStrictEqual(before);
  const archive = observed(full, ARCHIVE);
  expect(archive.bbox).not.toBe(measured(ARCHIVE).bbox);
  expect(archive.metrics).not.toBe(measured(ARCHIVE).metrics);
  expect(full.viewport).not.toBe(measurementFixture.viewport);
  archive.bbox.x = 9999;
  archive.metrics.contrast = 21;
  full.viewport.height = 1;
  expect(measurementFixture).toStrictEqual(before);
});

test("a run seed outside Seed throws, whatever the profile", () => {
  // Ada draws no roll and no mask, so without the check her observation would hide the bug.
  for (const profile of profileFixtures) {
    for (const seed of [-1, 1.5, 2 ** 32, Number.NaN]) {
      expect(() => perceive(measurementFixture, profile, seed), `${profile.id} ${seed}`).toThrow(
        RangeError,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// s1-05: K2 vocabulary
// ---------------------------------------------------------------------------

const KEBAB = kebabElement.key;

/** The stage 4 decisions on one element. */
const knowledgeOf = (full: FullObservation, key: string) =>
  observed(full, key).decisions.filter((d) => d.stage === "knowledge");

/** Kai with no attention cap, so every element on the fixture is shown. */
const uncappedKai = () => withCap(profileFixture("prof_kai"), undefined);

test("K2 is off without a vocabulary or without a jargon list", () => {
  const kai = profileFixture("prof_kai");
  const ada = profileFixture("prof_ada");
  expect(kai.knowledge.domainVocabulary).toBeDefined();
  expect(ada.knowledge.domainVocabulary).toBeUndefined();
  // "order" is in Kai's vocabulary and "archive" is not, so he does not know the phrase.
  const jargon = ["Order archive"];
  for (const seed of seeds(20)) {
    // Not vacuous: with both, K2 fires on the link, which Kai's cap cuts on the fixture.
    const on = perceive(measurementFixture, kai, seed, { jargon });
    expect(knowledgeOf(on, ARCHIVE), `run seed ${seed}`).toStrictEqual([
      { stage: "knowledge", rule: "K2", terms: ["Order archive"] },
    ]);
    const cases = [
      ["Ada, with the list", ada, { jargon }],
      ["Kai, no list", kai, {}],
      ["Kai, an empty list", kai, { jargon: [] }],
    ] as const;
    for (const [label, profile, options] of cases) {
      const where = `${label}, run seed ${seed}`;
      const off = perceive(measurementFixture, profile, seed, options);
      expect(
        off.elements.filter((e) => e.decisions.some((d) => d.stage === "knowledge")),
        where,
      ).toStrictEqual([]);
      expect(JSON.stringify(off), where).toBe(
        JSON.stringify(perceive(measurementFixture, profile, seed)),
      );
    }
  }
});

test("K1, K2, K4 are listed in that order on an element both rules hit", () => {
  // Kai does not know the kebab, and "options" is not in his vocabulary.
  const full = perceive(WITH_KEBAB, uncappedKai(), 1, { jargon: ["options"] });
  const [k1, k4] = K1_K4;
  expect(observed(full, KEBAB).decisions).toStrictEqual([
    k1,
    { stage: "knowledge", rule: "K2", terms: ["options"] },
    k4,
  ]);
  const parsed = FullObservation.safeParse(full);
  expect(parsed.success, `${parsed.error}`).toBe(true);
});

test("K1 and K4 win the name over K2, and K2 alone renames to its replacement", () => {
  const kai = uncappedKai();
  const jargon = ["options"];
  const at = `${kebabElement.bbox.x},${kebabElement.bbox.y}`;
  // A persona that knows the kebab, so K2 alone renames it.
  const knowsKebab = withKnowledge(kai, {
    unknownPatterns: kai.knowledge.unknownPatterns.filter((p) => p !== "kebab"),
  });
  for (const seed of seeds(20)) {
    const where = `run seed ${seed}`;
    const full = perceive(WITH_KEBAB, kai, seed, { jargon });
    const kebab = observed(full, KEBAB);
    // The bare role holds no jargon, so it already covers K2.
    expect(kebab.renamedName, where).toBe("button");
    expect(kebab.state, where).toBe("visible");
    const text = actorText(full);
    expect(text.split("\n"), where).toContain(`[${kebab.ref}] button "button" at ${at}`);
    expect(text, where).not.toContain(UNFAMILIAR);
    expect(text, where).not.toContain("More options");

    const alone = perceive(WITH_KEBAB, knowsKebab, seed, { jargon });
    const renamed = observed(alone, KEBAB);
    expect(renamed.decisions, where).toStrictEqual([
      { stage: "knowledge", rule: "K2", terms: ["options"] },
    ]);
    expect(renamed.renamedName, where).toBe(`More ${UNFAMILIAR}`);
    expect(actorText(alone).split("\n"), where).toContain(
      `[${renamed.ref}] button "More ${UNFAMILIAR}" at ${at}`,
    );
  }
});

test("a degraded element K2 renames reads its replacement whole", () => {
  // Vera's contrast band degrades Order archive on some seeds. With a vocabulary that knows
  // "order" and a list that flags "archive", K2 renames it, and the Actor reads the replacement,
  // never a mask. The rest of the name reaches the model unmasked: the known understatement of
  // RULES, "Several rules".
  const profile = withKnowledge(profileFixture("prof_vera"), { domainVocabulary: ["order"] });
  let degraded = 0;
  for (const seed of seeds(200)) {
    const where = `run seed ${seed}`;
    const full = perceive(measurementFixture, profile, seed, { jargon: ["archive"] });
    const archive = observed(full, ARCHIVE);
    expect(
      archive.decisions.map((d) => d.rule),
      where,
    ).toStrictEqual(["P1", "K2"]);
    expect(knowledgeOf(full, ARCHIVE), where).toStrictEqual([
      { stage: "knowledge", rule: "K2", terms: ["archive"] },
    ]);
    expect(archive.renamedName, where).toBe(`Order ${UNFAMILIAR}`);
    expect("maskedName" in archive, where).toBe(false);
    const parsed = FullObservation.safeParse(full);
    expect(parsed.success, `${where}: ${parsed.error}`).toBe(true);
    if (archive.state !== "degraded") continue;
    degraded += 1;
    const text = actorText(full);
    expect(text, where).toContain(`[${archive.ref}] link "Order ${UNFAMILIAR}" at `);
    expect(text, where).not.toContain(MASK_GLYPH);
  }
  expect(degraded, "Vera's band degrades it on some seeds").toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// #124: a control drawn in parts
// ---------------------------------------------------------------------------

const CARD = cardLinkElement.key;
const TITLE = "Job Offers";
const AT_CARD = `${cardLinkElement.bbox.x},${cardLinkElement.bbox.y}`;

/** The fixture with the card link added, last in measurement order. */
const WITH_CARD = PageMeasurement.parse({
  ...measurementFixture,
  elements: [...measurementFixture.elements, cardLinkElement],
});

/** The card link's two parts, as measured: its 20 px title and its 14 px description. */
function cardParts() {
  const [title, description] = cardLinkElement.parts ?? [];
  if (title === undefined || description === undefined || cardLinkElement.parts?.length !== 2) {
    throw new Error("the card link is drawn in two parts");
  }
  expect(title.text).toBe(TITLE);
  return { title, description };
}

/** Vera with no attention cap, and her font cut's threshold and softness replaced. */
function veraWithFont(fontPx: { threshold: number; softness?: number }): Profile {
  const vera = withCap(profileFixture("prof_vera"), undefined);
  const own = vera.perception.fontPx;
  if (!own) throw new Error("Vera sets a font threshold");
  return { ...vera, perception: { ...vera.perception, fontPx: { ...own, ...fontPx } } };
}

/** The P3 decision a hard font cut gives a value below it. */
const p3Cut = (value: number | undefined, threshold: number) => ({
  stage: "perception",
  rule: "P3",
  metric: "fontPx",
  value,
  threshold,
  state: "invisible",
});

/** The line the Actor reads for the card link. */
const cardLine = (card: ObservedElement, name: string, legibility = "") =>
  `[${card.ref}] link ${JSON.stringify(name)} at ${AT_CARD}${legibility}`;

test("under a 16 px font cut a card link is shown by its title, its description cut (#124)", () => {
  const vera = withCap(profileFixture("prof_vera"), undefined);
  const { contrast, fontPx, targetPx } = vera.perception;
  if (!contrast || !fontPx || !targetPx) throw new Error("Vera sets all three thresholds");
  const { title, description } = cardParts();
  // Her hard font cut is the one rule a part fails: the description's 14 px, not the title's 20.
  expect(fontPx.softness).toBeUndefined();
  expect(title.metrics.fontPx).toBeGreaterThanOrEqual(fontPx.threshold);
  expect(description.metrics.fontPx).toBeLessThan(fontPx.threshold);
  for (const { metrics } of [title, description]) {
    expect(metrics.contrast).toBeGreaterThanOrEqual(contrast.threshold);
  }
  expect(cardLinkElement.metrics.targetPx).toBeGreaterThanOrEqual(targetPx.threshold);
  // Measured whole, by the worst of its runs, the link would fail P3 too, title included.
  expect(cardLinkElement.metrics.fontPx).toBeLessThan(fontPx.threshold);
  for (const seed of seeds(20)) {
    const where = `run seed ${seed}`;
    const full = perceive(WITH_CARD, vera, seed);
    const card = observed(full, CARD);
    expect(card.state, where).toBe("visible");
    expect(card.decisions, where).toStrictEqual([]);
    expect(card.parts, where).toStrictEqual([
      { text: title.text, metrics: title.metrics, state: "visible", decisions: [] },
      {
        text: description.text,
        metrics: description.metrics,
        state: "invisible",
        decisions: [p3Cut(description.metrics.fontPx, fontPx.threshold)],
      },
    ]);
    expect(card.shownName, where).toBe(TITLE);
    expect("maskedName" in card, where).toBe(false);
    const actor = toActorObservation(full).elements.find((e) => e.ref === card.ref);
    expect(actor?.name, where).toBe(TITLE);
    const text = actorText(full);
    expect(text.split("\n"), where).toContain(cardLine(card, TITLE));
    expect(text, where).not.toContain(description.text);
    const parsed = FullObservation.safeParse(full);
    expect(parsed.success, `${where}: ${parsed.error}`).toBe(true);
  }
  // The evidence holds copies: a caller cannot change the measurement through it.
  const card = observed(perceive(WITH_CARD, vera, 1), CARD);
  expect(card.parts?.[0]?.metrics).not.toBe(title.metrics);
});

test("a control in parts that loses no part reads its whole name", () => {
  const ada = profileFixture("prof_ada");
  const { title, description } = cardParts();
  for (const seed of seeds(5)) {
    const full = perceive(WITH_CARD, ada, seed);
    const card = observed(full, CARD);
    expect(card.state).toBe("visible");
    expect(card.parts).toStrictEqual([
      { text: title.text, metrics: title.metrics, state: "visible", decisions: [] },
      { text: description.text, metrics: description.metrics, state: "visible", decisions: [] },
    ]);
    expect("shownName" in card).toBe(false);
    expect(actorText(full).split("\n")).toContain(cardLine(card, cardLinkElement.name));
  }
});

test("a card link is cut only when every part is cut", () => {
  const profile = veraWithFont({ threshold: 24 });
  const { title, description } = cardParts();
  expect(title.metrics.fontPx).toBeLessThan(24);
  for (const seed of seeds(20)) {
    const where = `run seed ${seed}`;
    const full = perceive(WITH_CARD, profile, seed);
    const card = observed(full, CARD);
    expect(card.state, where).toBe("invisible");
    expect("ref" in card, where).toBe(false);
    expect("shownName" in card, where).toBe(false);
    expect(
      card.parts?.map((part) => [part.state, part.decisions]),
      where,
    ).toStrictEqual([
      ["invisible", [p3Cut(title.metrics.fontPx, 24)]],
      ["invisible", [p3Cut(description.metrics.fontPx, 24)]],
    ]);
    // Both are cut, so the first in document order, the title, gives the link its decisions.
    expect(card.decisions, where).toStrictEqual([p3Cut(title.metrics.fontPx, 24)]);
    const text = actorText(full);
    expect(text, where).not.toContain(TITLE);
    expect(text, where).not.toContain(description.text);
    const parsed = FullObservation.safeParse(full);
    expect(parsed.success, `${where}: ${parsed.error}`).toBe(true);
  }
});

test("the best part decides wherever it stands in the control", () => {
  // The same link with its description drawn first: the cut first part does not cut it.
  const reversed = MeasuredElement.parse({
    ...cardLinkElement,
    parts: [...(cardLinkElement.parts ?? [])].reverse(),
  });
  const page = PageMeasurement.parse({
    ...measurementFixture,
    elements: [...measurementFixture.elements, reversed],
  });
  const vera = withCap(profileFixture("prof_vera"), undefined);
  for (const seed of seeds(5)) {
    const full = perceive(page, vera, seed);
    const card = observed(full, CARD);
    expect(card.parts?.map((part) => part.state)).toStrictEqual(["invisible", "visible"]);
    expect(card.state).toBe("visible");
    expect(card.decisions).toStrictEqual([]);
    expect(card.shownName).toBe(TITLE);
    expect(actorText(full).split("\n")).toContain(cardLine(card, TITLE));
  }
});

test("every part is judged with the control's one roll, and a degraded control masks its shown name", () => {
  // A soft 22 px cut: the band runs from 11 px, so the title sits at 9/11 of it and the
  // description at 3/11, and the one roll decides both.
  const profile = veraWithFont({ threshold: 22, softness: 0.5 });
  const { title, description } = cardParts();
  const position = (px: number | undefined) => ((px ?? 0) - 11) / 11;
  const seen = { both: 0, title: 0, none: 0 };
  for (const seed of seeds(300)) {
    const where = `run seed ${seed}`;
    const rolled = hash(seed, CARD);
    const full = perceive(WITH_CARD, profile, seed);
    const card = observed(full, CARD);
    const parts = card.parts ?? [];
    expect(
      parts.flatMap((part) => part.decisions.map((d) => d.rolled)),
      where,
    ).toStrictEqual([rolled, rolled]);
    const states = [title, description].map(({ metrics }) =>
      rolled < position(metrics.fontPx) ? "degraded" : "invisible",
    );
    expect(
      parts.map((part) => part.state),
      where,
    ).toStrictEqual(states);
    // The title is never worse than the description, so it is the best part, ties included.
    expect(card.decisions, where).toStrictEqual(parts[0]?.decisions);
    expect(card.state, where).toBe(states[0]);
    expect(rollOf(card), where).toBe(rolled);
    const parsed = FullObservation.safeParse(full);
    expect(parsed.success, `${where}: ${parsed.error}`).toBe(true);
    if (card.state === "degraded") {
      // The mask is of what is shown: the title alone when the description is cut.
      const read = card.shownName ?? card.name;
      const masked = card.maskedName ?? "";
      expect(masked, where).toBe(maskName(seed, CARD, read));
      expect([...masked].length, where).toBe([...read].length);
      const text = actorText(full);
      expect(text.split("\n"), where).toContain(cardLine(card, masked, ", partly legible"));
      if (states[1] === "invisible") {
        expect(card.shownName, where).toBe(TITLE);
        expect(text, where).not.toContain(description.text);
      } else {
        expect("shownName" in card, where).toBe(false);
      }
    }
    if (states[1] === "degraded") seen.both += 1;
    else if (states[0] === "degraded") seen.title += 1;
    else seen.none += 1;
  }
  expect(seen.both, "both parts degraded on some seeds").toBeGreaterThan(0);
  expect(seen.title, "the title alone degraded on some seeds").toBeGreaterThan(0);
  expect(seen.none, "both parts cut on some seeds").toBeGreaterThan(0);
});

test("a degraded part beside a visible one is left out of the shown name, never read whole", () => {
  // A soft 6:1 contrast cut and a font cut both parts pass: the band runs from 3:1, so the
  // description's 4.542:1 is degraded or cut by the roll, and the title's 21:1 is clear.
  const vera = veraWithFont({ threshold: 14 });
  const contrast = vera.perception.contrast;
  if (!contrast) throw new Error("Vera sets a contrast threshold");
  const profile: Profile = {
    ...vera,
    perception: { ...vera.perception, contrast: { ...contrast, threshold: 6, softness: 0.5 } },
  };
  const { description } = cardParts();
  let degraded = 0;
  for (const seed of seeds(300)) {
    const where = `run seed ${seed}`;
    const full = perceive(WITH_CARD, profile, seed);
    const card = observed(full, CARD);
    const states = card.parts?.map((part) => part.state);
    expect(states?.[0], where).toBe("visible");
    if (states?.[1] === "degraded") degraded += 1;
    // Read whole, the description would reach the model as if it were clear (#124's review).
    expect(card.state, where).toBe("visible");
    expect(card.decisions, where).toStrictEqual([]);
    expect(card.shownName, where).toBe(TITLE);
    const text = actorText(full);
    expect(text.split("\n"), where).toContain(cardLine(card, TITLE));
    expect(text, where).not.toContain(description.text);
    const parsed = FullObservation.safeParse(full);
    expect(parsed.success, `${where}: ${parsed.error}`).toBe(true);
  }
  expect(degraded, "the description degraded on some seeds").toBeGreaterThan(0);
});

test("K2 reads a control's shown name, so a rename never puts a cut part back", () => {
  const vera = withKnowledge(withCap(profileFixture("prof_vera"), undefined), {
    domainVocabulary: ["job"],
  });
  const { description } = cardParts();
  for (const seed of seeds(10)) {
    const where = `run seed ${seed}`;
    // "openings" is in the cut description, so K2 does not read it.
    const unread = perceive(WITH_CARD, vera, seed, { jargon: ["openings"] });
    const card = observed(unread, CARD);
    expect(card.shownName, where).toBe(TITLE);
    expect(knowledgeOf(unread, CARD), where).toStrictEqual([]);
    expect("renamedName" in card, where).toBe(false);
    expect(actorText(unread).split("\n"), where).toContain(cardLine(card, TITLE));

    // "Offers" is in the title: renamed in the shown name, with the description still out.
    const renamed = perceive(WITH_CARD, vera, seed, { jargon: ["offers"] });
    const titled = observed(renamed, CARD);
    expect(titled.decisions, where).toStrictEqual([
      { stage: "knowledge", rule: "K2", terms: ["offers"] },
    ]);
    expect(titled.renamedName, where).toBe(`Job ${UNFAMILIAR}`);
    const text = actorText(renamed);
    expect(text.split("\n"), where).toContain(cardLine(titled, `Job ${UNFAMILIAR}`));
    expect(text, where).not.toContain(description.text);
    const parsed = FullObservation.safeParse(renamed);
    expect(parsed.success, `${where}: ${parsed.error}`).toBe(true);
  }
  // With no font cut no part is cut, and K2 reads the whole name.
  const noFontCut = structuredClone(vera);
  delete noFontCut.perception.fontPx;
  const whole = observed(perceive(WITH_CARD, noFontCut, 1, { jargon: ["openings"] }), CARD);
  expect(whole.decisions).toStrictEqual([{ stage: "knowledge", rule: "K2", terms: ["openings"] }]);
  expect(whole.renamedName).toBe(`Job Offers Dive into our job ${UNFAMILIAR}`);
  // A control whose every part is cut has no shown name: K2 reads its name, as on any element
  // perception removed.
  const cutVera = withKnowledge(veraWithFont({ threshold: 24 }), { domainVocabulary: ["job"] });
  const cut = observed(perceive(WITH_CARD, cutVera, 1, { jargon: ["openings"] }), CARD);
  expect(cut.state).toBe("invisible");
  expect(cut.renamedName).toBe(`Job Offers Dive into our job ${UNFAMILIAR}`);
});

test("raising a threshold never improves a part's state, nor the control's (#124)", () => {
  const vera = withCap(profileFixture("prof_vera"), undefined);
  const { contrast, fontPx: _fontPx, ...rest } = vera.perception;
  if (!contrast) throw new Error("Vera sets a contrast threshold");
  const cases: [label: string, thresholds: number[], at: (threshold: number) => Profile][] = [
    // Without her font cut, so the description's contrast decides it.
    [
      "contrast",
      steps(1, 22, 0.5),
      (threshold) => ({ ...vera, perception: { ...rest, contrast: { ...contrast, threshold } } }),
    ],
    ["a hard font cut", steps(8, 32, 1), (threshold) => veraWithFont({ threshold })],
    ["a soft font cut", steps(8, 32, 1), (threshold) => veraWithFont({ threshold, softness: 0.5 })],
  ];
  for (const [label, thresholds, at] of cases) {
    const { improved, changes } = sweep(seeds(50), thresholds, at, WITH_CARD);
    expect(improved, label).toEqual([]);
    expect(changes, label).toBeGreaterThan(0);
  }
});
