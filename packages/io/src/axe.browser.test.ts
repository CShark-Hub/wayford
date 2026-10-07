/**
 * `GET /axe` on the real `axeScanner`, against the served target app
 * (`docs/specs/2026-10-06-s4-06-axe-sidecar.md` §8, "Acceptance mapping", boxes 1 and 2):
 * `/deliveries` at the app's defaults holds axe-core's `color-contrast`, the archive link at
 * 2.005:1, stored and returned; a second request reads the store; a page outside the app scans
 * nothing; `/settings/data` holds no violation. Both match core's `axe-scans.json`, which web and
 * the Analyst's tests read as the real scans. A scan asks axe-core for exactly core's
 * `AXE_WCAG_TAGS`. The scanner refuses a page that is not a target-app page at valid parameters on
 * the target app's origin before it asks for the browser. The `analyse` CLI's `servedAxeScanner`
 * serves a build of its own and scans it under keys on the origin it was given. A page that never
 * gets a stylesheet answers 502 `page_not_settled`, and nothing is stored. After the target app
 * stops, a page not scanned yet answers 502 and nothing is stored.
 *
 * And any page by `url=` (`docs/specs/2026-10-07-s4-09-io-any-url.md`, "Acceptance mapping"): a
 * page served on a second port, with a stylesheet and a font that answer 404 and an animation that
 * never ends, is scanned and stored under its whole URL, which only the lenient load allows. The
 * same path on another origin is another scan. A page that does not load is a 502
 * `page_unavailable` naming its URL, never the target app, and nothing is stored. A page with no
 * stylesheet at all is scanned off the target app's origin, with no style wait. On the app's own
 * origin a `url=` loads as strictly as `page=`: a font that failed is a 502 `font_failed`.
 */
