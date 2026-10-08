/**
 * `reportText`: a stored `Report` as plain text, which the `analyse` CLI prints
 * (`docs/specs/2026-10-05-s4-04-analyst.md`, "io: storage, routes, CLI").
 *
 * In the report's own order: what it read and what that cost, Scout's line,
 * each persona's numbers, the findings by type, then what it left out. Scout's
 * line comes before any persona, since every finding is read against it.
 *
 * A persona's "got through" leaves its `error` runs out: an error is the tool
 * falling over, not the persona. Its route-open
 * count is over every seed, since the filter decides it before any run. A
 * measurement or deterministic finding resting on a `folk` or `llm` source is
 * marked `soft` (`isHardFinding`). A hypothesis is never hard, so its heading
 * says what it is instead.
 *
 * The wording the case the Analyst reads shares with this text is exported
 * from here, so `analyst-digest.ts` says it the same way: Scout's line, a
 * missing number, a count, seconds, the other backends and a persona's label.
 *
 * Pure: the text depends on the report alone.
 */
import {
  type Cost,
  type EvidenceRef,
  FINDING_TYPES,
  type Finding,
  type FindingType,
  HARD_FINDING_TYPES,
  isHardFinding,
  type PersonaResult,
  type Report,
  ReportBackend,
  type ScoutLine,
} from "@wayford/core";
import { profileFixtures } from "@wayford/core/fixtures";

/** What a missing number reads as (F8 AC6). */
export const NONE = "—";

/** The bundled personas' labels by id. */
const LABELS: ReadonlyMap<string, string> = new Map(profileFixtures.map((p) => [p.id, p.label]));

/** A persona's label; an id with no bundled profile stands for itself. */
export const labelOf = (profileId: string) => LABELS.get(profileId) ?? profileId;

/** A count and its word, the word plural unless the count is one: `1 step`, `2 steps`. */
export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Milliseconds as seconds, to one decimal: `10.4 s`; a missing time reads `NONE`. */
export const seconds = (ms: number | null | undefined) =>
  ms == null ? NONE : `${(ms / 1000).toFixed(1)} s`;

/** Every backend but `backend`, joined with "or": the backends a report on it leaves out. */
export const otherBackends = (backend: ReportBackend) =>
  ReportBackend.options.filter((other) => other !== backend).join(" or ");

const HEADINGS: Record<FindingType, string> = {
  measurement: "Measurement findings",
  deterministic: "Deterministic findings",
  hypothesis: "Hypotheses",
};

/** Said once, on the heading, for every hypothesis under it. */
const HYPOTHESIS_NOTE = "read from the runs' actions and narration, not measured";

/** The report as text, its blocks parted by blank lines, ending in a newline. */
export function reportText(report: Report): string {
  const blocks = [
    header(report),
    scoutLine(report.scout),
    personaTable(report.personas),
    ...FINDING_TYPES.flatMap((type) =>
      findingSection(
        type,
        report.findings.filter((finding) => finding.type === type),
      ),
    ),
    leftOut(report),
    closures(report),
  ];
  return `${blocks.join("\n\n")}\n`;
}

function header(report: Report): string {
  const { runs, analyst } = report.cost;
  return [
    `task      ${report.taskId}`,
    `backend   ${report.backend}`,
    `analysed  ${report.analysedAt}`,
    `analyst   ${report.analystModelId}`,
    `runs      ${report.runCount}`,
    `cost      ${usd(runs)} for the runs, ${usd(analyst)} for the Analyst`,
  ].join("\n");
}

/**
 * Scout's line: context, not a verdict. A hand-written ground truth says so (`GroundTruth`). The
 * case the Analyst reads gives the same line.
 */
export function scoutLine(scout: ScoutLine): string {
  if (scout.status === "noGroundTruth") return "Scout: no ground truth.";
  const line =
    scout.status === "reached"
      ? `Scout reached the goal in ${plural(scout.steps, "step")}: the feature works.`
      : `Scout did not reach the goal in ${plural(scout.attempts, "attempt")}.`;
  return scout.modelId === "hand"
    ? `${line} This ground truth was written by hand, not recorded by a Scout run.`
    : line;
}

const TABLE_TITLES = [
  "persona",
  "runs",
  "errors",
  "got through",
  "route open",
  "median simulated time to success",
];

/**
 * One row per persona, in the report's order: labels read left to right, numbers line up right.
 * The median is the simulated one (B3); the wall-clock `medianSuccessMs` stays in the report as
 * evidence and is not shown. A report stored before s2-09 has no simulated median and reads "—".
 */
