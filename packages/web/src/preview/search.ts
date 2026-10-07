/**
 * The preview's URL contract: what each search param of `/lens` means, and how a URL becomes
 * the profile `perceive` gets. The URL holds the whole preview state, so a preview is a link.
 *
 * - `persona`: a bundled profile id. Absent or unknown, Vera.
 * - `seed`: a `Seed`, standing in for a run seed. Absent or invalid, 1, never the profile's seed,
 *   which only draws the avatar (`docs/PLAN.md`, A20).
 * - `contrast`, `fontPx`, `targetPx`: a threshold on its slider, whose lowest position, `off`,
 *   means the metric does not gate. Absent or invalid, the persona's own, or off.
 * - `contrastSoftness`, `fontPxSoftness`, `targetPxSoftness`: 0 to 1. Absent or invalid, the
 *   persona's own, or 0.
 * - `evidence`: `true` for the evidence view. Anything else, off.
 * - `illustration`: `true` for the illustration view (s3-06). Anything else, off. `evidence=true`
 *   wins over it, so an s3-01 evidence link keeps its meaning.
 * - `page`: one of `PREVIEW_PAGES`, the target-app page the preview perceives. Absent or invalid,
 *   `/deliveries`.
 *
 * Every param is optional in the URL and defaulted in `resolvePreview`, so a short link is as
 * canonical as a long one.
 *
 * Nothing here decides visibility. A threshold is passed on or left out, and `perceive` decides
 * every element from what it is passed.
 */
import { METRIC_NAMES, type MetricName, Probability, type Profile, Seed } from "@wayford/core";
import { z } from "zod";
import { bundledProfiles } from "../bundled-fixtures.js";

/**
 * The persona a link without one opens: Vera, the demo persona and the one the contrast sweep runs
 * on (`docs/RULES.md`).
 */
const DEFAULT_PERSONA = "prof_vera";

/** The seed a link without one opens. It stands in for a run seed, so it is never the profile's. */
const DEFAULT_SEED = 1;

/**
 * The target-app pages the preview offers (s3-05): `/deliveries`, where the hard goal's main route
 * leaves, and the pages routes B and C reach the archive from. io measures any of the app's pages;
 * these are the ones the demo shows (`docs/DEMO.md`).
 */
export const PREVIEW_PAGES = ["/deliveries", "/account", "/settings/data"] as const;
export type PreviewPage = (typeof PREVIEW_PAGES)[number];

/** The page a link without one opens: the one the stored measurement is of. */
const DEFAULT_PAGE: PreviewPage = "/deliveries";

/**
 * Slider bounds per metric. `off` is the lowest position and means "this metric does not gate". A
 * contrast ratio is at least 1:1 and a size more than 0 px, so a threshold there fails nothing,
 * and the preview leaves it out of the perception instead of passing it on: Ada's preview stays
 * `perceive(measurement, ada, seed)`, and `0 px` never reaches a `PixelThreshold`.
 */
export const CUT_SLIDERS: Record<MetricName, { off: number; max: number; step: number }> = {
  contrast: { off: 1, max: 21, step: 0.1 },
  fontPx: { off: 0, max: 48, step: 1 },
  targetPx: { off: 0, max: 96, step: 1 },
};

/** Every metric's softness slider, over core's `Probability`: 0 is a hard cut, 1 the widest band. */
export const SOFTNESS_SLIDER = { min: 0, max: 1, step: 0.05 };

/** The seed slider. A seed past its end, such as a run's, is used as the URL gives it. */
export const SEED_SLIDER = { min: 0, max: 100, step: 1 };

/** The search param that holds a metric's softness. */
export function softnessKey(metric: MetricName): `${MetricName}Softness` {
  return `${metric}Softness`;
}

/** Whether a threshold sits at its slider's off position, where it fails nothing. */
export function isOff(metric: MetricName, threshold: number): boolean {
  return threshold <= CUT_SLIDERS[metric].off;
}

/** A threshold param: a value on its metric's slider, `off` included. */
function thresholdParam(metric: MetricName) {
  const { off, max } = CUT_SLIDERS[metric];
  return z.number().min(off).max(max).optional().catch(undefined);
}

/** A softness param: what a profile's softness may be. */
const softnessParam = Probability.optional().catch(undefined);

/**
 * The preview's search params, validated. Every field is optional and ends in `.catch`, so a
 * broken link degrades to the defaults and the persona's values instead of an error screen.
 *
 * Every key the query holds comes back from a parse. TanStack merges a route's validated search
 * over the raw query, so a key the parse left out would let a raw `contrast=high` through to
 * `useSearch`; zod returns a present but invalid key as `undefined`, which overrides it. An absent
 * key stays absent, so a threshold stays out of the URL until its slider moves.
 */
export const PreviewSearch = z.object({
  persona: z
    .enum(bundledProfiles.map((profile) => profile.id))
    .optional()
    .catch(undefined),
  seed: Seed.optional().catch(undefined),
  contrast: thresholdParam("contrast"),
  contrastSoftness: softnessParam,
  fontPx: thresholdParam("fontPx"),
  fontPxSoftness: softnessParam,
  targetPx: thresholdParam("targetPx"),
  targetPxSoftness: softnessParam,
  evidence: z.literal(true).optional().catch(undefined),
  illustration: z.literal(true).optional().catch(undefined),
  page: z.enum(PREVIEW_PAGES).optional().catch(undefined),
});
export type PreviewSearch = z.infer<typeof PreviewSearch>;

/** The persona a search is for: its own, or Vera when it names none. */
function personaIdOf(search: PreviewSearch): string {
  return search.persona ?? DEFAULT_PERSONA;
}

