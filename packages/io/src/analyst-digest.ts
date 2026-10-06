/**
 * `analystCase`: the one user message the Analyst reads, built in code
 * (`docs/specs/2026-10-05-s4-04-analyst.md`, "io: the case the Analyst reads").
 *
 * The Analyst sees every run of every persona at once (F8 AC4), so the case holds them all, in
 * five sections: the goal, Scout's line, the per-persona numbers, the findings to recommend for,
 * and the runs. Code decides what is true; the model only words it. Everything here is read off
 * stored data: the numbers and findings code computed, and per step the page, the action that ran
 * and the narration. The model is never asked to count or to grade.
 *
 * Each action names its element by the name on the page, looked up by ref in the step's own
 * evidence. When the Actor read that name masked or renamed, the line gives both, the real one
 * first, so a hypothesis can say what the agent was shown without the case explaining why. When
 * the behaviour dice changed the planned action, the line says so, so a double click the dice made
 * is not read as the agent's choice.
 *
 * Left out on purpose: Jev's options, probabilities and confidence (ADR 0001, decision 6). A Jev
 * run has no narration, and its header says so. The personas' descriptions are left out too: the
 * case gives labels and numbers, never traits.
 *
 * Page text and narration are untrusted: each is quoted on its own line, so none can write a line
 * of its own into the case. Pure: the text depends on the input alone.
 */
import {
  type Action,
  type FullObservation,
  type Observation,
  type PersonaResult,
  type ReportBackend,
  type RunResult,
  type RunStep,
  type ScoutLine,
  type Task,
  toActorObservation,
} from "@wayford/core";
import type { Draft } from "./analyst-closures.js";
import { labelOf, NONE, plural, scoutLine, seconds } from "./analyst-text.js";

export function analystCase(input: {
  task: Task;
  scout: ScoutLine;
  personas: readonly PersonaResult[];
  drafts: readonly Draft[];
  runs: readonly RunResult[];
  /** The report's backend, which every run of `runs` ran on: `selectRuns` chose them by it. */
  backend: ReportBackend;
}): string {
  const { task, scout, personas, drafts, runs, backend } = input;
  const sections = [
    ["Goal", oneLine(task.goal)],
    // Scout's line worded as `reportText` words it (`scoutLine`): context, not a verdict.
    ["Baseline: Scout, a run with full access to the page", scoutLine(scout)],
    ["Personas", ...personas.map(personaLine)],
    ["Findings computed from the page", ...findingLines(drafts)],
    ["Runs", ...runs.flatMap((run) => runLines(run, backend))],
  ];
  return `${sections.map(([heading, ...lines]) => [`## ${heading}`, ...lines].join("\n")).join("\n\n")}\n`;
}

/** A persona by its label and id, `Ada (prof_ada)`; an id with no bundled profile alone. */
function personaName(profileId: string): string {
  const label = labelOf(profileId);
  return label === profileId ? profileId : `${label} (${profileId})`;
}

/** One persona's numbers, as code counted them. No route table reads "—", never 0. */
function personaLine(result: PersonaResult): string {
  const { runs, successes, errors, routeOpenSeeds, medianSuccessMs } = result;
  const open =
    routeOpenSeeds === null
      ? `route open: ${NONE}`
      : `a route open in ${routeOpenSeeds} of ${plural(runs, "seed")}`;
  const median = medianSuccessMs === null ? NONE : seconds(medianSuccessMs);
  return `${personaName(result.profileId)}: ${plural(runs, "run")}, ${successes} got through, ${plural(errors, "error")}, ${open}, median time to success ${median}`;
}

/** Each draft by the key the answer names it by, its persona, title, rules and detail. */
function findingLines(drafts: readonly Draft[]) {
  if (drafts.length === 0) return ["none"];
  return drafts.flatMap(({ key, finding }) => {
    const persona = finding.personaIds.map(labelOf).join(", ");
    // The title and detail are code's, but quote an element's name from the page.
    return [
      `${key}, ${persona}: ${oneLine(finding.title)}`,
      `  rules: ${finding.basis.map((entry) => entry.rule).join(", ")}`,
      `  detail: ${oneLine(finding.detail)}`,
    ];
  });
}

/** A run's header, then one line per step. */
function runLines(run: RunResult, backend: ReportBackend): string[] {
  const header = `run ${run.id}: ${personaName(run.profileId)}, seed ${run.seed}, ${run.outcome}, ${plural(run.steps.length, "step")}, ${seconds(run.durationMs)}`;
  const jev = backend === "jev" ? ". Jev run: no narration" : "";
  return [`${header}${jev}`, ...run.steps.map((step) => `  ${stepLine(step)}`)];
}

/**
 * `step <i> on <path>: <what happened>`, then the narration, quoted, when there is one. Never the
 * step's `decision`: Jev's options, probabilities and confidence stay out.
 */
function stepLine(step: RunStep): string {
  const where = `step ${step.stepIndex} on ${new URL(step.urlBefore).pathname}`;
  const narration = step.narration === "" ? "" : `; narration: ${quote(step.narration)}`;
  return `${where}: ${happened(step)}${narration}`;
}

/** The action that ran, or why none did. */
function happened(step: RunStep): string {
  if ("wasted" in step) return "no action: every answer named an element not on the page";
  const { performedAction, proposedAction } = step;
  if (performedAction === undefined) return "no action: the run stopped here";
  const page: Page = {
    full: step.fullObservation,
    read: toActorObservation(step.fullObservation),
  };
  const performed = actionText(performedAction, page);
  // `RunStep` allows a changed action only beside a fired roll, which names the rule that did it.
  const fired = (step.dice ?? []).filter((roll) => roll.fired).map((roll) => roll.rule);
  const planned = proposedAction === undefined ? performed : actionText(proposedAction, page);
  const changed =
    planned === performed ? "" : ` (planned as ${planned}, changed by ${fired.join(", ")})`;
  // An incomplete step that planned an action: the run ended before it was known to land.
  const stopped = "incomplete" in step ? " (the run stopped during this step)" : "";
  return `${performed}${changed}${stopped}`;
}

/** A step's page twice: as recorded, with the names on the page, and as the Actor read it. */
interface Page {
  full: FullObservation;
  read: Observation;
}

function actionText(action: Action, page: Page): string {
  switch (action.type) {
    case "click":
    case "doubleClick":
      return `${action.type} ${elementText(action.ref, page)}`;
    case "type":
      return `type ${quote(action.text)} into ${elementText(action.ref, page)}`;
    case "scroll":
      return `scroll ${action.direction}`;
    case "wait":
      return `wait ${action.ms} ms`;
    case "back":
    case "giveUp":
      return action.type;
  }
}

/**
 * The element a ref names, by its name on the page; then the name the Actor read under that ref
 * (`toActorObservation`), when that differs: its renamed name, or its masked one. A ref the
 * evidence lacks is given as the ref.
 */
function elementText(ref: string, { full, read }: Page): string {
  const element = full.elements.find((e) => e.ref === ref);
  if (element === undefined) return `[${ref}]`;
  const readAs = read.elements.find((e) => e.ref === ref)?.name;
  return readAs === undefined || readAs === element.name
    ? quote(element.name)
    : `${quote(element.name)} (read as ${quote(readAs)})`;
}

/**
 * Untrusted text, quoted on one line: every run of control characters and line or paragraph
 * separators becomes one space, as the Actor's observation does it, then JSON quoting.
 */
function quote(text: string): string {
  return JSON.stringify(oneLine(text));
}

function oneLine(text: string): string {
  return text.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ");
}
