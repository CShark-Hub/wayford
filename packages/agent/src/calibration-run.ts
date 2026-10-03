/**
 * The calibration set run (`tasks/s2-11-calibration-run.md`,
 * `docs/specs/2026-10-02-s2-11-calibration-run.md`, "calibration-run.ts"): every row on every
 * seed through `runActor`, a few at a time on one browser, with the model's time per step measured
 * live, the cost guarded before and during the set, and everything the table and the report need
 * gathered in one `CalibrationReport`.
 *
 * No top-level side effects, so a test imports it safely: loading `.env`, serving the app and
 * printing are the CLI's (`calibrate.ts`). `calibrate()` writes nothing but the runs' own files;
 * `writeReport` writes the report.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Profile, type RunId, type RunOutcome, type Seed, WayfordError } from "@wayford/core";
import type { Logger } from "pino";
import type { Browser } from "playwright";
import type { ActorBackendFactory } from "./actor-backend.js";
import { DEFAULT_MAX_STEPS, runActor } from "./actor-loop.js";
import {
  type CalibrationRow,
  type CalibrationRun,
  costOfRun,
  type End,
  endOfRun,
  estimateUsd,
  goNoGo,
  type ReportHeader,
  type RowSummary,
  routeOf,
  summarise,
} from "./calibration.js";
import type { RoleSettings } from "./llm-settings.js";
import type { ModelPrice } from "./models.js";
import { TARGET_APP_DEFAULTS } from "./start-url.js";

/** At most this many runs at a time when the caller sets none (`docs/PLAN.md` F6 AC1). */
const DEFAULT_CONCURRENCY = 5;

/** `seed:demo`'s runs: 3 personas × 2 tasks × 10 seeds (`docs/PLAN.md` F11). Sweeps are extra. */
export const SEED_DEMO_RUNS = 60;

export interface CalibrateOptions {
  /** `calibrationSet()` from the CLI; a test may pass its own. */
  rows: CalibrationRow[];
  /** Every row runs every one of them (`docs/PLAN.md` A20). */
  seeds: Seed[];
  /** The estimate must not exceed it, and no new run starts once the spend reaches it. */
  maxUsd: number;
  /** The CLI passes `llmActor({ settings })`. */
  backend: ActorBackendFactory;
  /** The Actor's model and effort, recorded in the report. The CLI passes `settings.roles.actor`. */
  actor: Pick<RoleSettings, "model" | "effort">;
  /** The Actor model's price, for the estimate. */
  price: ModelPrice;
  /** The caller's: `calibrate` never launches or closes it. */
  browser: Browser;
  /** The served app, like `http://localhost:5174`. Each task's start URL is rebased onto it. */
  origin: string;
  /** Each run's files go under `<runsDir>/<runId>/`, as `run:one` writes them. */
  runsDir: string;
  logger: Logger;
  /** `DEFAULT_CONCURRENCY` when absent. Wall time and latency depend on it. */
  concurrency?: number;
}

/**
 * One run as the report keeps it. A run that rejected has its seed, its end, its error and, when
 * it was billed before it rejected, its cost.
 */
export interface CalibrationReportRun {
  seed: Seed;
  /** Absent when the run rejected before `runStarted`. */
  runId?: RunId;
  outcome?: RunOutcome;
  end: End;
  route?: Exclude<ReturnType<typeof routeOf>, undefined>;
  steps?: number;
  wallMs?: number;
  /** Per step, the sum of the backend's `answer()` calls in it, in milliseconds. */
  latencyMs: number[];
  costUsd?: number;
  /** A rejected run's error, or a failed run's `runFailed` text. */
  error?: string;
}

export interface CalibrationReportRow {
  label: string;
  /** Whole, so the hard-cut variant, which keeps Vera's id, is on record. */
  profile: Profile;
  taskId: string;
  /** The runs started, in seed order. */
  runs: CalibrationReportRun[];
  summary: RowSummary;
}

export interface CalibrationReport {
  /** When the set started, ISO 8601. `writeReport` names the file after it. */
  startedAt: string;
  header: ReportHeader;
  rows: CalibrationReportRow[];
  goNoGo: ReturnType<typeof goNoGo>;
  /** Runs never started, because the spend reached the limit. Any makes the set "incomplete",
   *  and then no row is judged. */
  notRun: number;
  /** The estimate checked before the set started. */
  estimateUsd: number;
  maxUsd: number;
  /** The sum of every run's billed cost, a rejected run's included. */
  spentUsd: number;
  /** The cost of the runs that returned a result, over their count; 0 when none did. */
  meanRunUsd: number;
  /** The runs that returned a result, which `meanRunUsd` is the mean over. */
  resultRuns: number;
  /** `seed:demo`'s 60 runs at `meanRunUsd`, sweeps not included. */
  seedDemoUsd: number;
}

