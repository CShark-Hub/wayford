/**
 * `POST /tasks`: a user story in, a `Task` out, through the Extractor. Nothing is stored yet.
 *
 * - 201 `{ task, rewritten }`: the goal passed the task check.
 * - 400 `{ error }`: the body is not a `TaskRequest`, and no model is asked.
 * - 422 `{ error, goal, survived }`: the goal still failed the check after the repair round.
 * - 502 `{ error }`: the model call failed.
 */
import { zValidator } from "@hono/zod-validator";
import type { Llm } from "@wayford/agent";
import { WayfordError } from "@wayford/core";
import { Hono } from "hono";
import { z } from "zod";
import { extractTask, TaskRequest } from "../extractor.js";

export type TasksRouteOptions = { llm: Llm };

export function tasksRoute({ llm }: TasksRouteOptions) {
  return new Hono().post(
    "/",
    zValidator("json", TaskRequest, (result, c) => {
      if (!result.success) return c.json({ error: z.prettifyError(result.error) }, 400);
    }),
    async (c) => {
      try {
        const extraction = await extractTask(llm, c.req.valid("json"));
        if (extraction.ok) {
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
