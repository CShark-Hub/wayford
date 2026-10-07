/**
 * The axe-core scanner (`docs/specs/2026-10-06-s4-06-axe-sidecar.md` §4): one page, a target-app
 * page at one set of app parameters or any page as given
 * (`docs/specs/2026-10-07-s4-09-io-any-url.md`, "io: axe"), opened on desktop the way the preview's
 * measurement opens it (`live-measure.ts`), and scanned with axe-core against the WCAG 2.2 A and AA
 * tags. `axeLookup` (`axe.ts`) stores what it returns, under the page's whole URL.
 *
 * It stays out of io's barrel, as `live-measure.ts` and `chromium.ts` do: it loads agent's runtime
 * and Playwright. Outside its tests, `server.ts`, the `analyse` CLI and `seed-demo-cli.ts` are its
 * only importers. axe-core itself loads on the first scan only, so a server that never scans never
 * loads it.
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
 * How long a whole scan of a target-app page may take on Node's clock: the page's load and fonts,
 * then axe-core's run, which takes a few seconds on a target-app page. Any other page gets
 * `withOwnContext`'s `EXTRA_LOAD_MS` on top, for its longer load.
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
 * Scans `page` with a context of its own on the shared browser, emulating desktop, closed when the
 * scan ends or runs out of time, into a scan keyed by `page.url`, the key it was asked by.
 *
 * The page is checked before anything opens. A target-app page whose URL is no `AxeUrl` or not on
 * `targetAppOrigin`, whose path is outside `TARGET_APP_PATHS`, or whose query is not the app's
 * three parameters spelled as `startUrlFor` spells them, is `invalid_axe_url`, and so is any other
 * page whose URL is no `AxeUrl`. A target-app page is opened at the same path and query on
 * `servedOrigin`; any other page as given.
 *
 * A page whose key is on the target app's origin, every target-app page and a `url=` that can share
 * a `page=` key, is opened strictly, as runs on the app are, and scanned once its styles apply: one
 * key, one way to fill it, so an unstyled or fallback-font scan is never stored as the app's. Any
 * other page gets the lenient load (`withOwnContext`) and no style wait, since the wait refuses a
 * page that has no stylesheet at all, which a real site may be. A stylesheet that failed to load
 * does not hold it up: Chromium gives a failed link a `sheet` too.
 *
 * Every failure it knows is a `WayfordError`: `target_app_unavailable`, `page_unavailable`,
 * `page_not_settled`, `font_failed` and `browser_failed` as the preview's measurement has them,
 * `page_not_settled` too when the page's styles do not apply, and `axe_failed` when axe-core
 * itself throws or answers what an `AxeScan` cannot hold.
 */
export function axeScanner({
  browser,
  targetAppOrigin,
  servedOrigin = targetAppOrigin,
}: {
  browser: SharedBrowser;
  /**
   * The target-app origin io is configured with, like `http://localhost:5174`, with no trailing
   * slash: a target-app page's key is on it.
   */
  targetAppOrigin: string;
  /**
   * Where the same build is served, with no trailing slash: `targetAppOrigin` when absent. The
   * `analyse` CLI serves its own on a free port, and scans it under keys on `targetAppOrigin`.
   */
  servedOrigin?: string;
}): AxeScanFn {
  const appOrigin = new URL(targetAppOrigin).origin;
  return async (page) => {
    const { served, named } = page.onTargetApp
      ? targetAppUrl(appOrigin, servedOrigin, page.url)
      : { served: anyPageUrl(page.url), named: page.url };
    // Every target-app page's key is on it, as `targetAppUrl` checked.
    const onAppOrigin = new URL(page.url).origin === appOrigin;
    return withOwnContext(
      {
        browser,
        device: "desktop",
        url: served,
        path: named,
        work: "scanning",
        timeoutMs: SCAN_TIMEOUT_MS,
        lenient: !onAppOrigin,
      },
      async (opened) => {
        if (onAppOrigin) await styled(opened, named);
        return scanOf(page.url, await analyze(opened, named));
      },
    );
  };
}

/**
 * Waits for the page's styles, or throws `page_not_settled`, naming the page as `named`. An
 * unstyled page fails rules a styled one passes, such as `target-size` on links that only their CSS
 * makes large enough, and a scan is stored until it is cleared, so a scan of one would be served as
 * the app's. A failed scan is not stored: the next request scans again.
 */
async function styled(page: Page, named: string): Promise<void> {
  await page
    .waitForFunction(STYLED_SOURCE, undefined, { timeout: STYLED_TIMEOUT_MS })
    .catch((error: unknown) => {
      // Only the deadline means an unstyled page. Anything else, such as a browser that closed,
      // is the scan's own failure, which `withOwnContext` words as `browser_failed`.
      if (!(error instanceof errors.TimeoutError)) throw error;
      throw new WayfordError(
        "page_not_settled",
        `the page at ${named} had no stylesheet applied within ${STYLED_TIMEOUT_MS} ms, so it was not scanned`,
        { cause: error },
      );
    });
}

