/**
 * The ids one core fixture names and another holds (issue #29).
 *
 * Fixtures are the shared vocabulary (`docs/KICKOFF.md`), and the screens are
 * built on them before any run is stored: `m0-07` streams the fixture run,
 * `s3-04` filters runs by task, and the report follows a finding to its
 * evidence (`docs/PLAN.md` F8 AC2). An id that no fixture holds is a dead link
 * there. `finding.test.ts` checks the task and persona ids a finding names;
 * this file checks the ids the run fixtures name, and where a finding's
 * evidence lands.
 *
 * A finding reads a series of runs ("in four of six runs"), and the fixtures
 * store one run of it. A ref to a run they do not store is deliberate: it
 * stands for a run of the series that was not kept as a fixture. So a ref is
 * followed only when it names a stored run, and at least one finding has to
 * name one.
 */
import { describe, expect, test } from "vitest";
import type { Finding } from "../finding.js";
import type { RunResult } from "../run.js";
import {
  findingFixtures,
  profileFixtures,
  runEventFixtures,
  runResultFixture,
  taskFixtures,
} from "./index.js";

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

/** Every run a fixture stores, by id. The event stream folds to the same run (`run.test.ts`). */
const STORED_RUNS: ReadonlyMap<string, RunResult> = new Map([
  [runResultFixture.id, runResultFixture],
]);

/**
 * Ratios a finding quotes as a yardstick rather than a reading: the WCAG
 * anchors and the profiles' contrast thresholds. Only a reading has to be in
 * the evidence.
 */
const REFERENCE_RATIOS = new Set([
  3,
  4.5,
  7,
  ...profileFixtures
    .map((profile) => profile.perception.contrast?.threshold)
    .filter((value): value is number => value !== undefined),
]);

/** Every id a run names that no fixture holds, one line each. */
function unknownIds(run: { taskId: string; profileId: string }): string[] {
  const found: string[] = [];
  if (!taskFixtures.some((task) => task.id === run.taskId)) {
    found.push(`${run.taskId} is not in tasks.json`);
  }
  if (!profileFixtures.some((profile) => profile.id === run.profileId)) {
    found.push(`${run.profileId} is not in profiles/`);
  }
  return found;
}

/**
 * Every ref to a stored run that lands where the finding cannot hold, one line
 * each: on a step the run does not have, in a run of another task, or in a run
 * of a persona the finding does not name. A finding that names no persona
 * holds whoever is looking.
 */
function misplacedRefs(
  findings: readonly Finding[],
  runs: ReadonlyMap<string, RunResult>,
): string[] {
  const found: string[] = [];
  for (const finding of findings) {
    for (const ref of finding.evidence) {
      const run = runs.get(ref.runId);
      if (!run) continue;
      if (!run.steps.some((step) => step.stepIndex === ref.stepIndex)) {
        found.push(`${finding.id}: ${run.id} has no step ${ref.stepIndex}`);
      }
      if (run.taskId !== finding.taskId) {
        found.push(
          `${finding.id}: ${run.id} is a run of ${run.taskId}, the finding is about ${finding.taskId}`,
        );
      }
      const personas = finding.personaIds;
      if (personas.length > 0 && !personas.includes(run.profileId)) {
        found.push(
          `${finding.id}: ${run.id} is a run of ${run.profileId}, the finding names ${personas.join(", ")}`,
        );
      }
    }
  }
  return found;
}

/**
 * Every contrast reading a finding quotes that no stored step it points at
 * measured, one line each. A finding that points at no stored step is skipped:
 * its evidence is not here to read.
 */
