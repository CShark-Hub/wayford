import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LlmError } from "@wayford/agent";
import { type FakeLlm, fakeLlm } from "@wayford/agent/fake";
import {
  type Cost,
  decisionState,
  type FullObservation,
  GroundTruth,
  type Profile,
  type ReportBackend,
  type RunResult,
  type RunSweep,
  type Task,
  WayfordError,
} from "@wayford/core";
import {
  groundTruthFixture,
  observationFixture,
  profileFixture,
  taskFixture,
} from "@wayford/core/fixtures";
import type { RouteClosed } from "@wayford/filter/routes";
import pino from "pino";
import { describe, expect, onTestFinished, test } from "vitest";
import {
  ANALYST_PROMPT_FILE,
  type AnalystDeps,
  analyseAndStore,
  readGroundTruth,
} from "./analyst.js";
import { fallbackRecommendation } from "./analyst-closures.js";
import type { RouteFacts } from "./analyst-runs.js";
import { loadReport } from "./db/reports.js";
import { saveRun } from "./db/runs.js";
import { saveTask } from "./db/tasks.js";
import {
  analystDefaults,
  archiveLink,
  deliveries,
  FAKE_JEV_MODEL,
  firstSeed,
  quiet,
  storedRun,
  type TempStore,
  tempStore,
} from "./test-app.js";

const ada = profileFixture("prof_ada");
const kai = profileFixture("prof_kai");
const vera = profileFixture("prof_vera");

const TASK = "task_past-order";
const PROMPT = readFileSync(ANALYST_PROMPT_FILE, "utf8");
const NOTHING = { recommendations: {}, hypotheses: [] };
const SWEEP: RunSweep = { sweepId: "swp_contrast-test", axis: "contrast", value: 3 };

/** A migrated store, closed after the test. */
async function store(): Promise<TempStore> {
  const s = await tempStore();
  onTestFinished(() => s.close());
  return s;
}

/** A logger that keeps every warning, parsed, in order. */
function capture() {
  const lines: Record<string, unknown>[] = [];
  const logger = pino(
    { level: "warn" },
    { write: (line: string) => void lines.push(JSON.parse(line)) },
  );
  return { lines, logger };
}

/**
 * The Analyst's dependencies on `s`: `analystDefaults` (no route table, no ground truth, Jev as
 * `FAKE_JEV_MODEL`), `llm` and `quiet`.
 */
function depsOf(s: TempStore, llm: FakeLlm, over: Partial<AnalystDeps> = {}): AnalystDeps {
  return { db: s.db, llm, ...analystDefaults(s), logger: quiet, ...over };
}

/** A stored fake run: two steps on `/deliveries` unless `steps` says otherwise. */
function run(
  profile: Profile,
  seed: number,
  id: string,
  options: {
    modelId?: string;
    sweep?: RunSweep;
    cost?: Cost;
    task?: Task;
    steps?: FullObservation[];
  } = {},
): RunResult {
  const { cost, steps, ...rest } = options;
  const stored = storedRun({
    profile,
    seed,
    runId: id,
    steps: (steps ?? [observationFixture, observationFixture]).map((observation) => ({
      observation,
    })),
    ...rest,
  });
  return cost === undefined ? stored : { ...stored, cost };
}

/** Stores `runs`, the first started last: `listRuns` gives them back in this order. */
async function saveAll(s: TempStore, runs: readonly RunResult[]) {
  for (const [i, r] of runs.entries()) {
    await saveRun(s.db, r, new Date(Date.UTC(2026, 9, 5, 12, 0, runs.length - i)).toISOString());
  }
}

/**
 * The run set most tests read on the LLM: Ada and Vera on seed 1. Left out: an older Ada seed 1,
 * Kai on Jev, and a Vera sweep run.
 */
const RUN_SET = {
  chosen: ["run_ada-1", "run_vera-1"],
  older: "run_older-ada-1",
  jev: "run_jev-kai-1",
  sweep: "run_sweep-vera-2",
};

