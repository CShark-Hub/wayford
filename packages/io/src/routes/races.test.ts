/**
 * `GET /races` and `GET /races/:id` serve the run sets `POST /runs` started, each with the status
 * and the runs waiting for a slot this process's runner gives it (issues #194 and #6), and
 * `POST /races/:id/cancel` stops one: it drops the race's runs still waiting for a slot and records
 * them in the race (#6, `docs/specs/2026-11-08-6-stop-race.md`). How a race is stored is
 * `db/races.test.ts`'s, what `POST /runs` answers is `routes/runs.test.ts`'s, and how the runner
 * drops a run is `runner.test.ts`'s. A test reads every run it starts to its end before its store
 * is closed, since a run writes into the store's folder.
 */
import { setTimeout as sleep } from "node:timers/promises";
import { type Race, RaceId, type RunEvent, type StartedRun } from "@wayford/core";
import { taskFixture } from "@wayford/core/fixtures";
import pino from "pino";
import { describe, expect, onTestFinished, test, vi } from "vitest";
import { loadRace, saveRace } from "../db/races.js";
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
  type TestAppOptions,
  testApp,
} from "../test-app.js";

const task = taskFixture("task_next-parcel");

/** The five bundled personas: a race of them on one seed takes every slot. */
const FIVE = ["prof_ada", "prof_kai", "prof_milo", "prof_vera", "prof_zoya"];

/**
 * A race an earlier process stored. Its runs were in flight when that process stopped, so they were
 * never stored either.
 */
const earlier: Race = {
  id: "race_earlier",
  task,
  startedAt: "2026-10-07T09:00:00.000Z",
  runs: [{ id: "run_vera-easy-1", profileId: "prof_vera", seed: 1 }],
};

