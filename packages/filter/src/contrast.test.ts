/**
 * `contrast.ts` against WCAG 2.2's published ratios and the background rules of the s1-02 spec
 * (`docs/specs/2026-09-29-s1-02-metrics-collector.md`, "packages/filter/src/contrast.ts"). Every
 * expected number is a published one or worked out from the definitions, never read back from the
 * code.
 */
import { WayfordError } from "@wayford/core";
import { describe, expect, test } from "vitest";
import {
  type BackgroundLayer,
  contrastRatio,
  effectiveBackground,
  parseColour,
  type Rgba,
  textContrast,
  truncateRatio,
} from "./contrast.js";

const layer = (color: string): BackgroundLayer => ({ color, image: false });
const withImage = (under: BackgroundLayer): BackgroundLayer => ({ ...under, image: true });

const white = layer("rgb(255, 255, 255)");
const clear = layer("rgba(0, 0, 0, 0)");
/** Black at a quarter alpha, which over white is `GREY`. */
const tint = layer("rgba(0, 0, 0, 0.25)");
const GREY: Rgba = { r: 0.75, g: 0.75, b: 0.75, alpha: 1 };

describe("the contrast ratio", () => {
  test.each([
    ["black on white is 21:1", "#000000", 21],
    ["#767676 on white is 4.54:1", "#767676", 4.54],
    ["#777777 on white is 4.48:1", "#777777", 4.48],
  ])("%s, whichever colour comes first", (_claim, text, published) => {
    const a = parseColour(text);
    const b = parseColour("#ffffff");
    expect(contrastRatio(a, b)).toBeCloseTo(published, 2);
    expect(contrastRatio(b, a)).toBe(contrastRatio(a, b));
  });
});

describe("the effective background", () => {
  type Row = [claim: string, layers: BackgroundLayer[], background: Rgba | undefined];
  const ROWS: Row[] = [
    ["an alpha layer is composited over the opaque one behind it", [tint, white], GREY],
    ["with no opaque layer, the chain is composited over white", [clear, tint, clear], GREY],
    ["an image before the first opaque one makes it unknown", [withImage(clear), white], undefined],
    ["an image on the first opaque layer makes it unknown", [tint, withImage(white)], undefined],
    ["an image beyond the first opaque one is hidden by it", [tint, white, withImage(clear)], GREY],
  ];
  test.each(ROWS)("%s", (_claim, layers, background) => {
    expect(effectiveBackground(layers)).toStrictEqual(background);
  });
});

describe("the text contrast", () => {
  test("composites a text colour with alpha, then truncates the ratio", () => {
    // Black at half alpha on white is drawn as mid grey, 3.9766…:1. Unblended black would give 21,
    // and rounding 3.977.
    expect(textContrast("rgba(0, 0, 0, 0.5)", [white])).toBe(3.976);
  });

  test("is undefined when the background is", () => {
    expect(textContrast("rgb(0, 0, 0)", [withImage(white)])).toBeUndefined();
  });
});

describe("parseColour", () => {
  test.each<[css: string, colour: Rgba]>([
    ["rgb(118, 118, 118)", { r: 118 / 255, g: 118 / 255, b: 118 / 255, alpha: 1 }],
    ["rgba(0, 0, 0, 0.5)", { r: 0, g: 0, b: 0, alpha: 0.5 }],
    ["rgb(255 0 0 / 0.25)", { r: 1, g: 0, b: 0, alpha: 0.25 }],
    // sRGB red, written in OKLCH.
    [
      "oklch(0.627955 0.257683 29.2339)",
      { r: expect.closeTo(1, 4), g: expect.closeTo(0, 4), b: expect.closeTo(0, 4), alpha: 1 },
    ],
    // Outside the sRGB gamut: each channel is clamped to [0, 1].
    ["color(srgb 1.2 -0.1 0.5)", { r: 1, g: 0, b: 0.5, alpha: 1 }],
    // Chromium keeps a `none` channel in the computed colour, and CSS treats it as 0.
    ["color(srgb none 0.5 1)", { r: 0, g: 0.5, b: 1, alpha: 1 }],
    // A `none` alpha is 0 too, so the colour is transparent, as Chromium paints it.
    ["color(srgb 0 0 0 / none)", { r: 0, g: 0, b: 0, alpha: 0 }],
  ])("reads %s", (css, colour) => {
    expect(parseColour(css)).toStrictEqual(colour);
  });

  test("throws a WayfordError naming a string it cannot parse", () => {
    const parse = () => parseColour("sky blue");
    expect(parse).toThrow(WayfordError);
    expect(parse).toThrow(
      expect.objectContaining({
        code: "unparsable_colour",
        message: expect.stringContaining('"sky blue"'),
      }),
    );
  });
});

describe("truncateRatio", () => {
  test.each([
    ["never rounds up: 2.9996 is 2.999, below a >= 3 cut", 2.9996, 2.999],
    ["keeps an exact ratio: 3 is 3", 3, 3],
    ["keeps the top of the scale: 21 is 21", 21, 21],
    // 2.006 × 1000 is 2005.9999999999998 in floating point: without the guard it would be 2.005.
    ["absorbs float noise: 2.006 stays 2.006", 2.006, 2.006],
  ])("%s", (_claim, ratio, truncated) => {
    expect(truncateRatio(ratio)).toBe(truncated);
  });
});
