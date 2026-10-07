/**
 * Certainty drawn as line style (`docs/DESIGN.md`, Principle 3), as `.wf-cert` draws it: solid is
 * measured, solid with end ticks is deterministic, dashed is a hypothesis, dotted is soft. Colour
 * never carries it.
 */
import { cn } from "cn";

/** The four line styles a finding, a column head or a readout can carry. */
export type CertaintyLine = "measured" | "deterministic" | "hypothesis" | "soft";

const LINE: Record<CertaintyLine, string> = {
  measured: "h-0 border-t-3 border-solid border-ink",
  // A post between two end ticks: the ticks are the side borders, the post a bar across the middle.
  deterministic:
    "relative h-2.5 border-x-2 border-solid border-ink after:absolute after:inset-x-0 after:top-1/2 after:h-0.75 after:-translate-y-1/2 after:bg-ink",
  hypothesis: "h-0 border-t-3 border-dashed border-ink-2",
  soft: "h-0 border-t-3 border-dotted border-ink-3",
};

/** A 22 px mark of `line`, hidden from assistive technology: the words beside it say the same. */
export function CertaintyGlyph({ line }: { line: CertaintyLine }) {
  return (
    <span
      aria-hidden="true"
      data-line={line}
      className={cn("inline-block w-5.5 shrink-0", LINE[line])}
    />
  );
}
