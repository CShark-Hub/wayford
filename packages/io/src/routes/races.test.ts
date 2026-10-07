/**
 * `GET /races` and `GET /races/:id` serve the run sets `POST /runs` started, each with the status
 * this process's runner gives it (issue #194). How a race is stored is `db/races.test.ts`'s, and
 * what `POST /runs` answers is `routes/runs.test.ts`'s. A test reads every run it starts to its end
 * before its store is closed, since a run writes into the store's folder.
 */
import { setTimeout as sleep } from "node:timers/promises";
import { type Race, RaceId, type StartedRun } from "@wayford/core";
import { taskFixture } from "@wayford/core/fixtures";
import { describe, expect, onTestFinished, test, vi } from "vitest";
import { saveRace } from "../db/races.js";
import { saveTask } from "../db/tasks.js";
import { MAX_CONCURRENT_RUNS } from "../runner.js";
import {
  type FakeRun,
  fakeRun,
  gate,
  getJson,
  postJson,
  readEvents,
  type TestApp,
  testApp,
} from "../test-app.js";

const task = taskFixture("task_next-parcel");

/** A test app on `run`, with the easy goal stored, closed after the test. */
async function appOn(run: FakeRun = fakeRun()): Promise<TestApp> {
  const t = await testApp({ run });
  onTestFinished(() => t.close());
  await saveTask(t.db, task);
  return t;
}

type App = TestApp["app"];

/** `POST /runs` on the easy goal that must start its runs: the race's id and its runs. */
async function startRace(
  app: App,
  profileIds: string[],
  seeds: number[] = [1],
): Promise<{ raceId: string; runs: StartedRun[] }> {
  const { status, body } = await postJson(app, "/runs", { taskId: task.id, profileIds, seeds });
  expect(status).toBe(202);
  return body;
}

/** Reads the run's stream to its end, which comes once the run has ended and its save was tried. */
async function untilEnded(app: App, id: string): Promise<void> {
  await readEvents(await app.request(`/runs/${id}/events`));
}

/** The one run in `runs` of this persona. */
function runOf(runs: readonly StartedRun[], profileId: string): StartedRun {
  const run = runs.find((started) => started.profileId === profileId);
  if (run === undefined) throw new Error(`no run of ${profileId}`);
  return run;
}

describe("GET /races and GET /races/:id", () => {
  test("a POST /runs is a race: running while one of its runs is in flight, finished once every run has ended", async () => {
    const { promise, open } = gate();
    // Vera's run is held at its gate; Ada's runs to its end.
    const { app } = await appOn(
      fakeRun(({ profile }) => (profile.id === "prof_vera" ? { gate: promise } : {})),
    );
    const before = Date.now();
    const { raceId, runs } = await startRace(app, ["prof_ada", "prof_vera"]);
    const after = Date.now();
    expect(RaceId.safeParse(raceId).success).toBe(true);
    await untilEnded(app, runOf(runs, "prof_ada").id);

    const running = await getJson(app, `/races/${raceId}`);
    expect(running).toStrictEqual({
      status: 200,
      body: { id: raceId, task, startedAt: expect.any(String), runs, status: "running" },
    });
    // Stamped when the POST was answered.
    const startedAt = Date.parse(running.body.startedAt);
    expect(startedAt).toBeGreaterThanOrEqual(before);
    expect(startedAt).toBeLessThanOrEqual(after);
    expect(await getJson(app, "/races")).toStrictEqual({ status: 200, body: [running.body] });

    open();
    await untilEnded(app, runOf(runs, "prof_vera").id);

    const finished = { ...running.body, status: "finished" };
    expect(await getJson(app, `/races/${raceId}`)).toStrictEqual({ status: 200, body: finished });
    expect(await getJson(app, "/races")).toStrictEqual({ status: 200, body: [finished] });
    // Finished means stored: every run of the race is under GET /runs/:id.
    for (const { id } of runs) expect((await getJson(app, `/runs/${id}`)).status).toBe(200);
  });

  test("two races run at once: one whose run waits for a slot reads running, as the race ahead of it does", async () => {
    const { promise, open } = gate();
    const run = fakeRun(() => ({ gate: promise }));
    const { app } = await appOn(run);
    const first = await startRace(app, [
      "prof_ada",
      "prof_kai",
      "prof_milo",
      "prof_vera",
      "prof_zoya",
    ]);
    // Apart in time, so the order is the start times' and not the id tiebreak's.
    await sleep(5);
    // Ada again, on another seed. The five runs ahead hold every slot, so hers has not started.
    const second = await startRace(app, ["prof_ada"], [2]);
    await vi.waitFor(() => expect(run.calls).toHaveLength(MAX_CONCURRENT_RUNS));
    await sleep(30);
    expect(run.calls.map(({ runId }) => runId)).not.toContain(second.runs[0]?.id);

    const statuses = async () =>
      (await getJson(app, "/races")).body.map(({ id, status }: { id: string; status: string }) => [
        id,
        status,
      ]);
    expect(await statuses()).toStrictEqual([
      [second.raceId, "running"],
      [first.raceId, "running"],
    ]);

    open();
    for (const { id } of [...first.runs, ...second.runs]) await untilEnded(app, id);
    expect(await statuses()).toStrictEqual([
      [second.raceId, "finished"],
      [first.raceId, "finished"],
    ]);
  });

  test("two POSTs are two races, newest first", async () => {
    const { app } = await appOn();
    const first = await startRace(app, ["prof_ada"]);
    // Apart in time, so the order is the start times' and not the id tiebreak's.
    await sleep(5);
    const second = await startRace(app, ["prof_vera", "prof_zoya"], [2, 3]);
    for (const { id } of [...first.runs, ...second.runs]) await untilEnded(app, id);

    const { status, body } = await getJson(app, "/races");
    expect(status).toBe(200);
    expect(
      body.map(({ id, runs, status }: Race & { status: string }) => [id, runs, status]),
    ).toStrictEqual([
      [second.raceId, second.runs, "finished"],
      [first.raceId, first.runs, "finished"],
    ]);
  });

  test("with nothing stored, an empty list", async () => {
    const { app } = await appOn();
    expect(await getJson(app, "/races")).toStrictEqual({ status: 200, body: [] });
  });

  test("a race stored by an earlier process reads finished: this runner never saw its runs", async () => {
    const { app, db } = await appOn();
    // Its runs were in flight when that process stopped, so they were never stored either.
    const earlier: Race = {
      id: "race_earlier",
      task,
      startedAt: "2026-10-07T09:00:00.000Z",
      runs: [{ id: "run_vera-easy-1", profileId: "prof_vera", seed: 1 }],
    };
    await saveRace(db, earlier);

    const finished = { ...earlier, status: "finished" };
    expect(await getJson(app, `/races/${earlier.id}`)).toStrictEqual({
      status: 200,
      body: finished,
    });
    expect(await getJson(app, "/races")).toStrictEqual({ status: 200, body: [finished] });
    expect((await getJson(app, "/runs/run_vera-easy-1")).status).toBe(404);
  });

  test("an id no stored race has, or one that is no race id, is a 404", async () => {
    const { app } = await appOn();
    // A stored race, so a lookup that ignored the id would find one.
    const { raceId, runs } = await startRace(app, ["prof_ada"]);
    for (const { id } of runs) await untilEnded(app, id);
    expect((await getJson(app, `/races/${raceId}`)).status).toBe(200);

    for (const id of ["race_missing", runOf(runs, "prof_ada").id]) {
      expect(await getJson(app, `/races/${id}`)).toStrictEqual({
        status: 404,
        body: { error: `no race ${id}` },
      });
    }
  });
});
