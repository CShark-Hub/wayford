/**
 * The preview's way to io's `GET /axe` (`packages/io/src/routes/axe.ts`), through the dev server's
 * `/api` proxy: a page scanned with axe-core against the WCAG 2.2 A and AA tags, parsed with core's
 * `AxeScan` before the card shows it (s4-06). The page is a target-app page by its path or any page
 * by its whole URL, asked for as `pageParams` says (s3-16).
 */
import { queryOptions } from "@tanstack/react-query";
import { AxeScan } from "@wayford/core";
import { getFromIo, IO_CACHE, pageParams } from "./measure.js";

/** `GET /api/axe?page=…`, or `?url=…` for a URL page, parsed with `AxeScan` as `getFromIo` parses. */
export function fetchAxeScan(page: string): Promise<AxeScan> {
  return getFromIo("axe", new URLSearchParams(pageParams(page)), AxeScan, "an axe-core scan");
}

/**
 * The page's axe-core scan, under the key `["axe", page]`, cached as the measurement is
 * (`measurementQuery`). A URL page's key holds its whole URL, as io's does. The scan is by page
 * alone: it is the same for every persona and device, so the key holds neither. io keeps a scan
 * once it has one, as it keeps a measurement.
 */
export function axeQuery(page: string) {
  return queryOptions({ queryKey: ["axe", page], queryFn: () => fetchAxeScan(page), ...IO_CACHE });
}