/**
 * The set's estimated cost, or `calibration_over_budget` when it exceeds `maxUsd`. `calibrate()`
 * checks it first, and the CLI checks it again before it serves the app or launches a browser.
 */
export function checkEstimate(
  price: ModelPrice,
  runs: number,
  maxSteps: number,
  maxUsd: number,
): number {
  const estimate = estimateUsd(price, runs, maxSteps);
  if (estimate > maxUsd) {
    const steps = `${maxSteps} step${maxSteps === 1 ? "" : "s"}`;
    throw new WayfordError(
      "calibration_over_budget",
      `the estimate for ${runs} runs of at most ${steps} is ${usd(estimate)}, over the limit of ${usd(maxUsd)}`,
    );
  }
  return estimate;
}

/**
 * Runs the set and returns its report. The estimate is checked first: over `maxUsd`, it throws a
 * `WayfordError` with code `calibration_over_budget` before the backend factory is called or any
 * run starts. Then every row × seed runs through `runActor`, seed by seed, at most `concurrency`
 * at a time on the one browser. Once the spend reaches `maxUsd`, no new run starts, the rest
 * count as not run, and the set is "incomplete" with no row judged.
 *
 * A run that rejects is recorded as an `error` run and does not stop the others, so `calibrate`
 * rejects only on the estimate.
 */
export async function calibrate(options: CalibrateOptions): Promise<CalibrationReport> {
  const { rows, seeds, maxUsd, logger } = options;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const estimate = checkEstimate(
    options.price,
    rows.length * seeds.length,
    DEFAULT_MAX_STEPS,
    maxUsd,
  );
  const startedAt = new Date(Date.now()).toISOString();

  // Seed by seed, every row on a seed before the next seed, so a set the spend stops early still
  // has each row on its first seeds.
  const jobs = seeds.flatMap((seed, seedIndex) =>
    rows.map((row, rowIndex) => ({ row, rowIndex, seed, seedIndex })),
  );
  // Per row, per seed; a seed never started stays empty.
  const done: (CalibrationRun | undefined)[][] = rows.map(() => seeds.map(() => undefined));
  let spent = 0;
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < jobs.length && spent < maxUsd) {
      const job = jobs[next];
      next += 1;
      if (job === undefined) return;
      const run = await runOne(options, job.row, job.seed);
      spent += costOfRun(run);
      logger.info(
        {
          row: job.row.label,
          seed: job.seed,
          runId: run.runId,
          end: endOfRun(run, DEFAULT_MAX_STEPS),
          spentUsd: spent,
        },
        "calibration run done",
      );
      const row = done[job.rowIndex];
      if (row !== undefined) row[job.seedIndex] = run;
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  const notRun = jobs.length - next;
  if (notRun > 0) {
    logger.warn(
      { spentUsd: spent, maxUsd, notRun },
      "the spend reached the limit, so the rest of the set did not run",
    );
  }

  const reportRows = rows.map((row, rowIndex): CalibrationReportRow => {
    const runs = (done[rowIndex] ?? []).filter((entry) => entry !== undefined);
    // A set cut short is not judged: its rows keep their numbers and lose their verdicts.
    const summary = summarise(row, runs, DEFAULT_MAX_STEPS);
    const { verdict, ...unjudged } = summary;
    return {
      label: row.label,
      profile: row.profile,
      taskId: row.task.id,
      runs: runs.map(reportRun),
      summary: notRun > 0 ? unjudged : summary,
    };
  });
  const withResult = reportRows.flatMap((row) =>
    row.runs.filter((run) => run.outcome !== undefined),
  );
  const resultRuns = withResult.length;
  const meanRunUsd =
    resultRuns === 0
      ? 0
      : withResult.reduce((sum, run) => sum + (run.costUsd ?? 0), 0) / resultRuns;
  return {
    startedAt,
    header: {
      // The one backend until s2-06 adds the option, with "jev".
      backendId: "llm",
      model: options.actor.model,
      effort: options.actor.effort,
      concurrency,
      seeds,
      maxSteps: DEFAULT_MAX_STEPS,
    },
    rows: reportRows,
    goNoGo: goNoGo(
      reportRows.map((row) => row.summary),
      notRun,
    ),
    notRun,
    estimateUsd: estimate,
    maxUsd,
    spentUsd: spent,
    meanRunUsd,
    resultRuns,
    // F11's runs at the measured mean, sweeps not included.
    seedDemoUsd: meanRunUsd * SEED_DEMO_RUNS,
  };
}

