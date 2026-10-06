/**
 * `GET /axe?page=<path>`: one target-app page at the app's default parameters, scanned with
 * axe-core against the WCAG 2.2 A and AA tags, as the `AxeScan` the preview's card shows
 * (`docs/PLAN.md` F10, `docs/specs/2026-10-06-s4-06-axe-sidecar.md` §5).
 *
 * - 200 `AxeScan`: the page at `TARGET_APP_DEFAULT_QUERY`, as stored, or scanned on a miss and then
 *   stored.
 * - 400 `{ error }`: `page` is missing, not in `TARGET_APP_PATHS`, or repeated, or the query has an
 *   unknown key. Nothing is scanned.
 * - 502 `{ error }`: the scan failed with a `WayfordError`, as it does while the target app is
 *   down. Nothing is stored.
 */
import { zValidator } from "@hono/zod-validator";
import { WayfordError } from "@wayford/core";
import { TARGET_APP_DEFAULT_QUERY, TARGET_APP_PATHS } from "@wayford/filter/serve-target-app";
import { Hono } from "hono";
import { z } from "zod";
import { type AxeLookup, axeUrl } from "../axe.js";

/** The query: `page` alone, required. A repeated key arrives as an array and fails its schema. */
const AxeQuery = z
  .object({
    page: z.string().refine((path) => TARGET_APP_PATHS.includes(path), {
      message: `page must be one of the target app's pages: ${TARGET_APP_PATHS.join(", ")}`,
    }),
  })
  .strict();

/** The route above, reading through `axe`, the app's one lookup (`createApp`). */
export function axeRoute({ axe }: { axe: AxeLookup }) {
  return new Hono().get(
    "/",
    zValidator("query", AxeQuery, (result, c) => {
      if (!result.success) return c.json({ error: z.prettifyError(result.error) }, 400);
    }),
    async (c) => {
      const { page } = c.req.valid("query");
      try {
        return c.json(await axe(axeUrl(page, TARGET_APP_DEFAULT_QUERY)));
      } catch (error) {
        // Every failure the scan knows, the target app down included, is a `WayfordError`.
        // Anything else is a bug, for `createApp`'s logged 500.
        if (error instanceof WayfordError) {
          return c.json({ error: `${error.code}: ${error.message}` }, 502);
        }
        throw error;
      }
    },
  );
}
