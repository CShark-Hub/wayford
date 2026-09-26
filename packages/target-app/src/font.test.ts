// The one bundled font (issue #32): its `@font-face` in style.css and its file in public/fonts.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { PAGES } from "./pages.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file: string): string => readFileSync(`${root}${file}`, "utf8");
/** style.css without comments, so a commented-out rule never counts. */
const css = read("src/style.css").replace(/\/\*[\s\S]*?\*\//g, "");
const pages = PAGES.map((page) => ({ file: page.file, markup: read(page.file) }));

/** Every declaration of `property` outside `@font-face`, as its trimmed value. */
function values(property: string): string[] {
  const rules = css.replace(/@font-face\s*\{[^}]*\}/g, "");
  return [...rules.matchAll(new RegExp(`(?<![\\w-])${property}:\\s*([^;]+);`, "g"))].map((m) =>
    (m[1] ?? "").trim(),
  );
}

describe("the bundled font", () => {
  test("style.css declares one face, from its file in public/", () => {
    const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1] ?? "");
    expect(faces).toHaveLength(1);
    expect(faces[0]).toContain('font-family: "Inter";');
    expect(faces[0]).toContain('src: url("/fonts/inter-latin-wght-normal.woff2") format("woff2");');
  });

  test("the file is a WOFF2 and its licence ships next to it", () => {
    const file = readFileSync(`${root}public/fonts/inter-latin-wght-normal.woff2`);
    expect(file.subarray(0, 4).toString("latin1")).toBe("wOF2");
    expect(read("public/fonts/OFL.txt")).toContain("SIL Open Font License");
  });

  test("every text sets it, with a generic fallback and no platform font", () => {
    expect(values("font-family")).toEqual(['"Inter", sans-serif']);
    expect(css).not.toMatch(/system-ui|-apple-system|BlinkMacSystemFont|Segoe UI|Roboto|Arial/i);
  });

  // Browsers give form controls their own system font unless told to inherit.
  test("form controls inherit it, and no rule sets another font", () => {
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? "").split(",").map((selector) => selector.trim()),
      body: m[2] ?? "",
    }));
    const controls = rules.find((rule) =>
      ["button", "input", "select", "textarea"].every((tag) => rule.selectors.includes(tag)),
    );
    expect(controls?.body).toContain("font: inherit;");
    for (const value of values("font")) expect(value).toBe("inherit");
  });

  test("nothing is fetched from another origin", () => {
    expect(css).not.toMatch(/url\(\s*["']?(?:[a-z]+:)?\/\//i);
    for (const { file, markup } of pages) {
      expect(markup, file).not.toMatch(/\s(?:href|src)=["']?(?:[a-z]+:)?\/\//i);
    }
  });

  // The file's cmap, read with fontTools: all of U+0020 to U+007E and U+00B7 are there, U+2630
  // ("☰") is not. Anything else would be drawn from a system font. Characters are written out,
  // not as entities such as `&#9776;`, so this check sees them; only the ASCII escapes pass.
  test.each(pages)("$file uses only printable ASCII and the middle dot", ({ markup }) => {
    const foreign = [...new Set(markup.replace(/[\x20-\x7e\t\r\n·]/g, ""))];
    expect(foreign).toEqual([]);
    expect(markup.match(/&(?!(?:amp|lt|gt|quot|apos);)#?\w+;/g) ?? []).toEqual([]);
  });
});
