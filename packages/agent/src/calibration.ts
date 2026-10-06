/**
 * The calibration set and the arithmetic of its table (`tasks/s2-11-calibration-run.md`,
 * `docs/specs/2026-10-02-s2-11-calibration-run.md`): which rows run, which route a success took,
 * how the other runs ended, the medians, the week 3 go/no-go and the table as text. Pure: no
 * browser, no network and no clock. `calibration-run.ts` runs the set and hands its runs here; the
 * cost estimate is `estimateUsd` in `models.ts`.
 *
 * Nothing here judges a run anew. Success is the task's own condition, already in `outcome`, and
 * the route is a lookup of the page the run was on just before it.
 */
import { Profile, type RunId, type RunResult, type Seed, type Task } from "@wayford/core";
import { profileFixture, taskFixture } from "@wayford/core/fixtures";
import { TARGET_APP_ROUTES, type TargetAppRoute } from "@wayford/filter/serve-target-app";
import type { ActorBackendName, RoleSettings } from "./llm-settings.js";

/** The easy goal: the delivery address, two clicks from home. */
const EASY_TASK_ID = "task_next-parcel";
/** The hard goal: the order archive, the one the target app's three routes lead to. */
const HARD_TASK_ID = "task_past-order";

/** One row of the set: a persona on a goal, and what the go/no-go asks of it, if anything. */
export interface CalibrationRow {
  /** "Ada, easy", "Ada, hard", "Vera, hard", "Kai, hard" or "Vera hard-cut, hard". */
  label: string;
  profile: Profile;
  task: Task;
  /** Ada's rows must reach the goal; the hard-cut Vera must never reach it. Absent: reported,
   *  not judged. */
  judged?: "reach" | "never";
}

/**
 * The task's five rows, in its order, from core's fixtures. The hard-cut Vera keeps the id
 * `prof_vera` (a new id would be an unknown profile wherever a run is looked up by it) and differs
 * from Vera in her contrast cut alone: 3.0 with no softness, her provenance kept.
 */
export function calibrationSet(): CalibrationRow[] {
  const ada = profileFixture("prof_ada");
  const vera = profileFixture("prof_vera");
  const kai = profileFixture("prof_kai");
  const easy = taskFixture(EASY_TASK_ID);
  const hard = taskFixture(HARD_TASK_ID);
  const contrast = vera.perception.contrast;
  if (contrast === undefined) throw new Error("Vera's fixture has no contrast threshold to cut");
  // Parsed, so the variant is a profile the schema accepts; new objects, so the fixture is untouched.
  const hardCutVera = Profile.parse({
    ...vera,
    perception: {
      ...vera.perception,
      contrast: { threshold: 3, softness: 0, provenance: contrast.provenance },
    },
  });
  return [
    { label: "Ada, easy", profile: ada, task: easy, judged: "reach" },
    { label: "Ada, hard", profile: ada, task: hard, judged: "reach" },
    { label: "Vera, hard", profile: vera, task: hard },
    { label: "Kai, hard", profile: kai, task: hard },
    { label: "Vera hard-cut, hard", profile: hardCutVera, task: hard, judged: "never" },
  ];
}

/**
 * One run of the set: what `runActor` returned, and the model's time per step, measured live. A
 * run that rejected (the backend factory threw, or `result.json` could not be written) has no
 * `result`, only its `error`, and its `costUsd` when it was billed before it rejected.
 */
export interface CalibrationRun {
  seed: Seed;
  /** Absent when the run rejected before `runStarted`. */
  runId?: RunId;
  result?: RunResult;
  /** A rejected run's message, or a failed run's `runFailed` text. */
  error?: string;
  /** Per step, the sum of the backend's `answer()` calls in it, in milliseconds. */
  latencyMs: number[];
  /** A rejected run's cost, from its terminal event; absent when it ended before one. A run with
   *  a result has its cost in `result.cost`. */
  costUsd?: number;
}

/** What a run billed: its result's cost, or a rejected run's cost from its terminal event. */
export function costOfRun(run: CalibrationRun): number {
  return run.result?.cost.usd ?? run.costUsd ?? 0;
}

type RouteId = TargetAppRoute["id"];

