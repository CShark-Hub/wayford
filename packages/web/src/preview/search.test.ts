import { METRIC_NAMES, PageMeasurement } from "@wayford/core";
import {
  kebabElement,
  measurementFixture,
  profileFixture,
  profileFixtures,
} from "@wayford/core/fixtures";
import { perceive } from "@wayford/filter/perceive";
import { expect, test } from "vitest";
import {
  CUT_SLIDERS,
  PREVIEW_PAGES,
  PreviewSearch,
  type PreviewState,
  pageSearch,
  personaSearch,
  resolvePreview,
  softnessKey,
} from "./search.js";

/** What the router hands `validateSearch`: the query as its parser read it, any key with any value. */
function validate(query: Record<string, unknown>): PreviewSearch {
  return PreviewSearch.parse(query);
}

/** The state a query resolves to, as the screen gets it. */
function stateOf(query: Record<string, unknown>): PreviewState {
  return resolvePreview(validate(query));
}

test("a link without persona or seed opens Vera at seed 1", () => {
  // The defaults are the resolver's, so the short link stays as short as it was written.
  expect(validate({})).toStrictEqual({});
  const state = stateOf({});
  expect(state.persona).toStrictEqual(profileFixture("prof_vera"));
  expect(state.seed).toBe(1);
  expect(state.edited).toBe(false);
  expect(state.evidence).toBe(false);
  expect(state.page).toBe("/deliveries");
});

test("a present but invalid key comes back as undefined, overrides the raw query, and falls back", () => {
  // TanStack merges a route's validated search over the raw query: a key the parse left out would
  // let its raw value through to `useSearch`. Every key comes back, and the merge keeps none.
  const query = {
    persona: 42,
    seed: -1,
    contrast: "high",
    contrastSoftness: 2,
    fontPx: 49,
    fontPxSoftness: -0.5,
    targetPx: null,
    targetPxSoftness: true,
    evidence: false,
    page: "/nowhere",
  };
  expect({ ...query, ...validate(query) }).toStrictEqual({
    persona: undefined,
    seed: undefined,
    contrast: undefined,
    contrastSoftness: undefined,
    fontPx: undefined,
    fontPxSoftness: undefined,
    targetPx: undefined,
    targetPxSoftness: undefined,
    evidence: undefined,
    page: undefined,
  });
  // Each falls back on its own, an unknown persona to Vera and the rest to her own values.
  expect(resolvePreview(validate(query))).toStrictEqual(stateOf({}));
});

test("Vera at her own values: her thresholds and sources, with softness 0 where she sets none", () => {
  expect(profileFixture("prof_vera").perception).toStrictEqual({
    contrast: { threshold: 3, softness: 0.5, provenance: "wcag22" },
    fontPx: { threshold: 16, provenance: "legge2011" },
    targetPx: { threshold: 32, provenance: "folk" },
    emulation: "blurredVision",
  });
  const state = stateOf({ persona: "prof_vera" });
  expect(state.cuts).toStrictEqual({
    contrast: { threshold: 3, softness: 0.5 },
    fontPx: { threshold: 16, softness: 0 },
    targetPx: { threshold: 32, softness: 0 },
  });
  expect(state.profile.perception).toStrictEqual({
    contrast: { threshold: 3, softness: 0.5, provenance: "wcag22" },
    fontPx: { threshold: 16, softness: 0, provenance: "legge2011" },
    targetPx: { threshold: 32, softness: 0, provenance: "folk" },
    emulation: "blurredVision",
  });
});

test("Ada resolves to no threshold at all", () => {
  const state = stateOf({ persona: "prof_ada" });
  expect(state.profile.perception).toStrictEqual({ emulation: "none" });
  // Her sliders sit at off, each softness at 0.
  expect(state.cuts).toStrictEqual({
    contrast: { threshold: 1, softness: 0 },
    fontPx: { threshold: 0, softness: 0 },
    targetPx: { threshold: 0, softness: 0 },
  });
  expect(state.edited).toBe(false);
});

