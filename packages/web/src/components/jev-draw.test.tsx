import { DecisionRecord } from "@wayford/core";
import { decisionRecordFixture } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { attributesOf, lineOf, styleOf } from "../preview/rendered-markup.js";
import { drawScale, JevDraw, labelledOptions } from "./jev-draw.js";

function draw(decision: DecisionRecord = decisionRecordFixture): string {
  return renderToStaticMarkup(<JevDraw decision={decision} />);
}

/** A record of the fixture's first options with other probabilities and another roll. */
function record(probabilities: number[], rolled: number): DecisionRecord {
  return DecisionRecord.parse({
    ...decisionRecordFixture,
    options: decisionRecordFixture.options.slice(0, probabilities.length),
    probabilities,
    rolled,
  });
}

/** Each segment of the bar, in the order drawn: its attributes and its classes. */
function segments(html: string) {
  return [...html.matchAll(/<div [^>]*data-segment=""[^>]*>/g)].map((m) => {
    const attributes = attributesOf(m[0]);
    return { attributes, classes: (attributes.class ?? "").split(" ") };
  });
}

/** A percentage as a number: `62.626%` is 62.626. */
function percentOf(value: string | undefined): number {
  const number = value?.match(/^(-?[\d.]+)%$/)?.[1];
  if (number === undefined) throw new Error(`Not a percentage: ${value}`);
  return Number(number);
}

/** The attributes of the first start tag carrying `attribute`. */
function startTag(html: string, attribute: string): Record<string, string> {
  const tag = html.match(new RegExp(`<[a-z]+ [^>]*${attribute}[^>]*>`))?.[0];
  if (tag === undefined) throw new Error(`No start tag carries ${attribute}`);
  return attributesOf(tag);
}

/** The needle's flag: its attributes and its text. */
function flagOf(html: string) {
  const flag = html.match(/<div [^>]*data-needle[^>]*>\s*<span([^>]*)>(.*?)<\/span>/s);
  if (flag === null) throw new Error("No flag on the needle");
  return { attributes: attributesOf(flag[1] ?? ""), text: lineOf(flag[2] ?? "") };
}

/** The row of labels under the bar, as read. */
function labelsOf(html: string): string {
  return lineOf(html.match(/<div [^>]*data-labels[^>]*>(.*?)<\/div>/s)?.[1] ?? "");
}

describe("on the decision record fixture", () => {
  const html = draw();
  const bars = segments(html);

  test("one segment per option, in offer order, titled with its action, probability and range", () => {
    expect(bars.map((bar) => bar.attributes.title)).toEqual([
      "click e1 · 0.02 · 0 to 0.02",
      "click e2 · 0.05 · 0.02 to 0.071",
      "click e3 · 0.62 · 0.071 to 0.697",
      "click e4 · 0.03 · 0.697 to 0.727",
      "click e5 · 0.01 · 0.727 to 0.737",
      "click e6 · 0.12 · 0.737 to 0.859",
      "scroll down · 0.08 · 0.859 to 0.939",
      "scroll up · 0.01 · 0.939 to 0.949",
      "back · 0.03 · 0.949 to 0.98",
      "giveUp · 0.02 · 0.98 to 1",
    ]);
  });

  // Jev's rounding leaves the fixture's probabilities at 0.99, so each is its share of 0.99.
  test("each segment is as wide as its share of the total, and together they fill the bar", () => {
    const widths = bars.map((bar) => styleOf(bar.attributes).width);
    expect(widths).toEqual([
      "2.02%",
      "5.051%",
      "62.626%",
      "3.03%",
      "1.01%",
      "12.121%",
      "8.081%",
      "1.01%",
      "3.03%",
      "2.02%",
    ]);
    expect(widths.reduce((sum, width) => sum + percentOf(width), 0)).toBeCloseTo(100, 1);
  });

  test("the drawn segment, e3, alone is filled with the persona's slot", () => {
    expect(bars.map((bar) => "data-drawn" in bar.attributes)).toEqual(bars.map((_, i) => i === 2));
    expect(bars[2]?.classes).toContain("bg-(--p)");
  });

  test("the needle stands at the roll in signal, flagged with the roll", () => {
    const needle = startTag(html, "data-needle");
    expect(styleOf(needle).left).toBe("40%");
    expect(needle.class?.split(" ")).toContain("bg-signal");
    const flag = flagOf(html);
    expect(flag.text).toBe("rolled 0.4");
    expect(flag.attributes.class?.split(" ")).toContain("text-on-signal");
  });

  test("the bar is an image that says how many options there were, the roll, and what was drawn", () => {
    const bar = startTag(html, 'role="img"');
    expect(bar["aria-label"]).toBe("10 options, rolled 0.4, drew click e3");
  });

  // Demo beat 5 reads Jev's options with their probabilities at 1280 × 720, where the full list
  // falls below the fold: the row under the bar names the likely ones, largest first.
  test("under the bar: 0, the options worth a label with their probabilities, largest first, and 1", () => {
    expect(labelsOf(html)).toBe("0 click e3 0.62 · click e6 0.12 · scroll down 0.08 1");
    const labels = html.slice(html.indexOf("data-labels"));
    expect(lineOf(labels.match(/<span data-drawn=""[^>]*>(.*?)<\/span>/s)?.[1] ?? "")).toBe(
      "click e3 0.62",
    );
  });
});

