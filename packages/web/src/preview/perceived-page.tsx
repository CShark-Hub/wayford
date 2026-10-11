/**
 * The perceived page: one `FullObservation` drawn at its measured boxes. Nothing is decided here
 * (`docs/PLAN.md` F2 AC3): `perceive` gave every element its state and its decisions, and this file
 * only reads them, to draw each element in its `FilterStates` look and to flag what was removed.
 *
 * - An element with a `ref` is shown: one box at its bbox, reading the name the Actor reads, in the
 *   state the Actor gets, both of which `toActorObservation` gives that ref. So a degraded box is
 *   hatched and reads its masked name, and a renamed one is drawn renamed and reads its new name
 *   whole (the bare role for K1 and K4, `[unfamiliar term]` in place of the term for K2), as the
 *   Actor does, whatever perception decided (`docs/RULES.md`, stage 4). Its role changes how it
 *   looks, never whether it is drawn.
 * - An element with no `ref` was removed and is not drawn. In the evidence view it is a dashed
 *   outline at its bbox, with its name for screen readers and a flag beside it listing every
 *   decision that removed it, in its removed or cut look (`FILTER_STATE_CLASS`). Neighbours removed
 *   alike, stacked as a list's entries, share one flag with their count (`flagRuns`, #225).
 * - Every length on the page is a measured CSS px times `--px`, the frame's width over the
 *   viewport's, so the drawing scales with no script and the markup carries the measured numbers.
 *   A flag is not on the page: it is drawn at full size beside its element, so it reads at any
 *   scale. The canvas is cropped below the lowest element in the viewport, and the frame fits it
 *   to the measuring surface it is centred on, which clips whatever runs past it; at full size
 *   the frame is the viewport's own width and the surface scrolls instead.
 * - The one animation (`docs/DESIGN.md`, "Motion"): an element whose look changes between two
 *   renders of one mounted page is drawn by a fresh node, whose CSS animation plays once. The
 *   screen mounts a fresh page per scene, and a static render has no render before it, so neither
 *   animates anything.
 */
import {
  type Bbox,
  decisionState,
  type ElementDecision,
  type FullObservation,
  type ObservedElement,
  toActorObservation,
} from "@wayford/core";
import { cn } from "cn";
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import {
  CutFlag,
  FILTER_STATE_CLASS,
  type FilterState,
  type FlagSide,
  flagSide,
  type Look,
  RULE_WORDS,
} from "../components/filter-states.js";

/** The font size of an element the collector measured none for, as on an icon: the CSS default. */
const DEFAULT_FONT_PX = 16;

/** A length on the page, in measured CSS px, scaled to the frame. */
function scaled(px: number): string {
  return `calc(${px} * var(--px))`;
}

/** Where an element sits and how large its text is. A drawn box and an outline share it. */
function boxStyle(element: ObservedElement) {
  const { x, y, width, height } = element.bbox;
  return {
    left: scaled(x),
    top: scaled(y),
    width: scaled(width),
    height: scaled(height),
    fontSize: scaled(element.metrics.fontPx ?? DEFAULT_FONT_PX),
  };
}

/** The target app's body line height (`packages/target-app/src/style.css`), Tailwind's `leading-normal`. */
const TEXT_LINE_HEIGHT = 1.5;

/**
 * Whether a box holds more than one line of its text: a text block over one and a half lines tall,
 * as a paragraph that wraps on a phone. Its name then wraps inside the box at the page's line
 * height. A text block is an element with no target size, which the collector measures on controls
 * only; a control, and a text block one line tall, keep their name on one line.
 */
function holdsLines(element: ObservedElement): boolean {
  if (element.metrics.targetPx !== undefined) return false;
  const lineHeight = (element.metrics.fontPx ?? DEFAULT_FONT_PX) * TEXT_LINE_HEIGHT;
  return element.bbox.height > 1.5 * lineHeight;
}

/**
 * The measuring surface the frame sits on, and the Lens's skeleton while it measures: a size
 * container the frame fits. 8 px top and bottom, inside the corner ticks' reach: a frame bound by
 * the height is centred across, clear of them, and the page gets the 16 px (#224).
 */
