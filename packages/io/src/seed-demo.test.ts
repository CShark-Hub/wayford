/**
 * `seed-demo.ts` without a browser: the fake Jev's and the fake Analyst's answers, on requests
 * built by the code that builds the real ones; the plan's size; the store's counts and reset; the
 * ground-truth warnings; the summary. `seed-demo.browser.test.ts` runs `seedDemo` itself.
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  actorTurn,
  type CompleteRequest,
  choiceAnswer,
  type DecideRequest,
  jevOptions,
  jevRequest,
} from "@wayford/agent";
import { type RunResult, toActorObservation } from "@wayford/core";
import {
  groundTruthFixture,
  profileFixture,
  reportFixtures,
  sweepFixtures,
  taskFixture,
} from "@wayford/core/fixtures";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { z } from "zod";
import { analystCase } from "./analyst-digest.js";
import { DEFAULT_DATABASE_URL } from "./config.js";
import { sqliteFilePath } from "./db/database.js";
import { listRaces, saveRace } from "./db/races.js";
import { saveReport } from "./db/reports.js";
import { saveRun } from "./db/runs.js";
import { saveSweep } from "./db/sweeps.js";
import {
  DEMO_PLAN,
  type DemoSummary,
  emptyStore,
  fakeAnalystAnswer,
  fakeJevAnswer,
  groundTruthWarnings,
  plannedDevices,
  plannedRuns,
  runFoldersFor,
  storedCounts,
  summaryText,
} from "./seed-demo.js";
import { boundaryLine } from "./sweep-text.js";
import {
  archiveLink,
  deliveries,
  firstSeed,
  storedRun,
  type TempStore,
  tempStore,
} from "./test-app.js";

const hardGoal = taskFixture("task_past-order");
const easyGoal = taskFixture("task_next-parcel");
const ada = profileFixture("prof_ada");
const kai = profileFixture("prof_kai");

/**
 * Vera's `/deliveries` at `seed`, asked of Jev with `goal`, as `jevActor` asks it, and the key the
 * archive link is offered under, its ref; undefined when the filter took it away.
 */
function askedOn(seed: number, goal: string) {
  const full = deliveries(seed);
  const observation = toActorObservation(full);
  const options = jevOptions(observation);
  return {
    request: jevRequest(actorTurn(goal, observation, []), options),
    archiveKey: archiveLink(full).ref ?? "",
  };
}

const NO_HIT = (request: DecideRequest) =>
  Object.fromEntries(
    Object.keys(request.question.options).map((key) => [
      key,
      ({ give_up: 0.5, back: 0.3, scroll_down: 0.2 } as Record<string, number>)[key] ?? 0,
    ]),
  );

describe("the fake Jev", () => {
  test("on /deliveries, the archive link read through its mask takes the hit share", () => {
    const seed = firstSeed((s) => archiveLink(deliveries(s)).state === "degraded");
    const { request, archiveKey } = askedOn(seed, hardGoal.goal);
    // The option names the link masked, so only a read through the mask finds it.
    expect(request.question.options[archiveKey]).toContain("▒");

    const answer = fakeJevAnswer(request);

    expect(choiceAnswer(request.question.options).safeParse(answer).success).toBe(true);
    expect(answer).toMatchObject({ choice: archiveKey, confidence: 0.9 });
    expect(answer.probabilities[archiveKey]).toBe(0.9);
    const rest = Object.entries(answer.probabilities).filter(([key]) => key !== archiveKey);
    for (const [, p] of rest) expect(p).toBeCloseTo(0.1 / rest.length, 12);
  });

  test("a link the filter took away is no hit: give up, go back or scroll", () => {
    const seed = firstSeed((s) => archiveLink(deliveries(s)).state === "invisible");
    const { request } = askedOn(seed, hardGoal.goal);

    expect(fakeJevAnswer(request)).toStrictEqual({
      choice: "give_up",
      confidence: 0.5,
      probabilities: NO_HIT(request),
    });
  });

  test("a page with no step toward the goal is no hit", () => {
    const { request } = askedOn(1, easyGoal.goal);

    expect(fakeJevAnswer(request).probabilities).toStrictEqual(NO_HIT(request));
  });

  test("an open menu's item wins over the button that opened it", () => {
    const options = {
      e1: 'Click [e1], the button "More options"',
      e2: 'Click [e2], the menuitem "Past orders"',
      e3: 'Click [e3], the link "Home"',
      scroll_down: "Scroll the page down",
      scroll_up: "Scroll the page up",
      back: "Go back to the page before",
      give_up: "Stop, because you think you cannot get it done here",
    };
    const request: DecideRequest = {
      role: "actor",
      state: `Your goal: ${hardGoal.goal}\n\nThe page you are on now:\nURL: http://localhost:5174/account\n`,
      question: { instructions: "", options },
    };

    const answer = fakeJevAnswer(request);

    expect(answer.choice).toBe("e2");
    expect(answer.probabilities.e2).toBe(0.9);
    expect(answer.probabilities.e1).toBeCloseTo(0.1 / 6, 12);
  });
});

