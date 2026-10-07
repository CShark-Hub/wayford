import { QueryClient } from "@tanstack/react-query";
import { sweepFixtures } from "@wayford/core/fixtures";
import { afterEach, expect, test, vi } from "vitest";
import { fetchSweep, fetchSweeps, sweepQuery, sweepsQuery } from "./sweeps.js";

const [vera, kai] = sweepFixtures;
if (!vera || !kai)
  throw new Error("sweeps.json must hold Vera on contrast, then Kai on maxElements");

/** The demo's two presets, as the Boundary screen asks for them. */
const veraFilter = { profileId: "prof_vera", axis: "contrast" } as const;
const kaiFilter = { profileId: "prof_kai", axis: "maxElements" } as const;

/** Make the next `fetch` answer with `response`, and hand back the stub to inspect calls. */
function answer(response: Response) {
  const fetch = vi.fn(async (_url: string) => response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("fetchSweeps asks io for one persona's sweeps on one axis, and parses them", async () => {
  const fetch = answer(Response.json([vera]));
  await expect(fetchSweeps(veraFilter)).resolves.toStrictEqual([vera]);
  expect(fetch).toHaveBeenCalledWith("/api/sweeps?profileId=prof_vera&axis=contrast");
});

test("fetchSweeps reads no stored sweep as an empty list", async () => {
  answer(Response.json([]));
  await expect(fetchSweeps(kaiFilter)).resolves.toStrictEqual([]);
});

test("fetchSweep reads one sweep from /api/sweeps/:id", async () => {
  const fetch = answer(Response.json(kai));
  await expect(fetchSweep("swp_kai-max-elements")).resolves.toStrictEqual(kai);
  expect(fetch).toHaveBeenCalledWith("/api/sweeps/swp_kai-max-elements");
});

test("a sweep id goes into the path encoded", async () => {
  const fetch = answer(Response.json(kai));
  await fetchSweep("swp_a/b?c#d");
  expect(fetch).toHaveBeenCalledWith("/api/sweeps/swp_a%2Fb%3Fc%23d");
});

test("fetchSweep answers null when io stores no sweep under the id", async () => {
  answer(Response.json({ error: "no stored sweep swp_x" }, { status: 404 }));
  await expect(fetchSweep("swp_x")).resolves.toBeNull();
});

test("a 404 on the list rejects in io's words: only one sweep reads it as null", async () => {
  // `parseResponse`'s wording is `api/runs.test.ts`'s to pin; this is the list's own case.
  answer(Response.json({ error: "not found" }, { status: 404 }));
  await expect(fetchSweeps(veraFilter)).rejects.toThrow(/^io answered 404: not found$/);
});

test("a body that is not a sweep rejects with zod's account of why", async () => {
  // A stored boundary that is not `boundaryOf`'s: Vera's numbers put it at 3.0.
  answer(Response.json([{ ...vera, boundary: 2.5 }]));
  const sweeps = fetchSweeps(veraFilter);
  await expect(sweeps).rejects.toThrow(/^io sent something that is not a list of sweeps:\n/);
  await expect(sweeps).rejects.toThrow("→ at [0].boundary");

  answer(Response.json({ ...kai, id: "kai-max-elements" }));
  const sweep = fetchSweep("swp_kai-max-elements");
  await expect(sweep).rejects.toThrow(/^io sent something that is not a sweep:\n/);
  await expect(sweep).rejects.toThrow("→ at id");
});

test("each query fetches what it names", async () => {
  // The screen's tests seed these queries by key and never run them, so the fetch is checked here.
  const client = new QueryClient();
  let fetch = answer(Response.json([kai]));
  await expect(client.fetchQuery(sweepsQuery(kaiFilter))).resolves.toStrictEqual([kai]);
  expect(fetch).toHaveBeenCalledWith("/api/sweeps?profileId=prof_kai&axis=maxElements");
  fetch = answer(Response.json(vera));
  await expect(client.fetchQuery(sweepQuery("swp_vera-contrast"))).resolves.toStrictEqual(vera);
  expect(fetch).toHaveBeenCalledWith("/api/sweeps/swp_vera-contrast");
});
