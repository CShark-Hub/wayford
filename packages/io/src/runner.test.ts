/**
 * The runner on the fake run (`docs/specs/2026-10-02-s4-03-runs-api.md`, "runner.ts"): seed-major
 * starts, five slots with one FIFO across `start` calls, live events, and the close-out that stores
 * each run as the fold of what it published before its stream sees the end, and ends the stream
 * when the save fails.
 */
import { setTimeout as sleep } from "node:timers/promises";
import { TARGET_APP_DEFAULTS } from "@wayford/agent";
import { type Profile, type RunEvent, runResultFromEvents, type Seed } from "@wayford/core";
import {
  profileFixture,
  runResultFixture,
  targetAppJargon,
  taskFixture,
} from "@wayford/core/fixtures";
import { eq } from "drizzle-orm";
import pino from "pino";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { listRuns, loadRun, saveRun } from "./db/runs.js";
import { runs } from "./db/schema.js";
import {
  createRunner,
  type LiveRun,
  MAX_CONCURRENT_RUNS,
  type RunFn,
  type Runner,
  type RunnerOptions,
  type StartedRun,
} from "./runner.js";
import {
  FAKE_STEP_COST,
  fakeBackends,
  fakeRun,
  gate,
  quiet,
  runnerDefaults,
  type TempStore,
  tempStore,
} from "./test-app.js";

const ada = profileFixture("prof_ada");
const vera = profileFixture("prof_vera");
const zoya = profileFixture("prof_zoya");
const task = taskFixture("task_next-parcel");

let store: TempStore;
beforeEach(async () => {
  store = await tempStore();
});
afterEach(async () => {
  await store.close();
});

function runnerOn(run: RunFn, overrides: Partial<RunnerOptions> = {}): Runner {
  return createRunner({ ...runnerDefaults(store), run, ...overrides });
}

/** Starts one persona on one seed: its id and its live run. */
function startOne(runner: Runner, profile: Profile, seed: Seed): { id: string; live: LiveRun } {
  const [started] = runner.start(task, [profile], [seed]);
  const live = started && runner.live(started.id);
  if (started === undefined || live === undefined) throw new Error("start queued no run");
  return { id: started.id, live };
}

/** Waits for the run to end and returns every event it published. */
async function drain(live: LiveRun | undefined): Promise<readonly RunEvent[]> {
  if (live === undefined) throw new Error("the runner has no such run");
  while (!live.ended) await live.changed();
  return live.events;
}

/** Whether the run's row is in the database now, read synchronously. */
function storedNow(id: string): boolean {
  return store.db.select({ id: runs.id }).from(runs).where(eq(runs.id, id)).get() !== undefined;
}

/** One `gate()` per run, made when the fake run is called and opened by the test. */
function gates() {
  const made = new Map<string, ReturnType<typeof gate>>();
  return {
    /** The run's gate, for its fake run to wait on. */
    hold(runId: string | undefined): Promise<void> {
      const runGate = gate();
      made.set(String(runId), runGate);
      return runGate.promise;
    },
    open(runId: string): void {
      const runGate = made.get(runId);
      if (runGate === undefined) throw new Error(`run ${runId} was never called`);
      runGate.open();
    },
  };
}

test("start mints a run per seed × persona, seed-major, and returns before any run is called", async () => {
  const run = fakeRun();
  const runner = runnerOn(run);
  const started = runner.start(task, [ada, vera, zoya], [7, 8]);

  expect(started.map(({ profileId, seed }) => [profileId, seed])).toStrictEqual([
    ["prof_ada", 7],
    ["prof_vera", 7],
    ["prof_zoya", 7],
    ["prof_ada", 8],
    ["prof_vera", 8],
    ["prof_zoya", 8],
  ]);
  for (const { id } of started) expect(id).toMatch(/^run_[0-9a-z]{26}$/);
  expect(new Set(started.map(({ id }) => id)).size).toBe(started.length);
  // Each id is a live run at once, before its run is called.
  expect(run.calls).toHaveLength(0);
  for (const { id } of started) {
    expect(runner.live(id)).toMatchObject({ events: [], ended: false });
  }
  expect(runner.live("run_unknown")).toBeUndefined();

  for (const { id } of started) await drain(runner.live(id));
  expect(
    run.calls.map(({ runId, profile, seed }) => ({ id: runId, profileId: profile.id, seed })),
  ).toStrictEqual(started);
  for (const call of run.calls) {
    expect(call).toMatchObject({ task, params: TARGET_APP_DEFAULTS, runsDir: store.runsDir });
    // The runner's own list, handed on, so every run gets K2 (s1-05).
    expect(call.jargon).toBe(targetAppJargon);
    // A set that names no backend runs on the default, `llm` in `runnerDefaults`.
    expect(call.backend).toBe(fakeBackends.llm);
    expect(call.logger).toBe(quiet);
  }
});

