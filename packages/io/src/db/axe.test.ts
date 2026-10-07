import type { AxeScan } from "@wayford/core";
import { axeScanFixture } from "@wayford/core/fixtures";
import { TARGET_APP_DEFAULT_QUERY } from "@wayford/filter/serve-target-app";
import { afterEach, beforeEach, expect, test } from "vitest";
import { type TempStore, tempStore } from "../test-app.js";
import { loadAxeScan, saveAxeScan } from "./axe.js";
import { axeResults } from "./schema.js";

let store: TempStore;
beforeEach(async () => {
  store = await tempStore();
});
afterEach(async () => {
  await store.close();
});

/** `/deliveries` at the target app's defaults, with its one `color-contrast` violation. */
const scan = axeScanFixture("/deliveries");

test("a saved scan loads back deep-equal", async () => {
  await saveAxeScan(store.db, scan);
  expect(await loadAxeScan(store.db, scan.url)).toStrictEqual(scan);
});

test("a second scan of the same url replaces the first, in one row", async () => {
  await saveAxeScan(store.db, scan);
  const later: AxeScan = { ...scan, scannedAt: "2026-10-07T09:00:00.000Z", violations: [] };
  await saveAxeScan(store.db, later);
  expect(await loadAxeScan(store.db, scan.url)).toStrictEqual(later);
  expect(store.db.select().from(axeResults).all()).toHaveLength(1);
});

test("a url with no stored scan loads as undefined", async () => {
  // A stored scan, so a lookup that ignored the url would return it.
  await saveAxeScan(store.db, scan);
  const other = `http://localhost:5174/settings/data${TARGET_APP_DEFAULT_QUERY}`;
  expect(await loadAxeScan(store.db, other)).toBeUndefined();
});

test("an invalid scan is refused and nothing is stored", async () => {
  // A path with no origin: the key is the page's whole URL since s4-09.
  const pathOnly = { ...scan, url: `/deliveries${TARGET_APP_DEFAULT_QUERY}` };
  await expect(saveAxeScan(store.db, pathOnly)).rejects.toMatchObject({ code: "invalid_row" });
  expect(store.db.select().from(axeResults).all()).toStrictEqual([]);
});
