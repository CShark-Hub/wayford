/**
 * A task's report, built, stored and printed by hand:
 * `pnpm --filter @wayford/io analyse -- --task <task id> [--backend jev|llm]`.
 * It is `POST /reports/:taskId` without HTTP (`docs/specs/2026-10-05-s4-04-analyst.md`, "io:
 * storage, routes, CLI"): the latest stored run per persona and seed on the backend, `jev` when
 * `--backend` is absent, as `seed:demo` runs, read from the database `DATABASE_URL` names; one
 * Analyst call on the `analyst` role, with the key in the root `.env`, billed; the report stored
 * in place of the task's report before it, so the report screen shows what was printed.
 *
 * The report goes to stdout as text (`reportText`), its costs in its header, and log lines go to
 * stderr, so the output can be pasted. For the hard goal, the target app is built, served and
 * walked once for the route facts, which takes tens of seconds and launches Chromium; it is served
 * on a free port, so a running `pnpm dev` can stay. Scout's ground truth is read from the
 * repository's `runs/ground-truth/`, where `pnpm --filter @wayford/agent scout` writes it.
 *
 * Exit 0 when the report is printed. 1 for a usage error, a task that is neither stored nor
 * bundled, no run of it on the backend, or any failure, the model call included.
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createLlm, parseLlmSettings } from "@wayford/agent";
import { ReportBackend, TaskId, WayfordError } from "@wayford/core";
import { profileFixtures, targetAppJargon } from "@wayford/core/fixtures";
import pino from "pino";
import { analyseAndStore } from "./analyst.js";
import { routeFacts } from "./analyst-routes.js";
import { reportText } from "./analyst-text.js";
import { loadConfigFromEnvFile } from "./config.js";
import { migrateDatabase, openDatabase } from "./db/database.js";

/** The repository's `runs/`, found from this file, as `server.ts` finds it. */
const RUNS_DIR = fileURLToPath(new URL("../../../runs/", import.meta.url));

const USAGE = `usage: pnpm --filter @wayford/io analyse -- --task <task id> [--backend ${ReportBackend.options.join("|")}]`;

interface Arguments {
  taskId: TaskId;
  backend: ReportBackend;
}

/**
 * The two options, or why they cannot be read. pnpm forwards the `--` that separates its own
 * options from the script's, and only a leading one is pnpm's, so only that one is dropped, as
 * agent's `scriptArgs` drops it.
 */
function readArguments(argv: readonly string[]): Arguments | string {
  const args = argv[0] === "--" ? argv.slice(1) : [...argv];
  let values: { task?: string; backend?: string };
  try {
    ({ values } = parseArgs({
      args,
      options: { task: { type: "string" }, backend: { type: "string" } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  if (values.task === undefined) return "--task is required";
  // Checked before anything reads it: only a valid id reaches the database and a file path.
  const task = TaskId.safeParse(values.task);
  if (!task.success) {
    return `--task ${values.task} is no task id: ${task.error.issues[0]?.message}`;
  }
  const backend = ReportBackend.safeParse(values.backend ?? "jev");
  if (!backend.success) {
    return `--backend is one of ${ReportBackend.options.join(", ")}, got ${values.backend}`;
  }
  return { taskId: task.data, backend: backend.data };
}

/** Builds, stores and prints the report: 0 when printed, 1 when there is nothing to analyse. */
async function main({ taskId, backend }: Arguments): Promise<number> {
  const config = loadConfigFromEnvFile();
  // The root `.env` is already merged into `process.env` here, so its key is read too.
  const settings = parseLlmSettings(process.env);
  // Log lines to stderr, without pid or hostname, so stdout is the report alone.
  const logger = pino({ level: config.LOG_LEVEL, base: null }, pino.destination(2));
  const llm = createLlm(settings, { logger });

  // Idempotent, so the command works on a fresh clone and on an up-to-date database alike.
  migrateDatabase(config.DATABASE_URL);
  const db = openDatabase(config.DATABASE_URL);
  try {
    const analysis = await analyseAndStore(
      {
        db,
        llm,
        routes: routeFacts({
          devices: profileFixtures.map((profile) => profile.device),
          jargon: targetAppJargon,
        }),
        groundTruthDir: join(RUNS_DIR, "ground-truth"),
        jevModel: settings.jevModel,
        logger,
      },
      taskId,
      backend,
    );
    if (!analysis.ok) {
      console.error(analysis.error);
      return 1;
    }
    console.log(reportText(analysis.report));
    return 0;
  } finally {
    db.$client.close();
  }
}

const args = readArguments(process.argv.slice(2));
if (typeof args === "string") {
  console.error(`${args}\n${USAGE}`);
  process.exitCode = 1;
} else {
  try {
    process.exitCode = await main(args);
  } catch (error) {
    // A `WayfordError` by its code, `LlmError` included; anything else is a bug, printed whole.
    // Never the settings: they hold the key.
    if (error instanceof WayfordError) console.error(`${error.code}: ${error.message}`);
    else console.error(error);
    process.exitCode = 1;
  }
}