export const MEASURING_SURFACE =
  "grid min-h-0 flex-1 @container-size place-items-center px-4 py-2 measure";

/** The room under the lowest element the canvas keeps, in measured CSS px. */
const CROP_MARGIN_PX = 24;

/**
 * How tall the canvas is drawn, in measured CSS px: 24 px under the lowest bottom edge of the
 * elements `perceive` left in the viewport, those with no V2 decision, whatever else removed or
 * degraded them, so a slider never moves it; never taller than the viewport, and the viewport's
 * height when V2 removed every element. An element V3 cut is in the viewport, under what the page
 * paints over it (#229).
 */
export function croppedHeight(observation: FullObservation): number {
  const { height } = observation.viewport;
  const bottoms = observation.elements
    .filter((element) => !element.decisions.some((d) => d.rule === "V2"))
    .map(({ bbox }) => bbox.y + bbox.height);
  if (bottoms.length === 0) return height;
  return Math.min(Math.max(...bottoms) + CROP_MARGIN_PX, height);
}

/** How far the measuring surface is scrolled at full size, in px. */
export type Scroll = { left: number; top: number };

/** One measured px is `--px` on screen, since the viewport's width is the frame's. */
function canvasStyle(width: number, height: number) {
  return { "--px": `calc(100cqw / ${width})`, height: scaled(height) };
}

/**
 * The frame's width: the measuring surface's width, or less when the canvas would be taller than
 * the height the surface gives it, so the whole canvas shows. Both read the surface, the size
 * container around the frame; the 2 px are the frame's two hairline borders, so its border box
 * fits exactly. And never wider than the measured viewport, so a phone's page is drawn at a
 * phone's width rather than stretched across the stage.
 *
 * At full size it is the measured width plus those borders, so one measured px is one px and the
 * page's text is drawn at its own size, in a surface that scrolls (#224).
 */
function frameStyle(width: number, height: number, zoom: boolean) {
  if (zoom) return { width: `${width + 2}px` };
  return {
    width: `min(100cqw, (100cqh - 2px) * ${width} / ${height} + 2px)`,
    maxWidth: `${width}px`,
  };
}

/**
 * How a role looks, in `em` so it scales with the box's font size. A checkbox or radio is its
 * small box, and its name sits to the right, where its label is on the page.
 */
function roleLook(role: string): string {
  switch (role) {
    case "link":
      return "underline underline-offset-[0.15em]";
    case "button":
      return "justify-center rounded-[0.3em] border border-current px-[0.5em]";
    case "textbox":
    case "searchbox":
    case "combobox":
      return "rounded-[0.3em] border border-current px-[0.5em]";
    case "checkbox":
      return "rounded-[0.2em] border-2 border-current";
    case "radio":
      return "rounded-full border-2 border-current";
    case "heading":
      return "font-semibold";
    default:
      return "";
  }
}

const TOGGLES = new Set(["checkbox", "radio"]);

/**
 * A shown box's classes, in a `FilterStates` look. The role comes after the look, so a degraded
 * radio keeps its round shape and takes the look's hatch and muted ink.
 */
function boxClass(element: ObservedElement, state: FilterState): string {
  return cn(
    "absolute flex items-center text-ink",
    holdsLines(element) ? "whitespace-normal leading-normal" : "whitespace-nowrap leading-none",
    FILTER_STATE_CLASS[state],
    roleLook(element.role),
  );
}

/** A box's name, beside its small box for a checkbox or radio. */
function BoxName({ element, name }: { element: ObservedElement; name: string }) {
  return TOGGLES.has(element.role) ? (
    <span className="absolute top-1/2 left-full ms-[0.5em] -translate-y-1/2">{name}</span>
  ) : (
    name
  );
}

/**
 * One line of a cut flag: `P1 · 2.005 < 3`, the value and threshold as `perceive` recorded them,
 * never rounded; `V2 · below`; `V3 · covered`, `A1 · attention` or `A3 · options`, in the strip's
 * words. A knowledge decision renames and never removes, so no flag lists one.
 */
