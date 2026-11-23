/**
 * The Race's way to io's races (`packages/io/src/routes/races.ts`), through the dev server's `/api`
 * proxy. A race is the runs one `POST /runs` started: io keeps it, so the Race can reopen it after
 * its screen was left or the page reloaded, and list it in its History. Nothing here starts one:
 * `startRuns` in `api/runs.ts` does, and hands back the race's id. `cancelRace` stops one (#6): io
 * drops its runs still waiting for a slot, and the runs under way finish.
 *
 * A non-OK answer, or a body that is not a race or a stop, rejects as `parseResponse` in
 * `api/runs.ts` words it.
 */
import { queryOptions } from "@tanstack/react-query";
import { RaceStatus, RunId, Race as StoredRace } from "@wayford/core";
import { z } from "zod";
import { parseResponse, postJson } from "./runs.js";

/**
 * One race as io answers it: core's `Race`, the stored task its runs share whole, their receipts
 * seed-major and its stop if a stop dropped any, and two answers read off io's runner when asked.
 * `status` is `finished` once none of its runs is in flight in io's process: every run has ended
 * or been dropped, or io restarted, which ends a run under way unstored. `waiting` are its runs
 * still waiting for a slot, in the race's order (#6): none once it has finished, and none of a race
 * an earlier io process started.
 */
export const Race = StoredRace.extend({ status: RaceStatus, waiting: z.array(RunId) });
export type Race = z.infer<typeof Race>;

/**
 * io's answer to a stop (#6): `dequeued` counts the runs it dropped from the queue before they
 * started, and `stopped` the runs under way it ended, none while io lets those finish.
 */
export const RaceStop = z
  .object({ stopped: z.number().int().nonnegative(), dequeued: z.number().int().nonnegative() })
  .strict();
export type RaceStop = z.infer<typeof RaceStop>;

/** A race's own path under io's `/races`, its id encoded. */
function racePath(id: string): string {
  return `/api/races/${encodeURIComponent(id)}`;
}

/** `GET /api/races`: every race io keeps, newest first. */
export async function fetchRaces(): Promise<Race[]> {
  return parseResponse(await fetch("/api/races"), Race.array(), "a list of races");
}

/** `GET /api/races/:id`, the id encoded, or `null` on 404 (io keeps no race under that id). */
export async function fetchRace(id: string): Promise<Race | null> {
  const response = await fetch(racePath(id));
  if (response.status === 404) return null;
  return parseResponse(response, Race, "a race");
}

/**
 * `POST /api/races/:id/cancel` with the body `{}`, which io requires, the id encoded. io's 202 is
 * the stop made, and its 200 a race already finished, with nothing to stop: both parse into
 * `RaceStop`. Anything else rejects, with io's reason when it sent one: a 404 for an unknown race,
 * and a 500 when io dropped runs but could not record the stop.
 */
export async function cancelRace(id: string): Promise<RaceStop> {
  return parseResponse(await postJson(`${racePath(id)}/cancel`, {}), RaceStop, "a stop");
}

/** How often the History asks again while a race in it is running: a run takes tens of seconds. */
export const RACES_POLL_MS = 3000;

/**
 * Every race, newest first, under the key `["races"]`. Asked again every `RACES_POLL_MS` while one
 * of them is running, so a race moves from running to finished in the History on its own.
 */
export function racesQuery() {
  return queryOptions({
    queryKey: ["races"],
    queryFn: fetchRaces,
    refetchInterval: (query) =>
      query.state.data?.some((race) => race.status === "running") ? RACES_POLL_MS : false,
  });
}

/**
 * One race, or `null` when io keeps none under `id`, under the key `["races", id]`. Asked again
 * when the race's screen opens, not when the window takes focus: the screen draws a race live or
 * from its records by the status io gave, and a race followed live to its end stays live.
 */
export function raceQuery(id: string) {
  return queryOptions({
    queryKey: ["races", id],
    queryFn: () => fetchRace(id),
    refetchOnWindowFocus: false,
  });
}
