/**
 * `POST /tasks` stores the task the Extractor accepts, and `GET /tasks` lists the stored tasks
 * (`docs/specs/2026-10-02-s4-03-runs-api.md`, "routes/tasks.ts"). What the Extractor answers is
 * `extractor.test.ts`'s.
 */
import { fakeLlm } from "@wayford/agent/fake";
import { taskFixture, taskFixtures } from "@wayford/core/fixtures";
import { describe, expect, onTestFinished, test } from "vitest";
import { loadTask, saveTask } from "../db/tasks.js";
import { getJson, postJson, testApp } from "../test-app.js";

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
