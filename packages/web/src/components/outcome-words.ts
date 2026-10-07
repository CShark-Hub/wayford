/**
 * How a run ended, in the fixed words of `docs/DESIGN.md`, "Copy". Every screen that names an
 * outcome reads it from here: the seed strip, the evidence chips, and Outcome (`outcome.tsx`).
 * `count` is the one way the report's screen and components say how many.
 */
import type { RunOutcome } from "@wayford/core";

export const OUTCOME_WORDS: Record<RunOutcome, string> = {
  success: "Got through",
  gave_up: "Gave up",
  // The clock or the step cap: the loop cut the run off.
  budget_exceeded: "Over budget",
  error: "Error",
};

/** `n` and `word`, plural when `n` is not 1: "1 run", "9 runs". */
export function count(n: number, word: string): string {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}
