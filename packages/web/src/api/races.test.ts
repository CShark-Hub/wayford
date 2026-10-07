import { QueryClient } from "@tanstack/react-query";
import { taskFixtures } from "@wayford/core/fixtures";
import { afterEach, expect, test, vi } from "vitest";
import { fetchRace, fetchRaces, RACES_POLL_MS, type Race, raceQuery, racesQuery } from "./races.js";

const [, hardTask] = taskFixtures;
if (!hardTask) throw new Error("tasks.json must hold the easy goal, then the hard one");

/** Ada and Vera on the hard goal, seed 1, as io keeps the race while it runs. */
const running: Race = {
  id: "race_ada-vera",
  task: hardTask,
  startedAt: "2026-10-07T09:00:00.000Z",
  runs: [
    { id: "run_ada-1", profileId: "prof_ada", seed: 1 },
    { id: "run_vera-1", profileId: "prof_vera", seed: 1 },
  ],
  status: "running",
};

const finished: Race = { ...running, id: "race_earlier", status: "finished" };

/** Make the next `fetch` answer with `response`, and hand back the stub to inspect calls. */
function answer(response: Response) {
  const fetch = vi.fn(async (_url: string) => response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("fetchRaces reads every race io keeps from /api/races", async () => {
  const fetch = answer(Response.json([running, finished]));
  await expect(fetchRaces()).resolves.toStrictEqual([running, finished]);
  expect(fetch).toHaveBeenCalledWith("/api/races");
});

test("fetchRace reads one race from /api/races/:id, its id encoded", async () => {
  const fetch = answer(Response.json(running));
  await expect(fetchRace("race_ada-vera")).resolves.toStrictEqual(running);
  expect(fetch).toHaveBeenCalledWith("/api/races/race_ada-vera");
  const encoded = answer(Response.json(running));
  await fetchRace("race_a/b?c#d");
  expect(encoded).toHaveBeenCalledWith("/api/races/race_a%2Fb%3Fc%23d");
});

test("fetchRace answers null when io keeps no race under the id; the list rejects a 404", async () => {
  answer(Response.json({ error: "no race race_x" }, { status: 404 }));
  await expect(fetchRace("race_x")).resolves.toBeNull();
  answer(Response.json({ error: "not found" }, { status: 404 }));
  await expect(fetchRaces()).rejects.toThrow(/^io answered 404: not found$/);
});

test("a body that is not a race rejects with zod's account of why", async () => {
  answer(Response.json([{ ...running, status: "paused" }]));
  const races = fetchRaces();
  await expect(races).rejects.toThrow(/^io sent something that is not a list of races:\n/);
  await expect(races).rejects.toThrow("→ at [0].status");

  // A race of no run is not one `POST /runs` could have started.
  answer(Response.json({ ...running, runs: [] }));
  const race = fetchRace("race_ada-vera");
  await expect(race).rejects.toThrow(/^io sent something that is not a race:\n/);
  await expect(race).rejects.toThrow("→ at runs");
});

test("each query fetches what its key names", async () => {
  const client = new QueryClient();
  let fetch = answer(Response.json([running]));
  await expect(client.fetchQuery(racesQuery())).resolves.toStrictEqual([running]);
  expect(fetch).toHaveBeenCalledWith("/api/races");
  fetch = answer(Response.json(finished));
  await expect(client.fetchQuery(raceQuery("race_earlier"))).resolves.toStrictEqual(finished);
  expect(fetch).toHaveBeenCalledWith("/api/races/race_earlier");
});

test("the list is asked again while a race in it runs, and not once every race has finished", () => {
  const { refetchInterval } = racesQuery();
  if (typeof refetchInterval !== "function") throw new Error("racesQuery polls by its data");
  const after = (data: Race[] | undefined) =>
    refetchInterval({ state: { data } } as Parameters<typeof refetchInterval>[0]);
  expect(after([finished, running])).toBe(RACES_POLL_MS);
  expect(after([finished])).toBe(false);
  expect(after([])).toBe(false);
  expect(after(undefined)).toBe(false);
});
