/**
 * The Race's way to io's races (`packages/io/src/routes/races.ts`), through the dev server's `/api`
 * proxy. A race is the runs one `POST /runs` started: io keeps it, so the Race can reopen it after
 * its screen was left or the page reloaded, and list it in its History. Nothing here starts one:
 * `startRuns` in `api/runs.ts` does, and hands back the race's id.
 *
 * A non-OK answer or a body that is not a race rejects as `parseResponse` in `api/runs.ts` words it.
 */
import { queryOptions } from "@tanstack/react-query";
import { RaceStatus, Race as StoredRace } from "@wayford/core";
import type { z } from "zod";
import { parseResponse } from "./runs.js";

/**
 * One race as io answers it: core's `Race`, the stored task its runs share whole and their receipts
 * seed-major, and its status, read off io's runner when asked. `finished` once none of its runs is
 * in flight in io's process: every run has ended, or io restarted, which ends a run under way
 * unstored.
 */
export const Race = StoredRace.extend({ status: RaceStatus });
export type Race = z.infer<typeof Race>;

/** `GET /api/races`: every race io keeps, newest first. */
export async function fetchRaces(): Promise<Race[]> {
  return parseResponse(await fetch("/api/races"), Race.array(), "a list of races");
}

/** `GET /api/races/:id`, the id encoded, or `null` on 404 (io keeps no race under that id). */
export async function fetchRace(id: string): Promise<Race | null> {
  const response = await fetch(`/api/races/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  return parseResponse(response, Race, "a race");
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
