/**
 * The axe-core scanner (`docs/specs/2026-10-06-s4-06-axe-sidecar.md` §4): one target-app page at
 * one set of app parameters, opened on desktop the way the preview's measurement opens it
 * (`live-measure.ts`), and scanned with axe-core against the WCAG 2.2 A and AA tags. `axeLookup`
 * (`axe.ts`) stores what it returns.
 *
 * It stays out of io's barrel, as `live-measure.ts` and `chromium.ts` do: it loads agent's runtime
 * and Playwright. Outside its tests, `server.ts` and the `analyse` CLI are its only importers.
 * axe-core itself loads on the first scan only, so a server that never scans never loads it.
 */
import type { AxeBuilder } from "@axe-core/playwright";
import { startUrlFor, TargetAppParams } from "@wayford/agent";
import { AXE_WCAG_TAGS, AxeScan, AxeUrl, type AxeViolation, WayfordError } from "@wayford/core";
import { serveTargetApp, TARGET_APP_PATHS, type TargetApp } from "@wayford/filter/serve-target-app";
import { type Browser, chromium, errors, type Page } from "playwright";
import { z } from "zod";
import type { AxeScanFn } from "./axe.js";
import { type SharedBrowser, sharedBrowser } from "./chromium.js";
import { firstLine, withOwnContext } from "./live-measure.js";

/**
 * How long a whole scan may take on Node's clock: the page's load and fonts, then axe-core's run,
 * which takes a few seconds on a target-app page.
 */
const SCAN_TIMEOUT_MS = 30_000;

/** How long a loaded page may take to have its styles applied before it counts as unsettled. */
const STYLED_TIMEOUT_MS = 3000;

/**
 * In the page: at least one stylesheet, and every linked one loaded. The app's CSS comes from its
 * module script, as a `<link>` in a build and as an injected `<style>` under `pnpm dev`.
 */
const STYLED_SOURCE = `document.styleSheets.length > 0 &&
  [...document.querySelectorAll('link[rel="stylesheet"]')].every((link) => link.sheet !== null)`;

type AxeResults = Awaited<ReturnType<AxeBuilder["analyze"]>>;

/**
 * Scans `url`, an `AxeUrl`, on `origin` with a context of its own on the shared browser, emulating
 * desktop, closed when the scan ends or runs out of time. The URL is checked before anything opens:
 * a path outside `TARGET_APP_PATHS`, or a query that is not the app's three parameters spelled as
 * `startUrlFor` spells them, is `invalid_axe_url`. Every failure it knows is a `WayfordError`:
 * `target_app_unavailable`, `page_not_settled`, `font_failed` and `browser_failed` as the preview's
 * measurement has them, `page_not_settled` too when the page's styles do not apply, and
 * `axe_failed` when axe-core itself throws or answers what an `AxeScan` cannot hold.
 */
export function axeScanner({
  browser,
  origin,
}: {
  browser: SharedBrowser;
  /** The target app's origin, like `http://localhost:5174`, with no trailing slash. */
  origin: string;
}): AxeScanFn {
  return async (url) => {
    const pageUrl = targetAppUrl(origin, url);
    return withOwnContext(
      {
        browser,
        device: "desktop",
        url: pageUrl,
        path: url,
        work: "scanning",
        timeoutMs: SCAN_TIMEOUT_MS,
      },
      async (page) => {
        await styled(page, url);
        return scanOf(url, await analyze(page, url));
      },
    );
  };
}

/**
 * Waits for the page's styles, or throws `page_not_settled`. An unstyled page fails rules a styled
 * one passes, such as `target-size` on links that only their CSS makes large enough, and a scan is
 * stored until it is cleared, so a scan of one would be served as the app's. A failed scan is not
 * stored: the next request scans again.
 */
async function styled(page: Page, url: string): Promise<void> {
  await page
    .waitForFunction(STYLED_SOURCE, undefined, { timeout: STYLED_TIMEOUT_MS })
    .catch((error: unknown) => {
      // Only the deadline means an unstyled page. Anything else, such as a browser that closed,
      // is the scan's own failure, which `withOwnContext` words as `browser_failed`.
      if (!(error instanceof errors.TimeoutError)) throw error;
      throw new WayfordError(
        "page_not_settled",
        `the page at ${url} had no stylesheet applied within ${STYLED_TIMEOUT_MS} ms, so it was not scanned`,
        { cause: error },
      );
    });
}

/**
 * The page `url` names on `origin`, built by `startUrlFor` from the parameters read off `url`, so
 * a scan only ever opens a target-app page at valid parameters, and its key is spelled as a run's
 * start URL is. Anything else is `invalid_axe_url`.
 */
