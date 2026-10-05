/**
 * The runs routes on the fake run (`docs/specs/2026-10-02-s4-03-runs-api.md`, "Acceptance
 * mapping"): one `describe` per route, each box's test under the name the spec gives it, with the
 * constraint tests beside them. A test reads every run it starts to its end before its store is
 * closed, since a run writes into the store's folder.
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseLlmSettings } from "@wayford/agent";
import { RunId, RunResult, runResultFromEvents } from "@wayford/core";
import { runResultFixture, taskFixture } from "@wayford/core/fixtures";
import { afterEach, beforeEach, describe, expect, onTestFinished, test, vi } from "vitest";
import { actorBackends } from "../actor-backends.js";
import { saveRun } from "../db/runs.js";
import { saveTask } from "../db/tasks.js";
import { MAX_CONCURRENT_RUNS, type StartedRun } from "../runner.js";
import {
  type FakeRun,
  type FakeScript,
  fakeRun,
  gate,
  getJson,
  postJson,
  readEvents,
  readSse,
  type TestApp,
  type TestAppOptions,
  testApp,
} from "../test-app.js";

const task = taskFixture("task_next-parcel");
const otherTask = taskFixture("task_past-order");
// The fixture run's `runStarted` timestamp, which `saveRun` takes beside the record.
const fixtureStartedAt = "2026-09-22T10:00:00.000Z";

/** A test app on `run` and `options`, with the easy goal stored, closed after the test. */
async function appOn(run: FakeRun = fakeRun(), options: TestAppOptions = {}): Promise<TestApp> {
  const t = await testApp({ ...options, run });
  onTestFinished(() => t.close());
  await saveTask(t.db, task);
  return t;
}

type App = TestApp["app"];

/**
 * `POST /runs` that must start its runs, on the easy goal unless `extra` names another task, with
 * `extra`'s other fields in the body too: its runs.
 */
async function startRuns(
  app: App,
  profileIds: string[],
  seeds: number[],
  extra: Record<string, unknown> = {},
): Promise<StartedRun[]> {
  const request = { taskId: task.id, profileIds, seeds, ...extra };
  const { status, body } = await postJson(app, "/runs", request);
  expect(status).toBe(202);
  return body.runs;
}

/** One persona on one seed: the run's id. */
async function startOne(app: App, profileId: string, seed: number): Promise<string> {
  const [run, ...more] = await startRuns(app, [profileId], [seed]);
  if (run === undefined || more.length > 0) throw new Error("expected exactly one run");
  return run.id;
}

/** `GET /runs/:id/events`, resumed after `lastEventId` when one is given. */
function eventsOf(app: App, id: string, lastEventId?: string) {
  const headers: Record<string, string> =
    lastEventId === undefined ? {} : { "Last-Event-ID": lastEventId };
  return app.request(`/runs/${id}/events`, { headers });
}

/** A run's stream, read to its end. */
async function streamOf(app: App, id: string, lastEventId?: string) {
  const res = await eventsOf(app, id, lastEventId);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toMatch(/^text\/event-stream/);
  return readEvents(res);
}

/**
 * Reads the run's stream to its end and checks what two boxes rest on: the stream carries only
 * this run and ends with its terminal event, and the stored run deep-equals the fold of what the
 * stream sent.
 */
async function streamedAndStored(app: App, id: string) {
  const { events } = await streamOf(app, id);
  expect(events.every((event) => event.runId === id)).toBe(true);
  expect(["runFinished", "runFailed"]).toContain(events.at(-1)?.type);
  const { status, body } = await getJson(app, `/runs/${id}`);
  expect(status).toBe(200);
  expect(body).toStrictEqual(runResultFromEvents(events));
  return { events, stored: body as RunResult };
}

/** Ids, sorted, so two lists of runs compare whatever order they came in. */
function idsOf(runs: readonly { id: string }[]): string[] {
  return runs.map(({ id }) => id).sort();
}

/** The id of the run on `seed`. */
function idOn(runs: readonly StartedRun[], seed: number): string {
  const run = runs.find((started) => started.seed === seed);
  if (run === undefined) throw new Error(`no run on seed ${seed}`);
  return run.id;
}

