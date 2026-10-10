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
 * On a goal with no route table, code writes no closure findings (ADR 0003 D3), so a run that did
 * not get through ends with cut lines instead (`s4-11`): each element a run that got through, or
 * Scout, used on a page this run stood on, which a perception or attention rule kept from this
 * run's agent there, with the steps and the rule's clause. Without them the case shows an agent
 * that never clicked a link it was never given, and the model reads that as wayfinding.
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
  decisionState,
  type ElementDecision,
  type FullObservation,
  type Observation,
  type PathStep,
  type PersonaResult,
  type ReportBackend,
  type RunResult,
  type RunStep,
  type ScoutLine,
  type Task,
  toActorObservation,
} from "@wayford/core";
import { profileFixtures } from "@wayford/core/fixtures";
import { clauseOf, type Draft } from "./analyst-closures.js";
import { labelOf, NONE, plural, scoutLine, seconds } from "./analyst-text.js";

export function analystCase(input: {
  task: Task;
  scout: ScoutLine;
  personas: readonly PersonaResult[];
  drafts: readonly Draft[];
  runs: readonly RunResult[];
  /** The report's backend, which every run of `runs` ran on: `selectRuns` chose them by it. */
  backend: ReportBackend;
  /** Scout's shortest path, when it reached the goal: what it used counts for the cut lines. */
  scoutPath: readonly PathStep[] | undefined;
}): string {
  const { task, scout, personas, drafts, runs, backend, scoutPath } = input;
  const used = usedElements(runs, scoutPath);
  // A persona with a route table has its cuts as closure findings already.
  const routeTable = new Set(
    personas.filter((p) => p.routeOpenSeeds !== null).map((p) => p.profileId),
  );
  const cutsOf = (run: RunResult) => (routeTable.has(run.profileId) ? [] : cutLines(run, used));
  const sections = [
    ["Goal", oneLine(task.goal)],
    // Scout's line worded as `reportText` words it (`scoutLine`): context, not a verdict.
    ["Baseline: Scout, a run with full access to the page", scoutLine(scout)],
    ["Personas", ...personas.map(personaLine)],
    ["Findings computed from the page", ...findingLines(drafts)],
    ["Runs", ...runs.flatMap((run) => [...runLines(run, backend), ...cutsOf(run)])],
  ];
  return `${sections.map(([heading, ...lines]) => [`## ${heading}`, ...lines].join("\n")).join("\n\n")}\n`;
}

/** A persona by its label and id, `Ada (prof_ada)`; an id with no bundled profile alone. */
function personaName(profileId: string): string {
  const label = labelOf(profileId);
  return label === profileId ? profileId : `${label} (${profileId})`;
}

/**
 * One persona's numbers, as code counted them. No route table reads "—", never 0. The median is
 * the simulated one (B3): the wall-clock median measures the tool and the machine, not the persona,
 * so the case leaves it out. A report stored before s2-09 has none and reads "—".
 */
function personaLine(result: PersonaResult): string {
  const { runs, successes, errors, routeOpenSeeds } = result;
  const open =
    routeOpenSeeds === null
      ? `route open: ${NONE}`
      : `a route open in ${routeOpenSeeds} of ${plural(runs, "seed")}`;
  const median = seconds(result.medianSimulatedMs);
  return `${personaName(result.profileId)}: ${plural(runs, "run")}, ${successes} got through, ${plural(errors, "error")}, ${open}, median simulated time to success ${median}`;
}

/**
 * Each draft by the key the answer names it by, its persona, title, rules and detail. A
 * measurement draft is axe-core's, which concerns the page and names no persona: its line says so
 * in place of a persona. No rule reads `none`.
 */
function findingLines(drafts: readonly Draft[]) {
  if (drafts.length === 0) return ["none"];
  return drafts.flatMap(({ key, finding }) => {
    const about =
      finding.type === "measurement"
        ? "axe-core measurement on the page"
        : finding.personaIds.map(labelOf).join(", ");
    const rules = finding.basis.map((entry) => entry.rule).join(", ");
    // The title and detail are code's, but quote an element's name from the page.
    return [
      `${key}, ${about}: ${oneLine(finding.title)}`,
      `  rules: ${rules === "" ? "none" : rules}`,
      `  detail: ${oneLine(finding.detail)}`,
    ];
  });
}

/**
 * A run's header, then one line per step. The header's time is the run's simulated time (B3), never
 * its wall-clock `durationMs`; a run stored before s2-09 has none and reads "—".
 */
