import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { textOf } from "../preview/rendered-markup.js";
import { ANALYST_LINES, AnalystWorking, analystLine, elapsedLabel } from "./analyst-working.js";

afterEach(() => {
  vi.useRealTimers();
});

test("the line changes every 4 s, in the list's order, and wraps after the last", () => {
  expect(analystLine(0, false)).toBe(ANALYST_LINES[0]);
  expect(analystLine(3999, false)).toBe(ANALYST_LINES[0]);
  expect(analystLine(4000, false)).toBe(ANALYST_LINES[1]);
  expect(analystLine(4000 * ANALYST_LINES.length, false)).toBe(ANALYST_LINES[0]);
  expect(analystLine(4000 * (ANALYST_LINES.length + 2), false)).toBe(ANALYST_LINES[2]);
});

test("under reduced motion the line is the first, whatever the time", () => {
  for (const at of [0, 4000, 9000, 60_000, 600_000]) {
    expect(analystLine(at, true), String(at)).toBe(ANALYST_LINES[0]);
  }
});

test("the time reads minutes and seconds", () => {
  expect(elapsedLabel(0)).toBe("0:00");
  expect(elapsedLabel(999)).toBe("0:00");
  expect(elapsedLabel(59_000)).toBe("0:59");
  expect(elapsedLabel(84_000)).toBe("1:24");
  expect(elapsedLabel(725_000)).toBe("12:05");
  // A clock a moment behind the start never reads a negative time.
  expect(elapsedLabel(-500)).toBe("0:00");
});

/** Words from `docs/DEMO.md` "Words we do not use", and the persona names, none of which a line may hold. */
const BANNED = [
  /\b(ada|kai|milo|vera|zoya)\b/i,
  /\b(impaired|disabled|blind|confused)\b/i,
  /can't see/i,
  /\bpredict/i,
  /real user/i,
];

test("no line holds a digit, a percentage, a stage word, a persona's name or one of DEMO's banned words", () => {
  for (const line of ANALYST_LINES) {
    // An activity under way or a plain fact, never a stage done, a count or a share of the work.
    expect(line, line).toMatch(/(…|\.)$/);
    expect(line, line).not.toMatch(/\d|%/);
    expect(line, line).not.toMatch(/\b(done|finished|complete|completed|almost|nearly)\b/i);
    for (const word of BANNED) expect(line, line).not.toMatch(word);
  }
});

test("with no start given, the time counts from the render", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
  const html = renderToStaticMarkup(<AnalystWorking />);
  expect(textOf(html)).toBe(`${ANALYST_LINES[0]} · 0:00 so far`);
});
