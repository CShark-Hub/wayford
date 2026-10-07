/**
 * The Analyst: one call over every chosen run of every persona on a task, and the report built
 * around its answer (`docs/specs/2026-10-05-s4-04-analyst.md`, "io: the call and the assembly").
 *
 * Code decides what is true; the model only words it. Before the call, code has chosen the runs,
 * counted the numbers and written the `deterministic` findings with their evidence and basis, and
 * a `measurement` finding for each axe-core violation on a page the runs stood on, on the target
 * app or any other site (`analyst-axe.ts`, F10 AC2): a scan that fails costs only its page's
 * measurements, never the report. The model gets all of it in one `analyst` call (F8 AC4) and writes into fields (A9): one
 * recommendation per finding and at most five hypotheses. After the call, code checks every
 * hypothesis before it is stored:
 * - every evidence ref must name a run the report read and a step that run has, or the whole
 *   finding is dropped (F8 AC2);
 * - its personas are the profiles of the runs it cites, never the model's word;
 * - its basis keeps the rule ids the model named, with each provenance copied from the cited
 *   personas' profiles (F8 AC5), and drops a rule that is unknown or that none of them sources.
 * Each drop is logged. A blank recommendation gets one written in code, the draft's fallback, so a
 * finding code wrote is never lost to the model.
 *
 * The route facts are injected (`RouteFacts`): `@wayford/filter/routes` loads Playwright and Vite,
 * which io's barrel must not load, so this module imports its types alone. `@wayford/agent` is
 * imported as types too: the `Llm` is handed in.
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Llm } from "@wayford/agent";
import {
  type Cost,
  type EvidenceRef,
  Finding,
  type FindingBasis,
  GroundTruth,
  newId,
  type Profile,
  type ProfileId,
  Report,
  type ReportBackend,
  RuleId,
  type RunResult,
  type ScoutLine,
  type Task,
  type TaskId,
  type UnevidencedClosure,
  WayfordError,
} from "@wayford/core";
import { profileFixtures, taskFixtures } from "@wayford/core/fixtures";
import type { Logger } from "pino";
import { z } from "zod";
import { axeDrafts } from "./analyst-axe.js";
import { closureFindings, type Draft, provenanceOf } from "./analyst-closures.js";
import { analystCase } from "./analyst-digest.js";
import {
  byPersona,
  personaResults,
  type RouteFacts,
  type RouteFactsOf,
  selectRuns,
} from "./analyst-runs.js";
import { otherBackends } from "./analyst-text.js";
import type { AxeLookup } from "./axe.js";
import type { Db } from "./db/database.js";
import { saveReport } from "./db/reports.js";
import { listRuns } from "./db/runs.js";
import { loadTask } from "./db/tasks.js";

/** The prompt template, a file so a test can read what the model is told. */
export const ANALYST_PROMPT_FILE = fileURLToPath(new URL("./analyst-prompt.md", import.meta.url));

// Read once, at module load, so a missing file fails at boot and not on the first request.
const PROMPT = readFileSync(ANALYST_PROMPT_FILE, "utf8");

/** The most hypotheses a report keeps (task: "up to five"). */
const MAX_HYPOTHESES = 5;

export interface AnalystDeps {
  db: Db;
  /** One `Llm` serves every role; this module calls `analyst` only. */
  llm: Llm;
  routes: RouteFacts;
  /** Where Scout writes `<task id>.json`. */
  groundTruthDir: string;
  /** Jev's pinned model, which marks a stored run as Jev's (`backendOf`). */
  jevModel: string;
  /**
   * The axe-core scan of a page the runs stood on, a target-app page at the app's parameters or
   * any other page by its URL, stored or scanned on a miss: the app's one lookup, which `GET /axe`
   * reads too, so the two share a scan.
   */
  axe: AxeLookup;
  /**
   * The origin the target app is served on, port included, as io hands its runner:
   * `http://localhost:5174`. A run whose start URL is on it is a target-app run, whose pages are
   * scanned at its app parameters; any other run's pages are scanned as it stood on them
   * (`analyst-axe.ts`).
   */
  targetAppOrigin: string;
  logger: Logger;
}

