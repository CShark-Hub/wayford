/**
 * The self-check: a screen of the web app measured with the filter's own `collect`, and every
 * element under the WCAG AA floor or the projector's 14 px (`docs/specs/2026-10-05-s3-07-design-direction.md`,
 * section 5). A Node module, never bundled: it is the one place in web that imports the filter's
 * main entry (`docs/STACK.md`, "Package import rules").
 */
import { fileURLToPath } from "node:url";
import { METRIC_NAMES, type MetricName, type PageMeasurement, WayfordError } from "@wayford/core";
import { collect } from "@wayford/filter";
import type { Page } from "playwright";
import { createServer } from "vite";

/** WCAG 2.2 AA contrast for text, its 24 px target size, and the projector's smallest text. */
export const SELF_CHECK_FLOOR = {
  contrast: 4.5,
  fontPx: 14,
  targetPx: 24,
} as const satisfies Record<MetricName, number>;

/** The projector's size: every screen is measured at it. */
export const SELF_CHECK_VIEWPORT = { width: 1280, height: 720 } as const;

/** A screen that must pass, and the io responses it is served, keyed by path under /api. */
export interface SelfCheckScreen {
  name: string;
  /** Where the screen is, such as `/personas`. */
  path: string;
  /** Shown once the screen has its data; the check measures after it is visible. */
  ready: string;
  /** Each a JSON body, keyed by its path under `/api`, such as `/runs`. */
  responses: Record<string, unknown>;
}

/** The screens that must pass. The shell is measured around each of them. */
export const SELF_CHECK_SCREENS: readonly SelfCheckScreen[] = [
  {
    name: "personas",
    path: "/personas",
    ready: 'role=heading[name="Personas"s]',
    // The personas come bundled with the app, so the screen asks io for nothing.
    responses: {},
  },
];

export type Shortfall = { screen: string; key: string; role: string; name: string } & (
  | { metric: MetricName; value: number; floor: number }
  /** Text whose background `collect` could not resolve, so it has no contrast to compare. */
  | { metric: "unmeasured" }
);

/**
 * Every element under the floor, from a measurement. Pure. Each comparison is strict, as the
 * filter's `>=` passes a value at the floor. Text with a font size but no contrast stands on a
 * background `collect` could not read, which the filter's own AA check fails (`docs/RULES.md`, #125).
 */
export function shortfalls(screen: string, measurement: PageMeasurement): Shortfall[] {
  // Every element gets every check: a control carries its label's contrast and font size, and the
  // schema keeps `targetPx` off text blocks.
  return measurement.elements.flatMap(({ key, role, name, metrics }): Shortfall[] => {
    const element = { screen, key, role, name };
    const unmeasured = metrics.fontPx !== undefined && metrics.contrast === undefined;
    return [
      ...(unmeasured ? [{ ...element, metric: "unmeasured" as const }] : []),
      ...METRIC_NAMES.flatMap((metric) => {
        const value = metrics[metric];
        const floor = SELF_CHECK_FLOOR[metric];
        return value !== undefined && value < floor ? [{ ...element, metric, value, floor }] : [];
      }),
    ];
  });
}

/** The measurement, kept so a caller can see what was measured, and its shortfalls. */
export interface ScreenCheck {
  measurement: PageMeasurement;
  shortfalls: Shortfall[];
}

/**
 * Open `screen` on `origin` in `page` at the projector's size, with its io requests answered from
 * `responses`, and measure it once it is ready. A request to an `/api` path the screen does not
 * list throws a `WayfordError` with code `self_check_unanswered`, so a screen is never measured
 * empty.
 */
export async function checkScreen(
  page: Page,
  origin: string,
  screen: SelfCheckScreen,
): Promise<ScreenCheck> {
  await page.setViewportSize(SELF_CHECK_VIEWPORT);
  let unlisted: WayfordError | undefined;
  let reject: (error: WayfordError) => void = () => {};
  const firstUnlisted = new Promise<never>((_, onUnlisted) => {
    reject = onUnlisted;
  });
  // Handled here too, so a request the race no longer waits on is not an unhandled rejection.
  firstUnlisted.catch(() => {});

  // Anchored on the path: the glob `**/api/**` would catch Vite's modules under `src/api/` too.
  // A RegExp, unlike a function, lets Playwright pass every other request without asking Node.
  await page.route(/^https?:\/\/[^/]+\/api\//, (route) => {
    const path = new URL(route.request().url()).pathname.slice("/api".length);
    if (Object.hasOwn(screen.responses, path)) {
      return route.fulfill({ json: screen.responses[path] });
    }
    unlisted ??= notListed(screen, path);
    reject(unlisted);
    return route.fulfill({ status: 404, json: { error: "not listed for the self-check" } });
  });
  await page.goto(`${origin}${screen.path}`);
  await Promise.race([page.locator(screen.ready).waitFor(), firstUnlisted]);
  // So Inter is measured, not the fallback the page drew while it loaded.
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const measurement = await collect(page);
  // A request made after the screen was ready may have changed what was measured.
  if (unlisted !== undefined) throw unlisted;
  return { measurement, shortfalls: shortfalls(screen.name, measurement) };
}

function notListed(screen: SelfCheckScreen, path: string): WayfordError {
  return new WayfordError(
    "self_check_unanswered",
    `the ${screen.name} screen requested /api${path}, which its responses do not list`,
  );
}

const WEB_ROOT = fileURLToPath(new URL("../", import.meta.url));

/**
 * The web app on its own Vite dev server, for `check:self` and its test. Port 0, so a developer's
 * `pnpm dev` on 5173 does not stop either.
 */
export async function startWebApp(): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = await createServer({
    root: WEB_ROOT,
    configFile: `${WEB_ROOT}vite.config.ts`,
    logLevel: "silent",
    server: { port: 0 },
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (url === undefined) {
    await server.close();
    throw new Error("the web dev server reported no local URL");
  }
  return { origin: url.replace(/\/$/, ""), close: () => server.close() };
}