/** Why `url` is no `AxeUrl`, in core's words, or `undefined` when it is one. */
function notAnAxeUrl(url: string): string | undefined {
  return AxeUrl.safeParse(url).error?.issues[0]?.message;
}

/** `url`, any page's, once checked as an `AxeUrl`; anything else is `invalid_axe_url`. */
function anyPageUrl(url: string): string {
  const why = notAnAxeUrl(url);
  if (why !== undefined) {
    throw new WayfordError("invalid_axe_url", `${url} is no page to scan: ${why}`);
  }
  return url;
}

/**
 * The target-app page `url` names, checked, as `served`, the URL to open on `servedOrigin`, and
 * `named`, its path and query, as the messages name a target-app page. Both are built by
 * `startUrlFor` from the parameters read off `url`, so a scan only ever opens a target-app page at
 * valid parameters, and its key is spelled as a run's start URL on `appOrigin`, the target app's,
 * is. Anything else is `invalid_axe_url`.
 */
function targetAppUrl(
  appOrigin: string,
  servedOrigin: string,
  url: string,
): { served: string; named: string } {
  const invalid = (why: string, options?: ErrorOptions) =>
    new WayfordError(
      "invalid_axe_url",
      `${url} is no target-app page at the app's parameters: ${why}`,
      options,
    );
  const why = notAnAxeUrl(url);
  if (why !== undefined) throw invalid(why);
  const page = new URL(url);
  if (page.origin !== appOrigin) {
    throw invalid(`the page is not on the target app at ${appOrigin}`);
  }
  const path = page.pathname;
  if (!TARGET_APP_PATHS.includes(path)) {
    throw invalid(`the page is not one of ${TARGET_APP_PATHS.join(", ")}`);
  }
  if (page.hash !== "") throw invalid("a target-app page has no hash");
  // Missing, unknown, out of range or no number: refused here. A repeated parameter keeps its last
  // value, and the spelling check below refuses it.
  const params = TargetAppParams.safeParse(
    Object.fromEntries([...page.searchParams].map(([k, v]) => [k, Number(v)])),
  );
  if (!params.success) {
    throw invalid(z.prettifyError(params.error), { cause: params.error });
  }
  const built = startUrlFor({ startUrl: `${appOrigin}${path}` }, params.data);
  if (built !== url) {
    throw invalid(`the query is spelled ${new URL(built).search}`);
  }
  return {
    served: startUrlFor({ startUrl: `${servedOrigin}${path}` }, params.data),
    named: `${path}${page.search}`,
  };
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
 * depend on a `pnpm dev` it did not start. Its first target-app scan builds and serves the target
 * app (`serveTargetApp()`) and scans the app's pages there, under keys on `targetAppOrigin`, the
 * origin the runs it reads were started on. Any other page is scanned as given, on the same
 * browser, with nothing served. The first page it opens launches Chromium (`sharedBrowser()`). A
 * build or serve that fails is `target_app_unavailable` and is not kept, so the next target-app scan
 * tries again; a launch that fails is `sharedBrowser`'s own `browser_launch_failed`. `close()`
 * stops the browser and the served app, whichever were started.
 */
export function servedAxeScanner(targetAppOrigin: string): {
  scan: AxeScanFn;
  close(): Promise<void>;
} {
  /** Every browser launched, so `close()` can close them: one, unless one disconnected. */
  const browsers: Browser[] = [];
  const browser = sharedBrowser(async () => {
    const launched = await chromium.launch();
    browsers.push(launched);
    return launched;
  });
  /** Any page off the target app, which needs nothing served. */
  const anyPage = axeScanner({ browser, targetAppOrigin });
  // The serve in flight or done, with its scanner, cleared when it rejects. Only its own handler
  // clears it, and a new serve starts only once it is cleared.
  let served: Promise<{ app: TargetApp; scan: AxeScanFn }> | undefined;

  return {
    scan: async (page) => {
      if (!page.onTargetApp) return anyPage(page);
      served ??= serveTargetApp().then(
        (app) => ({
          app,
          scan: axeScanner({ browser, targetAppOrigin, servedOrigin: app.origin }),
        }),
        (error: unknown) => {
          served = undefined;
          throw new WayfordError(
            "target_app_unavailable",
            `the target app could not be built and served: ${firstLine(error)}`,
            { cause: error },
          );
        },
      );
      return (await served).scan(page);
    },
    async close() {
      await Promise.all(browsers.map((launched) => launched.close()));
      const app = await served?.catch(() => undefined);
      await app?.app.close();
    },
  };
}
