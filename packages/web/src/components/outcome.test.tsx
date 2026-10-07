import { RUN_OUTCOMES, type RunLimit, type RunOutcome } from "@wayford/core";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { attributesOf, classesOf, lineOf } from "../preview/rendered-markup.js";
import {
  isEnding,
  markedEnding,
  OUTCOME_WORDS,
  Outcome,
  OutcomeGlyph,
  type OutcomeKind,
  outcomeKind,
} from "./outcome.js";

/** Every kind, with the word it must read as: `docs/DESIGN.md` "Copy" and the live vocabulary. */
const WORDS: [OutcomeKind, string][] = [
  ["through", "Got through"],
  ["gaveUp", "Gave up"],
  ["outOfTime", "Out of time"],
  ["stepCap", "Hit the step cap"],
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

/**
 * Every way a stored run can end: its outcome, the limit that cut a `budget_exceeded` run off (none
 * on a run recorded before the limit was), its kind, and the word it reads as.
 */
const KINDS: [RunOutcome, RunLimit | undefined, OutcomeKind, string][] = [
  ["success", undefined, "through", "Got through"],
  ["gave_up", undefined, "gaveUp", "Gave up"],
  ["budget_exceeded", "clock", "outOfTime", "Out of time"],
  ["budget_exceeded", "steps", "stepCap", "Hit the step cap"],
  ["budget_exceeded", undefined, "overBudget", "Over budget"],
  ["error", undefined, "error", "Error"],
];

test.each(KINDS)("a run that ended %s, cut off by %s, is %s: %s", (outcome, limit, kind, word) => {
  expect(outcomeKind(outcome, limit)).toBe(kind);
  expect(OUTCOME_WORDS[kind]).toBe(word);
});

test("with no limit given, a budget run out is Over budget, as on a run stored before the limit", () => {
  expect(outcomeKind("budget_exceeded")).toBe("overBudget");
});

test("every stored outcome has its kind", () => {
  const outcomes = new Set(KINDS.map(([outcome]) => outcome));
  expect([...outcomes].sort()).toStrictEqual([...RUN_OUTCOMES].sort());
});

test("the endings are the stored runs' kinds, and every one but Got through is marked", () => {
  const kinds = WORDS.map(([kind]) => kind);
  expect(kinds.filter(isEnding).sort()).toStrictEqual(KINDS.map(([, , kind]) => kind).sort());
  expect(kinds.filter(markedEnding)).toStrictEqual([
    "gaveUp",
    "outOfTime",
    "stepCap",
    "overBudget",
    "error",
  ]);
});

/** The drawing inside `kind`'s glyph. */
function glyphOf(kind: OutcomeKind): string {
  return drawingOf(renderToStaticMarkup(<Outcome kind={kind} />));
}

/** The three kinds a budget run out is drawn as: one hourglass, whichever limit cut it. */
const BUDGET: OutcomeKind[] = ["outOfTime", "stepCap", "overBudget"];

test("every kind has a glyph of its own, but a budget run out is Over budget's hourglass", () => {
  const own = WORDS.map(([kind]) => kind).filter(
    (kind) => kind === "overBudget" || !BUDGET.includes(kind),
  );
  const drawings = own.map(glyphOf);
  expect(new Set(drawings).size).toBe(own.length);
  for (const drawing of drawings) expect(drawing).not.toBe("");
  for (const kind of BUDGET) expect(glyphOf(kind), kind).toBe(glyphOf("overBudget"));
});

test("a budget run out is ink-2 whichever limit cut it, word and glyph, as Gave up is", () => {
  for (const kind of [...BUDGET, "gaveUp" as const]) {
    const html = renderToStaticMarkup(<Outcome kind={kind} />);
    expect(classesOf(attributesOf(html.match(/^<span[^>]*>/)?.[0] ?? "")), kind).toContain(
      "text-ink-2",
    );
    expect(classesOf(attributesOf(html.match(/<svg[^>]*>/)?.[0] ?? "")), kind).toContain(
      "text-ink-2",
    );
  }
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
