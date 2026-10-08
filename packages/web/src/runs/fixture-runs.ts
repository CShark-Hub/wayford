/**
 * Test data, Node only: this file imports `@wayford/core/fixtures`, which reads its files with
 * `node:fs`, so no screen may import it. The page gets its fixtures from `bundled-fixtures.ts`;
 * tests import this list to feed the pure functions or to seed a `QueryClient`.
 *
 * `fixtureRuns` is `runResultFixture` first, then one variant of it per row below: another id,
 * persona, task, seed, outcome and wall-clock duration, re-parsed with `RunResult`. Every variant
 * keeps the fixture's five steps, cost and recording paths, so only what the table and the filters
 * read differs.
 *
 * The rows hold distinct cases: both tasks, all four outcomes, and a persona that is not bundled.
 * On `task_past-order`: Ada has an error beside her successes; every one of Milo's runs errored;
 * Vera and Zoya ran without arriving; `prof_guest`, not a bundled persona, got through twice.
 *
 * Every variant but the one below keeps the fixture's simulated time too (B3's clock): its steps'
 * times at Vera's pace and their sum, 16 476 ms, so a run's total is the sum of its steps, the one
 * shape the fold stores. A test that needs another time builds its own run.
 *
 * A budget run out names the limit that cut it off, as the loop records it since #196. Vera's ran
 * out of time at her 120 s budget on the wall clock, as every run did before s2-09, so it is stored
 * as one: no simulated time on the run or on any step, the case where the fold gives no total.
 * Zoya's, at 120 s of her 180, hit the step cap, which is set to the five steps it keeps: core
 * holds a run the cap ended to exactly its cap.
 *
 * Ids read `run_<persona>-<hard|easy>-<n>`, numbered from 1 within each task and persona, and the
 * seed of a variant is its `n`. `run_vera-hard-1` keeps the fixture's seed, 424242.
 */
import { type RunLimit, type RunOutcome, RunResult, type RunStep } from "@wayford/core";
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
  /** For a budget run out alone. */
  limit?: RunLimit,
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
  ["run_vera-hard-3", "prof_vera", HARD, 3, "budget_exceeded", 120_000, "clock"],
  ["run_zoya-hard-1", "prof_zoya", HARD, 1, "budget_exceeded", 120_000, "steps"],
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

/**
 * The fixture run with one row's keys, parsed as io would parse a stored run. A run the step cap
 * ended has its cap set to its steps. A run the clock ended is one stored before s2-09: the
 * fixture's steps sum to 16 476 ms, far short of Vera's 120 s, so only the wall clock could have
 * cut them off, and core reads a `clock` run with no simulated time as just that.
 */
function variant([id, profileId, taskId, seed, outcome, durationMs, limit]: Row): RunResult {
  const ended =
    limit === undefined
      ? {}
      : { limit, ...(limit === "steps" ? { maxSteps: runResultFixture.steps.length } : {}) };
  const { simulatedMs: _total, ...untimed } = runResultFixture;
  return RunResult.parse({
    ...(limit === "clock"
      ? { ...untimed, steps: untimed.steps.map(({ simulatedMs: _time, ...step }) => step) }
      : runResultFixture),
    id,
    profileId,
    taskId,
    seed,
    outcome,
    durationMs,
    ...ended,
  });
}

/** `runResultFixture`, then one variant per row, in the order above. See the file comment. */
export const fixtureRuns: RunResult[] = [runResultFixture, ...ROWS.map(variant)];

/**
 * A step as Jev would have stored it: with no narration, since Jev writes none, on the step or on
 * any answer a wasted step refused.
 */
function silent(step: RunStep): RunStep {
  if ("wasted" in step) {
    return { ...step, rejected: step.rejected.map((answer) => ({ ...answer, narration: "" })) };
  }
  return { ...step, narration: "" };
}

/**
 * The fixture run as Jev would have run it: step 0, whose proposed click on `e3` is the option
 * `decisionRecordFixture` draws, carries that record. Jev's model plays the Actor, so no step and
 * no refused answer carries a narration, and the run has no `actorSampling`, which a Jev run never
 * sends. Outside `fixtureRuns`, so the archive's list and its counts stay as they are.
 */
export const fixtureJevRun: RunResult = RunResult.parse({
  ...runResultFixture,
  id: "run_vera-hard-jev",
  modelIds: { actor: "typesafe/jev-1.13" },
  actorSampling: undefined,
  steps: runResultFixture.steps
    .map(silent)
    .map((step) => (step.stepIndex === 0 ? { ...step, decision: decisionRecordFixture } : step)),
});

/** The fixture run's step with this `stepIndex`. */
export function fixtureStep(stepIndex: number): RunStep {
  const step = runResultFixture.steps.find((s) => s.stepIndex === stepIndex);
  if (step === undefined) throw new Error(`the fixture run has no step ${stepIndex}`);
  return step;
}
