/**
 * A test double for the browser's `EventSource`, stubbed in with
 * `vi.stubGlobal("EventSource", FakeEventSource)`. Tests use it and nothing else does: no screen
 * imports it. It keeps every source opened, so one test can play several runs' streams.
 */
import type { RunEvent } from "@wayford/core";

type Listener = (message: MessageEvent<string>) => void;

/** Stands in for the browser's EventSource. The test plays the server. */
export class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  /** Every source opened since the last `reset()`, in the order they were opened. */
  static readonly instances: FakeEventSource[] = [];

  /** The source opened last, or `undefined` when none was since the last `reset()`. */
  static get last(): FakeEventSource | undefined {
    return FakeEventSource.instances.at(-1);
  }

  /** The source opened last on `url`. Throws when none was, so a test fails on the missing stream. */
  static byUrl(url: string): FakeEventSource {
    const source = FakeEventSource.instances.findLast((opened) => opened.url === url);
    if (!source) throw new Error(`no EventSource was opened on ${url}`);
    return source;
  }

  /** Forget every source opened so far, for the next test. */
  static reset() {
    FakeEventSource.instances.length = 0;
  }

  readyState = FakeEventSource.CONNECTING;
  private closedByClient = false;
  private readonly listeners = new Map<string, Listener[]>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
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
