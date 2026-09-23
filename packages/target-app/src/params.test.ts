import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { DEFAULT_PARAMS, hasParams, parseParams, themeVariables } from "./params.js";

// Written independently of params.ts: WCAG 2.2 relative luminance and contrast ratio.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function contrastFor(search: string): number {
  const vars = themeVariables(parseParams(search));
  return contrast(vars["--fg"], vars["--bg"]);
}

describe("contrast from the CSS variables", () => {
  test("?contrast=2 renders the hard link near 2:1", () => {
    expect(contrastFor("?contrast=2")).toBeCloseTo(2, 1);
  });

  test("?contrast=7 renders the hard link near 7:1", () => {
    expect(contrastFor("?contrast=7")).toBeCloseTo(7, 1);
  });

  test.each([1, 1.5, 2.5, 3, 4.5, 7, 10, 21])("?contrast=%d lands at or just above", (ratio) => {
    const actual = contrastFor(`?contrast=${ratio}`);
    expect(actual).toBeGreaterThanOrEqual(ratio);
    expect(actual).toBeLessThan(ratio * 1.03);
  });

  test("is monotone, so a sweep sees one boundary", () => {
    const ratios = Array.from({ length: 41 }, (_, i) => 1 + i * 0.5).map((r) =>
      contrastFor(`?contrast=${r}`),
    );
    for (let i = 1; i < ratios.length; i++) {
      expect(ratios[i]).toBeGreaterThanOrEqual(ratios[i - 1] as number);
    }
  });

  // Checked by eye: 3:1 is findable if you look, 2:1 is genuinely hard to notice.
  test("the default is 2:1, below the 3:1 anchor", () => {
    expect(contrastFor("")).toBeCloseTo(2, 1);
    expect(contrastFor("")).toBeLessThan(3);
  });

  test("the CSS fallback matches the default, so the page looks the same before the script runs", () => {
    const css = readFileSync(fileURLToPath(new URL("./style.css", import.meta.url)), "utf8");
    const vars = themeVariables(DEFAULT_PARAMS);
    for (const [name, value] of Object.entries(vars)) {
      expect(css).toContain(`${name}: ${value};`);
    }
  });
});

describe("parseParams", () => {
  test("falls back to defaults", () => {
    expect(parseParams("")).toEqual(DEFAULT_PARAMS);
    expect(parseParams("?contrast=&fontPx=abc")).toEqual(DEFAULT_PARAMS);
  });

  test("reads every parameter", () => {
    expect(parseParams("?contrast=4.5&fontPx=16&targetPx=44")).toEqual({
      contrast: 4.5,
      fontPx: 16,
      targetPx: 44,
    });
  });

  test("clamps out-of-range values", () => {
    expect(parseParams("?contrast=50&fontPx=1&targetPx=0")).toEqual({
      contrast: 21,
      fontPx: 6,
      targetPx: 8,
    });
  });

  test("uses the stored value when the query omits one", () => {
    expect(parseParams("?fontPx=20", { contrast: 7, fontPx: 12 })).toEqual({
      contrast: 7,
      fontPx: 20,
      targetPx: DEFAULT_PARAMS.targetPx,
    });
  });

  test("hasParams sees only its own names", () => {
    expect(hasParams("?contrast=3")).toBe(true);
    expect(hasParams("?utm=x")).toBe(false);
  });
});

describe("themeVariables", () => {
  test("maps font and target size to px", () => {
    const vars = themeVariables({ contrast: 3, fontPx: 16, targetPx: 44 });
    expect(vars["--font-size"]).toBe("16px");
    expect(vars["--target-size"]).toBe("44px");
    expect(vars["--bg"]).toBe("#ffffff");
  });
});
