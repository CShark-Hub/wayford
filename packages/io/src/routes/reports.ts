/**
 * `/reports`: a task's report, built by the Analyst over the task's stored runs and stored, then
 * read back (`docs/specs/2026-10-05-s4-04-analyst.md`, "io: storage, routes, CLI"). The latest
 * report per task is the one kept; history is out of scope.
 *
 * `POST /:taskId`, with the body `{ backend? }`, `jev` when absent:
 * - 201 `Report`: the report over the latest run per persona and seed on `backend`, stored in place
 *   of the task's report before it.
 * - 400 `{ error }`: `:taskId` is not a `TaskId`, or the body is not `{ backend? }`. No model is
 *   asked.
 * - 404 `{ error }`: no such task, or no run of it on `backend`; the error names the other
 *   backend's count. No model is asked.
 * - 415 `{ error }`, from `createApp`: the body is not `application/json`. No model is asked.
 * - 502 `{ error }`: the Analyst call failed. Nothing is stored.
 * - 500, from `createApp`'s `onError`, logged: bad stored data, such as a ground-truth file that is
 *   no `GroundTruth` (`invalid_ground_truth`). Nothing is stored.
 *
 * `GET /:taskId`: 200 with the stored `Report`; 400 `{ error }` for a `:taskId` that is not a
 * `TaskId`; 404 `{ error }` when none is stored.
 *
 * Agent is imported as types only, and the route facts are handed in (`AnalystDeps.routes`), so
 * this route loads neither agent's runtime nor Playwright (s4-03, "The barrel").
 */
import { zValidator } from "@hono/zod-validator";
import type { ActorBackendName } from "@wayford/agent";
import { ReportBackend, TaskId, WayfordError } from "@wayford/core";
import { Hono } from "hono";
import { z } from "zod";
import { type AnalystDeps, analyseAndStore } from "../analyst.js";
import { loadReport } from "../db/reports.js";

/**
 * `true` exactly when agent's `ActorBackendName` and core's `ReportBackend` hold the same names.
 * Core spells its enum by hand, since it imports nothing from the workspace, and agent's value
 * would load its runtime into io's barrel, so the two are tied here by type alone: a name added to
 * or dropped from either one fails to compile.
 */
type SameBackends = [ActorBackendName] extends [ReportBackend]
  ? [ReportBackend] extends [ActorBackendName]
    ? true
    : false
  : false;
const _sameBackends: SameBackends = true;

/** The body of `POST`: the backend, Jev when absent, as `seed:demo` runs on Jev. */
const ReportRequest = z.object({ backend: ReportBackend.default("jev") }).strict();

/** The path's `:taskId`, checked before anything is read with it: 400 when it is no `TaskId`. */
const reportParams = zValidator("param", z.object({ taskId: TaskId }), (result, c) => {
  if (!result.success) return c.json({ error: z.prettifyError(result.error) }, 400);
});

/** The routes above. Only a report built over a successful Analyst call is stored. */
export function reportsRoute(deps: AnalystDeps) {
  return new Hono()
    .post(
      "/:taskId",
      reportParams,
      zValidator("json", ReportRequest, (result, c) => {
        if (!result.success) return c.json({ error: z.prettifyError(result.error) }, 400);
      }),
      async (c) => {
        const { taskId } = c.req.valid("param");
        const { backend } = c.req.valid("json");
        try {
          const analysis = await analyseAndStore(deps, taskId, backend);
          if (!analysis.ok) return c.json({ error: analysis.error }, 404);
          return c.json(analysis.report, 201);
        } catch (error) {
          // Branched on the code, as `WayfordError` asks: every failed model call is an `llm_` one.
          if (error instanceof WayfordError && error.code.startsWith("llm_")) {
            return c.json({ error: `${error.code}: ${error.message}` }, 502);
          }
          throw error;
        }
      },
    )
    .get("/:taskId", reportParams, async (c) => {
      const { taskId } = c.req.valid("param");
      const report = await loadReport(deps.db, taskId);
      return report === undefined
        ? c.json({ error: `no report on ${taskId}` }, 404)
        : c.json(report);
    });
}
