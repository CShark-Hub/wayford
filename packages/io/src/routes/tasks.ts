/**
 * `/tasks`: a user story in, a `Task` out, through the Extractor, and stored; then the stored
 * tasks listed. Tasks come from the database only: core's fixture tasks are not seeded
 * (`docs/specs/2026-10-02-s4-03-runs-api.md`, decision log).
 *
 * `POST /`:
 * - 201 `{ task, rewritten }`: the goal passed the task check, and the task is stored.
 * - 400 `{ error }`: the body is not a `TaskRequest`, and no model is asked.
 * - 415 `{ error }`, from `createApp`: the body is not `application/json`, and no model is asked.
 * - 422 `{ error, goal, survived }`: the goal still failed the check after the repair round.
 *   Nothing is stored.
 * - 502 `{ error }`: the model call failed.
 *
 * `GET /`: every stored task, by id, as `Task[]`.
 */
import { zValidator } from "@hono/zod-validator";
import type { Llm } from "@wayford/agent";
import { WayfordError } from "@wayford/core";
import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/database.js";
import { listTasks, saveTask } from "../db/tasks.js";
import { extractTask, TaskRequest } from "../extractor.js";

/** The Extractor's model, and the database the tasks are stored in. */
type TasksRouteOptions = { llm: Llm; db: Db };

/** The routes above. Only an accepted task is stored, after the model has answered. */
export function tasksRoute({ llm, db }: TasksRouteOptions) {
  return new Hono()
    .get("/", async (c) => c.json(await listTasks(db)))
    .post(
      "/",
      zValidator("json", TaskRequest, (result, c) => {
        if (!result.success) return c.json({ error: z.prettifyError(result.error) }, 400);
      }),
      async (c) => {
        try {
          const extraction = await extractTask(llm, c.req.valid("json"));
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
