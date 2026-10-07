/**
 * The demo's data in one function (s4-07, `docs/specs/2026-10-06-s4-07-seed-demo.md`): Ada, Kai and
 * Vera on both target-app goals, the Analyst on each, and one sweep per axis, all on one Actor
 * backend. `seed-demo-cli.ts` calls it with `DEMO_PLAN`, its test with a reduced plan.
 *
 * Beside it, what the command needs before it runs: the store's counts and its reset, and the
 * ground-truth check. And what `--fake` runs on: the real Jev backend with a fake `decide` that
 * answers from the page it is shown, and a fake Analyst that answers from the case it is sent. No
 * key and no network, and every answer is checked as the real one would be.
 *
 * It loads agent's runtime and filter's routes, which load Playwright, so it stays out of io's
 * barrel, as `sweep-cli.ts` and `chromium.ts` do. Nothing runs on import.
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  type ActorBackendName,
  type CompleteRequest,
  type DecideRequest,
  jevActor,
  type Llm,
  parseLlmSettings,
  usd,
} from "@wayford/agent";
import { fakeLlm } from "@wayford/agent/fake";
import {
  type DeviceKind,
  type Profile,
  type Report,
  RUN_OUTCOMES,
  RunId,
  type RunOutcome,
  type Seed,
  type Sweep,
  sweepPlan,
  type Task,
  WayfordError,
} from "@wayford/core";
import { profileFixture, targetAppJargon, taskFixture, taskFixtures } from "@wayford/core/fixtures";
import { routeOpenSeeds, routesFor, type WalkedRoute } from "@wayford/filter/routes";
import { TARGET_APP_ROUTES, type TargetAppRouteStep } from "@wayford/filter/serve-target-app";
import { z } from "zod";
import { type AnalystDeps, analyseAndStore, readGroundTruth } from "./analyst.js";
import { routeFactsFrom } from "./analyst-routes.js";
import { labelOf, NONE, plural } from "./analyst-text.js";
import { DEFAULT_DATABASE_URL } from "./config.js";
import { type Db, sqliteFilePath } from "./db/database.js";
import { loadRun } from "./db/runs.js";
import { races, reports, runs, sweeps } from "./db/schema.js";
import type { Runner, RunnerOptions } from "./runner.js";
import { ended, routeOpenFrom, runSweep, type SweepInput } from "./sweep.js";
import { boundaryLine, routeOpenShare, shown, wallTime } from "./sweep-text.js";

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/** One sweep of the plan, as `runSweep` takes it; the plan's seeds and the backend are the seed's. */
export type DemoSweep = Omit<SweepInput, "seeds" | "backend">;

export interface DemoPlan {
  personas: readonly Profile[];
  tasks: readonly Task[];
  /** The run sets' seeds, and every sweep's at every value (A20). */
  seeds: readonly Seed[];
  sweeps: readonly DemoSweep[];
}

const easyGoal = taskFixture("task_next-parcel");
const hardGoal = taskFixture("task_past-order");

/**
 * What `pnpm seed:demo` runs (`docs/PLAN.md` F11): Ada, Kai and Vera on both goals, seeds 1 to 10,
 * and the sweeps on `s4-05`'s ranges, Vera's contrast and Kai's `maxElements` on the hard goal.
 * 60 runs in the run sets and 140 in the sweeps.
 */
export const DEMO_PLAN: DemoPlan = {
  personas: [profileFixture("prof_ada"), profileFixture("prof_kai"), profileFixture("prof_vera")],
  tasks: [easyGoal, hardGoal],
  seeds: Array.from({ length: 10 }, (_, i) => i + 1),
  sweeps: [
    {
      task: hardGoal,
      profile: profileFixture("prof_vera"),
      axis: "contrast",
      from: 1.5,
      to: 4.5,
      step: 0.5,
    },
    {
      task: hardGoal,
      profile: profileFixture("prof_kai"),
      axis: "maxElements",
      from: 16,
      to: 4,
      step: 2,
    },
  ],
};

/**
 * How many runs the plan makes, the sweeps' values counted by core's `sweepPlan`, which refuses a
 * bad range or an axis the persona does not set before anything is run.
 */
export function plannedRuns(plan: DemoPlan): number {
  const sets = plan.tasks.length * plan.personas.length * plan.seeds.length;
  const swept = plan.sweeps.reduce(
    (sum, { profile, axis, from, to, step }) =>
      sum + sweepPlan(profile, axis, from, to, step).length * plan.seeds.length,
    0,
  );
  return sets + swept;
}

