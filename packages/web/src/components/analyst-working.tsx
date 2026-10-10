import { useEffect, useState } from "react";
import { Working } from "./working.js";

/**
 * What the Analyst's wait says, one line at a time (#237). io reports no progress, so these are
 * flavour, never progress: each should read as work under way, never as a stage done or a share of
 * the work. The test turns away a digit, a percentage, a few stage words, a persona's name and some
 * of the words `docs/DEMO.md` keeps off every screen; the rest is for whoever reads the list.
 */
export const ANALYST_LINES = [
  "Reading the latest runs, every persona at once…",
  "Sorting measurements from hypotheses…",
  "Lining up the seeds…",
  "Following each persona to the step where they stopped…",
  "Checking every finding has a run behind it…",
  "Measuring the river, not the people crossing it…",
  "Claiming less than we'd like to…",
  "Still reading. A careful report takes its time.",
] as const;

/** How long each line stays before the next. */
const LINE_EVERY_MS = 4000;

/**
 * The line for `elapsedMs` into the wait: the list in order, a line per `LINE_EVERY_MS`, round and
 * round. Under reduced motion, the first line throughout.
 */
export function analystLine(elapsedMs: number, reducedMotion: boolean): string {
  if (reducedMotion) return ANALYST_LINES[0];
  const slot = Math.floor(Math.max(0, elapsedMs) / LINE_EVERY_MS) % ANALYST_LINES.length;
  return ANALYST_LINES[slot] ?? ANALYST_LINES[0];
}

/** `elapsedMs` as minutes and seconds, `1:24`; a clock a moment behind the start reads `0:00`. */
export function elapsedLabel(elapsedMs: number): string {
  const seconds = Math.floor(Math.max(0, elapsedMs) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Whether the viewer asked for reduced motion; a render with no window reads no. Read on each
 * render, which `useNow` brings every second, so a change of the setting shows within one.
 */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** The time now, read again every second while mounted. */
function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  return now;
}

/**
 * The Analyst at work, wherever a report is being written (#237): the working posts, then a line
 * that changes every 4 s and the time so far. The text is replaced, never animated. Callers place
 * it outside their status region, which says once that the Analyst runs, and once that it ended;
 * `aria-live="off"` only marks the line as one not to announce. `since` is when the analysis
 * started, in ms; with none, the time counts from this component's first render.
 */
export function AnalystWorking({ since }: { since?: number | undefined }) {
  const [mounted] = useState(Date.now);
  const elapsed = useNow() - (since ?? mounted);
  return (
    <Working>
      <span aria-live="off">
        {analystLine(elapsed, prefersReducedMotion())}
        <span className="text-ink-3 tabular-nums">{` · ${elapsedLabel(elapsed)} so far`}</span>
      </span>
    </Working>
  );
}