export type Analysis = { ok: true; report: Report } | { ok: false; error: string };

/** What `analyseTask` reads, already loaded, beside what it calls. */
interface AnalysisInput
  extends Pick<AnalystDeps, "llm" | "routes" | "axe" | "targetAppOrigin" | "logger"> {
  task: Task;
  backend: ReportBackend;
  /** The runs the report reads, as `selectRuns` chose them: at least one, `analyseAndStore` checks. */
  chosen: readonly RunResult[];
  leftOut: Report["leftOut"];
  groundTruth: GroundTruth | undefined;
}

/** One hypothesis as the model writes it: types and `required` only, like `ExtractorAnswer`. */
const HypothesisAnswer = z
  .object({
    title: z.string(),
    detail: z.string(),
    recommendation: z.string(),
    evidence: z.array(z.object({ runId: z.string(), stepIndex: z.number().int() }).strict()),
    rules: z.array(z.string()),
  })
  .strict();
type HypothesisAnswer = z.infer<typeof HypothesisAnswer>;

/**
 * The answer's schema, built per call with one required key per draft, so a strict `json_schema`
 * mode asks for every one and the adapter's repair round brings a missing key back. No keyword
 * beyond types and `required`, apart from the integer bounds zod puts on `stepIndex`, which strict
 * modes already take on the Actor's `wait.ms`.
 */
function answerFor(drafts: readonly Draft[]) {
  return z
    .object({
      recommendations: z
        .object(Object.fromEntries(drafts.map((draft) => [draft.key, z.string()])))
        .strict(),
      hypotheses: z.array(HypothesisAnswer),
    })
    .strict();
}

/**
 * Read, analyse, store. `ok: false` for an unknown task or no runs on the backend, before any
 * model call. The task comes from the database, else from the bundled fixtures, which the seeded
 * runs name; only a task found reaches the ground-truth file's path. A failed model call (an
 * `LlmError`) propagates and nothing is stored.
 */
export async function analyseAndStore(
  deps: AnalystDeps,
  taskId: TaskId,
  backend: ReportBackend,
): Promise<Analysis> {
  const task =
    (await loadTask(deps.db, taskId)) ?? taskFixtures.find((fixture) => fixture.id === taskId);
  if (task === undefined) return { ok: false, error: `no task ${taskId}` };
  const { chosen, leftOut } = selectRuns(
    // Sweep runs included: `chooseRuns` leaves them out and counts them for the report.
    await listRuns(deps.db, { taskId: task.id, sweeps: "include" }),
    backend,
    deps.jevModel,
  );
  if (chosen.length === 0) {
    const count = leftOut.otherBackend === 0 ? "none" : String(leftOut.otherBackend);
    return {
      ok: false,
      error: `no runs of ${task.id} on ${backend}; ${count} on ${otherBackends(backend)}`,
    };
  }
  const groundTruth = await readGroundTruth(deps.groundTruthDir, task.id);
  const report = await analyseTask({ ...deps, task, backend, chosen, leftOut, groundTruth });
  await saveReport(deps.db, report);
  return { ok: true, report };
}

/**
 * The analysis alone, over runs already chosen: the numbers and findings in code, one `analyst`
 * call, and the report assembled and parsed. Findings are ordered as PLAN separates them:
 * measurements first, then deterministic findings by persona, then hypotheses in the model's
 * order.
 */
