import type { Bbox, RuleId } from "@wayford/core";
import { cn } from "cn";
import type { CSSProperties, ReactNode } from "react";
import { Tag } from "./tag.js";
import { Hint } from "./ui/tooltip.js";

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

/** Said after a description by a rule the code does not build yet: it removed nothing. */
const NOT_BUILT = "Not built yet: it changes nothing today.";

/**
 * What each rule does to what reaches the model, in plain words, for its tag's hint (#244). Only
 * the rules a screen can draw a tag for: the Lens strip lists `RULE_WORDS`' rules, and a finding's
 * basis holds only those io gives a source (`provenanceOf`), the same eleven. Each is its
 * `docs/RULES.md` row, checked against the code where the two differ (P1, P3), and in
 * docs/DEMO.md's words: "doesn't reach the model", never what a person sees.
 */
export const RULE_HINTS: Partial<Record<RuleId, string>> = {
  P1: "Text with contrast under the persona's threshold doesn't reach the model, nor does a control whose text fails. On a soft cut, a seeded roll may let text in a band below it through, partly masked.",
  P2: `Controls whose borders and icons have less contrast than the persona's threshold would not reach the model. ${NOT_BUILT}`,
  P3: "Text smaller than the persona's threshold in CSS px doesn't reach the model, nor does a control whose text fails. On a soft cut, a seeded roll may let text in a band below it through, partly masked.",
  P4: "A control smaller than the persona's threshold on its shorter side, its label included, doesn't reach the model. On a soft cut, a seeded roll may let one in a band below it through, partly masked.",
  V2: `Only elements on screen at the current scroll position reach the model, for every persona. Those further down that the persona's other rules would let through are counted as "N more below".`,
  V3: "An element the page paints something over where a click on it would land, such as a cookie wall, a dialog or a sticky header, doesn't reach the model for any persona, Ada included. It isn't counted.",
  K1: `A control that draws no text and matches a UI pattern the persona's profile lists as unknown reaches the model by its bare role, such as button "button". It always fires with K4; only hamburger and kebab are detected today.`,
  K2: "For a persona whose profile sets a vocabulary, a term from the target app's jargon list that the vocabulary lacks reaches the model as [unfamiliar term]. The rest of the element's name stays as written.",
  K4: "The same rename as K1, on the same controls: an icon-only control whose pattern the persona's profile lists as unknown reaches the model by its bare role. The two read one input, so they always fire together.",
  A1: "The persona's profile caps how many elements reach the model, ranked by size, contrast and position on the page and read in that order. Past the cap, the lowest-ranked are dropped and counted as hidden.",
  A3: `In a list or menu longer than the persona's option cap, only the first entries would reach the model, the rest counted. ${NOT_BUILT}`,
};

/**
 * A rule's tag that explains itself (#244): the rule `Tag`, `P4` or with `words` `P4 target`, as
 * the face of a `Hint` named "Explain" and what it reads. The hint is the rule's description, and
 * with a `count`, the elements it fired on this page. A rule with no description is the plain tag.
 */
export function RuleTag({ rule, words, count }: { rule: RuleId; words?: boolean; count?: number }) {
  const word = words ? RULE_WORDS.get(rule) : undefined;
  const text = word === undefined ? rule : `${rule} ${word}`;
  const tag = <Tag variant="rule">{text}</Tag>;
  const hint = RULE_HINTS[rule];
  if (hint === undefined) return tag;
  const fired =
    count === undefined
      ? ""
      : ` On this page it fired on ${count === 1 ? "1 element" : `${count} elements`}.`;
  return <Hint label={`Explain ${text}`} hint={`${hint}${fired}`} face={tag} />;
}

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
