/**
 * A sweep on the real model, run by hand (s4-05, `docs/specs/2026-10-05-s4-05-sweep.md`, §6):
 * `pnpm --filter @wayford/io sweep -- --task <id> --persona <id|label> --axis contrast|maxElements
 * --from <n> --to <n> --step <n> --seeds <n|a-b> [--backend llm|jev] [--max-usd <n>]`.
 *
 * One task, one persona, one capability, the same seeds at every value, laxest first, through
 * `runSweep` on io's runner, as `POST /runs` runs a set. The runs, their files and the sweep are
 * stored where the io server stores them, so the dashboard and `GET /sweeps` see them.
 *
 * The task is any stored task, or a fixture (s4-10). Cheapest first: the arguments, then the env,
 * the database, the task and the persona, then every refusal (Jev off the target app, the range,
 * the axis on this persona, the cost estimate), all before anything is served or a browser
 * launched. Off the target app nothing is served or built. On it, the target app already
 * answering on 5174 is reused, a running `pnpm dev` or preview, and a build is served only when
 * nothing does. The header's `site` line says which, and when it is the dev server, that
 * `docs/STACK.md` wants a build. A sweep on the hard goal builds all the same: its route walk
 * serves its own copy on a free port (`walkRoutes`).
 *
 * It is one of six io entry points, with `server.ts`, the `analyse` CLI, the Scout CLI,
 * `seed:demo` and the illustration capture CLI, that load agent's runtime and Playwright, so it
 * stays out of the barrel, and no test imports it: it loads `.env` and starts billed runs.
 *
 * Exit 0 when every value ran with no `error` run, boundary or not: a boundary is a measurement.
 * 1 for a refusal, a failure, a stop for spend, or any errored run, after the table. 2 for a usage
 * error.
 */
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  type ActorBackendName,
  actorModelOf,
  checkEstimate,
  DEFAULT_MAX_STEPS,
  loadModelPrices,
  parseLlmSettings,
  priceOf,
  TARGET_APP_DEFAULTS,
  usd,
} from "@wayford/agent";
import {
  BACKEND_USAGE,
  launchChromium,
  printFailure,
  RUNS_DIR,
  readBackend,
  readDecimal,
  readMaxUsd,
  readSeeds,
  scriptArgs,
  siteLine,
  TARGET_APP_ORIGIN,
  targetAppOnFixturePort,
} from "@wayford/agent/cli";
import {
  MAX_RUN_SET_SEEDS,
  type Profile,
  type Seed,
  SweepAxis,
  type SweepValue,
  sweepPlan,
  type Task,
  WayfordError,
} from "@wayford/core";
import { profileFixtures, targetAppJargon } from "@wayford/core/fixtures";
import { hasRouteTable, routeOpenSeeds, routesFor, walkRoutes } from "@wayford/filter/routes";
import pino from "pino";
import type { Browser } from "playwright";
import { actorBackends } from "./actor-backends.js";
import { sharedBrowser, sharedChromium } from "./chromium.js";
import { loadConfigFromEnvFile } from "./config.js";
import { type Db, migrateDatabase, openDatabase } from "./db/database.js";
import { loadTaskOrFixture } from "./db/tasks.js";
import { createRunner, onTargetApp, refuseJevOffTargetApp, stepCapFor } from "./runner.js";
import { exitOnTermination } from "./shutdown.js";
import { routeOpenFrom, runSweep } from "./sweep.js";
import { boundaryLine, percent, routeOpenShare, shown, wallTime } from "./sweep-text.js";

const DEFAULT_MAX_USD = 2;
const REQUIRED = ["task", "persona", "axis", "from", "to", "step", "seeds"];

const USAGE = [
  "usage: pnpm --filter @wayford/io sweep -- --task <id> --persona <id|label>",
  `  --axis ${SweepAxis.options.join("|")} --from <n> --to <n> --step <n> --seeds <a-b | n>`,
  `  ${BACKEND_USAGE} [--max-usd <n>]`,
].join("\n");

interface Arguments {
  task: string;
  persona: string;
  axis: SweepAxis;
  from: number;
  to: number;
  step: number;
  seeds: Seed[];
  /** `--seeds` as given, `n` or `a-b`, for the header. */
  seedsText: string;
  /** Absent: `LLM_ACTOR_BACKEND`'s, read once `.env` is loaded, as `POST /runs` decides. */
  backend: ActorBackendName | undefined;
  maxUsd: number;
}

