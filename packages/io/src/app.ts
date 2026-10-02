import type { Llm } from "@wayford/agent";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { healthRoute } from "./routes/health.js";
import { profilesRoute } from "./routes/profiles.js";
import { runsRoute } from "./routes/runs.js";
import { tasksRoute } from "./routes/tasks.js";
import { createRunner, type RunnerOptions } from "./runner.js";

/**
 * What the app runs on: the runner's options, the Extractor's `Llm`, and the pause between two
 * replayed events of the fixture run (300 ms when absent).
 */
export type AppOptions = RunnerOptions & { llm: Llm; replaySpacingMs?: number };

/** `application/json`, with or without parameters such as `charset`. */
const JSON_BODY = /^application\/json\s*(;|$)/i;

/**
 * io's HTTP surface. Each resource lives in its own file under `routes/`; this builds the app's
 * one `Runner`, so its five slots hold for every request, and mounts the routes. Tests drive the
 * whole API through `app.request` without opening a port, on a fake `Llm` and a fake run.
 * `server.ts` is the process that listens.
 *
 * A `POST` whose body is not `application/json` is a 415. A page under test can send `text/plain`
 * to `localhost` without a CORS preflight, and Hono's JSON validator reads such a body as `{}`, so
 * without this check only a route's required fields would keep that page from starting runs.
 *
 * Every error answers `{ error }`, as the routes' own answers do. Hono's own 400s, such as a JSON
 * body that does not parse, keep their status and message. Anything else is a 500, logged whole.
 */
export function createApp(options: AppOptions) {
  const runner = createRunner(options);
  return new Hono()
    .use(async (c, next) => {
      if (c.req.method === "POST" && !JSON_BODY.test(c.req.header("content-type") ?? "")) {
        return c.json({ error: "send the body as application/json" }, 415);
      }
      await next();
    })
    .route("/health", healthRoute())
    .route("/profiles", profilesRoute())
    .route("/runs", runsRoute({ ...options, runner }))
    .route("/tasks", tasksRoute(options))
    .onError((error, c) => {
      if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
      options.logger.error({ err: error }, "a request failed");
      return c.json({ error: "internal error" }, 500);
    });
}
