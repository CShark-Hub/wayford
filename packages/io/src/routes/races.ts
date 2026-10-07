/**
 * `/races`: the run sets `POST /runs` started, read back, so the web can reopen a race's live view
 * after leaving the screen or reloading, and list races in its history (issue #194). `POST /runs`
 * stores a race, so there is no `POST` here; its runs are under `/runs`.
 *
 * - `GET /`: every stored race, newest first, each as `{ ...race, status }`.
 * - `GET /:id`: the stored race as `{ ...race, status }`, or 404.
 *
 * `status` is never stored: each request reads it off this process's runner (`raceStatus`). The
 * list takes no query and checks none, as `GET /tasks` does not: with no filter, there is none
 * to misspell.
 */
import type { Race, RaceStatus } from "@wayford/core";
import { Hono } from "hono";
import type { Db } from "../db/database.js";
import { listRaces, loadRace } from "../db/races.js";
import type { Runner } from "../runner.js";

/**
 * `running` while at least one of the race's runs is live in this process and has not ended,
 * `finished` otherwise. A run ends once its save has been tried (`runner.ts`), so every run of a
 * finished race is under `GET /runs/:id`, except one that never started or could not be stored.
 * A race stored by an earlier process reads `finished`: this runner never saw its runs, and those
 * still in flight when that process stopped were never stored, so `GET /runs/:id` lacks them.
 */
function raceStatus(race: Race, runner: Pick<Runner, "live">): RaceStatus {
  // `false` only for a run this runner started and has not ended; `undefined` for one it never saw.
  return race.runs.some(({ id }) => runner.live(id)?.ended === false) ? "running" : "finished";
}

/** What the races routes read: the database, and the app's one runner for each race's status. */
type RacesRouteOptions = { db: Db; runner: Runner };

/** The routes above. Nothing here writes. */
export function racesRoute({ db, runner }: RacesRouteOptions) {
  const withStatus = (race: Race) => ({ ...race, status: raceStatus(race, runner) });
  return new Hono()
    .get("/", async (c) => c.json((await listRaces(db)).map(withStatus)))
    .get("/:id", async (c) => {
      const id = c.req.param("id");
      const race = await loadRace(db, id);
      return race === undefined
        ? c.json({ error: `no race ${id}` }, 404)
        : c.json(withStatus(race));
    });
}
