/**
 * `PerceivedPage` against "Drawing" in `docs/specs/2026-10-01-s3-01-preview.md`. Every observation
 * comes from the real `perceive`, over `measurementFixture` or a measurement derived from it, for
 * persona fixtures. A case that hangs on a roll takes the first run seed that gives it, found by
 * looping, never hard-coded; the others take seed 1, which no hard cut reads. Between them the
 * cases hold visible, degraded and invisible elements, and a test checks that they do, so no
 * comparison can pass empty. Elements are looked up by key and measured values read from the fixture, as in
 * `perceive.test.ts`, so a regenerated measurement leaves this file alone.
 *
 * The markup is read back as the screen tests read it: a drawn box by its `data-ref`, `data-state`
 * and text, and by the measured px inside each `calc(N * var(--px))`. A look is read by the
 * `FILTER_STATE_CLASS` classes it carries, and the animation's tracking by `nextTrack` alone: a
 * static render has no second render, so it carries no animation.
 */
import {
  type Bbox,
  decisionState,
  type ElementDecision,
  FullObservation,
  type MeasuredElement,
  type MetricName,
  type ObservedElement,
  PageMeasurement,
  type Profile,
} from "@wayford/core";
import { kebabElement as KEBAB, measurementFixture, profileFixture } from "@wayford/core/fixtures";
import { perceive } from "@wayford/filter/perceive";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { FILTER_STATE_CLASS, type Look } from "../components/filter-states.js";
import { croppedHeight, flagRuns, nextTrack, PerceivedPage } from "./perceived-page.js";
import {
  attributesOf,
  bboxOf,
  captionOf,
  classesOf,
  decode,
  divsWith,
  drawnBoxes,
  measuredPx,
  shownElements,
  styleOf,
  textOf,
} from "./rendered-markup.js";

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

const ARCHIVE = "main//link:Order archive";
const BRAND = "banner//link:Quillmere";
/** The footer's box of text (#219), the fixture's lowest element, reaching past the fold. */
const FOOTER = "contentinfo//text:Quillmere is a fictional demo shop. Not a real service.";
/** In Zoya's contrast band, and under her hard font cut. */
const LEAD = "main//paragraph:Parcels on the way and how you like to receive them.";

const SUBJECT = "Vera, seed 1";

const ada = profileFixture("prof_ada");
const kai = profileFixture("prof_kai");
const vera = profileFixture("prof_vera");
const zoya = profileFixture("prof_zoya");

function measured(key: string): MeasuredElement {
  const found = measurementFixture.elements.find((e) => e.key === key);
  if (!found) throw new Error(`No measured element ${key}`);
  return found;
}

function metric(key: string, name: MetricName): number {
  const value = measured(key).metrics[name];
  if (value === undefined) throw new Error(`${key} has no ${name}`);
  return value;
}

function threshold(profile: Profile, name: MetricName): number {
  const cut = profile.perception[name];
  if (!cut) throw new Error(`${profile.label} sets no ${name} threshold`);
  return cut.threshold;
}

function observed(full: FullObservation, key: string) {
  const found = full.elements.find((e) => e.key === key);
  if (!found) throw new Error(`No observed element ${key}`);
  return found;
}

/** True when one of the element's perception rules only degraded it. */
function softlyDegraded(full: FullObservation, key: string): boolean {
  return observed(full, key).decisions.some(
    (d) => d.stage === "perception" && d.state === "degraded",
  );
}

// ---------------------------------------------------------------------------
// The cases
// ---------------------------------------------------------------------------

/** What `perceive` returns, parsed, so every case also holds core's invariants. */
function observe(measurement: PageMeasurement, profile: Profile, seed: number): FullObservation {
  return FullObservation.parse(perceive(measurement, profile, seed));
}

/** The observation at the first run seed from 1 to 100 for which `holds` is true. */
function atFirstSeed(
  measurement: PageMeasurement,
  profile: Profile,
  holds: (full: FullObservation) => boolean,
): FullObservation {
  const seeds = Array.from({ length: 100 }, (_, i) => i + 1);
  const seed = seeds.find((s) => holds(observe(measurement, profile, s)));
  expect(seed, "a run seed from 1 to 100 gives the case").toBeDefined();
  return observe(measurement, profile, seed ?? 0);
}

/** The fixture with one element's measurement changed. */
function withElement(
  key: string,
  change: (element: MeasuredElement) => MeasuredElement,
): PageMeasurement {
  return PageMeasurement.parse({
    ...measurementFixture,
    elements: measurementFixture.elements.map((e) => (e.key === key ? change(e) : e)),
  });
}

/** Vera where her soft contrast band degrades Order archive. Her target cut removes Quillmere. */
function veraDegrading(): FullObservation {
  return atFirstSeed(
    measurementFixture,
    vera,
    (full) => observed(full, ARCHIVE).state === "degraded",
  );
}

/** Vera where the same band removes Order archive. */
function veraRemoving(): FullObservation {
  return atFirstSeed(
    measurementFixture,
    vera,
    (full) => observed(full, ARCHIVE).state === "invisible",
  );
}

/** Zoya where her contrast band only degrades the lead paragraph, which her font cut removes. */
function zoyaSoftUnderHard(): FullObservation {
  return atFirstSeed(measurementFixture, zoya, (full) => softlyDegraded(full, LEAD));
}

/** Order archive moved below the viewport, for Vera: V2 removes it, her contrast band degrades it. */
function veraBelowTheFold(): FullObservation {
  const below = withElement(ARCHIVE, (e) => ({
    ...e,
    bbox: { ...e.bbox, y: measurementFixture.viewport.height + 10 },
  }));
  return atFirstSeed(below, vera, (full) => softlyDegraded(full, ARCHIVE));
}

/** Order archive under something the page paints over it, for Ada: V3 removes it (#229). */
function adaUnderACover(): FullObservation {
  return observe(
    withElement(ARCHIVE, (e) => ({ ...e, covered: true })),
    ada,
    1,
  );
}

/**
 * Vera on the fixture with the kebab added and her target cut softened, as her softness slider
 * would: her band degrades the kebab, and since she does not know the pattern she reads it by its
 * bare role (K1, K4).
 */
