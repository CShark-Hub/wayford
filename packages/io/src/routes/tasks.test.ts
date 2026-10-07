/**
 * `POST /tasks` stores the task the Extractor accepts, and `GET /tasks` lists the stored tasks
 * (`docs/specs/2026-10-02-s4-03-runs-api.md`, "routes/tasks.ts"). What the Extractor answers is
 * `extractor.test.ts`'s. `POST` and `GET /tasks/:id/scout` start Scout on a task and read what it
 * wrote (`docs/specs/2026-10-07-s4-10-scout-sweep-any-task.md`); what Scout writes is agent's
 * `scout.browser.test.ts`'s.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseLlmSettings, TARGET_APP_DEFAULTS } from "@wayford/agent";
import { fakeLlm } from "@wayford/agent/fake";
import { type GroundTruth, WayfordError } from "@wayford/core";
import {
  groundTruthFixture,
  observationFixture,
  profileFixture,
  taskFixture,
  taskFixtures,
} from "@wayford/core/fixtures";
import { describe, expect, onTestFinished, test } from "vitest";
import { readGroundTruth } from "../analyst.js";
import { saveRun } from "../db/runs.js";
import { loadTask, saveTask } from "../db/tasks.js";
import type { ScoutFn } from "../scout-jobs.js";
import { scoutTask } from "../scout-task.js";
import {
  capture,
  fakeRun,
  gate,
  getJson,
  postJson,
  quiet,
  storedRun,
  type TestApp,
  type TestAppOptions,
  testApp,
} from "../test-app.js";

const { startUrl, success } = taskFixture("task_past-order");
const story = "open Settings and click the Archive tab to see my old orders";
/** A valid `POST /tasks` body. */
const request = { story, startUrl, success };

describe("POST /tasks", () => {
  test("a task the Extractor accepts is stored and listed", async () => {
    const answer = {
      goal: "you want to see your old orders",
      strippedPaths: ["Settings", "Archive"],
    };
    const t = await testApp({ llm: fakeLlm({ extractor: [answer] }) });
    onTestFinished(() => t.close());

    const { status, body } = await postJson(t.app, "/tasks", request);
    expect(status).toBe(201);
    const { task } = body;

    expect(await getJson(t.app, "/tasks")).toStrictEqual({ status: 200, body: [task] });
    expect(await loadTask(t.db, task.id)).toStrictEqual(task);
  });

  test("a goal the task check still refuses after the repair round is not stored", async () => {
    // "menu" is a path word, in both answers.
    const kept = { goal: "use the menu to find your old orders", strippedPaths: [] };
    const t = await testApp({ llm: fakeLlm({ extractor: [kept, kept] }) });
    onTestFinished(() => t.close());

    expect((await postJson(t.app, "/tasks", request)).status).toBe(422);
    expect(await getJson(t.app, "/tasks")).toStrictEqual({ status: 200, body: [] });
  });

  test("a body that is not JSON, or not sent as JSON, is refused and asks no model", async () => {
    const fake = fakeLlm({});
    const t = await testApp({ llm: fake });
    onTestFinished(() => t.close());
    const post = (type: string, body: string) =>
      t.app.request("/tasks", { method: "POST", headers: { "content-type": type }, body });

    const malformed = await post("application/json", '{"story":');
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toStrictEqual({
      error: expect.stringMatching(/malformed JSON/i),
    });
    // A valid body as `text/plain`, which a page can send without a CORS preflight.
    expect((await post("text/plain", JSON.stringify(request))).status).toBe(415);
    expect(fake.calls).toStrictEqual([]);
    expect(await getJson(t.app, "/tasks")).toStrictEqual({ status: 200, body: [] });
  });
});

describe("GET /tasks", () => {
  test("an empty store lists []", async () => {
    const t = await testApp();
    onTestFinished(() => t.close());

    expect(await getJson(t.app, "/tasks")).toStrictEqual({ status: 200, body: [] });
  });

  test("lists every stored task, by id", async () => {
    const t = await testApp();
    onTestFinished(() => t.close());
    for (const task of [...taskFixtures].reverse()) await saveTask(t.db, task);
    // The fixtures are in id order already: next-parcel, then past-order.
    expect(await getJson(t.app, "/tasks")).toStrictEqual({ status: 200, body: taskFixtures });
  });
});

