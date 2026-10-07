/**
 * `GET /measure` on the real `liveMeasure`, against the served target app
 * (`docs/specs/2026-10-03-s3-05-live-preview.md`, "Acceptance mapping", boxes 1 and 5): a valid
 * `PageMeasurement` of the page asked for, on the device asked for, through one shared Chromium.
 * After the target app stops, a page measured before still answers from io's cache, and one not
 * measured yet answers 502.
 *
 * And any page by `url=` (`docs/specs/2026-10-07-s4-09-io-any-url.md`, "Acceptance mapping"): a
 * page served on a second port, with a stylesheet and a font that answer 404 and an animation that
 * never ends, is measured, which only the lenient load allows. A page that does not load is a 502
 * `page_unavailable` naming its URL, never the target app. On the target app's own origin a `url=`
 * loads as strictly as `page=`: a font that failed is a 502 `font_failed`.
 *
 * Boxes depend on the browser build (`packages/target-app/README.md`, "Font"), so the test reads
 * what a page holds, not where.
 */
import { type MeasuredElement, PageMeasurement } from "@wayford/core";
import { serveTargetApp, type TargetApp } from "@wayford/filter/serve-target-app";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { sharedBrowser } from "./chromium.js";
import { liveMeasure } from "./live-measure.js";
import {
  anyPage,
  FAILED_FONT_PAGE,
  FAINT_TEXT,
  getJson,
  type LocalServer,
  serveLocal,
  servePage,
  stopLocal,
  type TestApp,
  testApp,
} from "./test-app.js";

// Building the app and launching Chromium take longer than vitest's 5 s hook default.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

let target: TargetApp;
let io: TestApp;
/** Every browser the shared Chromium launched, so the test can count them and close them. */
const browsers: Browser[] = [];
/** The file's one Chromium, launched by its first measurement. */
const shared = sharedBrowser(async () => {
  const browser = await chromium.launch();
  browsers.push(browser);
  return browser;
});

beforeAll(async () => {
  target = await serveTargetApp();
  io = await testApp({
    measure: liveMeasure({ browser: shared, targetAppOrigin: target.origin }),
    targetAppOrigin: target.origin,
  });
});

afterAll(async () => {
  await Promise.all(browsers.map((browser) => browser.close()));
  await io?.close();
  await target?.close();
});

/** `GET /measure?<query>`, its body parsed as a `PageMeasurement`. */
async function measured(query: string): Promise<PageMeasurement> {
  const { status, body } = await getJson(io.app, `/measure?${query}`);
  expect(status, query).toBe(200);
  return PageMeasurement.parse(body);
}

/** The measured elements with `role` and `name`. */
function named(measurement: PageMeasurement, role: string, name: string): MeasuredElement[] {
  return measurement.elements.filter((e) => e.role === role && e.name === name);
}

test("with no query, /deliveries on desktop: a valid PageMeasurement of the live page", async () => {
  const measurement = await measured("");
  // The app drops its parameters from the address bar once it has read them.
  expect(measurement.url).toBe(`${target.origin}/deliveries`);
  expect(measurement.viewport).toMatchObject({ width: 1280, height: 720, isMobile: false });
  const archives = named(measurement, "link", "Order archive");
  expect(archives).toHaveLength(1);
  // Measured, so the preview's thresholds have something to cut.
  const archive = archives[0];
  expect(archive?.metrics.contrast).toBeGreaterThan(1);
  expect(archive?.metrics.targetPx).toBeGreaterThan(0);
});

test("device=mobile measures on the phone: isMobile true, 412 px wide", async () => {
  const measurement = await measured("device=mobile");
  expect(measurement.url).toBe(`${target.origin}/deliveries`);
  expect(measurement.viewport).toMatchObject({ width: 412, isMobile: true });
  // The phone's nav sits behind the Menu toggle.
  expect(named(measurement, "button", "Menu")).toHaveLength(1);
});