/**
 * The devices the target app is walked on for the plan: every run set persona's and every swept
 * persona's, each once, since a report and a sweep read the walk on their persona's device.
 */
export function plannedDevices(plan: DemoPlan): DeviceKind[] {
  const profiles = [...plan.personas, ...plan.sweeps.map(({ profile }) => profile)];
  return [...new Set(profiles.map(({ device }) => device))];
}

// ---------------------------------------------------------------------------
// The one function
// ---------------------------------------------------------------------------

/**
 * The Analyst's deps, its `llm` the real adapter or `fakeDemoLlm()`, with the route facts read off
 * `walks`; and what the runs and the progress need beside them.
 */
export interface SeedDemoDeps extends Omit<AnalystDeps, "routes"> {
  /** io's runner, on the backends the command picked. */
  runner: Runner;
  /** What every run set and sweep runs on, and what the reports read. */
  backend: ActorBackendName;
  /** The target app walked on `plannedDevices(plan)`. */
  walks: ReadonlyMap<DeviceKind, readonly WalkedRoute[]>;
  /** One progress line: each phase, and each sweep value as it settles. */
  say: (line: string) => void;
}

export interface DemoSummary {
  backend: ActorBackendName;
  /** The Actor models the stored runs name, each once. */
  models: string[];
  /** Every run the call started, by outcome; `missing` for a run never stored. */
  outcomes: Record<RunOutcome | "missing", number>;
  /** Runs outside any sweep; a sweep's runs are its values' `runIds`. */
  setRuns: number;
  /** Summed over the stored runs. The Analyst's cost is each report's own. */
  runsUsd: number;
  reports: Report[];
  sweeps: Sweep[];
  /** The three phases, from the first run started to the last sweep stored. */
  wallMs: number;
}

/**
 * Runs the plan into the store and sums up what it made, in three phases, each waiting for the
 * one before:
 * 1. every task's run set, queued together, so both share the runner's slots;
 * 2. the Analyst on each task, one after the other, before any sweep run is stored, so a report
 *    reads its run set alone, and a failed call leaves no other one running, and billing, after
 *    the command has closed the browser and the store;
 * 3. the sweeps, one after the other.
 *
 * A failure stops the seed where it is, and what was stored stays: the command is rerun with
 * `--reset` (task, Out of scope).
 */
export async function seedDemo(deps: SeedDemoDeps, plan: DemoPlan): Promise<DemoSummary> {
  const { db, runner, backend, walks, say } = deps;
  const started = performance.now();

  const setRuns = plan.tasks.flatMap((task) =>
    runner.start(task, plan.personas, plan.seeds, { backend }),
  );
  say(`run sets   ${setRuns.length} runs on ${backend}`);
  for (const { id } of setRuns) await ended(runner.live(id));

  const analyst = { ...deps, routes: routeFactsFrom(walks, targetAppJargon) };
  const stored: Report[] = [];
  for (const task of plan.tasks) {
    const analysis = await analyseAndStore(analyst, task.id, backend);
    // Only a task none of whose runs was stored gets here.
    if (!analysis.ok) throw new WayfordError("seed_demo_no_report", analysis.error);
    say(`report     ${task.id}, ${analysis.report.runCount} runs read`);
    stored.push(analysis.report);
  }

  const swept: Sweep[] = [];
  for (const sweep of plan.sweeps) {
    const { task, profile, axis } = sweep;
    const name = `${profile.label} ${axis}`;
    const seeds = plan.seeds.length;
    swept.push(
      await runSweep(
        {
          db,
          runner,
          logger: deps.logger,
          routeOpen: routeOpenFrom(
            routesFor(walks, task.id, profile.device),
            targetAppJargon,
            routeOpenSeeds,
          ),
          onValue: (row) =>
            say(
              `sweep      ${name} ${shown(axis, row.value)}: ${row.successes}/${seeds} got through, route open ${routeOpenShare(row, seeds)}`,
            ),
        },
        { ...sweep, seeds: plan.seeds, backend },
      ),
    );
  }
  const wallMs = performance.now() - started;

  const outcomes: DemoSummary["outcomes"] = {
    success: 0,
    gave_up: 0,
    budget_exceeded: 0,
    error: 0,
    missing: 0,
  };
  const models = new Set<string>();
  let runsUsd = 0;
  const ids = [
    ...setRuns.map(({ id }) => id),
    ...swept.flatMap(({ values }) => values.flatMap(({ runIds }) => runIds)),
  ];
  for (const id of ids) {
    const run = await loadRun(db, id);
    if (run === undefined) {
      outcomes.missing += 1;
      continue;
    }
    outcomes[run.outcome] += 1;
    runsUsd += run.cost.usd;
    models.add(run.modelIds.actor);
  }

  return {
    backend,
    models: [...models],
    outcomes,
    setRuns: setRuns.length,
    runsUsd,
    reports: stored,
    sweeps: swept,
    wallMs,
  };
}

