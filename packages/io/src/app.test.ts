import { runEventFixtures } from "@wayford/core/fixtures";
import { describe, expect, test } from "vitest";
import { createApp } from "./app.js";

type SseMessage = { event?: string; id?: string; data: string; receivedAt: number };

function parseMessage(block: string, receivedAt: number): SseMessage {
  const message: SseMessage = { data: "", receivedAt };
  const data: string[] = [];
  for (const line of block.split("\n")) {
    const colon = line.indexOf(":");
    const field = line.slice(0, colon);
    const value = line.slice(colon + 1).replace(/^ /, "");
    if (field === "data") data.push(value);
    if (field === "event") message.event = value;
    if (field === "id") message.id = value;
  }
  message.data = data.join("\n");
  return message;
}

/** Read an SSE body message by message, stamping each with the time it arrived. */
async function readSse(response: Response, limit = Number.POSITIVE_INFINITY) {
  if (!response.body) throw new Error("the response has no body");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const messages: SseMessage[] = [];
  let buffer = "";
  while (messages.length < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    for (;;) {
      const end = buffer.indexOf("\n\n");
      if (end === -1) break;
      messages.push(parseMessage(buffer.slice(0, end), performance.now()));
      buffer = buffer.slice(end + 2);
    }
  }
  await reader.cancel();
  return messages;
}

const lastIndex = runEventFixtures.length - 1;

describe("GET /health", () => {
  test("answers ok as JSON", async () => {
    const res = await createApp().request("/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await res.text()).toBe('{"ok":true}');
  });
});

describe("GET /runs/:id/events", () => {
  const app = createApp({ replaySpacingMs: 0 });

  test("replays the fixture run as SSE, one message per RunEvent, named by its type", async () => {
    const res = await app.request("/runs/fixture/events");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/event-stream/);
    const messages = await readSse(res);
    expect(messages.map((m) => m.event)).toEqual(runEventFixtures.map((e) => e.type));
    expect(messages.map((m) => JSON.parse(m.data))).toEqual(runEventFixtures);
    expect(messages.at(-1)?.event).toBe("runFinished");
  });

  test("numbers the messages from 0, so a reconnecting client can say where it stopped", async () => {
    const messages = await readSse(await app.request("/runs/fixture/events"));
    expect(messages.map((m) => m.id)).toEqual(runEventFixtures.map((_, i) => String(i)));
  });

  test("resumes after Last-Event-ID instead of replaying from the start", async () => {
    const res = await app.request("/runs/fixture/events", {
      headers: { "Last-Event-ID": String(lastIndex - 2) },
    });
    const messages = await readSse(res);
    expect(messages.map((m) => m.id)).toEqual([String(lastIndex - 1), String(lastIndex)]);
    expect(messages.at(-1)?.event).toBe("runFinished");
  });

  test("answers 204 once the client has seen the last event, so EventSource stops reconnecting", async () => {
    const res = await app.request("/runs/fixture/events", {
      headers: { "Last-Event-ID": String(lastIndex) },
    });
    expect(res.status).toBe(204);
  });

  test("replays from the start when Last-Event-ID is not an event index", async () => {
    const res = await app.request("/runs/fixture/events", { headers: { "Last-Event-ID": "abc" } });
    const messages = await readSse(res);
    expect(messages.map((m) => m.id)).toEqual(runEventFixtures.map((_, i) => String(i)));
  });

  test("an unknown run is a 404, not an empty stream", async () => {
    expect((await app.request("/runs/run_unknown/events")).status).toBe(404);
    // A plain object lookup would find these on Object.prototype.
    expect((await app.request("/runs/constructor/events")).status).toBe(404);
    expect((await app.request("/runs/__proto__/events")).status).toBe(404);
  });

  test("spaces the events 300 ms apart by default, so a person can watch them arrive", async () => {
    const res = await createApp().request("/runs/fixture/events");
    const [first, second] = await readSse(res, 2);
    if (!first || !second) throw new Error("expected two messages");
    // Timers may fire a millisecond early; 290 still rules out "no spacing".
    expect(second.receivedAt - first.receivedAt).toBeGreaterThanOrEqual(290);
  });
});
