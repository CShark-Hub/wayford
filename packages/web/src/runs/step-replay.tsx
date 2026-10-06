/**
 * One stored step, replayed in five sections, in this order: the two screenshots, the Actor's view,
 * the evidence, the action and the narration (`docs/PLAN.md` F7 AC3). A step Jev chose has a sixth,
 * its decision, before the action (`decision-panel.tsx`). Nothing is worked out here
 * that the record does not hold: the Actor's view is the stored text, what the Actor read of each
 * element is core's `toActorObservation`, and every decision prints the rule its data names.
 *
 * The narration is the model's account of its own answer, written as it answered, and so
 * interpretation, never measurement (`AGENTS.md`, "Traps"). It has a section of its own, the last,
 * and no other section prints it: a wasted step's refused answers are listed in the Action section
 * by what they did, and their narrations go under Narration with the rest.
 *
 * The Actor's view and the evidence describe the page the step observed. A step's own screenshot is
 * taken after its action landed, so that page is the one the "Observed" screenshot shows, which
 * `observedFrom` finds; the step's own is the "After" one.
 */
import {
  type Action,
  type Cost,
  type DiceRoll,
  type ElementDecision,
  type FullObservation,
  METRIC_NAMES,
  type Metrics,
  type RunResult,
  type RunStep,
  toActorObservation,
  type Viewport,
} from "@wayford/core";
import type { ReactNode } from "react";
import { screenshotUrl } from "../api/runs.js";
import { DecisionPanel } from "./decision-panel.js";
import { Detail, Details, NOTE, TABLE, TD, TH } from "./details.js";
import { describeAction, observedFrom } from "./replay.js";

/**
 * The id of each section's `<h3>`. One replay is drawn per page, so fixed ids are unique, and the
 * markup depends on the step alone.
 */
const HEADING = {
  screenshots: "step-screenshots",
  actorView: "step-actor-view",
  evidence: "step-evidence",
  decision: "step-decision",
  action: "step-action",
  narration: "step-narration",
} as const;

const SECTION = "flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground";
const H3 = "text-sm font-semibold";

/**
 * One decision as a line of the evidence: `P1 contrast 2.1 < 3, rolled 0.42: degraded`,
 * `V2 below`, `K1 hamburger`, `K2 Fulfilment ledger`, `A1`. The rule is printed from the data,
 * never from the stage, so a rule a later filter emits shows by its own id.
 */
