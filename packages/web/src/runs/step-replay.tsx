/**
 * One stored step, replayed in two columns as `docs/design/screens/run-detail.html` draws it
 * (`docs/PLAN.md` F7 AC3). On the left, the screenshot of the page the step observed, with the
 * click point, and under it three tabs: what the filter took out, the dice, and on a step Jev chose,
 * its draw (`decision-panel.tsx`). On the right, the narration, then what the model read, line by
 * line. Nothing is worked out here that the record does not hold: the model's text is the stored
 * text, what the Actor read of each element is core's `toActorObservation`, and every decision
 * prints the rule its data names.
 *
 * The narration is the model's account of its own answer, written as it answered, and so
 * interpretation, never measurement (`AGENTS.md`, "Traps"). It has a section of its own, labelled
 * `narration · after the fact`, and no other section of the replay prints it: a wasted step's
 * refused answers are listed under Dice by what they did, and their narrations go under narration
 * with the rest. It leads the right column (#239): it is what makes a step readable at a glance,
 * and a long page's text would push it below the fold. Under the replay, run detail's narration
 * list prints the whole run's, each step through the same `StepNarration` (#197).
 *
 * The screenshot, the click point, the filtered elements and the model's text describe the page the
 * step observed. A step's own screenshot is taken after its action landed, so that page is the one
 * the "Observed" screenshot shows, which `observedFrom` finds; the step's own is the "After" one.
 */