/**
 * The Lens's three views: the page as perceived, the evidence of what removed what, and the page
 * under the persona's Chrome vision emulation, which illustrates and never decides.
 */
export type LensView = "perceived" | "evidence" | "illustration";

/** One metric's sliders: the threshold, `off` included, and its softness. */
export type Cut = { threshold: number; softness: number };

/** What a validated preview URL resolves to. */
export type PreviewState = {
  persona: Profile;
  seed: Seed;
  /** What the sliders show: every metric, `off` included. */
  cuts: Record<MetricName, Cut>;
  /**
   * What `perceive` gets: the persona whole, so its caps and the patterns it does not know apply as
   * they do in a run (`docs/PLAN.md`, F2 AC3), with the perception the sliders give in place of its
   * own: a threshold for each metric that gates, and the persona's emulation.
   */
  profile: Profile;
  /**
   * Whether `profile.perception` differs from the persona's own. The screen says "edited" when it
   * does, so a moved slider is never presented as the persona.
   */
  edited: boolean;
  view: LensView;
  /** The target-app page perceived. */
  page: PreviewPage;
};

/**
 * Resolve a validated search against its persona. Per metric, in `METRIC_NAMES` order, the URL's
 * value wins, then the persona's own, then the slider's `off` for a threshold and 0 for a
 * softness. A threshold reaches the profile's perception only above `off`, with its softness
 * written out.
 */
export function resolvePreview(search: PreviewSearch): PreviewState {
  const id = personaIdOf(search);
  const persona = bundledProfiles.find((profile) => profile.id === id);
  // `PreviewSearch` admits only bundled ids, so only a bug reaches this.
  if (persona === undefined) throw new Error(`No bundled persona ${id}`);
  const ownPerception = persona.perception;
  const cuts: Record<MetricName, Cut> = {
    contrast: cutOf(search, ownPerception, "contrast"),
    fontPx: cutOf(search, ownPerception, "fontPx"),
    targetPx: cutOf(search, ownPerception, "targetPx"),
  };
  const perception: Profile["perception"] = { emulation: ownPerception.emulation };
  let edited = false;
  for (const metric of METRIC_NAMES) {
    const cut = gatingCut(metric, cuts[metric]);
    // Both sides as `perceive` applies them, so a softness under an off threshold, a softness of 0
    // where the persona sets none, and a threshold the persona sets at off are no edit.
    if (!sameCut(cut, gatingCut(metric, ownPerception[metric]))) edited = true;
    if (cut === undefined) continue;
    // `perceive` never reads the provenance, but the type needs one. A slider value cites nothing,
    // so only the persona's own threshold keeps the persona's source.
    const ownThreshold = ownPerception[metric];
    const provenance = ownThreshold?.threshold === cut.threshold ? ownThreshold.provenance : "folk";
    perception[metric] = { ...cut, provenance };
  }
  return {
    persona,
    seed: search.seed ?? DEFAULT_SEED,
    cuts,
    profile: { ...persona, perception },
    edited,
    view: viewOf(search),
    page: search.page ?? DEFAULT_PAGE,
  };
}

/** The view a search opens: evidence when it says so, whatever else it says, then illustration. */
function viewOf(search: PreviewSearch): LensView {
  if (search.evidence === true) return "evidence";
  if (search.illustration === true) return "illustration";
  return "perceived";
}

/**
 * The search a persona link navigates to: the new persona on the same seed, view and page. The
 * thresholds and softness are dropped, so they fall back to the new persona's own. The seed stays,
 * because it stands in for a run seed, and a run set compares personas on the same seeds
 * (`docs/PLAN.md`, A20). The page is left out at its default, so a short link stays short.
 */
export function personaSearch(
  state: Pick<PreviewState, "seed" | "view" | "page">,
  personaId: string,
): PreviewSearch {
  return {
    persona: personaId,
    seed: state.seed,
    evidence: state.view === "evidence" ? true : undefined,
    illustration: state.view === "illustration" ? true : undefined,
    page: pageParam(state.page),
  };
}

/**
 * The search a page link navigates to: everything as it is, on `page`. The sliders stay, since
 * they are the persona's, not the page's.
 */
export function pageSearch(search: PreviewSearch, page: PreviewPage): PreviewSearch {
  return { ...search, page: pageParam(page) };
}

/** A page as the URL holds it: absent at the default. */
function pageParam(page: PreviewPage): PreviewPage | undefined {
  return page === DEFAULT_PAGE ? undefined : page;
}

/** What a metric's sliders show: the URL's value, else the persona's own, else `off` and 0. */
function cutOf(search: PreviewSearch, own: Profile["perception"], metric: MetricName): Cut {
  return {
    threshold: search[metric] ?? own[metric]?.threshold ?? CUT_SLIDERS[metric].off,
    softness: search[softnessKey(metric)] ?? own[metric]?.softness ?? 0,
  };
}

/**
 * A threshold as `perceive` applies it: none at or below the slider's `off`, where it fails
 * nothing, and an absent softness written as 0, the hard cut `perceive` reads either way.
 */
function gatingCut(
  metric: MetricName,
  cut: { threshold: number; softness?: number | undefined } | undefined,
): Cut | undefined {
  if (cut === undefined || isOff(metric, cut.threshold)) return undefined;
  return { threshold: cut.threshold, softness: cut.softness ?? 0 };
}

/** Two gating cuts are the same when both are absent, or when thresholds and softnesses are equal. */
function sameCut(a: Cut | undefined, b: Cut | undefined): boolean {
  return a?.threshold === b?.threshold && a?.softness === b?.softness;
}