test("/account and /settings/data, the picker's other two pages, are measured live", async () => {
  const account = await measured("page=/account");
  expect(account.url).toBe(`${target.origin}/account`);
  expect(named(account, "button", "More options")).toHaveLength(1);

  const data = await measured("page=/settings/data");
  expect(data.url).toBe(`${target.origin}/settings/data`);
  expect(named(data, "link", "Fulfilment ledger")).toHaveLength(1);

  // Every measurement so far on one Chromium.
  expect(browsers).toHaveLength(1);
});

test("once the target app stops, a page measured before answers from the cache, a new one 502", async () => {
  const before = await getJson(io.app, "/measure?page=/account");
  await target.close();

  const kept = await getJson(io.app, "/measure?page=/account");
  expect(kept).toStrictEqual(before);

  const fresh = await getJson(io.app, "/measure?page=/settings");
  expect(fresh.status).toBe(502);
  expect(fresh.body.error).toMatch(/^target_app_unavailable: the target app did not load /);
  // The failed measurement closed its context, as every one before it did: none is left on the
  // Chromium the runs share.
  expect(browsers.flatMap((browser) => browser.contexts())).toEqual([]);
});

describe("any page", () => {
  let site: LocalServer;

  beforeAll(async () => {
    site = await servePage(anyPage(true));
  });

  afterAll(async () => {
    await stopLocal(site);
  });

  test("url= on a page with a 404 stylesheet, a 404 font and an endless animation is measured", async () => {
    const url = `${site.origin}/page`;
    const measurement = await measured(`url=${encodeURIComponent(url)}`);
    expect(measurement.url).toBe(url);
    expect(measurement.viewport).toMatchObject({ width: 1280, isMobile: false });
    const faint = named(measurement, "paragraph", FAINT_TEXT);
    expect(faint).toHaveLength(1);
    // #aaa on white, measured as the page draws it.
    expect(faint[0]?.metrics.contrast).toBeGreaterThan(2);
    expect(faint[0]?.metrics.contrast).toBeLessThan(2.5);
  });

  test("url= on a port nothing listens on is a 502 page_unavailable naming the URL", async () => {
    const closed = await serveLocal(() => undefined);
    await stopLocal(closed);

    const url = `${closed.origin}/page`;
    const { status, body } = await getJson(io.app, `/measure?url=${encodeURIComponent(url)}`);
    expect(status).toBe(502);
    expect(body.error.startsWith(`page_unavailable: the page at ${url} did not load: `)).toBe(true);
    expect(body.error).not.toContain("target app");
  });

  test("url= on a path the server answers 404 is a 502 page_unavailable naming the URL", async () => {
    const url = `${site.origin}/nope`;
    const { status, body } = await getJson(io.app, `/measure?url=${encodeURIComponent(url)}`);
    expect({ status, body }).toStrictEqual({
      status: 502,
      body: { error: `page_unavailable: the page at ${url} answered 404` },
    });
    // Neither failure left a context open on the shared Chromium.
    expect(browsers.flatMap((browser) => browser.contexts())).toEqual([]);
  });

  test("url= on the target app's own origin loads as strictly as page= does: a font that failed is a 502 font_failed", async () => {
    // Its key can be one `page=` uses, so it is filled one way: the route never keeps a
    // fallback-font measurement for a `page=`. Off the app's origin the same page is measured.
    const failedFont = await servePage(FAILED_FONT_PAGE);
    const onApp = await testApp({
      measure: liveMeasure({ browser: shared, targetAppOrigin: failedFont.origin }),
      targetAppOrigin: failedFont.origin,
    });
    try {
      const url = `${failedFont.origin}/page`;
      const { status, body } = await getJson(onApp.app, `/measure?url=${encodeURIComponent(url)}`);
      expect(status).toBe(502);
      expect(body.error).toMatch(/^font_failed: the page at \S+ could not load "Missing Face"/);

      expect((await measured(`url=${encodeURIComponent(url)}`)).url).toBe(url);
    } finally {
      await onApp.close();
      await stopLocal(failedFont);
    }
  });
});
