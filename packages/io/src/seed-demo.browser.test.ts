/**
 * The `--fake` box of `tasks/s4-07-seed-demo.md`: `seedDemo` on a reduced plan, seeds 1 and 2 and
 * two values per sweep, into a fresh store, on what `seed:demo --fake` runs on. That means the
 * real `runActor` against the served target app, the real Jev backend on the fake `decide`, the
 * fake Analyst, and the route facts from the real walk.
 *
 * No test reaches a model or a network: `fetch` throws from the moment the app is up and walked.
 */
import { join } from "node:path";
import type { DeviceKind, Task } from "@wayford/core";
import { type WalkedRoute, walkRoutes } from "@wayford/filter/routes";
import { serveTargetApp, type TargetApp } from "@wayford/filter/serve-target-app";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { sharedBrowser, sharedChromium } from "./chromium.js";
import { loadReport } from "./db/reports.js";
import { listRuns } from "./db/runs.js";
import { listSweeps } from "./db/sweeps.js";
import { createRunner } from "./runner.js";
import {
  DEMO_PLAN,
  type DemoPlan,
  FAKE_JEV_MODEL,
  fakeDemoBackends,
  fakeDemoLlm,
  plannedDevices,
  seedDemo,
  summaryText,
} from "./seed-demo.js";
import { boundaryLine } from "./sweep-text.js";
import { fakeAxe, quiet, runnerDefaults, type TempStore, tempStore } from "./test-app.js";

// The walk and the app's build take longer than vitest's 5 s hook default, and the seed runs
// twenty runs, each recording, encoding and saving a video.
vi.setConfig({ testTimeout: 300_000, hookTimeout: 120_000 });

let target: TargetApp;
let store: TempStore;
let walks: Map<DeviceKind, WalkedRoute[]>;
/** Every browser the shared Chromium launched, so the test can close them. */
const browsers: Browser[] = [];

beforeAll(async () => {
  const [walked, served, temp] = await Promise.all([
    walkRoutes(plannedDevices(DEMO_PLAN)),
    serveTargetApp(),
    tempStore(),
  ]);
  walks = walked;
  target = served;
  store = temp;
  vi.stubGlobal("fetch", () => {
    throw new Error("a test reached for the network");
  });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await Promise.all(browsers.map((browser) => browser.close()));
  await store?.close();
  await target?.close();
});

/**
 * `DEMO_PLAN` cut to seeds 1 and 2 and two values per sweep, every task started on the app served
 * here: the fake finds its task by the goal, which is unchanged.
 */
function reducedPlan(origin: string): DemoPlan {
  const served = (task: Task): Task => ({ ...task, startUrl: `${origin}/` });
  const [vera, kai] = DEMO_PLAN.sweeps;
  if (vera?.axis !== "contrast" || kai?.axis !== "maxElements") {
    throw new Error("DEMO_PLAN no longer sweeps Vera's contrast, then Kai's maxElements");
  }
  return {
    ...DEMO_PLAN,
    tasks: DEMO_PLAN.tasks.map(served),
    seeds: [1, 2],
    sweeps: [
      { ...vera, task: served(vera.task), from: 2, to: 4, step: 2 },
      { ...kai, task: served(kai.task), from: 16, to: 8, step: 8 },
    ],
  };
}

test("the fake path on the reduced plan: 12 runs with a decision on every step, 2 reports, 2 sweeps of 4 runs", async () => {
  const runner = createRunner({
    ...runnerDefaults(store),
    run: sharedChromium(
      sharedBrowser(async () => {
        const browser = await chromium.launch();
        browsers.push(browser);
        return browser;
      }),
    ),
    backends: fakeDemoBackends(),
    defaultBackend: "jev",
  });
  const said: string[] = [];
  const axe = fakeAxe();

  const summary = await seedDemo(
    {
      db: store.db,
      runner,
      backend: "jev",
      llm: fakeDemoLlm(),
      walks,
      groundTruthDir: join(store.dir, "ground-truth"),
      jevModel: FAKE_JEV_MODEL,
      // No axe-core here: the CLI scans the served app, and the Analyst's axe findings are
      // `analyst-axe.test.ts`'s. Every page the runs stood on is asked for.
      axe,
      logger: quiet,
      say: (line) => said.push(line),
    },
    reducedPlan(target.origin),
  );

  // The run sets: 3 personas × 2 tasks × 2 seeds, every step drawn from the fake Jev's answer.
  const setRuns = await listRuns(store.db);
  expect(setRuns).toHaveLength(12);
  for (const run of setRuns) {
    expect(run.outcome, run.id).not.toBe("error");
    expect(run.modelIds.actor).toBe(FAKE_JEV_MODEL);
    expect(run.steps.length, run.id).toBeGreaterThan(0);
    for (const step of run.steps) {
      expect("decision" in step && step.decision !== undefined, `${run.id} ${step.stepIndex}`).toBe(
        true,
      );
    }
  }
  // Not vacuous: on each goal the fake walked the served pages, so some run got through. The easy
  // goal's path is the fake's own, so this is what notices it drifting from the app.
  for (const task of DEMO_PLAN.tasks) {
    const through = setRuns.filter((run) => run.taskId === task.id && run.outcome === "success");
    expect(through.length, task.id).toBeGreaterThan(0);
  }

  // A report per task, on Jev, over its run set alone.
  for (const task of DEMO_PLAN.tasks) {
    const report = await loadReport(store.db, task.id);
    expect(report, task.id).toMatchObject({ backend: "jev", runCount: 6, analystModelId: "fake" });
    expect(report?.leftOut.sweepRuns).toBe(0);
    // The fake Analyst writes a hypothesis on a run that did not get through, when there is one.
    const failed = setRuns.some((run) => run.taskId === task.id && run.outcome !== "success");
    expect(report?.findings.some((finding) => finding.type === "hypothesis")).toBe(failed);
  }

  // Two sweeps of two values on two seeds, each stored complete with its boundary or none.
  const sweeps = await listSweeps(store.db);
  expect(sweeps).toHaveLength(2);
  const text = summaryText(summary);
  for (const sweep of sweeps) {
    expect(sweep.status).toBe("complete");
    expect(sweep.values).toHaveLength(2);
    expect(await listRuns(store.db, { sweepId: sweep.id })).toHaveLength(4);
    const line = boundaryLine(sweep.axis, sweep.values, sweep.seeds.length);
    expect(text).toContain(line);
    expect(line.startsWith(sweep.boundary === null ? "no boundary" : "boundary ")).toBe(true);
  }

  expect(summary).toMatchObject({ setRuns: 12, models: [FAKE_JEV_MODEL] });
  expect(text).toContain("12 in the run sets, 8 in 2 sweeps");
  // The tally the pitch quotes is the stored runs' own, outcome by outcome.
  const sweepRuns = await Promise.all(sweeps.map(({ id }) => listRuns(store.db, { sweepId: id })));
  const tally = { success: 0, gave_up: 0, budget_exceeded: 0, error: 0, missing: 0 };
  for (const run of [...setRuns, ...sweepRuns.flat()]) tally[run.outcome] += 1;
  expect(summary.outcomes).toStrictEqual(tally);
  expect(tally.error).toBe(0);
  expect(said[0]).toBe("run sets   12 runs on jev");
  // The reports read axe-core's scans of the pages the runs stood on (s4-06).
  expect(axe.asked.length).toBeGreaterThan(0);
});
