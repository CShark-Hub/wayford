/**
 * The sweep engine on the fake run (`docs/specs/2026-10-05-s4-05-sweep.md`, §3 and §7): the same
 * seeds at every value, laxest first, the boundary rule, the row saved incomplete then complete,
 * errors, the spend stop, and the two pins that tie a sweep to agent and to the route walk.
 */
import { ActorBackendName, startUrlFor, TARGET_APP_DEFAULTS } from "@wayford/agent";
import {
  type Profile,
  type Seed,
  SWEEP_BACKENDS,
  Sweep,
  type SweepValue,
  sweptValueOf,
  WayfordError,
} from "@wayford/core";
import { profileFixture, taskFixture } from "@wayford/core/fixtures";
import { TARGET_APP_DEFAULT_QUERY } from "@wayford/filter/serve-target-app";
import { afterEach, beforeEach, expect, test } from "vitest";
import { loadRun } from "./db/runs.js";
import { sweeps } from "./db/schema.js";
import { listSweeps, loadSweep } from "./db/sweeps.js";
import { createRunner } from "./runner.js";
import { runSweep, type SweepDeps, type SweepInput } from "./sweep.js";
import {
  FAKE_STEP_COST,
  type FakeRun,
  type FakeScript,
  fakeBackends,
  fakeRun,
  quiet,
  runnerDefaults,
  type TempStore,
  tempStore,
} from "./test-app.js";

const vera = profileFixture("prof_vera");
const kai = profileFixture("prof_kai");
const task = taskFixture("task_past-order");

let store: TempStore;
beforeEach(async () => {
  store = await tempStore();
});
afterEach(async () => {
  await store.close();
});

/** Deps on `store` with a runner on `run`; no route table unless a test gives one. */
function depsOn(run: FakeRun, overrides: Partial<SweepDeps> = {}): SweepDeps {
  return {
    db: store.db,
    runner: createRunner({ ...runnerDefaults(store), run }),
    logger: quiet,
    routeOpen: () => undefined,
    now: () => new Date("2026-10-05T12:00:00.000Z"),
    ...overrides,
  };
}

/** Vera on contrast, 1.5 to 3.5 by 0.5, seeds 1 to 4, on the LLM backend. */
const veraContrast: SweepInput = {
  task,
  profile: vera,
  axis: "contrast",
  from: 1.5,
  to: 3.5,
  step: 0.5,
  seeds: [1, 2, 3, 4],
  backend: "llm",
};

/** A fake whose run fails (`gave_up`) where `fails(value, seed)` says so, and succeeds elsewhere. */
function failingWhere(fails: (value: number, seed: Seed) => boolean): FakeRun {
  return fakeRun(({ profile, seed, sweep }): FakeScript => {
    const value = sweep === undefined ? undefined : sweptValueOf(profile, sweep.axis);
    if (value === undefined) throw new Error("the fake sweep run got no swept value");
    return fails(value, seed) ? { end: { outcome: "gave_up" } } : {};
  });
}

/** The swept value each call ran at, and its seed, in call order. */
function calledAt(run: FakeRun): { value: number | undefined; seed: Seed }[] {
  return run.calls.map(({ sweep, seed }) => ({ value: sweep?.value, seed }));
}

test("every value runs the same seeds, laxest first, one value after another, on the named backend", async () => {
  const run = fakeRun();
  const sweep = await runSweep(depsOn(run), { ...veraContrast, backend: "jev" });

  const grid = [1.5, 2, 2.5, 3, 3.5];
  expect(sweep.values.map(({ value }) => value)).toStrictEqual(grid);
  // Laxest first, seed order within a value. That a value waits for the one before it to settle
  // is the spend-stop test's to prove: the runner's FIFO would call them in this order too.
  expect(calledAt(run)).toStrictEqual(
    grid.flatMap((value) => [1, 2, 3, 4].map((seed) => ({ value, seed }))),
  );
  for (const call of run.calls) {
    expect(call).toMatchObject({ backend: fakeBackends.jev, sweep: { sweepId: sweep.id } });
  }
  for (const row of sweep.values) {
    expect(row.runIds).toHaveLength(4);
    const seeds = await Promise.all(
      row.runIds.map(async (id) => (await loadRun(store.db, id))?.seed),
    );
    expect(seeds).toStrictEqual([1, 2, 3, 4]);
    expect(row).toMatchObject({ successes: 4, errors: 0, routeOpenSeeds: null });
  }
  expect(sweep).toMatchObject({
    taskId: task.id,
    profileId: vera.id,
    backend: "jev",
    seeds: [1, 2, 3, 4],
    startedAt: "2026-10-05T12:00:00.000Z",
    status: "complete",
    axis: "contrast",
    from: 1.5,
    to: 3.5,
    step: 0.5,
    boundary: null,
  });
  expect(sweep.id).toMatch(/^swp_[0-9a-z]{26}$/);
  expect(await loadSweep(store.db, sweep.id)).toStrictEqual(sweep);
});

