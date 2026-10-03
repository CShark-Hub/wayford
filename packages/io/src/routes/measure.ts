/**
 * `GET /measure?device=desktop|mobile&page=<path>`: one target-app page at the app's default
 * parameters, measured on a persona's device, as the `PageMeasurement` the preview perceives in
 * the browser (s3-05, `docs/PLAN.md` F2). The page is measured live, so the preview shows the page
 * a run would start on, not the stored fixture.
 *
 * - 200 `PageMeasurement`. `device` is `desktop` and `page` is `/deliveries` when absent.
 * - 400 `{ error }`: the query is not a `MeasureQuery`: a path outside the target app's `PAGES`, a
 *   device no persona is measured on, an unknown or a repeated key. Nothing is measured.
 * - 502 `{ error }`: the measurement failed with a `WayfordError`, as it does while the target app
 *   is down. The preview then falls back to the stored page.
 *
 * Each device and page is measured once and kept until io restarts (`tasks/s3-05-live-preview.md`,
 * Constraints): the target app's pages are static at its defaults, and the preview's sliders move
 * profile thresholds, never the page. A failed measurement is not kept, so a target app started
 * after io is measured on the next request.
 */
import { zValidator } from "@hono/zod-validator";
import { DeviceKind, type PageMeasurement, WayfordError } from "@wayford/core";
import { TARGET_APP_PATHS } from "@wayford/filter/serve-target-app";
import { Hono } from "hono";
import { z } from "zod";

/** The devices a page is measured on: core's `DeviceKind` without `tablet`, which no persona uses. */
export const MeasureDevice = DeviceKind.exclude(["tablet"]);
export type MeasureDevice = z.infer<typeof MeasureDevice>;

/** One target-app page, a path in `TARGET_APP_PATHS`, at its default parameters, on `device`. */
export type MeasureFn = (device: MeasureDevice, path: string) => Promise<PageMeasurement>;

/** The query, each key optional. A repeated key arrives as an array and fails its schema. */
const MeasureQuery = z
  .object({
    device: MeasureDevice.default("desktop"),
    page: z
      .string()
      .refine((path) => TARGET_APP_PATHS.includes(path), {
        message: `page must be one of the target app's pages: ${TARGET_APP_PATHS.join(", ")}`,
      })
      .default("/deliveries"),
  })
  .strict();

/**
 * The route above. Its map holds one promise per device and page for the app's life, so requests
 * that arrive together share one measurement, and a rejected promise is dropped.
 */
export function measureRoute({ measure }: { measure: MeasureFn }) {
  const kept = new Map<string, Promise<PageMeasurement>>();

  function measured(device: MeasureDevice, path: string): Promise<PageMeasurement> {
    const key = `${device} ${path}`;
    const known = kept.get(key);
    if (known !== undefined) return known;
    const fresh = measure(device, path);
    kept.set(key, fresh);
    // The key holds `fresh` until this runs: a key is set again only once it is deleted.
    fresh.catch(() => kept.delete(key));
    return fresh;
  }

  return new Hono().get(
    "/",
    zValidator("query", MeasureQuery, (result, c) => {
      if (!result.success) return c.json({ error: z.prettifyError(result.error) }, 400);
    }),
    async (c) => {
      const { device, page } = c.req.valid("query");
      try {
        return c.json(await measured(device, page));
      } catch (error) {
        // Every failure the measurement knows, the target app down included, is a `WayfordError`.
        // Anything else is a bug, for `createApp`'s logged 500.
        if (error instanceof WayfordError) {
          return c.json({ error: `${error.code}: ${error.message}` }, 502);
        }
        throw error;
      }
    },
  );
}