function unmeasuredRatios(
  findings: readonly Finding[],
  runs: ReadonlyMap<string, RunResult>,
): string[] {
  const found: string[] = [];
  for (const finding of findings) {
    const pointedAt = finding.evidence.flatMap((ref) => {
      const step = runs.get(ref.runId)?.steps.find((s) => s.stepIndex === ref.stepIndex);
      return step ? [{ at: `${ref.runId} step ${ref.stepIndex}`, step }] : [];
    });
    if (pointedAt.length === 0) continue;

    const measured = new Set(
      pointedAt.flatMap(({ step }) =>
        step.fullObservation.elements
          .map((element) => element.metrics.contrast)
          .filter((value): value is number => value !== undefined),
      ),
    );
    const quoted = new Set(
      [...`${finding.title} ${finding.detail}`.matchAll(/(\d+(?:\.\d+)?):1/g)].map((match) =>
        Number(match[1]),
      ),
    );
    const where = pointedAt.map(({ at }) => at).join(", ");
    for (const ratio of quoted) {
      if (!REFERENCE_RATIOS.has(ratio) && !measured.has(ratio)) {
        found.push(`${finding.id} quotes ${ratio}:1, not measured at ${where}`);
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// The fixtures
// ---------------------------------------------------------------------------

const started = runEventFixtures[0];
if (started?.type !== "runStarted") throw new Error("the fixture stream must open with runStarted");

describe("references between the fixtures", () => {
  test.each([
    { name: "run-result.json", run: runResultFixture },
    { name: "run-events.json", run: started },
  ])("$name names a task and a profile that exist", ({ run }) => {
    expect(unknownIds(run)).toEqual([]);
  });

  test("at least one finding points at a stored run", () => {
    const pointing = findingFixtures.filter((finding) =>
      finding.evidence.some((ref) => STORED_RUNS.has(ref.runId)),
    );
    expect(
      pointing.map((finding) => finding.id),
      `no finding's evidence names ${[...STORED_RUNS.keys()].join(", ")}`,
    ).not.toEqual([]);
  });

  test("a ref to a stored run lands on one of its steps, in a run the finding holds for", () => {
    expect(misplacedRefs(findingFixtures, STORED_RUNS)).toEqual([]);
  });

  test("a finding that points at a stored step quotes only readings measured there", () => {
    expect(unmeasuredRatios(findingFixtures, STORED_RUNS)).toEqual([]);
  });
});

describe("the reference checks catch a ref", () => {
  const byId = (id: string): Finding => {
    const found = findingFixtures.find((finding) => finding.id === id);
    if (!found) throw new Error(`No finding fixture ${id}`);
    return found;
  };
  // Each row moves one thing away from a pointer that passes: the measurement
  // at step 1 of the stored run, where the link reads 2.1:1 and the navigation
  // 12.6:1.
  const measurement = byId("fnd_archive-link-contrast-ratio");
  const zoya = byId("fnd_archive-link-below-contrast");
  const at = (stepIndex: number) => [{ runId: runResultFixture.id, stepIndex }];
  const otherTask = new Map([
    [runResultFixture.id, { ...runResultFixture, taskId: "task_next-parcel" }],
  ]);

  type Row = [
    claim: string,
    finding: Finding,
    runs: ReadonlyMap<string, RunResult>,
    lines: string[],
  ];
  const ROWS: Row[] = [
    [
      "to a step the run does not have",
      { ...measurement, evidence: at(5) },
      STORED_RUNS,
      ["fnd_archive-link-contrast-ratio: run_vera-hard-1 has no step 5"],
    ],
    [
      "to a step that did not measure what the finding quotes",
      { ...measurement, evidence: at(0) },
      STORED_RUNS,
      ["fnd_archive-link-contrast-ratio quotes 2.1:1, not measured at run_vera-hard-1 step 0"],
    ],
    [
      "to a run of a persona the finding does not name",
      { ...zoya, evidence: at(1) },
      STORED_RUNS,
      [
        "fnd_archive-link-below-contrast: run_vera-hard-1 is a run of prof_vera, the finding names prof_zoya",
      ],
    ],
    [
      "to a run of another task",
      { ...measurement, evidence: at(1) },
      otherTask,
      [
        "fnd_archive-link-contrast-ratio: run_vera-hard-1 is a run of task_next-parcel, the finding is about task_past-order",
      ],
    ],
  ];
  test.each(ROWS)("%s", (_claim, finding, runs, lines) => {
    const found = [...misplacedRefs([finding], runs), ...unmeasuredRatios([finding], runs)];
    expect(found).toEqual(lines);
  });
});