async function analyseTask(input: AnalysisInput): Promise<Report> {
  const { task, backend, chosen, leftOut, groundTruth, llm, routes, axe, targetAppOrigin, logger } =
    input;
  const scout = scoutLineOf(groundTruth);

  // Each persona's runs by seed, the order the report lists them in. A run of an unbundled profile
  // throws `unknown_profile` here, before any walk or call.
  const groups = byPersona(chosen);
  const ordered = groups.flatMap((group) => group.runs);

  // Per persona, its route facts; a goal with no route table has none, so no route-open number
  // and no closing to find.
  const facts = new Map<ProfileId, RouteFactsOf>();
  const closures: Omit<Draft, "key">[] = [];
  const unevidencedClosures: UnevidencedClosure[] = [];
  for (const { profile, runs } of groups) {
    const seeds = runs.map((run) => run.seed);
    const personaFacts = await routes(task.id, profile, seeds);
    if (personaFacts === undefined) continue;
    facts.set(profile.id, personaFacts);
    const { drafts, unevidenced } = closureFindings({
      taskId: task.id,
      profile,
      runs,
      closings: personaFacts.closings,
      seeds: runs.length,
      scout,
    });
    unevidencedClosures.push(...unevidenced);
    closures.push(...drafts);
  }
  const personas = personaResults(groups, facts);
  const measurements = await axeDrafts({
    taskId: task.id,
    runs: ordered,
    axe,
    targetAppOrigin,
    logger,
  });
  // Measurements first, then every persona's closures in order, keyed across both: the ids the
  // answer names them by, one recommendation each.
  const drafts: Draft[] = [...measurements, ...closures].map((draft, index) => ({
    ...draft,
    key: `d${index + 1}`,
  }));

  const completion = await llm.complete({
    role: "analyst",
    messages: [
      { role: "system", content: PROMPT },
      {
        role: "user",
        content: analystCase({ task, scout, personas, drafts, runs: ordered, backend }),
      },
    ],
    schema: answerFor(drafts),
  });
  const answer = completion.value;

  const recommended = drafts.map((draft): Finding => {
    const written = answer.recommendations[draft.key]?.trim() ?? "";
    if (written !== "") return { ...draft.finding, recommendation: written };
    const { title, personaIds } = draft.finding;
    logger.warn(
      { finding: draft.key, title, personaIds },
      "the Analyst left a recommendation blank; code wrote its fallback",
    );
    return { ...draft.finding, recommendation: draft.fallback };
  });
  const hypotheses = checkedHypotheses(answer.hypotheses, ordered, task.id, logger);

  return Report.parse({
    taskId: task.id,
    backend,
    analysedAt: new Date().toISOString(),
    analystModelId: completion.model,
    runCount: ordered.length,
    cost: { runs: sumOf(ordered.map((run) => run.cost)), analyst: completion.cost },
    scout,
    personas,
    findings: [...recommended, ...hypotheses],
    leftOut,
    unevidencedClosures,
  });
}

/**
 * `GroundTruth` from `<dir>/<taskId>.json`; undefined when there is no file. A file that is not
 * JSON, fails `GroundTruth`, or holds another task's ground truth throws
 * `WayfordError("invalid_ground_truth")`, the error underneath on `cause`: a report must not
 * quietly say "no ground truth" over a file it could not read.
 */
export async function readGroundTruth(
  dir: string,
  taskId: TaskId,
): Promise<GroundTruth | undefined> {
  const file = join(dir, `${taskId}.json`);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new WayfordError("invalid_ground_truth", `${file} is not JSON`, { cause: error });
  }
  const parsed = GroundTruth.safeParse(json);
  if (!parsed.success) {
    throw new WayfordError(
      "invalid_ground_truth",
      `${file} is no ground truth:\n${z.prettifyError(parsed.error)}`,
      { cause: parsed.error },
    );
  }
  if (parsed.data.taskId !== taskId) {
    throw new WayfordError(
      "invalid_ground_truth",
      `${file} holds the ground truth of ${parsed.data.taskId}, not of ${taskId}`,
    );
  }
  return parsed.data;
}

/** Scout's line from its ground truth: reached in its shortest path's steps, or not in its attempts. */
function scoutLineOf(truth: GroundTruth | undefined): ScoutLine {
  if (truth === undefined) return { status: "noGroundTruth" };
  const { modelId, recordedAt, shortest } = truth;
  // `GroundTruth` holds `shortest` exactly when the goal was reached.
  return shortest === undefined
    ? { status: "notReached", attempts: truth.attempts.length, modelId, recordedAt }
    : { status: "reached", steps: shortest.path.steps.length, modelId, recordedAt };
}

