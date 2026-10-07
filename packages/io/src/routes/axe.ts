/**
 * `GET /axe?page=<path>` or `GET /axe?url=<URL>`: one page scanned with axe-core against the WCAG
 * 2.2 A and AA tags, on desktop, as the `AxeScan` the preview's card shows (`docs/PLAN.md` F10,
 * `docs/specs/2026-10-06-s4-06-axe-sidecar.md` §5). `page=` is a target-app page at the app's
 * default parameters, on the target-app origin io is configured with; `url=` is any http(s) page,
 * opened as given (`docs/adr/0003-any-target.md`, D2).
 *
 * - 200 `AxeScan`: the page, as stored under its whole URL, or scanned on a miss and then stored.
 *   The same path on two sites is two scans (ADR 0003, D5).
 * - 400 `{ error }`: the query names no page `pageQuery` reads: neither `page` nor `url`, or both, a
 *   `page` not in `TARGET_APP_PATHS`, a `url` that `pageUrlParam` refuses; or it holds a repeated or
 *   an unknown key. Nothing is scanned.
 * - 502 `{ error }`: the scan failed with a `WayfordError`, as it does while the target app or the
 *   page is down. Nothing is stored.
 */
import { zValidator } from "@hono/zod-validator";
import { WayfordError } from "@wayford/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AxeLookup } from "../axe.js";
import { pageQuery } from "../page-ref.js";

/**
 * The query, `page` or `url`, exactly one, read as the page to scan. A repeated key arrives as an
 * array and fails its schema.
 */
function axeQuery(targetAppOrigin: string) {
  const { keys, pageRef } = pageQuery(targetAppOrigin);
  return z.object(keys).strict().transform(pageRef);
}

/** The route above, reading through `axe`, the app's one lookup (`createApp`). */
export function axeRoute({
  axe,
  targetAppOrigin,
}: {
  axe: AxeLookup;
  /** The target app's origin, like `http://localhost:5174`, with no trailing slash: `page=`'s. */
  targetAppOrigin: string;
}) {
  return new Hono().get(
    "/",
    zValidator("query", axeQuery(targetAppOrigin), (result, c) => {
      if (!result.success) return c.json({ error: z.prettifyError(result.error) }, 400);
    }),
    async (c) => {
      try {
        return c.json(await axe(c.req.valid("query")));
      } catch (error) {
        // Every failure the scan knows, a page that does not load included, is a `WayfordError`.
        // Anything else is a bug, for `createApp`'s logged 500.
        if (error instanceof WayfordError) {
          return c.json({ error: `${error.code}: ${error.message}` }, 502);
        }
        throw error;
      }
    },
  );
}
