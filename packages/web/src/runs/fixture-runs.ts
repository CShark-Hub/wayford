/**
 * Test data, Node only: this file imports `@wayford/core/fixtures`, which reads its files with
 * `node:fs`, so no screen may import it. The page gets its fixtures from `bundled-fixtures.ts`;
 * tests import this list to feed the pure functions or to seed a `QueryClient`.
 *
 * `fixtureRuns` is `runResultFixture` first, then one variant of it per row below: another id,
 * persona, task, seed, outcome and duration, re-parsed with `RunResult`. Every variant keeps the
 * fixture's five steps, cost and recording paths, so only what the list, the filters and the
 * stats read differs.
 *
 * The rows hold each case the stats tell apart. On `task_past-order`: Ada's error leaves her rate
 * 3/4, not 3/5, and her median 20 s over her successes, not 30 s over every run; every one of
 * Milo's runs errored; Vera and Zoya ran without arriving; `prof_guest`, not a bundled persona, has
 * an even count of successes. `stats.test.ts` holds every number.
 *
 * Ids read `run_<persona>-<hard|easy>-<n>`, numbered from 1 within each task and persona, and the
 * seed of a variant is its `n`. `run_vera-hard-1` keeps the fixture's seed, 424242.
 */
import { type RunOutcome, RunResult, type RunStep } from "@wayford/core";
import { decisionRecordFixture, runResultFixture } from "@wayford/core/fixtures";

/** The hard goal, the fixture run's own. */
const HARD = "task_past-order";
/** The easy goal. */
const EASY = "task_next-parcel";

type Row = [
  id: string,
  profileId: string,
  taskId: string,
  seed: number,
  outcome: RunOutcome,
  durationMs: number,
];

const ROWS: readonly Row[] = [
  ["run_ada-hard-1", "prof_ada", HARD, 1, "success", 10_000],
  ["run_ada-hard-2", "prof_ada", HARD, 2, "success", 20_000],
  ["run_ada-hard-3", "prof_ada", HARD, 3, "success", 30_000],
  ["run_ada-hard-4", "prof_ada", HARD, 4, "gave_up", 90_000],
  ["run_ada-hard-5", "prof_ada", HARD, 5, "error", 95_000],
  ["run_milo-hard-1", "prof_milo", HARD, 1, "error", 2_000],
  ["run_milo-hard-2", "prof_milo", HARD, 2, "error", 3_000],
  ["run_vera-hard-2", "prof_vera", HARD, 2, "gave_up", 20_000],
  ["run_vera-hard-3", "prof_vera", HARD, 3, "budget_exceeded", 120_000],
  ["run_zoya-hard-1", "prof_zoya", HARD, 1, "budget_exceeded", 120_000],
  ["run_zoya-hard-2", "prof_zoya", HARD, 2, "error", 5_000],
  ["run_guest-hard-1", "prof_guest", HARD, 1, "success", 18_000],
  ["run_guest-hard-2", "prof_guest", HARD, 2, "success", 12_000],
  ["run_ada-easy-1", "prof_ada", EASY, 1, "success", 5_000],
  ["run_ada-easy-2", "prof_ada", EASY, 2, "success", 7_000],
  ["run_ada-easy-3", "prof_ada", EASY, 3, "success", 6_000],
  ["run_milo-easy-1", "prof_milo", EASY, 1, "success", 9_000],
  ["run_milo-easy-2", "prof_milo", EASY, 2, "error", 4_000],
  ["run_vera-easy-1", "prof_vera", EASY, 1, "success", 14_000],
  ["run_vera-easy-2", "prof_vera", EASY, 2, "gave_up", 25_000],
  ["run_vera-easy-3", "prof_vera", EASY, 3, "success", 10_000],
  ["run_zoya-easy-1", "prof_zoya", EASY, 1, "success", 11_000],
  ["run_guest-easy-1", "prof_guest", EASY, 1, "gave_up", 30_000],
];

/** The fixture run with one row's keys, parsed as io would parse a stored run. */
function variant([id, profileId, taskId, seed, outcome, durationMs]: Row): RunResult {
  return RunResult.parse({ ...runResultFixture, id, profileId, taskId, seed, outcome, durationMs });
}

/** `runResultFixture`, then one variant per row, in the order above. See the file comment. */
export const fixtureRuns: RunResult[] = [runResultFixture, ...ROWS.map(variant)];

/**
 * The fixture run as Jev would have run it: step 0, whose proposed click on `e3` is the option
 * `decisionRecordFixture` draws, carries that record. Jev's model plays the Actor, and the run has
 * no `actorSampling`, which a Jev run never sends. Outside `fixtureRuns`, so the stats stay as
 * they are.
 */
export const fixtureJevRun: RunResult = RunResult.parse({
  ...runResultFixture,
  id: "run_vera-hard-jev",
  modelIds: { actor: "typesafe/jev-1.13" },
  actorSampling: undefined,
  steps: runResultFixture.steps.map((step) =>
    step.stepIndex === 0 ? { ...step, decision: decisionRecordFixture } : step,
  ),
});

/** The fixture run's step with this `stepIndex`. */
export function fixtureStep(stepIndex: number): RunStep {
  const step = runResultFixture.steps.find((s) => s.stepIndex === stepIndex);
  if (step === undefined) throw new Error(`the fixture run has no step ${stepIndex}`);
  return step;
}