test("a task on the target app's origin gets the parameters and the jargon list; any other origin, the same host on another port included, neither", async () => {
  const run = fakeRun();
  const runner = runnerOn(run, { targetAppOrigin: "http://localhost:5174" });
  const onApp = { ...task, startUrl: "http://localhost:5174/deliveries" };
  const elsewhere = { ...task, startUrl: "https://shop.example/" };
  const otherPort = { ...task, startUrl: "http://localhost:8080/" };
  const started = [onApp, elsewhere, otherPort].flatMap((each) => runner.start(each, [ada], [7]));
  for (const { id } of started) await drain(runner.live(id));

  const byUrl = new Map(run.calls.map((call) => [call.task.startUrl, call]));
  expect(byUrl.get(onApp.startUrl)).toMatchObject({ params: TARGET_APP_DEFAULTS });
  expect(byUrl.get(onApp.startUrl)?.jargon).toBe(targetAppJargon);
  for (const off of [elsewhere, otherPort]) {
    const call = byUrl.get(off.startUrl);
    expect(call).toBeDefined();
    // Left out, not set to undefined, which `exactOptionalPropertyTypes` would refuse.
    expect(call).not.toHaveProperty("params");
    expect(call).not.toHaveProperty("jargon");
  }
});

test("start refuses Jev off the target app, named or by default, and calls or stores no run", async () => {
  const off = { ...task, startUrl: "https://shop.example/" };
  const refused = expect.objectContaining({ code: "jev_off_target_app" });
  const run = fakeRun();
  expect(() => runnerOn(run).start(off, [ada, vera], [1, 2], { backend: "jev" })).toThrow(refused);
  expect(() => runnerOn(run, { defaultBackend: "jev" }).start(off, [ada], [1])).toThrow(refused);

  await sleep(30);
  expect(run.calls).toHaveLength(0);
  expect(await listRuns(store.db)).toStrictEqual([]);
});

test("a target-app origin that is no URL fails when the runner is built, not on the first run", () => {
  expect(() => runnerOn(fakeRun(), { targetAppOrigin: "not a url" })).toThrow();
});

test("a set started with a sweep hands it to every run and each stored run carries it; a set without one hands none", async () => {
  const run = fakeRun();
  const runner = runnerOn(run);
  // Vera's own contrast threshold, so the stamp names the value her profile applies.
  const sweep = { sweepId: "swp_vera-contrast", axis: "contrast", value: 3 } as const;
  const swept = runner.start(task, [vera], [1, 2], { sweep });
  const plain = runner.start(task, [vera], [3]);

  for (const { id } of [...swept, ...plain]) await drain(runner.live(id));
  const callOf = (id: string) => run.calls.find(({ runId }) => runId === id);
  for (const { id } of swept) {
    expect(callOf(id)?.sweep).toStrictEqual(sweep);
    expect((await loadRun(store.db, id))?.sweep).toStrictEqual(sweep);
  }
  for (const { id } of plain) {
    // The key is left out, not set to undefined.
    expect(callOf(id)).not.toHaveProperty("sweep");
    expect(await loadRun(store.db, id)).not.toHaveProperty("sweep");
  }
});

test("five runs at once; the rest start in queue order across two start calls, as slots free", async () => {
  expect(MAX_CONCURRENT_RUNS).toBe(5);
  const { hold, open } = gates();
  // Vera on seed 1 crashes once her gate opens: a slot is freed by a rejection too.
  const run = fakeRun((options) => ({
    gate: hold(options.runId),
    ...(options.profile.id === "prof_vera" && options.seed === 1
      ? { throws: "afterStart" as const }
      : {}),
  }));
  const runner = runnerOn(run);
  // Two requests at once: 4 runs, then 3.
  const queued: StartedRun[] = [
    ...runner.start(task, [ada, vera], [1, 2]),
    ...runner.start(task, [ada, vera, zoya], [3]),
  ];
  const ids = queued.map(({ id }) => id);
  const called = () => run.calls.map(({ runId }) => runId);

  await vi.waitFor(() => expect(called()).toStrictEqual(ids.slice(0, 5)));
  // And no more while all five hold their slots.
  await sleep(30);
  expect(called()).toStrictEqual(ids.slice(0, 5));

  open(ids[1] as string);
  await vi.waitFor(() => expect(called()).toStrictEqual(ids.slice(0, 6)));
  // One freed slot starts one run.
  await sleep(30);
  expect(called()).toStrictEqual(ids.slice(0, 6));

  open(ids[0] as string);
  await vi.waitFor(() => expect(called()).toStrictEqual(ids));

  // Five still hold their slots, and the two freed ones went to the queue, so a later start waits.
  const [late] = runner.start(task, [ada], [10]);
  if (late === undefined) throw new Error("start queued no run");
  await sleep(30);
  expect(called()).toStrictEqual(ids);

  for (const id of ids.slice(2)) open(id);
  await vi.waitFor(() => expect(called()).toStrictEqual([...ids, late.id]));
  open(late.id);
  for (const id of [...ids, late.id]) {
    const events = await drain(runner.live(id));
    // No event reaches another run's stream.
    expect(events.every((event) => event.runId === id)).toBe(true);
    expect(await loadRun(store.db, id)).toStrictEqual(runResultFromEvents(events));
  }
  const outcomes = (await listRuns(store.db)).map(({ id, outcome }) => [id, outcome]);
  expect(outcomes.sort()).toStrictEqual(
    [...ids, late.id].map((id, i) => [id, i === 1 ? "error" : "success"]).sort(),
  );
});

