import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ProvenanceTag, Tag } from "./tag.js";

test("a tag is a span with its label", () => {
  const html = renderToStaticMarkup(<Tag>hick</Tag>);
  expect(html).toMatch(/^<span[^>]*>hick<\/span>$/);
  expect(html).toContain("mono-label");
  expect(html).toContain("border-line-strong");
});

test("a sourced provenance reads as its id", () => {
  const html = renderToStaticMarkup(<ProvenanceTag provenance="wcag22" />);
  expect(html).toContain(">wcag22<");
  expect(html).not.toContain("no source");
  expect(html).not.toContain("border-dotted");
});

test("an unsourced provenance reads as no source, drawn soft", () => {
  const html = renderToStaticMarkup(<ProvenanceTag provenance="folk" />);
  expect(html).toContain(">folk · no source<");
  expect(html).toContain("border-dotted");
});
