import { runEventFixtures } from "@wayford/core/fixtures";
import { afterAll, beforeAll, describe, expect, onTestFinished, test } from "vitest";
import { readSse, type TestApp, testApp } from "./test-app.js";

const lastIndex = runEventFixtures.length - 1;

// One app for the file, replaying the fixture run with no pause. The paced test builds its own.
let t: TestApp;
beforeAll(async () => {
  t = await testApp({ replaySpacingMs: 0 });
});
afterAll(async () => {
  await t.close();
});

describe("GET /health", () => {
  test("answers ok as JSON", async () => {
    const res = await t.app.request("/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await res.text()).toBe('{"ok":true}');
  });
});

describe("GET /runs/:id/events", () => {
  test("replays the fixture run as SSE, one message per RunEvent, named by its type", async () => {
    const res = await t.app.request("/runs/fixture/events");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/event-stream/);
    const messages = await readSse(res);
    expect(messages.map((m) => m.event)).toEqual(runEventFixtures.map((e) => e.type));
    expect(messages.map((m) => JSON.parse(m.data))).toEqual(runEventFixtures);
    expect(messages.at(-1)?.event).toBe("runFinished");
  });

  test("numbers the messages from 0, so a reconnecting client can say where it stopped", async () => {
    const messages = await readSse(await t.app.request("/runs/fixture/events"));
    expect(messages.map((m) => m.id)).toEqual(runEventFixtures.map((_, i) => String(i)));
  });

  test("resumes after Last-Event-ID instead of replaying from the start", async () => {
    const res = await t.app.request("/runs/fixture/events", {
      headers: { "Last-Event-ID": String(lastIndex - 2) },
    });
    const messages = await readSse(res);
    expect(messages.map((m) => m.id)).toEqual([String(lastIndex - 1), String(lastIndex)]);
    expect(messages.at(-1)?.event).toBe("runFinished");
  });

  test("answers 204 once the client has seen the last event, so EventSource stops reconnecting", async () => {
    const res = await t.app.request("/runs/fixture/events", {
      headers: { "Last-Event-ID": String(lastIndex) },
    });
    expect(res.status).toBe(204);
  });

  test("replays from the start when Last-Event-ID is not an event index", async () => {
    const res = await t.app.request("/runs/fixture/events", {
      headers: { "Last-Event-ID": "abc" },
    });
    const messages = await readSse(res);
    expect(messages.map((m) => m.id)).toEqual(runEventFixtures.map((_, i) => String(i)));
  });

  test("an unknown run is a 404, not an empty stream", async () => {
    expect((await t.app.request("/runs/run_unknown/events")).status).toBe(404);
    // A plain object lookup would find these on Object.prototype.
    expect((await t.app.request("/runs/constructor/events")).status).toBe(404);
    expect((await t.app.request("/runs/__proto__/events")).status).toBe(404);
  });

  test("spaces the events 300 ms apart by default, so a person can watch them arrive", async () => {
    const paced = await testApp();
    onTestFinished(() => paced.close());

    const res = await paced.app.request("/runs/fixture/events");
    const [first, second] = await readSse(res, 2);
    if (!first || !second) throw new Error("expected two messages");
    // Timers may fire a millisecond early; 290 still rules out "no spacing".
    expect(second.receivedAt - first.receivedAt).toBeGreaterThanOrEqual(290);
  });
});