/**
 * Writes the report to `<dir>/<startedAt, colons replaced>.json`, making `dir` if need be, and
 * returns the file's path. The colons go, since a Windows path cannot hold them.
 */
export async function writeReport(report: CalibrationReport, dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${report.startedAt.replaceAll(":", "-")}.json`);
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  return path;
}

/** The run as the report keeps it. A rejected run has its seed, its end, its error and its cost. */
function reportRun(run: CalibrationRun): CalibrationReportRun {
  const { seed, runId, result, latencyMs, error, costUsd } = run;
  const end = endOfRun(run, DEFAULT_MAX_STEPS);
  if (result === undefined) {
    return {
      seed,
      ...(runId === undefined ? {} : { runId }),
      end,
      latencyMs,
      ...(costUsd === undefined ? {} : { costUsd }),
      error: error ?? "",
    };
  }
  const route = routeOf(result);
  return {
    seed,
    runId: result.id,
    outcome: result.outcome,
    end,
    ...(route === undefined ? {} : { route }),
    steps: result.steps.length,
    wallMs: result.durationMs,
    latencyMs,
    costUsd: result.cost.usd,
    ...(error === undefined ? {} : { error }),
  };
}

/**
 * One row on one seed. The backend factory is wrapped so each `answer()` is timed; a step's time
 * is the sum of its answers, closed when the loop emits `actionPlanned` or `stepWasted`. A step
 * that ended in a failed call never closes, so it has no time. A rejection is recorded, never
 * thrown, with the cost of its terminal event when it got that far: the loop delivers that event
 * even when `result.json` cannot be written, and the model calls before it were billed.
 */
async function runOne(
  options: CalibrateOptions,
  row: CalibrationRow,
  seed: Seed,
): Promise<CalibrationRun> {
  const latencyMs: number[] = [];
  let open = 0;
  let runId: RunId | undefined;
  let failure: string | undefined;
  let costUsd: number | undefined;
  const timed: ActorBackendFactory = (run) => {
    const backend = options.backend(run);
    return {
      modelId: backend.modelId,
      sampling: backend.sampling,
      async answer(turn) {
        const t0 = performance.now();
        try {
          return await backend.answer(turn);
        } finally {
          open += performance.now() - t0;
        }
      },
    };
  };

  try {
    const result = await runActor({
      browser: options.browser,
      profile: row.profile,
      task: { ...row.task, startUrl: rebase(row.task.startUrl, options.origin) },
      seed,
      params: TARGET_APP_DEFAULTS,
      runsDir: options.runsDir,
      backend: timed,
      logger: options.logger,
      onEvent: (event) => {
        if (event.type === "runStarted") runId = event.runId;
        if (event.type === "runFailed") failure = event.error;
        if (event.type === "runFinished" || event.type === "runFailed") costUsd = event.cost.usd;
        if (event.type === "actionPlanned" || event.type === "stepWasted") {
          latencyMs.push(open);
          open = 0;
        }
      },
    });
    return {
      seed,
      runId: result.id,
      result,
      latencyMs,
      ...(failure === undefined ? {} : { error: failure }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.logger.error(
      { err: error, row: row.label, seed, runId },
      "a calibration run rejected; the others go on",
    );
    return {
      seed,
      ...(runId === undefined ? {} : { runId }),
      error: message,
      latencyMs,
      ...(costUsd === undefined ? {} : { costUsd }),
    };
  }
}

/** `startUrl`'s path, query and hash on `origin`, so a fixture's 5174 reads the served app's port. */
function rebase(startUrl: string, origin: string): string {
  const url = new URL(startUrl);
  return new URL(`${url.pathname}${url.search}${url.hash}`, origin).href;
}

/** An amount as the CLI and the errors print it, like `0.2250 USD`. */
export function usd(amount: number): string {
  return `${amount.toFixed(4)} USD`;
}
