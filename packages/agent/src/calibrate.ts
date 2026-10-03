/**
 * The calibration set on the real model, run by hand:
 * `pnpm --filter @wayford/agent calibrate -- [--seeds 1-5] [--max-usd 2]`. Every run has the
 * loop's default step cap, 20.
 * The Actor is the real model on the key in the root `.env`, and every run is billed. It prints
 * who reached which goal, by which route, how the other runs ended, at what speed and cost, and
 * the week 3 go/no-go; the same data goes to `runs/calibration/<timestamp>.json`, and each run to
 * `runs/<run id>/` as `run:one` writes it (`docs/specs/2026-10-02-s2-11-calibration-run.md`).
 *
 * Before the app is served or a browser launched, the set's cost is estimated from the Actor
 * model's price, and over `--max-usd` nothing starts. That is an estimate only; once a run is
 * going, `calibrate()` starts no new run after the spend reaches the limit.
 *
 * The app is served on 5174, as `run:one` serves it, so a running `pnpm dev` or target-app
 * preview has to be stopped first. The logic lives in `calibration.ts` and `calibration-run.ts`;
 * no test imports this file, since it loads `.env` and starts billed runs when imported.
 *
 * Exit 0 when the set finished with no `error` run, whatever the go/no-go: a no-go is a
 * measurement. 1 for a setup failure or an estimate over the limit; 1 also for an incomplete set
 * or any `error` run, after the table and the report are written. 2 for a usage error.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Seed, WayfordError } from "@wayford/core";
import { serveTargetApp, type TargetApp } from "@wayford/filter/serve-target-app";
import pino from "pino";
import { chromium } from "playwright";
import { DEFAULT_MAX_STEPS } from "./actor-loop.js";
import { calibrationSet, renderTable } from "./calibration.js";
import {
  type CalibrationReport,
  calibrate,
  checkEstimate,
  SEED_DEMO_RUNS,
  usd,
  writeReport,
} from "./calibration-run.js";
import { llmActor } from "./llm-actor.js";
import { parseLlmSettings } from "./llm-settings.js";
import { loadModelPrices, priceOf } from "./models.js";

// Found from this file, as run-one's are, because pnpm starts the script in packages/agent.
const ENV_FILE = fileURLToPath(new URL("../../../.env", import.meta.url));
const RUNS_DIR = fileURLToPath(new URL("../../../runs/", import.meta.url));
const REPORTS_DIR = join(RUNS_DIR, "calibration");

/** The port of core's task fixtures, `http://localhost:5174/`. */
const TARGET_APP_PORT = 5174;

/** Seeds 1 to 5, the task's default. */
const DEFAULT_SEEDS: Seed[] = [1, 2, 3, 4, 5];
const DEFAULT_MAX_USD = 2;
/** More seeds than any gate asks for (the Jev gate runs ten) is a typo, not a set. */
const MAX_SEEDS = 100;

const USAGE =
  "usage: pnpm --filter @wayford/agent calibrate -- [--seeds <a-b | n>] [--max-usd <n>]";

interface Arguments {
  seeds: Seed[];
  maxUsd: number;
}

/** A run seed from digits `readSeeds` has matched, or `undefined` when it is out of range. */
function seedOf(text: string): Seed | undefined {
  const parsed = Seed.safeParse(Number(text));
  return parsed.success ? parsed.data : undefined;
}

