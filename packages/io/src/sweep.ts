/**
 * The sweep engine (s4-05, `docs/specs/2026-10-05-s4-05-sweep.md`, §3): one task, one persona, one
 * capability axis, the same seeds at every value, laxest first (`docs/PLAN.md` F9, `AGENTS.md`,
 * "Untouchable core", point 3). A `for` loop over the values: each one is a run set on the runner,
 * waited for, counted and saved before the next starts, so the laxest-first order is a fact and a
 * stop costs at most one value.
 *
 * The row is saved `incomplete` before the first value and again after each, so a sweep cut off at
 * any point is stored as incomplete and says so. There is no resume and no early stop at the
 * boundary: the chart wants every value.
 *
 * Agent and filter's routes are imported as types only, as in `runner.ts`, so neither Playwright
 * nor filter's route walk is loaded here: what the runs run on and where route-open comes from are
 * the caller's.
 */
import type { ActorBackendName } from "@wayford/agent";
import {
  boundaryOf,
  newId,
  type Profile,
  type RunResult,
  type Seed,
  Sweep,
  type SweepAxis,
  type SweepValue,
  sweepPlan,
  sweptProfile,
  type Task,
  WayfordError,
} from "@wayford/core";
import type { routeOpenSeeds, WalkedRoute } from "@wayford/filter/routes";
import type { Logger } from "pino";
import type { Db } from "./db/database.js";
import { loadRun } from "./db/runs.js";
import { saveSweep } from "./db/sweeps.js";
import type { LiveRun, Runner } from "./runner.js";

export interface SweepInput {
  task: Task;
  profile: Profile;
  axis: SweepAxis;
  /** The range's ends, in any order: the axis decides which runs first. */
  from: number;
  to: number;
  step: number;
  /** The same seeds at every value (F9 AC3, A20). */
  seeds: readonly Seed[];
  backend: ActorBackendName;
}

export interface SweepDeps {
  db: Db;
  runner: Runner;
  logger: Logger;
  /** Seeds with a route open for this profile, or undefined when the task has no route table. */
  routeOpen: (profile: Profile, seeds: readonly Seed[]) => readonly Seed[] | undefined;
  /** Stop before the next value once the stored runs have cost this much (USD). */
  maxUsd?: number;
  now?: () => Date;
  /** The sweep as first stored, incomplete with no values, before any run: the CLI's header. */
  onStart?: (sweep: Sweep) => void;
  /** Each value as it settles, with the stored runs' cost so far (USD), for the CLI's progress. */
  onValue?: (row: SweepValue, spentUsd: number) => void;
}

/**
 * `SweepDeps["routeOpen"]` over the walked routes: the seeds with at least one route open. Filter's
 * `routeOpenSeeds` is passed in, since its entry loads Playwright and this module must not.
 */
export function routeOpenFrom(
  routes: readonly WalkedRoute[],
  jargon: readonly string[],
  seedsOpen: typeof routeOpenSeeds,
): SweepDeps["routeOpen"] {
  return (profile, seeds) =>
    seedsOpen(routes, profile, seeds, { jargon })
      .filter(({ open }) => open.length > 0)
      .map(({ seed }) => seed);
}

/**
 * Runs the sweep and returns it as stored, `complete`. A bad range or an axis the persona does not
 * set throws before anything is stored or run. Spend reaching `maxUsd` throws `sweep_over_budget`
 * before the next value. Any throw leaves the row as last saved, `incomplete`.
 */
export async function runSweep(deps: SweepDeps, input: SweepInput): Promise<Sweep> {
  const { db, runner, maxUsd, onStart, onValue } = deps;
  const { task, profile, axis, from, to, step, seeds, backend } = input;

  // Every refusal before an id is minted or a row saved.
  const values = sweepPlan(profile, axis, from, to, step);

  let sweep = Sweep.parse({
    id: newId("sweep"),
    taskId: task.id,
    profileId: profile.id,
    backend,
    seeds,
    startedAt: (deps.now?.() ?? new Date()).toISOString(),
    status: "incomplete",
    axis,
    from,
    to,
    step,
    values: [],
    boundary: null,
  });
  await saveSweep(db, sweep);
  onStart?.(sweep);
  const log = deps.logger.child({ sweepId: sweep.id });

  let spentUsd = 0;
  for (const value of values) {
    if (maxUsd !== undefined && spentUsd >= maxUsd) {
      throw new WayfordError(
        "sweep_over_budget",
        `the sweep's runs have cost ${spentUsd} USD, at or over the limit of ${maxUsd} USD, so it stopped before ${axis} ${value}`,
      );
    }

    const swept = sweptProfile(profile, axis, value);
    const started = runner.start(task, [swept], seeds, {
      backend,
      sweep: { sweepId: sweep.id, axis, value },
    });
    const runs: (RunResult | undefined)[] = [];
    for (const { id } of started) {
      await ended(runner.live(id));
      runs.push(await loadRun(db, id));
    }
    const open = deps.routeOpen(swept, seeds);
    const row: SweepValue = {
      value,
      runIds: started.map(({ id }) => id),
      successes: runs.filter((run) => run?.outcome === "success").length,
      // A run never stored counts as an error, and an error stops the boundary claim (`boundaryOf`).
      errors: runs.filter((run) => run === undefined || run.outcome === "error").length,
      routeOpenSeeds: open === undefined ? null : [...open],
    };
    spentUsd += runs.reduce((sum, run) => sum + (run?.cost.usd ?? 0), 0);

    const rows = [...sweep.values, row];
    sweep = Sweep.parse({ ...sweep, values: rows, boundary: boundaryOf(rows, seeds.length) });
    await saveSweep(db, sweep);
    log.info(
      { value, successes: row.successes, errors: row.errors, spentUsd },
      "sweep value settled",
    );
    onValue?.(row, spentUsd);
  }

  sweep = Sweep.parse({ ...sweep, status: "complete" });
  await saveSweep(db, sweep);
  return sweep;
}

/**
 * Waits for the run to end. Its record is stored, or its save has failed, by then. The id came
 * from `runner.start`, so the runner always has the run.
 */
async function ended(live: LiveRun | undefined): Promise<void> {
  while (live?.ended === false) await live.changed();
}