function flagLine(decision: ElementDecision): string {
  switch (decision.stage) {
    case "perception":
      return `${decision.rule} · ${decision.value} < ${decision.threshold}`;
    case "viewport":
      return `${decision.rule} · ${decision.side ?? RULE_WORDS.get(decision.rule)}`;
    case "attention":
      return `${decision.rule} · ${RULE_WORDS.get(decision.rule)}`;
    default:
      return decision.rule;
  }
}

/**
 * A shown element: one box at its bbox, reading what the Actor reads, in its look. Degraded is
 * drawn degraded; a visible one a knowledge rule renamed is drawn renamed, since the Actor reads
 * it whole, never as partly legible; the rest visible. `data-state` stays perception's own, for
 * the evidence. A changed one fades in, in its new look.
 */
function ShownBox({
  element,
  look,
  name,
  animate,
}: {
  element: ObservedElement;
  look: Look;
  name: string;
  animate: boolean;
}) {
  const renamed = element.decisions.some((d) => d.stage === "knowledge");
  const state: FilterState = look === "degraded" ? "degraded" : renamed ? "renamed" : "visible";
  return (
    <div
      data-ref={element.ref}
      data-state={element.state}
      className={cn(boxClass(element, state), animate && "animate-lens-in")}
      style={boxStyle(element)}
    >
      <BoxName element={element} name={name} />
    </div>
  );
}

/**
 * The decisions that removed an element. A decision that only degraded it did not, so its flag
 * leaves it out.
 */
function removalsOf(element: ObservedElement): ElementDecision[] {
  return element.decisions.filter((d) => decisionState(d) === "invisible");
}

/**
 * How far below the top of a run's last element the next may start and still join it, in measured
 * CSS px. A flag is about 22 px tall, drawn at full size beside a page fitted at about half its
 * size, so the flags of neighbours closer than this touch or overlap (#225).
 */
const RUN_PITCH_PX = 48;

/** A flag that speaks for a run of removed neighbours: how many, and the box around them all. */
export type FlagRun = { count: number; box: Bbox };

/**
 * Which removed element carries a flag, by its index in the observation (#225). Removed elements
 * stacked one under another, each starting less than `RUN_PITCH_PX` below the top of the one above
 * it and overlapping it across, that the same decisions removed with the same lines, as the
 * entries of a list an attention cap left out, share one flag: the topmost carries it, for the
 * whole run, and the rest map to `null`. Every one of them is still outlined; only their flags are
 * merged. A removed element with other lines that lands between two of them, overlapping across,
 * ends the run. It reads the measured boxes alone, never the scale, so a page draws the same flags
 * fitted or at full size.
 */
export function flagRuns(elements: readonly ObservedElement[]): Map<number, FlagRun | null> {
  const removed = elements
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => element.ref === undefined)
    .sort((a, b) => a.element.bbox.y - b.element.bbox.y || a.element.bbox.x - b.element.bbox.x);
  const runs: { lines: string; members: ObservedElement[]; leader: number; open: boolean }[] = [];
  const result = new Map<number, FlagRun | null>();
  for (const { element, index } of removed) {
    const lines = removalsOf(element).map(flagLine).join("\n");
    const { x, y, width } = element.bbox;
    const across = ({ bbox }: ObservedElement) => x < bbox.x + bbox.width && bbox.x < x + width;
    const run = runs.find((r) => {
      const last = r.members[r.members.length - 1];
      if (last === undefined || !r.open || r.lines !== lines) return false;
      return across(last) && y - last.bbox.y < RUN_PITCH_PX;
    });
    // An element with other lines below a run, overlapping it across, ends it: a later member
    // would put the run's flag beside this element's own.
    for (const r of runs) {
      const last = r.members[r.members.length - 1];
      if (last !== undefined && r.lines !== lines && across(last)) r.open = false;
    }
    if (run === undefined) {
      runs.push({ lines, members: [element], leader: index, open: true });
    } else {
      run.members.push(element);
      result.set(index, null);
    }
  }
  for (const { members, leader } of runs) {
    const left = Math.min(...members.map((m) => m.bbox.x));
    const top = Math.min(...members.map((m) => m.bbox.y));
    const right = Math.max(...members.map((m) => m.bbox.x + m.bbox.width));
    const bottom = Math.max(...members.map((m) => m.bbox.y + m.bbox.height));
    result.set(leader, {
      count: members.length,
      box: { x: left, y: top, width: right - left, height: bottom - top },
    });
  }
  return result;
}

