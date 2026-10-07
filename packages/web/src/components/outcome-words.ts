/**
 * How a run ended, in the fixed words of `docs/DESIGN.md`, "Copy". Every screen that names an
 * outcome reads it from here: `OUTCOME_WORDS` where only an outcome is, as in the seed strip and
 * the evidence links, whose Report seeds carry no limit; through Outcome (`outcome.tsx`), whose
 * `outcomeKind` adds `LIMIT_WORDS`, where one run's record or `runFinished` is at hand, as on run
 * detail, the race and the Boundary's runs. `count` is the one way the report's screen and
 * components say how many.
 */
import type { RunLimit, RunOutcome } from "@wayford/core";

export const OUTCOME_WORDS: Record<RunOutcome, string> = {
  success: "Got through",
  gave_up: "Gave up",
  // The clock or the step cap, unsaid: the loop cut the run off.
  budget_exceeded: "Over budget",
  error: "Error",
};

/** A `budget_exceeded` run's word, by the limit that cut it off (issue #196). */
export const LIMIT_WORDS: Record<RunLimit, string> = {
  steps: "Hit the step cap",
  clock: "Out of time",
};

/** `n` and `word`, plural when `n` is not 1: "1 run", "9 runs". */
export function count(n: number, word: string): string {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}
