/**
 * `GET /measure?device=desktop|mobile&page=<path>` or `…&url=<URL>`: one page measured live on a
 * persona's device, as the `PageMeasurement` the preview perceives in the browser (s3-05,
 * `docs/PLAN.md` F2). The page is measured live, so the preview shows the page a run would start
 * on, not the stored fixture. `page=` is a target-app page at the app's default parameters; `url=`
 * is any http(s) page, opened as given (`docs/adr/0003-any-target.md`, D2).
 *
 * - 200 `PageMeasurement`. `device` is `desktop` when absent, and with neither `page` nor `url` the
 *   page is `/deliveries`.
 * - 400 `{ error }`: the query names no page `pageQuery` reads, such as a path outside the target
 *   app's `PAGES`, a `url` that `pageUrlParam` refuses, or `page` and `url` together; or it holds a
 *   device no persona is measured on, an unknown or a repeated key. Nothing is measured.
 * - 502 `{ error }`: the measurement failed with a `WayfordError`, as it does while the target app
 *   or the page is down. The preview then falls back to the stored page.
 *
 * Each device and page is measured once and kept until io restarts (`tasks/s3-05-live-preview.md`,
 * Constraints), keyed by the page's whole URL, origin included (ADR 0003, D5), so one path on two
 * sites is two measurements: the target app's pages are static at its defaults, and the preview's
 * sliders move profile thresholds, never the page. A failed measurement is not kept, so a page
 * that comes up after io is measured on the next request.
 */
import { zValidator } from "@hono/zod-validator";
import { DeviceKind, type PageMeasurement, WayfordError } from "@wayford/core";
import { Hono } from "hono";
import { z } from "zod";
import { type PageRef, pageQuery } from "../page-ref.js";

/** The devices a page is measured on: core's `DeviceKind` without `tablet`, which no persona uses. */
export const MeasureDevice = DeviceKind.exclude(["tablet"]);
export type MeasureDevice = z.infer<typeof MeasureDevice>;

/**
 * One page on `device`: a target-app page at its default parameters, or any page as given, as
 * `page.onTargetApp` says.
 */
export type MeasureFn = (device: MeasureDevice, page: PageRef) => Promise<PageMeasurement>;

/**
 * The query, each key optional, read as the device and the page to measure: `/deliveries` when it
 * names no page. A repeated key arrives as an array and fails its schema.
 */
function measureQuery(targetAppOrigin: string) {
  const { keys, pageRef } = pageQuery(targetAppOrigin, { defaultPage: "/deliveries" });
  return z
    .object({ device: MeasureDevice.default("desktop"), ...keys })
    .strict()
    .transform(({ device, ...asked }, ctx) => ({ device, page: pageRef(asked, ctx) }));
}

/**
 * The route above. Its map holds one promise per device and whole URL for the app's life, so
 * requests that arrive together share one measurement, and a rejected promise is dropped.
 */
export function measureRoute({
  measure,
  targetAppOrigin,
}: {
  measure: MeasureFn;
  /** The target app's origin, like `http://localhost:5174`, with no trailing slash: `page=`'s. */
  targetAppOrigin: string;
}) {
  const kept = new Map<string, Promise<PageMeasurement>>();

  function measured(device: MeasureDevice, page: PageRef): Promise<PageMeasurement> {
    const key = `${device} ${page.url}`;
    const known = kept.get(key);
    if (known !== undefined) return known;
    const fresh = measure(device, page);
    kept.set(key, fresh);
    // The key holds `fresh` until this runs: a key is set again only once it is deleted.
    fresh.catch(() => kept.delete(key));
    return fresh;
  }

  return new Hono().get(
    "/",
    zValidator("query", measureQuery(targetAppOrigin), (result, c) => {
      if (!result.success) return c.json({ error: z.prettifyError(result.error) }, 400);
    }),
    async (c) => {
      const { device, page } = c.req.valid("query");
      try {
        return c.json(await measured(device, page));
      } catch (error) {
        // Every failure the measurement knows, a page that does not load included, is a
        // `WayfordError`. Anything else is a bug, for `createApp`'s logged 500.
        if (error instanceof WayfordError) {
          return c.json({ error: `${error.code}: ${error.message}` }, 502);
        }
        throw error;
      }
    },
  );
}
