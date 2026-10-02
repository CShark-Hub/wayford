/**
 * The dashboard's way to io's runs API (`packages/io/src/routes/runs.ts`), through the dev server's
 * `/api` proxy. Every io path and every response parse of `/runs` and `/runs/$runId` lives in this
 * file, so a change to io's shapes is a change here alone.
 *
 * Responses are bare core shapes, parsed with core's schemas before a screen sees them. A body that
 * fails its schema rejects with zod's account of why, so a screen says io sent something that is
 * not a run instead of drawing half of one. Screenshots, the video and the trace are files the
 * browser fetches itself, so for those this file only builds the URL.
 */
import { queryOptions } from "@tanstack/react-query";
import { type RunId, RunResult, Task } from "@wayford/core";
import { type ZodType, z } from "zod";

/**
 * `response`'s JSON body as `schema` reads it. A non-OK answer rejects with its status, as
 * `fetchHealth` does; a body `schema` refuses rejects naming `what` it should have been.
 */
async function parseResponse<T>(response: Response, schema: ZodType<T>, what: string): Promise<T> {
  if (!response.ok) throw new Error(`io answered ${response.status}`);
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(`io sent something that is not ${what}:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/** `GET /api/runs`, parsed with `RunResult.array()`. Every stored run, in the order io sends them. */
export async function fetchRuns(): Promise<RunResult[]> {
  return parseResponse(await fetch("/api/runs"), RunResult.array(), "a list of runs");
}

/** A run's own path under io's `/runs`, its id encoded. */
function runPath(id: string): string {
  return `/api/runs/${encodeURIComponent(id)}`;
}

/** `GET /api/runs/:id`, parsed with `RunResult`; `null` on 404 (no run stored under that id). */
export async function fetchRun(id: string): Promise<RunResult | null> {
  const response = await fetch(runPath(id));
  if (response.status === 404) return null;
  return parseResponse(response, RunResult, "a run");
}

/** `GET /api/tasks`, parsed with `Task.array()`. Used for goal labels only. */
export async function fetchTasks(): Promise<Task[]> {
  return parseResponse(await fetch("/api/tasks"), Task.array(), "a list of tasks");
}

/**
 * Every stored run, under the key `["runs"]`. A test seeds it with
 * `queryClient.setQueryData(runsQuery().queryKey, runs)` and renders without a fetch.
 */
export function runsQuery() {
  return queryOptions({ queryKey: ["runs"], queryFn: fetchRuns });
}

/** One stored run, or `null` when io has none under `id`, under the key `["runs", id]`. */
export function runQuery(id: string) {
  return queryOptions({ queryKey: ["runs", id], queryFn: () => fetchRun(id) });
}

/** Every stored task, under the key `["tasks"]`. */
export function tasksQuery() {
  return queryOptions({ queryKey: ["tasks"], queryFn: fetchTasks });
}

/** The screenshot taken after step `stepIndex`'s action landed, for an `<img>`. */
export function screenshotUrl(runId: RunId, stepIndex: number): string {
  return `${runPath(runId)}/steps/${stepIndex}/screenshot`;
}

/** The run's recording, for a `<video>` and its download link. */
export function videoUrl(runId: RunId): string {
  return `${runPath(runId)}/video`;
}

/** The run's Playwright trace, for its download link. */
export function traceUrl(runId: RunId): string {
  return `${runPath(runId)}/trace`;
}
