/**
 * `GET /axe` on a counting fake `AxeScanFn` (`docs/specs/2026-10-06-s4-06-axe-sidecar.md`, §5):
 * the key it scans at, the scan it stores, the 400s that scan nothing, and how a failed scan
 * answers. That the store scans each page once is the lookup's, tested in `axe.test.ts`. The real
 * scanner is `axe.browser.test.ts`'s.
 */
import { startUrlFor, TARGET_APP_DEFAULTS } from "@wayford/agent";
import { type AxeScan, WayfordError } from "@wayford/core";
import { axeScanFixture } from "@wayford/core/fixtures";
import { TARGET_APP_DEFAULT_QUERY } from "@wayford/filter/serve-target-app";
import { afterEach, describe, expect, test, vi } from "vitest";
import { type AxeScanFn, axeUrl } from "../axe.js";
import { loadAxeScan } from "../db/axe.js";
import { getJson, type TestApp, testApp } from "../test-app.js";

/** `/deliveries`' real scan as if taken at `url`: one violation, told apart from the default's. */
const scanned = (url: string): AxeScan => ({ ...axeScanFixture("/deliveries"), url });

let current: TestApp | undefined;

/** An app whose `scanAxe` is `fn`, counted, closed after the test. */
async function appWith(fn: AxeScanFn) {
  const scanAxe = vi.fn(fn);
  current = await testApp({ scanAxe });
  return { ...current, scanAxe };
}

afterEach(async () => {
  await current?.close();
  current = undefined;
});

describe("GET /axe", () => {
  test("it scans the page at the app's defaults, stores the scan and answers it", async () => {
    const { app, db, scanAxe } = await appWith(async (url) => scanned(url));
    const key = axeUrl("/deliveries", TARGET_APP_DEFAULT_QUERY);
    const { status, body } = await getJson(app, "/axe?page=/deliveries");
    expect(status).toBe(200);
    expect(body).toStrictEqual(scanned(key));
    expect(scanAxe.mock.calls).toEqual([[key]]);
    expect(await loadAxeScan(db, key)).toStrictEqual(scanned(key));
  });

  test("no page, a page outside the app, a repeated page or an unknown key is a 400", async () => {
    const { app, scanAxe } = await appWith(async (url) => scanned(url));
    for (const query of [
      "",
      "?page=/nope",
      "?page=/deliveries/",
      "?page=deliveries",
      "?page=/deliveries&page=/settings",
      "?page=/deliveries&device=desktop",
    ]) {
      const { status, body } = await getJson(app, `/axe${query}`);
      expect(status, query).toBe(400);
      expect(typeof body.error, query).toBe("string");
    }
    expect(scanAxe).not.toHaveBeenCalled();
  });

  test("a failed scan is a 502 naming why, and is not stored", async () => {
    const { app, db } = await appWith(async () => {
      throw new WayfordError("target_app_unavailable", "the target app did not answer");
    });
    expect(await getJson(app, "/axe?page=/deliveries")).toStrictEqual({
      status: 502,
      body: { error: "target_app_unavailable: the target app did not answer" },
    });
    expect(await loadAxeScan(db, axeUrl("/deliveries", TARGET_APP_DEFAULT_QUERY))).toBeUndefined();
  });

  test("an error that is not a WayfordError is the app's logged 500", async () => {
    const { app } = await appWith(async () => {
      throw new TypeError("a bug");
    });
    expect(await getJson(app, "/axe?page=/deliveries")).toStrictEqual({
      status: 500,
      body: { error: "internal error" },
    });
  });

  test("the route's key carries the query a run at the app's defaults starts on", () => {
    // So a page the arena's runs stood on is stored under the key the preview's card reads.
    const start = startUrlFor({ startUrl: "http://localhost:5174/" }, TARGET_APP_DEFAULTS);
    expect(new URL(start).search).toBe(TARGET_APP_DEFAULT_QUERY);
  });
});
