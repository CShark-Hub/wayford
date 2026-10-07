/**
 * A page measured live, for the preview (s3-05) and the Lens on any site (s4-09): a target-app page
 * at the app's default parameters, or any page as given (`docs/adr/0003-any-target.md`, D2), opened
 * on a persona's device and measured by the collector the Actor uses, so the preview perceives the
 * page a run starts on (`docs/PLAN.md` F2). `routes/measure.ts` names the page and keeps what this
 * returns.
 *
 * Its page loading is exported for the axe-core scanner (`axe-scan.ts`, s4-06) and the Lens's
 * picture (`live-illustration.ts`, s3-06), which open a page the same way: `withOwnContext`, the
 * page loaded and settled by agent's `settle` in a context of its own on the shared browser, under
 * a deadline. A target-app page settles strictly, as runs on the app do; any other page leniently,
 * as runs off it do (D4). The caller names its work, so a failed scan's messages say "scanning",
 * never "measuring".
 *
 * It stays out of io's barrel, as `chromium.ts` does: it loads agent's runtime and Playwright.
 * Outside its tests, `server.ts`, `axe-scan.ts` and `live-illustration.ts` are its only importers.
 */
import {
  type DeviceContextOptions,
  deviceContextOptions,
  retryOnNavigation,
  settle,
} from "@wayford/agent";
import { type DeviceKind, WayfordError } from "@wayford/core";
import { collect } from "@wayford/filter";
import type { Page } from "playwright";
import type { SharedBrowser } from "./chromium.js";
import { nameOf } from "./page-ref.js";
import type { MeasureFn } from "./routes/measure.js";

/** How long the target app may take to load a page before it counts as down. */
const GOTO_TIMEOUT_MS = 10_000;

/**
 * How long any other page may take to load: Playwright's default, which a run keeps when it opens
 * its start URL (`run-context.ts`), so the Lens and axe open what the Race opens.
 */
const PAGE_GOTO_TIMEOUT_MS = 30_000;

/**
 * What a page off the target app adds to its caller's deadline: the longer load it is allowed,
 * `PAGE_GOTO_TIMEOUT_MS` in place of `GOTO_TIMEOUT_MS`, so the work after the load keeps the time
 * it has on the target app.
 */
const EXTRA_LOAD_MS = PAGE_GOTO_TIMEOUT_MS - GOTO_TIMEOUT_MS;

/**
 * How long a whole measurement of a target-app page may take on Node's clock, `EXTRA_LOAD_MS` more
 * off the app. A page whose main thread never answers never reaches its own deadlines, and the
 * route would keep its promise until io restarts.
 */
const MEASURE_TIMEOUT_MS = 15_000;

/** What a caller does with the page, as its error messages name it. */
export type PageWork = "measuring" | "scanning" | "picturing";

/** Each work as "was not …" says it. */
const DONE: Readonly<Record<PageWork, string>> = {
  measuring: "measured",
  scanning: "scanned",
  picturing: "pictured",
};

/**
 * Measures `page` with a context of its own on the shared browser, closed when the measurement
 * ends or runs out of time. A page on `targetAppOrigin`, every target-app page and a `url=` that can
 * share a `page=` key, is opened strictly, as runs on the app open it: one key, one way to fill it,
 * so the route never keeps a fallback-font measurement for a `page=`. Any other page is opened as
 * given, with the lenient load. Every failure it knows is a `WayfordError`, which the route answers
 * with a 502: `target_app_unavailable` when a page on the target app does not load and
 * `page_unavailable` when any other does not, `page_not_settled` when it takes too long,
 * `font_failed` when a font face of the target app did not load, `collect`'s own
 * `invalid_measurement`, and `browser_failed` for anything Chromium itself throws.
 */
export function liveMeasure({
  browser,
  targetAppOrigin,
}: {
  browser: SharedBrowser;
  /** The target-app origin io is configured with, like `http://localhost:5174`. */
  targetAppOrigin: string;
}): MeasureFn {
  const appOrigin = new URL(targetAppOrigin).origin;
  return async (device, page) =>
    withOwnContext(
      {
        browser,
        device,
        url: page.url,
        path: nameOf(page),
        work: "measuring",
        timeoutMs: MEASURE_TIMEOUT_MS,
        lenient: new URL(page.url).origin !== appOrigin,
      },
      (opened, options) => collect(opened, { isMobile: options.isMobile }),
    );
}

