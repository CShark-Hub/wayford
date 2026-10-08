import type { DecisionRecord } from "@wayford/core";
import { decisionRecordFixture } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { attributesOf, lineOf, styleOf } from "../preview/rendered-markup.js";
import { ConfidenceNote, DecisionPanel } from "./decision-panel.js";

function panel(decision: DecisionRecord = decisionRecordFixture): string {
  return renderToStaticMarkup(<DecisionPanel decision={decision} />);
}

/** The options list: its start tag's attributes, and each `<li>` as its attributes and markup. */
function optionList(html: string) {
  const list = html.match(/<ol([^>]*)>(.*?)<\/ol>/s);
  if (list === null) throw new Error("No <ol> in the panel");
  const items = [...(list[2] ?? "").matchAll(/<li([^>]*)>(.*?)<\/li>/gs)].map((item) => ({
    attributes: attributesOf(item[1] ?? ""),
    inner: item[2] ?? "",
  }));
  return { attributes: attributesOf(list[1] ?? ""), items };
}

/** Each option bar's width, in the order drawn. */
function barWidths(html: string): string[] {
  return [...html.matchAll(/<span [^>]*data-bar=""[^>]*>/g)].map(
    (bar) => styleOf(attributesOf(bar[0])).width ?? "",
  );
}

describe("on the decision record fixture", () => {
  const html = panel();
  const { attributes, items } = optionList(html);

  test("the draw comes first, before the options", () => {
    const bar = html.indexOf('role="img"');
    expect(bar).toBeGreaterThan(-1);
    expect(bar).toBeLessThan(html.indexOf("<ol"));
  });

  test("every option in offer order: its action, its description and its probability", () => {
    expect(items.map((item) => lineOf(item.inner))).toEqual([
      'click e1 0.02 Click [e1], the link "Home"',
      'click e2 0.05 Click [e2], the link "Account"',
      'click e3 drawn 0.62 Click [e3], the link "Deliveries"',
      'click e4 0.03 Click [e4], the link "Settings"',
      'click e5 0.01 Click [e5], the heading "Your deliveries"',
      'click e6 0.12 Click [e6], the link "Ar▒▒ive"',
      "scroll down 0.08 Scroll the page down",
      "scroll up 0.01 Scroll the page up",
      "back 0.03 Go back to the page before",
      "giveUp 0.02 Stop, because you think you cannot get it done here",
    ]);
  });

  test("e3 alone is drawn, said in words and not by colour alone", () => {
    const drawn = items.filter((item) => "data-drawn" in item.attributes);
    expect(drawn).toHaveLength(1);
    expect(lineOf(drawn[0]?.inner ?? "")).toContain("click e3 drawn");
    expect(items.filter((item) => lineOf(item.inner).includes("drawn"))).toEqual(drawn);
  });

  test("the list is named, and holds half the options in each column: five rows for ten", () => {
    expect(styleOf(attributes)["grid-template-rows"]).toBe("repeat(5, auto)");
    expect(attributes["aria-label"]).toBe("Options, in the order offered");
  });

  test("a bar is the option's share of the total, which Jev's rounding leaves at 0.99", () => {
    const widths = barWidths(html);
    expect(widths).toHaveLength(10);
    expect(widths[2]).toBe(`${((0.62 / 0.99) * 100).toFixed(1)}%`);
  });

  test("the note says the action was drawn by the seed, not taken as the top pick", () => {
    expect(lineOf(html)).toContain(
      "Jev gave each option it was offered a probability. The action was drawn from them by the run's seed, not taken as the top pick.",
    );
  });
});

// The fixture's roll of 0.4 draws e3, which is also its top pick, so only another roll shows that
// the list marks the option the roll drew and not the most probable one.
test("a roll of 0.9 on the fixture marks scroll down drawn, not the top pick, e3", () => {
  const { items } = optionList(panel({ ...decisionRecordFixture, rolled: 0.9 }));
  expect(items.map((item) => "data-drawn" in item.attributes)).toEqual(
    items.map((_, i) => i === 6),
  );
  expect(lineOf(items[6]?.inner ?? "")).toBe("scroll down drawn 0.08 Scroll the page down");
  expect(lineOf(items[2]?.inner ?? "")).not.toContain("drawn");
});

// The fake Jev works its probabilities out, so a stored one can run to 17 digits.
test("a probability stored to 17 digits reads short, and whole in its title", () => {
  const probabilities = decisionRecordFixture.probabilities.map((p, i) =>
    i === 0 ? 0.006249999999999999 : p,
  );
  const { items } = optionList(panel({ ...decisionRecordFixture, probabilities }));
  expect(lineOf(items[0]?.inner ?? "")).toBe('click e1 0.00625 Click [e1], the link "Home"');
  expect(items[0]?.inner).toContain('title="0.006249999999999999"');
});

test("a confidence stored to 17 digits reads short, and whole in its title", () => {
  const html = renderToStaticMarkup(
    <ConfidenceNote confidence={0.8999999999999999} persona="Vera" />,
  );
  expect(lineOf(html)).toBe("confidence 0.9 · the model's, not Vera's");
  expect(html).toContain('title="0.8999999999999999"');
});

describe("the confidence note", () => {
  const html = renderToStaticMarkup(<ConfidenceNote confidence={0.71} persona="Vera" />);

  test("labels the confidence as the model's, not the persona's", () => {
    expect(lineOf(html)).toBe("confidence 0.71 · the model's, not Vera's");
  });
});
