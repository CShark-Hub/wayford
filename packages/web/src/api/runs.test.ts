import { QueryClient } from "@tanstack/react-query";
import { runResultFixture, taskFixtures } from "@wayford/core/fixtures";
import { afterEach, expect, test, vi } from "vitest";
import { fixtureRuns } from "../runs/fixture-runs.js";
import {
  fetchRun,
  fetchRuns,
  fetchTasks,
  runQuery,
  runsQuery,
  screenshotUrl,
  tasksQuery,
  traceUrl,
  videoUrl,
} from "./runs.js";

/** Make the next `fetch` answer with `response`, and hand back the stub to inspect calls. */
function answer(response: Response) {
  const fetch = vi.fn(async (_url: string) => response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

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