test("a finished run is stored as the fold of its published events before its stream sees the end", async () => {
  const runner = runnerOn(fakeRun(() => ({ step: true })));
  const { id, live } = startOne(runner, vera, 1);

  while (!live.ended) {
    await live.changed();
    // The terminal event is published with the end, and only once the run is stored. The row is
    // read synchronously, so it is the database as it stands when the event is first seen.
    const last = live.events.at(-1);
    const terminal = last?.type === "runFinished" || last?.type === "runFailed";
    expect(live.ended).toBe(terminal);
    if (terminal) expect(storedNow(id)).toBe(true);
  }

  const { events } = live;
  expect(events.map(({ type }) => type)).toStrictEqual([
    "runStarted",
    "stepObserved",
    "actionPlanned",
    "actionPerformed",
    "runFinished",
  ]);
  const stored = await loadRun(store.db, id);
  expect(stored).toStrictEqual(runResultFromEvents(events));
  expect(stored).toMatchObject({ id, profileId: "prof_vera", seed: 1, outcome: "success" });
});

test("what is stored is the runner's own fold of the published events, not what run returns", async () => {
  const fake = fakeRun();
  const run: RunFn = async (options) => ({ ...(await fake(options)), outcome: "gave_up" });
  const { id, live } = startOne(runnerOn(run), ada, 2);

  const events = await drain(live);
  const stored = await loadRun(store.db, id);
  expect(stored).toStrictEqual(runResultFromEvents(events));
  expect(stored?.outcome).toBe("success");
});

test("a run that throws after runStarted ends in the runner's own runFailed and is stored as error", async () => {
  const runner = runnerOn(fakeRun(() => ({ step: true, throws: "afterStart" })));
  const { id, live } = startOne(runner, zoya, 3);

  const events = await drain(live);
  expect(events.map(({ type }) => type)).toStrictEqual([
    "runStarted",
    "stepObserved",
    "actionPlanned",
    "actionPerformed",
    "runFailed",
  ]);
  const failed = events.at(-1);
  expect(failed).toMatchObject({
    type: "runFailed",
    runId: id,
    stepIndex: 0,
    error: "fake_crash: the fake run crashed",
    cost: FAKE_STEP_COST,
  });
  // The runner cannot know a recording the run never named.
  expect(failed).not.toHaveProperty("videoPath");
  const stored = await loadRun(store.db, id);
  expect(stored).toStrictEqual(runResultFromEvents(events));
  expect(stored?.outcome).toBe("error");
});

test("a run that returns without a terminal event is ended by the runner and stored as error", async () => {
  const fake = fakeRun(() => ({ step: true }));
  // The fake's own runFinished never reaches the runner.
  const run: RunFn = (options) =>
    fake({
      ...options,
      onEvent: (event) => {
        if (event.type !== "runFinished") options.onEvent?.(event);
      },
    });
  const { id, live } = startOne(runnerOn(run), ada, 4);

  const events = await drain(live);
  expect(events.at(-1)).toMatchObject({
    type: "runFailed",
    error: expect.stringMatching(/^run_not_ended: /),
    cost: FAKE_STEP_COST,
  });
  const stored = await loadRun(store.db, id);
  expect(stored).toStrictEqual(runResultFromEvents(events));
  expect(stored?.outcome).toBe("error");
});

test("a run the database refuses still ends its stream with its terminal event, and the error is logged", async () => {
  const lines: { level: number; runId: string; msg: string }[] = [];
  const write = (line: string) => void lines.push(JSON.parse(line));
  const logger = pino({ level: "error" }, { write });
  const { promise, open } = gate();
  const runner = runnerOn(
    fakeRun(() => ({ gate: promise })),
    { logger },
  );
  const { id, live } = startOne(runner, ada, 5);
  // A row already under the run's id, so the runner's own insert fails.
  const squatter = { ...runResultFixture, id };
  await saveRun(store.db, squatter, "2026-09-22T10:00:00.000Z");
  open();

  const events = await drain(live);
  expect(events.at(-1)?.type).toBe("runFinished");
  expect(await loadRun(store.db, id)).toStrictEqual(squatter);
  expect(lines).toMatchObject([{ level: 50, runId: id, msg: "the run could not be stored" }]);
});