function runLines(run: RunResult, backend: ReportBackend): string[] {
  const header = `run ${run.id}: ${personaName(run.profileId)}, seed ${run.seed}, ${run.outcome}, ${plural(run.steps.length, "step")}, simulated time ${seconds(run.simulatedMs)}`;
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

/** A page as the cut lines key it: origin and path, so a query string never splits one page. */
function pageOf(url: string): string {
  const { origin, pathname } = new URL(url);
  return `${origin}${pathname}`;
}

/**
 * The element keys used on the way to the goal, by page: every element a run that got through
 * acted on, looked up by ref in that step's own evidence, and every element Scout's path names.
 * Keys, not names: the key is what perception hashes its decision on.
 */
function usedElements(
  runs: readonly RunResult[],
  scoutPath: readonly PathStep[] | undefined,
): Map<string, Set<string>> {
  const used = new Map<string, Set<string>>();
  const add = (url: string, key: string) => {
    const page = pageOf(url);
    used.set(page, (used.get(page) ?? new Set()).add(key));
  };
  for (const run of runs) {
    if (run.outcome !== "success") continue;
    for (const step of run.steps) {
      if ("wasted" in step) continue;
      const action = step.performedAction;
      if (action === undefined || !("ref" in action)) continue;
      const element = step.fullObservation.elements.find((e) => e.ref === action.ref);
      if (element !== undefined) add(step.urlBefore, element.key);
    }
  }
  for (const step of scoutPath ?? []) {
    if (step.key !== undefined) add(step.url, step.key);
  }
  return used;
}

/** One used element cut by one clause in a run, over the steps it was cut at. */
interface Cut {
  role: string;
  name: string;
  path: string;
  clause: string;
  steps: number[];
}

/**
 * A run's cut lines: none unless it gave up or ran out of budget. An `error` run says nothing
 * about the persona. A step shows a cut of a used key of its page when every element with that
 * key is `invisible` and one carries a perception or attention decision whose own state is
 * `invisible`: `showsCut`'s test, keyed. V2 is left out: it says where the agent had scrolled,
 * which the step lines show already. Cuts group by page, key and clause, in the order first met.
 */
function cutLines(run: RunResult, used: ReadonlyMap<string, ReadonlySet<string>>): string[] {
  if (run.outcome !== "gave_up" && run.outcome !== "budget_exceeded") return [];
  const profile = profileFixtures.find((p) => p.id === run.profileId);
  if (profile === undefined) return [];
  const cuts = new Map<string, Cut>();
  for (const step of run.steps) {
    const page = pageOf(step.urlBefore);
    for (const key of used.get(page) ?? []) {
      const elements = step.fullObservation.elements.filter((e) => e.key === key);
      const [first] = elements;
      if (first === undefined || elements.some((e) => e.state !== "invisible")) continue;
      const clauses = new Set(
        elements.flatMap((e) => e.decisions.filter(cutsIt).map((d) => clauseOf(d, profile))),
      );
      for (const clause of clauses) {
        const id = JSON.stringify([page, key, clause]);
        const path = new URL(step.urlBefore).pathname;
        const cut = cuts.get(id) ?? { role: first.role, name: first.name, path, clause, steps: [] };
        cut.steps.push(step.stepIndex);
        cuts.set(id, cut);
      }
    }
  }
  if (cuts.size === 0) return [];
  return [
    "  cut from this agent at these steps, of what a run that got through or Scout used:",
    ...[...cuts.values()].map(
      (cut) =>
        `    ${cut.role} ${quote(cut.name)} on ${cut.path}, ${stepsText(cut.steps)}. ${cut.clause}`,
    ),
  ];
}

/** A perception or attention decision that alone makes its element `invisible`. */
function cutsIt(decision: ElementDecision): boolean {
  return (
    (decision.stage === "perception" || decision.stage === "attention") &&
    decisionState(decision) === "invisible"
  );
}

/** `step 3`, `steps 0, 4, 6`, or `steps 0 to 9, 12` for three or more in a row. */
function stepsText(steps: readonly number[]): string {
  if (steps.length === 1) return `step ${steps[0]}`;
  const parts: string[] = [];
  let start = 0;
  steps.forEach((step, index) => {
    if (steps[index + 1] === step + 1) return;
    const run = steps.slice(start, index + 1);
    parts.push(...(run.length >= 3 ? [`${run[0]} to ${step}`] : run.map(String)));
    start = index + 1;
  });
  return `steps ${parts.join(", ")}`;
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
