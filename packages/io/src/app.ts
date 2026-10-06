import type { Llm } from "@wayford/agent";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { RouteFacts } from "./analyst-runs.js";
import { healthRoute } from "./routes/health.js";
import { type MeasureFn, measureRoute } from "./routes/measure.js";
import { profilesRoute } from "./routes/profiles.js";
import { reportsRoute } from "./routes/reports.js";
import { runsRoute } from "./routes/runs.js";
import { tasksRoute } from "./routes/tasks.js";
import { createRunner, type RunnerOptions } from "./runner.js";

/**
 * What the app runs on: the runner's options, the one `Llm` the Extractor and the Analyst are
 * called on, how a target-app page is measured for the preview, what the Analyst reads besides the
 * stored runs, and the pause between two replayed events of the fixture run (300 ms when absent).
 */
export type AppOptions = RunnerOptions & {
  llm: Llm;
  measure: MeasureFn;
  /**
   * The route table's facts per persona, for a report's route-open numbers and closures. Computed
   * outside the app (`analyst-routes.ts`, from `server.ts`), since the walk behind them loads
   * Playwright.
   */
  routes: RouteFacts;
  /** Where Scout writes `<task id>.json`. A missing file is a report with no ground truth. */
  groundTruthDir: string;
  /** Jev's pinned model id, which marks a stored run as a Jev run (`backendOf`). */
  jevModel: string;
  replaySpacingMs?: number;
};

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
    .route("/measure", measureRoute(options))
    .route("/profiles", profilesRoute())
    .route("/reports", reportsRoute(options))
    .route("/runs", runsRoute({ ...options, runner }))
    .route("/tasks", tasksRoute(options))
    .onError((error, c) => {
      if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
      options.logger.error({ err: error }, "a request failed");
      return c.json({ error: "internal error" }, 500);
    });
}
