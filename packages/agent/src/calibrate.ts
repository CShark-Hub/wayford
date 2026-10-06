/**
 * The calibration set on the real model, run by hand:
 * `pnpm --filter @wayford/agent calibrate -- [--seeds 1-5] [--max-usd 2] [--backend llm|jev]`.
 * Every run has the loop's default step cap, 20.
 * The Actor runs on the backend `--backend` names, else on `LLM_ACTOR_BACKEND` (default `llm`),
 * with the key in the root `.env`, and every run is billed. One set runs on one backend, and
 * nothing falls back to the other. It prints who reached which goal, by which route, how the
 * other runs ended, at what speed and cost, and the week 3 go/no-go; the same data goes to
 * `runs/calibration/<timestamp>.json`, and each run to `runs/<run id>/` as `run:one` writes it
 * (`docs/specs/2026-10-02-s2-11-calibration-run.md`).
 *
 * ADR 0001's gate is filled from two sets on the same seeds: `--backend llm --seeds 1-10`, then
 * `--backend jev --seeds 1-10`. The gate reads two rows of each table, "Ada, easy" and "Vera
 * hard-cut, hard", not the printed go/no-go, which also judges "Ada, hard".
 *
 * Before the app is served or a browser launched, the set's cost is estimated from the price of
 * the model the backend runs, the Actor's or Jev's, and over `--max-usd` nothing starts. That is
 * an estimate only; once a run is going, `calibrate()` starts no new run after the spend reaches
 * the limit.
 *
 * The app is served on 5174, as `run:one` serves it, so a running `pnpm dev` or target-app
 * preview has to be stopped first. The logic lives in `calibration.ts` and `calibration-run.ts`;
 * no test imports this file, since it loads `.env` and starts billed runs when imported.
 *
 * Exit 0 when the set finished with no `error` run, whatever the go/no-go: a no-go is a
 * measurement. 1 for a setup failure or an estimate over the limit; 1 also for an incomplete set
 * or any `error` run, after the table and the report are written. 2 for a usage error.
 */
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { Seed } from "@wayford/core";
import pino from "pino";
import { DEFAULT_MAX_STEPS } from "./actor-loop.js";
import { backendFactory } from "./backend-factory.js";
import { calibrationSet, renderTable } from "./calibration.js";
import {
  type CalibrationReport,
  calibrate,
  SEED_DEMO_RUNS,
  writeReport,
} from "./calibration-run.js";
import {
  BACKEND_USAGE,
  launchChromium,
  loadRootEnv,
  printFailure,
  RUNS_DIR,
  readBackend,
  readMaxUsd,
  readSeeds,
  scriptArgs,
  serveOnFixturePort,
} from "./cli.js";
import { type ActorBackendName, parseLlmSettings } from "./llm-settings.js";
import { checkEstimate, loadModelPrices, priceOf, usd } from "./models.js";

const REPORTS_DIR = join(RUNS_DIR, "calibration");

/** Seeds 1 to 5, the task's default. */
const DEFAULT_SEEDS: Seed[] = [1, 2, 3, 4, 5];
const DEFAULT_MAX_USD = 2;
/** More seeds than any gate asks for (the Jev gate runs ten) is a typo, not a set. */
const MAX_SEEDS = 100;

const USAGE = `usage: pnpm --filter @wayford/agent calibrate -- [--seeds <a-b | n>] [--max-usd <n>] ${BACKEND_USAGE}`;

interface Arguments {
  seeds: Seed[];
  maxUsd: number;
  /** Absent: `LLM_ACTOR_BACKEND`'s, read once `.env` is loaded. */
  backend: ActorBackendName | undefined;
}

/**
 * The three options, or why they cannot be read. pnpm forwards the `--` that separates its own
 * options from the script's, and `parseArgs` would read everything after it as positionals.
 */
