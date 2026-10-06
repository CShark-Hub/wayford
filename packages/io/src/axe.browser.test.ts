/**
 * `GET /axe` on the real `axeScanner`, against the served target app
 * (`docs/specs/2026-10-06-s4-06-axe-sidecar.md` §8, "Acceptance mapping", boxes 1 and 2):
 * `/deliveries` at the app's defaults holds axe-core's `color-contrast`, the archive link at
 * 2.005:1, stored and returned; a second request reads the store; a page outside the app scans
 * nothing; `/settings/data` holds no violation. Both match core's `axe-scans.json`, which web and
 * the Analyst's tests read as the real scans. A scan asks axe-core for exactly core's
 * `AXE_WCAG_TAGS`. The scanner refuses a URL that is not a target-app page at valid parameters
 * before it asks for the browser. The `analyse` CLI's `servedAxeScanner` serves a build of its own
 * and scans it. A page that never gets a stylesheet answers 502 `page_not_settled`, and nothing is
 * stored. After the target app stops, a page not scanned yet answers 502 and nothing is stored.
 */
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
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
import { type AxeScanFn, axeUrl } from "./axe.js";
import { axeScanner, servedAxeScanner } from "./axe-scan.js";
import { type SharedBrowser, sharedBrowser } from "./chromium.js";
import { loadAxeScan } from "./db/axe.js";
import { getJson, type TestApp, testApp } from "./test-app.js";

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
  scanner = axeScanner({ browser: counted, origin: target.origin });
  io = await testApp({
    scanAxe: (url) => {
      scans += 1;
      return scanner(url);
    },
  });
});

afterAll(async () => {
  await Promise.all(browsers.map((browser) => browser.close()));
  await io?.close();
  await target?.close();
});

/** `GET /axe?page=<page>`, its body parsed as an `AxeScan`. */
async function scanned(page: string): Promise<AxeScan> {
  const { status, body } = await getJson(io.app, `/axe?page=${page}`);
  expect(status, page).toBe(200);
  return AxeScan.parse(body);
}

describe("on the served target app", () => {
  test("/deliveries at the defaults: color-contrast, WCAG 2 AA, stored and returned", async () => {
    const scan = await scanned("/deliveries");
    const url = axeUrl("/deliveries", TARGET_APP_DEFAULT_QUERY);
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
    const scan = await scanned("/settings/data");
    const url = axeUrl("/settings/data", TARGET_APP_DEFAULT_QUERY);
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
      await scanner(axeUrl("/account", TARGET_APP_DEFAULT_QUERY));
      expect(withTags.mock.calls).toEqual([[[...AXE_WCAG_TAGS]]]);
    } finally {
      withTags.mockRestore();
    }
  });

  test.each([
    ["a page outside the app", "/nope?contrast=2&fontPx=16&targetPx=36"],
    ["an origin", `http://localhost:5174/deliveries${TARGET_APP_DEFAULT_QUERY}`],
    ["a protocol-relative origin", `//example.com/deliveries${TARGET_APP_DEFAULT_QUERY}`],
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
  ])("the scanner refuses %s with invalid_axe_url and opens no page", async (_, url) => {
    const before = asked;
    const refused = await scanner(url).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(WayfordError);
    expect((refused as WayfordError).code).toBe("invalid_axe_url");
    expect(asked).toBe(before);
  });
});

describe("servedAxeScanner, the analyse CLI's scanner", () => {
  test("closing it before any scan starts nothing and throws nothing", async () => {
    await servedAxeScanner().close();
  });

  test("its first scan serves its own build and finds color-contrast, and close() then resolves", async () => {
    const served = servedAxeScanner();
    try {
      const url = axeUrl("/deliveries", TARGET_APP_DEFAULT_QUERY);
      const scan = await served.scan(url);
      expect(scan.url).toBe(url);
      expect(scan.violations.map((violation) => violation.ruleId)).toContain("color-contrast");
    } finally {
      await served.close();
    }
  });
});

describe("on a page with no stylesheet", () => {
  test("the scan is a 502 page_not_settled and nothing is stored", async () => {
    // Every path answers the same page, with no `<link rel="stylesheet">` and no `<style>`.
    const server = createServer((_, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<!doctype html><title>x</title><p>unstyled</p>");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    const unstyled = await testApp({
      scanAxe: axeScanner({ browser: shared, origin: `http://127.0.0.1:${port}` }),
    });
    try {
      // The page loads and has no fonts to wait for, so the style wait is what expires.
      const { status, body } = await getJson(unstyled.app, "/axe?page=/deliveries");
      expect(status).toBe(502);
      expect(body.error).toMatch(
        /^page_not_settled: the page at \/deliveries\?\S+ had no stylesheet applied within 3000 ms/,
      );
      const url = axeUrl("/deliveries", TARGET_APP_DEFAULT_QUERY);
      expect(await loadAxeScan(unstyled.db, url)).toBeUndefined();
    } finally {
      await unstyled.close();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
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
    expect(await loadAxeScan(io.db, axeUrl("/settings", TARGET_APP_DEFAULT_QUERY))).toBeUndefined();
    // The failed scan closed its context too.
    expect(browsers.flatMap((browser) => browser.contexts())).toEqual([]);
  });
});
