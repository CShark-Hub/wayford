/**
 * Scout on one stored task, run by hand (s4-10,
 * `docs/specs/2026-10-07-s4-10-scout-sweep-any-task.md`, "io: scout-cli.ts"):
 * `pnpm --filter @wayford/io scout -- --task <id>`. It is
 * `POST /tasks/:id/scout` without the server. agent's `scout` CLI cannot read io's database, since
 * agent never imports io, so a stored task is scouted from here; agent's keeps the fixture pair.
 *
 * Scout is the real model on the key in the root `.env`, on the `scout` role, and every call is
 * billed. The ground truth goes to the repository's `runs/ground-truth/<task id>.json`, where the
 * io server's Scout writes and the report reads it, and the attempts' runs under
 * `runs/ground-truth/attempts/`.
 *
 * The task is any stored task, or a fixture. Off the target app nothing is served or built, and
 * the attempts get no parameters. On it, what already answers on 5174 is reused, a running
 * `pnpm dev` or preview, and a build is served only when nothing does. The dev server is said out
 * loud: `docs/STACK.md` wants a build for seeded runs.
 *
 * It is one of six io entry points, with `server.ts`, the `analyse` CLI, the sweep CLI,
 * `seed:demo` and the illustration capture CLI, that load agent's runtime and Playwright, so it
 * stays out of the barrel, and no test imports it: it loads `.env` and bills.
 *
 * Exit 0 when the file is written, whether or not the goal was reached: a goal Scout did not
 * reach is a result. 1 for a task that is neither stored nor bundled, or any failure. 2 for a
 * usage error.
 */
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parseLlmSettings, runActor, TARGET_APP_DEFAULTS } from "@wayford/agent";
import {
  attemptLine,
  launchChromium,
  printFailure,
  RUNS_DIR,
  scriptArgs,
  siteLine,
  TARGET_APP_ORIGIN,
  targetAppOnFixturePort,
} from "@wayford/agent/cli";
import { scout, scoutSummary } from "@wayford/agent/scout";
import { TaskId, WayfordError } from "@wayford/core";
import pino from "pino";
import { loadConfigFromEnvFile } from "./config.js";
import { migrateDatabase, openDatabase } from "./db/database.js";
import { loadTaskOrFixture } from "./db/tasks.js";
import { onTargetApp } from "./runner.js";
import { exitOnTermination } from "./shutdown.js";

/** Where the io server's Scout writes too, and the report reads (`server.ts`). */
const GROUND_TRUTH_DIR = join(RUNS_DIR, "ground-truth");

const USAGE = "usage: pnpm --filter @wayford/io scout -- --task <id>";

/** The task id, or why it cannot be read. */
function readArguments(argv: readonly string[]): { taskId: TaskId } | string {
  // Without pnpm's `--`, which `parseArgs` would read everything after as positionals.
  const args = scriptArgs(argv);
  let values: { task?: string };
  try {
    ({ values } = parseArgs({
      args,
      options: { task: { type: "string" } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  if (values.task === undefined) return "missing --task";
  // Checked before anything reads it: only a valid id reaches the database and a file path.
  const task = TaskId.safeParse(values.task);
  if (!task.success) return `--task ${values.task} is no task id: ${task.error.issues[0]?.message}`;
  return { taskId: task.data };
}

/** Scout on the task, and the exit code. */
async function main({ taskId }: { taskId: TaskId }): Promise<number> {
  const config = loadConfigFromEnvFile();
  // The root `.env` is merged into `process.env` by now, so its key is read too.
  const settings = parseLlmSettings(process.env);

  migrateDatabase(config.DATABASE_URL);
  const db = openDatabase(config.DATABASE_URL);
  try {
    const task = await loadTaskOrFixture(db, taskId);
    if (task === undefined) {
      throw new WayfordError("task_not_found", `no task ${taskId}, stored or in core's fixtures`);
    }

    // Log lines to stderr, without pid or hostname, so stdout is the printout alone.
    const logger = pino({ base: null, level: config.LOG_LEVEL }, pino.destination(2));
    // Before Chromium launches: Playwright's handlers keep a SIGTERM from ending the process.
    exitOnTermination();

    const onApp = onTargetApp(task, TARGET_APP_ORIGIN);
    const app = onApp ? await targetAppOnFixturePort() : undefined;
    console.log(`site: ${siteLine(new URL(task.startUrl).origin, app?.reused)}`);
    try {
      const browser = await launchChromium();
      try {
        let usd = 0;
        console.log(`\n${task.id}: ${task.goal}`);
        const truth = await scout({
          run: (options) => runActor({ ...options, browser }),
          task,
          ...(onApp && { params: TARGET_APP_DEFAULTS }),
          dir: GROUND_TRUTH_DIR,
          settings,
          logger,
          onEvent: (event) => {
            if (event.type === "runFinished" || event.type === "runFailed") usd += event.cost.usd;
            const line = attemptLine(event);
            if (line !== undefined) console.log(line);
          },
        });
        const file = join(GROUND_TRUTH_DIR, `${truth.taskId}.json`);
        console.log(`\n${scoutSummary(truth, usd, file)}`);
        return 0;
      } finally {
        await browser.close();
      }
    } finally {
      // A no-op for an app this command reused: it closes only what it served.
      await app?.close();
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
