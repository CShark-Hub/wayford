import type { Llm } from "@wayford/agent";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { RouteFacts } from "./analyst-runs.js";
import { type AxeScanFn, axeLookup } from "./axe.js";
import { axeRoute } from "./routes/axe.js";
import { healthRoute } from "./routes/health.js";
import { type IllustrateFn, illustrationRoute } from "./routes/illustration.js";
import { type MeasureFn, measureRoute } from "./routes/measure.js";
import { profilesRoute } from "./routes/profiles.js";
import { reportsRoute } from "./routes/reports.js";
import { runsRoute } from "./routes/runs.js";
import { sweepsRoute } from "./routes/sweeps.js";
import { tasksRoute } from "./routes/tasks.js";
import { createRunner, type RunnerOptions } from "./runner.js";

/**
 * What the app runs on: the hosts it answers to, the runner's options, the one `Llm` the Extractor
 * and the Analyst are called on, how a page is measured for the preview and scanned with axe-core,
 * how the target app is pictured, what the Analyst reads besides the stored runs, and the pause
 * between two replayed events of the fixture run (300 ms when absent).
 */
export type AppOptions = RunnerOptions & {
  /**
   * The `Host` values io answers to, lowercase, each with its port unless it is the scheme's
   * default: `localhost:3000`, `127.0.0.1:3000`, `[::1]:3000` from `server.ts`. A request naming
   * any other host is refused (`createApp`).
   */
  hosts: readonly string[];
  llm: Llm;
  measure: MeasureFn;
  /**
   * Pictures the target app's `/deliveries` under a persona's vision emulation, for the Lens's
   * Illustration view. Handed in, like `measure`, since the capture loads Playwright: `server.ts`
   * wires it.
   */
  illustrate: IllustrateFn;
  /**
   * Scans one page with axe-core, a target-app page or any page, on a miss of the stored scans.
   * Handed in, like `measure`, since the scanner loads Playwright: `server.ts` wires it.
   */
  scanAxe: AxeScanFn;
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

/** The `Sec-Fetch-Site` values io refuses: a request a page on another site sent. */
const OTHER_SITES = ["cross-site", "same-site"];

/**
 * io's HTTP surface. Each resource lives in its own file under `routes/`; this builds the app's
 * one `Runner`, so its five slots hold for every request, and its one axe-core lookup, which `/axe`
 * and `/reports` share, so requests for one page share one scan, and mounts the routes. Tests
 * drive the whole API through `app.request` without opening a port, on a fake `Llm` and a fake
 * run. `server.ts` is the process that listens.
 *
 * Before anything else, a request is a 403 when it names a host outside `hosts`, in its `Host`
 * header or its URL, or when its `Sec-Fetch-Site` is `cross-site` or `same-site` (ADR 0003, D7).
 * io's Chromium opens pages we do not control on the same machine, and such a page could reach io
 * by DNS rebinding, whose requests name the page's own host, or fire a `GET` at it from an `<img>`.
 * Both hosts are read since `@hono/node-server` takes an absolute URL on the request line over the
 * header. A page on another `localhost` port, such as an app under test on `localhost:8080`, is
 * `same-site` to io, not `cross-site`. Nothing of ours sends either: the web UI calls io through
 * its dev proxy, `same-origin`, and `curl` sends no `Sec-Fetch-Site` at all.
 *
 * A navigation the browser started on its own, `Sec-Fetch-Site: none` with `Sec-Fetch-Mode:
 * navigate`, is a 403 too. That is what io's own Chromium sends when it opens a page by `goto`, and
 * a page that redirects into io keeps it: a site under test that answers a Lens `url=`, a run's
 * start URL or the Analyst's scan with a redirect to `/measure?url=…` would otherwise have io call
 * itself, hop after hop (s4-09 branch review). It costs a person typing io's address into a
 * browser; the web UI's own links are `same-origin`.
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
  const axe = axeLookup({ db: options.db, scan: options.scanAxe });
  return new Hono()
    .use(async (c, next) => {
      const named = [c.req.header("host"), new URL(c.req.url).host];
      if (named.some((host) => host !== undefined && !options.hosts.includes(host.toLowerCase()))) {
        return c.json({ error: "io answers requests to its own host only" }, 403);
      }
      const site = c.req.header("sec-fetch-site")?.toLowerCase() ?? "";
      if (OTHER_SITES.includes(site)) {
        return c.json({ error: "io refuses requests sent from another site" }, 403);
      }
      if (site === "none" && c.req.header("sec-fetch-mode")?.toLowerCase() === "navigate") {
        return c.json({ error: "io refuses a page the browser opened on its own" }, 403);
      }
      await next();
    })
    .use(async (c, next) => {
      if (c.req.method === "POST" && !JSON_BODY.test(c.req.header("content-type") ?? "")) {
        return c.json({ error: "send the body as application/json" }, 415);
      }
      await next();
    })
    .route("/axe", axeRoute({ ...options, axe }))
    .route("/health", healthRoute())
    .route("/illustration", illustrationRoute(options))
    .route("/measure", measureRoute(options))
    .route("/profiles", profilesRoute())
    .route("/reports", reportsRoute({ ...options, axe }))
    .route("/runs", runsRoute({ ...options, runner }))
    .route("/sweeps", sweepsRoute(options))
    .route("/tasks", tasksRoute(options))
    .onError((error, c) => {
      if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
      options.logger.error({ err: error }, "a request failed");
      return c.json({ error: "internal error" }, 500);
    });
}