function targetAppUrl(origin: string, url: string): string {
  const invalid = (why: string, options?: ErrorOptions) =>
    new WayfordError(
      "invalid_axe_url",
      `${url} is no target-app page at the app's parameters: ${why}`,
      options,
    );
  if (!AxeUrl.safeParse(url).success) {
    throw invalid("an axe URL is a path and a query, with no origin and no hash");
  }
  // An `AxeUrl` holds a `?`.
  const path = url.slice(0, url.indexOf("?"));
  const query = url.slice(url.indexOf("?") + 1);
  if (!TARGET_APP_PATHS.includes(path)) {
    throw invalid(`the page is not one of ${TARGET_APP_PATHS.join(", ")}`);
  }
  // Missing, unknown, out of range or no number: refused here. A repeated parameter keeps its last
  // value, and the spelling check below refuses it.
  const params = TargetAppParams.safeParse(
    Object.fromEntries([...new URLSearchParams(query)].map(([k, v]) => [k, Number(v)])),
  );
  if (!params.success) {
    throw invalid(z.prettifyError(params.error), { cause: params.error });
  }
  const built = startUrlFor({ startUrl: `${origin}${path}` }, params.data);
  if (built !== `${origin}${url}`) {
    throw invalid(`the query is spelled ${built.slice(origin.length + path.length)}`);
  }
  return built;
}

/** axe-core's run on `page` against the WCAG A and AA tags; anything it throws is `axe_failed`. */
async function analyze(page: Page, url: string): Promise<AxeResults> {
  // Outside the try: a package that does not load is no failure of axe-core's run.
  const { AxeBuilder } = await import("@axe-core/playwright");
  try {
    return await new AxeBuilder({ page }).withTags([...AXE_WCAG_TAGS]).analyze();
  } catch (error) {
    throw new WayfordError("axe_failed", `axe-core failed on ${url}: ${firstLine(error)}`, {
      cause: error,
    });
  }
}

/**
 * The scan of `url` from axe-core's results: its violations only, each with its node count and
 * its WCAG tags, axe-core's version and the time. A result an `AxeScan` cannot hold is
 * `axe_failed`, not a bug: it is axe-core's answer, handed in.
 */
function scanOf(url: string, results: AxeResults): AxeScan {
  const violations: AxeViolation[] = results.violations.map((violation) => ({
    ruleId: violation.id,
    impact: violation.impact ?? null,
    tags: violation.tags.filter((tag) => /^wcag/.test(tag)),
    help: violation.help,
    nodes: violation.nodes.length,
  }));
  const scan = AxeScan.safeParse({
    url,
    // A timestamp only: nothing decides on it.
    scannedAt: new Date().toISOString(),
    axeVersion: results.testEngine.version,
    violations,
  });
  if (!scan.success) {
    throw new WayfordError(
      "axe_failed",
      `axe-core's result on ${url} is no AxeScan:\n${z.prettifyError(scan.error)}`,
      { cause: scan.error },
    );
  }
  return scan.data;
}

/**
 * The `analyse` CLI's scanner. The CLI walks a build it serves on a free port, so it must not
 * depend on a `pnpm dev` it did not start. Its first scan builds and serves the target app
 * (`serveTargetApp()`), and the first page it opens launches Chromium (`sharedBrowser()`). A build
 * or serve that fails is `target_app_unavailable` and is not kept, so the next scan tries again; a
 * launch that fails is `sharedBrowser`'s own `browser_launch_failed`. `close()` stops the browser
 * and the served app, whichever were started.
 */
export function servedAxeScanner(): { scan: AxeScanFn; close(): Promise<void> } {
  /** Every browser launched, so `close()` can close them: one, unless one disconnected. */
  const browsers: Browser[] = [];
  const browser = sharedBrowser(async () => {
    const launched = await chromium.launch();
    browsers.push(launched);
    return launched;
  });
  // The serve in flight or done, with its scanner, cleared when it rejects. Only its own handler
  // clears it, and a new serve starts only once it is cleared.
  let served: Promise<{ app: TargetApp; scan: AxeScanFn }> | undefined;

  return {
    scan: async (url) => {
      served ??= serveTargetApp().then(
        (app) => ({ app, scan: axeScanner({ browser, origin: app.origin }) }),
        (error: unknown) => {
          served = undefined;
          throw new WayfordError(
            "target_app_unavailable",
            `the target app could not be built and served: ${firstLine(error)}`,
            { cause: error },
          );
        },
      );
      return (await served).scan(url);
    },
    async close() {
      await Promise.all(browsers.map((launched) => launched.close()));
      const app = await served?.catch(() => undefined);
      await app?.app.close();
    },
  };
}
