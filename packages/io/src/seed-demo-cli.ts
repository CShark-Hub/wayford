/**
 * The demo's data in one command (s4-07, `docs/specs/2026-10-06-s4-07-seed-demo.md`):
 * `pnpm seed:demo [--fake | --backend llm|jev] [--reset]`.
 *
 * It runs `seedDemo` on `DEMO_PLAN`, on Jev unless `--backend llm`, into the database `DATABASE_URL`
 * names, with each run's files under the repository's `runs/`, where the io server finds them. So
 * the dashboard, the report and the sweep screens show what it stored. `--fake` runs on the fake
 * Jev and the fake Analyst, with no key and no network: how screens are built on real-shaped data.
 *
 * Cheapest first: the arguments, the env and the plan's size, then the store's refusal and the
 * ground truth, then the target app served on 5174 and walked, and only then `--reset` empties the
 * store, so a start that fails leaves it as it was. A running `pnpm dev` holds 5174 and has to be
 * stopped.
 *
 * Progress and log lines go to stderr, and the summary alone to stdout, so it pastes into the
 * pitch notes. Like the sweep CLI it loads `.env`, serves and runs on import, so it stays out of
 * the barrel and no test imports it.
 *
 * Exit 0 when the seed completed with no run errored or unstored. 1 for a refusal, a failure, or
 * an errored run, after the summary. 2 for a usage error.
 */
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  ActorBackendName,
  actorModelOf,
  createLlm,
  DEFAULT_MAX_STEPS,
  estimateUsd,
  loadModelPrices,
  parseLlmSettings,
  priceOf,
  TARGET_APP_DEFAULTS,
  usd,
} from "@wayford/agent";
import {
  launchChromium,
  printFailure,
  RUNS_DIR,
  readBackend,
  scriptArgs,
  serveOnFixturePort,
  TARGET_APP_PORT,
} from "@wayford/agent/cli";
import { targetAppJargon } from "@wayford/core/fixtures";
import { walkRoutes } from "@wayford/filter/routes";
import pino from "pino";
import type { Browser } from "playwright";
import { actorBackends } from "./actor-backends.js";
import { axeLookup } from "./axe.js";
import { axeScanner } from "./axe-scan.js";
import { sharedBrowser, sharedChromium } from "./chromium.js";
import { loadConfigFromEnvFile } from "./config.js";
import { migrateDatabase, openDatabase } from "./db/database.js";
import { createRunner } from "./runner.js";
import {
  DEMO_PLAN,
  type DemoSummary,
  emptyStore,
  FAKE_JEV_MODEL,
  fakeDemoBackends,
  fakeDemoLlm,
  groundTruthWarnings,
  plannedDevices,
  plannedRuns,
  runFoldersFor,
  seedDemo,
  storedCounts,
  summaryText,
} from "./seed-demo.js";
import { exitOnTermination } from "./shutdown.js";
import { wallTime } from "./sweep-text.js";

const USAGE = `usage: pnpm seed:demo [--fake | --backend ${ActorBackendName.options.join("|")}] [--reset]`;

interface Arguments {
  fake: boolean;
  /** `jev` unless `--backend` names another: the gate passed (ADR 0001). */
  backend: ActorBackendName;
  reset: boolean;
}

