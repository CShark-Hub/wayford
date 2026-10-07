/**
 * The io process: read the config, open the database, build the Extractor's `Llm` and the Actor's
 * backends, listen. Everything worth testing lives in `app.ts`, so this file does nothing on import
 * that a test would want. `pnpm dev` runs it under `tsx watch`.
 *
 * It, the `analyse` CLI, the sweep CLI, `sweep-cli.ts`, and `seed:demo`, `seed-demo-cli.ts`, are
 * the only io entry points that load agent's runtime and Playwright, through `actor-backends.ts`,
 * `analyst-routes.ts`, `axe-scan.ts`, `chromium.ts`, `live-measure.ts` and `seed-demo.ts`
 * (`docs/specs/2026-10-02-s4-03-runs-api.md`, decision log, "The barrel").
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createLlm, parseLlmSettings, TARGET_APP_DEFAULTS } from "@wayford/agent";
import { profileFixtures, targetAppJargon } from "@wayford/core/fixtures";
import pino from "pino";
import { actorBackends } from "./actor-backends.js";
import { routeFacts } from "./analyst-routes.js";
import { createApp } from "./app.js";
import { axeScanner } from "./axe-scan.js";
import { sharedBrowser, sharedChromium } from "./chromium.js";
import { loadConfigFromEnvFile } from "./config.js";
import { migrateDatabase, openDatabase } from "./db/database.js";
import { liveMeasure } from "./live-measure.js";
import { exitOnTermination } from "./shutdown.js";

/**
 * The repository's `runs/`, found from this file, as `run:one` finds it: one folder for every
 * run's files, gitignored.
 */
const RUNS_DIR = fileURLToPath(new URL("../../../runs/", import.meta.url));

/** The target app, where `pnpm dev` and its production preview both serve it (`docs/STACK.md`, "Ports"). */
const TARGET_APP_ORIGIN = "http://localhost:5174";

// Before the first run or measurement launches Chromium: Playwright's handlers keep a SIGTERM
// from ending io.
exitOnTermination();

const config = loadConfigFromEnvFile();
const logger = pino({ level: config.LOG_LEVEL });
// The root `.env` is already merged into `process.env` here, so its key is read too.
const settings = parseLlmSettings(process.env);
// Never the settings: they hold the key.
logger.info({ actorBackend: settings.actorBackend }, "default Actor backend, LLM_ACTOR_BACKEND");
const llm = createLlm(settings, { logger });

// Idempotent, so `pnpm dev` works on a fresh clone and on an up-to-date database alike.
migrateDatabase(config.DATABASE_URL);
const db = openDatabase(config.DATABASE_URL);

// One Chromium for every run, every measurement and every axe-core scan, launched by the first one.
const browser = sharedBrowser();

const app = createApp({
  llm,
  db,
  runsDir: RUNS_DIR,
  run: sharedChromium(browser),
  // The preview's live page (s3-05), at the app's defaults like the arena's runs.
  measure: liveMeasure({ browser, origin: TARGET_APP_ORIGIN }),
  // The preview's axe-core card and the report's axe findings (s4-06), scanned on desktop.
  scanAxe: axeScanner({ browser, origin: TARGET_APP_ORIGIN }),
  // One `Llm` per run, so each run's log lines carry its run id.
  ...actorBackends(settings),
  // A run set whose task starts here is on the target app, and only those get its parameters and
  // jargon list; a task on any other site gets neither (ADR 0003, D2).
  targetAppOrigin: TARGET_APP_ORIGIN,
  // The arena runs on the app's defaults (s3-03, Out of scope).
  params: TARGET_APP_DEFAULTS,
  // The target app's jargon list, so a run perceives what the preview shows (K2, s1-05).
  jargon: targetAppJargon,
  // A report's route facts: the target app walked on the first report of the hard goal, on every
  // persona's device, and read with the jargon the runs were perceived with.
  routes: routeFacts({
    devices: profileFixtures.map((profile) => profile.device),
    jargon: targetAppJargon,
  }),
  // Where `pnpm --filter @wayford/agent scout` writes each task's ground truth.
  groundTruthDir: join(RUNS_DIR, "ground-truth"),
  // Jev's pinned model, which marks a stored run as a Jev run.
  jevModel: settings.jevModel,
  logger,
});

// localhost, like the two Vite servers: the API has no auth and is not for the network.
serve({ fetch: app.fetch, port: config.PORT, hostname: "localhost" }, (info) => {
  console.log(`io listening on http://localhost:${info.port}`);
});
