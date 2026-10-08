/**
 * One persona's run in the race, drawn as `.wf-lane` (`docs/DESIGN.md`, "RaceLane"): who is
 * running, the track of step pips to the goal post, the latest screenshot, how the run stands, the
 * latest narration, and, once the run is stored, a link to its run detail. It draws only what it
 * is given. `arena/race-view.tsx` folds the events into these props, so a test can render any
 * moment of a lane without a stream.
 *
 * The grid has two rows. Row 1 holds who and the track. Row 2 holds the narration's bubble, right
 * under the avatar its tail points at, then the detail line, two lines in all: the narration takes
 * both when there is no detail line, and one over it (#195). The bubble's ground is drawn outside
 * its text, and the screenshot and the right column span both rows, so row 2 costs the lane no
 * height in any state, and three lanes fit 1280 by 720.
 *
 * That fit has a price. Over a detail line, one line holds about 75 characters of narration at
 * 1280, so a stuck, errored or lost lane cuts a longer narration short. A second narration line
 * there would make the lane 24 px taller. While the race is live its header is 18 px taller too, so
 * three such lanes would overflow 720 by 30 px.
 */
import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import type { ReactElement, ReactNode } from "react";
import { type PersonaSlot, slotStyle } from "../avatar/slots.js";
import {
  isEnding,
  markedEnding,
  OUTCOME_WORDS,
  Outcome,
  OutcomeGlyph,
  type OutcomeKind,
} from "./outcome.js";

/**
 * One step on a lane's track:
 * - `act` is a click, double click or type that landed;
 * - `scroll` is a scroll or a wait;
 * - `back` is a step back;
 * - `wasted` is a step whose answer ran no action;
 * - `now` is the step under way.
 *
 * `word` names the step in the track's label.
 */
export type Pip = { kind: "act" | "scroll" | "back" | "wasted" | "now"; word: string };

// `.wf-pip` and its modifiers in docs/design/components.css. Every pip is positioned, so it paints
// over the track's rule. A wasted pip is hatched on surface, so the rule does not run through it,
// and in ink-3, as the reference draws it: the default `--line` would not read at 16 px. A step
// that is done sizes itself in its cell (`PipCell`), so only its look is here.
const PIP_LOOKS: Record<Pip["kind"], string> = {
  act: "rounded-xs bg-(--p)",
  scroll: "rounded-xs bg-surface ring-2 ring-inset ring-(--p)",
  back: "rounded-full bg-surface ring-2 ring-inset ring-ink-3",
  wasted: "rounded-xs bg-surface hatch [--hatch-line:var(--ink-3)] ring-1 ring-inset ring-ink-3",
  // 20 px, ringed in the slot past a 3 px surface gap. The margin keeps the ring off its
  // neighbour.
  now: "mx-1 size-5 rounded-xs bg-(--p) ring-2 ring-(--p) ring-offset-3 ring-offset-surface",
};

/**
 * A step that is done, in a 22 px cell: its 16 px pip and the 6 px gap after it, the spacing s3-12
 * set so 20 steps fit at 1280 (the reference's 10 px would not). A run long enough to fill the
 * track, which the step cap allows up to 40 steps (issue #196), would otherwise run past the post
 * and across the screenshot. So the cells give way together, and each pip keeps 16 / 22 of its
 * narrower cell: every step stays on the track, in order, its kind still told by its fill or its
 * ring. Until the track is full a cell keeps its 22 px, so a short run is drawn exactly as before.
 * The step under way and the end mark never give way.
 */
function PipCell({ kind }: { kind: Exclude<Pip["kind"], "now"> }) {
  return (
    <span className="min-w-0 shrink basis-5.5">
      <span
        data-pip={kind}
        className={cn("relative block h-4 w-[min(16px,73%)]", PIP_LOOKS[kind])}
      />
    </span>
  );
}

/**
 * A place as English writes it: 1st, 2nd, 3rd, then 4th and 5th. Places run from 1 to the arena's
 * `MAX_PERSONAS`, 5, so no place reaches 11th.
 */
function ordinal(place: number): string {
  return `${place}${["st", "nd", "rd"][place - 1] ?? "th"}`;
}