const OUTCOME_WORDS: Record<RunOutcome | "missing", string> = {
  success: "success",
  gave_up: "gave up",
  budget_exceeded: "budget exceeded",
  error: "error",
  missing: "never stored",
};

/**
 * The summary as the command prints it to stdout, alone, so it pastes into the pitch notes: what
 * ran, by outcome, the reports, each sweep with its boundary as the sweep CLI words it, the wall
 * time and the cost. Only measured numbers, never a model maker's own.
 */
export function summaryText(summary: DemoSummary): string {
  const { outcomes, setRuns, sweeps: done, runsUsd } = summary;
  const sweepRuns = done.reduce(
    (sum, { values }) => sum + values.reduce((n, { runIds }) => n + runIds.length, 0),
    0,
  );
  const analystUsd = summary.reports.reduce((sum, report) => sum + report.cost.analyst.usd, 0);
  const made = setRuns + sweepRuns;
  // Every outcome, a 0 included, so "0 error" is said; "never stored" only when a run was not.
  const byOutcome = [...RUN_OUTCOMES, ...(outcomes.missing > 0 ? (["missing"] as const) : [])]
    .map((key) => `${outcomes[key]} ${OUTCOME_WORDS[key]}`)
    .join(", ");
  const lines = [
    `seed:demo on ${summary.backend}, ${summary.models.join(", ") || "no stored run"}`,
    `runs       ${made}: ${byOutcome}`,
    `           ${setRuns} in the run sets, ${sweepRuns} in ${plural(done.length, "sweep")}`,
    `reports    ${summary.reports.map((report) => report.taskId).join(", ")}`,
    ...done.flatMap((sweep) => [
      `sweep      ${labelOf(sweep.profileId)} ${sweep.axis}, ${shown(sweep.axis, sweep.from)} to ${shown(sweep.axis, sweep.to)}, ${sweep.id}`,
      boundaryLine(sweep.axis, sweep.values, sweep.seeds.length),
    ]),
    `wall time  ${wallTime(summary.wallMs)}`,
    `cost       ${usd(runsUsd + analystUsd)}: runs ${usd(runsUsd)}, Analyst ${usd(analystUsd)}`,
    `per run    ${made === 0 ? NONE : usd(runsUsd / made)}`,
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Before the seed: the store and the ground truth
// ---------------------------------------------------------------------------

/** How many runs, sweep runs included, reports and sweeps the store holds. */
export async function storedCounts(db: Db) {
  const [runCount, reportCount, sweepCount] = await Promise.all([
    db.$count(runs),
    db.$count(reports),
    db.$count(sweeps),
  ]);
  return { runs: runCount, reports: reportCount, sweeps: sweepCount };
}

/**
 * `--reset`: every run, report, sweep and race deleted in one transaction, so the Race's History
 * lists no race whose runs are gone, then, when `runsDir` is given,
 * each deleted run's folder under it, by its id. A `RunId` is `run_` and `[a-z0-9-]`, so the path
 * never leaves `runsDir`, and Scout's `ground-truth/` and the calibration reports beside the run
 * folders are never named. Tasks, profiles and the stored axe-core scans are kept.
 *
 * Without `runsDir` the folders stay: the command passes none for a database other than the
 * default one (`runFoldersFor`).
 */
export async function emptyStore(db: Db, runsDir?: string): Promise<void> {
  const deleted = db.transaction((tx) => {
    const gone = tx.delete(runs).returning({ id: runs.id }).all();
    tx.delete(reports).run();
    tx.delete(sweeps).run();
    tx.delete(races).run();
    return gone;
  });
  if (runsDir === undefined) return;
  for (const { id } of deleted) {
    if (!RunId.safeParse(id).success) continue;
    await rm(join(runsDir, id), { recursive: true, force: true, maxRetries: 3 });
  }
}

/**
 * The run folders `--reset` may delete: `runsDir` for the default database, which owns them, and
 * none for any other. Every database's runs write their folders into the one `runs/`, and a copy's
 * run ids are the original's, so a reset of a copy that deleted by id would empty the real store's
 * evidence. A spelling the comparison misses keeps the folders, never deletes another's.
 */
export function runFoldersFor(databaseUrl: string, runsDir: string): string | undefined {
  return sqliteFilePath(databaseUrl) === sqliteFilePath(DEFAULT_DATABASE_URL) ? runsDir : undefined;
}

/**
 * One warning per task with no ground-truth file in `dir`, since its report then opens with no
 * Scout line; `seed:demo` does not run Scout. Each file is read as the Analyst will read it: one
 * that cannot be read throws as the read failed, and one that is not a ground truth of its task
 * throws `invalid_ground_truth`, before anything is served or run.
 */
export async function groundTruthWarnings(dir: string, tasks: readonly Task[]): Promise<string[]> {
  const warnings: string[] = [];
  for (const task of tasks) {
    if ((await readGroundTruth(dir, task.id)) === undefined) {
      warnings.push(
        `warning: no ground truth for ${task.id} in ${dir}, so its report opens with no Scout line. Run pnpm --filter @wayford/agent scout first.`,
      );
    }
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// --fake: Jev and the Analyst, answering from what they are shown
// ---------------------------------------------------------------------------

/** The Actor model a fake run names: no screen should name Jev's real model on fake data. */
export const FAKE_JEV_MODEL = "fake-jev";

/** The easy goal's one path, the one calibration's fake follows. */
const EASY_PATH: readonly TargetAppRouteStep[] = [
  { page: "/", role: "link", name: "Your account" },
  { page: "/account", role: "link", name: "Delivery address" },
];

/** The routes to each goal by task id: the hard goal's A, B and C, the easy goal's one. */
const ROUTES_TO: Readonly<Record<string, readonly (readonly TargetAppRouteStep[])[]>> = {
  [hardGoal.id]: TARGET_APP_ROUTES.map(({ steps }) => steps),
  [easyGoal.id]: [EASY_PATH],
};

/** The share of the probability the options on a route take; the rest is spread over the others. */
const HIT_SHARE = 0.9;

/** Where the probability goes on a page where no option is on a route. */
const NO_HIT: Readonly<Record<string, number>> = { give_up: 0.5, back: 0.3, scroll_down: 0.2 };

/** A click option's words, as `jevOptions` writes them: `Click [e3], the link "Deliveries"`. */
const CLICK_OPTION = /^Click \[e[1-9][0-9]*\], the (\S+) ("(?:[^"\\]|\\.)*")$/;

/** U+2592, filter's `MASK_GLYPH` (`mask.ts`), which no package entry exports. */
const MASK_GLYPH = "▒";

/**
 * True when `shown` can be `known` read through the mask: the same length in code points, and
 * every character equal or masked. A mask keeps the name's length (`docs/RULES.md`, "The mask").
 */
function reads(shown: string, known: string): boolean {
  const seen = [...shown];
  const real = [...known];
  return (
    seen.length === real.length && seen.every((char, i) => char === real[i] || char === MASK_GLYPH)
  );
}

/** True when the option's words click the step's control, its name read through the mask. */
function clicks(words: string | undefined, step: TargetAppRouteStep): boolean {
  const match = CLICK_OPTION.exec(words ?? "");
  if (match?.[1] !== step.role || match[2] === undefined) return false;
  return reads(JSON.parse(match[2]), step.name);
}

/**
 * Jev's answer for one turn on the target app, from what the request holds: the goal, the page's
 * URL and the options, which name what the persona was shown. Per route to the goal, the option
 * that takes the latest of its steps this page offers is a hit, so a degraded link is followed, a
 * gone one is never offered, and a renamed one is no hit. The hits share `HIT_SHARE` and the other
 * options the rest, so the draw strays now and then; with no hit, the persona gives up, goes back
 * or scrolls. Pure: the run's decision stream does the drawing, in `jevActor`. `fakeLlm` checks
 * the answer with `choiceAnswer`, as the real adapter checks Jev's.
 */
export function fakeJevAnswer(request: DecideRequest) {
  const { state, question } = request;
  const { options } = question;
  const keys = Object.keys(options);
  const task = taskFixtures.find(({ goal }) => state.includes(`Your goal: ${goal}`));
  // History lines start "- On", so only the page has a `URL:` line, and it comes last.
  const url = state
    .split("\n")
    .findLast((line) => line.startsWith("URL: "))
    ?.slice("URL: ".length);
  const page = url === undefined ? undefined : new URL(url).pathname;

  const hits = new Set<string>();
  for (const steps of task === undefined ? [] : (ROUTES_TO[task.id] ?? [])) {
    // Latest first, so an open menu's item wins over the button that opened it.
    for (const step of steps.toReversed()) {
      if (step.page !== page) continue;
      const key = keys.find((offered) => clicks(options[offered], step));
      if (key !== undefined) {
        hits.add(key);
        break;
      }
    }
  }

  const probabilities = Object.fromEntries(
    keys.map((key) => [
      key,
      hits.size === 0
        ? (NO_HIT[key] ?? 0)
        : hits.has(key)
          ? HIT_SHARE / hits.size
          : (1 - HIT_SHARE) / (keys.length - hits.size),
    ]),
  );
  const confidence = Math.max(...Object.values(probabilities));
  const choice = keys.find((key) => probabilities[key] === confidence) ?? "give_up";
  return { choice, confidence, probabilities };
}

/** A run's header line in the Analyst's case (`analyst-digest.ts`, `runLines`). */
const RUN_HEADER = /^run (run_[a-z0-9-]+): (.+), seed (\d+), ([a-z_]+), (\d+) steps?, /;

/** Words every fake Analyst field carries, so nobody takes it for a reading. */
const FAKE_WORDS =
  "Written by seed:demo --fake. Run pnpm seed:demo with a key for the Analyst's own";

/**
 * The Analyst's answer, from the request it is sent: a recommendation for every finding the answer
 * schema asks about, and one hypothesis on the last step of the first run in the case that did not
 * succeed, so the report holds every finding type on real evidence. `fakeLlm` parses it with the
 * schema `analyst.ts` sends, and the Analyst's own checks keep or drop it as they would a model's.
 */
export function fakeAnalystAnswer(request: CompleteRequest<z.ZodObject>) {
  const asked = request.schema.shape.recommendations;
  const keys = asked instanceof z.ZodObject ? Object.keys(asked.shape) : [];
  const theCase = request.messages.findLast((message) => message.role === "user")?.content ?? "";
  const failed = theCase
    .split("\n")
    .map((line) => RUN_HEADER.exec(line))
    .find((match) => match !== null && match[4] !== "success" && Number(match[5]) > 0);

  return {
    recommendations: Object.fromEntries(keys.map((key) => [key, `${FAKE_WORDS} recommendation.`])),
    hypotheses:
      failed?.[1] === undefined
        ? []
        : [
            {
              title: `Fake hypothesis: ${failed[2]}, seed ${failed[3]}, ended ${failed[4]}`,
              detail: `${FAKE_WORDS} reading of the runs.`,
              recommendation: `${FAKE_WORDS} recommendation.`,
              evidence: [{ runId: failed[1], stepIndex: Number(failed[5]) - 1 }],
              rules: [],
            },
          ],
  };
}

/**
 * The `Llm` `--fake` runs on: `decide` is the fake Jev's and `complete` the fake Analyst's, each
 * through agent's own fake, built per call, so every answer is checked against what was asked as
 * the real adapter checks it. A call on any other role throws.
 */
export function fakeDemoLlm(): Llm {
  return {
    complete: (request) => fakeLlm({ analyst: [fakeAnalystAnswer] }).complete(request),
    decide: (request) => fakeLlm({ actor: [fakeJevAnswer] }).decide(request),
  };
}

/**
 * The runner's backends under `--fake`: the real Jev backend on `fakeDemoLlm`, so its options, its
 * draw on the run's decision stream and its `decision` record are the real code's, and only Jev's
 * probabilities are faked. The key in its settings is never sent: `createLlm` is never built. The
 * LLM backend refuses, since `--fake` fakes Jev only.
 */
export function fakeDemoBackends(): RunnerOptions["backends"] {
  const settings = parseLlmSettings({ LLM_API_KEY: "fake-key", LLM_JEV_MODEL: FAKE_JEV_MODEL });
  return {
    jev: jevActor({ settings, llm: () => fakeDemoLlm() }),
    llm: () => {
      throw new WayfordError("fake_backend", "seed:demo --fake runs on the fake Jev only");
    },
  };
}
