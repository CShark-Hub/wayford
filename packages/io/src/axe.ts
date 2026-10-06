/**
 * A target-app page's axe-core scan, scanned once per page and app parameters and stored
 * (`docs/PLAN.md` F10, `docs/specs/2026-10-06-s4-06-axe-sidecar.md` §3). `GET /axe` reads it
 * through `axeLookup`, and so does the report, so the two share one scan when they ask together.
 *
 * The scanner itself, which loads Playwright, is handed in as an `AxeScanFn`, so this module stays
 * in io's barrel (s4-03, "The barrel").
 */
import type { AxeScan } from "@wayford/core";
import { loadAxeScan, saveAxeScan } from "./db/axe.js";
import type { Db } from "./db/database.js";

/** Scans one target-app URL (an `AxeUrl`). Every failure it knows is a `WayfordError`. */
export type AxeScanFn = (url: string) => Promise<AxeScan>;

/** The stored scan of `url`, or a fresh one, stored, on a miss. */
export type AxeLookup = (url: string) => Promise<AxeScan>;

/** `page` at the app's query: `axeUrl("/deliveries", "?contrast=2&fontPx=16&targetPx=36")`. */
export function axeUrl(page: string, search: string): string {
  return `${page}${search}`;
}

/**
 * The lookup above, on `db`, scanning with `scan` on a miss. It reads the store first, and only a
 * scan that succeeded is stored. Its map holds one promise per URL while it is in flight, so
 * requests that arrive together share one read and at most one scan. The promise is dropped once
 * it settles: a rejected one, so the next request scans again, and a fulfilled one too, since its
 * scan is in the store by then. So a scan deleted from the store is scanned again with no restart.
 */
export function axeLookup({ db, scan }: { db: Db; scan: AxeScanFn }): AxeLookup {
  const inFlight = new Map<string, Promise<AxeScan>>();

  async function storedOrScanned(url: string): Promise<AxeScan> {
    const stored = await loadAxeScan(db, url);
    if (stored !== undefined) return stored;
    const fresh = await scan(url);
    await saveAxeScan(db, fresh);
    return fresh;
  }

  return (url) => {
    const known = inFlight.get(url);
    if (known !== undefined) return known;
    const fresh = storedOrScanned(url);
    inFlight.set(url, fresh);
    // The URL holds `fresh` until this runs: a URL is set again only once it is deleted.
    const drop = () => {
      inFlight.delete(url);
    };
    fresh.then(drop, drop);
    return fresh;
  };
}
