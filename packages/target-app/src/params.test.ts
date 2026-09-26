import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { PAGES } from "./pages.js";
import {
  DEFAULT_PARAMS,
  hasParams,
  type ParamStore,
  parseParams,
  resolveParams,
  STORAGE_KEY,
  themeVariables,
} from "./params.js";

// Reference WCAG 2.2 relative luminance and contrast ratio, pinned to published greys below.
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

const css = readFileSync(fileURLToPath(new URL("./style.css", import.meta.url)), "utf8");

/** Innermost `selector { body }` rules; blocks inside `@media` come out with their own selector. */
function cssRules(): { selector: string; body: string }[] {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: (m[1] ?? "").trim(),
    body: m[2] ?? "",
  }));
}

describe("contrast from the CSS variables", () => {
  test("?contrast=2 renders the hard link near 2:1", () => {
    expect(contrastFor("?contrast=2")).toBeCloseTo(2, 1);
  });

  test("?contrast=7 renders the hard link near 7:1", () => {
    expect(contrastFor("?contrast=7")).toBeCloseTo(7, 1);
  });

  test.each([1, 1.5, 2, 2.5, 3, 4.5, 7, 10, 21])("?contrast=%d lands at or just above", (ratio) => {
    const actual = contrastFor(`?contrast=${ratio}`);
    expect(actual).toBeGreaterThanOrEqual(ratio);
    expect(actual).toBeLessThan(ratio * 1.025);
  });

  // #767676 is the widely published lightest grey that passes 4.5:1 on white.
  test.each([
    [2, "#b7b7b7"],
    [3, "#949494"],
    [4.5, "#767676"],
    [7, "#595959"],
    [21, "#000000"],
  ])("?contrast=%d picks %s, the lightest grey that reaches it", (ratio, hex) => {
    expect(themeVariables(parseParams(`?contrast=${ratio}`))["--fg"]).toBe(hex);
  });

  test("is monotone, so a sweep sees one boundary", () => {
    const ratios = Array.from({ length: 41 }, (_, i) => 1 + i * 0.5).map((r) =>
      contrastFor(`?contrast=${r}`),
    );
    for (let i = 1; i < ratios.length; i++) {
      expect(ratios[i]).toBeGreaterThanOrEqual(ratios[i - 1] as number);
    }
  });
});

// Vera's bundle in docs/RULES.md: contrast 3.0 soft, font 16, target 32 hard cuts.
describe("defaults", () => {
  test("contrast is 2:1, below Vera's 3:1, inside her softness band", () => {
    expect(contrastFor("")).toBeCloseTo(2, 1);
    expect(contrastFor("")).toBeLessThan(3);
  });

  test("font and target meet Vera's hard cuts, so contrast is the only metric that gates her", () => {
    expect(DEFAULT_PARAMS.fontPx).toBeGreaterThanOrEqual(16);
    expect(DEFAULT_PARAMS.targetPx).toBeGreaterThanOrEqual(32);
  });

  test("the one :root fallback in style.css matches them", () => {
    const roots = cssRules().filter((rule) => rule.selector === ":root");
    expect(roots).toHaveLength(1);
    for (const [name, value] of Object.entries(themeVariables(DEFAULT_PARAMS))) {
      expect(roots[0]?.body).toContain(`${name}: ${value};`);
    }
  });
});

// The cuts of the persona bundles in docs/RULES.md. A size exactly on one passes only because the
// rules compare with `>=`, and a box there can flip on sub-pixel layout (issue #32). The hard
// link's variables are the one place a size may sit on a cut, and they are not fixed sizes.
const FONT_CUTS = [16, 24]; // Vera, Zoya
const TARGET_CUTS = [32, 44, 48]; // Vera, Milo, Zoya

/**
 * Every fixed size declared for `property` in style.css, in px. Custom properties and the hard
 * link's variables are left out. Any other unit fails here, so no size slips past the cut checks
 * as em, rem or a keyword.
 */
function pxSizes(property: RegExp): number[] {
  const pattern = new RegExp(`(?<![\\w-])(?:${property.source}):\\s*([^;]+);`, "g");
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const values = [...rules.matchAll(pattern)]
    .map((m) => (m[1] ?? "").trim())
    .filter((value) => !value.startsWith("var("));
  for (const value of values) expect(value).toMatch(/^\d+(?:\.\d+)?px$/);
  return values.map((value) => Number.parseFloat(value));
}

const pageMarkup = (file: string): string =>
  readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8");

