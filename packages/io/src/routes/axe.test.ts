/**
 * `GET /axe` on a counting fake `AxeScanFn` (`docs/specs/2026-10-06-s4-06-axe-sidecar.md`, §5,
 * and `docs/specs/2026-10-07-s4-09-io-any-url.md`, "io: axe"): `page=` and `url=`, exactly one, the
 * page each asks for, the scan it stores under the page's whole URL, the 400s that scan nothing,
 * and how a failed scan answers. That the store scans each page once is the lookup's, tested in
 * `axe.test.ts`. The real scanner is `axe.browser.test.ts`'s.
 */
import { startUrlFor, TARGET_APP_DEFAULTS } from "@wayford/agent";
import { type AxeScan, WayfordError } from "@wayford/core";
import { axeScanFixture } from "@wayford/core/fixtures";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AxeScanFn } from "../axe.js";
import { loadAxeScan } from "../db/axe.js";
import type { PageRef } from "../page-ref.js";
import { getJson, type TestApp, testApp } from "../test-app.js";

/** `/deliveries`' real scan as if taken of `page`: one violation, told apart from the default's. */
const scanned = (page: PageRef): AxeScan => ({ ...axeScanFixture("/deliveries"), url: page.url });

/** `/deliveries` on `testApp`'s target app at its defaults, spelled out, as the route must ask. */
const DELIVERIES: PageRef = {
  url: "http://localhost:5174/deliveries?contrast=2&fontPx=16&targetPx=36",
  onTargetApp: true,
};

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
  test("page= scans the target-app page at the app's defaults, stores the scan and answers it", async () => {
    const { app, db, scanAxe } = await appWith(async (page) => scanned(page));
    const { status, body } = await getJson(app, "/axe?page=/deliveries");
    expect(status).toBe(200);
    expect(body).toStrictEqual(scanned(DELIVERIES));
    expect(scanAxe.mock.calls).toEqual([[DELIVERIES]]);
    expect(await loadAxeScan(db, DELIVERIES.url)).toStrictEqual(scanned(DELIVERIES));
  });

  test("url= scans that page as new URL spells it, off the target app, and stores it so", async () => {
    const { app, db, scanAxe } = await appWith(async (page) => scanned(page));
    const asked: PageRef = { url: "https://example.com/", onTargetApp: false };
    const { status, body } = await getJson(app, "/axe?url=https://example.com");
    expect(status).toBe(200);
    expect(body).toStrictEqual(scanned(asked));
    expect(scanAxe.mock.calls).toEqual([[asked]]);
    expect(await loadAxeScan(db, "https://example.com/")).toStrictEqual(scanned(asked));
  });

  test("neither page nor url, or both, is a 400 saying so, and nothing is scanned", async () => {
    const { app, scanAxe } = await appWith(async (page) => scanned(page));
    expect(await getJson(app, "/axe")).toStrictEqual({
      status: 400,
      body: { error: expect.stringContaining("ask for a page or a url") },
    });
    const both = await getJson(app, "/axe?page=/deliveries&url=https://example.com/");
    expect(both.status).toBe(400);
    expect(both.body.error).toMatch(/page or a url, not both/);
    expect(scanAxe).not.toHaveBeenCalled();
  });

  test("a page outside the app, a repeated page or url, or an unknown key is a 400", async () => {
    const { app, scanAxe } = await appWith(async (page) => scanned(page));
    for (const query of [
      "?page=/nope",
      "?page=/deliveries/",
      "?page=deliveries",
      "?page=/deliveries&page=/settings",
      "?url=https://example.com/&url=https://example.org/",
      "?page=/deliveries&device=desktop",
    ]) {
      const { status, body } = await getJson(app, `/axe${query}`);
      expect(status, query).toBe(400);
      expect(typeof body.error, query).toBe("string");
    }
    expect(scanAxe).not.toHaveBeenCalled();
  });

  test("a url= that pageUrlParam refuses, such as file:, is a 400, and nothing is scanned", async () => {
    const { app, scanAxe } = await appWith(async (page) => scanned(page));
    const { status, body } = await getJson(app, "/axe?url=file:///etc/passwd");
    expect(status).toBe(400);
    expect(body.error).toContain("url");
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
    expect(await loadAxeScan(db, DELIVERIES.url)).toBeUndefined();
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

  test("page='s key is the URL a run at the app's defaults starts on, on that page", () => {
    // So a page the arena's runs stood on is stored under the key the preview's card reads.
    expect(startUrlFor({ startUrl: "http://localhost:5174/deliveries" }, TARGET_APP_DEFAULTS)).toBe(
      DELIVERIES.url,
    );
  });
});
