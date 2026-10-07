/**
 * `axeLookup` on a fake `AxeScanFn` (`docs/specs/2026-10-06-s4-06-axe-sidecar.md`, §3, and
 * `docs/specs/2026-10-07-s4-09-io-any-url.md`, "io: axe"): a miss scans and stores, a hit reads
 * the store, requests that arrive together share one scan, a failed scan is not stored, a stored
 * scan outlives the lookup that took it, and every scan is keyed by its page's whole URL. The real
 * scanner is `axe.browser.test.ts`'s.
 */
import { type AxeScan, WayfordError } from "@wayford/core";
import { axeScanFixture } from "@wayford/core/fixtures";
import { TARGET_APP_DEFAULT_QUERY } from "@wayford/filter/serve-target-app";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type AxeScanFn, axeLookup } from "./axe.js";
import { loadAxeScan } from "./db/axe.js";
import { axeResults } from "./db/schema.js";
import { type PageRef, targetAppPage } from "./page-ref.js";
import { gate, type TempStore, tempStore } from "./test-app.js";

const APP = "http://localhost:5174";
const deliveries = targetAppPage(APP, "/deliveries", TARGET_APP_DEFAULT_QUERY);

/** `/deliveries`' real scan as if taken of `page`: one `color-contrast` violation, not empty. */
const scanned = (page: PageRef): AxeScan => ({ ...axeScanFixture("/deliveries"), url: page.url });

let store: TempStore;
beforeEach(async () => {
  store = await tempStore();
});
afterEach(async () => {
  await store.close();
});

/** A lookup on the store whose scan is `fn`, counted. */
function lookupWith(fn: AxeScanFn) {
  const scan = vi.fn(fn);
  return { axe: axeLookup({ db: store.db, scan }), scan };
}

describe("axeLookup", () => {
  test("a miss scans and stores; each page is scanned once, and a second request reads the store", async () => {
    const { axe, scan } = lookupWith(async (page) => scanned(page));
    const settings = targetAppPage(APP, "/settings/data", TARGET_APP_DEFAULT_QUERY);
    expect(await axe(deliveries)).toStrictEqual(scanned(deliveries));
    expect(await loadAxeScan(store.db, deliveries.url)).toStrictEqual(scanned(deliveries));
    await axe(settings);
    expect(await axe(deliveries)).toStrictEqual(scanned(deliveries));
    expect(scan.mock.calls).toEqual([[deliveries], [settings]]);
  });

  test("a page is keyed by its whole URL: one path on two origins is two scans, one URL one", async () => {
    const { axe, scan } = lookupWith(async (page) => scanned(page));
    const one: PageRef = { url: "http://127.0.0.1:8001/page", onTargetApp: false };
    const two: PageRef = { url: "http://127.0.0.1:8002/page", onTargetApp: false };
    expect((await axe(one)).url).toBe(one.url);
    expect((await axe(two)).url).toBe(two.url);
    expect(await loadAxeScan(store.db, one.url)).toStrictEqual(scanned(one));
    expect(await loadAxeScan(store.db, two.url)).toStrictEqual(scanned(two));

    // The target app's page asked by `url=` is the same page: its stored scan answers.
    await axe(deliveries);
    expect(await axe({ url: deliveries.url, onTargetApp: false })).toStrictEqual(
      scanned(deliveries),
    );
    expect(scan.mock.calls).toEqual([[one], [two], [deliveries]]);
  });

  test("requests that arrive together share one scan", async () => {
    const held = gate();
    const { axe, scan } = lookupWith(async (page) => {
      await held.promise;
      return scanned(page);
    });
    const answers = Promise.all([axe(deliveries), axe({ ...deliveries })]);
    await vi.waitFor(() => expect(scan).toHaveBeenCalledTimes(1));
    held.open();
    const [a, b] = await answers;
    expect(b).toStrictEqual(a);
    expect(scan).toHaveBeenCalledTimes(1);
  });

  test("a failed scan rejects, is not stored, and the next request scans again", async () => {
    let up = false;
    const { axe, scan } = lookupWith(async (page) => {
      if (!up) throw new WayfordError("target_app_unavailable", "the target app did not answer");
      return scanned(page);
    });
    await expect(axe(deliveries)).rejects.toMatchObject({ code: "target_app_unavailable" });
    expect(await loadAxeScan(store.db, deliveries.url)).toBeUndefined();
    up = true;
    expect(await axe(deliveries)).toStrictEqual(scanned(deliveries));
    expect(scan).toHaveBeenCalledTimes(2);
  });

  test("a new lookup on the same database reads the stored scan and scans nothing", async () => {
    const before = lookupWith(async (page) => scanned(page));
    await before.axe(deliveries);
    // io restarted: a new lookup, with nothing in flight, on the database the first one wrote.
    const after = lookupWith(async (page) => scanned(page));
    expect(await after.axe(deliveries)).toStrictEqual(scanned(deliveries));
    expect(after.scan).not.toHaveBeenCalled();
  });

  test("a scan deleted from the store is scanned again on the next request", async () => {
    // `db/axe.ts`'s way to scan again: `DELETE FROM axe_results`, with no restart.
    const { axe, scan } = lookupWith(async (page) => scanned(page));
    await axe(deliveries);
    store.db.delete(axeResults).run();
    expect(await axe(deliveries)).toStrictEqual(scanned(deliveries));
    expect(scan).toHaveBeenCalledTimes(2);
  });
});