/** A test app on `run` and `options`, with the easy goal stored, closed after the test. */
async function appOn(run: FakeRun = fakeRun(), options: TestAppOptions = {}): Promise<TestApp> {
  const t = await testApp({ ...options, run });
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

/**
 * Reads the run's stream to its end, which comes once the run has ended and its save was tried, or
 * at once for a run a stop dropped: the events it sent.
 */
async function untilEnded(app: App, id: string): Promise<RunEvent[]> {
  return (await readEvents(await app.request(`/runs/${id}/events`))).events;
}

/** `POST /races/:id/cancel` with the body `{}`, as the web sends it: the status and the answer. */
function stop(app: App, raceId: string) {
  return postJson(app, `/races/${raceId}/cancel`, {});
}

/** A logger that keeps every line from info up, parsed, in order. */
function logged() {
  const lines: Record<string, unknown>[] = [];
  const write = (line: string) => void lines.push(JSON.parse(line));
  return { lines, logger: pino({ level: "info" }, { write }) };
}

/** The one run in `runs` of this persona. */
function runOf(runs: readonly StartedRun[], profileId: string): StartedRun {
  const run = runs.find((started) => started.profileId === profileId);
  if (run === undefined) throw new Error(`no run of ${profileId}`);
  return run;
}

/** The ids of `runs`, in their order. */
const idsOf = (runs: readonly StartedRun[]) => runs.map(({ id }) => id);

/** The one event of a run a stop dropped: `runFinished` `cancelled` at step 0, with no time or cost. */
const droppedEnd = (runId: string) => ({
  type: "runFinished",
  runId,
  stepIndex: 0,
  timestamp: expect.any(String),
  outcome: "cancelled",
  durationMs: 0,
  cost: { tokensIn: 0, tokensOut: 0, usd: 0 },
});

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
    // Vera's run holds a slot, so nothing waits.
    expect(running).toStrictEqual({
      status: 200,
      body: {
        id: raceId,
        task,
        startedAt: expect.any(String),
        runs,
        status: "running",
        waiting: [],
      },
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
    const first = await startRace(app, FIVE);
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

  test("both list a race's runs still waiting for a slot as waiting, in the race's order, and none once it has finished", async () => {
    const { promise, open } = gate();
    const run = fakeRun(() => ({ gate: promise }));
    const { app } = await appOn(run);
    // Four runs hold four slots until the gate opens. The second race's first run takes the fifth,
    // so it is under way, and its three others wait behind it.
    const first = await startRace(app, ["prof_ada", "prof_kai", "prof_milo", "prof_vera"]);
    // Apart in time, so the order is the start times' and not the id tiebreak's.
    await sleep(5);
    const second = await startRace(app, ["prof_zoya", "prof_ada"], [2, 3]);
    const queued = idsOf(second.runs).slice(1);
    const listed = async () => ({
      all: (await getJson(app, "/races")).body.map(
        ({ id, waiting }: { id: string; waiting: string[] }) => [id, waiting],
      ),
      one: (await getJson(app, `/races/${second.raceId}`)).body.waiting,
    });

    expect(await listed()).toStrictEqual({
      all: [
        [second.raceId, queued],
        [first.raceId, []],
      ],
      one: queued,
    });

    open();
    for (const id of [...idsOf(first.runs), ...idsOf(second.runs)]) await untilEnded(app, id);
    expect(await listed()).toStrictEqual({
      all: [
        [second.raceId, []],
        [first.raceId, []],
      ],
      one: [],
    });
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
    await saveRace(db, earlier);

    // Nor does it queue them, so none waits.
    const finished = { ...earlier, status: "finished", waiting: [] };
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

describe("POST /races/:id/cancel", () => {
  test("a stop drops every waiting run and the race finishes", async () => {
    const { lines, logger } = logged();
    const { promise, open } = gate();
    const run = fakeRun(() => ({ gate: promise }));
    const { app, db } = await appOn(run, { logger });
    // Five runs hold every slot until the gate opens, so all four runs of the second race wait.
    const first = await startRace(app, FIVE);
    const second = await startRace(app, ["prof_vera", "prof_ada"], [2, 3]);
    const queued = idsOf(second.runs);
    expect((await getJson(app, `/races/${second.raceId}`)).body).toMatchObject({
      status: "running",
      waiting: queued,
    });

    const before = Date.now();
    expect(await stop(app, second.raceId)).toStrictEqual({
      status: 202,
      body: { stopped: 0, dequeued: 4 },
    });
    const after = Date.now();

    // Finished at once, with every run dropped, and the stop recorded in the race, in queue order.
    const stopped = await getJson(app, `/races/${second.raceId}`);
    expect(stopped).toStrictEqual({
      status: 200,
      body: {
        id: second.raceId,
        task,
        startedAt: expect.any(String),
        runs: second.runs,
        cancelled: { at: expect.any(String), dequeued: queued },
        status: "finished",
        waiting: [],
      },
    });
    // Stamped when the stop was confirmed.
    const at = Date.parse(stopped.body.cancelled.at);
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(after);
    expect(await loadRace(db, second.raceId)).toStrictEqual({
      id: second.raceId,
      task,
      startedAt: stopped.body.startedAt,
      runs: second.runs,
      cancelled: stopped.body.cancelled,
    });
    // A dropped run's stream is its one terminal event, and the run is stored nowhere.
    for (const id of queued) {
      expect(await untilEnded(app, id)).toStrictEqual([droppedEnd(id)]);
      expect((await getJson(app, `/runs/${id}`)).status).toBe(404);
    }
    expect(lines).toMatchObject([
      { level: 30, msg: "race stopped", raceId: second.raceId, dequeued: 4 },
    ]);

    open();
    for (const id of idsOf(first.runs)) await untilEnded(app, id);
    // The slots the first race freed went to none of the dropped runs.
    expect(run.calls.map(({ runId }) => runId).sort()).toStrictEqual(idsOf(first.runs).sort());
  });

  test("a second stop drops nothing and keeps the first record", async () => {
    const { lines, logger } = logged();
    const { promise, open } = gate();
    const run = fakeRun(() => ({ gate: promise }));
    const { app, db } = await appOn(run, { logger });
    // Four runs hold four slots until the gate opens. Zoya's run takes the fifth, so it is under way
    // when the stop comes, and the two runs behind it wait.
    const first = await startRace(app, ["prof_ada", "prof_kai", "prof_milo", "prof_vera"]);
    const second = await startRace(app, ["prof_zoya", "prof_ada", "prof_kai"], [2]);
    const [underWay, ...queued] = idsOf(second.runs);

    expect(await stop(app, second.raceId)).toStrictEqual({
      status: 202,
      body: { stopped: 0, dequeued: 2 },
    });
    const record = await loadRace(db, second.raceId);
    expect(record?.cancelled).toStrictEqual({ at: expect.any(String), dequeued: queued });

    // Zoya's run is still under way: the race runs on with nothing waiting, and a stop drops nothing.
    expect((await getJson(app, `/races/${second.raceId}`)).body).toMatchObject({
      status: "running",
      waiting: [],
    });
    expect(await stop(app, second.raceId)).toStrictEqual({
      status: 202,
      body: { stopped: 0, dequeued: 0 },
    });
    expect(await loadRace(db, second.raceId)).toStrictEqual(record);

    open();
    for (const id of [...idsOf(first.runs), ...idsOf(second.runs)]) await untilEnded(app, id);
    // Finished now, so a stop is a 200 that changes nothing either.
    expect(await stop(app, second.raceId)).toStrictEqual({
      status: 200,
      body: { stopped: 0, dequeued: 0 },
    });
    expect(await loadRace(db, second.raceId)).toStrictEqual(record);
    // Zoya's run finished as any run does, and is stored; the dropped runs never are.
    expect((await getJson(app, `/runs/${underWay}`)).status).toBe(200);
    for (const id of queued) expect((await getJson(app, `/runs/${id}`)).status).toBe(404);
    // Only the stop that dropped runs says so.
    expect(lines).toMatchObject([
      { level: 30, msg: "race stopped", raceId: second.raceId, dequeued: 2 },
    ]);
  });

  test("a stop on a finished race answers 200 with zero counts", async () => {
    const { app, db } = await appOn();
    // One race io ran to its end, and one an earlier process stored, whose runs this runner never saw.
    const { raceId, runs } = await startRace(app, ["prof_ada"]);
    for (const { id } of runs) await untilEnded(app, id);
    await saveRace(db, earlier);

    for (const id of [raceId, earlier.id]) {
      const before = await loadRace(db, id);
      expect(await stop(app, id), id).toStrictEqual({
        status: 200,
        body: { stopped: 0, dequeued: 0 },
      });
      // Nothing written: the race holds no stop.
      expect(await loadRace(db, id), id).toStrictEqual(before);
      expect(before?.cancelled, id).toBeUndefined();
    }
  });

  test("an unknown race is a 404", async () => {
    const { app } = await appOn();
    // A stored race, so a stop that ignored the id would find one.
    const { raceId, runs } = await startRace(app, ["prof_ada"]);
    for (const { id } of runs) await untilEnded(app, id);
    expect((await stop(app, raceId)).status).toBe(200);

    // An id no stored race has, and one that is no race id, as GET /races/:id answers them.
    for (const id of ["race_missing", runOf(runs, "prof_ada").id]) {
      expect(await stop(app, id)).toStrictEqual({ status: 404, body: { error: `no race ${id}` } });
    }
  });

  test("a stop sent without JSON is a 415, and one whose body is not {} a 400: neither drops a run", async () => {
    const { promise, open } = gate();
    const run = fakeRun(() => ({ gate: promise }));
    const { app, db } = await appOn(run);
    // Five runs hold every slot until the gate opens, so the second race's run waits.
    const first = await startRace(app, FIVE);
    const second = await startRace(app, ["prof_ada"], [2]);
    const queued = idsOf(second.runs);
    const path = `/races/${second.raceId}/cancel`;
    const post = (type: string | undefined, body: string) =>
      app.request(path, {
        method: "POST",
        headers: type === undefined ? {} : { "content-type": type },
        body,
      });

    // `{}` under a type a page can send without a CORS preflight, or under none.
    for (const type of ["text/plain", undefined]) {
      const res = await post(type, "{}");
      expect(res.status, String(type)).toBe(415);
      expect(await res.json()).toStrictEqual({
        error: expect.stringContaining("application/json"),
      });
    }
    // JSON that does not parse, then JSON that is not `{}`: a key a stop does not take, a list, null.
    const malformed = await post("application/json", "{");
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toStrictEqual({
      error: expect.stringMatching(/malformed JSON/i),
    });
    for (const body of [{ dequeued: 1 }, [], null]) {
      expect(await postJson(app, path, body), JSON.stringify(body)).toStrictEqual({
        status: 400,
        body: { error: expect.any(String) },
      });
    }

    // The run still waits, and the race holds no stop.
    expect((await getJson(app, `/races/${second.raceId}`)).body).toMatchObject({
      status: "running",
      waiting: queued,
    });
    expect((await loadRace(db, second.raceId))?.cancelled).toBeUndefined();
    open();
    for (const id of [...idsOf(first.runs), ...queued]) await untilEnded(app, id);
    // It ran once a slot freed, as any queued run does, and was stored.
    for (const id of queued) expect((await getJson(app, `/runs/${id}`)).status).toBe(200);
  });

  test("a record that fails to write answers 500 saying the runs were stopped", async () => {
    const { lines, logger } = logged();
    const { promise, open } = gate();
    const run = fakeRun(() => ({ gate: promise }));
    const { app, db } = await appOn(run, { logger });
    // Five runs hold every slot until the gate opens, so both runs of the second race wait.
    const first = await startRace(app, FIVE);
    const second = await startRace(app, ["prof_ada", "prof_vera"], [2]);
    const queued = idsOf(second.runs);
    // The race is stored. From here on the store refuses to change any race, as a full disk would,
    // and still stores runs.
    db.$client.exec(
      "CREATE TRIGGER races_frozen BEFORE UPDATE ON races " +
        "BEGIN SELECT RAISE(ABORT, 'races are frozen in this test'); END",
    );

    expect(await stop(app, second.raceId)).toStrictEqual({
      status: 500,
      body: { error: "2 runs waiting for a slot were stopped, but the stop could not be recorded" },
    });
    // The runs were dropped all the same: each stream ended cancelled, so the race has finished,
    // and it holds no stop.
    for (const id of queued) expect(await untilEnded(app, id)).toStrictEqual([droppedEnd(id)]);
    expect((await getJson(app, `/races/${second.raceId}`)).body).toMatchObject({
      status: "finished",
      waiting: [],
    });
    expect((await loadRace(db, second.raceId))?.cancelled).toBeUndefined();
    // Logged at error with its cause, and never as a race stopped.
    expect(lines).toMatchObject([
      {
        level: 50,
        msg: "the stop dropped runs but could not be recorded",
        raceId: second.raceId,
        dequeued: 2,
        err: { message: expect.stringContaining("races are frozen in this test") },
      },
    ]);

    open();
    for (const id of idsOf(first.runs)) await untilEnded(app, id);
  });
});