/** The options, or why they cannot be read. */
function readArguments(argv: readonly string[]): Arguments | string {
  let values: { fake?: boolean; backend?: string; reset?: boolean };
  try {
    ({ values } = parseArgs({
      // Without pnpm's `--`, which `parseArgs` would read everything after as positionals.
      args: scriptArgs(argv),
      options: {
        fake: { type: "boolean" },
        backend: { type: "string" },
        reset: { type: "boolean" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  const read = readBackend(values.backend);
  if ("error" in read) return read.error;
  const fake = values.fake === true;
  if (fake && read.backend === "llm") {
    return "--fake and --backend llm do not combine: --fake fakes Jev, and the LLM fallback is for the real run";
  }
  return { fake, backend: read.backend ?? "jev", reset: values.reset === true };
}

/** Seeds the store and prints the summary: 0 when no run errored, 1 otherwise or on a refusal. */
async function main(args: Arguments): Promise<number> {
  const config = loadConfigFromEnvFile();
  // Read after `.env` is merged into `process.env`. `config.LOG_LEVEL` defaults to `info`, and
  // `jevActor` logs every decision at `info`, so an unset level is `warn` here.
  const logger = pino(
    { base: null, level: process.env.LOG_LEVEL ? config.LOG_LEVEL : "warn" },
    pino.destination(2),
  );
  const say = (line: string): void => console.error(line);
  // Refuses a bad sweep range before anything is read or served.
  const runCount = plannedRuns(DEMO_PLAN);

  // What the runs and the Analyst run on: the fakes, or the settings, which fail without a key.
  const settings = args.fake ? undefined : parseLlmSettings(process.env);
  const actor =
    settings === undefined
      ? {
          backends: fakeDemoBackends(),
          llm: fakeDemoLlm(),
          jevModel: FAKE_JEV_MODEL,
          model: FAKE_JEV_MODEL,
        }
      : {
          backends: actorBackends(settings).backends,
          // It checks every role's price, the Analyst's included, before anything runs.
          llm: createLlm(settings, { logger }),
          jevModel: settings.jevModel,
          model: actorModelOf(settings, args.backend),
        };
  if (settings === undefined) {
    say(`seed:demo  ${runCount} runs on ${args.backend}, ${actor.model}: fake, no key, no network`);
  } else {
    const price = priceOf(loadModelPrices(), actor.model);
    say(`seed:demo  ${runCount} runs on ${args.backend}, ${actor.model}`);
    say(
      `estimate   at most ${usd(estimateUsd(price, runCount, DEFAULT_MAX_STEPS))} for the runs, if each took ${DEFAULT_MAX_STEPS} steps`,
    );
  }

  migrateDatabase(config.DATABASE_URL);
  const db = openDatabase(config.DATABASE_URL);
  try {
    const runFolders = runFoldersFor(config.DATABASE_URL, RUNS_DIR);
    const folders =
      runFolders !== undefined
        ? `and their run folders under ${runFolders}`
        : `but keeps their run folders, since DATABASE_URL is not the default database`;
    const counts = await storedCounts(db);
    if (!args.reset && counts.runs + counts.reports + counts.sweeps > 0) {
      console.error(
        `the database already holds ${counts.runs} runs, ${counts.reports} reports and ${counts.sweeps} sweeps; rerun with --reset, which deletes them ${folders}`,
      );
      return 1;
    }
    const groundTruthDir = join(RUNS_DIR, "ground-truth");
    for (const warning of await groundTruthWarnings(groundTruthDir, DEMO_PLAN.tasks)) say(warning);

    // Before Chromium launches: Playwright's handlers keep a SIGTERM from ending the process.
    exitOnTermination();
    const setup = performance.now();
    // The walk serves its own app, so the two start together, as the sweep CLI starts them. The
    // plan's hard goal has a route table, so there is always something to walk.
    const [served, walked] = await Promise.allSettled([
      serveOnFixturePort(),
      walkRoutes(plannedDevices(DEMO_PLAN)),
    ]);
    if (served.status === "rejected") throw served.reason;
    const app = served.value;
    // Every browser this process launched for its runs, so `finally` closes them.
    const launched: Browser[] = [];
    try {
      if (walked.status === "rejected") throw walked.reason;
      say(
        `setup      ${wallTime(performance.now() - setup)}: the target app served on ${TARGET_APP_PORT}, walked`,
      );
      if (args.reset) {
        await emptyStore(db, runFolders);
        say(
          `reset      deleted ${counts.runs} runs, ${counts.reports} reports and ${counts.sweeps} sweeps, ${folders}`,
        );
      }

      // The fixtures' origin, where the tasks start, as `server.ts` has it, for the runner and the
      // reports. Not `app.origin`: Vite reports `127.0.0.1` there under
      // `--dns-result-order=ipv4first`, and every set would then run as another site, without the
      // app's parameters and jargon list.
      const targetAppOrigin = `http://localhost:${TARGET_APP_PORT}`;
      // One Chromium for every run and every axe-core scan, as `server.ts` shares it.
      const browser = sharedBrowser(async () => {
        const launch = await launchChromium();
        launched.push(launch);
        return launch;
      });
      const runner = createRunner({
        db,
        run: sharedChromium(browser),
        backends: actor.backends,
        defaultBackend: args.backend,
        targetAppOrigin,
        // The app's defaults, as the arena's runs: the walk measured the same page.
        params: TARGET_APP_DEFAULTS,
        jargon: targetAppJargon,
        runsDir: RUNS_DIR,
        // The one the reports read, so a set's step cap and its report's Scout line agree.
        groundTruthDir,
        logger,
      });
      let summary: DemoSummary;
      try {
        summary = await seedDemo(
          {
            db,
            runner,
            backend: args.backend,
            llm: actor.llm,
            walks: walked.value,
            groundTruthDir,
            jevModel: actor.jevModel,
            // The report's axe findings (s4-06): each page the runs stood on, scanned once on the
            // app served here and stored under its URL on the runs' origin, or read from the store
            // when scanned before.
            axe: axeLookup({
              db,
              scan: axeScanner({ browser, targetAppOrigin, servedOrigin: app.origin }),
            }),
            targetAppOrigin,
            logger,
            say,
          },
          DEMO_PLAN,
        );
      } catch (error) {
        // Only a failure once the seed has started storing leaves a store to start over from.
        printFailure(error);
        console.error("Nothing resumes a seed: rerun it with --reset.");
        return 1;
      }
      console.log(summaryText(summary));
      return summary.outcomes.error + summary.outcomes.missing > 0 ? 1 : 0;
    } finally {
      for (const browser of launched) await browser.close();
      await app.close();
    }
  } finally {
    db.$client.close();
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
