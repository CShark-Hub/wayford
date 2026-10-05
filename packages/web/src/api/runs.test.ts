import { QueryClient } from "@tanstack/react-query";
import { runResultFixture, taskFixtures } from "@wayford/core/fixtures";
import { afterEach, expect, test, vi } from "vitest";
import { fixtureRuns } from "../runs/fixture-runs.js";
import {
  extractTask,
  fetchRun,
  fetchRuns,
  fetchTasks,
  runQuery,
  runsQuery,
  type StartedRun,
  screenshotUrl,
  startRuns,
  type TaskRequest,
  tasksQuery,
  traceUrl,
  videoUrl,
} from "./runs.js";

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

const [, hardTask] = taskFixtures;
if (!hardTask) throw new Error("tasks.json must hold the easy goal, then the hard one");

/** A path-laden story for the hard goal, with the goal's own start URL and success condition. */
const pathLaden: TaskRequest = {
  story: "Click Deliveries → Order archive to see what I ordered three months ago",
  startUrl: hardTask.startUrl,
  success: hardTask.success,
};

const startedRuns: StartedRun[] = [
  { id: "run_ada-1", profileId: "prof_ada", seed: 1 },
  { id: "run_vera-1", profileId: "prof_vera", seed: 1 },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

test("fetchRuns reads every stored run from /api/runs", async () => {
  const fetch = answer(Response.json(fixtureRuns));
  await expect(fetchRuns()).resolves.toStrictEqual(fixtureRuns);
  expect(fetch).toHaveBeenCalledWith("/api/runs");
});

test("fetchRun reads one run from /api/runs/:id", async () => {
  const fetch = answer(Response.json(runResultFixture));
  await expect(fetchRun("run_vera-hard-1")).resolves.toStrictEqual(runResultFixture);
  expect(fetch).toHaveBeenCalledWith("/api/runs/run_vera-hard-1");
});

test("fetchRun answers null when io has no run under the id", async () => {
  answer(Response.json({ error: "no run run_x" }, { status: 404 }));
  await expect(fetchRun("run_x")).resolves.toBeNull();
});

test("fetchTasks reads every task from /api/tasks", async () => {
  const fetch = answer(Response.json(taskFixtures));
  await expect(fetchTasks()).resolves.toStrictEqual(taskFixtures);
  expect(fetch).toHaveBeenCalledWith("/api/tasks");
});

test("a non-OK answer rejects with its status, 404 included everywhere but fetchRun", async () => {
  // Vite's proxy answers 502 while io is down.
  answer(new Response("Bad Gateway", { status: 502 }));
  await expect(fetchRuns()).rejects.toThrow("io answered 502");
  answer(new Response("Internal Server Error", { status: 500 }));
  await expect(fetchRun("run_vera-hard-1")).rejects.toThrow("io answered 500");
  answer(new Response("Not Found", { status: 404 }));
  await expect(fetchTasks()).rejects.toThrow("io answered 404");
});

test("a GET's non-OK answer carries io's reason when it sent one", async () => {
  // What io's error handler answers for anything it did not expect.
  for (const get of [fetchRuns, () => fetchRun("run_vera-hard-1"), fetchTasks]) {
    answer(Response.json({ error: "internal error" }, { status: 500 }));
    await expect(get()).rejects.toThrow(/^io answered 500: internal error$/);
  }
});

test("a body that is not a run rejects with zod's account of why", async () => {
  answer(Response.json([{ ...runResultFixture, outcome: "lost" }]));
  const runs = fetchRuns();
  await expect(runs).rejects.toThrow(/^io sent something that is not a list of runs:\n/);
  await expect(runs).rejects.toThrow(/outcome/);

  answer(Response.json({ ...runResultFixture, id: "vera-hard-1" }));
  const run = fetchRun("run_vera-hard-1");
  await expect(run).rejects.toThrow(/^io sent something that is not a run:\n/);
  await expect(run).rejects.toThrow("→ at id");

  answer(Response.json([{ id: "task_x" }]));
  await expect(fetchTasks()).rejects.toThrow(/^io sent something that is not a list of tasks:\n/);
});

test("a 200 that is not io's answer rejects too", async () => {
  // What a missing proxy looks like: Vite serves the page itself for /api/runs.
  answer(new Response("<!doctype html>", { headers: { "content-type": "text/html" } }));
  await expect(fetchRuns()).rejects.toThrow();
});

test("a run id goes into the path encoded", async () => {
  const fetch = answer(Response.json(runResultFixture));
  await fetchRun("run_a/b?c#d");
  expect(fetch).toHaveBeenCalledWith("/api/runs/run_a%2Fb%3Fc%23d");
});

test("the file routes name the run and the step", () => {
  expect(screenshotUrl("run_vera-hard-1", 2)).toBe("/api/runs/run_vera-hard-1/steps/2/screenshot");
  expect(videoUrl("run_vera-hard-1")).toBe("/api/runs/run_vera-hard-1/video");
  expect(traceUrl("run_vera-hard-1")).toBe("/api/runs/run_vera-hard-1/trace");
});

test("each query fetches what its key names", async () => {
  const client = new QueryClient();
  answer(Response.json(fixtureRuns));
  await expect(client.fetchQuery(runsQuery())).resolves.toStrictEqual(fixtureRuns);
  const fetch = answer(Response.json(runResultFixture));
  await expect(client.fetchQuery(runQuery("run_vera-hard-1"))).resolves.toStrictEqual(
    runResultFixture,
  );
  expect(fetch).toHaveBeenCalledWith("/api/runs/run_vera-hard-1");
  answer(Response.json(taskFixtures));
  await expect(client.fetchQuery(tasksQuery())).resolves.toStrictEqual(taskFixtures);
});

test("extractTask posts the story, start URL and success condition to /api/tasks as JSON", async () => {
  const fetch = answer(Response.json({ task: hardTask, rewritten: true }, { status: 201 }));
  await extractTask(pathLaden);
  expect(sent(fetch)).toStrictEqual({
    url: "/api/tasks",
    method: "POST",
    // io answers 415 to any other content type.
    contentType: "application/json",
    body: {
      story: "Click Deliveries → Order archive to see what I ordered three months ago",
      startUrl: "http://localhost:5174/",
      success: { type: "urlMatches", pattern: "**/deliveries/archive" },
    },
  });
});

test("extractTask reads a 201 as the accepted task and whether it was rewritten", async () => {
  answer(Response.json({ task: hardTask, rewritten: true }, { status: 201 }));
  await expect(extractTask(pathLaden)).resolves.toStrictEqual({
    ok: true,
    task: hardTask,
    rewritten: true,
  });
});

test("extractTask reads a 422 as the refused goal and the words that survived", async () => {
  const refused = {
    error: "the goal still names the screens it was stripped of",
    goal: "open Order archive to see what I ordered three months ago",
    survived: ["Order archive"],
  };
  answer(Response.json(refused, { status: 422 }));
  await expect(extractTask(pathLaden)).resolves.toStrictEqual({ ok: false, ...refused });
});

test("extractTask rejects any other answer with its status, and io's error when it sent one", async () => {
  answer(
    Response.json(
      { error: "✖ Too small: expected string to have >=1 characters" },
      { status: 400 },
    ),
  );
  await expect(extractTask(pathLaden)).rejects.toThrow(
    "io answered 400: ✖ Too small: expected string to have >=1 characters",
  );
  answer(Response.json({ error: "llm_timeout: the model did not answer" }, { status: 502 }));
  await expect(extractTask(pathLaden)).rejects.toThrow(
    "io answered 502: llm_timeout: the model did not answer",
  );
  // Vite's proxy answers 502 with no JSON while io is down.
  answer(new Response("Bad Gateway", { status: 502 }));
  await expect(extractTask(pathLaden)).rejects.toThrow(/^io answered 502$/);
  answer(Response.json({ task: hardTask, rewritten: false }));
  await expect(extractTask(pathLaden)).rejects.toThrow(/^io answered 200$/);
});

test("a 201 or a 422 that is not io's answer rejects with zod's account of why", async () => {
  answer(Response.json({ task: { ...hardTask, goal: "click Deliveries" } }, { status: 201 }));
  const accepted = extractTask(pathLaden);
  await expect(accepted).rejects.toThrow(/^io sent something that is not an extracted task:\n/);
  await expect(accepted).rejects.toThrow("→ at task.goal");
  await expect(accepted).rejects.toThrow("→ at rewritten");

  answer(Response.json({ error: "refused", goal: "a goal" }, { status: 422 }));
  const refused = extractTask(pathLaden);
  await expect(refused).rejects.toThrow(/^io sent something that is not a refused goal:\n/);
  await expect(refused).rejects.toThrow("→ at survived");
});

test("startRuns posts the task, personas and seeds to /api/runs as JSON and reads the started runs", async () => {
  const fetch = answer(Response.json({ runs: startedRuns }, { status: 202 }));
  await expect(
    startRuns({ taskId: "task_past-order", profileIds: ["prof_ada", "prof_vera"], seeds: [1] }),
  ).resolves.toStrictEqual(startedRuns);
  expect(sent(fetch)).toStrictEqual({
    url: "/api/runs",
    method: "POST",
    contentType: "application/json",
    body: { taskId: "task_past-order", profileIds: ["prof_ada", "prof_vera"], seeds: [1] },
  });
});

test("startRuns rejects a non-OK answer with its status, and io's reason when it sent one", async () => {
  const request = { taskId: "task_x", profileIds: ["prof_ada", "prof_x"], seeds: [1] };
  answer(Response.json({ error: "no task task_x, no profile prof_x" }, { status: 404 }));
  await expect(startRuns(request)).rejects.toThrow(
    "io answered 404: no task task_x, no profile prof_x",
  );
  answer(new Response("Bad Gateway", { status: 502 }));
  await expect(startRuns(request)).rejects.toThrow(/^io answered 502$/);
});

test("a 202 that is not a list of started runs rejects with zod's account of why", async () => {
  answer(Response.json({ runs: [{ ...startedRuns[0], seed: -1 }] }, { status: 202 }));
  const started = startRuns({ taskId: "task_past-order", profileIds: ["prof_ada"], seeds: [1] });
  await expect(started).rejects.toThrow(/^io sent something that is not a list of started runs:\n/);
  await expect(started).rejects.toThrow("→ at runs[0].seed");
});
