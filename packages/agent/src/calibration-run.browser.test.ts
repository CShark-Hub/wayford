/**
 * `calibrate()` on the served target app (`docs/specs/2026-10-02-s2-11-calibration-run.md`, "The
 * fake-adapter test"): the set on a fake adapter gives a fixed table, the estimate stops a set
 * before any run, the running spend stops new runs, and a run that rejects leaves the others to
 * finish, its billed cost counted. The app is built and served once and one Chromium serves every
 * run; each test writes its runs into a fresh temporary directory.
 *
 * No test reaches a model or a network: each run gets a fresh fake adapter, whose every answer is
 * picked from the page it is shown, and `fetch` throws from the moment the app is up. Every answer
 * bills a fixed `COST`, so a row's cost is its answers counted.
 */
import { mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { type ActorResponse, type Cost, WayfordError } from "@wayford/core";
import { taskFixture } from "@wayford/core/fixtures";
import { serveTargetApp, type TargetApp } from "@wayford/filter/serve-target-app";
import pino from "pino";
import { type Browser, chromium } from "playwright";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import type { z } from "zod";
import type { ActorBackendFactory } from "./actor-backend.js";
import { calibrationSet, type RowSummary } from "./calibration.js";
import { type CalibrateOptions, calibrate, writeReport } from "./calibration-run.js";
import { type FakeLlm, fakeLlm } from "./fake-llm.js";
import type { CompleteRequest, Llm } from "./llm.js";
import { llmActor } from "./llm-actor.js";
import { parseLlmSettings } from "./llm-settings.js";
import { loadModelPrices, type ModelPrice, priceOf } from "./models.js";

// Building the app and launching Chromium take longer than vitest's 5 s hook default, and a set
// records, encodes and saves a video per run.
vi.setConfig({ testTimeout: 180_000, hookTimeout: 120_000 });

// Not zero, so a row's cost is seen to be its own answers'. The dollars are a power of two, so
// sums of them are exact.
const COST: Cost = { tokensIn: 1000, tokensOut: 100, usd: 0.125 };

// "fake" has no price in models.yaml, so no run here can build the real adapter by mistake.
const settings = parseLlmSettings({ LLM_API_KEY: "test-key", LLM_ACTOR_MODEL: "fake" });

/** The price the CLI reads for the default Actor model, so the estimate is the real one. */
const LUNA: ModelPrice = priceOf(loadModelPrices(), "openai/gpt-6-luna");

/** A model that bills nothing, so the estimate is 0 and only the running spend can stop a set. */
const FREE: ModelPrice = { input: 0, output: 0, jsonSchema: true };

const quiet = pino({ level: "silent" });

let app: TargetApp;
let browser: Browser;
let runsDir: string;

beforeAll(async () => {
  browser = await chromium.launch().catch((error: unknown) => {
    throw new Error(
      "Chromium did not launch. If it is not installed, run " +
        "`pnpm --filter @wayford/agent exec playwright install --only-shell chromium`.",
      { cause: error },
    );
  });
  app = await serveTargetApp();
  // From here on a run that reached for a network would fail.
  vi.stubGlobal("fetch", () => {
    throw new Error("a test reached for the network");
  });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await browser?.close();
  await app?.close();
});

beforeEach(async () => {
  runsDir = await mkdtemp(join(tmpdir(), "wayford-calibration-"));
});

afterEach(async () => {
  // A test that failed half way can leave a context open, and its video would hold the directory.
  await Promise.all(browser.contexts().map((context) => context.close()));
  await rm(runsDir, { recursive: true, force: true, maxRetries: 3 });
});

// ---------------------------------------------------------------------------
// Answers picked from the page shown
// ---------------------------------------------------------------------------

type Request = CompleteRequest<z.ZodObject>;

const GIVE_UP: ActorResponse = { narration: "I cannot find it here.", action: { type: "giveUp" } };

/** A page line of the observation text, such as `[e3] link "Deliveries" at 410,25`. */
const PAGE_LINE = /^\[(e[1-9][0-9]*)\] (.*)$/;

/** The turn message the request carries: the goal, the history, then the page. */
function turnOf(request: Request): string {
  return request.messages[1]?.content ?? "";
}

/** The ref of the first page line naming `<role> "<name>"`, or undefined when none is shown. */
function refOf(request: Request, role: string, name: string): string | undefined {
  const named = `${role} ${JSON.stringify(name)} at `;
  for (const line of turnOf(request).split("\n")) {
    const match = PAGE_LINE.exec(line);
    if (match?.[1] !== undefined && match[2]?.startsWith(named)) return match[1];
  }
  return undefined;
}

/** The pathname of the page shown. History lines start with "- On", so only the page has `URL:`. */
function pathOf(request: Request): string {
  const line = turnOf(request)
    .split("\n")
    .find((candidate) => candidate.startsWith("URL: "));
  return line === undefined ? "" : new URL(line.slice("URL: ".length)).pathname;
}

/** Clicks the first of `wanted` the page shows, in order, or gives up when it shows none. */
function clickFirst(
  request: Request,
  wanted: readonly (readonly [role: string, name: string])[],
): ActorResponse {
  for (const [role, name] of wanted) {
    const ref = refOf(request, role, name);
    if (ref !== undefined)
      return { narration: `${name} looks right.`, action: { type: "click", ref } };
  }
  return GIVE_UP;
}

const EASY_GOAL = taskFixture("task_next-parcel").goal;

/**
 * One answer, from the goal and the page shown: on `/`, "Your account"; on `/account`, "Delivery
 * address" for the easy goal, and for the hard one "Past orders" when the menu is open, else
 * "More options". Anything else, or an element not shown, gives up.
 */
function decide(request: Request): ActorResponse {
  const easy = turnOf(request).includes(`Your goal: ${EASY_GOAL}`);
  switch (pathOf(request)) {
    case "/":
      return clickFirst(request, [["link", "Your account"]]);
    case "/account":
      return easy
        ? clickFirst(request, [["link", "Delivery address"]])
        : clickFirst(request, [
            ["menuitem", "Past orders"],
            ["button", "More options"],
          ]);
    default:
      return GIVE_UP;
  }
}

/** Every answer takes at least this long, so each step's model time is seen to be measured. */
const ANSWER_MS = 20;

/** The model time a run's step may read over its fake's own answers: the adapter's parsing. */
const TOLERANCE_MS_PER_ANSWER = 5;

/** At least `ms` by `performance.now()`, which a timer alone can miss by a millisecond. */
async function waitAtLeast(ms: number): Promise<void> {
  const end = performance.now() + ms;
  while (performance.now() < end) await sleep(end - performance.now());
}

/** Per run id, how long each of its fake's answers took, as the fake timed them itself. */
const answerMs = new Map<string, number[]>();

/**
 * The fake, billing COST for each answer it gives, ANSWER_MS after it was asked, and recording
 * under `runId` how long the answer took.
 */
function billed(fake: FakeLlm, runId: string): Llm {
  const took: number[] = [];
  answerMs.set(runId, took);
  return {
    ...fake,
    complete: async (request) => {
      const t0 = performance.now();
      const answer = await fake.complete(request);
      await waitAtLeast(ANSWER_MS);
      took.push(performance.now() - t0);
      return { ...answer, cost: COST };
    },
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** What `n` answers cost. */
function costOfAnswers(n: number): number {
  return n * COST.usd;
}

/**
 * The LLM backend on a fresh fake per run, which answers every turn with `decide`. The run's
 * logger carries its id, so the fake's times are filed by run.
 */
const fakeBackend: ActorBackendFactory = llmActor({
  settings,
  // More answers than a run can ask for: the cap is 20 steps, one retry each.
  llm: (logger) =>
    billed(
      fakeLlm({ actor: Array.from({ length: 40 }, () => decide) }),
      String(logger.bindings().runId),
    ),
});

function options(overrides: Partial<CalibrateOptions>): CalibrateOptions {
  return {
    rows: calibrationSet(),
    seeds: [1, 2],
    maxUsd: 100,
    backend: fakeBackend,
    actor: settings.roles.actor,
    price: LUNA,
    browser,
    origin: app.origin,
    runsDir,
    logger: quiet,
    ...overrides,
  };
}

/** A row's summary without its time columns, which are measured, not fixed. */
function pinned(summary: RowSummary | undefined) {
  if (summary === undefined) throw new Error("no summary");
  const { medianLatencyMs, medianWallMs, ...rest } = summary;
  expect(medianLatencyMs).toBeGreaterThanOrEqual(ANSWER_MS);
  expect(medianWallMs).toBeGreaterThanOrEqual(0);
  return rest;
}

const NO_ENDS = { gave_up: 0, step_cap: 0, clock: 0, error: 0 };

// ---------------------------------------------------------------------------
// The boxes
// ---------------------------------------------------------------------------

test("a fake adapter gives a fixed table", async () => {
  // Runs in flight, read at every answer as the browser's open contexts: each run opens its own
  // and closes it before `runActor` returns, so the count is exactly the runs under way.
  let peak = 0;
  const counted: ActorBackendFactory = (run) => {
    const backend = fakeBackend(run);
    return {
      modelId: backend.modelId,
      answer(turn) {
        peak = Math.max(peak, browser.contexts().length);
        return backend.answer(turn);
      },
    };
  };

  const report = await calibrate(options({ backend: counted }));

  // More than one at a time, never more than the default five.
  expect(peak).toBeGreaterThan(1);
  expect(peak).toBeLessThanOrEqual(5);

  const reached = (label: string, steps: number, routes: RowSummary["routes"]) => ({
    label,
    runs: 2,
    successes: 2,
    routes,
    ends: NO_ENDS,
    medianSteps: steps,
    medianPromptTokens: COST.tokensIn,
    costUsd: costOfAnswers(2 * steps),
  });
  // The kebab's "More options" is out of reach on /account for three rows: P4 hides it from both
  // Veras, and K1 and K4 rename it to its bare role for Kai (s1-03), so the fake, which clicks by
  // name, finds nothing to click. Each clicks "Your account", then gives up.
  const gaveUp = (label: string) => ({
    label,
    runs: 2,
    successes: 0,
    routes: {},
    ends: { ...NO_ENDS, gave_up: 2 },
    medianSteps: 2,
    medianPromptTokens: COST.tokensIn,
    costUsd: costOfAnswers(4),
  });
  expect(report.rows.map((row) => pinned(row.summary))).toStrictEqual([
    { ...reached("Ada, easy", 2, {}), judged: "reach", verdict: "pass" },
    { ...reached("Ada, hard", 3, { B: 2 }), judged: "reach", verdict: "pass" },
    gaveUp("Vera, hard"),
    gaveUp("Kai, hard"),
    { ...gaveUp("Vera hard-cut, hard"), judged: "never", verdict: "pass" },
  ]);
  expect(report.goNoGo).toBe("go");
  expect(report.notRun).toBe(0);
  expect(report.rows.filter((row) => row.summary.verdict === "fail")).toStrictEqual([]);

  // What the set ran on, and the guards' figures: 10 runs of at most 20 steps on Luna.
  expect(report.header).toStrictEqual({
    backendId: "llm",
    model: "fake",
    effort: settings.roles.actor.effort,
    concurrency: 5,
    seeds: [1, 2],
    maxSteps: 20,
  });
  expect(report.maxUsd).toBe(100);
  // 10 runs × 20 steps × (2,000 × 0.10 + 500 × 0.50) / 1e6.
  expect(report.estimateUsd).toBeCloseTo(0.09, 10);
  // Steps per run: Ada easy 2, Ada hard 3, Vera 2, Kai 2, the hard-cut Vera 2; two seeds each.
  expect(report.spentUsd).toBe(costOfAnswers(2 * 2 + 3 * 2 + 2 * 2 + 2 * 2 + 2 * 2));
  expect(report.resultRuns).toBe(10);
  expect(report.meanRunUsd).toBe(report.spentUsd / 10);
  expect(report.seedDemoUsd).toBe(report.meanRunUsd * 60);

  // Each row carries its profile and task, and each run its record, in seed order.
  const hardCut = calibrationSet()[4];
  expect(report.rows[4]?.profile).toStrictEqual(hardCut?.profile);
  expect(report.rows.map((row) => [row.profile.id, row.taskId])).toStrictEqual([
    ["prof_ada", "task_next-parcel"],
    ["prof_ada", "task_past-order"],
    ["prof_vera", "task_past-order"],
    ["prof_kai", "task_past-order"],
    ["prof_vera", "task_past-order"],
  ]);
  for (const row of report.rows) {
    expect(row.runs.map((run) => run.seed)).toStrictEqual([1, 2]);
    for (const run of row.runs) {
      expect(run.error).toBeUndefined();
      expect(run.steps).toBe(row.summary.medianSteps);
      // One answer per step, each timed: none can be shorter than the fake's wait, and the run's
      // steps add up to its own answers, so no step carries an earlier one's time.
      expect(run.latencyMs).toHaveLength(run.steps ?? -1);
      for (const ms of run.latencyMs) expect(ms).toBeGreaterThanOrEqual(ANSWER_MS);
      const fake = answerMs.get(run.runId ?? "") ?? [];
      expect(fake).toHaveLength(run.steps ?? -1);
      expect(Math.abs(sum(run.latencyMs) - sum(fake))).toBeLessThanOrEqual(
        TOLERANCE_MS_PER_ANSWER * fake.length,
      );
      expect(run.wallMs).toBeGreaterThanOrEqual(0);
      expect(run.costUsd).toBe(costOfAnswers(run.steps ?? 0));
      // Written as `run:one` writes it.
      expect((await stat(join(runsDir, run.runId ?? "", "result.json"))).isFile()).toBe(true);
    }
  }
  expect(report.rows[1]?.runs.map((run) => [run.outcome, run.end, run.route])).toStrictEqual([
    ["success", "success", "B"],
    ["success", "success", "B"],
  ]);

  // The report file is the report, whole.
  const reportDir = join(runsDir, "calibration");
  const path = await writeReport(report, reportDir);
  expect(path.startsWith(reportDir)).toBe(true);
  expect(path).not.toContain(":");
  expect(JSON.parse(await readFile(path, "utf8"))).toStrictEqual(
    JSON.parse(JSON.stringify(report)),
  );
});

test("maxUsd 0.01 starts no run", async () => {
  const factory = vi.fn<ActorBackendFactory>(fakeBackend);

  const set = calibrate(
    options({ seeds: [1, 2, 3, 4, 5], maxUsd: 0.01, backend: factory, price: LUNA }),
  );

  await expect(set).rejects.toThrow(WayfordError);
  await expect(set).rejects.toMatchObject({ code: "calibration_over_budget" });
  await expect(set).rejects.toThrow(/0\.2250 USD.*0\.0100 USD/);
  expect(factory).not.toHaveBeenCalled();
  expect(await readdir(runsDir)).toStrictEqual([]);
});

test("the spend reaching maxUsd starts no new run, and the set is incomplete and unjudged", async () => {
  const easy = calibrationSet().slice(0, 1);

  // One at a time: the first run bills two answers, 0.25 USD, over the limit.
  const report = await calibrate(
    options({ rows: easy, seeds: [1, 2, 3], maxUsd: 0.2, price: FREE, concurrency: 1 }),
  );

  expect(report.estimateUsd).toBe(0);
  expect(report.rows[0]?.runs.map((run) => run.seed)).toStrictEqual([1]);
  expect(report.rows[0]?.summary).toMatchObject({ runs: 1, successes: 1, judged: "reach" });
  // One success of one run would pass the row; a set cut short judges none.
  expect(report.rows[0]?.summary.verdict).toBeUndefined();
  expect(report.notRun).toBe(2);
  expect(report.goNoGo).toBe("incomplete");
  expect(report.spentUsd).toBe(costOfAnswers(2));
});

test("a run billed before it rejects counts in the spend, and stops new runs", async () => {
  const easy = calibrationSet().slice(0, 1);
  // At every answer, a directory where each run's result.json goes, so writing it fails after the
  // terminal event, billed answers and all. The run's own directory exists from its start.
  const blocked: ActorBackendFactory = (run) => {
    const backend = fakeBackend(run);
    return {
      modelId: backend.modelId,
      async answer(turn) {
        for (const name of await readdir(runsDir)) {
          await mkdir(join(runsDir, name, "result.json"), { recursive: true });
        }
        return backend.answer(turn);
      },
    };
  };

  // One at a time: the first run bills two answers, 0.25 USD, over the limit, then rejects.
  const report = await calibrate(
    options({
      rows: easy,
      seeds: [1, 2, 3],
      maxUsd: 0.1,
      price: FREE,
      backend: blocked,
      concurrency: 1,
    }),
  );

  const runs = report.rows[0]?.runs ?? [];
  expect(runs.map((run) => [run.seed, run.end, run.costUsd])).toStrictEqual([
    [1, "error", costOfAnswers(2)],
  ]);
  expect(runs[0]?.error).toMatch(/EISDIR|directory/i);
  expect(report.rows[0]?.summary).toMatchObject({
    runs: 1,
    successes: 0,
    ends: { ...NO_ENDS, error: 1 },
    costUsd: costOfAnswers(2),
  });
  expect(report.spentUsd).toBe(costOfAnswers(2));
  expect(report.notRun).toBe(2);
  expect(report.goNoGo).toBe("incomplete");
  // No result, so no mean: the billed cost is in the spend, not over a run with a result.
  expect(report.resultRuns).toBe(0);
  expect(await readdir(runsDir)).toHaveLength(1);
});

test("a run that rejects is an error and the others finish", async () => {
  const easy = calibrationSet().slice(0, 1);
  // One at a time, so the second run built is seed 2's.
  let built = 0;
  const factory: ActorBackendFactory = (run) => {
    built += 1;
    if (built === 2) throw new Error("the backend could not be built");
    return fakeBackend(run);
  };

  const report = await calibrate(
    options({ rows: easy, seeds: [1, 2, 3], backend: factory, concurrency: 1 }),
  );

  const runs = report.rows[0]?.runs ?? [];
  expect(runs.map((run) => [run.seed, run.end])).toStrictEqual([
    [1, "success"],
    [2, "error"],
    [3, "success"],
  ]);
  expect(runs[1]).toStrictEqual({
    seed: 2,
    end: "error",
    error: "the backend could not be built",
    latencyMs: [],
  });
  // An errored run is a miss on a "reach" row: 2 of 3 is under the bar of 3.
  expect(report.rows[0]?.summary).toMatchObject({
    runs: 3,
    successes: 2,
    ends: { ...NO_ENDS, error: 1 },
    verdict: "fail",
  });
  expect(report.goNoGo).toBe("no-go");
  expect(
    report.rows.filter((row) => row.summary.verdict === "fail").map((row) => row.label),
  ).toStrictEqual(["Ada, easy"]);
  // The mean is over the two runs with a result, not the rejected one.
  expect(report.resultRuns).toBe(2);
  // Two run directories, none for the run that never started.
  expect(await readdir(runsDir)).toHaveLength(2);
});