describe("the fake Analyst", () => {
  const page = deliveries(1);
  const through = storedRun({
    profile: ada,
    seed: 1,
    runId: "run_ada-1",
    outcome: "success",
    steps: [{ observation: page }, { observation: page }],
  });
  const stuck = storedRun({
    profile: kai,
    seed: 2,
    runId: "run_kai-2",
    outcome: "gave_up",
    steps: [{ observation: page }, { observation: page }, { observation: page }],
  });

  /** The request `analyst.ts` sends over `runs`, with draft keys d1 and d2. */
  function asked(runs: RunResult[]): CompleteRequest<z.ZodObject> {
    return {
      role: "analyst",
      messages: [
        { role: "system", content: "the prompt" },
        {
          role: "user",
          content: analystCase({
            task: hardGoal,
            scout: { status: "noGroundTruth" },
            personas: [],
            drafts: [],
            runs,
            backend: "jev",
          }),
        },
      ],
      schema: z.object({
        recommendations: z.object({ d1: z.string(), d2: z.string() }).strict(),
        hypotheses: z.array(z.unknown()),
      }),
    };
  }

  test("a recommendation per key asked, and a hypothesis on the last step of a run that failed", () => {
    const answer = fakeAnalystAnswer(asked([through, stuck]));

    expect(Object.keys(answer.recommendations)).toStrictEqual(["d1", "d2"]);
    for (const text of Object.values(answer.recommendations)) {
      expect(text).toContain("seed:demo --fake");
    }
    expect(answer.hypotheses).toMatchObject([
      {
        title: "Fake hypothesis: Kai (prof_kai), seed 2, ended gave_up",
        evidence: [{ runId: "run_kai-2", stepIndex: 2 }],
        rules: [],
      },
    ]);
  });

  test("no hypothesis when every run got through", () => {
    expect(fakeAnalystAnswer(asked([through])).hypotheses).toStrictEqual([]);
  });
});

test("the demo plan makes 60 runs in its run sets and 140 in its sweeps", () => {
  expect(plannedRuns(DEMO_PLAN)).toBe(200);
  expect(plannedRuns({ ...DEMO_PLAN, sweeps: [] })).toBe(60);
});

test("the plan is walked on every device a run set or a sweep runs on, each once", () => {
  expect(plannedDevices(DEMO_PLAN)).toStrictEqual(["desktop"]);
  const [sweep] = DEMO_PLAN.sweeps;
  if (sweep === undefined) throw new Error("DEMO_PLAN sweeps nothing");
  const onPhone = { ...sweep, profile: { ...sweep.profile, device: "mobile" as const } };
  expect(plannedDevices({ ...DEMO_PLAN, sweeps: [onPhone] })).toStrictEqual(["desktop", "mobile"]);
});

test.each([
  ["file:./wayford.sqlite", "/repo/runs"],
  ["file:wayford.sqlite", "/repo/runs"],
  [sqliteFilePath(DEFAULT_DATABASE_URL), "/repo/runs"],
  ["file:./wayford-fake.sqlite", undefined],
  ["file:./packages/io/wayford.sqlite", undefined],
  [":memory:", undefined],
])("the run folders --reset on %s may delete: %s", (databaseUrl, folders) => {
  expect(runFoldersFor(databaseUrl, "/repo/runs")).toBe(folders);
});