async function storeRunSet(s: TempStore) {
  await saveAll(s, [
    run(ada, 1, "run_ada-1", { cost: { tokensIn: 100, tokensOut: 10, usd: 0.25 } }),
    run(vera, 1, "run_vera-1", { cost: { tokensIn: 200, tokensOut: 20, usd: 0.5 } }),
    run(kai, 1, RUN_SET.jev, {
      modelId: FAKE_JEV_MODEL,
      cost: { tokensIn: 9, tokensOut: 9, usd: 9 },
    }),
    run(vera, 2, RUN_SET.sweep, { sweep: SWEEP, cost: { tokensIn: 9, tokensOut: 9, usd: 9 } }),
    run(ada, 1, RUN_SET.older, { cost: { tokensIn: 1000, tokensOut: 100, usd: 5 } }),
  ]);
}

/** A hypothesis answer citing `evidence`, with any field replaced by `over`. */
function hypothesis(evidence: { runId: string; stepIndex: number }[], over: object = {}) {
  return {
    title: "The agents leave /deliveries without opening its last link",
    detail: "Each run scrolls past the end of the page and goes back.",
    recommendation: "Move the link to the past orders up the page.",
    evidence,
    rules: [],
    ...over,
  };
}

/** Analyse the task on `backend` and expect it to succeed: the report. */
async function analysed(deps: AnalystDeps, backend: ReportBackend = "llm") {
  const analysis = await analyseAndStore(deps, TASK, backend);
  if (!analysis.ok) throw new Error(`expected a report, got: ${analysis.error}`);
  return analysis.report;
}

describe("analyseAndStore: the call", () => {
  test("one call on the analyst role, its user message holding every chosen run and no left-out one", async () => {
    const s = await store();
    await storeRunSet(s);
    const fake = fakeLlm({ analyst: [NOTHING] });

    const report = await analysed(depsOf(s, fake));

    expect(fake.calls).toHaveLength(1);
    const [call] = fake.calls;
    expect(call?.role).toBe("analyst");
    expect(call?.messages).toHaveLength(2);
    expect(call?.messages[0]).toEqual({ role: "system", content: PROMPT });
    expect(call?.messages[1]?.role).toBe("user");
    const message = call?.messages[1]?.content ?? "";
    for (const id of RUN_SET.chosen) expect(message).toContain(id);
    for (const id of [RUN_SET.older, RUN_SET.jev, RUN_SET.sweep]) {
      expect(message).not.toContain(id);
    }
    expect(report.leftOut).toEqual({ olderRuns: 1, otherBackend: 1, sweepRuns: 1 });
    expect(report.runCount).toBe(2);
    expect(report.personas.map((p) => p.profileId)).toEqual(["prof_ada", "prof_vera"]);
  });

  test("the report is stored and returned, its run cost summed over the chosen runs only", async () => {
    const s = await store();
    await storeRunSet(s);

    const report = await analysed(depsOf(s, fakeLlm({ analyst: [NOTHING] })));

    expect(await loadReport(s.db, TASK)).toEqual(report);
    expect(report.taskId).toBe(TASK);
    expect(report.backend).toBe("llm");
    expect(report.analystModelId).toBe("fake");
    expect(report.cost).toEqual({
      runs: { tokensIn: 300, tokensOut: 30, usd: 0.75 },
      analyst: { tokensIn: 0, tokensOut: 0, usd: 0 },
    });
    expect(report.findings).toEqual([]);
    expect(report.unevidencedClosures).toEqual([]);
  });

  test("a failed model call propagates, and nothing is stored", async () => {
    const s = await store();
    await storeRunSet(s);
    const failure = new LlmError("llm_http_error", "the model failed", {
      tokensIn: 0,
      tokensOut: 0,
      usd: 0,
    });

    await expect(
      analyseAndStore(depsOf(s, fakeLlm({ analyst: [failure] })), TASK, "llm"),
    ).rejects.toBe(failure);
    expect(await loadReport(s.db, TASK)).toBeUndefined();
  });
});

