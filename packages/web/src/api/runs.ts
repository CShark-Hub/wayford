/**
 * The web's way to io's tasks and runs API (`packages/io/src/routes/tasks.ts`, `routes/runs.ts`),
 * through the dev server's `/api` proxy: the dashboard reads runs back, the arena checks a goal and
 * starts runs. Every io path and every response parse of `/tasks`, `/runs` and `/runs/$runId`
 * lives in this file, so a change to io's shapes is a change here alone.
 *
 * Responses are parsed before a screen sees them: bare core shapes with core's schemas, io's own
 * bodies with schemas built from core's here, since web may not import io. A body that fails its
 * schema rejects with zod's account of why, so a screen says io sent something that is not a run
 * instead of drawing half of one. Screenshots, the video and the trace are files the browser
 * fetches itself, so for those this file only builds the URL. `api/reports.ts` reads its answers
 * through this file's `parseResponse` and `postJson`, so a refusal reads the same there.
 */
import { queryOptions } from "@tanstack/react-query";
import {
  type HttpUrl,
  ProfileId,
  RunId,
  RunResult,
  Seed,
  type SuccessCondition,
  Task,
  type TaskId,
} from "@wayford/core";
import { type ZodType, z } from "zod";

/** `response`'s JSON body as `schema` reads it; a body `schema` refuses rejects naming `what`. */
async function parseBody<T>(response: Response, schema: ZodType<T>, what: string): Promise<T> {
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(`io sent something that is not ${what}:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/** io's body on a 400, 404, 415, 500 or 502: the reason, in words. */
const IoError = z.object({ error: z.string() });

/**
 * The rejection for an answer the caller does not accept: its status, and io's `error` when the
 * body carries one. Vite's proxy answers 502 with no JSON while io is down, so a body that is not
 * io's names the status alone.
 */
async function refusal(response: Response): Promise<Error> {
  const body = IoError.safeParse(await response.json().catch(() => undefined));
  return new Error(
    body.success
      ? `io answered ${response.status}: ${body.data.error}`
      : `io answered ${response.status}`,
  );
}

/**
 * `response`'s JSON body as `schema` reads it. A non-OK answer rejects as `refusal` words it: its
 * status, and io's reason when it sent one. A body `schema` refuses rejects naming `what` it
 * should have been.
 */
export async function parseResponse<T>(
  response: Response,
  schema: ZodType<T>,
  what: string,
): Promise<T> {
  if (!response.ok) throw await refusal(response);
  return parseBody(response, schema, what);
}

/** `POST` `body` to `path` as JSON. io answers 415 to any other content type. */
export function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

/** The body of io's `POST /tasks` (`TaskRequest` in `packages/io/src/extractor.ts`). */
export type TaskRequest = {
  story: string;
  startUrl: z.infer<typeof HttpUrl>;
  success: SuccessCondition;
};

/** io's 201 body: the stored task, and whether the Extractor rewrote the story's sentence. */
const AcceptedTask = z.object({ task: Task, rewritten: z.boolean() }).strict();

/** io's 422 body: why the goal was refused, the goal, and the path words it still carries. */
const RefusedGoal = z
  .object({ error: z.string(), goal: z.string(), survived: z.array(z.string()) })
  .strict();

/** io's answer to `POST /tasks`: 201 is accepted, 422 is refused. */
export type Extraction =
  | ({ ok: true } & z.infer<typeof AcceptedTask>)
  | ({ ok: false } & z.infer<typeof RefusedGoal>);

/**
 * `POST /api/tasks`. 201 and 422 parse into `Extraction`; any other status rejects with io's
 * `error` text (a 400 names the field, a 502 the failed model call).
 */
export async function extractTask(request: TaskRequest): Promise<Extraction> {
  const response = await postJson("/api/tasks", request);
  if (response.status === 201) {
    return { ok: true, ...(await parseBody(response, AcceptedTask, "an extracted task")) };
  }
  if (response.status === 422) {
    return { ok: false, ...(await parseBody(response, RefusedGoal, "a refused goal")) };
  }
  throw await refusal(response);
}

/** One run as io's `POST /runs` hands it back (`StartedRun` in `packages/io/src/runner.ts`). */
export const StartedRun = z.object({ id: RunId, profileId: ProfileId, seed: Seed }).strict();
export type StartedRun = z.infer<typeof StartedRun>;

/** io's 202 body: one started run per seed × persona, seed-major. */
const StartedRuns = z.object({ runs: StartedRun.array() }).strict();

/**
 * `POST /api/runs` with `{ taskId, profileIds, seeds }`. io's 202 parses `{ runs: StartedRun[] }`;
 * a non-OK answer rejects with io's `error` text (a 404 names the unknown task or profile).
 */
export async function startRuns(request: {
  taskId: TaskId;
  profileIds: ProfileId[];
  seeds: Seed[];
}): Promise<StartedRun[]> {
  return (
    await parseResponse(await postJson("/api/runs", request), StartedRuns, "a list of started runs")
  ).runs;
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