import {
  type Action,
  type Bbox,
  type Cost,
  type DiceRoll,
  type ElementDecision,
  type FullObservation,
  METRIC_NAMES,
  type Metrics,
  type ObservedElement,
  type RunResult,
  type RunStep,
  toActorObservation,
  type Viewport,
} from "@wayford/core";
import { cn } from "cn";
import { Tabs } from "radix-ui";
import { Fragment, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { screenshotUrl } from "../api/runs.js";
import { bundledProfiles } from "../bundled-fixtures.js";
import { SIGNAL_FLAG } from "../components/filter-states.js";
import { percent } from "../components/jev-draw.js";
import { PersonaAvatar, personaLabel } from "../components/persona-avatar.js";
import { SEGMENT_GROUP, SegmentedControl, segmentItem } from "../components/segmented-control.js";
import { ConfidenceNote, DecisionPanel } from "./decision-panel.js";
import { Detail, Details, FACTS, Fact, Mark, NOTE, shortNumber, TABLE, TD, TH } from "./details.js";
import { describeAction, observedFrom } from "./replay.js";

/** How narration is labelled wherever it is shown (`docs/DESIGN.md`, Principle 6). */
export const NARRATION_LABEL = "narration · after the fact";

/**
 * The id of each section's `<h3>`. One replay is drawn per page, so fixed ids are unique, and the
 * markup depends on the step alone.
 */
const HEADING = {
  screenshot: "step-screenshot",
  filtered: "step-filtered",
  dice: "step-dice",
  jev: "step-jev",
  modelRead: "step-model-read",
  narration: "step-narration",
} as const;

/**
 * One decision as a line of the evidence: `P1 contrast 2.1 < 3, rolled 0.42: degraded`,
 * `V2 below`, `V3`, `K1 hamburger`, `K2 Fulfilment ledger`, `A1`. The rule is printed from the data,
 * never from the stage, so a rule a later filter emits shows by its own id. A roll is printed
 * short (`shortNumber`); `rollTitle` holds it as stored.
 */
export function decisionLine(decision: ElementDecision): string {
  switch (decision.stage) {
    case "perception": {
      const rolled =
        decision.rolled === undefined ? "" : `, rolled ${shortNumber(decision.rolled, 1)}`;
      return `${decision.rule} ${decision.metric} ${decision.value} < ${decision.threshold}${rolled}: ${decision.state}`;
    }
    case "viewport":
      // V2 names the side; V3, under what the page paints over it (#229), names nothing.
      return decision.side === undefined ? decision.rule : `${decision.rule} ${decision.side}`;
    case "knowledge":
      // K2 names the jargon terms it masked, K1 the pattern, K4 nothing.
      if (decision.terms !== undefined) return `${decision.rule} ${decision.terms.join(", ")}`;
      return decision.pattern === undefined
        ? decision.rule
        : `${decision.rule} ${decision.pattern}`;
    case "attention":
      return decision.rule;
  }
}

/** A decision's roll as stored, for the title of its line, when it has one. */
function rollTitle(decision: ElementDecision): string | undefined {
  return decision.stage === "perception" && decision.rolled !== undefined
    ? `rolled ${decision.rolled}`
    : undefined;
}

/**
 * The measured metrics, in the filter's metric order: `contrast 2.1, fontPx 16, targetPx 36`. A
 * narrow column breaks the line between two metrics, never inside one.
 */
function MetricsText({ metrics }: { metrics: Metrics }) {
  const measured = METRIC_NAMES.flatMap((name) => {
    const value = metrics[name];
    return value === undefined ? [] : [`${name} ${value}`];
  });
  if (measured.length === 0) return "none";
  // The space between two metrics sits outside both, so the line may break there.
  return measured.map((metric, index) => (
    <Fragment key={metric}>
      {index === 0 ? null : " "}
      <span className="whitespace-nowrap">
        {index < measured.length - 1 ? `${metric},` : metric}
      </span>
    </Fragment>
  ));
}

/**
 * A cost's dollars, to four places, and below $0.001 to two significant digits, so a billed call
 * never reads as free: `$0.0037`, `$0.000020`.
 */
export function usd(cost: Cost): string {
  const places = cost.usd === 0 ? 4 : Math.max(4, 1 - Math.floor(Math.log10(cost.usd)));
  return `$${cost.usd.toFixed(places)}`;
}

/** Milliseconds as seconds, to a tenth at most: `15.5 s`, `20 s`. */
export function formatSeconds(ms: number): string {
  return `${Math.round(ms / 100) / 10} s`;
}

/** A cost as the record holds it: `$0.0037, 1340 tokens in, 220 out`. */
export function costLine(cost: Cost): string {
  return `${usd(cost)}, ${cost.tokensIn} tokens in, ${cost.tokensOut} out`;
}

/** The element of `observation` that `action` names by its ref, when the observation holds it. */
export function targetOf(
  observation: FullObservation,
  action: Action,
): ObservedElement | undefined {
  if (!("ref" in action)) return undefined;
  return observation.elements.find((element) => element.ref === action.ref);
}

/**
 * The action a step landed and the element it named: only for a step whose action landed and names
 * a ref the observation holds. A wasted step ran nothing, and an incomplete one's action never
 * landed, so neither has one. The click point and the marked line both follow it, so the two
 * never disagree.
 */
function landing(step: RunStep): { action: Action; element: ObservedElement } | undefined {
  if ("wasted" in step || "incomplete" in step) return undefined;
  const element = targetOf(step.fullObservation, step.performedAction);
  return element === undefined ? undefined : { action: step.performedAction, element };
}

/** Whether Jev chose this step's action: the step carries the decision it drew. */
function choseByJev(step: RunStep): boolean {
  return "decision" in step && step.decision !== undefined;
}

/**
 * Whether Jev drew the element the step's action landed on, `landed`. Jev drew the proposed action,
 * which core holds to the option the decision draws, and the dice may move it: a B4 misclick lands
 * on a neighbour's ref, an element Jev did not draw. So the landed element is Jev's only when its
 * ref is the proposed action's, as it still is after a B1 double click.
 */
function drewLanded(step: RunStep, landed: ObservedElement): boolean {
  if (!choseByJev(step) || !("proposedAction" in step)) return false;
  const proposed = step.proposedAction;
  return proposed !== undefined && "ref" in proposed && proposed.ref === landed.ref;
}

/**
 * The Actor backend a run ran on, as its record shows it: `jev` when a step carries the decision
 * Jev drew, `llm` otherwise. Web does not know which model id is Jev's, so it cannot match
 * `modelIds.actor` first, as io's `backendOf` does. So any Jev run that stopped before its first
 * planned action reads `llm`, where io's gap is only such a run on an earlier Jev version. Its
 * model id, in the run detail's facts, still names Jev.
 */
export function backendOf(run: RunResult): "jev" | "llm" {
  return run.steps.some(choseByJev) ? "jev" : "llm";
}

// ---------------------------------------------------------------------------
// The screenshot
// ---------------------------------------------------------------------------

/** A stored screenshot: the file route of the step whose action it was taken after. */
type Shot = { stepIndex: number; src: string };

/** Which of the two screenshots is shown. */
type ShotKind = "observed" | "after";

const SHOT_OPTIONS = [
  { value: "observed", label: "Observed" },
  { value: "after", label: "After" },
] as const satisfies readonly { value: ShotKind; label: string }[];

/**
 * The screenshot crop's height, 180 px as `run-detail.html`'s `.shot` is, held in `--crop`, which
 * the frame's offset reads. The run detail's skeleton takes it too.
 */
export const CROP_HEIGHT = "h-(--crop) [--crop:--spacing(45)]";

// The four corner ticks of `.target` in run-detail.html: 9 px, 2 px strokes, 3 px outside the box.
const CORNERS = [
  "-top-0.75 -left-0.75 border-t-(length:--stroke-rule) border-l-(length:--stroke-rule)",
  "-top-0.75 -right-0.75 border-t-(length:--stroke-rule) border-r-(length:--stroke-rule)",
  "-bottom-0.75 -left-0.75 border-b-(length:--stroke-rule) border-l-(length:--stroke-rule)",
  "-right-0.75 -bottom-0.75 border-b-(length:--stroke-rule) border-r-(length:--stroke-rule)",
];

/**
 * Where the action landed, as `run-detail.html` draws it: four `signal` corner ticks around the
 * element's box, a `signal` crosshair at its centre, and a flag naming the action. The box is the
 * element's `bbox` over the `viewport`, in percent: the observation stores boxes in viewport
 * coordinates, the screenshot's own frame (#119). The flag hangs under the box, or over it near the
 * page's bottom, where the crop ends with the page, and toward the middle near either side, so it
 * stays inside the crop. It is for the eye alone: the image's alt, or the placeholder's label,
 * names the click.
 */
function ClickPoint({
  action,
  bbox,
  viewport,
}: {
  action: Action;
  bbox: Bbox;
  viewport: Viewport;
}) {
  const centre = (bbox.x + bbox.width / 2) / viewport.width;
  const low = (bbox.y + bbox.height) / viewport.height > 0.85;
  return (
    <div
      aria-hidden="true"
      data-click=""
      className="pointer-events-none absolute"
      style={{
        left: percent(bbox.x, viewport.width),
        top: percent(bbox.y, viewport.height),
        width: percent(bbox.width, viewport.width),
        height: percent(bbox.height, viewport.height),
      }}
    >
      {CORNERS.map((corner) => (
        <span key={corner} className={cn("absolute size-2.25 border-signal", corner)} />
      ))}
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        className="absolute top-1/2 left-1/2 size-5 -translate-x-1/2 -translate-y-1/2 text-signal"
      >
        <path d="M10 1v7M10 12v7M1 10h7M12 10h7" />
      </svg>
      <span
        className={cn(
          "absolute",
          SIGNAL_FLAG,
          low ? "bottom-full mb-3" : "top-full mt-3",
          centre < 0.25 ? "left-0" : centre > 0.75 ? "right-0" : "left-1/2 -translate-x-1/2",
        )}
      >
        {describeAction(action)}
      </span>
    </div>
  );
}

/**
 * How far the frame moves up inside the crop, as a `translate`: enough to put the click point's
 * centre mid-crop, but never past the page's top or bottom. The percentages are the frame's own
 * height. `--crop` is the crop's height with its 1 px border, top and bottom, and the frame sits
 * inside that border, so the height it moves in is `--crop` less 2 px. A page shorter than the crop
 * keeps its top.
 */
function frameOffset(bbox: Bbox, viewport: Viewport): string {
  const centre = percent(bbox.y + bbox.height / 2, viewport.height);
  const inside = "(var(--crop) - 2px)";
  return `0 min(max(calc(${inside} - 100%), calc(${inside} / 2 - ${centre})), 0px)`;
}

/**
 * One screenshot, or the reason there is none, cropped to 180 px as `run-detail.html`'s `.shot`
 * is, so the tabs under it stay in a 1280 × 720 view. Inside the crop a frame of the viewport's
 * shape holds the picture and the click point, so the point sits where it landed either way, and
 * the frame moves up to bring the point into the crop. With no point the crop shows the page's top.
 * `picked` is false for the one the control does not show, which stays in the page, hidden. The
 * crop carries `data-crop` and the frame `data-frame`, so a browser test can measure the point
 * against the crop.
 */
function ShotFigure({
  kind,
  picked,
  shot,
  caption,
  viewport,
  click,
}: {
  kind: ShotKind;
  picked: boolean;
  shot: Shot | undefined;
  caption: string;
  viewport: Viewport;
  click: { action: Action; bbox: Bbox } | undefined;
}) {
  const { width, height } = viewport;
  const marked = click === undefined ? "" : `, with ${describeAction(click.action)} marked`;
  // The placeholder says nothing until a click point is drawn on it: then it is that picture.
  const placeholder =
    click === undefined
      ? { "aria-hidden": true }
      : {
          role: "img",
          "aria-label": `${describeAction(click.action)} marked, with no screenshot behind it`,
        };
  return (
    <figure data-shot={kind} hidden={!picked} className="grid min-w-0 gap-2">
      <div
        data-crop=""
        className={cn(
          // `frameOffset` takes this 1 px border, top and bottom, off `--crop`.
          "relative overflow-hidden rounded-sm border border-line-strong",
          CROP_HEIGHT,
          shot === undefined ? "border-dashed bg-paper-sunken" : "bg-surface",
        )}
        {...(shot === undefined ? placeholder : {})}
      >
        <div
          data-frame=""
          className="absolute inset-x-0 top-0"
          style={{
            aspectRatio: `${width} / ${height}`,
            ...(click === undefined ? {} : { translate: frameOffset(click.bbox, viewport) }),
          }}
        >
          {shot === undefined ? null : (
            <img
              src={shot.src}
              alt={`Screenshot after step ${shot.stepIndex}'s action${marked}`}
              width={width}
              height={height}
              className="block size-full object-cover object-top"
            />
          )}
          {click === undefined ? null : <ClickPoint {...click} viewport={viewport} />}
        </div>
      </div>
      <figcaption className={NOTE}>{caption}</figcaption>
    </figure>
  );
}

/** Why a step has no "After" screenshot, for each kind of step that may lack one. */
function noAfterCaption(step: RunStep): string {
  if ("wasted" in step) return "No action ran";
  if ("incomplete" in step) return "The run stopped before the action landed";
  return "No screenshot was kept after this step's action";
}

/**
 * The head, the observed URL and the Observed and After control, over the two figures. The control
 * is local: it keeps its choice from step to step, and starts on Observed.
 */
function Screenshots({ run, step }: { run: RunResult; step: RunStep }) {
  const [shown, setShown] = useState<ShotKind>("observed");
  const shotOf = (stepIndex: number): Shot => ({
    stepIndex,
    src: screenshotUrl(run.id, stepIndex),
  });
  const from = observedFrom(run.steps, step.stepIndex);
  const observed = from?.screenshotPath === undefined ? undefined : from.stepIndex;
  const after = step.screenshotPath === undefined ? undefined : shotOf(step.stepIndex);
  const { viewport, url } = step.fullObservation;
  const landed = landing(step);
  return (
    <section aria-labelledby={HEADING.screenshot} className="grid min-w-0 gap-2">
      <div className="flex min-h-10 min-w-0 items-center gap-3">
        <h3 id={HEADING.screenshot} className="title text-ink">
          Screenshot
        </h3>
        <span className="min-w-0 truncate mono text-ink-3" title={url}>
          {url.replace(/^https?:\/\//, "")}
        </span>
        <div className="ml-auto shrink-0">
          <SegmentedControl
            label="Screenshot"
            options={SHOT_OPTIONS}
            value={shown}
            onValueChange={setShown}
          />
        </div>
      </div>
      <ShotFigure
        kind="observed"
        picked={shown === "observed"}
        shot={observed === undefined ? undefined : shotOf(observed)}
        caption={
          observed !== undefined
            ? `The page this step observed, as step ${observed}'s action left it`
            : from !== undefined
              ? "No screenshot was kept of the page this step observed"
              : "No screenshot of the start page"
        }
        viewport={viewport}
        click={
          landed === undefined ? undefined : { action: landed.action, bbox: landed.element.bbox }
        }
      />
      <ShotFigure
        kind="after"
        picked={shown === "after"}
        shot={after}
        caption={after === undefined ? noAfterCaption(step) : "After this step's action"}
        viewport={viewport}
        click={undefined}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// The two long lists: the model's text and the filtered elements
// ---------------------------------------------------------------------------

/**
 * The right column at most a screen high: the viewport under the top bar, less a gutter. The
 * narration takes the room it needs, up to `NARRATION_HIGH`, and the model's panel the rest: a real
 * page reads to a hundred lines and more, so its text scrolls inside the panel, not the page.
 */
const SCREEN_HIGH = "max-h-[calc(100dvh_-_var(--header-h)_-_var(--space-6))]";

/**
 * The narration at most half that column. Narration is free text, and a wasted step lists several,
 * so a long one scrolls inside its card rather than pushing the model's panel out of the column
 * and the column over the recording under it.
 */
const NARRATION_HIGH = "max-h-[calc((100dvh_-_var(--header-h)_-_var(--space-6))_/_2)]";

/**
 * The Filtered out panel, the same screen less the screenshot, its caption and the tabs over the
 * panel, about 330 px, so the left column ends near where the model's panel does. Never under
 * 240 px, so a short window still shows a few rows.
 */
const FILTERED_HIGH =
  "max-h-[max(--spacing(60),calc(100dvh_-_var(--header-h)_-_var(--space-6)_-_--spacing(82)))]";

/**
 * A box that scrolls on its own, down only, since its lines wrap: named and in the tab order, so
 * the keyboard scrolls it too (axe's `scrollable-region-focusable`), and its scrolling stops at its
 * ends, not in the page.
 */
const SCROLL_BOX = "overflow-y-auto overscroll-contain";

// ---------------------------------------------------------------------------
// The tabs: Filtered out, Dice, Jev
// ---------------------------------------------------------------------------

/** Each tab, by its Radix value. */
type Tab = "filtered" | "dice" | "jev";

// Every panel stays in the page, so a static render holds them all; the inactive ones are hidden.
const PANEL = "min-w-0 data-[state=inactive]:hidden";

/** A tab's name and, in mono, the count of what it holds: `Dice (1)`. */
function TabName({ name, count }: { name: string; count: number }) {
  return (
    <>
      {`${name} `}
      <span className="mono text-ink-3">{`(${count})`}</span>
    </>
  );
}

/**
 * One tab's panel: a section labelled by its own `<h3>`, which the tab already shows. Radix puts
 * the panel in the tab order and names it by its tab, so a panel `className` makes scroll is one
 * the keyboard reaches.
 */
function Panel({
  value,
  id,
  title,
  className,
  children,
}: {
  value: Tab;
  id: string;
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tabs.Content value={value} forceMount className={cn(PANEL, className)}>
      <section aria-labelledby={id} className="grid min-w-0 gap-3">
        <h3 id={id} className="sr-only">
          {title}
        </h3>
        {children}
      </section>
    </Tabs.Content>
  );
}

/** The elements of `observation` some rule touched: removed, degraded or renamed. */
function filteredOut(observation: FullObservation): ObservedElement[] {
  return observation.elements.filter((element) => element.decisions.length > 0);
}

/**
 * What the filter did to the observed page: the counts the model's text closes with, as facts,
 * then every element a rule touched, in stored order, with each rule. The rest of the page is in
 * the model's text, line for line.
 */
function FilteredOut({ observation }: { observation: FullObservation }) {
  // What the Actor read, by ref: core's own projection, so no masked or renamed name is worked out
  // twice.
  const read = new Map(toActorObservation(observation).elements.map((e) => [e.ref, e.name]));
  const elements = filteredOut(observation);
  return (
    <>
      <dl className={FACTS}>
        <Fact term="Hidden (A1, A3)">{observation.hiddenCount}</Fact>
        <Fact term="Below the fold (V2)">{observation.belowFoldCount}</Fact>
      </dl>
      {elements.length === 0 ? (
        <p className={NOTE}>No rule filtered an element of this page.</p>
      ) : (
        // Fixed columns whose text wraps, so the table fits the column and never scrolls sideways.
        // Separate borders, so the sticky header keeps its rule: a collapsed border belongs to the
        // table and scrolls away with the rows.
        <table className={cn(TABLE, "table-fixed border-separate border-spacing-0")}>
          <caption className="sr-only">
            Every element a rule touched on the observed page, in stored order, with each rule.
          </caption>
          {/* Ref, Role and Actor read sized to what they hold; Name takes the rest. */}
          <colgroup>
            <col className="w-14" />
            <col className="w-24" />
            <col />
            <col className="w-26" />
            <col className="w-52" />
          </colgroup>
          <thead>
            <tr>
              {["Ref", "Role", "Name", "Actor read", "Decisions"].map((h) => (
                <th key={h} scope="col" className={cn(TH, "sticky top-0 bg-paper")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="wrap-anywhere">
            {elements.map((element, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the stored order is fixed, so its index is the element's identity
              <tr key={index}>
                <td className={cn(TD, "mono")}>
                  {element.ref ?? <span className="text-ink-3">none</span>}
                </td>
                <td className={TD}>{element.role}</td>
                <td className={TD}>{element.name}</td>
                {/* What the Actor read, then the state it read it in. */}
                <td className={TD}>
                  <p>
                    {element.ref === undefined ? (
                      <span className="text-ink-3">not shown</span>
                    ) : (
                      read.get(element.ref)
                    )}
                  </p>
                  <p className="mono text-ink-3">{element.state}</p>
                </td>
                {/* The rules, each with the metric it read, then every metric measured. Most rows
                    of a long page hold one short V2 line, so the metrics sit here, not under a
                    name that already wraps. */}
                <td className={cn(TD, "mono")}>
                  <ul>
                    {element.decisions.map((decision) => (
                      <li key={decision.rule} title={rollTitle(decision)}>
                        {decisionLine(decision)}
                      </li>
                    ))}
                  </ul>
                  <p className="text-ink-3">
                    <MetricsText metrics={element.metrics} />
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

/** An action as one monospace line. */
function ActionText({ action }: { action: Action }) {
  return <span className="mono">{describeAction(action)}</span>;
}

/** Every behaviour roll, in the order rolled, or a line saying there was none. */
function Rolls({ dice }: { dice: readonly DiceRoll[] }) {
  if (dice.length === 0) return <p className={NOTE}>No dice rolled</p>;
  return (
    <table className={TABLE}>
      <caption className="pb-2 text-left body text-ink-3">
        Behaviour dice, in the order rolled. A roll fires when it is below p.
      </caption>
      <thead>
        <tr>
          {["Rule", "p", "Rolled", "Fired"].map((h) => (
            <th key={h} scope="col" className={TH}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="mono">
        {dice.map((roll) => (
          <tr key={roll.rule}>
            <td className={TD}>{roll.rule}</td>
            <td className={TD}>{roll.p}</td>
            {/* Short, and on the side of p it fell, so the row still says why it fired. */}
            <td className={TD} title={String(roll.rolled)}>
              {shortNumber(roll.rolled, roll.p, 1)}
            </td>
            <td className={TD}>{roll.fired ? "fired" : "not fired"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The step's actions: on a wasted step the refused answers, else the action proposed and the one
 * the dice made of it, or a line saying none was planned.
 */
function Actions({ step }: { step: RunStep }) {
  if ("wasted" in step) {
    return (
      <>
        <h4 className="label text-ink">Refs the Actor was not shown</h4>
        <p className={NOTE}>No action ran: each answer named a ref the Actor was not shown.</p>
        <ol className="flex list-decimal flex-col gap-1 ps-5 body">
          {step.rejected.map((answer, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the answers keep the order given, so the index is the answer's identity
            <li key={index}>
              <ActionText action={answer.action} />
            </li>
          ))}
        </ol>
        <Details>
          <Detail term="Cost">
            <span className="mono">{costLine(step.cost)}</span>
          </Detail>
        </Details>
      </>
    );
  }
  // Core stores the two actions and the dice together or not at all.
  const { proposedAction, performedAction, cost } = step;
  if (proposedAction === undefined || performedAction === undefined) {
    return <p className="body">The run stopped before an action was planned</p>;
  }
  const landed = !("incomplete" in step);
  return (
    <>
      {landed ? null : (
        <p className="body">The run stopped after this action was planned: it never landed.</p>
      )}
      <Details>
        <Detail term="Proposed">
          <ActionText action={proposedAction} />
        </Detail>
        {/* What the dice turned the proposal into: performed only if the action landed. */}
        <Detail term={landed ? "Performed" : "Planned"}>
          <ActionText action={performedAction} />
        </Detail>
        {cost === undefined ? null : (
          <Detail term="Cost">
            <span className="mono">{costLine(cost)}</span>
          </Detail>
        )}
      </Details>
    </>
  );
}

/**
 * The tabs under the screenshot, styled as `.wf-seg`: Filtered out, Dice, and Jev on a step Jev
 * chose, beside its confidence. Jev opens first on such a step, Filtered out on any other. A tab
 * picked keeps from step to step while the step has it; Jev falls back to the default on a step
 * Jev did not choose.
 */
function Evidence({ run, step }: { run: RunResult; step: RunStep }) {
  const [picked, setPicked] = useState<Tab | undefined>(undefined);
  const decision = "decision" in step ? step.decision : undefined;
  const fallback: Tab = decision === undefined ? "filtered" : "jev";
  const tab =
    picked === undefined || (picked === "jev" && decision === undefined) ? fallback : picked;
  // A wasted step ran no action, so it rolled no die; nor did a step cut short before planning.
  const dice = "wasted" in step ? [] : (step.dice ?? []);
  return (
    <Tabs.Root
      value={tab}
      // The values are the triggers' own, so a change is always a `Tab`.
      onValueChange={(next) => setPicked(next as Tab)}
      className="grid min-w-0 gap-3"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Tabs.List aria-label="Step evidence" className={SEGMENT_GROUP}>
          <Tabs.Trigger value="filtered" className={segmentItem()}>
            <TabName name="Filtered out" count={filteredOut(step.fullObservation).length} />
          </Tabs.Trigger>
          <Tabs.Trigger value="dice" className={segmentItem()}>
            <TabName name="Dice" count={dice.length} />
          </Tabs.Trigger>
          {decision === undefined ? null : (
            <Tabs.Trigger value="jev" className={segmentItem()}>
              Jev
            </Tabs.Trigger>
          )}
        </Tabs.List>
        {decision === undefined ? null : (
          <div className="ml-auto">
            <ConfidenceNote
              confidence={decision.confidence}
              persona={personaLabel(run.profileId)}
            />
          </div>
        )}
      </div>
      {/* Keyed by step, as the model's text is, so each step's table opens at its top and not
          where the last step's was scrolled to. The tab picked lives on the root, so it stays. */}
      <Panel
        key={step.stepIndex}
        value="filtered"
        id={HEADING.filtered}
        title="Filtered out"
        className={cn(FILTERED_HIGH, SCROLL_BOX)}
      >
        <FilteredOut observation={step.fullObservation} />
      </Panel>
      <Panel value="dice" id={HEADING.dice} title="Dice">
        <Actions step={step} />
        {/* The rolls the tab counts, or a line saying none was rolled, so the two always agree. */}
        <Rolls dice={dice} />
      </Panel>
      {decision === undefined ? null : (
        <Panel value="jev" id={HEADING.jev} title="Jev">
          <DecisionPanel decision={decision} />
        </Panel>
      )}
    </Tabs.Root>
  );
}

// ---------------------------------------------------------------------------
// The narration, and what the model read
// ---------------------------------------------------------------------------

/**
 * The meta over the model's text, in the text's own terms: the elements shown, then
 * `hiddenCount` and `belowFoldCount` only when above 0, as the text prints its own lines for them.
 * `5 shown · 2 more below`.
 */
export function modelReadMeta(
  shown: number,
  observation: Pick<FullObservation, "hiddenCount" | "belowFoldCount">,
): string {
  const { hiddenCount, belowFoldCount } = observation;
  return [
    `${shown} shown`,
    ...(hiddenCount > 0 ? [`${hiddenCount} more not shown`] : []),
    ...(belowFoldCount > 0 ? [`${belowFoldCount} more below`] : []),
  ].join(" · ");
}

/**
 * The page part of the Actor's prompt at this step, exactly as stored, one numbered line per line
 * of the text: joined with line breaks, the lines are the stored text, byte for byte. The meta
 * counts in the text's own terms, so the two never disagree. What perception removed is counted
 * nowhere the model reads (#118), so not here either: Filtered out holds it.
 *
 * The line of the element the step's action landed on carries a mark, found as the click point is:
 * "drawn" when Jev drew that element, the performed action's type otherwise, so a click a B4
 * misclick moved to a neighbour reads "click".
 *
 * The panel takes what the right column, at most `SCREEN_HIGH`, leaves under the narration, its
 * title and closing note fixed and the text scrolling between them. The text opens on the marked
 * line, centred, since that line is what the step did, or at its top when no line is marked. The
 * replay draws a new panel for each step, so each step opens this way.
 */
function ModelRead({ step }: { step: RunStep }) {
  const { fullObservation: observation, actorObservationText: text } = step;
  const shown = observation.elements.filter((element) => element.ref !== undefined).length;
  const landed = landing(step);
  const mark =
    landed === undefined
      ? undefined
      : drewLanded(step, landed.element)
        ? "drawn"
        : landed.action.type;
  const opening = landed === undefined ? undefined : `[${landed.element.ref}]`;
  const scroller = useRef<HTMLOListElement>(null);
  // Before the first paint, so the text never shows at its top and then jumps. The box is the
  // marked line's offset parent, so the line's `offsetTop` is its place in the text.
  useLayoutEffect(() => {
    const box = scroller.current;
    const line = box?.querySelector<HTMLElement>("[data-marked]");
    if (box && line) box.scrollTop = line.offsetTop - (box.clientHeight - line.offsetHeight) / 2;
  }, []);
  return (
    <section
      aria-labelledby={HEADING.modelRead}
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-line bg-surface"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2">
        <h3 id={HEADING.modelRead} className="title text-ink">
          What the model read
        </h3>
        <p className="ml-auto mono text-ink-3">{modelReadMeta(shown, observation)}</p>
      </div>
      <ol
        ref={scroller}
        aria-label="The model's text, line by line"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll box takes focus, so the keyboard scrolls it too
        tabIndex={0}
        // The panel clips its corners, so the focus ring is drawn inside the box.
        className={cn(
          "relative min-h-0 bg-paper-sunken py-2 mono focus-visible:-outline-offset-2",
          SCROLL_BOX,
        )}
      >
        {text.split("\n").map((line, index) => {
          const marked = opening !== undefined && line.startsWith(opening);
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: the stored text is fixed, so a line's index is its identity
              key={index}
              data-marked={marked ? "" : undefined}
              className={cn(
                "grid grid-cols-[--spacing(8)_minmax(0,1fr)_auto] gap-x-3 border-y pr-3",
                marked ? "border-line bg-surface" : "border-transparent",
              )}
            >
              <span className="text-right text-ink-3">{index + 1}</span>
              <code className="whitespace-pre-wrap wrap-anywhere text-ink">{line}</code>
              {marked ? <Mark>{mark}</Mark> : null}
            </li>
          );
        })}
      </ol>
      <p className="border-t border-line px-4 py-2 body text-ink-3">
        The page part of the prompt, as stored.
      </p>
    </section>
  );
}

/** One narration, or a line saying there is none: a Jev Actor writes none. */
function NarrationText({ text, jev }: { text: string; jev: boolean }) {
  if (text === "")
    return <p className={NOTE}>{jev ? "Jev writes no narration" : "No narration"}</p>;
  return <p className="body whitespace-pre-line text-ink">{text}</p>;
}

/**
 * The bubble's tail, pointing left at the 48 px avatar's centre, as the race lane's points up at
 * its avatar: a square turned 45°, its two outer sides in the bubble's outline, its ground over the
 * bubble's edge, 60 px in, past the avatar and the gap. It hangs from the row, not the bubble,
 * which scrolls and would clip it, and as a positioned box it paints over the bubble's edge.
 */
const TAIL =
  "before:absolute before:top-5 before:left-14 before:size-2 before:rotate-45 before:border-b-(length:--stroke-rule) before:border-l-(length:--stroke-rule) before:border-dashed before:border-(--p) before:bg-surface";

/**
 * The step's narration, or each refused answer's on a wasted step, in a card at the top of the right
 * column (#239). It is a speech bubble beside the persona's avatar, as on the race lane, so it reads
 * as the persona speaking. The outline and the tail take the persona's fill, `--p`, which the run
 * detail sets on its root: colour means who. They are dashed, since narration is a hypothesis, and
 * never `signal`, which marks only a measurement (`docs/DESIGN.md`, Principles 2 and 3). The avatar
 * is for the eye alone, since the header names the persona. A persona that is not bundled has no
 * avatar, so its bubble has no tail. The card is at most `NARRATION_HIGH`, and scrolls past it.
 *
 * Whether Jev wrote it is the run's backend, as its `backend` fact names it, so a Jev run's step that
 * was cut short before Jev was asked still says Jev writes none. That line keeps the card, so the
 * column does not jump from step to step.
 */
function Narration({ run, step }: { run: RunResult; step: RunStep }) {
  const jev = backendOf(run) === "jev";
  const profile = bundledProfiles.find((bundled) => bundled.id === run.profileId);
  return (
    <div
      className={cn(
        "relative flex min-w-0 shrink-0 items-start gap-3",
        profile === undefined ? null : TAIL,
      )}
    >
      {profile === undefined ? null : (
        <div aria-hidden="true" className="shrink-0">
          <PersonaAvatar profile={profile} className="size-12" />
        </div>
      )}
      <section
        aria-labelledby={HEADING.narration}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll box takes focus, so the keyboard scrolls it too
        tabIndex={0}
        className={cn(
          "grid min-w-0 flex-1 content-start gap-2 rounded-md border-(length:--stroke-rule) border-dashed border-(--p) bg-surface px-4 py-3",
          NARRATION_HIGH,
          SCROLL_BOX,
        )}
      >
        <h3 id={HEADING.narration} className="mono-label text-ink-3">
          {NARRATION_LABEL}
        </h3>
        <StepNarration step={step} jev={jev} />
      </section>
    </div>
  );
}

/**
 * A step's narration as the card prints it: its words, or on a wasted step each refused answer's,
 * after the action it named. Run detail's narration list prints every step of the run with it
 * (#197), so the words read the same in both.
 */
export function StepNarration({ step, jev }: { step: RunStep; jev: boolean }) {
  if (!("wasted" in step)) return <NarrationText text={step.narration} jev={jev} />;
  return (
    <ol className="flex flex-col gap-3">
      {step.rejected.map((answer, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the answers keep the order given, so the index is the answer's identity
        <li key={index} className="flex flex-col gap-1">
          <p className="mono text-ink-3">
            {`Answer ${index + 1}, not shown: ${describeAction(answer.action)}`}
          </p>
          <NarrationText text={answer.narration} jev={jev} />
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------

/** The replay's two columns, 640 px and the rest. The run detail's skeleton takes them too. */
export const REPLAY_COLUMNS = "grid-cols-[--spacing(160)_minmax(0,1fr)]";

/**
 * One step of `run` in `REPLAY_COLUMNS`: the screenshot and its tabs on the left, the narration
 * and what the model read on the right. `run` supplies the screenshot routes, the earlier steps
 * and the persona: the avatar beside the narration, and whose the confidence is not.
 */
export function StepReplay({ run, step }: { run: RunResult; step: RunStep }) {
  return (
    <div className={cn("grid items-start gap-(--space-5)", REPLAY_COLUMNS)}>
      <div className="grid min-w-0 content-start gap-(--space-3)">
        <Screenshots run={run} step={step} />
        <Evidence run={run} step={step} />
      </div>
      <div className={cn("flex min-w-0 flex-col gap-(--space-4)", SCREEN_HIGH)}>
        <Narration run={run} step={step} />
        {/* Keyed by step, so each step's text opens on its own marked line. */}
        <ModelRead key={step.stepIndex} step={step} />
      </div>
    </div>
  );
}
