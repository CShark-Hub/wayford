/**
 * A page's axe-core scan, scanned once per page and stored (`docs/PLAN.md` F10,
 * `docs/specs/2026-10-06-s4-06-axe-sidecar.md` §3): a target-app page at one set of app parameters,
 * or any page as given (`docs/specs/2026-10-07-s4-09-io-any-url.md`, "io: axe"), keyed by its
 * whole URL, origin included, so the same path on two sites is two scans (ADR 0003, D5).
 * `GET /axe` reads it through `axeLookup`, and so does the report, so the two share one scan when
 * they ask together.
 *
 * The scanner itself, which loads Playwright, is handed in as an `AxeScanFn`, so this module stays
 * in io's barrel (s4-03, "The barrel").
 */
import type { AxeScan } from "@wayford/core";
import { loadAxeScan, saveAxeScan } from "./db/axe.js";
import type { Db } from "./db/database.js";
import type { PageRef } from "./page-ref.js";

/**
 * Scans one page, a target-app page or any page as `page.onTargetApp` says, into a scan keyed by
 * `page.url`. Every failure it knows is a `WayfordError`.
 */
export type AxeScanFn = (page: PageRef) => Promise<AxeScan>;

/** The stored scan of `page`, by its whole URL, or a fresh one, stored, on a miss. */
export type AxeLookup = (page: PageRef) => Promise<AxeScan>;

/**
 * The lookup above, on `db`, scanning with `scan` on a miss. It reads the store first, and only a
 * scan that succeeded is stored. Its map holds one promise per URL while it is in flight, so
 * requests that arrive together share one read and at most one scan. The promise is dropped once
 * it settles: a rejected one, so the next request scans again, and a fulfilled one too, since its
 * scan is in the store by then. So a scan deleted from the store is scanned again with no restart.
 *
 * The store and the map are keyed by `page.url` alone: a target-app page asked by `url=` is the
 * page `page=` names, and reads its scan.
 */
export function axeLookup({ db, scan }: { db: Db; scan: AxeScanFn }): AxeLookup {
  const inFlight = new Map<string, Promise<AxeScan>>();

  async function storedOrScanned(page: PageRef): Promise<AxeScan> {
    const stored = await loadAxeScan(db, page.url);
    if (stored !== undefined) return stored;
    const fresh = await scan(page);
    await saveAxeScan(db, fresh);
    return fresh;
  }

  return (page) => {
    const { url } = page;
    const known = inFlight.get(url);
    if (known !== undefined) return known;
    const fresh = storedOrScanned(page);
    inFlight.set(url, fresh);
    // The URL holds `fresh` until this runs: a URL is set again only once it is deleted.
    const drop = () => {
      inFlight.delete(url);
    };
    fresh.then(drop, drop);
    return fresh;
  };
}