/**
 * Where a run's flag sits, from its topmost element: beside the whole run, at its middle, past its
 * widest edge, so it covers none of the run's outlines. One element's flag, or one inside its
 * outline, keeps `CutFlag`'s own place.
 */
function runStyle(
  element: ObservedElement,
  run: FlagRun,
  side: FlagSide,
): CSSProperties | undefined {
  if (run.count === 1 || side === "inside") return undefined;
  const { x, y, width } = element.bbox;
  const { box } = run;
  const top = scaled(box.y + box.height / 2 - y);
  return side === "right"
    ? { top, left: scaled(box.x + box.width - x) }
    : { top, right: scaled(x + width - box.x) };
}

/**
 * A removed element, in the evidence view: its outline, and a flag beside it with the decisions
 * that removed it, in the removed or cut look by what removed it (`FILTER_STATE_CLASS`). A changed
 * one draws in from the hatch, which fades off it, while its flag drops in.
 *
 * The flag of a run of neighbours is drawn once, by its topmost element, with the run's count in a
 * column of its own beside the lines (`A1 · attention │ ×5`), so it never reads as part of a value
 * and adds no line to the flag's height; each other element of the run keeps its lines for screen
 * readers only, a comma between them (#225).
 */
function RemovedOutline({
  element,
  run,
  viewportWidth,
  animate,
}: {
  element: ObservedElement;
  /** The run whose flag it carries, or `null` when the element above it carries its flag. */
  run: FlagRun | null;
  viewportWidth: number;
  animate: boolean;
}) {
  const removals = removalsOf(element);
  const perception = removals.some((d) => d.stage === "perception");
  const lines = removals.map((decision) => <span key={decision.rule}>{flagLine(decision)}</span>);
  const side = run === null ? undefined : flagSide(run.box, viewportWidth);
  return (
    <div
      data-removed=""
      className={cn(
        "absolute",
        FILTER_STATE_CLASS[perception ? "removed" : "cut"],
        animate &&
          "animate-lens-in after:absolute after:inset-0 after:opacity-0 after:hatch after:animate-lens-out",
      )}
      style={boxStyle(element)}
    >
      <span className="sr-only">{element.name}</span>
      {run === null || side === undefined ? (
        <span className="sr-only">
          {lines.flatMap((line, i) => (i === 0 ? [line] : [", ", line]))}
        </span>
      ) : (
        <CutFlag
          quiet={!perception}
          side={side}
          style={runStyle(element, run, side)}
          className={cn(run.count > 1 && "flex-row gap-1.5", animate && "animate-lens-flag")}
        >
          {run.count > 1 ? (
            <>
              <span className="flex flex-col">{lines}</span>
              <span data-count="" className="flex items-center border-l border-current pl-1.5">
                {`×${run.count}`}
              </span>
            </>
          ) : (
            lines
          )}
        </CutFlag>
      )}
    </div>
  );
}

/**
 * An element removed as a threshold moved, in the perceived view: drawn once more as it was, its
 * look and name from `was`, fading out. Its resting style is transparent, so with the animation
 * `none` it is simply gone. It carries no `data-ref` and no `data-state`, so nothing that counts
 * drawn boxes counts it, and it is hidden from screen readers.
 */
function LeavingBox({
  element,
  was,
}: {
  element: ObservedElement;
  was: { look: Look; name: string };
}) {
  return (
    <div
      data-leaving=""
      aria-hidden="true"
      className={cn(boxClass(element, was.look), "opacity-0 animate-lens-out")}
      style={boxStyle(element)}
    >
      <BoxName element={element} name={was.name} />
    </div>
  );
}

/**
 * Each element's look, in the observation's order: removed when it has no `ref`, degraded when
 * the Actor gets it degraded (`toActorObservation`, so a renamed element, which the Actor reads
 * whole, is visible), visible otherwise. The page draws by it, the animation tracks it and the
 * Lens's strip counts it.
 */
