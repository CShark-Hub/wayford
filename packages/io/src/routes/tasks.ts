/**
 * `/tasks`: a user story in, a `Task` out, through the Extractor, and stored; then the stored
 * tasks listed, and Scout on one. The list comes from the database only: core's fixture tasks are
 * not seeded (`docs/specs/2026-10-02-s4-03-runs-api.md`, decision log).
 *
 * `POST /`:
 * - 201 `{ task, rewritten }`: the goal passed the task check, and the task is stored.
 * - 400 `{ error }`: the body is not a `TaskRequest`, and no model is asked.
 * - 415 `{ error }`, from `createApp`: the body is not `application/json`, and no model is asked.
 *   413 likewise for a body over `MAX_BODY_BYTES`.
 * - 422 `{ error, goal, survived }`: the goal still failed the check after the repair round.
 *   Nothing is stored.
 * - 502 `{ error }`: the model call failed.
 *
 * `GET /`: every stored task, by id, as `Task[]`.
 *
 * `POST /:id/scout`, with the body `{}`, starts Scout on a stored task or a core fixture task
 * (`docs/specs/2026-10-07-s4-10-scout-sweep-any-task.md`, "io: routes/tasks.ts"):
 * - 202 `ScoutJob`: Scout started, or the one already running on that task.
 * - 400 `{ error }`: `:id` is not a `TaskId`, or the body is not `{}`.
 * - 404 `{ error }`: no task has that id. Nothing starts.
 * - 415 `{ error }`, from `createApp`: the body is not `application/json`, or 413 for one over
 *   `MAX_BODY_BYTES`.
 *
 * `GET /:id/scout`:
 * - 202 `ScoutJob`: Scout runs on that task.
 * - 502 `{ error }`: this process's last Scout on that task failed, until the next `POST`.
 * - 200 `GroundTruth`: the task's ground-truth file, whichever process or CLI wrote it.
 * - 404 `{ error }`: none was started, and there is no file.
 * - 400 `{ error }` for an `:id` that is not a `TaskId`; 500 from `onError` for a file that is no
 *   ground truth (`invalid_ground_truth`), as `POST /reports` answers it.
 */
import { zValidator } from "@hono/zod-validator";
import type { Llm } from "@wayford/agent";
import { TaskId, WayfordError } from "@wayford/core";
import { Hono } from "hono";
import { z } from "zod";
import { readGroundTruth } from "../analyst.js";
import type { Db } from "../db/database.js";
import { listTasks, loadTaskOrFixture, saveTask } from "../db/tasks.js";
import { extractTask, TaskRequest } from "../extractor.js";
import type { ScoutJobs } from "../scout-jobs.js";

/**
 * The Extractor's model, the database the tasks are stored in, the Scout jobs, the folder they
 * write ground truth to, and where the target app is served: for a task that starts there, the
 * Extractor also refuses a goal naming a control on the app's routes.
 */
type TasksRouteOptions = {
  llm: Llm;
  db: Db;
  scouts: ScoutJobs;
  groundTruthDir: string;
  targetAppOrigin: string;
};

/** The path's `:id`, checked before anything is read with it: 400 when it is no `TaskId`. */
const taskParams = zValidator("param", z.object({ id: TaskId }), (result, c) => {
  if (!result.success) return c.json({ error: z.prettifyError(result.error) }, 400);
});

/** The body of `POST /:id/scout`: nothing, strictly, so a typo is seen. */
const ScoutRequest = z.object({}).strict();

/** The routes above. Only an accepted task is stored, after the model has answered. */
export function tasksRoute({
  llm,
  db,
  scouts,
  groundTruthDir,
  targetAppOrigin,
}: TasksRouteOptions) {
  return new Hono()
    .get("/", async (c) => c.json(await listTasks(db)))
    .post(
      "/:id/scout",
      taskParams,
      zValidator("json", ScoutRequest, (result, c) => {
        if (!result.success) return c.json({ error: z.prettifyError(result.error) }, 400);
      }),
      async (c) => {
        const { id } = c.req.valid("param");
        const task = await loadTaskOrFixture(db, id);
        if (task === undefined) return c.json({ error: `no task ${id}` }, 404);
        return c.json(scouts.start(task), 202);
      },
    )
    .get("/:id/scout", taskParams, async (c) => {
      const { id } = c.req.valid("param");
      const job = scouts.job(id);
      if (job?.status === "running") return c.json(job, 202);
      if (job?.status === "failed") return c.json({ error: job.error }, 502);
      const truth = await readGroundTruth(groundTruthDir, id);
      return truth === undefined
        ? c.json({ error: `no Scout of ${id}: none started, and no ground truth` }, 404)
        : c.json(truth);
    })
    .post(
      "/",
      zValidator("json", TaskRequest, (result, c) => {
        if (!result.success) return c.json({ error: z.prettifyError(result.error) }, 400);
      }),
      async (c) => {
        try {
          const extraction = await extractTask(llm, c.req.valid("json"), targetAppOrigin);
          if (extraction.ok) {
            await saveTask(db, extraction.task);
            return c.json({ task: extraction.task, rewritten: extraction.rewritten }, 201);
          }
          const { error, goal, survived } = extraction;
          return c.json({ error, goal, survived }, 422);
        } catch (error) {
          // Branched on the code, as `WayfordError` asks: every failed model call is an `llm_` one.
          if (error instanceof WayfordError && error.code.startsWith("llm_")) {
            return c.json({ error: `${error.code}: ${error.message}` }, 502);
          }
          throw error;
        }
      },
    );
}