export function decisionLine(decision: ElementDecision): string {
  switch (decision.stage) {
    case "perception": {
      const rolled = decision.rolled === undefined ? "" : `, rolled ${decision.rolled}`;
      return `${decision.rule} ${decision.metric} ${decision.value} < ${decision.threshold}${rolled}: ${decision.state}`;
    }
    case "viewport":
      return `${decision.rule} ${decision.side}`;
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

/** The measured metrics, in the filter's metric order: `contrast 2.1, fontPx 16, targetPx 36`. */
function metricsLine(metrics: Metrics): string {
  const measured = METRIC_NAMES.flatMap((name) => {
    const value = metrics[name];
    return value === undefined ? [] : [`${name} ${value}`];
  });
  return measured.length > 0 ? measured.join(", ") : "none";
}

/**
 * A cost's dollars, to four places, and below $0.001 to two significant digits, so a billed call
 * never reads as free: `$0.0037`, `$0.000020`.
 */
export function usd(cost: Cost): string {
  const places = cost.usd === 0 ? 4 : Math.max(4, 1 - Math.floor(Math.log10(cost.usd)));
  return `$${cost.usd.toFixed(places)}`;
}

/** A cost as the record holds it: `$0.0037, 1340 tokens in, 220 out`. */
export function costLine(cost: Cost): string {
  return `${usd(cost)}, ${cost.tokensIn} tokens in, ${cost.tokensOut} out`;
}

/** One section of the replay, labelled by its own `<h3>`. */
function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={SECTION}>
      <h3 id={id} className={H3}>
        {title}
      </h3>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Screenshots
// ---------------------------------------------------------------------------

/** A stored screenshot: the file route of the step whose action it was taken after. */
type Shot = { stepIndex: number; src: string };

/**
 * One screenshot, or the reason there is none. The box keeps the viewport's shape either way, so
 * the two figures stay side by side at the same size.
 */
function ShotFigure({
  label,
  shot,
  caption,
  viewport,
}: {
  label: string;
  shot: Shot | undefined;
  caption: string;
  viewport: Viewport;
}) {
  const { width, height } = viewport;
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <h4 className="text-xs font-medium">{label}</h4>
      {shot === undefined ? (
        <div
          aria-hidden="true"
          className="w-full rounded-md border border-dashed"
          style={{ aspectRatio: `${width} / ${height}` }}
        />
      ) : (
        <img
          src={shot.src}
          alt={`Screenshot after step ${shot.stepIndex}'s action`}
          width={width}
          height={height}
          className="h-auto w-full rounded-md border"
        />
      )}
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

function Screenshots({ run, step }: { run: RunResult; step: RunStep }) {
  const shotOf = (stepIndex: number): Shot => ({
    stepIndex,
    src: screenshotUrl(run.id, stepIndex),
  });
  const from = observedFrom(run.steps, step.stepIndex);
  const observed = from?.screenshotPath === undefined ? undefined : from.stepIndex;
  const after = step.screenshotPath === undefined ? undefined : shotOf(step.stepIndex);
  const { viewport } = step.fullObservation;
  return (
    <Section id={HEADING.screenshots} title="Screenshots">
      <div className="grid gap-4 sm:grid-cols-2">
        <ShotFigure
          label="Observed"
          shot={observed === undefined ? undefined : shotOf(observed)}
          caption={
            observed !== undefined
              ? `The page this step observed, as step ${observed}'s action left it`
              : from !== undefined
                ? "No screenshot was kept of the page this step observed"
                : "No screenshot of the start page"
          }
          viewport={viewport}
        />
        <ShotFigure
          label="After"
          shot={after}
          caption={after === undefined ? noAfterCaption(step) : "After this step's action"}
          viewport={viewport}
        />
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// The Actor's view and the evidence
// ---------------------------------------------------------------------------

function ActorView({ text }: { text: string }) {
  return (
    <Section id={HEADING.actorView} title="Actor's view">
      <p className={NOTE}>
        The page part of the Actor's prompt at this step, exactly as stored. The goal, the history,
        the instructions and any retry sent with it are not stored on the step.
      </p>
      <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 font-mono text-xs leading-relaxed">
        {text}
      </pre>
    </Section>
  );
}

function Evidence({ observation }: { observation: FullObservation }) {
  // What the Actor read, by ref: core's own projection, so no masked or renamed name is worked out
  // twice.
  const read = new Map(toActorObservation(observation).elements.map((e) => [e.ref, e.name]));
  return (
    <Section id={HEADING.evidence} title="Evidence">
      <Details>
        <Detail term="URL">
          <span className="font-mono text-xs break-all">{observation.url}</span>
        </Detail>
        <Detail term="Title">{observation.title}</Detail>
        <Detail term="Hidden (A1, A3)">
          <span className="font-mono">{observation.hiddenCount}</span>
        </Detail>
        <Detail term="Below the fold (V2)">
          <span className="font-mono">{observation.belowFoldCount}</span>
        </Detail>
      </Details>
      <div className="overflow-x-auto">
        <table className={TABLE}>
          <caption className="pb-2 text-left text-xs text-muted-foreground">
            Every element the filter looked at on the observed page, in stored order, with each rule
            it failed.
          </caption>
          <thead>
            <tr>
              {["Ref", "Role", "Name", "State", "Actor read", "Metrics", "Decisions"].map((h) => (
                <th key={h} scope="col" className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {observation.elements.map((element, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the stored order is fixed, so its index is the element's identity
              <tr key={index}>
                <td className={`${TD} font-mono`}>
                  {element.ref ?? <span className="text-muted-foreground">none</span>}
                </td>
                <td className={TD}>{element.role}</td>
                <td className={TD}>{element.name}</td>
                <td className={TD}>{element.state}</td>
                <td className={TD}>
                  {element.ref === undefined ? (
                    <span className="text-muted-foreground">not shown</span>
                  ) : (
                    read.get(element.ref)
                  )}
                </td>
                <td className={`${TD} font-mono`}>{metricsLine(element.metrics)}</td>
                <td className={`${TD} font-mono`}>
                  {element.decisions.length === 0 ? (
                    <span className="text-muted-foreground">none</span>
                  ) : (
                    <ul>
                      {element.decisions.map((decision) => (
                        <li key={decision.rule}>{decisionLine(decision)}</li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// The action
// ---------------------------------------------------------------------------

/** An action as one monospace line. */
function ActionText({ action }: { action: Action }) {
  return <span className="font-mono">{describeAction(action)}</span>;
}

/** Every behaviour roll, in the order rolled, or a line saying there was none. */
function Dice({ dice }: { dice: readonly DiceRoll[] }) {
  if (dice.length === 0) return <p className={NOTE}>No dice rolled</p>;
  return (
    <table className={TABLE}>
      <caption className="pb-2 text-left text-xs text-muted-foreground">
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
      <tbody className="font-mono">
        {dice.map((roll) => (
          <tr key={roll.rule}>
            <td className={TD}>{roll.rule}</td>
            <td className={TD}>{roll.p}</td>
            <td className={TD}>{roll.rolled}</td>
            <td className={TD}>{roll.fired ? "fired" : "not fired"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** What the step did: the action proposed and performed with its dice, or why none ran. */
function ActionSection({ step }: { step: RunStep }) {
  return (
    <Section id={HEADING.action} title="Action">
      <ActionBody step={step} />
    </Section>
  );
}

function ActionBody({ step }: { step: RunStep }) {
  if ("wasted" in step) {
    return (
      <>
        <h4 className="text-xs font-medium">Refs the Actor was not shown</h4>
        <p className={NOTE}>No action ran: each answer named a ref the Actor was not shown.</p>
        <ol className="flex list-decimal flex-col gap-1 ps-5 text-sm">
          {step.rejected.map((answer, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the answers keep the order given, so the index is the answer's identity
            <li key={index}>
              <ActionText action={answer.action} />
            </li>
          ))}
        </ol>
        <Details>
          <Detail term="Cost">
            <span className="font-mono">{costLine(step.cost)}</span>
          </Detail>
        </Details>
      </>
    );
  }
  const { proposedAction, performedAction, dice, cost } = step;
  if (proposedAction === undefined || performedAction === undefined || dice === undefined) {
    return <p className="text-sm">The run stopped before an action was planned</p>;
  }
  const landed = !("incomplete" in step);
  return (
    <>
      {landed ? null : (
        <p className="text-sm">The run stopped after this action was planned: it never landed.</p>
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
            <span className="font-mono">{costLine(cost)}</span>
          </Detail>
        )}
      </Details>
      <Dice dice={dice} />
    </>
  );
}

// ---------------------------------------------------------------------------
// The narration
// ---------------------------------------------------------------------------

/** One narration, or a line saying there is none (a Jev Actor writes none). */
function NarrationText({ text }: { text: string }) {
  return text === "" ? (
    <p className={NOTE}>No narration</p>
  ) : (
    <p className="text-sm whitespace-pre-line">{text}</p>
  );
}

function Narration({ step }: { step: RunStep }) {
  return (
    <Section id={HEADING.narration} title="Narration">
      <p className={NOTE}>
        The model's own account, written as it answered: interpretation, not measurement.
      </p>
      <div className="rounded-md border border-dashed p-3">
        {"wasted" in step ? (
          <ol className="flex flex-col gap-3">
            {step.rejected.map((answer, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the answers keep the order given, so the index is the answer's identity
              <li key={index} className="flex flex-col gap-1">
                <p className="font-mono text-xs text-muted-foreground">
                  {`Answer ${index + 1}, not shown: ${describeAction(answer.action)}`}
                </p>
                <NarrationText text={answer.narration} />
              </li>
            ))}
          </ol>
        ) : (
          <NarrationText text={step.narration} />
        )}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------

/**
 * One step of `run` in its five sections, six on a step Jev chose. `run` supplies the screenshot
 * routes and earlier steps.
 */
export function StepReplay({ run, step }: { run: RunResult; step: RunStep }) {
  return (
    <div className="flex flex-col gap-4">
      <Screenshots run={run} step={step} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ActorView text={step.actorObservationText} />
        <Evidence observation={step.fullObservation} />
      </div>
      {"decision" in step && step.decision !== undefined ? (
        <Section id={HEADING.decision} title="Decision">
          <DecisionPanel decision={step.decision} />
        </Section>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <ActionSection step={step} />
        <Narration step={step} />
      </div>
    </div>
  );
}