/** The options, or why they cannot be read. */
function readArguments(argv: readonly string[]): Arguments | string {
  // Without pnpm's `--`, which `parseArgs` would read everything after as positionals.
  const args = scriptArgs(argv);
  const names = [...REQUIRED, "backend", "max-usd"];
  let values: Partial<Record<string, string>>;
  try {
    ({ values } = parseArgs({
      args,
      options: Object.fromEntries(names.map((name) => [name, { type: "string" as const }])),
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  const missing = REQUIRED.filter((name) => values[name] === undefined);
  if (missing.length > 0) return `missing ${missing.map((name) => `--${name}`).join(", ")}`;
  const { task = "", persona = "", from = "", to = "", step = "", seeds = "" } = values;

  const axis = SweepAxis.safeParse(values.axis);
  if (!axis.success) return `--axis is ${SweepAxis.options.join(" or ")}, got ${values.axis}`;

  // The range itself, its order and its step, is `sweepValues`' to judge: a refusal, not usage.
  const ends = { from: readDecimal(from), to: readDecimal(to), step: readDecimal(step) };
  for (const [name, value] of Object.entries(ends)) {
    if (Number.isNaN(value)) return `--${name} is a plain positive number, got ${values[name]}`;
  }

  const seedSet = readSeeds(seeds, MAX_RUN_SET_SEEDS);
  if (typeof seedSet === "string") return seedSet;

  const backend = readBackend(values.backend);
  if ("error" in backend) return backend.error;

  const maxUsd = readMaxUsd(values["max-usd"], DEFAULT_MAX_USD);
  if (typeof maxUsd === "string") return maxUsd;

  return {
    task,
    persona,
    axis: axis.data,
    ...ends,
    seeds: seedSet,
    seedsText: seeds,
    ...backend,
    maxUsd,
  };
}

/** A stored task, else a fixture task: fixtures are not seeded into the database. */
async function findTask(db: Db, id: string): Promise<Task> {
  const task = await loadTaskOrFixture(db, id);
  if (task !== undefined) return task;
  throw new WayfordError("task_not_found", `no task ${id}, stored or in core's fixtures`);
}

/** A persona fixture by id, or by its label in any case: `prof_vera` or `vera`. */
function findPersona(text: string): Profile {
  const profile = profileFixtures.find(
    (fixture) => fixture.id === text || fixture.label.toLowerCase() === text.toLowerCase(),
  );
  if (profile !== undefined) return profile;
  const known = profileFixtures.map((fixture) => `${fixture.id} (${fixture.label})`).join(", ");
  throw new WayfordError("profile_not_found", `no persona ${text}; one of ${known}`);
}

const COLUMNS = ["value", "success", "rate", "route-open", "errors"];
const WIDTHS = [8, 9, 6, 12, 7];

function tableLine(cells: readonly string[]): string {
  return cells.map((cell, i) => cell.padStart(WIDTHS[i] ?? 0)).join("");
}

function valueLine(axis: SweepAxis, row: SweepValue, seeds: number): string {
  return tableLine([
    shown(axis, row.value),
    `${row.successes}/${seeds}`,
    percent(row.successes, seeds),
    routeOpenShare(row, seeds),
    String(row.errors),
  ]);
}

/** The sweep, and its exit code: 0 when every value ran with no error run, 1 otherwise. */
async function main(args: Arguments): Promise<number> {
  const config = loadConfigFromEnvFile();
  // The root `.env` is merged into `process.env` by now, so its key is read too.
  const settings = parseLlmSettings(process.env);
  const backend = args.backend ?? settings.actorBackend;
  // The estimate reads the price of the model the backend runs: Jev's on Jev, as `calibrate` does.
  const model = actorModelOf(settings, backend);

  migrateDatabase(config.DATABASE_URL);
  const db = openDatabase(config.DATABASE_URL);
  try {
    const task = await findTask(db, args.task);
    const profile = findPersona(args.persona);

    // Log lines to stderr, without pid or hostname, so stdout is the table alone and can be pasted.
    const logger = pino({ base: null, level: config.LOG_LEVEL }, pino.destination(2));
    // Where Scout writes each task's ground truth, as `server.ts` has it: the sweep's step cap.
    const groundTruthDir = join(RUNS_DIR, "ground-truth");

    // Every refusal before anything is served or launched. `runSweep` checks the plan again.
    refuseJevOffTargetApp(task, backend, TARGET_APP_ORIGIN);
    const values = sweepPlan(profile, args.axis, args.from, args.to, args.step);
    // Priced on the cap its runs get: Scout's can be up to twice the default.
    const maxSteps = (await stepCapFor(groundTruthDir, task, logger)) ?? DEFAULT_MAX_STEPS;
    const estimate = checkEstimate(
      priceOf(loadModelPrices(), model),
      values.length * args.seeds.length,
      maxSteps,
      args.maxUsd,
      "sweep_over_budget",
    );
    // Before Chromium launches: Playwright's handlers keep a SIGTERM from ending the process.
    exitOnTermination();

    // The app is served only for a task on it, and only when nothing already serves it. The walk,
    // once on the persona's device, serves its own app, so the two start together. A task with no
    // route table, every task off the app among them, has nothing to walk.
    const onApp = onTargetApp(task, TARGET_APP_ORIGIN);
    const [served, walked] = await Promise.allSettled([
      onApp ? targetAppOnFixturePort() : undefined,
      hasRouteTable(task.id) ? walkRoutes([profile.device]) : undefined,
    ]);
    if (served.status === "rejected") throw served.reason;
    const app = served.value;
    // Every browser this process launched for its runs, so `finally` closes them: nothing in
    // `sharedBrowser` does.
    const launched: Browser[] = [];
    try {
      if (walked.status === "rejected") throw walked.reason;
      // Every swept value reads the same walk: sweeping moves no device.
      const routeOpen = routeOpenFrom(
        walked.value && routesFor(walked.value, task.id, profile.device),
        targetAppJargon,
        routeOpenSeeds,
      );

      const browser = sharedBrowser(async () => {
        const launch = await launchChromium();
        launched.push(launch);
        return launch;
      });
      const runner = createRunner({
        db,
        run: sharedChromium(browser),
        ...actorBackends(settings),
        // A task off it gets neither the parameters nor the jargon list (ADR 0003, D2).
        targetAppOrigin: TARGET_APP_ORIGIN,
        // The app's defaults, as the arena's runs: the walk measured the same page.
        params: TARGET_APP_DEFAULTS,
        jargon: targetAppJargon,
        runsDir: RUNS_DIR,
        groundTruthDir,
        logger,
      });

      const seedCount = args.seeds.length;
      const rows: SweepValue[] = [];
      const started = performance.now();
      let spent = 0;
      let failure: unknown;
      try {
        await runSweep(
          {
            db,
            runner,
            logger,
            routeOpen,
            maxUsd: args.maxUsd,
            // The header waits for the sweep's id, which `runSweep` mints.
            onStart: (begun) =>
              console.log(
                [
                  `task       ${task.id}`,
                  `site       ${siteLine(new URL(task.startUrl).origin, app?.reused)}`,
                  `persona    ${profile.id} (${profile.label})`,
                  `axis       ${args.axis}, ${values.map((value) => shown(args.axis, value)).join(", ")}`,
                  `backend    ${backend}, ${model}`,
                  `seeds      ${args.seedsText}`,
                  `sweep      ${begun.id}`,
                  "",
                  tableLine(COLUMNS),
                ].join("\n"),
              ),
            onValue: (row, spentUsd) => {
              rows.push(row);
              spent = spentUsd;
              console.log(valueLine(args.axis, row, seedCount));
            },
          },
          {
            task,
            profile,
            axis: args.axis,
            from: args.from,
            to: args.to,
            step: args.step,
            seeds: args.seeds,
            backend,
          },
        );
      } catch (error) {
        failure = error;
      }

      const errors = rows.reduce((sum, row) => sum + row.errors, 0);
      console.log(
        [
          "",
          boundaryLine(args.axis, rows, seedCount),
          // `runSweep` stores the sweep complete exactly when it returns.
          `status     ${failure === undefined ? "complete" : "incomplete"}, ${rows.length} of ${values.length} values`,
          `wall time  ${wallTime(performance.now() - started)}`,
          `spent      ${usd(spent)} (estimated ${usd(estimate)}, limit ${args.maxUsd} USD)`,
          ...(errors > 0
            ? [`errors     ${errors} runs ended in an error or were never stored`]
            : []),
        ].join("\n"),
      );
      if (failure !== undefined) throw failure;
      return errors > 0 ? 1 : 0;
    } finally {
      for (const launch of launched) await launch.close();
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