test("the boundary is the first value whose rate is strictly below 50%", async () => {
  // 2.0: seeds 1 and 2 fail, 2/4 is not below half. 2.5 on: seeds 1 to 3 fail, 1/4 is.
  const run = failingWhere((value, seed) => (value >= 2.5 ? seed <= 3 : value >= 2 && seed <= 2));
  const sweep = await runSweep(depsOn(run), veraContrast);

  expect(sweep.values.map(({ value, successes }) => [value, successes])).toStrictEqual([
    [1.5, 4],
    [2, 2],
    [2.5, 1],
    [3, 1],
    [3.5, 1],
  ]);
  expect(sweep.boundary).toBe(2.5);
});

test("maxElements from 4 to 16 runs 16 down to 4, and failing at a cap of 12 or below gives 12", async () => {
  const run = failingWhere((value) => value <= 12);
  const sweep = await runSweep(depsOn(run), {
    task,
    profile: kai,
    axis: "maxElements",
    from: 4,
    to: 16,
    step: 2,
    seeds: [1, 2],
    backend: "llm",
  });

  expect(sweep.values.map(({ value }) => value)).toStrictEqual([16, 14, 12, 10, 8, 6, 4]);
  expect(sweep.values.map(({ successes }) => successes)).toStrictEqual([2, 2, 0, 0, 0, 0, 0]);
  expect(sweep.boundary).toBe(12);
  // Each run's profile has the swept cap, and nothing else of Kai's changed.
  for (const { profile, sweep: stamp } of run.calls) {
    expect(profile).toStrictEqual({
      ...kai,
      behaviour: { ...kai.behaviour, maxElements: stamp?.value },
    });
  }
});

test("the row is stored incomplete while the sweep runs and complete at the end", async () => {
  const seen: { status: string; values: number; row: SweepValue }[] = [];
  const run = fakeRun();
  const deps = depsOn(run, {
    onValue: (row) => {
      // Read synchronously, so this is the row as stored when the value settled.
      const stored = store.db.select({ document: sweeps.document }).from(sweeps).all();
      expect(stored).toHaveLength(1);
      const sweep = Sweep.parse(stored[0]?.document);
      seen.push({ status: sweep.status, values: sweep.values.length, row });
    },
  });
  const sweep = await runSweep(deps, veraContrast);

  expect(seen.map(({ status, values }) => [status, values])).toStrictEqual([
    ["incomplete", 1],
    ["incomplete", 2],
    ["incomplete", 3],
    ["incomplete", 4],
    ["incomplete", 5],
  ]);
  expect(seen.map(({ row }) => row)).toStrictEqual(sweep.values);
  expect(sweep.status).toBe("complete");
  expect((await loadSweep(store.db, sweep.id))?.status).toBe("complete");
});

test("a run that fails, crashes or is never stored counts in errors, and not as a success", async () => {
  const run = fakeRun(({ seed }): FakeScript => {
    if (seed === 2) return { end: { failed: "the page never loaded" } };
    if (seed === 3) return { throws: "afterStart" };
    // Never sends `runStarted`, so the runner stores nothing.
    if (seed === 4) return { throws: "beforeStart" };
    return {};
  });
  const sweep = await runSweep(depsOn(run), { ...veraContrast, from: 2, to: 2.5 });

  for (const row of sweep.values) {
    expect(row).toMatchObject({ successes: 1, errors: 3 });
    expect(row.runIds).toHaveLength(4);
    expect(await loadRun(store.db, row.runIds[3] ?? "")).toBeUndefined();
  }
  // An error at the first value stops the claim there (`boundaryOf`).
  expect(sweep.boundary).toBeNull();
  expect(sweep.status).toBe("complete");
});

