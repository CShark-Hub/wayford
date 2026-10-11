import type { Bbox, RuleId } from "@wayford/core";
import { cn } from "cn";
import type { CSSProperties, ReactNode } from "react";

/** How the Lens draws one element: the filter's decision, never a new one. */
export type FilterState = "visible" | "degraded" | "renamed" | "removed" | "cut";

/**
 * An element's look as the Lens counts and animates it: removed when it is not drawn, degraded
 * when the Actor gets it degraded, visible otherwise. A renamed element, which the Actor reads
 * whole, is visible.
 */
export type Look = "visible" | "degraded" | "removed";

/**
 * The word the Lens reads beside each rule it names, by rule id, in the order it lists them:
 * `P1 contrast` in the readout strip, `A1 · attention` on a cut flag.
 */
export const RULE_WORDS: ReadonlyMap<RuleId, string> = new Map<RuleId, string>([
  ["P1", "contrast"],
  ["P2", "contrast"],
  ["P3", "font size"],
  ["P4", "target"],
  ["V2", "viewport"],
  ["V3", "covered"],
  ["K1", "pattern"],
  ["K2", "jargon"],
  ["K4", "pattern"],
  ["A1", "attention"],
  ["A3", "options"],
]);

/**
 * Each state's look, `.wf-el--*` in components.css. Degraded is hatched and muted, renamed is mono
 * with a dotted underline. An element the filter removed is drawn, in the evidence view, as an
 * outline with a flag (`CutFlag`), both in `signal` when a perception rule removed it, a
 * measurement line: removed, a dashed `signal` outline. Both are quiet when only attention or the
 * viewport removed it, since that measured nothing: cut, dashed in `line-strong`, with a `quiet`
 * flag. The underline is 1 px: the Lens draws a page at about half its size, where
 * components.css's 2 px dots would run into the letters.
 */
export const FILTER_STATE_CLASS: Record<FilterState, string> = {
  visible: "",
  degraded: "rounded-xs text-ink-3 outline outline-line-strong outline-offset-1 hatch",
  renamed:
    "font-mono text-ink-2 underline decoration-ink-3 decoration-dotted decoration-1 underline-offset-4",
  removed: "rounded-xs outline-2 outline-signal outline-dashed outline-offset-2",
  cut: "rounded-xs outline-2 outline-line-strong outline-dashed outline-offset-2",
};

/** A flag's shape: a mono label on a small pad, on one line. */
const FLAG = "whitespace-nowrap rounded-xs px-1.5 py-px mono-label";

/**
 * A flag in `signal`, which marks a measurement line: a cut flag a perception rule set, the click
 * point's flag on a replayed step, and the needle's on Jev's draw. Each adds where it sits.
 */
export const SIGNAL_FLAG = `${FLAG} bg-signal text-on-signal`;

/** Where a cut flag sits: beside its element, or inside its outline. */
export type FlagSide = "left" | "right" | "inside";

/**
 * The side of its element a cut flag takes, so the flag stays on the page: the side with more of
 * the viewport between the element and the page's edge, right on a tie. When even that side has
 * less than a quarter of the viewport's width, the flag goes inside the element's outline: a
 * removed element is not drawn, so there it covers nothing.
 */
export function flagSide(bbox: Bbox, viewportWidth: number): FlagSide {
  const left = bbox.x;
  const right = viewportWidth - bbox.x - bbox.width;
  if (Math.max(left, right) < viewportWidth / 4) return "inside";
  return right >= left ? "right" : "left";
}

/**
 * A removed element's flag, drawn as `.wf-cut`: a mono label beside its element, never over it,
 * vertically centred, with a 10 px leader back to the element's outline; or, when `side` is
 * `inside`, inside the outline at its top, with no leader. One line per child, so an element
 * several rules removed lists each. `quiet` beside a cut outline (`FILTER_STATE_CLASS`). Its
 * parent is the positioned element it flags. `className` adds to its look, as the Lens's drop-in
 * animation does, and `style` moves it, as the Lens does for a flag that speaks for a run of
 * neighbours (#225).
 */
export function CutFlag({
  quiet,
  side,
  className,
  style,
  children,
}: {
  quiet?: boolean;
  side: FlagSide;
  className?: string;
  style?: CSSProperties | undefined;
  children: ReactNode;
}) {
  return (
    <span
      style={style}
      className={cn(
        "absolute z-1 flex flex-col",
        side === "inside"
          ? "top-0 left-2 before:hidden"
          : "top-1/2 -translate-y-1/2 before:absolute before:top-1/2 before:h-0.5 before:w-2.5 before:-translate-y-1/2",
        side === "right" && "left-full ml-3.5 before:right-full",
        side === "left" && "right-full mr-3.5 before:left-full",
        quiet
          ? `${FLAG} bg-surface text-ink-2 ring-1 ring-line-strong ring-inset before:bg-line-strong`
          : `${SIGNAL_FLAG} before:bg-signal`,
        className,
      )}
    >
      {children}
    </span>
  );
}

const SWATCH_CLASS: Record<Look, string> = {
  visible: "bg-surface ring-2 ring-ink-2 ring-inset",
  // The hatch in ink-3, as lens.html's legend draws it: in `--line` it would not read at 14 px.
  degraded: "hatch ring-1 ring-line-strong ring-inset [--hatch-line:var(--ink-3)]",
  removed: "border-2 border-signal border-dashed",
};

/** A count's key in the Lens's readout strip: a 14 px square in its state's look. */
export function StateSwatch({ state }: { state: Look }) {
  return (
    <span aria-hidden="true" className={cn("size-3.5 shrink-0 rounded-xs", SWATCH_CLASS[state])} />
  );
}