import { AxeBuilder } from "@axe-core/playwright";
import { AXE_WCAG_TAGS, AxeScan, WayfordError } from "@wayford/core";
import { axeScanFixture } from "@wayford/core/fixtures";
import {
  serveTargetApp,
  TARGET_APP_DEFAULT_QUERY,
  type TargetApp,
} from "@wayford/filter/serve-target-app";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { AxeScanFn } from "./axe.js";
import { axeScanner, servedAxeScanner } from "./axe-scan.js";
import { type SharedBrowser, sharedBrowser } from "./chromium.js";
import { loadAxeScan } from "./db/axe.js";
import { type PageRef, targetAppPage } from "./page-ref.js";
import {
  anyPage,
  FAILED_FONT_PAGE,
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
let scanner: AxeScanFn;
/** The file's one Chromium, uncounted. */
let shared: SharedBrowser;
/** Every browser the shared Chromium launched, so the test can close them. */
const browsers: Browser[] = [];
/** How many scans reached the scanner, through the route. */
let scans = 0;
/** How many times the scanner asked for the browser: once per context it opens. */
let asked = 0;

beforeAll(async () => {
  target = await serveTargetApp();
  shared = sharedBrowser(async () => {
    const browser = await chromium.launch();
    browsers.push(browser);
    return browser;
  });
  const counted: SharedBrowser = () => {
    asked += 1;
    return shared();
  };
  scanner = axeScanner({ browser: counted, targetAppOrigin: target.origin });
  io = await testApp({
    scanAxe: (page) => {
      scans += 1;
      return scanner(page);
    },
    targetAppOrigin: target.origin,
  });
});

afterAll(async () => {
  await Promise.all(browsers.map((browser) => browser.close()));
  await io?.close();
  await target?.close();
});

/** `path` on the served target app at its defaults: the page `page=<path>` asks for. */
const atDefaults = (path: string): PageRef =>
  targetAppPage(target.origin, path, TARGET_APP_DEFAULT_QUERY);

/** `GET /axe?<query>`, its body parsed as an `AxeScan`. */
async function scanned(query: string): Promise<AxeScan> {
  const { status, body } = await getJson(io.app, `/axe?${query}`);
  expect(status, query).toBe(200);
  return AxeScan.parse(body);
}

/** The scanner's refusal of `page`, which must be `invalid_axe_url` with no browser asked. */
async function refused(page: PageRef): Promise<WayfordError> {
  const before = asked;
  const error = await scanner(page).catch((thrown: unknown) => thrown);
  expect(error).toBeInstanceOf(WayfordError);
  expect((error as WayfordError).code).toBe("invalid_axe_url");
  expect(asked).toBe(before);
  return error as WayfordError;
}

describe("on the served target app", () => {
  test("/deliveries at the defaults: color-contrast, WCAG 2 AA, stored and returned", async () => {
    const scan = await scanned("page=/deliveries");
    const { url } = atDefaults("/deliveries");
    expect(scan.url).toBe(url);
    // axe-core's own version, the one `@axe-core/playwright` 4.13 pins.
    expect(scan.axeVersion).toMatch(/^4\.13\./);
    const contrast = scan.violations.find((violation) => violation.ruleId === "color-contrast");
    expect(contrast?.tags).toContain("wcag2aa");
    // Only WCAG tags are kept.
    expect(contrast?.tags.every((tag) => tag.startsWith("wcag"))).toBe(true);
    expect(await loadAxeScan(io.db, url)).toStrictEqual(scan);
    expect(scans).toBe(1);
    // The fixture web and the Analyst's tests read is this page's real scan.
    expect(scan.violations).toEqual(axeScanFixture("/deliveries").violations);
  });

  test("a second request reads the store and does not scan again", async () => {
    const first = await getJson(io.app, "/axe?page=/deliveries");
    const second = await getJson(io.app, "/axe?page=/deliveries");
    expect(second).toStrictEqual(first);
    expect(scans).toBe(1);
  });

  test("a page outside the app is a 400 and scans nothing", async () => {
    const { status } = await getJson(io.app, "/axe?page=/nope");
    expect(status).toBe(400);
    expect(scans).toBe(1);
  });

  test("/settings/data at the defaults: no violation, stored", async () => {
    const scan = await scanned("page=/settings/data");
    const { url } = atDefaults("/settings/data");
    expect(scan.url).toBe(url);
    // Box 2, and demo beat 3: axe-core finds no WCAG A or AA violation here. The fixture says so too.
    expect(scan.violations).toEqual([]);
    expect(axeScanFixture("/settings/data").violations).toEqual([]);
    expect(await loadAxeScan(io.db, url)).toStrictEqual(scan);
    expect(scans).toBe(2);
    // Every scan so far on one Chromium, each context closed after it.
    expect(browsers).toHaveLength(1);
    expect(browsers.flatMap((browser) => browser.contexts())).toEqual([]);
  });

  test("a scan hands axe-core exactly core's AXE_WCAG_TAGS", async () => {
    // On the prototype, so the builder the scanner makes is the one spied on. The scanner is
    // called directly, past the store, so this scan runs whatever was scanned before it.
    const withTags = vi.spyOn(AxeBuilder.prototype, "withTags");
    try {
      await scanner(atDefaults("/account"));
      expect(withTags.mock.calls).toEqual([[[...AXE_WCAG_TAGS]]]);
    } finally {
      withTags.mockRestore();
    }
  });

  // Each is what follows the served app's origin in a target-app page's URL.
  test.each([
    ["a page outside the app", `/nope${TARGET_APP_DEFAULT_QUERY}`],
    ["a hash", `/deliveries${TARGET_APP_DEFAULT_QUERY}#archive`],
    ["no query", "/deliveries"],
    ["a missing parameter", "/deliveries?contrast=2&fontPx=16"],
    ["an unknown parameter", "/deliveries?contrast=2&fontPx=16&targetPx=36&zoom=2"],
    ["a repeated parameter", "/deliveries?contrast=2&contrast=3&fontPx=16&targetPx=36"],
    ["the parameters in another order", "/deliveries?fontPx=16&contrast=2&targetPx=36"],
    ["a number spelled otherwise", "/deliveries?contrast=2.0&fontPx=16&targetPx=36"],
    ["a parameter that is no number", "/deliveries?contrast=high&fontPx=16&targetPx=36"],
    ["a contrast below 1:1", "/deliveries?contrast=0.5&fontPx=16&targetPx=36"],
    ["a font size outside the app's range", "/deliveries?contrast=2&fontPx=200&targetPx=36"],
  ])(
    "the scanner refuses a target-app page with %s, invalid_axe_url, and opens no page",
    async (_, suffix) => {
      await refused({ url: `${target.origin}${suffix}`, onTargetApp: true });
    },
  );

  test("a target-app page on another origin is refused by that origin", async () => {
    const error = await refused({
      url: `https://example.com/deliveries${TARGET_APP_DEFAULT_QUERY}`,
      onTargetApp: true,
    });
    expect(error.message).toContain(`not on the target app at ${target.origin}`);
  });

  // Core's `AxeUrl` holds the rest of the table (`core/src/axe.test.ts`).
  test.each([
    ["a target-app page", true],
    ["any other page", false],
  ])(
    "the scanner refuses %s whose URL is no AxeUrl, invalid_axe_url, and opens no page",
    async (_, onTargetApp) => {
      await refused({ url: `/deliveries${TARGET_APP_DEFAULT_QUERY}`, onTargetApp });
    },
  );
});

describe("servedAxeScanner, the analyse CLI's scanner", () => {
  test("closing it before any scan starts nothing and throws nothing", async () => {
    await servedAxeScanner("http://localhost:5174").close();
  });

  test("its first target-app scan serves its own build and finds color-contrast, keyed on the origin it was given", async () => {
    const served = servedAxeScanner("http://localhost:5174");
    try {
      const page = targetAppPage("http://localhost:5174", "/deliveries", TARGET_APP_DEFAULT_QUERY);
      const scan = await served.scan(page);
      expect(scan.url).toBe("http://localhost:5174/deliveries?contrast=2&fontPx=16&targetPx=36");
      expect(scan.violations.map((violation) => violation.ruleId)).toContain("color-contrast");
    } finally {
      await served.close();
    }
  });
});

describe("on a page with no stylesheet", () => {
  test("a target-app page, and a url= on the target app's origin, are a 502 page_not_settled, and nothing is stored", async () => {
    // Every path answers the same page, with no `<link rel="stylesheet">` and no `<style>`.
    const site = await serveLocal((_, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<!doctype html><title>x</title><p>unstyled</p>");
    });
    // The app at `site.origin`, so its pages pass the scanner's origin check and reach the style wait.
    const unstyled = await testApp({
      scanAxe: axeScanner({ browser: shared, targetAppOrigin: site.origin }),
      targetAppOrigin: site.origin,
    });
    try {
      // The page loads and has no fonts to wait for, so the style wait is what expires.
      const { status, body } = await getJson(unstyled.app, "/axe?page=/deliveries");
      expect(status).toBe(502);
      expect(body.error).toMatch(
        /^page_not_settled: the page at \/deliveries\?\S+ had no stylesheet applied within 3000 ms/,
      );
      const { url } = targetAppPage(site.origin, "/deliveries", TARGET_APP_DEFAULT_QUERY);
      expect(await loadAxeScan(unstyled.db, url)).toBeUndefined();

      // The same key asked by `url=` waits for the styles too, so it is never stored unstyled.
      const asUrl = await getJson(unstyled.app, `/axe?url=${encodeURIComponent(url)}`);
      expect(asUrl).toStrictEqual({
        status: 502,
        body: {
          error: `page_not_settled: the page at ${url} had no stylesheet applied within 3000 ms, so it was not scanned`,
        },
      });
      expect(await loadAxeScan(unstyled.db, url)).toBeUndefined();
    } finally {
      await unstyled.close();
      await stopLocal(site);
    }
  });

  test("a url= off the target app's origin with no stylesheet at all is scanned, with no style wait", async () => {
    // A real site may have no stylesheet, and the style wait would refuse it. This is the one page
    // its skip changes: a stylesheet that failed to load gets a `sheet` all the same.
    const site = await servePage("<!doctype html><html lang='en'><title>x</title><p>bare</p>");
    try {
      const url = `${site.origin}/page`;
      const scan = await scanned(`url=${encodeURIComponent(url)}`);
      expect(scan.url).toBe(url);
      expect(await loadAxeScan(io.db, url)).toStrictEqual(scan);
    } finally {
      await stopLocal(site);
    }
  });
});

describe("a url= on the target app's own origin", () => {
  test("loads as strictly as page= does: a font that failed is a 502 font_failed, and nothing is stored", async () => {
    // Its key can be one `page=` uses, so it is filled one way. Off the app's origin the same page
    // is scanned: the lenient load sets the failed face aside.
    const site = await servePage(FAILED_FONT_PAGE);
    const onApp = await testApp({
      scanAxe: axeScanner({ browser: shared, targetAppOrigin: site.origin }),
      targetAppOrigin: site.origin,
    });
    try {
      const url = `${site.origin}/page`;
      const { status, body } = await getJson(onApp.app, `/axe?url=${encodeURIComponent(url)}`);
      expect(status).toBe(502);
      expect(body.error).toMatch(/^font_failed: the page at \S+ could not load "Missing Face"/);
      expect(await loadAxeScan(onApp.db, url)).toBeUndefined();

      // The same page, off the target app's origin: scanned.
      expect((await scanned(`url=${encodeURIComponent(url)}`)).url).toBe(url);
    } finally {
      await onApp.close();
      await stopLocal(site);
    }
  });
});

/** The rule ids of `scan`'s violations. */
const rulesOf = (scan: AxeScan) => scan.violations.map((violation) => violation.ruleId);

describe("any page", () => {
  let faint: LocalServer;
  let clear: LocalServer;

  beforeAll(async () => {
    faint = await servePage(anyPage(true));
    clear = await servePage(anyPage(false));
  });

  afterAll(async () => {
    await stopLocal(faint);
    await stopLocal(clear);
  });

  test("url= on a page with a 404 stylesheet, a 404 font and an endless animation is scanned and stored by its URL", async () => {
    const before = scans;
    const url = `${faint.origin}/page`;
    const scan = await scanned(`url=${encodeURIComponent(url)}`);
    expect(scan.url).toBe(url);
    expect(scan.axeVersion).toMatch(/^4\.13\./);
    expect(rulesOf(scan)).toContain("color-contrast");
    expect(await loadAxeScan(io.db, url)).toStrictEqual(scan);
    expect(scans).toBe(before + 1);
  });

  test("the same path on another origin is its own scan; two rows, and a repeat of each scans nothing", async () => {
    const one = `${faint.origin}/page`;
    const two = `${clear.origin}/page`;
    const first = await scanned(`url=${encodeURIComponent(one)}`);
    const before = scans;
    const second = await scanned(`url=${encodeURIComponent(two)}`);
    expect(second.url).toBe(two);
    expect(rulesOf(second)).not.toContain("color-contrast");
    expect(scans).toBe(before + 1);
    expect(await loadAxeScan(io.db, one)).toStrictEqual(first);
    expect(await loadAxeScan(io.db, two)).toStrictEqual(second);

    expect(await scanned(`url=${encodeURIComponent(one)}`)).toStrictEqual(first);
    expect(await scanned(`url=${encodeURIComponent(two)}`)).toStrictEqual(second);
    expect(scans).toBe(before + 1);
  });

  test("url= on a port nothing listens on is a 502 page_unavailable naming the URL, and nothing is stored", async () => {
    const closed = await serveLocal(() => undefined);
    await stopLocal(closed);

    const url = `${closed.origin}/page`;
    const { status, body } = await getJson(io.app, `/axe?url=${encodeURIComponent(url)}`);
    expect(status).toBe(502);
    expect(body.error.startsWith(`page_unavailable: the page at ${url} did not load: `)).toBe(true);
    expect(body.error).not.toContain("target app");
    expect(await loadAxeScan(io.db, url)).toBeUndefined();
  });

  test("url= on a path the server answers 404 is a 502 page_unavailable naming the URL, and nothing is stored", async () => {
    const url = `${faint.origin}/nope`;
    const { status, body } = await getJson(io.app, `/axe?url=${encodeURIComponent(url)}`);
    expect({ status, body }).toStrictEqual({
      status: 502,
      body: { error: `page_unavailable: the page at ${url} answered 404` },
    });
    expect(await loadAxeScan(io.db, url)).toBeUndefined();
    // Neither failure left a context open on the shared Chromium.
    expect(browsers.flatMap((browser) => browser.contexts())).toEqual([]);
  });
});

describe("once the target app stops", () => {
  test("a page not scanned yet is a 502, and nothing is stored", async () => {
    await target.close();
    const kept = await getJson(io.app, "/axe?page=/deliveries");
    expect(kept.status).toBe(200);

    const fresh = await getJson(io.app, "/axe?page=/settings");
    expect(fresh.status).toBe(502);
    expect(fresh.body.error).toMatch(/^target_app_unavailable: the target app did not load /);
    expect(await loadAxeScan(io.db, atDefaults("/settings").url)).toBeUndefined();
    // The failed scan closed its context too.
    expect(browsers.flatMap((browser) => browser.contexts())).toEqual([]);
  });
});
