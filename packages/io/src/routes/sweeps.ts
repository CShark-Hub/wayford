/**
 * `/sweeps`: the stored sweeps, read back (`docs/specs/2026-10-05-s4-05-sweep.md`, "io: storage
 * and routes"). A sweep is started from the CLI, so there is no `POST`; its runs are under
 * `GET /runs?sweepId=`.
 *
 * - `GET /`: every stored sweep matching the query's `profileId` and `axis`, newest first, as
 *   `Sweep[]`. Any other key is a 400, so a misspelt filter never lists every sweep.
 * - `GET /:id`: the stored `Sweep`, or 404. A running sweep is stored before its first value, so
 *   it is served with `status: "incomplete"` while it runs.
 */
import { zValidator } from "@hono/zod-validator";
import { ProfileId, SweepAxis } from "@wayford/core";
import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/database.js";
import { listSweeps, loadSweep } from "../db/sweeps.js";

/** The query of `GET /sweeps`: what `listSweeps` narrows by, each key at most once. */
const SweepsQuery = z
  .object({
    profileId: ProfileId.exactOptional(),
    axis: SweepAxis.exactOptional(),
  })
  .strict();

/** The database the sweeps are read from. */
type SweepsRouteOptions = { db: Db };

/** The routes above. Nothing here writes. */
export function sweepsRoute({ db }: SweepsRouteOptions) {
  return new Hono()
    .get(
      "/",
      zValidator("query", SweepsQuery, (result, c) => {
        if (!result.success) return c.json({ error: z.prettifyError(result.error) }, 400);
      }),
      async (c) => c.json(await listSweeps(db, c.req.valid("query"))),
    )
    .get("/:id", async (c) => {
      const id = c.req.param("id");
      const sweep = await loadSweep(db, id);
      return sweep === undefined ? c.json({ error: `no stored sweep ${id}` }, 404) : c.json(sweep);
    });
}