/**
 * The model's hypotheses as findings, in its order, at most five valid ones. A hypothesis is
 * dropped, and logged, when one evidence ref names a run outside `chosen` (unknown, or left out)
 * or a step its run lacks, or when `Finding` refuses it (a blank title, no evidence). Its
 * personas and its basis are code's: see `basisOf`.
 */
function checkedHypotheses(
  answers: readonly HypothesisAnswer[],
  chosen: readonly RunResult[],
  taskId: TaskId,
  logger: Logger,
): Finding[] {
  const stepsOf = new Map(
    chosen.map((run) => [run.id, new Set(run.steps.map((step) => step.stepIndex))]),
  );
  const profileOf = new Map(chosen.map((run) => [run.id, run.profileId]));
  const kept: Finding[] = [];
  answers.forEach((answer, index) => {
    const about = { hypothesis: index, title: answer.title };
    if (kept.length === MAX_HYPOTHESES) {
      logger.warn(about, `a hypothesis beyond the first ${MAX_HYPOTHESES} is dropped`);
      return;
    }
    const bad = answer.evidence.find((ref) => !stepsOf.get(ref.runId)?.has(ref.stepIndex));
    if (bad !== undefined) {
      const why = stepsOf.has(bad.runId)
        ? "a hypothesis citing a step its run does not have is dropped"
        : "a hypothesis citing a run the report did not read is dropped";
      logger.warn({ ...about, runId: bad.runId, stepIndex: bad.stepIndex }, why);
      return;
    }
    const evidence = distinctRefs(answer.evidence);
    const cited = new Set(evidence.map((ref) => profileOf.get(ref.runId)));
    const personas = profileFixtures.filter((profile) => cited.has(profile.id));
    const parsed = Finding.safeParse({
      id: newId("finding"),
      taskId,
      type: "hypothesis",
      title: answer.title,
      detail: answer.detail,
      evidence,
      basis: basisOf(answer.rules, personas, (rule, says) =>
        logger.warn({ ...about, rule, personaIds: personas.map((p) => p.id) }, says),
      ),
      recommendation: answer.recommendation,
      personaIds: personas.map((profile) => profile.id),
    });
    if (!parsed.success) {
      logger.warn(
        { ...about, issues: z.prettifyError(parsed.error) },
        "a hypothesis the Finding schema refuses is dropped",
      );
      return;
    }
    kept.push(parsed.data);
  });
  return kept;
}

/**
 * A hypothesis's basis: each rule id the model named that `RuleId` knows, with one entry per
 * distinct provenance the cited personas' profiles give it (`provenanceOf`). The model names ids
 * only; every provenance is copied from a profile (F8 AC5). A rule that is unknown, or that no
 * cited persona gives a source, is dropped and reported to `drop`.
 */
function basisOf(
  rules: readonly string[],
  personas: readonly Profile[],
  drop: (rule: string, says: string) => void,
): FindingBasis[] {
  const basis: FindingBasis[] = [];
  for (const named of new Set(rules)) {
    const rule = RuleId.safeParse(named);
    if (!rule.success) {
      drop(named, "a hypothesis names an unknown rule; the rule is dropped");
      continue;
    }
    const sources = new Set(personas.flatMap((profile) => provenanceOf(rule.data, profile) ?? []));
    if (sources.size === 0) {
      drop(named, "no persona a hypothesis cites gives its rule a source; the rule is dropped");
      continue;
    }
    for (const provenance of sources) basis.push({ rule: rule.data, provenance });
  }
  return basis;
}

/** Each ref once, in the order first given. */
function distinctRefs(refs: readonly EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = JSON.stringify([ref.runId, ref.stepIndex]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Costs summed, field by field. */
function sumOf(costs: readonly Cost[]): Cost {
  return costs.reduce(
    (sum, cost) => ({
      tokensIn: sum.tokensIn + cost.tokensIn,
      tokensOut: sum.tokensOut + cost.tokensOut,
      usd: sum.usd + cost.usd,
    }),
    { tokensIn: 0, tokensOut: 0, usd: 0 },
  );
}
