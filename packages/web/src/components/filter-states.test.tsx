import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { attributesOf, classesOf } from "../preview/rendered-markup.js";
import { CutFlag, FILTER_STATE_CLASS, type FilterState, flagSide } from "./filter-states.js";

// `signal` marks only a measurement line (docs/DESIGN.md, Principle 2): a perception rule's cut.
test("only a perception rule's removal is drawn in signal", () => {
  const states = Object.keys(FILTER_STATE_CLASS) as FilterState[];
  const inSignal = states.filter((state) => FILTER_STATE_CLASS[state].includes("signal"));
  expect(inSignal).toEqual(["removed"]);
});

test("a quiet flag is surface with ink-2 text and a line-strong ring, and no signal", () => {
  const html = renderToStaticMarkup(
    <CutFlag quiet side="right">
      A1 · attention
    </CutFlag>,
  );
  // The flag's own classes, on the first start tag.
  expect(classesOf(attributesOf(html.match(/<[a-z]+[^>]*>/)?.[0] ?? ""))).toEqual(
    expect.arrayContaining([
      "bg-surface",
      "text-ink-2",
      "ring-line-strong",
      "before:bg-line-strong",
    ]),
  );
  expect(html).not.toContain("signal");
});

test.each([
  ["left of centre", { x: 100, y: 40, width: 200, height: 32 }, "right"],
  ["right of centre", { x: 1000, y: 40, width: 120, height: 32 }, "left"],
  ["straddling, more room on its left", { x: 560, y: 40, width: 200, height: 32 }, "left"],
  ["centred exactly", { x: 540, y: 40, width: 200, height: 32 }, "right"],
  [
    "half the viewport wide, a third of it to its right",
    { x: 224, y: 40, width: 640, height: 32 },
    "right",
  ],
  ["wider, under a quarter on either side", { x: 224, y: 40, width: 832, height: 32 }, "inside"],
] as const)("an element %s takes its flag on the %s", (_where, bbox, side) => {
  expect(flagSide(bbox, 1280)).toBe(side);
});