describe("analyseAndStore: hypotheses", () => {
  test("a hypothesis citing a missing step, an unknown run or a left-out run is dropped and logged", async () => {
    const s = await store();
    await storeRunSet(s);
    const { lines, logger } = capture();
    const answer = {
      recommendations: {},
      hypotheses: [
        hypothesis([{ runId: "run_vera-1", stepIndex: 1 }], { title: "kept" }),
        hypothesis([
          { runId: "run_vera-1", stepIndex: 0 },
          { runId: "run_vera-1", stepIndex: 9 },
        ]),
        hypothesis([{ runId: "run_nope", stepIndex: 0 }]),
        hypothesis([{ runId: RUN_SET.older, stepIndex: 0 }]),
        hypothesis([{ runId: RUN_SET.jev, stepIndex: 0 }]),
        hypothesis([{ runId: RUN_SET.sweep, stepIndex: 0 }]),
        hypothesis([{ runId: "run_ada-1", stepIndex: 0 }], { title: "   " }),
        hypothesis([]),
      ],
    };

    const report = await analysed(depsOf(s, fakeLlm({ analyst: [answer] }), { logger }));

    expect(report.findings.map((f) => f.title)).toEqual(["kept"]);
    expect(report.findings[0]).toMatchObject({
      type: "hypothesis",
      taskId: TASK,
      evidence: [{ runId: "run_vera-1", stepIndex: 1 }],
      personaIds: ["prof_vera"],
    });
    expect(
      lines.map(({ hypothesis: index, runId, stepIndex }) => ({ index, runId, stepIndex })),
    ).toEqual([
      { index: 1, runId: "run_vera-1", stepIndex: 9 },
      { index: 2, runId: "run_nope", stepIndex: 0 },
      { index: 3, runId: RUN_SET.older, stepIndex: 0 },
      { index: 4, runId: RUN_SET.jev, stepIndex: 0 },
      { index: 5, runId: RUN_SET.sweep, stepIndex: 0 },
      { index: 6, runId: undefined, stepIndex: undefined },
      { index: 7, runId: undefined, stepIndex: undefined },
    ]);
    for (const line of lines) expect(line.msg).toMatch(/dropped/);
  });

  test("personas come from the cited runs and provenance from their profiles, whatever the answer says", async () => {
    const s = await store();
    await storeRunSet(s);
    const { lines, logger } = capture();
    const answer = {
      recommendations: {},
      hypotheses: [
        // Vera cited first: the order is the profiles', never the answer's.
        hypothesis(
          [
            { runId: "run_vera-1", stepIndex: 0 },
            { runId: "run_ada-1", stepIndex: 1 },
          ],
          { rules: ["P1", "Z9", "A1", "P1"] },
        ),
        // Ada has no contrast threshold, so P1 has no source on her run.
        hypothesis([{ runId: "run_ada-1", stepIndex: 0 }], { rules: ["P1"] }),
      ],
    };

    const report = await analysed(depsOf(s, fakeLlm({ analyst: [answer] }), { logger }));

    const [both, adaOnly] = report.findings;
    expect(both?.personaIds).toEqual(["prof_ada", "prof_vera"]);
    // P1 from Vera's contrast threshold, A1 from her attention cap; Ada gives neither.
    expect(both?.basis).toEqual([
      { rule: "P1", provenance: "wcag22" },
      { rule: "A1", provenance: "folk" },
    ]);
    expect(adaOnly?.personaIds).toEqual(["prof_ada"]);
    expect(adaOnly?.basis).toEqual([]);
    expect(lines).toMatchObject([
      { hypothesis: 0, rule: "Z9" },
      { hypothesis: 1, rule: "P1" },
    ]);
  });

  test("a sixth valid hypothesis is dropped and logged", async () => {
    const s = await store();
    await storeRunSet(s);
    const { lines, logger } = capture();
    const titles = ["one", "two", "three", "four", "five", "six"];
    const answer = {
      recommendations: {},
      hypotheses: titles.map((title) =>
        hypothesis([{ runId: "run_ada-1", stepIndex: 0 }], { title }),
      ),
    };

    const report = await analysed(depsOf(s, fakeLlm({ analyst: [answer] }), { logger }));

    expect(report.findings.map((f) => f.title)).toEqual(titles.slice(0, 5));
    expect(lines).toMatchObject([{ hypothesis: 5, title: "six" }]);
  });
});

