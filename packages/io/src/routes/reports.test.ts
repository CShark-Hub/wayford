/**
 * `POST /reports/:taskId` builds and stores a task's report, and `GET /reports/:taskId` reads it
 * back (`docs/specs/2026-10-05-s4-04-analyst.md`, "io: storage, routes, CLI"). No browser: the app's
 * default route facts are "no route table". What the report holds is `analyst.test.ts`'s and
 * `analyst.browser.test.ts`'s.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LlmError } from "@wayford/agent";
import { fakeLlm } from "@wayford/agent/fake";
import { observationFixture, profileFixture } from "@wayford/core/fixtures";
import { describe, expect, onTestFinished, test } from "vitest";
import { loadReport } from "../db/reports.js";
import { saveRun } from "../db/runs.js";
import {
  FAKE_JEV_MODEL,
  FAKE_LLM_MODEL,
  getJson,
  postJson,
  storedRun,
  type TestAppOptions,
  testApp,
} from "../test-app.js";

const TASK = "task_past-order";
const NOTHING = { recommendations: {}, hypotheses: [] };
const ada = profileFixture("prof_ada");

/** An app on its own store, closed after the test. */
async function app(options: TestAppOptions = {}) {
  const t = await testApp(options);
  onTestFinished(() => t.close());
  return t;
}

/** Stores Ada's run on `seed` of the hard goal, on the Actor model `modelId`. */
async function storeRun(t: Awaited<ReturnType<typeof app>>, seed: number, modelId: string) {
  const observation = observationFixture;
  const run = storedRun({ profile: ada, seed, modelId, steps: [{ observation }] });
  await saveRun(t.db, run, new Date(Date.UTC(2026, 9, 5, 12, 0, seed)).toISOString());
  return run;
}

describe("POST /reports/:taskId", () => {
  test("201 with the report, which is stored and read back by GET; jev when the runs are", async () => {
    const fake = fakeLlm({ analyst: [NOTHING] });
    const t = await app({ llm: fake });
    const run = await storeRun(t, 1, FAKE_JEV_MODEL);

    const { status, body } = await postJson(t.app, `/reports/${TASK}`, {});

    expect(status).toBe(201);
    expect(body).toMatchObject({ taskId: TASK, backend: "jev", runCount: 1 });
    expect(body.personas[0].seeds[0].runId).toBe(run.id);
    expect(fake.calls.map((call) => call.role)).toStrictEqual(["analyst"]);
    expect(await loadReport(t.db, TASK)).toStrictEqual(body);
    expect(await getJson(t.app, `/reports/${TASK}`)).toStrictEqual({ status: 200, body });
  });

  test("a run on the LLM alone is read on llm when no backend is named, and a 404 on jev, naming the count", async () => {
    const fake = fakeLlm({ analyst: [NOTHING] });
    const t = await app({ llm: fake });
    const run = await storeRun(t, 1, FAKE_LLM_MODEL);

    expect(await postJson(t.app, `/reports/${TASK}`, { backend: "jev" })).toStrictEqual({
      status: 404,
      body: { error: `no runs of ${TASK} on jev; 1 on llm` },
    });
    expect(fake.calls).toStrictEqual([]);

    const { status, body } = await postJson(t.app, `/reports/${TASK}`, {});
    expect(status).toBe(201);
    expect(body).toMatchObject({ backend: "llm", runCount: 1 });
    expect(body.personas[0].seeds[0].runId).toBe(run.id);
  });

  test("runs on both backends are read on jev when no backend is named, the LLM's left out", async () => {
    const fake = fakeLlm({ analyst: [NOTHING] });
    const t = await app({ llm: fake });
    await storeRun(t, 1, FAKE_LLM_MODEL);
    await storeRun(t, 2, FAKE_JEV_MODEL);

    const { status, body } = await postJson(t.app, `/reports/${TASK}`, {});
    expect(status).toBe(201);
    expect(body).toMatchObject({ backend: "jev", runCount: 1, leftOut: { otherBackend: 1 } });
  });

  test("a body that is not { backend? } is a 400, asks no model and stores nothing", async () => {
    const fake = fakeLlm({ analyst: [NOTHING] });
    const t = await app({ llm: fake });
    await storeRun(t, 1, FAKE_JEV_MODEL);

    for (const bad of [{ backend: "other" }, { backend: "jev", extra: 1 }, { backend: null }, []]) {
      const { status, body } = await postJson(t.app, `/reports/${TASK}`, bad);
      expect(status, JSON.stringify(bad)).toBe(400);
      expect(body).toStrictEqual({ error: expect.any(String) });
    }
    expect(fake.calls).toStrictEqual([]);
    expect((await getJson(t.app, `/reports/${TASK}`)).status).toBe(404);
  });

  test("a :taskId that is not a TaskId is a 400, on POST and on GET", async () => {
    const fake = fakeLlm({});
    const t = await app({ llm: fake });

    for (const id of ["NOPE", "task_Past-order", "run_past-order"]) {
      const posted = await postJson(t.app, `/reports/${id}`, {});
      expect(posted.status, id).toBe(400);
      expect(posted.body).toStrictEqual({ error: expect.stringContaining("task_") });
      expect((await getJson(t.app, `/reports/${id}`)).status, id).toBe(400);
    }
    expect(fake.calls).toStrictEqual([]);
  });

  test("an unknown task, or a known task with no runs, is a 404 and asks no model", async () => {
    const fake = fakeLlm({});
    const t = await app({ llm: fake });

    expect(await postJson(t.app, "/reports/task_nope", {})).toStrictEqual({
      status: 404,
      body: { error: "no task task_nope" },
    });
    expect(await postJson(t.app, `/reports/${TASK}`, {})).toStrictEqual({
      status: 404,
      body: { error: `no runs of ${TASK} on jev; none on llm` },
    });
    expect(fake.calls).toStrictEqual([]);
  });

  test("a failed Analyst call is a 502, and nothing is stored", async () => {
    const failure = new LlmError("llm_http_error", "the model failed", {
      tokensIn: 0,
      tokensOut: 0,
      usd: 0,
    });
    const t = await app({ llm: fakeLlm({ analyst: [failure] }) });
    await storeRun(t, 1, FAKE_JEV_MODEL);

    expect(await postJson(t.app, `/reports/${TASK}`, {})).toStrictEqual({
      status: 502,
      body: { error: "llm_http_error: the model failed" },
    });
    expect(await loadReport(t.db, TASK)).toBeUndefined();
    expect((await getJson(t.app, `/reports/${TASK}`)).status).toBe(404);
  });

  test("a ground-truth file that is no ground truth is a 500 from onError, before any call", async () => {
    const fake = fakeLlm({ analyst: [NOTHING] });
    const t = await app({ llm: fake });
    await storeRun(t, 1, FAKE_JEV_MODEL);
    // testApp's ground-truth folder: `<store>/ground-truth`, absent until a test writes it.
    await mkdir(join(t.dir, "ground-truth"));
    await writeFile(join(t.dir, "ground-truth", `${TASK}.json`), "{ not json");

    expect(await postJson(t.app, `/reports/${TASK}`, {})).toStrictEqual({
      status: 500,
      body: { error: "internal error" },
    });
    expect(fake.calls).toStrictEqual([]);
    expect(await loadReport(t.db, TASK)).toBeUndefined();
  });
});

describe("GET /reports/:taskId", () => {
  test("a task with no stored report is a 404", async () => {
    const t = await app();

    expect(await getJson(t.app, `/reports/${TASK}`)).toStrictEqual({
      status: 404,
      body: { error: `no report on ${TASK}` },
    });
  });
});