test("each slider's lowest position switches the persona's threshold off", () => {
  // Off fails nothing, so the threshold is left out rather than passed on as 1:1 or 0 px.
  expect(stateOf({ persona: "prof_vera", contrast: 1 }).profile.perception).toStrictEqual({
    fontPx: { threshold: 16, softness: 0, provenance: "legge2011" },
    targetPx: { threshold: 32, softness: 0, provenance: "folk" },
    emulation: "blurredVision",
  });
  expect(stateOf({ persona: "prof_vera", fontPx: 0 }).profile.perception).toStrictEqual({
    contrast: { threshold: 3, softness: 0.5, provenance: "wcag22" },
    targetPx: { threshold: 32, softness: 0, provenance: "folk" },
    emulation: "blurredVision",
  });
  expect(stateOf({ persona: "prof_vera", targetPx: 0 }).profile.perception).toStrictEqual({
    contrast: { threshold: 3, softness: 0.5, provenance: "wcag22" },
    fontPx: { threshold: 16, softness: 0, provenance: "legge2011" },
    emulation: "blurredVision",
  });
  // All three at once leave Zoya with none, her sliders at off and her contrast softness kept.
  const zoya = stateOf({ persona: "prof_zoya", contrast: 1, fontPx: 0, targetPx: 0 });
  expect(zoya.profile.perception).toStrictEqual({ emulation: "reducedContrast" });
  expect(zoya.cuts).toStrictEqual({
    contrast: { threshold: 1, softness: 0.3 },
    fontPx: { threshold: 0, softness: 0 },
    targetPx: { threshold: 0, softness: 0 },
  });
  expect(zoya.edited).toBe(true);
});

test("a softness under an off threshold changes nothing and is no edit", () => {
  const ada = stateOf({
    persona: "prof_ada",
    contrastSoftness: 0.5,
    fontPxSoftness: 0.25,
    targetPxSoftness: 1,
  });
  expect(ada.profile.perception).toStrictEqual({ emulation: "none" });
  // The softness sliders still show where they were moved to.
  expect(ada.cuts).toStrictEqual({
    contrast: { threshold: 1, softness: 0.5 },
    fontPx: { threshold: 0, softness: 0.25 },
    targetPx: { threshold: 0, softness: 1 },
  });
  expect(ada.edited).toBe(false);
  // The same under a threshold the URL switched off: Vera's contrast, then its softness moved.
  expect(
    stateOf({ persona: "prof_vera", contrast: 1, contrastSoftness: 0.9 }).profile.perception,
  ).toStrictEqual(stateOf({ persona: "prof_vera", contrast: 1 }).profile.perception);
});

test("the profile is the persona whole, with the sliders' perception in place of its own", () => {
  // A moved slider changes the perception and leaves the rest, Kai's cap and patterns among it.
  expect(stateOf({ persona: "prof_kai", contrast: 4.5 }).profile).toStrictEqual({
    ...profileFixture("prof_kai"),
    perception: {
      contrast: { threshold: 4.5, softness: 0, provenance: "folk" },
      emulation: "none",
    },
  });
});

test("at a persona's own values, perceive returns exactly what it returns for the persona", () => {
  // An off threshold is left out, a softness of 0 is the hard cut an absent one is, and the caps
  // and unknown patterns are the persona's own, so an unmoved preview is the persona's own
  // observation, not an approximation of it. It runs on the fixture with the kebab added, so the
  // unknown patterns have something to act on.
  const page = PageMeasurement.parse({
    ...measurementFixture,
    elements: [...measurementFixture.elements, kebabElement],
  });
  for (const persona of profileFixtures) {
    for (const seed of [1, 7, 4211]) {
      const { profile } = stateOf({ persona: persona.id, seed });
      expect(perceive(page, profile, seed), `${persona.label}, seed ${seed}`).toStrictEqual(
        perceive(page, persona, seed),
      );
    }
  }
  // Not vacuous: Kai sets no threshold, and his cap of 11 still hides some of the page's 15
  // elements, so a preview that passed his perception alone would fail above.
  const kai = stateOf({ persona: "prof_kai" }).profile;
  expect(perceive(page, kai, 1).hiddenCount).toBeGreaterThan(0);
  // Nor is stage 4: a persona that does not know the kebab carries a knowledge decision on it, so
  // a preview that dropped the unknown patterns would fail above too.
  expect(
    profileFixtures.some((persona) =>
      perceive(page, persona, 1).elements.some((e) =>
        e.decisions.some((d) => d.stage === "knowledge"),
      ),
    ),
  ).toBe(true);
});

test("a threshold keeps the persona's source at the persona's own value, and folk elsewhere", () => {
  // `perceive` never reads it, but the type needs one, and a slider value cites nothing.
  const veraContrast = (query: Record<string, unknown>) =>
    stateOf({ persona: "prof_vera", ...query }).profile.perception.contrast;
  expect(veraContrast({ contrast: 3 })).toStrictEqual({
    threshold: 3,
    softness: 0.5,
    provenance: "wcag22",
  });
  // Moved, the threshold cites nothing. Her softness, not in the URL, stays her own.
  expect(veraContrast({ contrast: 2 })).toStrictEqual({
    threshold: 2,
    softness: 0.5,
    provenance: "folk",
  });
  // The source is the threshold's, so a softness moved alone keeps it.
  expect(veraContrast({ contrastSoftness: 0 })).toStrictEqual({
    threshold: 3,
    softness: 0,
    provenance: "wcag22",
  });
  // Milo sets a target threshold of 44 from `hig` and no contrast threshold.
  const milo = stateOf({ persona: "prof_milo", contrast: 4.5, targetPx: 44 }).profile.perception;
  expect(milo.contrast).toStrictEqual({ threshold: 4.5, softness: 0, provenance: "folk" });
  expect(milo.targetPx).toStrictEqual({ threshold: 44, softness: 0, provenance: "hig" });
  expect(stateOf({ persona: "prof_milo", targetPx: 45 }).profile.perception.targetPx).toStrictEqual(
    {
      threshold: 45,
      softness: 0,
      provenance: "folk",
    },
  );
});

