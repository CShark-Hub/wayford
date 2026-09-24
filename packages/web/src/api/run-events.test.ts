import type { RunEvent } from "@wayford/core";
import { runEventFixtures } from "@wayford/core/fixtures";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { type StreamStatus, subscribeToRunEvents } from "./run-events.js";

type Listener = (message: MessageEvent<string>) => void;

/** Stands in for the browser's EventSource. The test plays the server. */
class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static last: FakeEventSource | undefined;

  readyState = FakeEventSource.CONNECTING;
  private closedByClient = false;
  private readonly listeners = new Map<string, Listener[]>();

  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close() {
    this.closedByClient = true;
    this.readyState = FakeEventSource.CLOSED;
  }

  /** Dispatch like the browser does: nothing reaches a source the page closed. */
  emit(type: string, data = "", lastEventId = "") {
    if (this.closedByClient) return;
    if (type === "open") this.readyState = FakeEventSource.OPEN;
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data, lastEventId } as MessageEvent<string>);
    }
  }

  /** The connection dropped: the browser fires `error` and retries on its own. */
  drop() {
    this.readyState = FakeEventSource.CONNECTING;
    this.emit("error");
  }

  /** The browser gave up (a 404, or io down behind the proxy): CLOSED, then `error`. */
  fail() {
    this.readyState = FakeEventSource.CLOSED;
    this.emit("error");
  }

  /** Send a whole run, numbered like io numbers it. */
  play(events: readonly RunEvent[]) {
    events.forEach((event, i) => {
      this.emit(event.type, JSON.stringify(event), String(i));
    });
  }
}

function subscribe(runId = "fixture") {
  const received: { id: string; event: RunEvent }[] = [];
  const statuses: StreamStatus[] = [];
  const unsubscribe = subscribeToRunEvents(runId, {
    onEvent: (event, id) => received.push({ id, event }),
    onStatus: (status) => statuses.push(status),
  });
  const source = FakeEventSource.last;
  if (!source) throw new Error("no EventSource was opened");
  return { received, statuses, source, unsubscribe };
}

const [runStarted] = runEventFixtures;
if (!runStarted) throw new Error("the fixture stream must open with runStarted");
const runFailed: RunEvent = {
  type: "runFailed",
  runId: runStarted.runId,
  stepIndex: 0,
  timestamp: "2026-09-22T10:00:01.000Z",
  error: "browser context crashed",
  durationMs: 900,
  cost: { tokensIn: 0, tokensOut: 0, usd: 0 },
};

beforeEach(() => {
  FakeEventSource.last = undefined;
  vi.stubGlobal("EventSource", FakeEventSource);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

test("opens the run's stream through the dev proxy", () => {
  expect(subscribe("fixture").source.url).toBe("/api/runs/fixture/events");
});

test("hands over every event, validated and in order, with its SSE id", () => {
  const { received, source } = subscribe();
  source.emit("open");
  source.play(runEventFixtures);
  expect(received.map((r) => r.event)).toEqual(runEventFixtures);
  expect(received.map((r) => r.id)).toEqual(runEventFixtures.map((_, i) => String(i)));
});

test("closes after runFinished, so EventSource cannot reconnect and replay the run", () => {
  const { statuses, source } = subscribe();
  source.emit("open");
  source.play(runEventFixtures);
  expect(source.readyState).toBe(FakeEventSource.CLOSED);
  expect(statuses).toEqual(["connecting", "open", "ended"]);
});

test("closes after runFailed as well", () => {
  const { statuses, source } = subscribe();
  source.emit("open");
  source.play([runStarted, runFailed]);
  expect(source.readyState).toBe(FakeEventSource.CLOSED);
  expect(statuses.at(-1)).toBe("ended");
});

test("a message that is not a RunEvent fails the stream instead of reaching onEvent", () => {
  const { received, statuses, source } = subscribe();
  source.emit("narration", JSON.stringify({ type: "narration", text: "no run id" }), "0");
  source.emit("narration", "not JSON", "1");
  expect(received).toEqual([]);
  expect(statuses.at(-1)).toBe("failed");
  expect(source.readyState).toBe(FakeEventSource.CLOSED);
});

test("a message that is not JSON fails the stream without throwing", () => {
  const { received, statuses, source } = subscribe();
  expect(() => source.emit("narration", "not JSON", "0")).not.toThrow();
  expect(received).toEqual([]);
  expect(statuses.at(-1)).toBe("failed");
});

test("a dropped connection reads as connecting while EventSource retries", () => {
  const { statuses, source } = subscribe();
  source.emit("open");
  source.drop();
  expect(statuses).toEqual(["connecting", "open", "connecting"]);
});

test("a refused connection reads as failed", () => {
  const { statuses, source } = subscribe();
  source.fail();
  expect(statuses).toEqual(["connecting", "failed"]);
});

test("unsubscribing closes the source", () => {
  const { source, unsubscribe } = subscribe();
  unsubscribe();
  expect(source.readyState).toBe(FakeEventSource.CLOSED);
});