test("a drawn option too small for a label is still named, after the largest", () => {
  // e1 takes 0.9 of the draw, e3 0.08; the roll of 0.91 lands on e2's 0.02.
  const html = draw(record([0.9, 0.02, 0.08], 0.91));
  expect(labelsOf(html)).toBe("0 click e1 0.9 · click e3 0.08 · click e2 0.02 1");
});

test("an option short of a twentieth of the draw earns no label", () => {
  // e2 takes 0.04 of the draw and e3 0.06; the roll of 0.1 lands on e1.
  const html = draw(record([0.9, 0.04, 0.06], 0.1));
  expect(labelsOf(html)).toBe("0 click e1 0.9 · click e3 0.06 1");
});

test("at most three options earn a label, the drawn one included, and a tie keeps the order offered", () => {
  expect(labelledOptions(drawScale(record([0.25, 0.25, 0.25, 0.25], 0.1)).ranges, 0)).toEqual([
    0, 1, 2,
  ]);
  // The fourth is drawn: it takes the third's place, so the row still holds three.
  expect(labelledOptions(drawScale(record([0.25, 0.25, 0.25, 0.25], 0.9)).ranges, 3)).toEqual([
    0, 1, 3,
  ]);
});

// A grid item is as wide as its text unless told otherwise: a long label, typed text say, would
// widen the draw past the replay's 640 px column, and the row's ellipsis would never cut it.
test("the draw and its row of labels may be narrower than the labels, which the ellipsis cuts", () => {
  const html = draw();
  expect(startTag(html, 'class="grid ').class?.split(" ")).toContain("min-w-0");
  const row = startTag(html, "data-labels");
  expect(row.class?.split(" ")).toContain("min-w-0");
  // The row reads 0, the labels, 1: the labels are its second span.
  const spans = [...html.slice(html.indexOf("data-labels")).matchAll(/<span class="([^"]*)">/g)];
  expect(spans[1]?.[1]?.split(" ")).toEqual(
    expect.arrayContaining(["min-w-0", "flex-1", "truncate"]),
  );
});

test("a roll of 0.9 on the fixture draws scroll down, away from the top pick, e3", () => {
  const html = draw({ ...decisionRecordFixture, rolled: 0.9 });
  const bars = segments(html);
  expect(bars.map((bar) => "data-drawn" in bar.attributes)).toEqual(bars.map((_, i) => i === 6));
  expect(startTag(html, 'role="img"')["aria-label"]).toBe(
    "10 options, rolled 0.9, drew scroll down",
  );
  expect(labelsOf(html)).toBe("0 click e3 0.62 · click e6 0.12 · scroll down 0.08 1");
  const labels = html.slice(html.indexOf("data-labels"));
  expect(lineOf(labels.match(/<span data-drawn=""[^>]*>(.*?)<\/span>/s)?.[1] ?? "")).toBe(
    "scroll down 0.08",
  );
});

test("on [0.5, 0, 0.5], an option of probability 0 is skipped: the third is drawn", () => {
  const html = draw(record([0.5, 0, 0.5], 0.5));
  const bars = segments(html);
  expect(bars.map((bar) => "data-drawn" in bar.attributes)).toEqual([false, false, true]);
  expect(bars.map((bar) => styleOf(bar.attributes).width)).toEqual(["50%", "0%", "50%"]);
  expect(startTag(html, 'role="img"')["aria-label"]).toBe("3 options, rolled 0.5, drew click e3");
});

// A 1 px divider on a zero-width segment would push every segment after it 1 px left, off the
// scale the needle stands on. Nor does the last segment with width close on one, at the bar's end.
test("an option of probability 0 keeps its segment but draws no divider", () => {
  const bars = segments(draw(record([0.62, 0, 0, 0, 0, 0.2, 0, 0, 0.18, 0], 0.5)));
  expect(bars.map((bar) => bar.classes.some((c) => c.startsWith("border")))).toEqual([
    true,
    false,
    false,
    false,
    false,
    true,
    false,
    false,
    false,
    false,
  ]);
});

// A real roll is a u32 over 2^32, printed with up to 17 digits. The flag shows three places, as
// the reference does; the bar's label and the flag's title keep the roll as stored.
test("a full-precision roll is flagged to three places and kept whole in the label and title", () => {
  const html = draw({ ...decisionRecordFixture, rolled: 0.6599762237071991 });
  const flag = flagOf(html);
  expect(flag.text).toBe("rolled 0.66");
  expect(flag.attributes.title).toBe("rolled 0.6599762237071991");
  expect(startTag(html, 'role="img"')["aria-label"]).toBe(
    "10 options, rolled 0.6599762237071991, drew click e3",
  );
});

// Three digits would flag 0.5, the end of e1's segment, though the roll drew e1, below it.
test("the flag never puts a roll across the edge of the segment it drew", () => {
  const html = draw(record([0.5, 0.5], 0.49996));
  expect(flagOf(html).text).toBe("rolled 0.49996");
  expect(segments(html).map((bar) => "data-drawn" in bar.attributes)).toEqual([true, false]);
});

test("a probability stored to 17 digits reads short under the bar, and whole in its title", () => {
  const html = draw(record([0.9, 0.0999999999999999], 0.2));
  expect(labelsOf(html)).toBe("0 click e1 0.9 · click e2 0.1 1");
  expect(segments(html)[1]?.attributes.title).toContain(" · 0.0999999999999999 · ");
});

test("one option is said in the singular", () => {
  expect(startTag(draw(record([1], 0.2)), 'role="img"')["aria-label"]).toBe(
    "1 option, rolled 0.2, drew click e1",
  );
});