function personaTable(personas: readonly PersonaResult[]): string {
  const rows = personas.map((result) => {
    const counted = result.runs - result.errors;
    return [
      labelOf(result.profileId),
      String(result.runs),
      String(result.errors),
      counted === 0 ? NONE : `${result.successes}/${counted}`,
      result.routeOpenSeeds === null ? NONE : `${result.routeOpenSeeds}/${result.runs}`,
      seconds(result.medianSimulatedMs),
    ];
  });
  const widths = TABLE_TITLES.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => row[column]?.length ?? 0)),
  );
  const line = (values: readonly string[]) =>
    values
      .map((value, column) =>
        column === 0 ? value.padEnd(widths[column] ?? 0) : value.padStart(widths[column] ?? 0),
      )
      .join("  ")
      .trimEnd();
  return [line(TABLE_TITLES), ...rows.map(line)].join("\n");
}

/** A type's heading, then one block per finding, or `none`. */
function findingSection(type: FindingType, findings: readonly Finding[]): string[] {
  const heading = `${HEADINGS[type]} (${findings.length})`;
  return [
    type === "hypothesis" ? `${heading}: ${HYPOTHESIS_NOTE}` : heading,
    ...(findings.length === 0 ? ["  none"] : findings.map(findingBlock)),
  ];
}

function findingBlock(finding: Finding): string {
  const fields: [string, string][] = [["basis", basisOf(finding)]];
  if (finding.axeRuleId !== undefined) fields.push(["axe rule", finding.axeRuleId]);
  fields.push(
    ["evidence", evidenceText(finding.evidence)],
    ["detail", finding.detail],
    ["recommendation", finding.recommendation],
  );
  return [
    `  ${finding.title}`,
    ...fields.map(([name, value]) => `    ${name.padEnd(16)}${value}`),
  ].join("\n");
}

/**
 * The evidence by run, in the order the runs are first cited, each run's steps as ranges:
 * `run_a steps 3-11, 13; run_b step 1`. A run that stood on a page for many steps is cited at
 * every one of them, so a flat list of refs runs to hundreds on a real run set.
 */
function evidenceText(evidence: readonly EvidenceRef[]): string {
  const stepsOf = new Map<string, number[]>();
  for (const { runId, stepIndex } of evidence) {
    let steps = stepsOf.get(runId);
    if (steps === undefined) {
      steps = [];
      stepsOf.set(runId, steps);
    }
    steps.push(stepIndex);
  }
  return [...stepsOf]
    .map(([runId, steps]) => {
      const distinct = [...new Set(steps)].toSorted((a, b) => a - b);
      const ranges: [number, number][] = [];
      for (const step of distinct) {
        const last = ranges.at(-1);
        if (last !== undefined && step === last[1] + 1) last[1] = step;
        else ranges.push([step, step]);
      }
      const text = ranges.map(([from, to]) => (from === to ? `${from}` : `${from}-${to}`));
      return `${runId} ${distinct.length === 1 ? "step" : "steps"} ${text.join(", ")}`;
    })
    .join("; ");
}

/** Each basis entry as `rule (provenance)`, then `soft` when a hard type rests on a folk or llm source. */
function basisOf(finding: Finding): string {
  if (finding.basis.length === 0) return "none";
  const entries = finding.basis.map((entry) => `${entry.rule} (${entry.provenance})`).join(", ");
  const soft = HARD_FINDING_TYPES.includes(finding.type) && !isHardFinding(finding);
  return soft ? `${entries}; soft` : entries;
}

function leftOut(report: Report): string {
  const { olderRuns, otherBackend, sweepRuns } = report.leftOut;
  return [
    `Left out: ${plural(olderRuns, "older run")} of a persona and seed already read`,
    `${plural(otherBackend, "run")} on ${otherBackends(report.backend)}`,
    `${plural(sweepRuns, "sweep run")}.`,
  ].join(", ");
}

/** The routes closed with no step to show it: listed by name, never findings (F8 AC2). */
function closures(report: Report): string {
  const heading =
    "Routes the filter closed that no step of the persona's runs shows, so no finding:";
  const seedsOf = new Map(report.personas.map((result) => [result.profileId, result.runs]));
  const lines = report.unevidencedClosures.map((closure) => {
    const of = seedsOf.get(closure.profileId);
    const seeds =
      of === undefined
        ? plural(closure.seeds, "seed")
        : `${closure.seeds} of ${plural(of, "seed")}`;
    const element = `${closure.role} ${JSON.stringify(closure.name)} on ${closure.page}`;
    return `  ${labelOf(closure.profileId)}, route ${closure.routeId}: ${element}, cut by ${closure.rules.join(", ")} in ${seeds}`;
  });
  return [heading, ...(lines.length === 0 ? ["  none"] : lines)].join("\n");
}

const usd = (cost: Cost) => `${cost.usd.toFixed(6)} USD`;
