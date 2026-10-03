/**
 * The walk behind the route table (`docs/RULES.md`, the route preamble): the target app built and
 * served on a free port, at its defaults, and each route's steps measured with `collect` where a
 * person reaches them, on each device a persona uses. No filter here: `route-table.ts` applies
 * `perceive` to what the walk measured.
 *
 * Node and Playwright, so nothing reached from `./perceive` imports it, and the package does not
 * export it: `scripts/routes.ts` and `routes.browser.test.ts` import it by path.
 *
 * Where a person reaches a step:
 * - a step on a page of its own is measured on that page as loaded, in a fresh context;
 * - a step on the same page as the step before it is measured after clicking that step: the kebab
 *   opens its menu, then "Past orders" is taken from it;
 * - a step the page does not show is looked for behind the control the hamburger detector matches,
 *   as on a phone, where the nav sits behind the Menu toggle. The toggle is then a step of its
 *   own, on the same page, so a toggle the filter cuts closes the route there.
 */
import type { DeviceKind, PageMeasurement } from "@wayford/core";
import { type Browser, type BrowserContextOptions, chromium, devices } from "playwright";
import { collect } from "./collect.js";
import { isHamburger } from "./knowledge.js";
import type { WalkedRoute, WalkedStep } from "./route-table.js";
import {
  DEVICE_DESCRIPTORS,
  serveTargetApp,
  TARGET_APP_DEFAULT_QUERY,
  TARGET_APP_ROUTES,
  type TargetAppRouteStep,
} from "./serve-target-app.js";

/** A control the walk clicks: a route step, or the menu toggle, which is a button. */
type Click = Pick<TargetAppRouteStep, "role" | "name">;

/** A page measured after `after` was clicked on it, once per walk on a device. */
type Measure = (path: string, after: readonly Click[]) => Promise<PageMeasurement>;

/**
 * Walk `TARGET_APP_ROUTES` on each device kind, each kind once. The app is built and served for
 * the walk and closed after it.
 */
export async function walkRoutes(
  kinds: readonly DeviceKind[],
): Promise<Map<DeviceKind, WalkedRoute[]>> {
  const app = await serveTargetApp();
  try {
    const browser = await chromium.launch().catch((error: unknown) => {
      throw new Error(
        "Chromium did not launch. If it is not installed, run " +
          "`pnpm --filter @wayford/filter exec playwright install --only-shell chromium`.",
        { cause: error },
      );
    });
    try {
      const walks = new Map<DeviceKind, WalkedRoute[]>();
      for (const kind of new Set(kinds)) {
        const measure = measurer(browser, app.origin, kind);
        const routes: WalkedRoute[] = [];
        for (const route of TARGET_APP_ROUTES) {
          routes.push({ id: route.id, steps: await walkSteps(route.steps, measure) });
        }
        walks.set(kind, routes);
      }
      return walks;
    } finally {
      await browser.close();
    }
  } finally {
    await app.close();
  }
}

/** One route's steps, each with the measurement of where a person reaches it. */
async function walkSteps(
  steps: readonly TargetAppRouteStep[],
  measure: Measure,
): Promise<WalkedStep[]> {
  const walked: WalkedStep[] = [];
  let before: { step: TargetAppRouteStep; after: readonly Click[] } | undefined;
  for (const step of steps) {
    // The same page as the step before: that step is clicked, after what it was reached through.
    let after: readonly Click[] =
      before?.step.page === step.page
        ? [...before.after, { role: before.step.role, name: before.step.name }]
        : [];
    let measurement = await measure(step.page, after);
    const toggle = shows(measurement, step) ? undefined : measurement.elements.find(isHamburger);
    if (toggle !== undefined) {
      // The hamburger detector matches buttons only.
      const click: Click = { role: "button", name: toggle.name };
      walked.push({ page: step.page, ...click, after, measurement });
      after = [...after, click];
      measurement = await measure(step.page, after);
    }
    if (!shows(measurement, step)) {
      const opened = after.map((c) => ` after ${c.role} "${c.name}"`).join(",");
      throw new Error(`${step.role} "${step.name}" is not measured on ${step.page}${opened}`);
    }
    walked.push({ page: step.page, role: step.role, name: step.name, after, measurement });
    before = { step, after };
  }
  return walked;
}

/** True when the page holds an element with the step's role and name. */
function shows(measurement: PageMeasurement, step: Click): boolean {
  return measurement.elements.some((e) => e.role === step.role && e.name === step.name);
}

/**
 * Measures pages on one device kind: each in a fresh context with the kind's descriptor, at the
 * app's defaults, with the bundled font checked. A page reached the same way twice, such as `/`
 * as loaded for all three routes, is measured once.
 */
function measurer(browser: Browser, origin: string, kind: DeviceKind): Measure {
  const { defaultBrowserType: _, ...options } = devices[DEVICE_DESCRIPTORS[kind]];
  const measured = new Map<string, Promise<PageMeasurement>>();
  return (path, after) => {
    const key = JSON.stringify([path, after]);
    let measurement = measured.get(key);
    if (measurement === undefined) {
      measurement = measure(browser, options, `${origin}${path}${TARGET_APP_DEFAULT_QUERY}`, after);
      measured.set(key, measurement);
    }
    return measurement;
  };
}

async function measure(
  browser: Browser,
  options: BrowserContextOptions,
  url: string,
  after: readonly Click[],
): Promise<PageMeasurement> {
  const context = await browser.newContext(options);
  try {
    const page = await context.newPage();
    await page.goto(url);
    // A font that failed to load falls back to a system one, and the page would be measured in it.
    if (!(await page.evaluate(() => document.fonts.check('16px "Inter"')))) {
      throw new Error(`the bundled Inter font did not load on ${new URL(url).pathname}`);
    }
    for (const { role, name } of after) await page.getByRole(role, { name, exact: true }).click();
    return await collect(page, { isMobile: options.isMobile ?? false });
  } finally {
    await context.close();
  }
}
