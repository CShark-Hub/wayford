/**
 * A target-app page measured live, for the preview (s3-05): the page at the app's default
 * parameters, opened on a persona's device and measured by the collector the Actor uses, so the
 * preview perceives the page a run starts on (`docs/PLAN.md` F2). `routes/measure.ts` keeps what
 * this returns.
 *
 * It stays out of io's barrel, as `chromium.ts` does: it loads agent's runtime and Playwright.
 * Outside its tests, `server.ts` is its only importer.
 */
import { deviceContextOptions, startUrlFor, TARGET_APP_DEFAULTS } from "@wayford/agent";
import { type PageMeasurement, WayfordError } from "@wayford/core";
import { collect } from "@wayford/filter";
import type { Page } from "playwright";
import type { SharedBrowser } from "./chromium.js";
import type { MeasureFn } from "./routes/measure.js";

/** How long the target app may take to load a page before it counts as down. */
const GOTO_TIMEOUT_MS = 10_000;

/**
 * How long the page's fonts may take: the deadline agent's `settle` gives them,
 * `font-display: block`'s period.
 */
const FONTS_TIMEOUT_MS = 3000;

/**
 * How long a whole measurement may take on Node's clock. A page whose main thread never answers
 * never reaches its own deadlines, and the route would keep its promise until io restarts.
 */
const MEASURE_TIMEOUT_MS = 15_000;

/**
 * Measures with a context of its own on the shared browser, closed when the measurement ends or
 * runs out of time. Every failure it knows is a `WayfordError`, which the route answers with a 502:
 * `target_app_unavailable` when the page does not load, `page_not_settled` when it takes too long,
 * `font_failed` when a font face did not load, `collect`'s own `invalid_measurement`, and
 * `browser_failed` for anything Chromium itself throws.
 */
export function liveMeasure({
  browser,
  origin,
}: {
  browser: SharedBrowser;
  /** The target app's origin, like `http://localhost:5174`, with no trailing slash. */
  origin: string;
}): MeasureFn {
  return async (device, path) => {
    const options = deviceContextOptions(device);
    const context = await browser()
      .then((chromium) => chromium.newContext(options))
      .catch((error: unknown) => {
        throw failed(error, path);
      });
    let timer: NodeJS.Timeout | undefined;
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const message = `${path} on ${device} was not measured within ${MEASURE_TIMEOUT_MS} ms`;
        reject(new WayfordError("page_not_settled", message));
      }, MEASURE_TIMEOUT_MS);
    });
    try {
      // The page opens inside the race, so the deadline has a handler from its start: one that
      // expired with nothing listening would end io as an unhandled rejection.
      const measured = context
        .newPage()
        .then((page) => measure(page, options.isMobile, origin, path));
      return await Promise.race([measured, expired]);
    } catch (error) {
      throw failed(error, path);
    } finally {
      clearTimeout(timer);
      // Closing it ends whatever the measurement still waits on, once the race has dropped it.
      await context.close().catch(() => undefined);
    }
  };
}

/**
 * `error` as the route can answer it: a `WayfordError` as it is, and anything else, Playwright's
 * own failures such as a browser that crashed or closed, as `browser_failed`.
 */
function failed(error: unknown, path: string): WayfordError {
  if (error instanceof WayfordError) return error;
  const reason = error instanceof Error ? error.message.split("\n", 1)[0] : String(error);
  return new WayfordError("browser_failed", `Chromium failed while measuring ${path}: ${reason}`, {
    cause: error,
  });
}

/**
 * The page loaded at the app's defaults, its fonts awaited, then collected. The target app runs
 * no animation, so for a fresh load this is what agent's `settle` waits for; `settle` is not on
 * agent's public surface (`docs/specs/2026-10-03-s3-05-live-preview.md`, decision log).
 */
async function measure(
  page: Page,
  isMobile: boolean,
  origin: string,
  path: string,
): Promise<PageMeasurement> {
  const url = startUrlFor({ startUrl: `${origin}${path}` }, TARGET_APP_DEFAULTS);
  const response = await page.goto(url, { timeout: GOTO_TIMEOUT_MS }).catch((error: unknown) => {
    // Playwright's first line names the URL already, as "page.goto: net::… at <url>".
    const reason = error instanceof Error ? error.message.split("\n", 1)[0] : String(error);
    throw new WayfordError(
      "target_app_unavailable",
      `the target app did not load ${path}: ${reason}`,
      {
        cause: error,
      },
    );
  });
  if (response === null || !response.ok()) {
    const status = response?.status() ?? "with no response";
    throw new WayfordError("target_app_unavailable", `the target app answered ${status} at ${url}`);
  }
  const failed = await page.evaluate<string[] | null>(FONTS_SOURCE);
  if (failed === null) {
    throw new WayfordError(
      "page_not_settled",
      `the page at ${page.url()} did not settle within ${FONTS_TIMEOUT_MS} ms: its fonts are still loading`,
    );
  }
  if (failed.length > 0) {
    const families = failed.map((family) => JSON.stringify(family)).join(", ");
    throw new WayfordError(
      "font_failed",
      `the page at ${page.url()} could not load ${families}; its text would be measured in a fallback font`,
    );
  }
  return collect(page, { isMobile });
}

/**
 * In the page: the families of the font faces that failed once every face has loaded, or `null`
 * at the deadline. `document.fonts.ready` resolves for a failed face too, so only each face's own
 * status tells, as in agent's `settle`.
 */
const FONTS_SOURCE = `Promise.race([
  document.fonts.ready.then(() => {
    const failed = new Set();
    document.fonts.forEach((face) => {
      if (face.status === "error") failed.add(face.family);
    });
    return [...failed];
  }),
  new Promise((resolve) => setTimeout(() => resolve(null), ${FONTS_TIMEOUT_MS})),
])`;