export function looksOf(observation: FullObservation): Look[] {
  const degraded = new Set(
    toActorObservation(observation)
      .elements.filter((element) => element.state === "degraded")
      .map((element) => element.ref),
  );
  return observation.elements.map((element) =>
    element.ref === undefined ? "removed" : degraded.has(element.ref) ? "degraded" : "visible",
  );
}

/**
 * What the page drew, per element index, for the animation: each look and name, how many times
 * the look has changed since the page mounted, and the look and name before the last change.
 */
export type Track = {
  looks: Look[];
  names: string[];
  changes: number[];
  was: ({ look: Look; name: string } | undefined)[];
};

/**
 * The track after a render. It starts over, every counter at 0, on the first render or a new
 * element count. Where a look differs from the last render's, its counter goes up and `was` keeps
 * the look and name it had. When neither a look nor a name changed it returns `prev` itself, so
 * the state is set only on a change and the render settles.
 */
export function nextTrack(prev: Track | undefined, looks: Look[], names: string[]): Track {
  if (prev === undefined || prev.looks.length !== looks.length) {
    return {
      looks,
      names,
      changes: looks.map(() => 0),
      was: looks.map(() => undefined),
    };
  }
  const same = (a: readonly string[], b: readonly string[]) => a.every((v, i) => v === b[i]);
  if (same(looks, prev.looks) && same(names, prev.names)) return prev;
  const changes = [...prev.changes];
  const was = [...prev.was];
  prev.looks.forEach((before, i) => {
    if (looks[i] === before) return;
    changes[i] = (changes[i] ?? 0) + 1;
    was[i] = { look: before, name: prev.names[i] ?? "" };
  });
  return { looks, names, changes, was };
}

/**
 * The page as a figure that grows to fill its flex column: the measuring surface with the frame
 * on it, and the caption under it. The screen keys it by its scene, what the drawing is of, so a
 * persona, page, view or source switch mounts a fresh page with a fresh track and animates
 * nothing, while a threshold move redraws this one and does.
 */
