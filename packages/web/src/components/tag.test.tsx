import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { attributesOf, lineOf } from "../preview/rendered-markup.js";
import { provenanceHint } from "./provenance-words.js";
import { ProvenanceTag, Tag } from "./tag.js";

test("a tag is a span with its label", () => {
  const html = renderToStaticMarkup(<Tag>hick</Tag>);
  expect(html).toMatch(/^<span[^>]*>hick<\/span>$/);
  expect(html).toContain("mono-label");
  expect(html).toContain("border-line-strong");
});

/**
 * A provenance tag's static render: its button's attributes, the tag inside it, the words it reads
 * as, and the text of the hidden span that describes it.
 */
function provenanceTag(element: ReactElement) {
  const html = renderToStaticMarkup(element);
  const button = html.match(/<button(\s[^>]*)>(.*?)<\/button>/s);
  if (button === null) throw new Error("no button");
  const attributes = attributesOf(button[1] ?? "");
  const description = html.match(
    new RegExp(`<span hidden="" id="${attributes["aria-describedby"]}">(.*?)</span>`, "s"),
  );
  return {
    html,
    attributes,
    face: button[2] ?? "",
    line: lineOf(html),
    description: lineOf(description?.[1] ?? ""),
  };
}

describe("ProvenanceTag", () => {
  test("a sourced id is the face of one button, named for it and described by its source", () => {
    const { html, attributes, face, line, description } = provenanceTag(
      <ProvenanceTag provenance="wcag22" />,
    );
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(attributes.type).toBe("button");
    expect(attributes["aria-label"]).toBe("Explain wcag22");
    expect(attributes.title).toBeUndefined();
    expect(face).toMatch(/^<span class="[^"]*mono-label[^"]*">wcag22<\/span>$/);
    expect(face).not.toContain("border-dotted");
    expect(face).not.toContain("<svg");
    expect(line).toBe("wcag22");
    expect(description).toBe(provenanceHint("wcag22"));
  });

  test("an unsourced id reads as no source, drawn soft, and its name holds those words", () => {
    const { attributes, face, line, description } = provenanceTag(
      <ProvenanceTag provenance="folk" />,
    );
    expect(face).toMatch(/^<span class="[^"]*border-dotted[^"]*">folk · no source<\/span>$/);
    expect(line).toBe("folk · no source");
    expect(attributes["aria-label"]).toBe("Explain folk · no source");
    expect(description).toBe(provenanceHint("folk"));
  });

  test("bare, an unsourced id reads as itself, still soft and still explained", () => {
    const { attributes, face, description } = provenanceTag(
      <ProvenanceTag provenance="llm" bare />,
    );
    expect(face).toMatch(/^<span class="[^"]*border-dotted[^"]*">llm<\/span>$/);
    expect(attributes["aria-label"]).toBe("Explain llm");
    expect(description).toBe(provenanceHint("llm"));
  });
});
