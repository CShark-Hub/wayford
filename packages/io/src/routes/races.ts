/**
 * `/races`: the run sets `POST /runs` started, read back, so the web can reopen a race's live view
 * after leaving the screen or reloading, and list races in its history (issue #194), and stopped
 * from the Race screen (#6, `docs/specs/2026-11-08-6-stop-race.md`). `POST /runs` stores a race,
 * and its runs are under `/runs`.
 *
 * - `GET /`: every stored race, newest first, each as `{ ...race, status, waiting }`.
 * - `GET /:id`: the stored race as `{ ...race, status, waiting }`, or 404.
 * - `POST /:id/cancel`, with the body `{}`: the stop. The race's runs still waiting for a slot are
 *   dropped, so they never start, and the runs under way finish.
 *   - 202 `{ stopped, dequeued }`: `dequeued` runs were dropped, which the race's `cancelled` now
 *     names; 0 when none was waiting, as on a second stop. `stopped` counts the runs under way the
 *     stop ended: 0, since they finish.
 *   - 200 `{ stopped: 0, dequeued: 0 }`: the race had finished, one an earlier process started
 *     included, so nothing is written.
 *   - 404 `{ error }`: io keeps no race under that id, as for `GET /:id`.
 *   - 400 `{ error }`: the body is not `{}`. 415 from `createApp` for a body that is not
 *     `application/json`, and 413 for one over `MAX_BODY_BYTES`.
 *   - 500 `{ error }`: the runs were dropped, but the stop could not be recorded. The message says
 *     how many.
 *
 * The stop is the one write: it records in the race the runs it dropped, since such a run leaves
 * no record of its own. `status` and `waiting` are never stored: each request reads them off this
 * process's runner (`raceStatus`, `waitingOf`). The list takes no query and checks none, as
 * `GET /tasks` does not: with no filter, there is none to misspell.
 */
import { zValidator } from "@hono/zod-validator";
import type { Race, RaceStatus, RunId } from "@wayford/core";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Logger } from "pino";
import { z } from "zod";
import type { Db } from "../db/database.js";
import { listRaces, loadRace, updateRace } from "../db/races.js";
import type { Runner } from "../runner.js";

/**
 * `running` while at least one of the race's runs is live in this process and has not ended,
 * `finished` otherwise. A run ends once its save has been tried (`runner.ts`), or at once when a
 * stop drops it while it waits for a slot, so every run of a finished race is under
 * `GET /runs/:id`, except one a stop dropped, which the race's `cancelled` names, and one that
 * never started or could not be stored. A race stored by an earlier process reads `finished`:
 * this runner never saw its runs, and those still in flight when that process stopped were never
 * stored, so `GET /runs/:id` lacks them.
 */
function raceStatus(race: Race, runner: Pick<Runner, "live">): RaceStatus {
  // `false` only for a run this runner started and has not ended; `undefined` for one it never saw.
  return race.runs.some(({ id }) => runner.live(id)?.ended === false) ? "running" : "finished";
}

/**
 * The race's runs still waiting for a slot in this process, in the race's order (#6): none once it
 * has finished, and none of a race an earlier process started, since this runner never queued them.
 */
function waitingOf(race: Race, runner: Pick<Runner, "waiting">): RunId[] {
  return race.runs.map(({ id }) => id).filter((id) => runner.waiting(id));
}

/** The body of `POST /:id/cancel`: nothing, strictly, so a typo is seen. */
const CancelRequest = z.object({}).strict();

/**
 * What the races routes use: the database; the app's one runner, which gives each race its status
 * and its waiting runs, and drops them on a stop; and the logger a stop is told to.
 */
type RacesRouteOptions = { db: Db; runner: Runner; logger: Logger };

/**
 * Writes into `race` the stop that dropped `dequeued`, and logs it. A failed write is logged, then
 * thrown as a 500 that says the runs were stopped all the same, since by then they were: no
 * failure ends in a log line alone (`docs/CONVENTIONS.md`, "Errors"). Once io restarts, such a
 * race draws its dropped runs as lost streams, which is all io kept of them.
 */
async function recordStop(
  { db, logger }: Pick<RacesRouteOptions, "db" | "logger">,
  race: Race,
  dequeued: RunId[],
): Promise<void> {
  const about = { raceId: race.id, dequeued: dequeued.length };
  try {
    // `new Date()` is a timestamp, never a decision.
    await updateRace(db, { ...race, cancelled: { at: new Date().toISOString(), dequeued } });
  } catch (error) {
    logger.error({ ...about, err: error }, "the stop dropped runs but could not be recorded");
    const runs =
      dequeued.length === 1
        ? "1 run waiting for a slot was"
        : `${dequeued.length} runs waiting for a slot were`;
    throw new HTTPException(500, {
      message: `${runs} stopped, but the stop could not be recorded`,
      cause: error,
    });
  }
  logger.info(about, "race stopped");
}

/**
 * The routes above. The stop is the one write, and only a stop that dropped runs makes it: it drops
 * every run of the race still waiting, and no run joins the queue again, so a later stop has
 * nothing to record and the record is never merged.
 */
export function racesRoute({ db, runner, logger }: RacesRouteOptions) {
  const answer = (race: Race) => ({
    ...race,
    status: raceStatus(race, runner),
    waiting: waitingOf(race, runner),
  });
  return new Hono()
    .get("/", async (c) => c.json((await listRaces(db)).map(answer)))
    .get("/:id", async (c) => {
      const id = c.req.param("id");
      const race = await loadRace(db, id);
      return race === undefined ? c.json({ error: `no race ${id}` }, 404) : c.json(answer(race));
    })
    .post(
      "/:id/cancel",
      zValidator("json", CancelRequest, (result, c) => {
        if (!result.success) return c.json({ error: z.prettifyError(result.error) }, 400);
      }),
      async (c) => {
        const id = c.req.param("id");
        const race = await loadRace(db, id);
        if (race === undefined) return c.json({ error: `no race ${id}` }, 404);
        // A race that has finished, one an earlier process started included, has nothing to stop.
        if (raceStatus(race, runner) === "finished") {
          return c.json({ stopped: 0, dequeued: 0 }, 200);
        }
        // Nothing is awaited between the status read and the drop, so no run of the race can take
        // a slot in between: each run reported dropped never starts.
        const dequeued = runner.cancel(race.runs.map((run) => run.id));
        if (dequeued.length > 0) await recordStop({ db, logger }, race, dequeued);
        return c.json({ stopped: 0, dequeued: dequeued.length }, 202);
      },
    );
}