export function PerceivedPage({
  observation,
  evidence,
  subject,
  source,
  zoom,
  initialScroll,
  onScroll,
}: {
  observation: FullObservation;
  evidence: boolean;
  /** Whether the page is drawn at its measured size, in a surface that scrolls, or fitted whole. */
  zoom: boolean;
  /** Where to put the surface's scroll at full size, on mount and when zoom turns on. */
  initialScroll?: Scroll | undefined;
  /** Each scroll of the surface at full size, for the screen to keep. */
  onScroll?: (scroll: Scroll) => void;
  /**
   * Who the page was perceived for, from the screen: "Vera, seed 1" or "Vera, thresholds edited,
   * seed 1".
   */
  subject: string;
  /** Where the measurement came from, from the screen: the caption's second line, when given. */
  source?: ReactNode;
}) {
  // What the Actor reads, by ref: core's own projection, so no masked or renamed name is worked
  // out twice. A ref it does not list is drawn with an empty name, never the real one, as there,
  // and visible.
  const actorNames = new Map(toActorObservation(observation).elements.map((e) => [e.ref, e.name]));
  const looks = looksOf(observation);
  const names = observation.elements.map((element) =>
    element.ref === undefined ? "" : (actorNames.get(element.ref) ?? ""),
  );

  // The track is state adjusted during render (React's "storing information from previous
  // renders"): a changed one is set, React renders again at once, and `nextTrack` returns it.
  const [track, setTrack] = useState(() => nextTrack(undefined, looks, names));
  const next = nextTrack(track, looks, names);
  if (next !== track) setTrack(next);

  // At full size, the surface's scroll restored on mount and whenever zoom turns on, and only
  // then: read through a ref, so a redraw during a scroll never pulls the surface back.
  const scroller = useRef<HTMLElement>(null);
  const restore = useRef(initialScroll);
  restore.current = initialScroll;
  useLayoutEffect(() => {
    const scroll = restore.current;
    if (zoom && scroll !== undefined) scroller.current?.scrollTo(scroll.left, scroll.top);
  }, [zoom]);

  const { width } = observation.viewport;
  const height = croppedHeight(observation);
  const runs = evidence ? flagRuns(observation.elements) : undefined;
  return (
    <figure className="flex min-h-0 flex-1 flex-col gap-3">
      {/* The measuring surface, which the frame is centred on and, unless at full size, fitted
          to. It clips, so nothing drawn past the frame, a flag or an outline off the page,
          escapes it. */}
      <div className={cn(MEASURING_SURFACE, "overflow-clip")}>
        {/* What the frame sits in: over the whole surface, with the surface's own padding
            (`MEASURING_SURFACE`, keep the two alike), so a frame fitted to the surface's size
            fits here as before. At full size it scrolls, while the surface's corner ticks, drawn on
            the surface itself, stay at its corners; the page passes over them as it scrolls.
            The grid's track grows to an oversized frame, which keeps its edges in the scroll's
            reach. Its focus ring is drawn inside, since the surface clips whatever lies outside
            it. */}
        <section
          ref={scroller}
          data-lens-scroller=""
          className={cn(
            "absolute inset-0 grid place-items-center px-4 py-2 focus-visible:-outline-offset-4",
            zoom ? "overflow-auto" : "overflow-clip",
          )}
          // A region landmark only at full size, where it scrolls: unnamed, a section is none.
          aria-label={zoom ? "The page at full size" : undefined}
          tabIndex={zoom ? 0 : undefined}
          onScroll={(event) =>
            onScroll?.({ left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop })
          }
        >
          <div
            data-lens-stage=""
            className="@container rounded-md border border-line-strong bg-surface"
            style={frameStyle(width, height, zoom)}
          >
            {/* Clipped top and bottom only: an outline below the fold stays off the page, while a
              flag, drawn at full size beside a page drawn at about half or at its own size, may
              run past the frame's side onto the measuring surface rather than lose its numbers. */}
            <div
              className="relative overflow-x-visible overflow-y-clip"
              style={canvasStyle(width, height)}
            >
              {/* Keyed by place in the observation, which every redraw keeps: measurement order, or
                salience order under a cap, and salience reads no threshold and no seed, so a
                slider never moves an element. A ref moves when an element before it goes. And by
                the count of its look's changes, so the element whose look changes is the one
                React replaces, its animation playing once, and the rest stay the same nodes. */}
              {observation.elements.map((element, index) => {
                const n = next.changes[index] ?? 0;
                if (element.ref !== undefined) {
                  return (
                    <ShownBox
                      // biome-ignore lint/suspicious/noArrayIndexKey: a slider never moves an element, so its index is its identity
                      key={`shown:${index}:${n}`}
                      element={element}
                      look={looks[index] ?? "visible"}
                      name={names[index] ?? ""}
                      animate={n > 0}
                    />
                  );
                }
                if (evidence) {
                  return (
                    <RemovedOutline
                      // biome-ignore lint/suspicious/noArrayIndexKey: a slider never moves an element, so its index is its identity
                      key={`removed:${index}:${n}`}
                      element={element}
                      run={runs?.get(index) ?? null}
                      viewportWidth={width}
                      animate={n > 0}
                    />
                  );
                }
                const was = next.was[index];
                return n > 0 && was !== undefined && was.look !== "removed" ? (
                  <LeavingBox
                    // biome-ignore lint/suspicious/noArrayIndexKey: a slider never moves an element, so its index is its identity
                    key={`leaving:${index}:${n}`}
                    element={element}
                    was={was}
                  />
                ) : null;
              })}
            </div>
          </div>
        </section>
      </div>
      {/* Two lines tall in both views, so flipping the view never resizes the page above it: the
          view's sentence, one line in either view at 1280 px for the slider's seeds, then the source's. */}
      <figcaption className="min-h-12">
        {/* Paragraphs, the blocks the self-check measures. */}
        <p className="body text-ink-2">
          {evidence
            ? `Evidence, not perception: dashed outlines mark what perceive removed for ${subject}, each with its rule.`
            : `The page as perceive returns it for ${subject}.`}
        </p>
        {source === undefined ? null : <p className="body text-ink-2">{source}</p>}
      </figcaption>
    </figure>
  );
}