function readArguments(argv: readonly string[]): Arguments | string {
  const args = scriptArgs(argv);
  let values: { seeds?: string; "max-usd"?: string; backend?: string };
  try {
    ({ values } = parseArgs({
      args,
      options: {
        seeds: { type: "string" },
        "max-usd": { type: "string" },
        backend: { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  let seeds = DEFAULT_SEEDS;
  if (values.seeds !== undefined) {
    const read = readSeeds(values.seeds, MAX_SEEDS);
    if (typeof read === "string") return read;
    seeds = read;
  }

  const maxUsd = readMaxUsd(values["max-usd"], DEFAULT_MAX_USD);
  if (typeof maxUsd === "string") return maxUsd;

  const flag = readBackend(values.backend);
  if ("error" in flag) return flag.error;
  return { seeds, maxUsd, backend: flag.backend };
}

/**
 * The lines under the table: the go/no-go and why, what a run cost, and what `seed:demo` would.
 * `errors` is how many runs ended in an error.
 */
function verdictLines(report: CalibrationReport, errors: number, reportPath: string): string {
  // An incomplete set judges no row, so it names the runs not started; a no-go names its rows.
  const failedRows = report.rows
    .filter((row) => row.summary.verdict === "fail")
    .map((row) => row.label);
  const reason =
    report.notRun > 0
      ? `${report.notRun} runs did not start, the spend reached the limit of ${usd(report.maxUsd)}`
      : failedRows.length > 0
        ? `${failedRows.join(", ")} failed`
        : undefined;
  const verdict = reason === undefined ? report.goNoGo : `${report.goNoGo}: ${reason}`;
  const lines = [
    "",
    `go/no-go   ${verdict}`,
    `spent      ${usd(report.spentUsd)} (estimated ${usd(report.estimateUsd)}, limit ${usd(report.maxUsd)})`,
    `per run    ${usd(report.meanRunUsd)} mean, over ${report.resultRuns} runs with a result`,
    `seed:demo  about ${usd(report.seedDemoUsd)} for its ${SEED_DEMO_RUNS} runs (3 personas × 2 tasks × 10 seeds); the sweeps are extra`,
  ];
  if (errors > 0) lines.push(`errors     ${errors} runs ended in an error; see the report`);
  lines.push(`report     ${reportPath}`);
  return lines.join("\n");
}

/** The set, and its exit code: 0 when it finished with no error run, 1 otherwise. */
async function main(args: Arguments): Promise<number> {
  loadRootEnv();
  const settings = parseLlmSettings(process.env);
  const backendId = args.backend ?? settings.actorBackend;
  // The estimate reads the price of the model the backend runs: Jev's on Jev, with no effort.
  const actor = backendId === "jev" ? { model: settings.jevModel } : settings.roles.actor;
  const price = priceOf(loadModelPrices(), actor.model);
  const rows = calibrationSet();

  // `calibrate()` makes this check too; made here as well, an over-budget set serves no app and
  // launches no browser.
  checkEstimate(
    price,
    rows.length * args.seeds.length,
    DEFAULT_MAX_STEPS,
    args.maxUsd,
    "calibration_over_budget",
  );

  // Log lines to stderr, without pid or hostname, so stdout is the table alone and can be pasted.
  const logger = pino({ base: null }, pino.destination(2));
  const app = await serveOnFixturePort();
  try {
    const browser = await launchChromium();
    try {
      const report = await calibrate({
        rows,
        seeds: args.seeds,
        maxUsd: args.maxUsd,
        backend: backendFactory(backendId, settings),
        backendId,
        actor,
        price,
        browser,
        origin: app.origin,
        runsDir: RUNS_DIR,
        logger,
      });
      console.log(
        renderTable(
          report.rows.map((row) => row.summary),
          report.header,
        ),
      );
      const reportPath = await writeReport(report, REPORTS_DIR);
      const errors = report.rows.reduce((sum, row) => sum + row.summary.ends.error, 0);
      console.log(verdictLines(report, errors, reportPath));
      return report.notRun > 0 || errors > 0 ? 1 : 0;
    } finally {
      await browser.close();
    }
  } finally {
    await app.close();
  }
}

const args = readArguments(process.argv.slice(2));
if (typeof args === "string") {
  console.error(`${args}\n${USAGE}`);
  process.exitCode = 2;
} else {
  try {
    process.exitCode = await main(args);
  } catch (error) {
    printFailure(error);
    process.exitCode = 1;
  }
}