/**
 * The route of a successful hard-goal run: the pathname of the last step's `urlBefore` against
 * the last page of each route. `undefined` for a run that did not succeed and for the easy goal;
 * `"?"` for a page no route ends on.
 */
export function routeOf(result: RunResult): RouteId | "?" | undefined {
  if (result.outcome !== "success" || result.taskId !== HARD_TASK_ID) return undefined;
  const last = result.steps.at(-1);
  if (last === undefined) return "?";
  const page = new URL(last.urlBefore).pathname;
  return TARGET_APP_ROUTES.find((route) => route.steps.at(-1)?.page === page)?.id ?? "?";
}

/** How a run ended: the outcome, with `budget_exceeded` split into the step cap and the clock. */
export type End = "success" | "gave_up" | "step_cap" | "clock" | "error";

/**
 * The run's end. Under `budget_exceeded`, the step cap is `maxSteps` steps with a last step that
 * is complete or wasted; anything else ran out of time (s2-10's clock), mid-step or not.
 */
export function endOf(result: RunResult, maxSteps: number): End {
  if (result.outcome !== "budget_exceeded") return result.outcome;
  const last = result.steps.at(-1);
  const capped = result.steps.length === maxSteps && last !== undefined && !("incomplete" in last);
  return capped ? "step_cap" : "clock";
}

/** A calibration run's end: `error` for a run that rejected with no result, else `endOf`. */
export function endOfRun(run: CalibrationRun, maxSteps: number): End {
  return run.result === undefined ? "error" : endOf(run.result, maxSteps);
}

/** One row of the table. */
export interface RowSummary {
  label: string;
  /** Runs started, a rejected one included. */
  runs: number;
  successes: number;
  routes: Partial<Record<RouteId | "?", number>>;
  ends: Record<Exclude<End, "success">, number>;
  medianSteps: number;
  /** Per step, over every step of every run. */
  medianLatencyMs: number;
  /** `cost.tokensIn` per step, a retry or repair included. */
  medianPromptTokens: number;
  /** `durationMs` per run. */
  medianWallMs: number;
  /** A rejected run's billed cost included. */
  costUsd: number;
  /** The row's own, so the table can tell a judged row left unjudged from a reported one. */
  judged?: CalibrationRow["judged"];
  /** Judged rows only, and only in a complete set. */
  verdict?: "pass" | "fail";
}

/** The median, the mean of the middle two for an even count, and 0 for nothing. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/**
 * The row's line of the table from its runs, judged as a complete row: `calibrate()` drops the
 * verdicts of a set cut short. A "reach" row passes at `ceil(0.8 × runs)` successes (4 of 5, 8 of
 * 10), a rejected or `error` run counting as a miss; a "never" row passes with no success and no
 * `error` end. Steps, tokens in and wall time read only the runs that have a result; model time
 * also reads the steps of the runs that rejected, and the cost includes what they billed.
 */
export function summarise(
  row: CalibrationRow,
  runs: readonly CalibrationRun[],
  maxSteps: number,
): RowSummary {
  const results: RunResult[] = [];
  const ends: RowSummary["ends"] = { gave_up: 0, step_cap: 0, clock: 0, error: 0 };
  const routeCounts: RowSummary["routes"] = {};
  let successes = 0;
  for (const { result } of runs) {
    if (result === undefined) {
      ends.error += 1;
      continue;
    }
    results.push(result);
    const end = endOf(result, maxSteps);
    if (end !== "success") {
      ends[end] += 1;
      continue;
    }
    successes += 1;
    const route = routeOf(result);
    if (route !== undefined) routeCounts[route] = (routeCounts[route] ?? 0) + 1;
  }
  const summary: RowSummary = {
    label: row.label,
    runs: runs.length,
    successes,
    routes: routeCounts,
    ends,
    medianSteps: median(results.map((result) => result.steps.length)),
    medianLatencyMs: median(runs.flatMap((run) => run.latencyMs)),
    // A step cut short before its action was planned billed nothing and has no cost.
    medianPromptTokens: median(
      results.flatMap((result) => result.steps.flatMap((step) => step.cost?.tokensIn ?? [])),
    ),
    medianWallMs: median(results.map((result) => result.durationMs)),
    costUsd: runs.reduce((sum, run) => sum + costOfRun(run), 0),
    ...(row.judged === undefined ? {} : { judged: row.judged }),
  };
  if (row.judged === "reach") {
    summary.verdict = successes >= Math.ceil(0.8 * runs.length) ? "pass" : "fail";
  } else if (row.judged === "never") {
    // A crash measures nothing, so a run that errored is no proof the goal stayed out of reach.
    summary.verdict = successes === 0 && ends.error === 0 ? "pass" : "fail";
  }
  return summary;
}

