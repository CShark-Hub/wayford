/**
 * The run detail's shared pieces: term and description pairs, a row of facts, the mark of what a
 * step took, and the classes of its notes and tables, in Wayford's tokens (`docs/DESIGN.md`). A
 * leaf module, so the screen, the step replay and the decision panel it draws all import it.
 */
import type { ReactNode } from "react";

/** A note under or beside what it explains: meta text, never evidence. */
export const NOTE = "body text-ink-3";
/** A table of the output register, as `.wf-table` draws it. */
export const TABLE = "w-full border-collapse text-left body";
/** A column header: sans, in the meta ink, over a strong rule. */
export const TH = "border-b border-line-strong px-2 py-2 align-bottom label text-ink-3";
/** A cell, over a hairline. */
export const TD = "border-b border-line px-2 py-2 align-top";
/** A `<dl>` of `Fact`s in mono, laid in a row that wraps. */
export const FACTS = "flex flex-wrap gap-x-5 gap-y-1 mono";

/** Term and description pairs, one per row, each a `Detail`. */
export function Details({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 body">{children}</dl>
  );
}

/** One term of `Details` and its description. */
export function Detail({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-3">{term}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

/** One fact of a `FACTS` row: its term in the meta ink, then its value. */
export function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <dt className="text-ink-3">{term}</dt>
      {/* A flex box, so the Outcome's glyph and word centre on the term's line like plain text. */}
      <dd className="flex min-w-0 items-center text-ink">{children}</dd>
    </div>
  );
}

/**
 * What a step took, marked in the persona's slot: a swatch and a word, so the colour is never
 * alone. It marks the model's line the action landed on, and the option Jev drew.
 */
export function Mark({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 label text-ink-3">
      <span aria-hidden="true" className="size-2.5 rounded-xs bg-(--p)" />
      {children}
    </span>
  );
}
