/**
 * `perceive` against the acceptance boxes of `tasks/s1-01-perceive.md`, one test per box, named as
 * in the spec's acceptance mapping. No browser: the input is `measurementFixture`, measured once by
 * hand, and measurements derived from it. Elements are looked up by key, and measured values are
 * read from the fixture, so `s1-02` can regenerate the numbers without touching this file. The
 * only numbers written here are the ones `docs/RULES.md` states: Vera's 3.0 cut with its 1.5
 * floor, and the hard 3.0 cut of the calibration table.
 *
 * Stages 4 and 5 (`s1-03`) have their own tests in `knowledge.test.ts` and `attention.test.ts`.
 * A test here that is about perception unsets the persona's attention cap, as #113 has the sweep
 * use Vera, so it reads measurement order. That a real cap which cuts nothing only puts the same
 * evidence in salience order is `attention.test.ts`'s, for every capped persona.
 */
import {
  FullObservation,
  hash,
  type MetricName,
  PageMeasurement,
  type PerceptionState,
  type Profile,
  toActorObservation,
} from "@wayford/core";
import { measurementFixture, profileFixture, profileFixtures } from "@wayford/core/fixtures";
import { expect, test } from "vitest";
import { MASK_GLYPH, maskName } from "./mask.js";
import { type PerceiveProfile, perceive } from "./perceive.js";
import { actorText, observed, PERSONA_IDS, seeds, shownKeys, withCap } from "./test-support.js";

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

const ARCHIVE = "main//link:Order archive";
const BRAND = "banner//link:Quillmere";
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
 * Sweep one threshold upwards, run seed outer and threshold inner. Each element's state is
 * compared with its state at the previous threshold for the same run seed, so the sweep moves the
 * threshold and nothing else. Returns every element whose state got better, and how many state
 * changes the sweep saw at all, so a sweep that changes nothing cannot pass for monotone.
 */
function sweep(
  runSeeds: readonly number[],
  thresholds: readonly number[],
  profileAt: (threshold: number) => PerceiveProfile,
): { improved: string[]; changes: number } {
  expect(new Set(KEYS).size, "keys are unique on the fixture").toBe(KEYS.length);
  expect(thresholds.every((t, i) => i === 0 || t > (thresholds[i - 1] ?? t))).toBe(true);
  const improved: string[] = [];
  let changes = 0;
  for (const seed of runSeeds) {
    let previous: Map<string, number> | undefined;
    for (const threshold of thresholds) {
      const full = perceive(measurementFixture, profileAt(threshold), seed);
      const ranks = new Map(full.elements.map((e) => [e.key, RANK[e.state]]));
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
  for (const profile of profileFixtures) {
    for (const seed of seeds(100)) {
      const first = perceive(measurementFixture, profile, seed);
      const second = perceive(measurementFixture, profile, seed);
      expect(actorText(second), `${profile.id} at run seed ${seed}`).toBe(actorText(first));
      // The evidence too, byte for byte: key order included.
      expect(JSON.stringify(second), `${profile.id} at run seed ${seed}`).toBe(
        JSON.stringify(first),
      );
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
  expect(below, "only Order archive starts below 600 px").toEqual([ARCHIVE]);

  const ada = profileFixture("prof_ada");
  for (const seed of seeds(5)) {
    const full = perceive(short, ada, seed);
    const archive = observed(full, ARCHIVE);
    expect(archive.state).toBe("invisible");
    expect("ref" in archive).toBe(false);
    expect(archive.decisions).toStrictEqual([{ stage: "viewport", rule: "V2", side: "below" }]);
    expect(full.belowFoldCount).toBe(1);
    const others = full.elements.filter((e) => e.key !== ARCHIVE);
    expect(others.every((e) => e.state === "visible" && e.decisions.length === 0)).toBe(true);
    const text = actorText(full);
    expect(text).not.toContain("Order archive");
    expect(text.endsWith("1 more below, scroll to see them")).toBe(true);
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
  expect(edge.belowFoldCount).toBe(1);
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
  for (const profile of profileFixtures) {
    for (const seed of seeds(100)) {
      const parsed = FullObservation.safeParse(perceive(measurementFixture, profile, seed));
      expect(parsed.success, `${profile.id} at run seed ${seed}: ${parsed.error}`).toBe(true);
    }
  }
});

test("what perception removes below the viewport is not counted (#118)", () => {
  // The fixture at viewport height 600, as in the V2 box: only Order archive is below.
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
      const onScreen = observed(perceive(measurementFixture, profile, seed), ARCHIVE);
      // On screen it is the least salient element, and Kai's cap cuts it. Below the viewport
      // A1 never reaches it: V2 removed it first, and A1 cuts only what stages 1 to 3 left shown.
      const before = onScreen.decisions.filter((d) => d.stage !== "attention");
      // Every element below keeps its V2 decision, whatever perception did to it.
      expect(observed(full, ARCHIVE).decisions, where).toStrictEqual([
        { stage: "viewport", rule: "V2", side: "below" },
        ...before,
      ]);
      // Counted only when perception alone leaves it shown: scrolling could bring it into view.
      const shown = !before.some((d) => d.stage === "perception" && d.state === "invisible");
      expect(full.belowFoldCount, where).toBe(shown ? 1 : 0);
      expect(actorText(full).includes("more below"), where).toBe(shown);
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
  expect(kept).toHaveLength(12);
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
  expect(kept).toHaveLength(12);
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