/** `a-b` as every seed from a to b, or `n` as that one seed; or why it cannot be read. */
function readSeeds(text: string): Seed[] | string {
  const bad = `--seeds is a range a-b or a single seed n, integers from 0 to 4294967295, got ${text}`;
  const range = /^(\d+)(?:-(\d+))?$/.exec(text);
  if (range === null) return bad;
  const first = seedOf(range[1] ?? "");
  const last = range[2] === undefined ? first : seedOf(range[2]);
  if (first === undefined || last === undefined) return bad;
  if (first > last) return `--seeds ${text} runs backwards: the range's first seed is its lowest`;
  // Checked before the list is built, so a range of billions is refused, not allocated.
  if (last - first + 1 > MAX_SEEDS) return `--seeds names more than ${MAX_SEEDS} seeds: ${text}`;
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

/**
 * The two options, or why they cannot be read. pnpm forwards the `--` that separates its own
 * options from the script's, and `parseArgs` would read everything after it as positionals.
 */
function readArguments(argv: readonly string[]): Arguments | string {
  const args = argv[0] === "--" ? argv.slice(1) : [...argv];
  let values: { seeds?: string; "max-usd"?: string };
  try {
    ({ values } = parseArgs({
      args,
      options: {
        seeds: { type: "string" },
        "max-usd": { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  let seeds = DEFAULT_SEEDS;
  if (values.seeds !== undefined) {
    const read = readSeeds(values.seeds);
    if (typeof read === "string") return read;
    seeds = read;
  }

  let maxUsd = DEFAULT_MAX_USD;
  if (values["max-usd"] !== undefined) {
    const text = values["max-usd"];
    // Plain decimals only, for the same reason as the seeds.
    maxUsd = /^(\d+(\.\d*)?|\.\d+)$/.test(text) ? Number(text) : Number.NaN;
    if (!(maxUsd > 0)) return `--max-usd is a positive number of USD, got ${text}`;
  }
  return { seeds, maxUsd };
}

/**
 * Serves the build on 5174, or says why not in one line: a setup to fix, not a bug's stack. When
 * the port is taken, the line also says what most likely holds it.
 */
async function serve(): Promise<TargetApp> {
  try {
    return await serveTargetApp({ port: TARGET_APP_PORT });
  } catch (error) {
    const reason = error instanceof Error ? (error.message.split("\n", 1)[0] ?? "") : String(error);
    const taken = /EADDRINUSE|already in use/i.test(reason)
      ? " Stop pnpm dev or the target-app preview, which hold that port."
      : "";
    throw new WayfordError(
      "target_app_unavailable",
      `the target app could not be served on ${TARGET_APP_PORT}: ${reason}.${taken}`,
      { cause: error },
    );
  }
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

/**
 * The set, and its exit code: 0 when it finished with no error run, 1 otherwise, 2 for a backend
 * calibrate cannot run yet.
 */
async function main(args: Arguments): Promise<number> {
  // Node's loader skips a variable the environment already holds, so a real one wins.
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const settings = parseLlmSettings(process.env);
  if (settings.actorBackend === "jev") {
    // Never quietly the LLM under a report that says otherwise; s2-06 adds `--backend jev`.
    console.error(
      `LLM_ACTOR_BACKEND is jev, which calibrate cannot run until s2-06 adds --backend jev; unset it or set it to llm\n${USAGE}`,
    );
    return 2;
  }
  const price = priceOf(loadModelPrices(), settings.roles.actor.model);
  const rows = calibrationSet();

  // `calibrate()` makes this check too; made here as well, an over-budget set serves no app and
  // launches no browser.
  checkEstimate(price, rows.length * args.seeds.length, DEFAULT_MAX_STEPS, args.maxUsd);

  // Log lines to stderr, without pid or hostname, so stdout is the table alone and can be pasted.
  const logger = pino({ base: null }, pino.destination(2));
  const app = await serve();
  try {
    const browser = await chromium.launch().catch((error: unknown) => {
      throw new Error(
        "Chromium did not launch. If it is not installed, run " +
          "`pnpm --filter @wayford/agent exec playwright install --only-shell chromium`.",
        { cause: error },
      );
    });
    try {
      const report = await calibrate({
        rows,
        seeds: args.seeds,
        maxUsd: args.maxUsd,
        backend: llmActor({ settings }),
        actor: settings.roles.actor,
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
    // Never the settings: they hold the key. Anything that is not a `WayfordError` is a bug,
    // printed whole with its stack.
    if (error instanceof WayfordError) console.error(`${error.code}: ${error.message}`);
    else console.error(error);
    process.exitCode = 1;
  }
}
