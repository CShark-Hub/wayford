import { DecisionRecord } from "@wayford/core";
import { decisionRecordFixture } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { attributesOf, detailsOf, rowsOf, styleOf } from "../preview/rendered-markup.js";
import { DecisionPanel, drawScale } from "./decision-panel.js";

function panel(decision: DecisionRecord = decisionRecordFixture): string {
  return renderToStaticMarkup(<DecisionPanel decision={decision} />);
}

/** Each option row as its cells, keyed by the table's header. */
function optionRows(html: string): Record<string, string>[] {
  const [header, ...rows] = rowsOf(html);
  if (header === undefined) return [];
  return rows.map((cells) => Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ""])));
}

/** Each bar's width, in the order drawn. */
function barWidths(html: string): string[] {
  return [...html.matchAll(/<span [^>]*data-bar=""[^>]*>/g)].map(
    (bar) => styleOf(attributesOf(bar[0])).width ?? "",
  );
}

describe("on the decision record fixture", () => {
  const html = panel();
  const rows = optionRows(html);

  test("ten bars in offer order, each with its probability as stored, and e3 alone drawn", () => {
    expect(barWidths(html)).toHaveLength(10);
    expect(rows.map((row) => row.Option)).toEqual(
      decisionRecordFixture.options.map((option) => option.description),
    );
    expect(rows.map((row) => Number(row.p))).toEqual(decisionRecordFixture.probabilities);
    expect(rows.filter((row) => row.Drawn !== "").map((row) => [row.Option, row.Drawn])).toEqual([
      ['Click [e3], the link "Deliveries"', "drawn: the roll lands here"],
    ]);
  });

  test("a bar and a range are the option's share of the total, which Jev's rounding leaves at 0.99", () => {
    expect(barWidths(html)[2]).toBe(`${((0.62 / 0.99) * 100).toFixed(1)}%`);
    expect(rows[2]?.Range).toBe("0.071 to 0.697");
    expect(rows.at(-1)?.Range).toBe("0.98 to 1");
  });

  test("the confidence is the model's, and the roll is placed on the cumulative scale", () => {
    const details = detailsOf(html);
    expect(details.Confidence).toBe(
      "0.71 the model's: how sure Jev was, lower on a more ambiguous page, not how the persona felt",
    );
    expect(details.Rolled).toBe("0.4 on the cumulative scale from 0 to 1, which lands on option 3");
  });
});

test("the drawn option is core's draw, not the top pick: an option of probability 0 is skipped", () => {
  const record = DecisionRecord.parse({
    ...decisionRecordFixture,
    options: decisionRecordFixture.options.slice(0, 3),
    probabilities: [0.5, 0, 0.5],
    rolled: 0.5,
  });
  const { ranges, drawn } = drawScale(record);
  expect(drawn).toBe(2);
  expect(ranges[1]).toEqual({ from: 0.5, to: 0.5 });
  expect(optionRows(panel(record))[2]?.Drawn).toBe("drawn: the roll lands here");
});
