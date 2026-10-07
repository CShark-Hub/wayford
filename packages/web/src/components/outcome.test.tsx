import { RUN_OUTCOMES, type RunOutcome } from "@wayford/core";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { lineOf } from "../preview/rendered-markup.js";
import {
  isEnding,
  markedEnding,
  Outcome,
  OutcomeGlyph,
  type OutcomeKind,
  outcomeKind,
} from "./outcome.js";

/** Every kind, with the word it must read as: `docs/DESIGN.md` "Copy" and the live vocabulary. */
const WORDS: [OutcomeKind, string][] = [
  ["through", "Got through"],
  ["gaveUp", "Gave up"],
  ["overBudget", "Over budget"],
  ["error", "Error"],
  ["waiting", "Waiting"],
  ["moving", "Moving"],
  ["stuck", "Stuck"],
  ["lost", "Stream lost"],
];

/** The glyph's drawing: what sits inside its `<svg>`. */
function drawingOf(html: string): string {
  const inner = html.match(/<svg[^>]*>(.*?)<\/svg>/s)?.[1];
  if (inner === undefined) throw new Error(`No <svg> in ${html}`);
  return inner;
}

test.each(WORDS)("%s reads %s", (kind, word) => {
  expect(lineOf(renderToStaticMarkup(<Outcome kind={kind} />))).toBe(word);
});

const KINDS: [RunOutcome, OutcomeKind][] = [
  ["success", "through"],
  ["gave_up", "gaveUp"],
  ["budget_exceeded", "overBudget"],
  ["error", "error"],
];

test.each(KINDS)("a run that ended %s is %s", (outcome, kind) => {
  expect(outcomeKind(outcome)).toBe(kind);
});

test("every stored outcome has its kind", () => {
  expect(KINDS.map(([outcome]) => outcome).sort()).toStrictEqual([...RUN_OUTCOMES].sort());
});

test("the endings are the stored outcomes' kinds, and every one but Got through is marked", () => {
  const kinds = WORDS.map(([kind]) => kind);
  expect(kinds.filter(isEnding).sort()).toStrictEqual(KINDS.map(([, kind]) => kind).sort());
  expect(kinds.filter(markedEnding)).toStrictEqual(["gaveUp", "overBudget", "error"]);
});

test("every kind has a glyph of its own", () => {
  const drawings = WORDS.map(([kind]) => drawingOf(renderToStaticMarkup(<Outcome kind={kind} />)));
  expect(new Set(drawings).size).toBe(WORDS.length);
  for (const drawing of drawings) expect(drawing).not.toBe("");
});

test("the glyphs write no colour of their own besides the paper token", () => {
  for (const [kind] of WORDS) {
    const html = renderToStaticMarkup(<Outcome kind={kind} />);
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgb|oklch|hsl/i);
  }
});

test("the glyph alone draws the same mark in the same colour, for an end mark", () => {
  for (const [kind] of WORDS) {
    const alone = renderToStaticMarkup(<OutcomeGlyph kind={kind} />);
    expect(alone).toMatch(/^<svg[^>]*aria-hidden="true"[^>]*>.*<\/svg>$/s);
    // The outcome draws this very glyph before its word.
    expect(renderToStaticMarkup(<Outcome kind={kind} />)).toContain(alone);
    expect(lineOf(alone)).toBe("");
  }
});
