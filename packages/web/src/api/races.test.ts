import { QueryClient } from "@tanstack/react-query";
import { taskFixtures } from "@wayford/core/fixtures";
import { afterEach, expect, test, vi } from "vitest";
import {
  cancelRace,
  fetchRace,
  fetchRaces,
  RACES_POLL_MS,
  type Race,
  raceQuery,
  racesQuery,
} from "./races.js";

const [, hardTask] = taskFixtures;
if (!hardTask) throw new Error("tasks.json must hold the easy goal, then the hard one");

/**
 * Ada and Vera on the hard goal, seed 1, as io keeps the race while it runs: Ada's run under way,
 * and Vera's still waiting for a slot.
 */
const running: Race = {
  id: "race_ada-vera",
  task: hardTask,
  startedAt: "2026-10-07T09:00:00.000Z",
  runs: [
    { id: "run_ada-1", profileId: "prof_ada", seed: 1 },
    { id: "run_vera-1", profileId: "prof_vera", seed: 1 },
  ],
  status: "running",
  waiting: ["run_vera-1"],
};

/** The same runs, all ended: nothing waits for a slot. */
const finished: Race = { ...running, id: "race_earlier", status: "finished", waiting: [] };

/** Make the next `fetch` answer with `response`, and hand back the stub to inspect calls. */
function answer(response: Response) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/** What the one call to the `fetch` stub sent: its URL, method, content type and parsed body. */
function sent(fetch: ReturnType<typeof answer>) {
  expect(fetch).toHaveBeenCalledOnce();
  const [url, init] = fetch.mock.calls[0] ?? [];
  return {
    url,
    method: init?.method,
    contentType: new Headers(init?.headers).get("content-type"),
    body: JSON.parse(String(init?.body)) as unknown,
  };
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

test("a race answer without waiting, or whose waiting are no run ids, is refused", async () => {
  // io lists the runs still waiting for a slot on every race, none as an empty list (#6).
  const { waiting: _waiting, ...unlisted } = running;
  answer(Response.json(unlisted));
  const race = fetchRace("race_ada-vera");
  await expect(race).rejects.toThrow(/^io sent something that is not a race:\n/);
  await expect(race).rejects.toThrow("→ at waiting");

  answer(Response.json([{ ...running, waiting: ["vera"] }]));
  const races = fetchRaces();
  await expect(races).rejects.toThrow(/^io sent something that is not a list of races:\n/);
  await expect(races).rejects.toThrow("→ at [0].waiting[0]");
});

test("a stopped race reads with its stop; a stop naming a run outside the race is refused", async () => {
  // Vera's run dropped from the queue, as core's `Race` records it: `extend` keeps its check.
  const at = "2026-10-07T09:01:00.000Z";
  const stopped: Race = { ...finished, cancelled: { at, dequeued: ["run_vera-1"] } };
  answer(Response.json(stopped));
  await expect(fetchRace("race_earlier")).resolves.toStrictEqual(stopped);

  answer(Response.json({ ...stopped, cancelled: { at, dequeued: ["run_x-1"] } }));
  const race = fetchRace("race_earlier");
  await expect(race).rejects.toThrow(/^io sent something that is not a race:\n/);
  await expect(race).rejects.toThrow("run_x-1 is not one of the race's runs");
});

test("cancelRace POSTs an empty body as JSON to /api/races/:id/cancel and reads io's counts", async () => {
  const fetch = answer(Response.json({ stopped: 0, dequeued: 1 }, { status: 202 }));
  await expect(cancelRace("race_ada-vera")).resolves.toStrictEqual({ stopped: 0, dequeued: 1 });
  expect(sent(fetch)).toStrictEqual({
    url: "/api/races/race_ada-vera/cancel",
    method: "POST",
    // io answers 415 to any other content type, and 400 to any body but `{}`.
    contentType: "application/json",
    body: {},
  });

  // A race already finished: io's 200, with nothing left to stop.
  answer(Response.json({ stopped: 0, dequeued: 0 }));
  await expect(cancelRace("race_earlier")).resolves.toStrictEqual({ stopped: 0, dequeued: 0 });

  const encoded = answer(Response.json({ stopped: 0, dequeued: 0 }, { status: 202 }));
  await cancelRace("race_a/b?c#d");
  expect(sent(encoded).url).toBe("/api/races/race_a%2Fb%3Fc%23d/cancel");
});

test("cancelRace rejects an answer of another shape with zod's account of why", async () => {
  answer(Response.json({ stopped: 0 }, { status: 202 }));
  const missing = cancelRace("race_ada-vera");
  await expect(missing).rejects.toThrow(/^io sent something that is not a stop:\n/);
  await expect(missing).rejects.toThrow("→ at dequeued");

  // A key io never sends, a count below zero and a part of a run are no stop either.
  answer(Response.json({ stopped: 0, dequeued: 1, cancelled: true }, { status: 202 }));
  await expect(cancelRace("race_ada-vera")).rejects.toThrow(
    /^io sent something that is not a stop:\n/,
  );
  answer(Response.json({ stopped: -1, dequeued: 1 }, { status: 202 }));
  await expect(cancelRace("race_ada-vera")).rejects.toThrow("→ at stopped");
  answer(Response.json({ stopped: 0, dequeued: 1.5 }, { status: 202 }));
  await expect(cancelRace("race_ada-vera")).rejects.toThrow("→ at dequeued");
});

test("cancelRace rejects a refusal with io's reason when it sent one", async () => {
  answer(Response.json({ error: "no race race_x" }, { status: 404 }));
  await expect(cancelRace("race_x")).rejects.toThrow(/^io answered 404: no race race_x$/);
  // The runs were dropped, but io could not record the stop: its reason comes through whole.
  answer(Response.json({ error: "stopped 1 run, but the stop was not recorded" }, { status: 500 }));
  await expect(cancelRace("race_ada-vera")).rejects.toThrow(
    /^io answered 500: stopped 1 run, but the stop was not recorded$/,
  );
  // Vite's proxy while io is down.
  answer(new Response("Bad Gateway", { status: 502 }));
  await expect(cancelRace("race_ada-vera")).rejects.toThrow(/^io answered 502$/);
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
