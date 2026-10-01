import { Hono } from "hono";
import { healthRoute } from "./routes/health.js";
import { type RunsRouteOptions, runsRoute } from "./routes/runs.js";
import { type TasksRouteOptions, tasksRoute } from "./routes/tasks.js";

export type AppOptions = RunsRouteOptions & TasksRouteOptions;

/**
 * io's HTTP surface. Each resource lives in its own file under `routes/`; this
 * only mounts them, so tests drive the whole API through `app.request` without
 * opening a port, on a fake `Llm`. `server.ts` is the process that listens.
 */
export function createApp(options: AppOptions) {
  return new Hono()
    .route("/health", healthRoute())
    .route("/runs", runsRoute(options))
    .route("/tasks", tasksRoute(options));
}
