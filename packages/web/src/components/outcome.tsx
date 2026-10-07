import type { RunLimit, RunOutcome } from "@wayford/core";
import { cn } from "cn";
import type { ReactNode } from "react";
import { STATE_WORDS } from "../avatar/state.js";
import { OUTCOME_WORDS as ENDING_WORDS, LIMIT_WORDS } from "./outcome-words.js";

/**
 * How a run ended (`through`, `gaveUp`, `outOfTime`, `stepCap`, `overBudget`, `error`), how a race
 * lane stands while its run goes on (`waiting`, `moving`, `stuck`), or a lane whose stream broke
 * before its end (`lost`).
 */
export type OutcomeKind =
  | "through"
  | "gaveUp"
  | "outOfTime"
  | "stepCap"
  | "overBudget"
  | "error"
  | "waiting"
  | "moving"
  | "stuck"
  | "lost";

/**
 * Each kind in words. The six endings are `docs/DESIGN.md`'s fixed outcome words, read from
 * `outcome-words.ts`, which every screen naming a stored outcome shares. The live ones are the
 * avatar's `STATE_WORDS`, the one live vocabulary, so a lane never says a state two ways.
 */
export const OUTCOME_WORDS: Record<OutcomeKind, string> = {
  through: ENDING_WORDS.success,
  gaveUp: ENDING_WORDS.gave_up,
  outOfTime: LIMIT_WORDS.clock,
  stepCap: LIMIT_WORDS.steps,
  overBudget: ENDING_WORDS.budget_exceeded,
  error: ENDING_WORDS.error,
  waiting: STATE_WORDS.idle,
  moving: STATE_WORDS.moving,
  stuck: STATE_WORDS.stuck,
  lost: "Stream lost",
};

const KIND_OF: Record<RunOutcome, OutcomeKind> = {
  success: "through",
  gave_up: "gaveUp",
  budget_exceeded: "overBudget",
  error: "error",
};

const LIMIT_KIND_OF: Record<RunLimit, OutcomeKind> = {
  clock: "outOfTime",
  steps: "stepCap",
};

/**
 * The kind a stored run's ending is drawn as. A budget run out is the `limit` that cut it off, and
 * Over budget when it has none, as a run recorded before the limit was. Every screen that holds a
 * run's limit names its ending through this one choice, so a run reads one way on all of them.
 */
export function outcomeKind(outcome: RunOutcome, limit?: RunLimit): OutcomeKind {
  return outcome === "budget_exceeded" && limit !== undefined
    ? LIMIT_KIND_OF[limit]
    : KIND_OF[outcome];
}

/** The six endings: one per stored outcome, and one per limit a budget run out names. */
const ENDINGS: ReadonlySet<OutcomeKind> = new Set([
  ...Object.values(KIND_OF),
  ...Object.values(LIMIT_KIND_OF),
]);

/**
 * Whether `kind` is how a run ended. A live state is not, and neither is a lost stream: its run
 * never ended.
 */
export function isEnding(kind: OutcomeKind): boolean {
  return ENDINGS.has(kind);
}

/**
 * Whether `kind` is an ending short of the goal, which a mark closes with its glyph: a race track's
 * end, a run's last step. Got through has none: its run reached the goal.
 */
export function markedEnding(kind: OutcomeKind): boolean {
  return kind !== "through" && isEnding(kind);
}

// `.wf-outcome` and its modifiers in docs/design/components.css. Gave up and Over budget are ink-2,
// and so are Out of time and Hit the step cap, Over budget told by its limit. Error and Stream
// lost are fault: both are the tool failing, not the persona. The rest is ink, and a live state's
// glyph takes the persona's slot, `--p`.
const TONES: Record<OutcomeKind, { word: string; glyph: string }> = {
  through: { word: "text-ink", glyph: "text-ink" },
  gaveUp: { word: "text-ink-2", glyph: "text-ink-2" },
  outOfTime: { word: "text-ink-2", glyph: "text-ink-2" },
  stepCap: { word: "text-ink-2", glyph: "text-ink-2" },
  overBudget: { word: "text-ink-2", glyph: "text-ink-2" },
  error: { word: "text-fault", glyph: "text-fault" },
  lost: { word: "text-fault", glyph: "text-fault" },
  waiting: { word: "text-ink", glyph: "text-(--p)" },
  moving: { word: "text-ink", glyph: "text-(--p)" },
  stuck: { word: "text-ink", glyph: "text-(--p)" },
};

// Over budget's hourglass, which Out of time and Hit the step cap share: the word tells the limit.
const HOURGLASS = <path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" />;

// The endings and Moving are copied from docs/design/components.html. Waiting, Stuck and Stream
// lost are not drawn there, so they are drawn here to the same stroke: an open circle, a circle
// barred across, and a circle broken in two arcs, its gaps on the diagonal.
const GLYPHS: Record<OutcomeKind, ReactNode> = {
  through: (
    <>
      <circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" />
      <path d="M8 12.5l2.6 2.6L16.2 9.4" stroke="var(--paper)" strokeWidth={2} />
    </>
  ),
  gaveUp: (
    <>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>
  ),
  outOfTime: HOURGLASS,
  stepCap: HOURGLASS,
  overBudget: HOURGLASS,
  error: (
    <>
      <path d="M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2z" />
      <path d="M12 8v5M12 16.5v.5" />
    </>
  ),
  waiting: <circle cx="12" cy="12" r="9" />,
  moving: <path d="M5 12h3l2-5 4 10 2-5h3" />,
  stuck: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </>
  ),
  lost: (
    <>
      <path d="M20.16 8.2A9 9 0 0 1 8.2 20.16" />
      <path d="M3.84 15.8A9 9 0 0 1 15.8 3.84" />
    </>
  ),
};

/**
 * A kind's glyph alone, 20 px at a 1.75 stroke in its kind's colour, for a mark whose word is said
 * elsewhere: a race track's end, a run's last step. It is hidden from assistive technology, so
 * whatever holds it names the outcome in words.
 */
export function OutcomeGlyph({ kind }: { kind: OutcomeKind }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      data-outcome={kind}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-5 shrink-0", TONES[kind].glyph)}
    >
      {GLYPHS[kind]}
    </svg>
  );
}

/**
 * How a run ended or how a lane stands, drawn as `.wf-outcome`: the glyph, then the word. Never a
 * colour alone, never an alarm: the word always says it.
 */
export function Outcome({ kind }: { kind: OutcomeKind }) {
  return (
    <span
      className={cn("inline-flex items-center gap-2 whitespace-nowrap label", TONES[kind].word)}
    >
      <OutcomeGlyph kind={kind} />
      {OUTCOME_WORDS[kind]}
    </span>
  );
}