// Vera on the real `/deliveries`: a seed where P1 cuts "Order archive", read off the filter.
const cutSeed = firstSeed((seed) => {
  const link = archiveLink(deliveries(seed));
  return link.state === "invisible" && link.decisions.some((d) => d.rule === "P1");
});

/** Route A closing at the archive link in `seed`, as `routeClosings` gives it. */
function closingAt(seed: number): RouteClosed {
  return {
    seed,
    routeId: "A",
    page: "/deliveries",
    role: "link",
    name: "Order archive",
    decisions: archiveLink(deliveries(seed)).decisions.filter(
      (d) => decisionState(d) === "invisible",
    ),
  };
}

/** Route A closed for Vera in every seed asked, open nowhere; no route table for anyone else. */
const veraClosed: RouteFacts = async (_taskId, profile, seeds) =>
  profile.id === "prof_vera"
    ? { open: seeds.map((seed) => ({ seed, open: [] })), closings: seeds.map(closingAt) }
    : undefined;

/** Vera's one run at the cut seed, standing on `/deliveries` with the link cut. */
async function storeVeraCut(s: TempStore) {
  await saveAll(s, [run(vera, cutSeed, "run_vera-cut", { steps: [deliveries(cutSeed)] })]);
}

describe("analyseAndStore: deterministic findings", () => {
  test("a recommendation is taken trimmed, and the findings come first", async () => {
    const s = await store();
    await storeVeraCut(s);
    const { lines, logger } = capture();
    const fake = fakeLlm({
      analyst: [
        {
          recommendations: { d1: "  Darken the link to at least 3:1.  " },
          hypotheses: [hypothesis([{ runId: "run_vera-cut", stepIndex: 0 }])],
        },
      ],
    });

    const report = await analysed(depsOf(s, fake, { routes: veraClosed, logger }));

    expect(report.findings.map((f) => f.type)).toEqual(["deterministic", "hypothesis"]);
    expect(report.findings[0]).toMatchObject({
      recommendation: "Darken the link to at least 3:1.",
      basis: [{ rule: "P1", provenance: "wcag22" }],
      evidence: [{ runId: "run_vera-cut", stepIndex: 0 }],
      personaIds: ["prof_vera"],
    });
    expect(report.personas[0]?.routeOpenSeeds).toBe(0);
    const message = fake.calls[0]?.messages[1]?.content ?? "";
    expect(message).toContain(`d1, Vera: ${report.findings[0]?.title}`);
    expect(lines).toEqual([]);
  });

  test("a blank recommendation gets the fallback from the closing rule, logged", async () => {
    const s = await store();
    await storeVeraCut(s);
    const { lines, logger } = capture();
    const fake = fakeLlm({ analyst: [{ recommendations: { d1: "   " }, hypotheses: [] }] });

    const report = await analysed(depsOf(s, fake, { routes: veraClosed, logger }));

    expect(report.findings[0]?.recommendation).toBe(fallbackRecommendation(closingAt(cutSeed)));
    expect(lines).toMatchObject([{ finding: "d1", profileId: "prof_vera" }]);
  });
});

