import { measurementFixture, runEventFixtures, taskFixture } from "@wayford/core/fixtures";
import { afterAll, beforeAll, describe, expect, onTestFinished, test, vi } from "vitest";
import type { AxeScanFn } from "./axe.js";
import { saveTask } from "./db/tasks.js";
import type { MeasureFn } from "./routes/measure.js";
import {
  fakeRun,
  noAxeViolations,
  readSse,
  type TestApp,
  type TestAppOptions,
  testApp,
} from "./test-app.js";

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

describe("a request to another host or from another site", () => {
  const task = taskFixture("task_next-parcel");

  /**
   * An app on `options` whose measurement, axe-core scan and run count their calls, with the easy
   * goal stored, so a `POST /runs` that got through would start a run. Closed after the test.
   */
  async function counted(options: TestAppOptions = {}) {
    const measure = vi.fn<MeasureFn>(async () => measurementFixture);
    const scanAxe = vi.fn<AxeScanFn>(noAxeViolations);
    const run = fakeRun();
    const app = await testApp({ ...options, measure, scanAxe, run });
    onTestFinished(() => app.close());
    await saveTask(app.db, task);
    return { ...app, measure, scanAxe, run };
  }

  /**
   * `GET /measure`, `GET /axe` and a `POST /runs` that would start one run, each on `origin` (the
   * bare path when empty) with `headers`: their statuses and answers, in that order.
   */
  async function measureScanRun(
    app: TestApp["app"],
    origin: string,
    headers: Record<string, string>,
  ) {
    const responses = [
      await app.request(`${origin}/measure`, { headers }),
      await app.request(`${origin}/axe?page=/deliveries`, { headers }),
      await app.request(`${origin}/runs`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ taskId: task.id, profileIds: ["prof_ada"], seeds: [1] }),
      }),
    ];
    return Promise.all(
      responses.map(async (res) => ({ status: res.status, body: await res.json() })),
    );
  }

  test.each([
    ["a Host header naming another host", "", { host: "evil.test" }],
    // `@hono/node-server` takes an absolute request-line URL over the header.
    ["a URL on another host, with no Host header", "http://evil.test", {}],
    ["Sec-Fetch-Site cross-site", "", { "sec-fetch-site": "cross-site" }],
    // A page on another localhost port, such as an app under test, is same-site to io.
    ["Sec-Fetch-Site same-site", "", { "sec-fetch-site": "same-site" }],
    // What io's Chromium sends when a page it opened redirects into io: Playwright's `goto` is
    // browser-initiated, and the redirect keeps `none` (s4-09 branch review).
    [
      "a navigation the browser started itself",
      "",
      { "sec-fetch-site": "none", "sec-fetch-mode": "navigate" },
    ],
  ])("%s is a 403, and nothing is measured, scanned or run", async (_, origin, headers) => {
    const { app, measure, scanAxe, run } = await counted();
    for (const answer of await measureScanRun(app, origin, headers)) {
      expect(answer.status).toBe(403);
      expect(typeof answer.body.error).toBe("string");
    }
    expect(measure).not.toHaveBeenCalled();
    expect(scanAxe).not.toHaveBeenCalled();
    expect(run.calls).toStrictEqual([]);
  });

  test("Sec-Fetch-Site same-origin, same-origin navigations, or no header at all pass", async () => {
    const { app, measure } = await counted();
    const sites: Record<string, string>[] = [
      { "sec-fetch-site": "same-origin" },
      // A link in the web UI, such as a run's video, opened through the dev proxy.
      { "sec-fetch-site": "same-origin", "sec-fetch-mode": "navigate" },
      // `none` is refused only on a navigation.
      { "sec-fetch-site": "none", "sec-fetch-mode": "cors" },
      {},
    ];
    for (const headers of sites) {
      expect((await app.request("/health", { headers })).status).toBe(200);
      const res = await app.request("/measure", { headers });
      expect(res.status).toBe(200);
      expect(await res.json()).toStrictEqual(measurementFixture);
    }
    // Measured once: the other two read the route's kept measurement.
    expect(measure).toHaveBeenCalledTimes(1);
  });

  test("io's own hosts pass by name, IPv4 and IPv6 loopback, on its port; another port is a 403", async () => {
    const { app } = await counted({ hosts: ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"] });
    const status = async (url: string, host: string) =>
      (await app.request(url, { headers: { host } })).status;

    expect(await status("http://localhost:3000/health", "localhost:3000")).toBe(200);
    expect(await status("http://127.0.0.1:3000/health", "127.0.0.1:3000")).toBe(200);
    expect(await status("http://[::1]:3000/health", "[::1]:3000")).toBe(200);
    // Host names are case-insensitive.
    expect(await status("http://localhost:3000/health", "LOCALHOST:3000")).toBe(200);

    expect(await status("http://localhost:9999/health", "localhost:9999")).toBe(403);
    // Either one on another port is enough to refuse.
    expect(await status("http://localhost:3000/health", "localhost:9999")).toBe(403);
    expect(await status("http://localhost:9999/health", "localhost:3000")).toBe(403);
  });
});