/** A 200 download of the fake's file `name`, whose bytes are its own name. */
async function expectDownload(res: Response, type: string, name: string) {
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe(type);
  expect(res.headers.get("content-disposition")).toBe(
    `attachment; filename="${name}"; filename*=UTF-8''${name}`,
  );
  expect(await res.text()).toBe(name);
}

/** A 404 with the `{ error }` body every refusal of these routes has. */
async function expectNotFound(res: Response, why: string) {
  expect(res.status, why).toBe(404);
  expect(await res.json(), why).toStrictEqual({ error: expect.any(String) });
}

describe("POST /runs", () => {
  test("a run set of 2 personas × 2 seeds streams four runs and stores them", async () => {
    const { app } = await appOn(fakeRun(() => ({ step: true })));

    const { status, body } = await postJson(app, "/runs", {
      taskId: task.id,
      profileIds: ["prof_ada", "prof_vera"],
      seeds: [1, 2],
    });

    expect(status).toBe(202);
    // Seed-major: every persona on the first seed, then the second.
    expect(body).toStrictEqual({
      runs: [
        { id: expect.any(String), profileId: "prof_ada", seed: 1 },
        { id: expect.any(String), profileId: "prof_vera", seed: 1 },
        { id: expect.any(String), profileId: "prof_ada", seed: 2 },
        { id: expect.any(String), profileId: "prof_vera", seed: 2 },
      ],
    });
    const runs: StartedRun[] = body.runs;
    for (const { id } of runs) expect(RunId.safeParse(id).success).toBe(true);
    expect(new Set(idsOf(runs)).size).toBe(4);

    for (const { id, profileId, seed } of runs) {
      const { stored } = await streamedAndStored(app, id);
      expect(stored).toMatchObject({ id, taskId: task.id, profileId, seed });
    }
    const listed = await getJson(app, "/runs");
    expect(listed.status).toBe(200);
    expect(idsOf(listed.body)).toStrictEqual(idsOf(runs));
  });

  test("a repeated seed is a 400 and starts no run", async () => {
    const run = fakeRun();
    const { app } = await appOn(run);

    const { status, body } = await postJson(app, "/runs", {
      taskId: task.id,
      profileIds: ["prof_ada"],
      seeds: [1, 1],
    });

    expect(status).toBe(400);
    expect(body.error).toContain("seeds");
    expect(run.calls).toStrictEqual([]);
    expect((await getJson(app, "/runs")).body).toStrictEqual([]);
  });

  test("a repeated profile id, an empty list, 11 seeds, a key it does not know or a backend that is not llm or jev is a 400 and starts no run", async () => {
    const run = fakeRun();
    const { app } = await appOn(run);
    const seeds = Array.from({ length: 11 }, (_, i) => i + 1);
    const refused: unknown[] = [
      { taskId: task.id, profileIds: ["prof_ada", "prof_ada"], seeds: [1] },
      { taskId: task.id, profileIds: [], seeds: [1] },
      { taskId: task.id, profileIds: ["prof_ada"], seeds: [] },
      { taskId: task.id, profileIds: ["prof_ada"], seeds },
      { taskId: task.id, profileIds: ["prof_ada"], seeds: [1], maxSteps: 5 },
      // s2-12: only a backend's exact name counts.
      ...["other", "LLM", "", null, 1].map((backend) => ({
        taskId: task.id,
        profileIds: ["prof_ada"],
        seeds: [1],
        backend,
      })),
    ];

    for (const request of refused) {
      const { status, body } = await postJson(app, "/runs", request);
      expect(status, JSON.stringify(request)).toBe(400);
      expect(typeof body.error).toBe("string");
    }
    expect(run.calls).toStrictEqual([]);
    expect((await getJson(app, "/runs")).body).toStrictEqual([]);
  });

  test("a body that is not JSON, or not sent as JSON, is refused and starts no run", async () => {
    const run = fakeRun();
    const { app } = await appOn(run);
    const post = (type: string | undefined, body: string) =>
      app.request("/runs", {
        method: "POST",
        headers: type === undefined ? {} : { "content-type": type },
        body,
      });

    // Hono's validator refuses it before the route sees it; the app answers in the routes' shape.
    const malformed = await post("application/json", '{"taskId":');
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toStrictEqual({
      error: expect.stringMatching(/malformed JSON/i),
    });
    // A valid body under a type a page can send without a CORS preflight, or under none.
    const valid = JSON.stringify({ taskId: task.id, profileIds: ["prof_ada"], seeds: [1] });
    for (const type of ["text/plain", "application/x-www-form-urlencoded", undefined]) {
      const res = await post(type, valid);
      expect(res.status, String(type)).toBe(415);
      expect(await res.json()).toStrictEqual({
        error: expect.stringContaining("application/json"),
      });
    }
    expect(run.calls).toStrictEqual([]);
    expect((await getJson(app, "/runs")).body).toStrictEqual([]);

    // The same body as JSON, with a charset, starts its run: only the type was refused.
    const accepted = await post("application/json; charset=utf-8", valid);
    expect(accepted.status).toBe(202);
    const { runs }: { runs: StartedRun[] } = await accepted.json();
    for (const { id } of runs) await streamOf(app, id);
  });

  describe("on a named backend (s2-12)", () => {
    // The fake run builds the real backends but never asks them a turn, so nothing may reach the
    // network.
    beforeEach(() => {
      vi.stubGlobal("fetch", () => {
        throw new Error("a test reached the network");
      });
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    /** An app on the backends and default `server.ts` builds from these settings. */
    async function appOnEnv(env: Record<string, string> = {}) {
      const settings = parseLlmSettings({ LLM_API_KEY: "test-key", ...env });
      const t = await appOn(fakeRun(), actorBackends(settings));
      return { ...t, settings };
    }

    /** Ada and Vera on seeds 1 and 2, with `extra` in the body: each stored run's Actor model. */
    async function actorsOf(app: App, extra: Record<string, unknown>): Promise<string[]> {
      const actors: string[] = [];
      for (const { id } of await startRuns(app, ["prof_ada", "prof_vera"], [1, 2], extra)) {
        actors.push((await streamedAndStored(app, id)).stored.modelIds.actor);
      }
      return actors;
    }

    // Each name is posted opposite the default, so the request is seen to win over it.
    test('backend "jev" runs every run on the Jev model, and "llm" on the LLM\'s, whatever the default', async () => {
      const onLlm = await appOnEnv();
      expect(onLlm.settings.jevModel).not.toBe(onLlm.settings.roles.actor.model);
      expect(await actorsOf(onLlm.app, { backend: "jev" })).toStrictEqual(
        Array(4).fill(onLlm.settings.jevModel),
      );

      const onJev = await appOnEnv({ LLM_ACTOR_BACKEND: "jev" });
      expect(await actorsOf(onJev.app, { backend: "llm" })).toStrictEqual(
        Array(4).fill(onJev.settings.roles.actor.model),
      );
    });

    test("no backend follows LLM_ACTOR_BACKEND, and llm when it is unset", async () => {
      const onJev = await appOnEnv({ LLM_ACTOR_BACKEND: "jev" });
      expect(await actorsOf(onJev.app, {})).toStrictEqual(Array(4).fill(onJev.settings.jevModel));

      const unset = await appOnEnv();
      expect(await actorsOf(unset.app, {})).toStrictEqual(
        Array(4).fill(unset.settings.roles.actor.model),
      );
    });
  });

  test("ten seeds, the project's seed-set size, are one request", async () => {
    const { app } = await appOn();
    const seeds = Array.from({ length: 10 }, (_, i) => i + 1);

    const runs = await startRuns(app, ["prof_milo"], seeds);

    expect(runs.map(({ seed }) => seed)).toStrictEqual(seeds);
    for (const { id } of runs) await streamOf(app, id);
  });

  test("an unknown task or profile is a 404 naming every unknown id, and starts no run", async () => {
    const run = fakeRun();
    const { app } = await appOn(run);

    const both = await postJson(app, "/runs", {
      taskId: "task_missing",
      profileIds: ["prof_ada", "prof_nobody", "prof_none"],
      seeds: [1],
    });
    expect(both.status).toBe(404);
    for (const id of ["task_missing", "prof_nobody", "prof_none"]) {
      expect(both.body.error).toContain(id);
    }
    expect(both.body.error).not.toContain("prof_ada");

    const profile = await postJson(app, "/runs", {
      taskId: task.id,
      profileIds: ["prof_vera", "prof_nobody"],
      seeds: [1],
    });
    expect(profile.status).toBe(404);
    expect(profile.body).toStrictEqual({ error: expect.stringContaining("prof_nobody") });

    // Tasks come from the database only: a fixture task nobody stored is unknown.
    const unstored = await postJson(app, "/runs", {
      taskId: otherTask.id,
      profileIds: ["prof_vera"],
      seeds: [1],
    });
    expect(unstored.status).toBe(404);
    expect(unstored.body.error).toContain(otherTask.id);

    expect(run.calls).toStrictEqual([]);
    expect((await getJson(app, "/runs")).body).toStrictEqual([]);
  });

  test("a run that throws is stored as error and the others are stored", async () => {
    const { app } = await appOn(
      fakeRun(({ profile, seed }) =>
        profile.id === "prof_vera" && seed === 1
          ? { step: true, throws: "afterStart" }
          : { step: true },
      ),
    );

    const runs = await startRuns(app, ["prof_ada", "prof_vera"], [1, 2]);

    const outcomes: string[] = [];
    for (const { id } of runs) outcomes.push((await streamedAndStored(app, id)).stored.outcome);
    // Seed-major, so Vera on seed 1 is the second run.
    expect(outcomes).toStrictEqual(["success", "error", "success", "success"]);
    expect(idsOf((await getJson(app, "/runs")).body)).toStrictEqual(idsOf(runs));
  });

  test("a run that ends in its own runFailed is stored as error, with its video", async () => {
    const { app } = await appOn(fakeRun(() => ({ end: { failed: "boom" } })));

    const id = await startOne(app, "prof_vera", 1);

    const { events, stored } = await streamedAndStored(app, id);
    expect(events.at(-1)).toMatchObject({ type: "runFailed", error: "boom" });
    expect(stored).toMatchObject({ outcome: "error", videoPath: `vera-seed1-${id}.webm` });
    await expectDownload(
      await app.request(`/runs/${id}/video`),
      "video/webm",
      `vera-seed1-${id}.webm`,
    );
  });

  test("two requests at once share the five slots, and every event reaches only its own run's stream", async () => {
    const { promise, open } = gate();
    const run = fakeRun(() => ({ step: true, gate: promise }));
    const { app } = await appOn(run);

    const [first, second] = await Promise.all([
      startRuns(app, ["prof_ada", "prof_vera"], [1, 2]),
      startRuns(app, ["prof_ada", "prof_vera", "prof_zoya"], [3]),
    ]);

    const called = () => run.calls.map(({ runId }) => runId);
    await vi.waitFor(() => expect(called()).toHaveLength(MAX_CONCURRENT_RUNS));
    // And no more while all five hold their slots.
    await sleep(30);
    // The first five queued: one request's runs, then the other's, whichever came first.
    const ids = (runs: StartedRun[]) => runs.map(({ id }) => id);
    expect([
      [...ids(first), ...ids(second)].slice(0, MAX_CONCURRENT_RUNS),
      [...ids(second), ...ids(first)].slice(0, MAX_CONCURRENT_RUNS),
    ]).toContainEqual(called());

    // Every stream opens before any run goes on: five runs wait on the gate, two for a slot.
    const all = [...first, ...second];
    const streams = await Promise.all(
      all.map(async ({ id }) => ({ id, res: await eventsOf(app, id) })),
    );
    open();
    for (const { id, res } of streams) {
      const { events } = await readEvents(res);
      expect(events.map(({ type }) => type)).toStrictEqual([
        "runStarted",
        "stepObserved",
        "actionPlanned",
        "actionPerformed",
        "runFinished",
      ]);
      expect(events.every((event) => event.runId === id)).toBe(true);
      expect((await getJson(app, `/runs/${id}`)).body).toStrictEqual(runResultFromEvents(events));
    }
    expect(run.calls).toHaveLength(7);
    expect(idsOf((await getJson(app, "/runs")).body)).toStrictEqual(idsOf(all));
  });
});

describe("GET /runs", () => {
  test("the list filters by persona and outcome", async () => {
    // Odd seeds give up and even seeds succeed, so each part of a filter has a run to drop.
    const { app, db } = await appOn(
      fakeRun(({ seed }) => ({ end: { outcome: seed % 2 === 1 ? "gave_up" : "success" } })),
    );
    await saveTask(db, otherTask);
    const easy = await startRuns(app, ["prof_ada", "prof_vera"], [1, 2]);
    const hard = await startRuns(app, ["prof_vera"], [3], { taskId: otherTask.id });
    for (const { id } of [...easy, ...hard]) await streamOf(app, id);
    const on = (profileId: string, seed: number) =>
      idOn(
        [...easy, ...hard].filter((run) => run.profileId === profileId),
        seed,
      );

    const list = async (query: string) => {
      const { status, body } = await getJson(app, `/runs?${query}`);
      expect(status, query).toBe(200);
      expect(RunResult.array().safeParse(body).success).toBe(true);
      return idsOf(body);
    };

    // Ada's give-up drops out on the persona, Vera's success on the outcome.
    expect(await list("profileId=prof_vera&outcome=gave_up")).toStrictEqual(
      [on("prof_vera", 1), on("prof_vera", 3)].sort(),
    );
    expect(await list(`taskId=${task.id}&profileId=prof_vera&outcome=gave_up`)).toStrictEqual([
      on("prof_vera", 1),
    ]);
    expect(await list(`taskId=${otherTask.id}`)).toStrictEqual(idsOf(hard));
    expect(await list("outcome=success")).toStrictEqual(
      [on("prof_ada", 2), on("prof_vera", 2)].sort(),
    );
    expect(await list("")).toStrictEqual(idsOf([...easy, ...hard]));
  });

  test("an unknown key, a value outside its schema or a repeated key is a 400", async () => {
    const { app, db } = await appOn();
    // A stored run, so a filter that was ignored would list it.
    await saveRun(db, runResultFixture, fixtureStartedAt);

    for (const query of ["profile=prof_vera", "outcome=lost", "outcome=gave_up&outcome=success"]) {
      const { status, body } = await getJson(app, `/runs?${query}`);
      expect(status, query).toBe(400);
      expect(typeof body.error).toBe("string");
    }
  });
});

describe("GET /runs/:id", () => {
  test("a run in flight is a 404 until it is stored, then its RunResult", async () => {
    const { promise, open } = gate();
    const { app } = await appOn(fakeRun(() => ({ gate: promise })));
    const id = await startOne(app, "prof_zoya", 1);
    // Its runStarted is out: the run is in flight, held at its gate.
    await readSse(await eventsOf(app, id), 1);

    await expectNotFound(await app.request(`/runs/${id}`), "in flight");

    open();
    const { stored } = await streamedAndStored(app, id);
    expect(RunResult.safeParse(stored).success).toBe(true);
  });

  test("an id no stored run has, or one that is no run id, is a 404", async () => {
    const { app, db } = await appOn();
    // A stored run, so a lookup that ignored the id would find one.
    await saveRun(db, runResultFixture, fixtureStartedAt);
    expect((await getJson(app, `/runs/${runResultFixture.id}`)).body).toStrictEqual(
      runResultFixture,
    );

    for (const id of ["run_unknown", "fixture"]) {
      await expectNotFound(await app.request(`/runs/${id}`), id);
    }
  });
});

describe("GET /runs/:id/events", () => {
  test("a client that disconnects does not stop the run", async () => {
    const { promise, open } = gate();
    const { app } = await appOn(fakeRun(() => ({ step: true, gate: promise })));
    const id = await startOne(app, "prof_ada", 1);

    // One event read, then the reader is cancelled, as a closed tab does.
    const [first] = await readSse(await eventsOf(app, id), 1);
    expect(first?.event).toBe("runStarted");
    open();

    // A second client reads the whole run, and the run is stored.
    const { stored } = await streamedAndStored(app, id);
    expect(stored.outcome).toBe("success");
    expect(idsOf((await getJson(app, "/runs")).body)).toStrictEqual([id]);
  });

  test("Last-Event-ID resumes a live run after that index, and is a 204 at the end of an ended run", async () => {
    const { promise, open } = gate();
    const { app } = await appOn(fakeRun(() => ({ step: true, gate: promise })));
    const id = await startOne(app, "prof_ada", 1);
    // The step's four events are out: the run now waits on its gate.
    const before = await readSse(await eventsOf(app, id), 4);
    expect(before.map((message) => message.id)).toStrictEqual(["0", "1", "2", "3"]);

    const resumed = await eventsOf(app, id, "0");
    expect(resumed.status).toBe(200);
    open();

    const { messages } = await readEvents(resumed);
    expect(messages.map((message) => [message.id, message.event])).toStrictEqual([
      ["1", "stepObserved"],
      ["2", "actionPlanned"],
      ["3", "actionPerformed"],
      ["4", "runFinished"],
    ]);
    // Once the run has ended: the rest after an earlier index, and 204 at or past the last one.
    expect((await streamOf(app, id, "3")).messages.map((message) => message.id)).toStrictEqual([
      "4",
    ]);
    expect((await eventsOf(app, id, "4")).status).toBe(204);
    expect((await eventsOf(app, id, "40")).status).toBe(204);
  });

  test("a run that throws before it starts streams one runFailed, and nothing is stored", async () => {
    const { app } = await appOn(fakeRun(() => ({ throws: "beforeStart" })));
    const id = await startOne(app, "prof_ada", 1);

    const { events } = await streamOf(app, id);

    expect(events).toMatchObject([
      { type: "runFailed", runId: id, error: "fake_crash: the fake run crashed" },
    ]);
    expect(events).toHaveLength(1);
    await expectNotFound(await app.request(`/runs/${id}`), "never stored");
    expect((await getJson(app, "/runs")).body).toStrictEqual([]);
    expect((await eventsOf(app, id, "0")).status).toBe(204);
  });

  test("a run this process has not started is a 404, stored or not", async () => {
    const { app, db } = await appOn();
    // Stored by an earlier process: its record is there, its live events are not.
    await saveRun(db, runResultFixture, fixtureStartedAt);
    expect((await app.request(`/runs/${runResultFixture.id}`)).status).toBe(200);

    await expectNotFound(await eventsOf(app, runResultFixture.id), "stored earlier");
    await expectNotFound(await eventsOf(app, "run_unknown"), "unknown");
  });
});

describe("GET /runs/:id/video", () => {
  test("the video downloads under its persona, seed and run id", async () => {
    const { app } = await appOn();
    const id = await startOne(app, "prof_vera", 1);
    await streamOf(app, id);

    await expectDownload(
      await app.request(`/runs/${id}/video`),
      "video/webm",
      `vera-seed1-${id}.webm`,
    );
  });

  test("a stored path outside the run's folder is a 404", async () => {
    const videos = new Map<number, string>();
    const { app, dir, runsDir } = await appOn(
      fakeRun(({ seed }) => {
        const videoPath = videos.get(seed);
        return videoPath === undefined ? {} : { videoPath };
      }),
    );
    expect(runsDir).toBe(join(dir, "runs"));
    // Every target is a real file, so only the containment check can refuse it.
    const outside = join(dir, "outside.webm");
    await writeFile(outside, "outside");
    const inside = await startOne(app, "prof_ada", 1);
    await streamOf(app, inside);
    const insideVideo = `ada-seed1-${inside}.webm`;
    expect(existsSync(join(runsDir, inside, insideVideo))).toBe(true);

    videos.set(2, "../../outside.webm");
    videos.set(3, outside);
    videos.set(4, `../${inside}/${insideVideo}`);
    const refused = await startRuns(app, ["prof_ada"], [2, 3, 4]);

    for (const { id, seed } of refused) {
      await streamOf(app, id);
      const stored = videos.get(seed);
      expect((await getJson(app, `/runs/${id}`)).body.videoPath).toBe(stored);
      await expectNotFound(await app.request(`/runs/${id}/video`), String(stored));
    }
    // The file inside its own run's folder downloads.
    await expectDownload(await app.request(`/runs/${inside}/video`), "video/webm", insideVideo);
  });

  test("no video, a missing file or a folder is a 404", async () => {
    const scripts = new Map<number, FakeScript>([
      [1, { videoPath: null }],
      [2, { videoPath: "missing.webm" }],
      [3, { videoPath: "folder" }],
    ]);
    const { app, runsDir } = await appOn(fakeRun(({ seed }) => scripts.get(seed) ?? {}));
    const runs = await startRuns(app, ["prof_ada"], [1, 2, 3]);
    for (const { id } of runs) await streamOf(app, id);
    await mkdir(join(runsDir, idOn(runs, 3), "folder"));

    for (const { id, seed } of runs) {
      // Stored as scripted, so the 404 is the file route's and not a missing run's.
      const { body } = await getJson(app, `/runs/${id}`);
      expect(body.videoPath).toBe(scripts.get(seed)?.videoPath ?? undefined);
      await expectNotFound(await app.request(`/runs/${id}/video`), `seed ${seed}`);
    }
    await expectNotFound(await app.request("/runs/run_unknown/video"), "no such run");
    await expectNotFound(await app.request("/runs/fixture/video"), "no run id");
  });
});

describe("GET /runs/:id/trace", () => {
  test("the trace downloads under its persona, seed and run id, as application/zip", async () => {
    const { app } = await appOn();
    const id = await startOne(app, "prof_vera", 1);
    await streamOf(app, id);

    await expectDownload(
      await app.request(`/runs/${id}/trace`),
      "application/zip",
      `vera-seed1-${id}.trace.zip`,
    );
  });
});

describe("GET /runs/:id/steps/:index/screenshot", () => {
  test("a live run's screenshot is served before the run ends, and the stored run's after", async () => {
    const { promise, open } = gate();
    const { app } = await appOn(fakeRun(() => ({ step: true, gate: promise })));
    const id = await startOne(app, "prof_vera", 1);
    // Up to the step's actionPerformed: the run now waits on its gate.
    const seen = await readSse(await eventsOf(app, id), 4);
    expect(seen.at(-1)?.event).toBe("actionPerformed");
    const name = `vera-seed1-${id}-step-0.png`;

    await expectDownload(await app.request(`/runs/${id}/steps/0/screenshot`), "image/png", name);
    await expectNotFound(await app.request(`/runs/${id}`), "still in flight");

    open();
    await streamOf(app, id);
    await expectDownload(await app.request(`/runs/${id}/steps/0/screenshot`), "image/png", name);
  });

  test("a step the run never took, an index that is not digits or an unknown run is a 404", async () => {
    const { app } = await appOn(fakeRun(({ seed }) => ({ step: seed === 1 })));
    const runs = await startRuns(app, ["prof_ada"], [1, 2]);
    for (const { id } of runs) await streamOf(app, id);
    const stepped = idOn(runs, 1);
    expect((await app.request(`/runs/${stepped}/steps/0/screenshot`)).status).toBe(200);

    // Seed 2's run took no step.
    await expectNotFound(
      await app.request(`/runs/${idOn(runs, 2)}/steps/0/screenshot`),
      "no step taken",
    );
    // `Number("0x0")` is 0, a step the run took: only the digits check refuses it.
    for (const index of ["1", "0x0"]) {
      await expectNotFound(
        await app.request(`/runs/${stepped}/steps/${index}/screenshot`),
        `step ${index}`,
      );
    }
    await expectNotFound(await app.request("/runs/run_unknown/steps/0/screenshot"), "no run");
  });
});
