/**
 * The web's way to Scout over io (`POST` and `GET /tasks/:id/scout`, whose answers
 * `packages/io/src/routes/tasks.ts` lists), through the dev server's `/api` proxy: the Target
 * screen starts Scout on a goal and reads its ground truth back. A refusal reads as `api/runs.ts`
 * words it, `io answered <status>: <error>`, since its helpers do the reading.
 *
 * io's Scout is a job: `POST` starts it and answers at once, and `GET` answers how far it got. io's
 * 202 body, the job, carries nothing the screen draws, so it is not parsed.
 */
import { GroundTruth, type TaskId } from "@wayford/core";
import { ioReason, parseResponse, postJson, refusal } from "./runs.js";

/** What io answers about a task's Scout. */
export type ScoutAnswer =
  /** 200: the task's ground truth, whichever process or CLI wrote it. */
  | { status: "done"; truth: GroundTruth }
  /** 202: Scout walks the goal now. */
  | { status: "running" }
  /** 404: none was started, and there is no ground truth. */
  | { status: "none" }
  /** 502: this io's last Scout on the task failed, with io's reason, until the next start. */
  | { status: "failed"; message: string };

/** A task's Scout path under io's `/tasks`, its id encoded. */
function scoutPath(taskId: TaskId): string {
  return `/api/tasks/${encodeURIComponent(taskId)}/scout`;
}

/**
 * `GET /api/tasks/:id/scout`, read into a `ScoutAnswer`; a 200 parses with `GroundTruth`. Any other
 * status rejects, as does a 502 with no `{ error }` body: that is Vite's proxy while io is down,
 * not a Scout that failed.
 */
export async function readScout(taskId: TaskId): Promise<ScoutAnswer> {
  const response = await fetch(scoutPath(taskId));
  if (response.status === 200) {
    const truth = await parseResponse(response, GroundTruth, "a ground truth");
    return { status: "done", truth };
  }
  if (response.status === 202) return { status: "running" };
  if (response.status === 404) return { status: "none" };
  if (response.status === 502) {
    const reason = await ioReason(response);
    if (reason !== undefined) return { status: "failed", message: reason };
  }
  throw await refusal(response);
}

/**
 * `POST /api/tasks/:id/scout` with the body `{}`, which io requires. io's 202 is Scout running, a
 * new one or the one already walking that task; anything else rejects, a 404 for an unknown task
 * included.
 */
export async function startScout(taskId: TaskId): Promise<ScoutAnswer & { status: "running" }> {
  const response = await postJson(scoutPath(taskId), {});
  if (response.status === 202) return { status: "running" };
  throw await refusal(response);
}
