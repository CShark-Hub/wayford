/**
 * The Boundary screen's way to io's sweeps API (`packages/io/src/routes/sweeps.ts`), through the
 * dev server's `/api` proxy. Nothing here starts a sweep: io has no `POST`, the CLI does that.
 *
 * Every body is parsed with core's `Sweep`, whose refinement checks the stored boundary against
 * `boundaryOf`, so a screen can trust `sweep.boundary`. A non-OK answer or a body that is not a
 * sweep rejects as `parseResponse` in `api/runs.ts` words it.
 */
import { queryOptions } from "@tanstack/react-query";
import { type ProfileId, Sweep, type SweepAxis } from "@wayford/core";
import { parseResponse } from "./runs.js";

/** One persona on one axis: io's two filters on `GET /sweeps`. */
type SweepsFilter = { profileId: ProfileId; axis: SweepAxis };

/** `GET /api/sweeps?profileId=…&axis=…`: the stored sweeps of one persona on one axis, newest first. */
export async function fetchSweeps({ profileId, axis }: SweepsFilter): Promise<Sweep[]> {
  // The two keys alone: io answers 400 to any other.
  const query = new URLSearchParams({ profileId, axis });
  return parseResponse(await fetch(`/api/sweeps?${query}`), Sweep.array(), "a list of sweeps");
}

/** `GET /api/sweeps/:id`, the id through `encodeURIComponent` as `runPath` does, or `null` on 404. */
export async function fetchSweep(id: string): Promise<Sweep | null> {
  const response = await fetch(`/api/sweeps/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  return parseResponse(response, Sweep, "a sweep");
}

/** One persona's stored sweeps on one axis, newest first, under the key `["sweeps", profileId, axis]`. */
export function sweepsQuery(filter: SweepsFilter) {
  return queryOptions({
    queryKey: ["sweeps", filter.profileId, filter.axis],
    queryFn: () => fetchSweeps(filter),
  });
}

/** One stored sweep, or `null` when io has none under `id`, under the key `["sweep", id]`. */
export function sweepQuery(id: string) {
  return queryOptions({ queryKey: ["sweep", id], queryFn: () => fetchSweep(id) });
}
