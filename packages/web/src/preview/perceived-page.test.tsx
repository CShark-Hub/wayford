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
 * and text, and by the measured px inside each `calc(N * var(--px))`.
 */
import {
  type Bbox,
  decisionState,
  FullObservation,
  type MeasuredElement,
  type MetricName,
  PageMeasurement,
  type Profile,
} from "@wayford/core";
import { kebabElement as KEBAB, measurementFixture, profileFixture } from "@wayford/core/fixtures";
import { perceive } from "@wayford/filter/perceive";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { PerceivedPage } from "./perceived-page.js";
import {
  bboxOf,
  captionOf,
  decode,
  divsWith,
  drawnBoxes,
  shownElements,
  styleOf,
  textOf,
} from "./rendered-markup.js";

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

const ARCHIVE = "main//link:Order archive";
const BRAND = "banner//link:Quillmere";
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

function render(full: FullObservation, view: { evidence: boolean; subject?: string }): string {
  return renderToStaticMarkup(
    <PerceivedPage observation={full} evidence={view.evidence} subject={view.subject ?? SUBJECT} />,
  );
}

/** What an outline says about a removed element. */
type Outline = { name: string; tag: string[]; bbox: Bbox };

function outlines(html: string): Outline[] {
  return divsWith(html, "data-removed").map(({ attributes, inner }) => {
    const [, name = "", tag = ""] =
      inner.match(/^<span class="sr-only">(.*?)<\/span><span[^>]*>(.*)<\/span>$/s) ?? [];
    return {
      name: textOf(name),
      tag: [...tag.matchAll(/<span>(.*?)<\/span>/g)].map((m) => textOf(m[1] ?? "")),
      bbox: bboxOf(styleOf(attributes)),
    };
  });
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

/** The refs of the drawn boxes in the muted foreground. */
function mutedRefs(html: string): (string | undefined)[] {
  return divsWith(html, "data-state")
    .filter(({ attributes }) =>
      (attributes.class ?? "").split(/\s+/).includes("text-muted-foreground"),
    )
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
  expect(decode(render(veraDegrading(), { evidence: false }))).not.toContain(measured(BRAND).name);
});

test("with evidence, exactly the invisible elements are outlined, tagged with what removed them", () => {
  for (const [label, full] of Object.entries(cases())) {
    const drawn = outlines(render(full, { evidence: true })).map(({ name, tag, bbox }) => ({
      name,
      rules: tag.map((line) => line.split(" ")[0]),
      bbox,
    }));
    expect(drawn, label).toEqual(removedElements(full));
  }
  // Each tag in the spec's words. Vera's hard target cut, and her contrast band below its roll.
  const removing = render(veraRemoving(), { evidence: true });
  expect(outlineOf(removing, measured(BRAND).name).tag).toEqual([
    `P4 ${metric(BRAND, "targetPx")} < ${threshold(vera, "targetPx")}`,
  ]);
  expect(outlineOf(removing, measured(ARCHIVE).name).tag).toEqual([
    `P1 ${metric(ARCHIVE, "contrast")} < ${threshold(vera, "contrast")}`,
  ]);
});

test("a tag lists the rules that removed the element, never one that only degraded it", () => {
  // Zoya's contrast band only degrades the lead paragraph; her font cut removes it.
  const zoyaHtml = render(zoyaSoftUnderHard(), { evidence: true });
  expect(outlineOf(zoyaHtml, measured(LEAD).name).tag).toEqual([
    `P3 ${metric(LEAD, "fontPx")} < ${threshold(zoya, "fontPx")}`,
  ]);
  // Below the fold, V2 removes Order archive and Vera's band only degrades it.
  const belowHtml = render(veraBelowTheFold(), { evidence: true });
  expect(outlineOf(belowHtml, measured(ARCHIVE).name).tag).toEqual(["V2 below"]);
  // Kai sets no threshold, so his cap is all that removes an element, and A1 is its whole tag.
  const kaiHtml = render(observe(measurementFixture, kai, 1), { evidence: true });
  expect(outlines(kaiHtml).length).toBeGreaterThan(0);
  expect(outlines(kaiHtml).every((outline) => outline.tag.join() === "A1")).toBe(true);
});

test("the caption says evidence, not perception, in the evidence view only, for its subject", () => {
  const full = veraDegrading();
  const subject = "Zoya, thresholds edited, seed 7";
  expect(captionOf(render(full, { evidence: false, subject }))).toBe(
    `The page as perceive returns it for ${subject}.`,
  );
  expect(captionOf(render(full, { evidence: true, subject }))).toBe(
    `Evidence, not perception: dashed outlines mark the elements perceive removed for ${subject}, each with the rule that removed it.`,
  );
  expect(captionOf(render(full, { evidence: false }))).toBe(
    `The page as perceive returns it for ${SUBJECT}.`,
  );
});

/** Each drawn box's name, and whether it wraps its name rather than keep it on one line. */
function wrapsByName(html: string): Map<string, boolean> {
  return new Map(
    divsWith(html, "data-state").map(({ attributes, inner }) => {
      const classes = (attributes.class ?? "").split(" ");
      return [textOf(inner), classes.includes("whitespace-normal")];
    }),
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