/**
 * `use` on a new page at `url`, loaded (`openPage`) and settled by agent's `settle`, in a context
 * of its own on the shared browser, emulating `device`. The context is closed when `use` ends or
 * the load, the settle and `use` run out of the deadline on Node's clock, whichever comes first:
 * `timeoutMs` on the target app, and `EXTRA_LOAD_MS` more off it. Every failure is a
 * `WayfordError`: the load's, the settle's and `use`'s own as they are, `page_not_settled` at the
 * deadline, and `browser_failed` for anything Chromium itself throws, each worded with `work`.
 *
 * Once loaded, the settle and `use` run together inside agent's `retryOnNavigation`, as a run's
 * step settles and collects on the target app or off it: a navigation that cuts them off, or that
 * commits between the two, has them run again on the new document. One that commits after they end
 * is not seen, so a page that redirects itself a while after its `load` is taken where it was.
 */
export async function withOwnContext<T>(
  {
    browser,
    device,
    url,
    path,
    work,
    timeoutMs,
    lenient = false,
  }: {
    browser: SharedBrowser;
    device: DeviceKind;
    /**
     * The page to open, the URL `goto` receives: a target-app page with the app's parameters, or
     * any page as given.
     */
    url: string;
    /** What the messages name: a target-app page's path or a scan's URL, or any page's URL. */
    path: string;
    work: PageWork;
    /** The deadline on the target app. */
    timeoutMs: number;
    /**
     * Off the target app: the page gets a run's load time and the lenient `settle`, which sets
     * aside a font face that failed and an animation that never ends (D4). Absent on the target
     * app, which loads strictly.
     */
    lenient?: boolean;
  },
  use: (page: Page, options: DeviceContextOptions) => Promise<T>,
): Promise<T> {
  const deadlineMs = lenient ? timeoutMs + EXTRA_LOAD_MS : timeoutMs;
  const options = deviceContextOptions(device);
  const context = await browser()
    .then((chromium) => chromium.newContext(options))
    .catch((error: unknown) => {
      throw failed(error, work, path);
    });
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const message = `${path} on ${device} was not ${DONE[work]} within ${deadlineMs} ms`;
      reject(new WayfordError("page_not_settled", message));
    }, deadlineMs);
  });
  try {
    // The page opens inside the race, so the deadline has a handler from its start: one that
    // expired with nothing listening would end io as an unhandled rejection.
    const used = context.newPage().then(async (page) => {
      await openPage(page, url, path, lenient);
      // Each attempt gets the whole deadline, not `retryOnNavigation`'s own 8 s, so axe-core's run
      // is not cut off; the race below ends them all.
      return retryOnNavigation(
        page,
        async () => {
          // What a lenient `settle` set aside is dropped: no run reads it, and a measurement or a
          // scan for the Lens is no run's evidence. A run's own `settle` logs it.
          await settle(page, { lenient });
          return use(page, options);
        },
        deadlineMs,
      );
    });
    return await Promise.race([used, expired]);
  } catch (error) {
    throw failed(error, work, path);
  } finally {
    clearTimeout(timer);
    // Closing it ends whatever the work still waits on, once the race has dropped it.
    await context.close().catch(() => undefined);
  }
}

/**
 * `error` as the route can answer it: a `WayfordError` as it is, and anything else, Playwright's
 * own failures such as a browser that crashed or closed, as `browser_failed`.
 */
function failed(error: unknown, work: PageWork, path: string): WayfordError {
  if (error instanceof WayfordError) return error;
  return new WayfordError(
    "browser_failed",
    `Chromium failed while ${work} ${path}: ${firstLine(error)}`,
    { cause: error },
  );
}

/** The first line of `error`'s message, or `error` as a string when it is no `Error`. */
export function firstLine(error: unknown): string {
  // `split` gives one string at least, so `?? ""` never applies.
  return error instanceof Error ? (error.message.split("\n", 1)[0] ?? "") : String(error);
}

/**
 * `page` at `url`, loaded: `goto` waits for the `load`. On the target app (`lenient` false) it gets
 * `GOTO_TIMEOUT_MS`, and a page that does not load, or answers with no response or one that is not
 * OK, is `target_app_unavailable`, naming `path`. Any other page gets `PAGE_GOTO_TIMEOUT_MS`, and
 * the same failures are `page_unavailable`, naming the page by its URL, never as the target app.
 */
async function openPage(page: Page, url: string, path: string, lenient: boolean): Promise<void> {
  const timeout = lenient ? PAGE_GOTO_TIMEOUT_MS : GOTO_TIMEOUT_MS;
  const code = lenient ? "page_unavailable" : "target_app_unavailable";
  const response = await page.goto(url, { timeout }).catch((error: unknown) => {
    // Playwright's first line names the URL already, as "page.goto: net::… at <url>".
    const message = lenient
      ? `the page at ${url} did not load: ${firstLine(error)}`
      : `the target app did not load ${path}: ${firstLine(error)}`;
    throw new WayfordError(code, message, { cause: error });
  });
  if (response === null || !response.ok()) {
    const status = response?.status() ?? "with no response";
    const message = lenient
      ? `the page at ${url} answered ${status}`
      : `the target app answered ${status} at ${url}`;
    throw new WayfordError(code, message);
  }
}