describe("POST and GET /tasks/:id/scout (s4-10)", () => {
  const TASK = "task_past-order";
  /** The hard goal's task under its own id, started on a public site. */
  const foreign = {
    ...taskFixture(TASK),
    id: "task_foreign-site",
    startUrl: "https://example.com/",
  };
  const settings = parseLlmSettings({ LLM_API_KEY: "test-key" });

  /** An app on `options`, closed after the test. */
  async function app(options: TestAppOptions = {}): Promise<TestApp> {
    const t = await testApp(options);
    onTestFinished(() => t.close());
    return t;
  }

  /** testApp's ground-truth folder, `<store>/ground-truth`, absent until something writes it. */
  const groundTruthDir = (t: TestApp) => join(t.dir, "ground-truth");

  /** A `ScoutFn` that keeps the options of every call, in order, and answers what `answer` gives. */
  function fakeScout(answer: () => Promise<GroundTruth>) {
    const calls: Parameters<ScoutFn>[0][] = [];
    const scout: ScoutFn = (options) => {
      calls.push(options);
      return answer();
    };
    return Object.assign(scout, { calls });
  }

  /** `GET /tasks/:id/scout` until it answers anything but 202. */
  async function settled(t: TestApp, id: string) {
    for (let tries = 0; tries < 500; tries += 1) {
      const answer = await getJson(t.app, `/tasks/${id}/scout`);
      if (answer.status !== 202) return answer;
      await sleep(10);
    }
    throw new Error(`Scout on ${id} still runs`);
  }

  test("POST scout writes ground truth that GET serves and the report opens with", async () => {
    const g = gate();
    // agent's own Scout over a fake run, one step per attempt, so each attempt's path parses.
    const attempts = fakeRun(() => ({ step: true, gate: g.promise }));
    const t = await app({
      llm: fakeLlm({ analyst: [{ recommendations: {}, hypotheses: [] }] }),
      scout: scoutTask({ run: attempts, settings, logger: quiet, llm: () => fakeLlm({}) }),
    });

    const posted = await postJson(t.app, `/tasks/${TASK}/scout`, {});
    expect(posted).toStrictEqual({
      status: 202,
      body: { taskId: TASK, status: "running" },
    });
    expect(await getJson(t.app, `/tasks/${TASK}/scout`)).toStrictEqual(posted);

    g.open();
    const { status, body } = await settled(t, TASK);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      taskId: TASK,
      reached: true,
      modelId: settings.roles.scout.model,
    });
    expect(body.attempts).toHaveLength(3);
    // Every attempt on the target app gets its parameters, passed on through `scoutTask`.
    expect(attempts.calls.map((call) => call.params)).toStrictEqual(
      Array(3).fill(TARGET_APP_DEFAULTS),
    );
    expect(await readGroundTruth(groundTruthDir(t), TASK)).toStrictEqual(body);
    // Scout's attempts are not stored as runs.
    expect((await getJson(t.app, "/runs")).body).toStrictEqual([]);

    const run = storedRun({
      profile: profileFixture("prof_ada"),
      seed: 1,
      steps: [{ observation: observationFixture }],
    });
    await saveRun(t.db, run, "2026-10-07T12:00:00.000Z");
    const report = await postJson(t.app, `/reports/${TASK}`, { backend: "llm" });
    expect(report.status).toBe(201);
    expect(report.body.scout).toStrictEqual({
      status: "reached",
      steps: 1,
      modelId: settings.roles.scout.model,
      recordedAt: body.recordedAt,
    });
  });

  test("a second POST while Scout runs answers the running job and starts no second Scout", async () => {
    const g = gate();
    const scout = fakeScout(async () => {
      await g.promise;
      return groundTruthFixture;
    });
    const t = await app({ scout });

    const first = await postJson(t.app, `/tasks/${TASK}/scout`, {});
    const second = await postJson(t.app, `/tasks/${TASK}/scout`, {});

    expect(first.status).toBe(202);
    expect(second).toStrictEqual(first);
    expect(scout.calls).toHaveLength(1);
    g.open();
  });

  test("a task on the target app gets its parameters, a foreign one none, and both the ground-truth folder", async () => {
    const scout = fakeScout(async () => groundTruthFixture);
    const t = await app({ scout });
    await saveTask(t.db, foreign);

    expect((await postJson(t.app, `/tasks/${TASK}/scout`, {})).status).toBe(202);
    expect((await postJson(t.app, `/tasks/${foreign.id}/scout`, {})).status).toBe(202);

    expect(scout.calls).toStrictEqual([
      { task: taskFixture(TASK), params: TARGET_APP_DEFAULTS, dir: groundTruthDir(t) },
      { task: foreign, params: undefined, dir: groundTruthDir(t) },
    ]);
  });

  test("an unknown task is a 404, and nothing starts", async () => {
    const scout = fakeScout(async () => groundTruthFixture);
    const t = await app({ scout });

    expect(await postJson(t.app, "/tasks/task_nope/scout", {})).toStrictEqual({
      status: 404,
      body: { error: "no task task_nope" },
    });
    expect(scout.calls).toStrictEqual([]);
    expect((await getJson(t.app, "/tasks/task_nope/scout")).status).toBe(404);
  });

  test("GET with no Scout started and no file is a 404", async () => {
    const t = await app();

    expect(await getJson(t.app, `/tasks/${TASK}/scout`)).toStrictEqual({
      status: 404,
      body: { error: expect.stringContaining(TASK) },
    });
  });

  test("a Scout that fails is a 502 with its error, logged, until the next POST replaces it", async () => {
    const { lines, logger } = capture();
    const g = gate();
    const answers = [
      async (): Promise<GroundTruth> => {
        throw new WayfordError("scout_inconclusive", "no attempt reached the goal");
      },
      async () => {
        await g.promise;
        return groundTruthFixture;
      },
    ];
    const scout = fakeScout(() => {
      const answer = answers.shift();
      if (answer === undefined) throw new Error("Scout was called a third time");
      return answer();
    });
    const t = await app({ scout, logger });

    expect((await postJson(t.app, `/tasks/${TASK}/scout`, {})).status).toBe(202);
    const failed = {
      status: 502,
      body: { error: "scout_inconclusive: no attempt reached the goal" },
    };
    expect(await settled(t, TASK)).toStrictEqual(failed);
    expect(lines).toContainEqual(
      expect.objectContaining({
        msg: "Scout failed",
        taskId: TASK,
        err: expect.objectContaining({ message: "no attempt reached the goal" }),
      }),
    );
    // Read twice: a read does not clear it.
    expect(await getJson(t.app, `/tasks/${TASK}/scout`)).toStrictEqual(failed);

    const again = await postJson(t.app, `/tasks/${TASK}/scout`, {});
    expect(again.status).toBe(202);
    expect(await getJson(t.app, `/tasks/${TASK}/scout`)).toStrictEqual(again);
    expect(scout.calls).toHaveLength(2);
    g.open();
  });

  test("a ground-truth file written before this process is a 200", async () => {
    const t = await app();
    await mkdir(groundTruthDir(t));
    await writeFile(join(groundTruthDir(t), `${TASK}.json`), JSON.stringify(groundTruthFixture));

    expect(await getJson(t.app, `/tasks/${TASK}/scout`)).toStrictEqual({
      status: 200,
      body: groundTruthFixture,
    });
  });

  test("an :id that is not a TaskId, or a body that is not {}, is a 400 and starts nothing", async () => {
    const scout = fakeScout(async () => groundTruthFixture);
    const t = await app({ scout });

    for (const id of ["NOPE", "task_Past-order", "run_past-order"]) {
      expect((await postJson(t.app, `/tasks/${id}/scout`, {})).status, id).toBe(400);
      expect((await getJson(t.app, `/tasks/${id}/scout`)).status, id).toBe(400);
    }
    for (const bad of [{ seeds: [1] }, [], null]) {
      const { status, body } = await postJson(t.app, `/tasks/${TASK}/scout`, bad);
      expect(status, JSON.stringify(bad)).toBe(400);
      expect(body).toStrictEqual({ error: expect.any(String) });
    }
    expect(scout.calls).toStrictEqual([]);
  });
});