describe("Scout's line", () => {
  const dirOf = async (s: TempStore) => {
    const dir = join(s.dir, "ground-truth");
    await mkdir(dir, { recursive: true });
    return dir;
  };

  test("with no ground-truth file the report says noGroundTruth", async () => {
    const s = await store();
    await storeRunSet(s);
    const report = await analysed(depsOf(s, fakeLlm({ analyst: [NOTHING] })));
    expect(report.scout).toEqual({ status: "noGroundTruth" });
  });

  test("the fixture's file gives reached in 2 steps, and the case says the feature works", async () => {
    const s = await store();
    await storeRunSet(s);
    await writeFile(join(await dirOf(s), `${TASK}.json`), JSON.stringify(groundTruthFixture));
    const fake = fakeLlm({ analyst: [NOTHING] });

    const report = await analysed(depsOf(s, fake));

    expect(report.scout).toEqual({
      status: "reached",
      steps: 2,
      modelId: groundTruthFixture.modelId,
      recordedAt: groundTruthFixture.recordedAt,
    });
    expect(fake.calls[0]?.messages[1]?.content).toContain(
      "Scout reached the goal in 2 steps: the feature works.",
    );
  });

  test("a file whose attempts all failed gives notReached, and the case says so", async () => {
    const s = await store();
    await storeRunSet(s);
    const notReached = GroundTruth.parse({
      taskId: TASK,
      modelId: "openai/gpt-6-luna",
      startUrl: groundTruthFixture.startUrl,
      recordedAt: "2026-10-04T09:00:00.000Z",
      reached: false,
      attempts: [
        { runId: "run_scout-hard-1", outcome: "gave_up" },
        { runId: "run_scout-hard-2", outcome: "budget_exceeded" },
      ],
    });
    await writeFile(join(await dirOf(s), `${TASK}.json`), JSON.stringify(notReached));
    const fake = fakeLlm({ analyst: [NOTHING] });

    const report = await analysed(depsOf(s, fake));

    expect(report.scout).toEqual({
      status: "notReached",
      attempts: 2,
      modelId: "openai/gpt-6-luna",
      recordedAt: "2026-10-04T09:00:00.000Z",
    });
    expect(fake.calls[0]?.messages[1]?.content).toContain(
      "Scout did not reach the goal in 2 attempts.",
    );
  });

  test("a file that is no ground truth throws invalid_ground_truth, before any call", async () => {
    const s = await store();
    await storeRunSet(s);
    const dir = await dirOf(s);
    const file = join(dir, `${TASK}.json`);
    const invalid = expect.objectContaining({ code: "invalid_ground_truth" });

    await writeFile(file, "{ not json");
    await expect(readGroundTruth(dir, TASK)).rejects.toEqual(invalid);

    await writeFile(file, JSON.stringify({ ...groundTruthFixture, reached: false }));
    const error = await readGroundTruth(dir, TASK).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WayfordError);
    expect(error).toMatchObject({ code: "invalid_ground_truth", cause: expect.any(Error) });

    // Another task's ground truth under this task's name.
    await writeFile(file, JSON.stringify({ ...groundTruthFixture, taskId: "task_next-parcel" }));
    await expect(readGroundTruth(dir, TASK)).rejects.toEqual(invalid);

    const fake = fakeLlm({ analyst: [NOTHING] });
    await expect(analyseAndStore(depsOf(s, fake), TASK, "llm")).rejects.toEqual(invalid);
    expect(fake.calls).toHaveLength(0);
  });

  test("no folder at all reads as no ground truth", async () => {
    const s = await store();
    expect(await readGroundTruth(join(s.dir, "nowhere"), TASK)).toBeUndefined();
  });
});

describe("analyseAndStore: nothing to analyse", () => {
  test("an unknown task is ok: false, with no call", async () => {
    const s = await store();
    const fake = fakeLlm({});
    expect(await analyseAndStore(depsOf(s, fake), "task_nope", "jev")).toEqual({
      ok: false,
      error: "no task task_nope",
    });
    expect(fake.calls).toHaveLength(0);
  });

  test("no runs on the backend is ok: false, naming the other backend's count, with no call", async () => {
    const s = await store();
    const fake = fakeLlm({});
    expect(await analyseAndStore(depsOf(s, fake), TASK, "jev")).toEqual({
      ok: false,
      error: `no runs of ${TASK} on jev; none on llm`,
    });
    await saveAll(s, [run(ada, 1, "run_ada-1"), run(vera, 1, "run_vera-1")]);
    expect(await analyseAndStore(depsOf(s, fake), TASK, "jev")).toEqual({
      ok: false,
      error: `no runs of ${TASK} on jev; 2 on llm`,
    });
    expect(fake.calls).toHaveLength(0);
  });

  test("a task stored in the database is read from there", async () => {
    const s = await store();
    const task = {
      ...taskFixture("task_next-parcel"),
      id: "task_stored-goal",
      goal: "you want to know when your parcel arrives",
    };
    await saveTask(s.db, task);
    await saveAll(s, [run(ada, 1, "run_ada-stored", { task })]);
    const fake = fakeLlm({ analyst: [NOTHING] });

    const analysis = await analyseAndStore(depsOf(s, fake), task.id, "llm");

    expect(analysis.ok).toBe(true);
    expect(fake.calls[0]?.messages[1]?.content).toContain(task.goal);
  });
});