function veraRenamedAndDegraded(): FullObservation {
  const withKebab = PageMeasurement.parse({
    ...measurementFixture,
    elements: [...measurementFixture.elements, KEBAB],
  });
  const softTarget: Profile = {
    ...vera,
    perception: {
      ...vera.perception,
      targetPx: { threshold: threshold(vera, "targetPx"), softness: 0.5, provenance: "folk" },
    },
  };
  return atFirstSeed(
    withKebab,
    softTarget,
    (full) => observed(full, KEBAB.key).state === "degraded",
  );
}

/** Ada on a page whose brand link has no font size measured. */
function adaWithoutFontSize(): FullObservation {
  const unsized = withElement(BRAND, (e) => {
    const copy = structuredClone(e);
    delete copy.metrics.fontPx;
    return copy;
  });
  return observe(unsized, ada, 1);
}

/** Ada with every threshold at the top of its slider, softness 0. */
function everyThresholdAtItsMaximum(): FullObservation {
  return observe(
    measurementFixture,
    {
      ...ada,
      perception: {
        contrast: { threshold: 21, softness: 0, provenance: "folk" },
        fontPx: { threshold: 48, softness: 0, provenance: "folk" },
        targetPx: { threshold: 96, softness: 0, provenance: "folk" },
        emulation: "none",
      },
    },
    1,
  );
}

/** Every case the drawing is checked on, by name. */
function cases(): Record<string, FullObservation> {
  return {
    "Ada at seed 1": observe(measurementFixture, ada, 1),
    "Milo at seed 1": observe(measurementFixture, profileFixture("prof_milo"), 1),
    "Kai at seed 1, his cap cutting": observe(measurementFixture, kai, 1),
    "Vera, Order archive degraded": veraDegrading(),
    "Vera, Order archive removed": veraRemoving(),
    "Zoya, a soft decision under a hard one": zoyaSoftUnderHard(),
    "Vera, Order archive below the fold": veraBelowTheFold(),
    "Vera, the kebab degraded and renamed": veraRenamedAndDegraded(),
    "Ada, Quillmere with no font size": adaWithoutFontSize(),
    "every threshold at its maximum": everyThresholdAtItsMaximum(),
  };
}

// ---------------------------------------------------------------------------
// Reading the markup
// ---------------------------------------------------------------------------

function render(
  full: FullObservation,
  view: { evidence: boolean; subject?: string; zoom?: boolean },
): string {
  return renderToStaticMarkup(
    <PerceivedPage
      observation={full}
      evidence={view.evidence}
      subject={view.subject ?? SUBJECT}
      zoom={view.zoom ?? false}
    />,
  );
}

/** The classes of a `FilterState`'s look, as a list. */
function lookOf(state: keyof typeof FILTER_STATE_CLASS): string[] {
  return FILTER_STATE_CLASS[state].split(" ");
}

/**
 * What an outline says about a removed element: its name for screen readers, its flag's lines (the
 * tag), the count of the run its flag speaks for, the flag's text, its box, and the classes and
 * style of the outline and of its flag. An element whose flag the element above it carries (#225)
 * keeps its lines in an `sr-only` span in place of a flag.
 */
type Outline = {
  name: string;
  tag: string[];
  count: string | undefined;
  text: string;
  bbox: Bbox;
  classes: string[];
  flag: string[];
  flagStyle: Record<string, string>;
};

function outlines(html: string): Outline[] {
  return divsWith(html, "data-removed").map(({ attributes, inner }) => {
    const [, name = "", flag = "", tag = ""] =
      inner.match(/^<span class="sr-only">(.*?)<\/span><span([^>]*)>(.*)<\/span>$/s) ?? [];
    return {
      name: textOf(name),
      tag: [...tag.matchAll(/<span>(.*?)<\/span>/g)].map((m) => textOf(m[1] ?? "")),
      count: tag.match(/<span data-count=""[^>]*>(.*?)<\/span>/)?.[1],
      text: textOf(tag),
      bbox: bboxOf(styleOf(attributes)),
      classes: classesOf(attributes),
      flag: classesOf(attributesOf(flag)),
      flagStyle: styleOf(attributesOf(flag)),
    };
  });
}

/** Whether an outline draws a flag of its own, rather than leaving it to its run's (#225). */
function flagged(outline: Outline): boolean {
  return !outline.flag.includes("sr-only");
}

/** The side of its element an outline's flag is drawn on, from its placing class. */
function flagSideOf(outline: Outline): "left" | "right" | "inside" | undefined {
  if (outline.flag.includes("right-full")) return "left";
  if (outline.flag.includes("left-full")) return "right";
  if (outline.flag.includes("left-2")) return "inside";
  return undefined;
}

/**
 * The removed elements of an observation as outlines must show them: name, box, and the rule ids
 * that open their tag lines, one per decision that removed the element. The wording of a line is
 * pinned by literal cases, not by a second copy of the formatter.
 */
function removedElements(full: FullObservation) {
  return full.elements
    .filter((e) => e.state === "invisible")
    .map((e) => ({
      name: e.name,
      rules: e.decisions.filter((d) => decisionState(d) === "invisible").map((d) => d.rule),
      bbox: e.bbox,
    }));
}