describe("style.css", () => {
  // Fixed text at or below Vera's 16 px font cut would be an off-path removal in her evidence.
  test("every fixed font size clears Vera's 16 px cut and sits on no font cut", () => {
    const sizes = pxSizes(/font-size/);
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) {
      expect(size).toBeGreaterThan(16);
      expect(FONT_CUTS).not.toContain(size);
    }
  });

  // Without one, a heading takes the browser's em default: `h2` sat on Zoya's 24 px cut while
  // body text was 16 px.
  test("every heading level the pages use sets its own size", () => {
    const levels = new Set(
      PAGES.flatMap((page) => [...pageMarkup(page.file).matchAll(/<(h[1-6])\b/g)].map((m) => m[1])),
    );
    expect(levels.size).toBeGreaterThan(0);
    for (const level of levels) {
      const body = cssRules().find((rule) => rule.selector === level)?.body ?? "";
      expect(body, `${level} in style.css`).toMatch(/(?:^|;)\s*font-size:/);
    }
  });

  // Milo's 44 px is the strictest target cut of a persona meant to get through; declaring the
  // height keeps it from depending on font metrics.
  test.each([".site-nav a", ".menu-toggle", ".button", ".big-link"])(
    "%s declares a box taller than Milo's 44 px cut",
    (selector) => {
      const body = cssRules().find((rule) => rule.selector === selector)?.body ?? "";
      expect(Number(/min-height:\s*(\d+)px/.exec(body)?.[1])).toBeGreaterThan(44);
    },
  );

  test("no fixed box size sits on a target cut", () => {
    const sizes = pxSizes(/(?:min-)?(?:height|width)/);
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) expect(TARGET_CUTS).not.toContain(size);
  });

  test("only .hard-link reads the tunable variables", () => {
    const readers = cssRules()
      .filter((rule) => /var\(\s*--(?:fg|bg|font-size|target-size)\s*[,)]/.test(rule.body))
      .map((rule) => rule.selector);
    expect(readers).toEqual([".hard-link"]);
  });

  test(".hard-link takes every variable, height and width from --target-size", () => {
    const body = cssRules().find((rule) => rule.selector === ".hard-link")?.body ?? "";
    // Without these three the min sizes stop being the box: padding or line-height would add to it.
    for (const line of [
      "display: inline-flex;",
      "padding: 0;",
      "line-height: 1;",
      "color: var(--fg);",
      "background: var(--bg);",
      "font-size: var(--font-size);",
      "min-width: var(--target-size);",
      "min-height: var(--target-size);",
    ]) {
      expect(body).toContain(line);
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

  test("clamps out-of-range values, infinities included", () => {
    expect(parseParams("?contrast=50&fontPx=1&targetPx=0")).toEqual({
      contrast: 21,
      fontPx: 6,
      targetPx: 8,
    });
    expect(parseParams("?contrast=Infinity&fontPx=-Infinity").contrast).toBe(21);
    expect(parseParams("?contrast=Infinity&fontPx=-Infinity").fontPx).toBe(6);
    expect(parseParams("?contrast=0&fontPx=500&targetPx=Infinity")).toEqual({
      contrast: 1,
      fontPx: 72,
      targetPx: 96,
    });
  });

  test("uses a fallback value only when it is a finite number", () => {
    const fallback = { contrast: 7, fontPx: "12", targetPx: null } as unknown as Record<
      string,
      number
    >;
    expect(parseParams("", fallback)).toEqual({
      contrast: 7,
      fontPx: DEFAULT_PARAMS.fontPx,
      targetPx: DEFAULT_PARAMS.targetPx,
    });
  });

  test("hasParams sees only its own names", () => {
    expect(hasParams("?contrast=3")).toBe(true);
    expect(hasParams("?utm=x")).toBe(false);
  });
});

describe("resolveParams", () => {
  function memoryStore(initial?: object): ParamStore & { data: Map<string, string> } {
    const data = new Map<string, string>();
    if (initial) data.set(STORAGE_KEY, JSON.stringify(initial));
    return {
      data,
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, value),
    };
  }

  test("a query with parameters decides alone and is stored", () => {
    const store = memoryStore({ contrast: 7, fontPx: 24, targetPx: 48 });
    const params = resolveParams("?contrast=3", store);
    expect(params).toEqual({ ...DEFAULT_PARAMS, contrast: 3 });
    expect(JSON.parse(store.data.get(STORAGE_KEY) ?? "")).toEqual(params);
  });

  test("a query without parameters uses what is stored and writes nothing", () => {
    const stored = { contrast: 4.5, fontPx: 20, targetPx: 44 };
    const store = memoryStore(stored);
    expect(resolveParams("?utm=x", store)).toEqual(stored);
    expect(store.data.get(STORAGE_KEY)).toBe(JSON.stringify(stored));
  });

  test("an empty store, a corrupt one, or none at all gives the defaults", () => {
    expect(resolveParams("", memoryStore())).toEqual(DEFAULT_PARAMS);
    const corrupt = memoryStore();
    corrupt.data.set(STORAGE_KEY, "null");
    expect(resolveParams("", corrupt)).toEqual(DEFAULT_PARAMS);
    corrupt.data.set(STORAGE_KEY, "{not json");
    expect(resolveParams("", corrupt)).toEqual(DEFAULT_PARAMS);
    corrupt.data.set(STORAGE_KEY, '{"contrast":1e999,"fontPx":-1e999,"targetPx":1e999}');
    expect(resolveParams("", corrupt)).toEqual(DEFAULT_PARAMS);
    expect(resolveParams("", undefined)).toEqual(DEFAULT_PARAMS);
  });

  test("a store that throws still renders the query", () => {
    const throwing: ParamStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(resolveParams("?contrast=5", throwing)).toEqual({ ...DEFAULT_PARAMS, contrast: 5 });
    expect(resolveParams("", throwing)).toEqual(DEFAULT_PARAMS);
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
