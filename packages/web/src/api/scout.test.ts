import { groundTruthFixture } from "@wayford/core/fixtures";
import { afterEach, expect, test, vi } from "vitest";
import { readScout, startScout } from "./scout.js";

/** Make the next `fetch` answer with `response`, and hand back the stub to inspect calls. */
function answer(response: Response) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/** What the one call to the `fetch` stub sent: its URL, method, content type and parsed body. */
function sent(fetch: ReturnType<typeof answer>) {
  expect(fetch).toHaveBeenCalledOnce();
  const [url, init] = fetch.mock.calls[0] ?? [];
  return {
    url,
    method: init?.method,
    contentType: new Headers(init?.headers).get("content-type"),
    body: JSON.parse(String(init?.body)) as unknown,
  };
}

const HARD = "task_past-order";

/** io's 202 body on both routes while Scout walks the goal (`ScoutJob` in io's `scout-jobs.ts`). */
const runningJob = { taskId: HARD, status: "running", startedAt: "2026-10-07T12:00:00.000Z" };

afterEach(() => {
  vi.unstubAllGlobals();
});

test("readScout GETs /api/tasks/:id/scout and reads a 200 as the ground truth", async () => {
  const fetch = answer(Response.json(groundTruthFixture));
  await expect(readScout(HARD)).resolves.toStrictEqual({
    status: "done",
    truth: groundTruthFixture,
  });
  // One argument: no init, so a GET.
  expect(fetch).toHaveBeenCalledWith("/api/tasks/task_past-order/scout");
});

test("readScout rejects a 200 that is not a ground truth with zod's account of why", async () => {
  answer(Response.json({ ...groundTruthFixture, reached: "yes" }));
  const read = readScout(HARD);
  await expect(read).rejects.toThrow(/^io sent something that is not a ground truth:\n/);
  await expect(read).rejects.toThrow("→ at reached");
});

test("readScout reads a 202 as Scout running", async () => {
  answer(Response.json(runningJob, { status: 202 }));
  await expect(readScout(HARD)).resolves.toStrictEqual({ status: "running" });
});

test("readScout reads a 404 as no Scout: none started, and no ground truth", async () => {
  answer(
    Response.json(
      { error: "no Scout of task_past-order: none started, and no ground truth" },
      { status: 404 },
    ),
  );
  await expect(readScout(HARD)).resolves.toStrictEqual({ status: "none" });
});

test("readScout reads io's 502 as a failed Scout, with io's reason", async () => {
  answer(Response.json({ error: "Scout crashed: page.goto timed out" }, { status: 502 }));
  await expect(readScout(HARD)).resolves.toStrictEqual({
    status: "failed",
    message: "Scout crashed: page.goto timed out",
  });
});

test("readScout rejects a 502 that is not io's, as Vite's proxy answers while io is down", async () => {
  answer(new Response("Bad Gateway", { status: 502 }));
  await expect(readScout(HARD)).rejects.toThrow(/^io answered 502$/);
});

test("readScout rejects any other status, with io's reason when it sent one", async () => {
  // What io's error handler answers for a file that is no ground truth.
  answer(Response.json({ error: "internal error" }, { status: 500 }));
  await expect(readScout(HARD)).rejects.toThrow(/^io answered 500: internal error$/);
  answer(Response.json({ error: "✖ Invalid string" }, { status: 400 }));
  await expect(readScout(HARD)).rejects.toThrow(/^io answered 400: ✖ Invalid string$/);
});

test("startScout POSTs an empty body as JSON to /api/tasks/:id/scout and reads a 202 as running", async () => {
  const fetch = answer(Response.json(runningJob, { status: 202 }));
  await expect(startScout(HARD)).resolves.toStrictEqual({ status: "running" });
  expect(sent(fetch)).toStrictEqual({
    url: "/api/tasks/task_past-order/scout",
    method: "POST",
    // io answers 415 to any other content type, and 400 to any body but `{}`.
    contentType: "application/json",
    body: {},
  });
});

test("startScout rejects anything but a 202, with io's reason when it sent one", async () => {
  answer(Response.json({ error: "no task task_x" }, { status: 404 }));
  await expect(startScout("task_x")).rejects.toThrow(/^io answered 404: no task task_x$/);
  answer(new Response("Bad Gateway", { status: 502 }));
  await expect(startScout(HARD)).rejects.toThrow(/^io answered 502$/);
  answer(Response.json(groundTruthFixture));
  await expect(startScout(HARD)).rejects.toThrow(/^io answered 200$/);
});

test("a task id goes into both paths encoded", async () => {
  const read = answer(Response.json(runningJob, { status: 202 }));
  await readScout("task_a/b?c#d");
  expect(read).toHaveBeenCalledWith("/api/tasks/task_a%2Fb%3Fc%23d/scout");
  const start = answer(Response.json(runningJob, { status: 202 }));
  await startScout("task_a/b?c#d");
  expect(sent(start).url).toBe("/api/tasks/task_a%2Fb%3Fc%23d/scout");
});