/**
 * The week 3 go/no-go (`docs/ROADMAP.md`): "incomplete" when any of the set's runs did not start,
 * since a set cut short is not judged; else "no-go" when any judged row failed; else "go".
 */
export function goNoGo(rows: readonly RowSummary[], notRun: number): "go" | "no-go" | "incomplete" {
  if (notRun > 0) return "incomplete";
  return rows.some((row) => row.verdict === "fail") ? "no-go" : "go";
}

/** What the table was run on, printed above it. */
export interface ReportHeader {
  backendId: ActorBackendName;
  model: string;
  /** Absent: the endpoint's own default. Always absent on Jev, which takes no effort. */
  effort: RoleSettings["effort"];
  concurrency: number;
  seeds: readonly Seed[];
  maxSteps: number;
}

/** Seeds as the CLI reads them, the only lists it makes: `n` for one, `1-5` for a range. */
function seedList(seeds: readonly Seed[]): string {
  return seeds.length === 1 ? String(seeds[0]) : `${seeds[0]}-${seeds.at(-1)}`;
}

/** The routes taken, as `A:2 B:1 ?:1`: by id, with `?` last; `-` for none. */
function routeCell(routes: RowSummary["routes"]): string {
  const taken = Object.entries(routes)
    .filter(([, count]) => (count ?? 0) > 0)
    .sort(([a], [b]) => (a === "?" ? 1 : b === "?" ? -1 : a.localeCompare(b)));
  return taken.length === 0 ? "-" : taken.map(([id, count]) => `${id}:${count}`).join(" ");
}

/** The table as fixed-width text: the header lines, then one line per row under column titles. */
export function renderTable(summaries: readonly RowSummary[], header: ReportHeader): string {
  const titles = [
    "row",
    "reached",
    "routes",
    "gave up",
    "step cap",
    "clock",
    "error",
    "steps",
    "model ms/step",
    "tokens in/step",
    "wall s",
    "cost USD",
    "verdict",
  ];
  const cells = summaries.map((row) => [
    row.label,
    `${row.successes}/${row.runs}`,
    routeCell(row.routes),
    String(row.ends.gave_up),
    String(row.ends.step_cap),
    String(row.ends.clock),
    String(row.ends.error),
    String(row.medianSteps),
    String(Math.round(row.medianLatencyMs)),
    String(Math.round(row.medianPromptTokens)),
    (row.medianWallMs / 1000).toFixed(1),
    row.costUsd.toFixed(4),
    row.verdict ?? (row.judged === undefined ? "reported" : "not judged"),
  ]);
  const widths = titles.map((title, column) =>
    Math.max(title.length, ...cells.map((line) => line[column]?.length ?? 0)),
  );
  // The label column reads left to right; the numbers line up on the right.
  const line = (values: readonly string[]) =>
    values
      .map((value, column) =>
        column === 0 ? value.padEnd(widths[column] ?? 0) : value.padStart(widths[column] ?? 0),
      )
      .join("  ")
      .trimEnd();
  // Jev takes no effort, so "default" would read as the endpoint's own.
  const effort = header.backendId === "jev" ? "n/a" : (header.effort ?? "default");
  return [
    `backend      ${header.backendId}`,
    `model        ${header.model}`,
    `effort       ${effort}`,
    `concurrency  ${header.concurrency}`,
    `seeds        ${seedList(header.seeds)}`,
    `max steps    ${header.maxSteps}`,
    "Steps, model time, tokens in and wall time are medians; tokens in per step include a retry or repair,",
    "and model time per step includes the adapter's retries and their backoff.",
    "",
    line(titles),
    ...cells.map(line),
  ].join("\n");
}