test("spend reaching maxUsd stops before the next value, leaves the row incomplete and throws", async () => {
  // Each run bills one fake step, so a value of two seeds costs two steps.
  const run = fakeRun(() => ({ step: true }));
  const maxUsd = 4 * FAKE_STEP_COST.usd;
  const sweeping = runSweep(depsOn(run, { maxUsd }), { ...veraContrast, seeds: [1, 2] });

  await expect(sweeping).rejects.toThrow(WayfordError);
  await expect(sweeping).rejects.toMatchObject({ code: "sweep_over_budget" });
  // Two values ran; the third never started.
  expect(calledAt(run).map(({ value }) => value)).toStrictEqual([1.5, 1.5, 2, 2]);
  const [stored] = await listSweeps(store.db);
  expect(stored).toMatchObject({ status: "incomplete", boundary: null });
  expect(stored?.values.map(({ value }) => value)).toStrictEqual([1.5, 2]);
});

test("spend under maxUsd runs every value, and onValue gets the spend so far", async () => {
  const run = fakeRun(() => ({ step: true }));
  const maxUsd = 10 * FAKE_STEP_COST.usd + 0.01;
  const spent: number[] = [];
  const onValue = (_row: SweepValue, spentUsd: number) => spent.push(spentUsd);
  const sweep = await runSweep(depsOn(run, { maxUsd, onValue }), {
    ...veraContrast,
    seeds: [1, 2],
  });

  expect(sweep.status).toBe("complete");
  expect(run.calls).toHaveLength(10);
  // Two runs of one fake step each per value.
  expect(spent).toHaveLength(5);
  expect(spent).toStrictEqual(
    [1, 2, 3, 4, 5].map((n) => expect.closeTo(n * 2 * FAKE_STEP_COST.usd)),
  );
});

test("onStart gets the stored sweep once, incomplete with no values, before any value runs", async () => {
  const run = fakeRun();
  const begun: { sweep: Sweep; stored: unknown; calls: number }[] = [];
  const deps = depsOn(run, {
    onStart: (sweep) => {
      // Read synchronously, so this is the row as stored when the sweep began.
      const stored = store.db.select({ document: sweeps.document }).from(sweeps).all();
      begun.push({
        sweep,
        stored: stored.map(({ document }) => document),
        calls: run.calls.length,
      });
    },
  });
  const sweep = await runSweep(deps, veraContrast);

  expect(begun).toHaveLength(1);
  const [first] = begun;
  expect(first?.calls).toBe(0);
  expect(first?.sweep).toMatchObject({
    id: sweep.id,
    status: "incomplete",
    values: [],
    boundary: null,
  });
  expect(first?.stored).toStrictEqual([first?.sweep]);
});

test("route-open is asked with the swept profile and the sweep's seeds, and stored per value", async () => {
  const asked: { threshold: number | undefined; seeds: readonly Seed[] }[] = [];
  const routeOpen = (profile: Profile, seeds: readonly Seed[]) => {
    const threshold = profile.perception.contrast?.threshold;
    asked.push({ threshold, seeds });
    // Fewer seeds keep a route open as the threshold tightens.
    return seeds.filter((seed) => seed <= 4 - ((threshold ?? 0) - 1.5) * 2);
  };
  const sweep = await runSweep(depsOn(fakeRun(), { routeOpen }), veraContrast);

  expect(asked).toStrictEqual(
    [1.5, 2, 2.5, 3, 3.5].map((threshold) => ({ threshold, seeds: [1, 2, 3, 4] })),
  );
  expect(sweep.values.map(({ routeOpenSeeds }) => routeOpenSeeds)).toStrictEqual([
    [1, 2, 3, 4],
    [1, 2, 3],
    [1, 2],
    [1],
    [],
  ]);
});

test("a bad range or an axis the persona does not set is refused before anything is stored or run", async () => {
  const run = fakeRun();
  await expect(runSweep(depsOn(run), { ...veraContrast, step: 0 })).rejects.toMatchObject({
    code: "invalid_sweep_range",
  });
  await expect(runSweep(depsOn(run), { ...veraContrast, profile: kai })).rejects.toMatchObject({
    code: "sweep_axis_unset",
  });

  expect(run.calls).toHaveLength(0);
  expect(await listSweeps(store.db)).toStrictEqual([]);
});

test("a sweep's backends are agent's Actor backends", () => {
  expect([...SWEEP_BACKENDS]).toStrictEqual(ActorBackendName.options);
});

test("the runs' start URL carries the query the route walk measures at", () => {
  // The route-open share is about the page the runs saw (spec §6, "Tying the share to the runs").
  expect(startUrlFor(task, TARGET_APP_DEFAULTS).endsWith(TARGET_APP_DEFAULT_QUERY)).toBe(true);
});