/**
 * The track in words. It opens with `steps`, the right column's own line, so the two never count
 * differently. Then come the pips' words and the end mark's, a give-up among them, since a give-up
 * is a step that makes no pip. A run that got through ends with its place. On a lost stream the
 * step that was under way is counted in `steps` but named nowhere: it makes no pip, and a run that
 * never ended has no end mark to stand for it.
 */
function trackLabel(
  pips: readonly Pip[],
  outcome: OutcomeKind,
  place: number | undefined,
  steps: string,
): string {
  const marks = pips.map((pip) => pip.word);
  if (markedEnding(outcome)) marks.push(OUTCOME_WORDS[outcome].toLowerCase());
  const label = marks.length === 0 ? steps : `${steps}: ${marks.join(", ")}`;
  if (outcome !== "through") return label;
  const reached = OUTCOME_WORDS.through.toLowerCase();
  return place === undefined ? `${label}; ${reached}` : `${label}; ${reached}, ${ordinal(place)}`;
}

/**
 * The goal post at the track's right end, drawn as `.wf-goalpost`: a 3 px ink post with a flag.
 * Once the run got through, the flag takes the persona's slot and the post carries the run's
 * place. The track's label says both in words.
 */
function GoalPost({ reached, place }: { reached: boolean; place: number | undefined }) {
  return (
    <span
      data-goal={reached ? "reached" : "open"}
      className="absolute top-1 right-0 bottom-1 w-4 border-l-(length:--stroke-post) border-ink"
    >
      <svg
        viewBox="0 0 12 10"
        aria-hidden="true"
        className={cn("absolute top-0 left-0 h-2.5 w-3", reached ? "fill-(--p)" : "fill-ink")}
      >
        <path d="M0 0L12 5L0 10Z" />
      </svg>
      {reached && place !== undefined ? (
        <span className="absolute -right-1.5 bottom-full mb-0.5 whitespace-nowrap rounded-sm bg-(--p-soft) px-2 py-px label text-(--p-ink) ring-1 ring-inset ring-(--p)">
          {ordinal(place)}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A race lane. The narration, in a bubble in the persona's colour that points at its avatar, gets
 * one line over a detail line, and both lines without one. Both are clamped in CSS alone, so the
 * markup keeps every word. With no narration, as on a Jev run, there is no bubble and no label.
 */
export function RaceLane({
  headingId,
  slot,
  avatar,
  name,
  pips,
  place,
  shot,
  outcome,
  clock,
  steps,
  detail,
  narration,
  runId,
}: {
  /** The `<h3>`'s id, which names the `<article>`. */
  headingId: string;
  /** Sets `--p`, `--p-ink` and `--p-soft` for everything inside, the avatar included. */
  slot: PersonaSlot;
  /** The persona's avatar, 64 px. */
  avatar: ReactNode;
  name: string;
  pips: readonly Pip[];
  /** From 1, for a run that got through; drawn only on a post that was reached. */
  place: number | undefined;
  /** The latest screenshot; undefined before the first. */
  shot: { src: string; alt: string } | undefined;
  /**
   * How the run stands, or how it ended. An ending raises the lane: Got through reaches the post,
   * and an ending short of it closes the track with its glyph. A lost stream is no ending: its run
   * never ended.
   */
  outcome: OutcomeKind;
  /** "0:15.5", or "—" before the run started. */
  clock: string;
  /** "5 steps so far" while the run is running, "5 steps" once it ended. */
  steps: string;
  /**
   * What a state rests on: the page a stuck run left as it was, an error, a lost stream. Undefined
   * draws no detail line. Any other value draws one and takes the narration's second line, so the
   * type admits no null or false, which would draw an empty line. The line is set in fault when
   * `outcome` is Error or Stream lost, the tool failing, as the outcome's own word is.
   */
  detail: string | ReactElement | undefined;
  /** The latest narration; undefined when there is none, as on a Jev run. */
  narration: string | undefined;
  /**
   * The run's id once io has stored it: the right column then links to its run detail. Undefined
   * draws no link, since run detail has nothing to show before the run is stored.
   */
  runId: string | undefined;
}) {
  return (
    <article
      aria-labelledby={headingId}
      style={slotStyle(slot)}
      className={cn(
        "grid grid-cols-[--spacing(59)_minmax(0,1fr)_--spacing(42)_--spacing(42)] items-center gap-x-(--space-5) gap-y-(--space-2) rounded-md border border-line bg-surface px-(--space-5) py-(--space-3)",
        isEnding(outcome) && "shadow-(--shadow-raised)",
      )}
    >
      <div className="flex min-w-0 items-center gap-4">
        {avatar}
        <h3 id={headingId} className="min-w-0 truncate display-m text-ink">
          {name}
        </h3>
      </div>
      {/* Children of an image are presentational: the label is what assistive technology reads. */}
      <div
        role="img"
        aria-label={trackLabel(pips, outcome, place, steps)}
        className="relative flex h-10 min-w-0 items-center pr-7"
      >
        <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-(length:--stroke-rule) border-line" />
        {/* No gap on the track: each done step's cell holds the gap after its pip (`PipCell`). */}
        {pips.map((pip, index) =>
          pip.kind === "now" ? (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: pips only append, so a pip's index is its step
              key={index}
              data-pip="now"
              className={cn("relative shrink-0", PIP_LOOKS.now)}
            />
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: pips only append, so a pip's index is its step
            <PipCell key={index} kind={pip.kind} />
          ),
        )}
        {markedEnding(outcome) ? (
          <span
            data-end={outcome}
            className="relative ml-0.5 grid size-7 shrink-0 place-items-center bg-surface"
          >
            <OutcomeGlyph kind={outcome} />
          </span>
        ) : null}
        <GoalPost reached={outcome === "through"} place={place} />
      </div>
      {shot === undefined ? (
        <div className="row-span-2 grid aspect-16/10 w-42 place-items-center rounded-sm border border-line bg-paper-sunken px-2 text-center body text-ink-3">
          No screenshot yet
        </div>
      ) : (
        <img
          src={shot.src}
          alt={shot.alt}
          className="row-span-2 block aspect-16/10 w-42 rounded-sm border border-line bg-paper-sunken object-cover object-top"
        />
      )}
      <div className="row-span-2 flex flex-col items-start gap-0.5">
        <Outcome kind={outcome} />
        <span className="readout whitespace-nowrap text-ink">{clock}</span>
        <span className="mono text-ink-3">{steps}</span>
        {runId === undefined ? null : (
          // The lane's heading names the run the link opens: it is the link's context.
          <Link
            to="/runs/$runId"
            params={{ runId }}
            className="inline-flex min-h-(--target-min) items-center gap-1 body text-ink underline underline-offset-4"
          >
            See the run
            {/* A span, not CSS content: a pseudo-element's text joins the link's accessible name. */}
            <span aria-hidden="true" className="text-ink-3">
              →
            </span>
          </Link>
        )}
      </div>
      <div className="col-span-2 flex min-h-12 min-w-0 flex-col self-start">
        {/* The bubble alone fits its text. A detail line keeps the column's width: one sized to an
            unbreakable token, such as a URL's session token in an error, would reach over the
            screenshot and take the clicks meant for "See the run". */}
        {narration === undefined ? null : (
          <div data-narration="" className="relative isolate max-w-full self-start px-2">
            {/* The bubble's ground and outline, beside the paragraph, since the clamp's overflow
                would clip them inside it. They reach 2 px up into the row gap and stop at the
                text's last line, whose leading pads them, so the bubble costs the lane no height
                and a detail line under it keeps its own leading clear. Its tail, drawn over its
                top edge inside the row gap, sits under the 64 px avatar's centre: whose words
                these are. */}
            <span
              aria-hidden="true"
              className="absolute inset-x-0 -top-0.5 bottom-0 -z-10 rounded-sm border-(length:--stroke-rule) border-(--p) bg-paper after:absolute after:-top-1.5 after:left-6.5 after:size-2 after:rotate-45 after:border-t-(length:--stroke-rule) after:border-l-(length:--stroke-rule) after:border-(--p) after:bg-paper"
            />
            <p
              className={cn(
                "body text-ink",
                detail === undefined ? "line-clamp-2" : "line-clamp-1",
              )}
            >
              <span className="mono-label text-ink-3">narration · after the fact</span> {narration}
            </p>
          </div>
        )}
        {detail === undefined ? null : (
          <p
            data-detail=""
            className={cn(
              "line-clamp-1 body",
              outcome === "error" || outcome === "lost" ? "text-fault" : "text-ink-2",
            )}
          >
            {detail}
          </p>
        )}
      </div>
    </article>
  );
}
