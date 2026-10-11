import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { attributesOf, lineOf } from "../../preview/rendered-markup.js";
import { Hint } from "./tooltip.js";

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
