/**
 * The WCAG 2.2 contrast ratio of a text colour against the background colours behind it. It is
 * our own code, not a library's (`docs/STACK.md`, "Core and filter"). Colours arrive as
 * computed-style strings in the space they were authored in, `oklch(…)` for a Tailwind 4 site, and
 * `culori` reads them into sRGB.
 *
 * It reads colours, not pixels: partial `opacity`, `text-shadow` and pseudo-elements are not seen
 * (`docs/specs/2026-09-29-s1-02-metrics-collector.md`, Decision log rows 6 and 7, and Risks).
 */
import { WayfordError } from "@wayford/core";
import { clampRgb, converter } from "culori";

/** A colour in sRGB: `r`, `g`, `b` and `alpha`, each in [0, 1]. */
export type Rgba = { r: number; g: number; b: number; alpha: number };

/**
 * One layer of paint behind the text: an element's computed `background-color`, and whether it
 * paints something other than that colour, a `background-image`, so the colour behind it is unknown.
 */
export type BackgroundLayer = { color: string; image: boolean };

const WHITE: Rgba = { r: 1, g: 1, b: 1, alpha: 1 };

const toRgb = converter("rgb");

// 0.04045 is WCAG 2.2's constant. WCAG 2.0 printed 0.03928.
const linear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/**
 * Any colour a computed style gives, in sRGB. A string culori cannot read is page data this
 * package rejects, with a `WayfordError` of code `unparsable_colour`.
 */
export function parseColour(css: string): Rgba {
  const colour = toRgb(css);
  if (colour === undefined) {
    throw new WayfordError("unparsable_colour", `cannot parse the colour ${JSON.stringify(css)}`);
  }
  // Out of gamut, a colour is clamped into sRGB. A `none` channel comes out of culori missing,
  // although its types say it is there, and CSS treats it as 0. A missing alpha is 1, unless the
  // string says `/ none`, which culori cannot tell apart from no alpha at all.
  const { r = 0, g = 0, b = 0, alpha = /\/\s*none\s*\)\s*$/i.test(css) ? 0 : 1 } = clampRgb(colour);
  return { r, g, b, alpha };
}

/** `top` painted over `bottom`: source-over, blended in sRGB as browsers blend. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const alpha = top.alpha + bottom.alpha * (1 - top.alpha);
  const over = (above: number, below: number) =>
    alpha === 0 ? 0 : (above * top.alpha + below * bottom.alpha * (1 - top.alpha)) / alpha;
  return { r: over(top.r, bottom.r), g: over(top.g, bottom.g), b: over(top.b, bottom.b), alpha };
}

/** The relative luminance of an opaque colour. Alpha is not read: composite first. */
export function relativeLuminance({ r, g, b }: Rgba): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** `(L1 + 0.05) / (L2 + 0.05)`, with L1 the lighter of the two, so the order does not matter. */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The opaque colour the text is drawn on. `layers` run from the element that draws the text out to
 * the canvas, and are cut at the first opaque colour, which hides the rest. What is left is
 * composited from the outside in, on white, the canvas Chromium paints by default. `undefined` when
 * a layer up to and including that cut paints something other than its colour: a number against a
 * colour the text is not drawn on is a claim we could not defend.
 */
export function effectiveBackground(layers: readonly BackgroundLayer[]): Rgba | undefined {
  const shown: Rgba[] = [];
  for (const layer of layers) {
    if (layer.image) return undefined;
    const colour = parseColour(layer.color);
    shown.push(colour);
    if (colour.alpha === 1) break;
  }
  return shown.reduceRight((bottom, top) => composite(top, bottom), WHITE);
}

/** The text colour's ratio against its effective background, truncated, or `undefined`. */
export function textContrast(text: string, layers: readonly BackgroundLayer[]): number | undefined {
  const background = effectiveBackground(layers);
  if (background === undefined) return undefined;
  return truncateRatio(contrastRatio(composite(parseColour(text), background), background));
}

/**
 * 3 decimals, never rounded up: WCAG never rounds a ratio up to meet a threshold, so 2.9996 must
 * not pass a `>= 3` cut. The 1e-9 only absorbs float noise: 2.006 × 1000 is 2005.9999999999998,
 * which would otherwise give 2.005.
 */
export function truncateRatio(ratio: number): number {
  return Math.floor(ratio * 1000 + 1e-9) / 1000;
}
