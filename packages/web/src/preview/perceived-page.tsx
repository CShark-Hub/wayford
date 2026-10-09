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
 *   decision that removed it, in its removed or cut look (`FILTER_STATE_CLASS`).
 * - Every length on the page is a measured CSS px times `--px`, the frame's width over the
 *   viewport's, so the drawing scales with no script and the markup carries the measured numbers.
 *   A flag is not on the page: it is drawn at full size beside its element, so it reads at any
 *   scale. The canvas is cropped below the lowest element in the viewport, and the frame fits it
 *   to the measuring surface it is centred on, which clips whatever runs past it.
 * - The one animation (`docs/DESIGN.md`, "Motion"): an element whose look changes between two
 *   renders of one mounted page is drawn by a fresh node, whose CSS animation plays once. The
 *   screen mounts a fresh page per scene, and a static render has no render before it, so neither
 *   animates anything.
 */
import {
  decisionState,
  type ElementDecision,
  type FullObservation,
  type ObservedElement,
  toActorObservation,
} from "@wayford/core";
import { cn } from "cn";
import { type ReactNode, useState } from "react";
import {
  CutFlag,
  FILTER_STATE_CLASS,
  type FilterState,
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
 * elements `perceive` left in the viewport, those with no `viewport` decision (V2), whatever else
 * removed or degraded them, so a slider never moves it; never taller than the viewport, and the
 * viewport's height when V2 removed every element.
 */
export function croppedHeight(observation: FullObservation): number {
  const { height } = observation.viewport;
  const bottoms = observation.elements
    .filter((element) => !element.decisions.some((d) => d.stage === "viewport"))
    .map(({ bbox }) => bbox.y + bbox.height);
  if (bottoms.length === 0) return height;
  return Math.min(Math.max(...bottoms) + CROP_MARGIN_PX, height);
}

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
 */
function frameStyle(width: number, height: number) {
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
 * never rounded; `V2 · below`; `A1 · attention` or `A3 · options`, in the strip's words. A
 * knowledge decision renames and never removes, so no flag lists one.
 */
function flagLine(decision: ElementDecision): string {
  switch (decision.stage) {
    case "perception":
      return `${decision.rule} · ${decision.value} < ${decision.threshold}`;
    case "viewport":
      return `V2 · ${decision.side}`;
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
 * A removed element, in the evidence view: its outline, and a flag beside it with the decisions
 * that removed it, in the removed or cut look by what removed it (`FILTER_STATE_CLASS`). A changed
 * one draws in from the hatch, which fades off it, while its flag drops in.
 */
function RemovedOutline({
  element,
  viewportWidth,
  animate,
}: {
  element: ObservedElement;
  viewportWidth: number;
  animate: boolean;
}) {
  // A decision that only degraded the element did not remove it, so its flag leaves it out.
  const removals = element.decisions.filter((d) => decisionState(d) === "invisible");
  const perception = removals.some((d) => d.stage === "perception");
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
      <CutFlag
        quiet={!perception}
        side={flagSide(element.bbox, viewportWidth)}
        className={animate ? "animate-lens-flag" : ""}
      >
        {removals.map((decision) => (
          <span key={decision.rule}>{flagLine(decision)}</span>
        ))}
      </CutFlag>
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
}: {
  observation: FullObservation;
  evidence: boolean;
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

  const { width } = observation.viewport;
  const height = croppedHeight(observation);
  return (
    <figure className="flex min-h-0 flex-1 flex-col gap-3">
      {/* The measuring surface, which the frame is centred on and fitted to. It clips, so
          nothing drawn past the frame, a flag or an outline off the page, escapes it. */}
      <div className={cn(MEASURING_SURFACE, "overflow-clip")}>
        <div
          data-lens-stage=""
          className="@container rounded-md border border-line-strong bg-surface"
          style={frameStyle(width, height)}
        >
          {/* Clipped top and bottom only: an outline below the fold stays off the page, while a
              flag, drawn at full size beside a page drawn at about half, may run past the frame's
              side onto the measuring surface rather than lose its numbers. */}
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
