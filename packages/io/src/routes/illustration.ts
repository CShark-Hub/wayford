/**
 * `GET /illustration?device=desktop|mobile&emulation=<VisionDeficiency>`: the target app's
 * `/deliveries` at its default parameters, as a PNG taken on a persona's device under Chrome's
 * vision emulation (s3-06, `docs/PLAN.md` F2 AC4). The Lens shows it as an illustration, never as
 * the filter's decision: nothing here reaches `perceive`, and the picture takes no threshold.
 *
 * - 200 the PNG's bytes, `content-type: image/png`. `device` is `desktop` and `emulation` is `none`
 *   when absent.
 * - 400 `{ error }`: the query is not an `IllustrationQuery`: a device no persona is measured on, an
 *   emulation Chrome does not know, an unknown or a repeated key. Nothing is pictured.
 * - 502 `{ error }`: the capture failed with a `WayfordError`, as it does while the target app is
 *   down. The Lens then falls back to the stored picture.
 *
 * Each device and emulation is pictured once and kept until io restarts, as `/measure` keeps its
 * measurements (`routes/measure.ts`): the page is static at the app's defaults, and the Lens's
 * sliders move profile thresholds, never the page or the emulation. A failed capture is not kept,
 * so a target app started after io is pictured on the next request.
 */
import { zValidator } from "@hono/zod-validator";
import { VisionDeficiency, WayfordError } from "@wayford/core";
import { Hono } from "hono";
import { z } from "zod";
import { MeasureDevice } from "./measure.js";

/** The target app's `/deliveries` at its default parameters, on `device`, under `emulation`. */
export type IllustrateFn = (
  device: MeasureDevice,
  emulation: VisionDeficiency,
) => Promise<Uint8Array>;

/** The query, each key optional. A repeated key arrives as an array and fails its schema. */
const IllustrationQuery = z
  .object({
    device: MeasureDevice.default("desktop"),
    emulation: VisionDeficiency.default("none"),
  })
  .strict();

/**
 * The route above. Its map holds one promise per device and emulation for the app's life, so
 * requests that arrive together share one capture, and a rejected promise is dropped.
 */
export function illustrationRoute({ illustrate }: { illustrate: IllustrateFn }) {
  const kept = new Map<string, Promise<Uint8Array>>();

  function pictured(device: MeasureDevice, emulation: VisionDeficiency): Promise<Uint8Array> {
    const key = `${device} ${emulation}`;
    const known = kept.get(key);
    if (known !== undefined) return known;
    const fresh = illustrate(device, emulation);
    kept.set(key, fresh);
    // The key holds `fresh` until this runs: a key is set again only once it is deleted.
    fresh.catch(() => kept.delete(key));
    return fresh;
  }

  return new Hono().get(
    "/",
    zValidator("query", IllustrationQuery, (result, c) => {
      if (!result.success) return c.json({ error: z.prettifyError(result.error) }, 400);
    }),
    async (c) => {
      const { device, emulation } = c.req.valid("query");
      try {
        const png = await pictured(device, emulation);
        // A copy per answer, on an `ArrayBuffer` of its own, so no answer shares the kept bytes.
        return c.body(new Uint8Array(png), 200, { "content-type": "image/png" });
      } catch (error) {
        // Every failure the capture knows, the target app down included, is a `WayfordError`.
        // Anything else is a bug, for `createApp`'s logged 500.
        if (error instanceof WayfordError) {
          return c.json({ error: `${error.code}: ${error.message}` }, 502);
        }
        throw error;
      }
    },
  );
}