function outlineOf(html: string, name: string): Outline {
  const found = outlines(html).filter((o) => o.name === name);
  expect(found, `one outline for ${name}`).toHaveLength(1);
  const [outline] = found;
  if (!outline) throw new Error(`No outline for ${name}`);
  return outline;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("the cases hold visible, degraded and invisible elements between them", () => {
  const states = new Set(
    Object.values(cases()).flatMap((full) => full.elements.map((e) => e.state)),
  );
  expect([...states].sort()).toEqual(["degraded", "invisible", "visible"]);
  // And each case is what its name says.
  expect(observed(veraDegrading(), ARCHIVE).state).toBe("degraded");
  expect(observed(veraDegrading(), BRAND).state).toBe("invisible");
  expect(observed(veraRemoving(), ARCHIVE).state).toBe("invisible");
  expect(observed(zoyaSoftUnderHard(), LEAD).state).toBe("invisible");
  expect(observed(veraBelowTheFold(), ARCHIVE).decisions[0]).toEqual({
    stage: "viewport",
    rule: "V2",
    side: "below",
  });
  expect(observed(adaWithoutFontSize(), BRAND).metrics.fontPx).toBeUndefined();
  expect(observed(veraRenamedAndDegraded(), KEBAB.key)).toMatchObject({
    state: "degraded",
    renamedName: "button",
  });
  expect(everyThresholdAtItsMaximum().elements.every((e) => e.state === "invisible")).toBe(true);
});

test("the drawn boxes are exactly the shown elements, in order, with the names the Actor reads", () => {
  for (const [label, full] of Object.entries(cases())) {
    for (const evidence of [false, true]) {
      expect(drawnBoxes(render(full, { evidence })), `${label}, evidence ${evidence}`).toEqual(
        shownElements(full),
      );
    }
  }
  // An element with no font size measured is drawn at 16 px.
  const unsized = drawnBoxes(render(adaWithoutFontSize(), { evidence: false }));
  expect(unsized.find((box) => box.name === measured(BRAND).name)?.fontPx).toBe(16);
});

test("a degraded element shows its masked name and never its real one", () => {
  const full = veraDegrading();
  const archive = observed(full, ARCHIVE);
  expect(archive.maskedName).toBeDefined();
  for (const evidence of [false, true]) {
    const html = render(full, { evidence });
    const box = drawnBoxes(html).find((b) => b.ref === archive.ref);
    expect(box?.state).toBe("degraded");
    expect(box?.name).toBe(archive.maskedName);
    expect(decode(html)).not.toContain(archive.name);
  }
});

/** The refs of the drawn boxes in the degraded look: hatched, the masked name muted. */
function mutedRefs(html: string): (string | undefined)[] {
  return divsWith(html, "data-state")
    .filter(({ attributes }) => classesOf(attributes).includes("hatch"))
    .map(({ attributes }) => attributes["data-ref"]);
}

test("a box is muted exactly when its element is degraded and not renamed", () => {
  for (const [label, full] of Object.entries(cases())) {
    const muted = full.elements
      .filter((e) => e.ref !== undefined && e.state === "degraded" && e.renamedName === undefined)
      .map((e) => e.ref);
    for (const evidence of [false, true]) {
      expect(mutedRefs(render(full, { evidence })), `${label}, evidence ${evidence}`).toEqual(
        muted,
      );
    }
  }
  // A degraded element reads its masked name, muted.
  const degraded = veraDegrading();
  expect(mutedRefs(render(degraded, { evidence: false }))).toContain(
    observed(degraded, ARCHIVE).ref,
  );
  // A renamed one is read whole, though perception degraded it: its bare role, unmuted as the loop
  // above checks, and its real name nowhere.
  const renamed = veraRenamedAndDegraded();
  const kebab = observed(renamed, KEBAB.key);
  const html = render(renamed, { evidence: false });
  expect(drawnBoxes(html).find((box) => box.ref === kebab.ref)).toMatchObject({
    state: "degraded",
    name: "button",
  });
  expect(decode(html)).not.toContain(KEBAB.name);
});

test("a renamed element is drawn renamed, mono with a dotted underline, never hatched", () => {
  // Perception degraded the kebab, but the Actor reads its bare role whole, as visible.
  const renamed = veraRenamedAndDegraded();
  const kebab = observed(renamed, KEBAB.key);
  for (const evidence of [false, true]) {
    const box = divsWith(render(renamed, { evidence }), "data-state").find(
      ({ attributes }) => attributes["data-ref"] === kebab.ref,
    );
    expect(box, `evidence ${evidence}`).toBeDefined();
    const classes = classesOf(box?.attributes ?? {});
    expect(classes).toEqual(expect.arrayContaining(lookOf("renamed")));
    expect(classes).not.toContain("hatch");
  }
});

test("an invisible element is not drawn, and its name appears nowhere in the perception view", () => {
  let checked = 0;
  for (const [label, full] of Object.entries(cases())) {
    const html = render(full, { evidence: false });
    expect(divsWith(html, "data-removed"), label).toEqual([]);
    const shownNames = shownElements(full).map((e) => e.name);
    for (const element of full.elements.filter((e) => e.state === "invisible")) {
      // A name a shown element also has, like the "Deliveries" heading's and nav link's, is drawn
      // for that one.
      if (shownNames.some((name) => name.includes(element.name))) continue;
      expect(decode(html), `${label}: ${element.name}`).not.toContain(element.name);
      checked += 1;
    }
  }
  expect(checked).toBeGreaterThan(0);
  // The footer's box of text (#219) names the shop inside a sentence, which is taken out first.
  const withoutFooter = decode(render(veraDegrading(), { evidence: false })).replaceAll(
    measured(FOOTER).name,
    "",
  );
  expect(withoutFooter).not.toContain(measured(BRAND).name);
});

test("with evidence, exactly the invisible elements are outlined, tagged with what removed them", () => {
  for (const [label, full] of Object.entries(cases())) {
    const drawn = outlines(render(full, { evidence: true })).map((outline) => ({
      name: outline.name,
      rules: outline.tag.map((line) => line.split(" ")[0]),
      bbox: outline.bbox,
    }));
    expect(drawn, label).toEqual(removedElements(full));
  }
  // Each tag in the spec's words. Vera's hard target cut, and her contrast band below its roll.
  const removing = render(veraRemoving(), { evidence: true });
  expect(outlineOf(removing, measured(BRAND).name).tag).toEqual([
    `P4 · ${metric(BRAND, "targetPx")} < ${threshold(vera, "targetPx")}`,
  ]);
  expect(outlineOf(removing, measured(ARCHIVE).name).tag).toEqual([
    `P1 · ${metric(ARCHIVE, "contrast")} < ${threshold(vera, "contrast")}`,
  ]);
});

test("a flag gives the numbers exactly as perceive recorded them", () => {
  // Order archive's 2.005:1 under Vera's 3:1, unrounded.
  const removing = render(veraRemoving(), { evidence: true });
  expect(outlineOf(removing, "Order archive").tag).toEqual(["P1 · 2.005 < 3"]);
});

test("a tag lists the rules that removed the element, never one that only degraded it", () => {
  // Zoya's contrast band only degrades the lead paragraph; her font cut removes it.
  const zoyaHtml = render(zoyaSoftUnderHard(), { evidence: true });
  expect(outlineOf(zoyaHtml, measured(LEAD).name).tag).toEqual([
    `P3 · ${metric(LEAD, "fontPx")} < ${threshold(zoya, "fontPx")}`,
  ]);
  // Below the fold, V2 removes Order archive and Vera's band only degrades it.
  const belowHtml = render(veraBelowTheFold(), { evidence: true });
  expect(outlineOf(belowHtml, measured(ARCHIVE).name).tag).toEqual(["V2 · below"]);
  // Under a cookie wall's backdrop, say, V3 removes it.
  const coveredHtml = render(adaUnderACover(), { evidence: true });
  expect(outlineOf(coveredHtml, measured(ARCHIVE).name).tag).toEqual(["V3 · covered"]);
  // Kai sets no threshold, so his cap is all that removes an element, and A1 is its whole tag,
  // with the count of its run beside it on the flag that speaks for one (#225).
  const kaiHtml = render(observe(measurementFixture, kai, 1), { evidence: true });
  expect(outlines(kaiHtml).length).toBeGreaterThan(0);
  for (const outline of outlines(kaiHtml)) {
    expect(outline.tag, outline.name).toEqual(["A1 · attention"]);
  }
});

test("a removal a perception rule made is drawn in signal; a cut that measured nothing is quiet", () => {
  // Vera's contrast band and target cut: dashed signal outlines, signal flags.
  const removing = outlines(render(veraRemoving(), { evidence: true }));
  expect(removing.length).toBeGreaterThan(0);
  expect(removing.filter(flagged).length).toBeGreaterThan(0);
  for (const outline of removing) {
    expect(outline.classes, outline.name).toEqual(expect.arrayContaining(lookOf("removed")));
    if (flagged(outline)) expect(outline.flag, outline.name).toContain("bg-signal");
  }
  // Kai's attention cap, V2 below the fold and V3 under a cover: dashed line-strong outlines,
  // quiet flags, and no signal on any, since none measured the persona.
  const kaiCuts = outlines(render(observe(measurementFixture, kai, 1), { evidence: true }));
  const belowCut = outlineOf(
    render(veraBelowTheFold(), { evidence: true }),
    measured(ARCHIVE).name,
  );
  const coveredCut = outlineOf(
    render(adaUnderACover(), { evidence: true }),
    measured(ARCHIVE).name,
  );
  expect(kaiCuts.filter(flagged).length).toBeGreaterThan(0);
  for (const outline of [...kaiCuts, belowCut, coveredCut]) {
    expect(outline.classes, outline.name).toEqual(expect.arrayContaining(lookOf("cut")));
    if (flagged(outline)) {
      expect(outline.flag, outline.name).toEqual(
        expect.arrayContaining(["bg-surface", "text-ink-2"]),
      );
    }
    expect(
      [...outline.classes, ...outline.flag].filter((c) => c.includes("signal")),
      outline.name,
    ).toEqual([]);
  }
});

test("a flag sits beside its element, on the side with more room", () => {
  // Zoya's target cut removes the four nav links, side by side at the page's right: they share
  // one flag (#225), carried by Home, the leftmost, and it goes left.
  const zoyaHtml = render(observe(measurementFixture, zoya, 1), { evidence: true });
  const home = outlineOf(zoyaHtml, measured("banner/navigation:Main//link:Home").name);
  expect(flagSideOf(home)).toBe("left");
  expect(home.count).toBe("×4");
  for (const key of [
    "banner/navigation:Main//link:Your account",
    "banner/navigation:Main//link:Deliveries",
    "banner/navigation:Main//link:Settings",
  ]) {
    expect(flagged(outlineOf(zoyaHtml, measured(key).name)), key).toBe(false);
  }
  // Order archive, at the left of the page, takes its flag on the right.
  const removing = render(veraRemoving(), { evidence: true });
  expect(flagSideOf(outlineOf(removing, measured(ARCHIVE).name))).toBe("right");
  // The lead paragraph is 832 px of a 1280 px page, 224 px from each edge: under a quarter of the
  // page on either side, so its flag goes inside.
  const lead = render(zoyaSoftUnderHard(), { evidence: true });
  expect(flagSideOf(outlineOf(lead, measured(LEAD).name))).toBe("inside");
});

// ---------------------------------------------------------------------------
// Runs of neighbours (#225)
// ---------------------------------------------------------------------------

/** One of Kai's cuts on the fixture: an element his attention cap removed, A1 its only decision. */
function kaiCut(): ObservedElement {
  const cut = observe(measurementFixture, kai, 1).elements.find((e) => e.ref === undefined);
  if (!cut) throw new Error("Kai's cap removes nothing on the fixture");
  return cut;
}

/** A removed element at `y`, 30 px tall, as a link in a list; A1 removed it unless told otherwise. */
function cutAt(
  y: number,
  {
    x = 224,
    width = 150,
    decisions,
  }: { x?: number; width?: number; decisions?: ElementDecision[] } = {},
): ObservedElement {
  const template = kaiCut();
  return {
    ...template,
    key: `main//link:Cut at ${x},${y}`,
    name: `Cut at ${x},${y}`,
    bbox: { x, y, width, height: 30 },
    decisions: decisions ?? template.decisions,
  };
}

const BELOW: ElementDecision = { stage: "viewport", rule: "V2", side: "below" };

/**
 * `/settings/data`'s list under "What we keep" as Kai's cap leaves it: the last five of its seven
 * links, Saved addresses to Marketing choices, 43 px apart, as the target app lays them out, each a
 * different width.
 */
const LIST = [
  [363, 138],
  [406, 167],
  [449, 160],
  [492, 120],
  [535, 148],
].map(([y = 0, width = 0]) => cutAt(y, { width }));

test("removed neighbours stacked as a list share one flag, carried by the topmost", () => {
  const runs = flagRuns(LIST);
  expect(runs.get(0)).toEqual({ count: 5, box: { x: 224, y: 363, width: 167, height: 202 } });
  for (const index of [1, 2, 3, 4]) expect(runs.get(index), `link ${index}`).toBeNull();
  // In any order: the topmost carries it, whatever its place in the observation.
  const reversed = flagRuns([...LIST].reverse());
  expect(reversed.get(4)).toMatchObject({ count: 5 });
  expect([0, 1, 2, 3].map((index) => reversed.get(index))).toEqual([null, null, null, null]);
});

test("a run breaks where the lines differ, the boxes miss each other across, or a pitch apart", () => {
  // A V2 cut lands between two A1 cuts 43 px apart, close enough to join: the V2 breaks the run,
  // so three runs, the first of two.
  const mixed = flagRuns([cutAt(0), cutAt(43), cutAt(60, { decisions: [BELOW] }), cutAt(86)]);
  expect([0, 1, 2, 3].map((index) => mixed.get(index)?.count ?? null)).toEqual([2, null, 1, 1]);
  // Side by side, as nav links, but too far apart to make a row: no overlap across, so no column
  // either, and two flags. Nearer, they make a row (the row tests below).
  const across = flagRuns([cutAt(12, { x: 821, width: 76 }), cutAt(12, { x: 945, width: 134 })]);
  expect([across.get(0)?.count, across.get(1)?.count]).toEqual([1, 1]);
  // 47 px apart is a run; 48 px apart is not.
  expect(flagRuns([cutAt(0), cutAt(47)]).get(0)?.count).toBe(2);
  expect(flagRuns([cutAt(0), cutAt(48)]).get(0)?.count).toBe(1);
});

test("a run never reaches past an element with different lines between its members", () => {
  // A1 at y 0, V2 at y 20, A1 at y 40, all at x 0 to 100: joined, the A1s' one flag would sit at
  // y 35, just right of x 100, where the V2's own flag sits. So three flags.
  const box = { x: 0, width: 100 };
  const runs = flagRuns([cutAt(0, box), cutAt(20, { ...box, decisions: [BELOW] }), cutAt(40, box)]);
  expect([0, 1, 2].map((index) => runs.get(index)?.count ?? null)).toEqual([1, 1, 1]);
});

/**
 * The target app's nav, Home to Settings, side by side at the page's right, 8 px apart, as Zoya's
 * target cut or Vera's at 48 px removes it, each a different width.
 */
const NAV = [
  [821, 76],
  [905, 134],
  [1047, 107],
  [1162, 94],
].map(([x = 0, width = 0]) => cutAt(12, { x, width }));

test("removed neighbours side by side, as a nav, share one flag, carried by the leftmost", () => {
  const runs = flagRuns(NAV);
  expect(runs.get(0)).toEqual({ count: 4, box: { x: 821, y: 12, width: 435, height: 30 } });
  for (const index of [1, 2, 3]) expect(runs.get(index), `link ${index}`).toBeNull();
  // In any order, and with the links a little out of line, as cshark's header measures them.
  const shuffled = [2, 0, 3, 1].flatMap((n, i) => {
    const cut = NAV[n];
    return cut === undefined ? [] : [{ ...cut, bbox: { ...cut.bbox, y: 12 + (i % 2) * 1.5 } }];
  });
  const reordered = flagRuns(shuffled);
  expect(reordered.get(1)).toMatchObject({ count: 4 });
  expect([0, 2, 3].map((index) => reordered.get(index))).toEqual([null, null, null]);
});

test("a row breaks where the lines differ, the boxes miss each other down, or a gap apart", () => {
  // A V2 cut between two A1 cuts 30 px apart, close enough to join: the V2 breaks the row.
  const mixed = flagRuns([
    cutAt(0, { x: 0, width: 100 }),
    cutAt(0, { x: 110, width: 10, decisions: [BELOW] }),
    cutAt(0, { x: 130, width: 100 }),
  ]);
  expect([0, 1, 2].map((index) => mixed.get(index)?.count ?? null)).toEqual([1, 1, 1]);
  // A column of two with the same lines lands between two A1 cuts 35 px apart: its top member
  // ends the row, so the column keeps its flag and the two cuts keep one each.
  const column = flagRuns([
    cutAt(0, { x: 0, width: 100 }),
    cutAt(0, { x: 105, width: 20 }),
    cutAt(30, { x: 105, width: 20 }),
    cutAt(0, { x: 135, width: 100 }),
  ]);
  expect([0, 1, 2, 3].map((index) => column.get(index)?.count ?? null)).toEqual([1, 2, null, 1]);
  // One under the other's bottom edge, side by side: no overlap down, so two flags.
  const down = flagRuns([cutAt(0, { x: 0, width: 100 }), cutAt(30, { x: 108, width: 100 })]);
  expect([down.get(0)?.count, down.get(1)?.count]).toEqual([1, 1]);
  // 39 px apart is a row; 40 px apart is not.
  expect(flagRuns([cutAt(0, { x: 0, width: 100 }), cutAt(0, { x: 139 })]).get(0)?.count).toBe(2);
  expect(flagRuns([cutAt(0, { x: 0, width: 100 }), cutAt(0, { x: 140 })]).get(0)?.count).toBe(1);
});

const COVERED: ElementDecision = { stage: "viewport", rule: "V3" };

/** A removed element at its measured `bbox`; A1 removed it unless told otherwise. */
function cutIn(bbox: Bbox, decisions?: ElementDecision[]): ObservedElement {
  const cut = cutAt(bbox.y, { x: bbox.x, width: bbox.width });
  return { ...cut, bbox, decisions: decisions ?? cut.decisions };
}

test("an element behind a row, not between its members, never ends it: cshark's cookie banner", () => {
  // cshark.com at 1280 × 720, as io measures it for the Lens, removed alike for Kai (A1) and for
  // Vera (P3): the banner's paragraph and its three buttons, 15, 8 and 8 px apart. The "Our
  // commitment…" paragraph that V3 removed lies behind the banner, from x 196 to 1084, overlapping
  // it down and starting right of the banner paragraph's left edge, but not right of its edge, so
  // it is not between two members. One row of four, and the covered paragraph keeps its own flag.
  const runs = flagRuns([
    cutIn({ x: 196, y: 596, width: 888, height: 76.78125 }, [COVERED]),
    cutIn({ x: 25, y: 654.5, width: 825.875, height: 48 }),
    cutIn({ x: 865.875, y: 656.5, width: 128.328125, height: 44 }),
    cutIn({ x: 1002.203125, y: 656.5, width: 119.21875, height: 44 }),
    cutIn({ x: 1129.421875, y: 656.5, width: 125.578125, height: 44 }),
  ]);
  expect([0, 1, 2, 3, 4].map((index) => runs.get(index)?.count ?? null)).toEqual([
    1,
    4,
    null,
    null,
    null,
  ]);
  expect(runs.get(1)?.box).toEqual({ x: 25, y: 654.5, width: 1230, height: 48 });
});

test("a column wins over a row: entries of a list, each a label and a button, stay two columns", () => {
  // Label and button side by side, 8 px apart, in entries 43 px apart. #270's columns take them
  // first, so the flags are the two columns', at the list's middle, never one per entry.
  const runs = flagRuns([
    cutAt(0, { x: 224, width: 150 }),
    cutAt(0, { x: 382, width: 100 }),
    cutAt(43, { x: 224, width: 150 }),
    cutAt(43, { x: 382, width: 100 }),
  ]);
  expect([0, 1, 2, 3].map((index) => runs.get(index)?.count ?? null)).toEqual([2, 2, null, null]);
});

/** Kai's observation of the fixture with `elements` in place of its own. */
function kaiWith(elements: ObservedElement[]): FullObservation {
  return { ...observe(measurementFixture, kai, 1), elements };
}

test("a run's flag reads its count once, beside the whole run; the rest keep their lines unseen", () => {
  const drawn = outlines(render(kaiWith(LIST), { evidence: true }));
  // Every link is still outlined, at its own box.
  expect(drawn.map((outline) => outline.bbox)).toEqual(LIST.map((cut) => cut.bbox));
  const [top, ...rest] = drawn;
  // The topmost carries the run's one flag, to the right, at the run's middle, 101 px down its
  // 202 px, and past its widest link: 167 px from the topmost's left, 29 px past its own edge.
  expect(top?.tag).toEqual(["A1 · attention"]);
  expect(top?.count).toBe("×5");
  expect(top && flagSideOf(top)).toBe("right");
  expect(measuredPx(top?.flagStyle.top)).toBe(101);
  expect(measuredPx(top?.flagStyle.left)).toBe(167);
  // The others draw no flag, and a screen reader still hears what removed each.
  for (const outline of rest) {
    expect(flagged(outline), outline.name).toBe(false);
    expect(outline.tag, outline.name).toEqual(["A1 · attention"]);
  }
  // One element alone keeps CutFlag's own place, with no style and no count.
  const [alone] = outlines(render(kaiWith([cutAt(320)]), { evidence: true }));
  expect(alone?.tag).toEqual(["A1 · attention"]);
  expect(alone?.count).toBeUndefined();
  expect(alone?.flagStyle).toEqual({});
});

/** A perception decision that removed an element: `rule` measured `value` under `threshold`. */
function removedBy(rule: "P1" | "P3" | "P4", value: number, threshold: number): ElementDecision {
  const metric = ({ P1: "contrast", P3: "fontPx", P4: "targetPx" } as const)[rule];
  return { stage: "perception", rule, metric, value, threshold, state: "invisible" };
}

/** Two removed elements 43 px apart, a run, that `decisions` removed alike. */
function pairRemovedBy(decisions: ElementDecision[]): Outline[] {
  return outlines(
    render(kaiWith([cutAt(0, { decisions }), cutAt(43, { decisions })]), { evidence: true }),
  );
}

test("a run's count stands apart from the lines, never read as part of a value", () => {
  // Vera at contrast 7: glued to the line, the count would read as a threshold of "7 ×2". It is
  // a column of its own, beside the lines, so it adds no line to the flag's height.
  const [contrast] = pairRemovedBy([removedBy("P1", 6.386, 7)]);
  expect(contrast?.tag).toEqual(["P1 · 6.386 < 7"]);
  expect(contrast?.count).toBe("×2");
  expect(contrast?.flag).toContain("flex-row");
  // Two rules: the count is the run's, beside both lines, not P3's alone.
  const [top, below] = pairRemovedBy([removedBy("P3", 17, 24), removedBy("P4", 30, 48)]);
  expect(top?.tag).toEqual(["P3 · 17 < 24", "P4 · 30 < 48"]);
  expect(top?.count).toBe("×2");
  // The member whose flag the run's carries: its lines read apart, not as "24P4".
  expect(below && flagged(below)).toBe(false);
  expect(below?.text).toBe("P3 · 17 < 24, P4 · 30 < 48");
});

test("a run's flag takes its side from the whole run's box, not the topmost element's own", () => {
  // The topmost, at x 600 to 800, has more room to its left; the run, from x 150 to 800, more to
  // its right, so the run's flag goes right.
  const [top] = outlines(
    render(kaiWith([cutAt(0, { x: 600, width: 200 }), cutAt(43, { x: 150, width: 500 })]), {
      evidence: true,
    }),
  );
  expect(top && flagSideOf(top)).toBe("right");
});

test("a run at the page's right takes its flag on the left, at the run's left edge", () => {
  // The list moved to the right half, each link ending at x 1056: the run, from x 889, has more
  // room to its left. Its flag is set 167 px in from the topmost's right edge, at x 889.
  const atRight = LIST.map((cut) => ({ ...cut, bbox: { ...cut.bbox, x: 1056 - cut.bbox.width } }));
  const [top] = outlines(render(kaiWith(atRight), { evidence: true }));
  expect(top && flagSideOf(top)).toBe("left");
  expect(measuredPx(top?.flagStyle.top)).toBe(101);
  expect(measuredPx(top?.flagStyle.right)).toBe(167);
});

test("a row's flag sits beside the whole row, at its middle, past its outer edge", () => {
  // The nav, at the page's right, has more room to its left: the flag goes left of Home, at the
  // row's left edge, 76 px in from Home's right, and 15 px down, the middle of the row's 30 px.
  const drawn = outlines(render(kaiWith(NAV), { evidence: true }));
  expect(drawn.map((outline) => outline.bbox)).toEqual(NAV.map((cut) => cut.bbox));
  const [home, ...rest] = drawn;
  expect(home?.tag).toEqual(["A1 · attention"]);
  expect(home?.count).toBe("×4");
  expect(home && flagSideOf(home)).toBe("left");
  expect(measuredPx(home?.flagStyle.top)).toBe(15);
  expect(measuredPx(home?.flagStyle.right)).toBe(76);
  for (const outline of rest) {
    expect(flagged(outline), outline.name).toBe(false);
    expect(outline.tag, outline.name).toEqual(["A1 · attention"]);
  }
  // At the page's left, the flag goes right, past Settings' right edge, 435 px from Home's left.
  const atLeft = NAV.map((cut) => ({ ...cut, bbox: { ...cut.bbox, x: cut.bbox.x - 797 } }));
  const [left] = outlines(render(kaiWith(atLeft), { evidence: true }));
  expect(left && flagSideOf(left)).toBe("right");
  expect(measuredPx(left?.flagStyle.left)).toBe(435);
});

test("a run with too little room on either side takes its flag inside, at CutFlag's own place", () => {
  // "Your rights": the 832 px paragraph and the button 42 px under it. Their run leaves 224 px on
  // each side, under a quarter of the page, so its flag goes inside the paragraph's outline, with
  // no style of its own, and keeps its count.
  const [paragraph] = outlines(
    render(kaiWith([cutAt(655, { width: 832 }), cutAt(697, { width: 248 })]), { evidence: true }),
  );
  expect(paragraph && flagSideOf(paragraph)).toBe("inside");
  expect(paragraph?.flagStyle).toEqual({});
  expect(paragraph?.count).toBe("×2");
});

test("the caption says evidence, not perception, in the evidence view only, for its subject", () => {
  const full = veraDegrading();
  const subject = "Zoya, thresholds edited, seed 7";
  expect(captionOf(render(full, { evidence: false, subject }))).toBe(
    `The page as perceive returns it for ${subject}.`,
  );
  expect(captionOf(render(full, { evidence: true, subject }))).toBe(
    `Evidence, not perception: dashed outlines mark what perceive removed for ${subject}, each with its rule.`,
  );
  expect(captionOf(render(full, { evidence: false }))).toBe(
    `The page as perceive returns it for ${SUBJECT}.`,
  );
});

/** Each drawn box's name, and whether it wraps its name rather than keep it on one line. */
function wrapsByName(html: string): Map<string, boolean> {
  return new Map(
    divsWith(html, "data-state").map(({ attributes, inner }) => [
      textOf(inner),
      classesOf(attributes).includes("whitespace-normal"),
    ]),
  );
}

test("a text block more than one line tall wraps its name; a control and a one-line block do not", () => {
  const lead = measured(LEAD);
  // The lead paragraph as a phone measures it: 180 px wide, three lines of its 17 px text.
  const phone = withElement(LEAD, (e) => ({ ...e, bbox: { ...e.bbox, width: 180, height: 76.5 } }));
  const onPhone = wrapsByName(render(observe(phone, ada, 1), { evidence: false }));
  expect(onPhone.get(lead.name)).toBe(true);
  // A nav link is 46 px tall at 17 px, room for two lines, but a control keeps its name on one.
  expect(onPhone.get("Your account")).toBe(false);
  // On the desktop page the paragraph is one line tall, and keeps to it.
  const onDesktop = wrapsByName(render(observe(measurementFixture, ada, 1), { evidence: false }));
  expect(onDesktop.get(lead.name)).toBe(false);
});

// ---------------------------------------------------------------------------
// The canvas
// ---------------------------------------------------------------------------

/** The style of the `[data-lens-stage]` frame, and of the canvas it holds. */
function frameAndCanvas(html: string) {
  const [, frame = "", canvas = ""] =
    html.match(/<div((?:\s[^>]*)?\sdata-lens-stage=""[^>]*)><div([^>]*)>/) ?? [];
  return { frame: styleOf(attributesOf(frame)), canvas: styleOf(attributesOf(canvas)) };
}

test("the canvas ends 24 px under the lowest element in the viewport, whatever its state", () => {
  // Without the footer, whose box of text (#219) runs past the fold, so the viewport alone would
  // bound the canvas (the next test), the fixture's elements end at Order archive's bottom edge.
  const page = PageMeasurement.parse({
    ...measurementFixture,
    elements: measurementFixture.elements.filter((e) => e.key !== FOOTER),
  });
  const lowest = 639.0625;
  expect(measured(ARCHIVE).bbox.y + measured(ARCHIVE).bbox.height).toBe(lowest);
  expect(Math.max(...page.elements.map((e) => e.bbox.y + e.bbox.height))).toBe(lowest);
  const full = observe(page, ada, 1);
  expect(croppedHeight(full)).toBe(lowest + 24);
  // Removed, Order archive still sets the crop, so a slider never moves the canvas's edge.
  const removing = atFirstSeed(page, vera, (f) => observed(f, ARCHIVE).state === "invisible");
  expect(croppedHeight(removing)).toBe(lowest + 24);
  // So it does under a cover: V3 cuts it in the viewport (#229).
  const covered = PageMeasurement.parse({
    ...page,
    elements: page.elements.map((e) => (e.key === ARCHIVE ? { ...e, covered: true } : e)),
  });
  expect(croppedHeight(observe(covered, ada, 1))).toBe(lowest + 24);
  // The canvas is that tall, and the frame fits it to the height it is given.
  const { frame, canvas } = frameAndCanvas(render(full, { evidence: false }));
  expect(canvas.height).toBe(`calc(${lowest + 24} * var(--px))`);
  expect(canvas["--px"]).toBe("calc(100cqw / 1280)");
  expect(frame.width).toBe(`min(100cqw, (100cqh - 2px) * 1280 / ${lowest + 24} + 2px)`);
});

/** The attributes of the element the frame scrolls in, `[data-lens-scroller]`. */
function scrollerOf(html: string): Record<string, string> {
  const [, attributes = ""] =
    html.match(/<section((?:\s[^>]*)?\sdata-lens-scroller=""[^>]*)>/) ?? [];
  return attributesOf(attributes);
}

test("at full size the frame is the measured width, in a scroller a keyboard can reach (#224)", () => {
  const full = observe(measurementFixture, vera, 1);
  const height = croppedHeight(full);
  for (const evidence of [false, true]) {
    const zoomed = render(full, { evidence, zoom: true });
    const { frame, canvas } = frameAndCanvas(zoomed);
    // The canvas's 1280 px plus the frame's two hairline borders, so one measured px is one px.
    expect(frame.width, `evidence ${evidence}`).toBe("1282px");
    expect(frame["max-width"]).toBeUndefined();
    expect(canvas["--px"]).toBe("calc(100cqw / 1280)");
    expect(canvas.height).toBe(`calc(${height} * var(--px))`);
    const scroller = scrollerOf(zoomed);
    expect(classesOf(scroller)).toContain("overflow-auto");
    expect(scroller.tabindex).toBe("0");
    expect(scroller["aria-label"]).toBe("The page at full size");
    // Fitted, the frame is as it was, and its scroller clips and takes no focus.
    const fitted = render(full, { evidence, zoom: false });
    expect(frameAndCanvas(fitted).frame.width).toBe(
      `min(100cqw, (100cqh - 2px) * 1280 / ${height} + 2px)`,
    );
    expect(classesOf(scrollerOf(fitted))).toContain("overflow-clip");
    expect(scrollerOf(fitted).tabindex).toBeUndefined();
  }
});

test("an element below the fold does not extend the canvas, and the viewport's height bounds it", () => {
  const archive = measured(ARCHIVE);
  const { height } = measurementFixture.viewport;
  // Another link wholly below the fold: V2 removes it, and the canvas ends where it did.
  const belowTheFold = PageMeasurement.parse({
    ...measurementFixture,
    elements: [
      ...measurementFixture.elements,
      {
        ...archive,
        key: "main//link:Older orders",
        name: "Older orders",
        bbox: { ...archive.bbox, y: height + 10 },
      },
    ],
  });
  expect(croppedHeight(observe(belowTheFold, ada, 1))).toBe(
    croppedHeight(observe(measurementFixture, ada, 1)),
  );
  // Order archive straddling the fold: the canvas takes the viewport's height, and no more.
  const straddling = withElement(ARCHIVE, (e) => ({ ...e, bbox: { ...e.bbox, y: height - 10 } }));
  expect(croppedHeight(observe(straddling, ada, 1))).toBe(height);
  // Nothing in the viewport: the canvas is the viewport.
  const nothingShown = PageMeasurement.parse({
    ...measurementFixture,
    elements: [{ ...archive, bbox: { ...archive.bbox, y: height + 10 } }],
  });
  expect(croppedHeight(observe(nothingShown, ada, 1))).toBe(height);
});

// ---------------------------------------------------------------------------
// The one animation
// ---------------------------------------------------------------------------

test("a static render carries no animation and no leaving element", () => {
  for (const [label, full] of Object.entries(cases())) {
    for (const evidence of [false, true]) {
      const html = render(full, { evidence });
      expect(html, `${label}, evidence ${evidence}`).not.toContain("animate-");
      expect(html, `${label}, evidence ${evidence}`).not.toContain("data-leaving");
    }
  }
});

const LOOKS: Look[] = ["visible", "degraded", "visible"];
const NAMES = ["Home", "Order ar…", "Settings"];

test("a first render starts every counter at 0", () => {
  expect(nextTrack(undefined, LOOKS, NAMES)).toEqual({
    looks: LOOKS,
    names: NAMES,
    changes: [0, 0, 0],
    was: [undefined, undefined, undefined],
  });
});

test("a render that changes nothing returns the track itself, so React settles", () => {
  const track = nextTrack(undefined, LOOKS, NAMES);
  expect(nextTrack(track, [...LOOKS], [...NAMES])).toBe(track);
});

test("a look that changes counts up and keeps what the element was", () => {
  const first = nextTrack(undefined, LOOKS, NAMES);
  const removed = nextTrack(first, ["visible", "removed", "visible"], ["Home", "", "Settings"]);
  expect(removed.changes).toEqual([0, 1, 0]);
  expect(removed.was).toEqual([undefined, { look: "degraded", name: "Order ar…" }, undefined]);
  // A change elsewhere leaves this one's counter and `was` as they were.
  const another = nextTrack(removed, ["degraded", "removed", "visible"], ["Ho…", "", "Settings"]);
  expect(another.changes).toEqual([1, 1, 0]);
  expect(another.was).toEqual([
    { look: "visible", name: "Home" },
    { look: "degraded", name: "Order ar…" },
    undefined,
  ]);
  // Back again: the counter goes on up, and `was` is now the removed look.
  const back = nextTrack(
    another,
    ["degraded", "visible", "visible"],
    ["Ho…", "Order archive", "Settings"],
  );
  expect(back.changes).toEqual([1, 2, 0]);
  expect(back.was[1]).toEqual({ look: "removed", name: "" });
});

test("a name that changes in the same look keeps the counters", () => {
  const first = nextTrack(undefined, LOOKS, NAMES);
  const renamed = nextTrack(first, LOOKS, ["Home", "Ord… ar…", "Settings"]);
  expect(renamed).not.toBe(first);
  expect(renamed.names).toEqual(["Home", "Ord… ar…", "Settings"]);
  expect(renamed.changes).toEqual([0, 0, 0]);
  expect(renamed.was).toEqual([undefined, undefined, undefined]);
});

test("a new element count starts the track over", () => {
  const first = nextTrack(undefined, LOOKS, NAMES);
  const moved = nextTrack(first, ["visible", "removed", "visible"], ["Home", "", "Settings"]);
  expect(moved.changes).toEqual([0, 1, 0]);
  expect(nextTrack(moved, ["removed", "visible"], ["", "Settings"])).toEqual({
    looks: ["removed", "visible"],
    names: ["", "Settings"],
    changes: [0, 0],
    was: [undefined, undefined],
  });
});