test("edited is false at a persona's own values, left out of the URL or written out in it", () => {
  // Every slider of each persona written out at its own position, as a link reads after a drag
  // back: off for a threshold the persona does not set, 0 for a softness it does not set.
  for (const persona of profileFixtures) {
    const own = stateOf({ persona: persona.id });
    expect(own.edited, persona.id).toBe(false);
    const written = Object.fromEntries(
      METRIC_NAMES.flatMap((metric) => [
        [metric, own.cuts[metric].threshold],
        [softnessKey(metric), own.cuts[metric].softness],
      ]),
    );
    expect(stateOf({ persona: persona.id, ...written }), persona.id).toStrictEqual(own);
  }
});

test("edited is true after any threshold or softness that changes perception", () => {
  const vera = stateOf({ persona: "prof_vera" });
  const ada = stateOf({ persona: "prof_ada" });
  for (const metric of METRIC_NAMES) {
    const { off, max, step } = CUT_SLIDERS[metric];
    const moves: [PreviewState, Record<string, unknown>][] = [
      // One step up, switched off, and a softness none of Vera's is.
      [vera, { persona: "prof_vera", [metric]: vera.cuts[metric].threshold + step }],
      [vera, { persona: "prof_vera", [metric]: off }],
      [vera, { persona: "prof_vera", [softnessKey(metric)]: 0.25 }],
      // Switched on.
      [ada, { persona: "prof_ada", [metric]: max }],
    ];
    for (const [own, query] of moves) {
      const moved = stateOf(query);
      const label = JSON.stringify(query);
      expect(moved.profile.perception, label).not.toStrictEqual(own.profile.perception);
      expect(moved.edited, label).toBe(true);
    }
  }
});

test("a persona link keeps the seed and the evidence toggle and drops every threshold", () => {
  const moved = validate({
    persona: "prof_vera",
    seed: 7,
    contrast: 2,
    contrastSoftness: 0,
    fontPx: 20,
    fontPxSoftness: 0.1,
    targetPx: 40,
    targetPxSoftness: 0.2,
    evidence: true,
  });
  const link = personaSearch(resolvePreview(moved), "prof_zoya");
  expect(link).toStrictEqual({ persona: "prof_zoya", seed: 7, evidence: true, page: undefined });
  // So Zoya opens at her own values, unedited, on Vera's seed (`docs/PLAN.md`, A20).
  const zoya = resolvePreview(link);
  expect(zoya.persona).toStrictEqual(profileFixture("prof_zoya"));
  expect(zoya.seed).toBe(7);
  expect(zoya.edited).toBe(false);
  expect(zoya.evidence).toBe(true);
  // Without the toggle, the link carries none; without a seed in the URL, it writes out the 1.
  expect(personaSearch(stateOf({ persona: "prof_vera", seed: 7 }), "prof_milo")).toStrictEqual({
    persona: "prof_milo",
    seed: 7,
    evidence: undefined,
    page: undefined,
  });
  expect(personaSearch(stateOf({}), "prof_milo")).toStrictEqual({
    persona: "prof_milo",
    seed: 1,
    evidence: undefined,
    page: undefined,
  });
});

test("each preview page is a page param, and anything else falls back to /deliveries", () => {
  for (const page of PREVIEW_PAGES) expect(stateOf({ page }).page).toBe(page);
  // Pages io measures but the preview does not offer, and paths the target app does not have.
  for (const page of ["/", "/settings", "/nowhere", "deliveries", 3]) {
    expect(validate({ page }).page, String(page)).toBeUndefined();
    expect(stateOf({ page }).page, String(page)).toBe("/deliveries");
  }
});

test("a page link back to /deliveries leaves the page param out", () => {
  // Keeping persona, seed, sliders and view is `preview.test.tsx`'s page-control test.
  const onData = validate({ persona: "prof_vera", page: "/settings/data" });
  expect(pageSearch(onData, "/deliveries")).toStrictEqual({
    persona: "prof_vera",
    page: undefined,
  });
});
