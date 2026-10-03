/**
 * The perceived page: one `FullObservation` drawn at its measured boxes. Nothing is decided here
 * (`docs/PLAN.md` F2 AC3): `perceive` gave every element its state and its decisions, and this file
 * only reads them, to draw each element and to tag what was removed.
 *
 * - An element with a `ref` is shown, visible or degraded: one box at its bbox, reading the name
 *   the Actor reads, in the state the Actor gets, both of which `toActorObservation` gives that
 *   ref. So a degraded box reads its masked name, muted, and a renamed one reads its bare role
 *   whole, as the Actor does, whatever perception decided (`docs/RULES.md`, stage 4). Its role
 *   changes how it looks, never whether it is drawn.
 * - An element with no `ref` was removed and is not drawn. In the evidence view it is a dashed
 *   outline at its bbox, tagged with the rules that removed it, with its name for screen readers.
 * - Every length is a measured CSS px times `--px`, the pane's width over the viewport's, so the
 *   drawing scales with no script and the markup carries the measured numbers.
 */
import {
  type ActorElement,
  decisionState,
  type ElementDecision,
  type FullObservation,
  type ObservedElement,
  toActorObservation,
} from "@wayford/core";
import { cn } from "cn";

/** The font size of an element the collector measured none for, as on an icon: the CSS default. */
const DEFAULT_FONT_PX = 16;

/** A length on the page, in measured CSS px, scaled to the pane. */
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

/** One measured px is `--px` on screen, since the viewport's width is the pane's. */
function canvasStyle(width: number, height: number) {
  return { "--px": `calc(100cqw / ${width})`, height: scaled(height) };
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
 * One line of an outline's tag: `P1 2.005 < 3`, `V2 below`, or the bare rule id, as for A1, the
 * attention cap. A knowledge decision renames and never removes, so no tag lists one.
 */
function tagLine(decision: ElementDecision): string {
  switch (decision.stage) {
    case "perception":
      return `${decision.rule} ${decision.value} < ${decision.threshold}`;
    case "viewport":
      return `V2 ${decision.side}`;
    default:
      return decision.rule;
  }
}

/**
 * A shown element: one box at its bbox, reading what the Actor reads, in the muted foreground when
 * the Actor gets it degraded. A renamed element reaches the Actor visible, read whole, so it is
 * never drawn as partly legible. `data-state` stays perception's own, for the evidence.
 */
function ShownBox({
  element,
  actor,
}: {
  element: ObservedElement;
  actor: ActorElement | undefined;
}) {
  const name = actor?.name ?? "";
  const muted = actor?.state === "degraded";
  return (
    <div
      data-ref={element.ref}
      data-state={element.state}
      className={cn(
        "absolute flex items-center whitespace-nowrap leading-none",
        muted ? "text-muted-foreground" : "text-foreground",
        roleLook(element.role),
      )}
      style={boxStyle(element)}
    >
      {TOGGLES.has(element.role) ? (
        <span className="absolute top-1/2 left-full ms-[0.5em] -translate-y-1/2">{name}</span>
      ) : (
        name
      )}
    </div>
  );
}

/** A removed element, in the evidence view: its outline, tagged with the rules that removed it. */
function RemovedOutline({ element }: { element: ObservedElement }) {
  // A decision that only degraded the element did not remove it, so its tag leaves it out.
  const removals = element.decisions.filter((d) => decisionState(d) === "invisible");
  return (
    <div
      data-removed=""
      className="absolute border border-dashed border-muted-foreground/70"
      style={boxStyle(element)}
    >
      <span className="sr-only">{element.name}</span>
      <span className="absolute top-0 left-0 flex flex-col whitespace-nowrap rounded-sm bg-background/90 px-1 font-mono text-[11px] leading-tight text-muted-foreground">
        {removals.map((decision) => (
          <span key={decision.rule}>{tagLine(decision)}</span>
        ))}
      </span>
    </div>
  );
}

export function PerceivedPage({
  observation,
  evidence,
  subject,
}: {
  observation: FullObservation;
  evidence: boolean;
  /**
   * Who the page was perceived for, from the screen: "Vera, seed 1" or "Vera, thresholds edited,
   * seed 1".
   */
  subject: string;
}) {
  // What the Actor gets, by ref: core's own projection, so no masked or renamed name and no muted
  // state is worked out twice. A ref it does not list is drawn with an empty name, never the real
  // one, as there, and unmuted.
  const actorElements = new Map(toActorObservation(observation).elements.map((e) => [e.ref, e]));
  const { width, height } = observation.viewport;
  return (
    <figure className="flex flex-col gap-3">
      {/* The top edge takes the persona colour the screen sets as `--persona`. */}
      <div className="overflow-hidden rounded-xl border border-t-2 border-t-(--persona)">
        <div className="@container">
          <div
            className="relative overflow-hidden bg-background"
            style={canvasStyle(width, height)}
          >
            {/* Keyed by place in the observation, which every redraw keeps: measurement order, or
                salience order under a cap, and salience reads no threshold and no seed, so a
                slider never moves an element. A ref moves when an element before it goes. So the
                element that changes state is the one React replaces, and the rest stay the same
                nodes. */}
            {observation.elements.map((element, index) => {
              if (element.ref !== undefined) {
                return (
                  <ShownBox
                    // biome-ignore lint/suspicious/noArrayIndexKey: a slider never moves an element, so its index is its identity
                    key={`shown:${index}`}
                    element={element}
                    actor={actorElements.get(element.ref)}
                  />
                );
              }
              return evidence ? (
                <RemovedOutline
                  // biome-ignore lint/suspicious/noArrayIndexKey: a slider never moves an element, so its index is its identity
                  key={`removed:${index}`}
                  element={element}
                />
              ) : null;
            })}
          </div>
        </div>
      </div>
      <figcaption className="text-sm text-muted-foreground">
        {evidence
          ? `Evidence, not perception: dashed outlines mark the elements perceive removed for ${subject}, each with the rule that removed it.`
          : `The page as perceive returns it for ${subject}.`}
      </figcaption>
    </figure>
  );
}
