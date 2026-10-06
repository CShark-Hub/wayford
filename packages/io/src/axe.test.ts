/**
 * `axeLookup` on a fake `AxeScanFn` (`docs/specs/2026-10-06-s4-06-axe-sidecar.md`, §3): a miss
 * scans and stores, a hit reads the store, requests that arrive together share one scan, a failed
 * scan is not stored, and a stored scan outlives the lookup that took it. The real scanner is
 * `axe.browser.test.ts`'s.
 */
import { type AxeScan, WayfordError } from "@wayford/core";
import { axeScanFixture } from "@wayford/core/fixtures";
import { TARGET_APP_DEFAULT_QUERY } from "@wayford/filter/serve-target-app";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type AxeScanFn, axeLookup } from "./axe.js";
import { loadAxeScan } from "./db/axe.js";
import { axeResults } from "./db/schema.js";
import { gate, type TempStore, tempStore } from "./test-app.js";

const deliveries = `/deliveries${TARGET_APP_DEFAULT_QUERY}`;

/** `/deliveries`' real scan as if taken at `url`: one `color-contrast` violation, not empty. */
const scanned = (url: string): AxeScan => ({ ...axeScanFixture("/deliveries"), url });

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
  test("a miss scans and stores; each url is scanned once, and a second request reads the store", async () => {
    const { axe, scan } = lookupWith(async (url) => scanned(url));
    const settings = `/settings/data${TARGET_APP_DEFAULT_QUERY}`;
    expect(await axe(deliveries)).toStrictEqual(scanned(deliveries));
    expect(await loadAxeScan(store.db, deliveries)).toStrictEqual(scanned(deliveries));
    await axe(settings);
    expect(await axe(deliveries)).toStrictEqual(scanned(deliveries));
    expect(scan.mock.calls).toEqual([[deliveries], [settings]]);
  });

  test("requests that arrive together share one scan", async () => {
    const held = gate();
    const { axe, scan } = lookupWith(async (url) => {
      await held.promise;
      return scanned(url);
    });
    const answers = Promise.all([axe(deliveries), axe(deliveries)]);
    await vi.waitFor(() => expect(scan).toHaveBeenCalledTimes(1));
    held.open();
    const [a, b] = await answers;
    expect(b).toStrictEqual(a);
    expect(scan).toHaveBeenCalledTimes(1);
  });

  test("a failed scan rejects, is not stored, and the next request scans again", async () => {
    let up = false;
    const { axe, scan } = lookupWith(async (url) => {
      if (!up) throw new WayfordError("target_app_unavailable", "the target app did not answer");
      return scanned(url);
    });
    await expect(axe(deliveries)).rejects.toMatchObject({ code: "target_app_unavailable" });
    expect(await loadAxeScan(store.db, deliveries)).toBeUndefined();
    up = true;
    expect(await axe(deliveries)).toStrictEqual(scanned(deliveries));
    expect(scan).toHaveBeenCalledTimes(2);
  });

  test("a new lookup on the same database reads the stored scan and scans nothing", async () => {
    const before = lookupWith(async (url) => scanned(url));
    await before.axe(deliveries);
    // io restarted: a new lookup, with nothing in flight, on the database the first one wrote.
    const after = lookupWith(async (url) => scanned(url));
    expect(await after.axe(deliveries)).toStrictEqual(scanned(deliveries));
    expect(after.scan).not.toHaveBeenCalled();
  });

  test("a scan deleted from the store is scanned again on the next request", async () => {
    // `db/axe.ts`'s way to scan again: `DELETE FROM axe_results`, with no restart.
    const { axe, scan } = lookupWith(async (url) => scanned(url));
    await axe(deliveries);
    store.db.delete(axeResults).run();
    expect(await axe(deliveries)).toStrictEqual(scanned(deliveries));
    expect(scan).toHaveBeenCalledTimes(2);
  });
});
