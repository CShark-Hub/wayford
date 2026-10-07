import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { attributesOf } from "../preview/rendered-markup.js";
import { CertaintyGlyph, type CertaintyLine } from "./certainty.js";

/** The glyph's class list, as rendered. */
function classOf(line: CertaintyLine): string {
  const tag = renderToStaticMarkup(<CertaintyGlyph line={line} />).match(/<span [^>]*>/)?.[0] ?? "";
  return attributesOf(tag).class ?? "";
}

// Principle 3: each certainty is its own line style, so no two may share one.
test.each([
  ["measured", "border-solid"],
  ["deterministic", "border-solid"],
  ["hypothesis", "border-dashed"],
  ["soft", "border-dotted"],
] as const)("%s draws a %s line", (line, style) => {
  expect(classOf(line).split(" ")).toContain(style);
});

test("deterministic adds end ticks to the solid post; measured has none", () => {
  expect(classOf("deterministic")).toContain("border-x-2");
  expect(classOf("measured")).not.toContain("border-x");
});

test("the glyph is hidden from assistive technology and names its line", () => {
  const tag = renderToStaticMarkup(<CertaintyGlyph line="soft" />);
  expect(tag).toContain('aria-hidden="true"');
  expect(tag).toContain('data-line="soft"');
});