describe("the store before a seed", () => {
  let store: TempStore;

  beforeEach(async () => {
    store = await tempStore();
  });

  afterEach(async () => {
    await store.close();
  });

  test("the counts take every run, report and sweep; a reset empties them, the races and their run folders", async () => {
    for (const [i, id] of ["run_ada-1", "run_kai-2"].entries()) {
      await saveRun(
        store.db,
        storedRun({ profile: ada, seed: i + 1, runId: id, steps: [] }),
        "2026-10-06T12:00:00.000Z",
      );
      await mkdir(join(store.runsDir, id));
      await writeFile(join(store.runsDir, id, "result.json"), "{}");
    }
    const [report] = reportFixtures;
    const [sweep] = sweepFixtures;
    if (report === undefined || sweep === undefined) throw new Error("core has no fixtures");
    await saveReport(store.db, report);
    await saveSweep(store.db, sweep);
    // The race the two runs made: a History entry whose runs a reset deletes must go with them.
    await saveRace(store.db, {
      id: "race_ada",
      task: hardGoal,
      startedAt: "2026-10-06T12:00:00.000Z",
      runs: [
        { id: "run_ada-1", profileId: ada.id, seed: 1 },
        { id: "run_kai-2", profileId: ada.id, seed: 2 },
      ],
    });
    await mkdir(join(store.runsDir, "ground-truth"));
    await writeFile(join(store.runsDir, "ground-truth", `${hardGoal.id}.json`), "{}");
    await writeFile(join(store.runsDir, "notes.txt"), "kept");

    expect(await storedCounts(store.db)).toStrictEqual({ runs: 2, reports: 1, sweeps: 1 });

    await emptyStore(store.db, store.runsDir);

    expect(await storedCounts(store.db)).toStrictEqual({ runs: 0, reports: 0, sweeps: 0 });
    expect(await listRaces(store.db)).toStrictEqual([]);
    expect((await readdir(store.runsDir)).sort()).toStrictEqual(["ground-truth", "notes.txt"]);
    expect(await readdir(join(store.runsDir, "ground-truth"))).toStrictEqual([
      `${hardGoal.id}.json`,
    ]);
  });

  test("a reset with no runs folder deletes the rows and keeps every run folder", async () => {
    const id = "run_ada-1";
    await saveRun(
      store.db,
      storedRun({ profile: ada, seed: 1, runId: id, steps: [] }),
      "2026-10-06T12:00:00.000Z",
    );
    await mkdir(join(store.runsDir, id));

    await emptyStore(store.db);

    expect(await storedCounts(store.db)).toStrictEqual({ runs: 0, reports: 0, sweeps: 0 });
    expect(await readdir(store.runsDir)).toStrictEqual([id]);
  });

  test("a task with no ground truth gets a warning naming Scout's command", async () => {
    const dir = join(store.dir, "ground-truth");
    await mkdir(dir);
    await writeFile(join(dir, `${hardGoal.id}.json`), JSON.stringify(groundTruthFixture));

    const warnings = await groundTruthWarnings(dir, [easyGoal, hardGoal]);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(easyGoal.id);
    expect(warnings[0]).toContain("pnpm --filter @wayford/agent scout");
  });

  test("a ground-truth file that is no ground truth refuses the seed", async () => {
    const dir = join(store.dir, "ground-truth");
    await mkdir(dir);
    await writeFile(join(dir, `${easyGoal.id}.json`), "not json");

    await expect(groundTruthWarnings(dir, [easyGoal])).rejects.toMatchObject({
      code: "invalid_ground_truth",
    });
  });
});

test("the summary pastes: outcomes, each sweep's boundary, the wall time and the cost", () => {
  const [vera, kaiSweep] = sweepFixtures;
  const [report] = reportFixtures;
  if (vera === undefined || kaiSweep === undefined || report === undefined) {
    throw new Error("core has no fixtures");
  }
  const summary: DemoSummary = {
    backend: "jev",
    models: ["typesafe/jev-1.13"],
    outcomes: { success: 120, gave_up: 70, budget_exceeded: 10, error: 0, missing: 0 },
    setRuns: 60,
    runsUsd: 0.1,
    reports: [report],
    sweeps: [vera, kaiSweep],
    wallMs: 372_000,
  };

  // The sweeps' runs and the Analyst's cost come from the fixtures: 70 runs per sweep, and the
  // report's 0.003529 USD.
  expect(summaryText(summary).split("\n")).toStrictEqual([
    "seed:demo on jev, typesafe/jev-1.13",
    "runs       200: 120 success, 70 gave up, 10 budget exceeded, 0 error",
    "           60 in the run sets, 140 in 2 sweeps",
    `reports    ${report.taskId}`,
    `sweep      Vera contrast, 1.5 to 4.5, ${vera.id}`,
    boundaryLine("contrast", vera.values, 10),
    `sweep      Kai maxElements, 4 to 16, ${kaiSweep.id}`,
    boundaryLine("maxElements", kaiSweep.values, 10),
    "wall time  6m 12s",
    "cost       0.1035 USD: runs 0.1000 USD, Analyst 0.0035 USD",
    "per run    0.0005 USD",
  ]);
  expect(boundaryLine("contrast", vera.values, 10)).toMatch(/^boundary {3}3\.0 /);
  expect(summaryText({ ...summary, outcomes: { ...summary.outcomes, missing: 2 } })).toContain(
    "0 error, 2 never stored",
  );
});
