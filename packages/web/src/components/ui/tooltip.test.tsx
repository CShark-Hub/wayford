import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { attributesOf, classesOf, lineOf } from "../../preview/rendered-markup.js";
import { Hint, LinkHint } from "./tooltip.js";

const HINT = "Measured by axe-core, an accessibility scanner.";

/** `Hint`'s static render: its button's attributes and text, and the rest of the markup. */
function rendered() {
  const html = renderToStaticMarkup(<Hint label="Explain Measurement" hint={HINT} />);
  const button = html.match(/<button(\s[^>]*)>(.*?)<\/button>/s);
  if (button === null) throw new Error("no button");
  return { html, attributes: attributesOf(button[1] ?? ""), inner: button[2] ?? "" };
}

test("one button named by its label, with no text and no title of its own", () => {
  const { html, attributes, inner } = rendered();
  expect(html.match(/<button/g)).toHaveLength(1);
  expect(attributes.type).toBe("button");
  expect(attributes["aria-label"]).toBe("Explain Measurement");
  expect(attributes.title).toBeUndefined();
  expect(lineOf(inner)).toBe("");
  // The icon says nothing a screen reader should hear: the label does.
  expect(inner).toMatch(/<svg[^>]*aria-hidden="true"/);
});

// Open, the button keeps this description: the browser test reads it with the bubble shown.
test("closed, the button is described by the hint, from a hidden span", () => {
  const { html, attributes } = rendered();
  const id = attributes["aria-describedby"];
  expect(id).toBeTruthy();
  const description = html.match(/<span(\s[^>]*)>(.*?)<\/span>/gs)?.find((span) => {
    const start = attributesOf(span.match(/<span(\s[^>]*)>/)?.[1] ?? "");
    return start.id === id;
  });
  expect(description).toBeDefined();
  expect(attributesOf(description?.match(/<span(\s[^>]*)>/)?.[1] ?? "").hidden).toBe("");
  expect(description).toContain(HINT);
});

// #244: a rule tag is its own hint's button, so no Info button sits beside it.
test("given a face, the button holds it in place of the icon, named by its label, a 32 px box that costs its row no height", () => {
  const html = renderToStaticMarkup(
    <Hint label="Explain P4 target" hint={HINT} face={<span>P4 target</span>} />,
  );
  expect(html.match(/<button/g)).toHaveLength(1);
  const button = html.match(/<button(\s[^>]*)>(.*?)<\/button>/s);
  const attributes = attributesOf(button?.[1] ?? "");
  expect(attributes.type).toBe("button");
  expect(attributes["aria-label"]).toBe("Explain P4 target");
  expect(attributes["aria-describedby"]).toBeTruthy();
  expect(attributes.title).toBeUndefined();
  expect(button?.[2]).not.toContain("<svg");
  expect(lineOf(button?.[2] ?? "")).toBe("P4 target");
  // As tall as the Info button, the target floor, at least as wide, and its margins give the row
  // back what the box adds to a 26 px tag.
  expect(classesOf(attributes)).toEqual(
    expect.arrayContaining(["h-(--target-min)", "min-w-(--target-min)", "-my-0.75", "px-0"]),
  );
  expect(classesOf(attributes)).not.toContain("size-(--target-min)");
});

const CELL = "seed 1: Gave up, routes open: B, C. Opens run_kai-past-order-1";

test("closed, a LinkHint is its link alone, named by the label", () => {
  const html = renderToStaticMarkup(
    <LinkHint label={CELL} bubble={<span className="mono">{CELL}</span>}>
      {/* biome-ignore lint/a11y/useAnchorContent: LinkHint names the link, as it names a seed cell */}
      <a href="/runs/r" />
    </LinkHint>,
  );
  // No button, no hidden span and no bubble. Its description, open, is case (f) of the hints test.
  const link = html.match(/^<a(\s[^>]*)><\/a>$/);
  expect(link, html).not.toBeNull();
  const attributes = attributesOf(link?.[1] ?? "");
  expect(attributes.href).toBe("/runs/r");
  expect(attributes["aria-label"]).toBe(CELL);
  expect(attributes["data-state"]).toBe("closed");
});
