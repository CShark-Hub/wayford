import { QueryClient } from "@tanstack/react-query";
import { axeScanFixture } from "@wayford/core/fixtures";
import { afterEach, expect, test, vi } from "vitest";
import { axeQuery, fetchAxeScan } from "./axe.js";

/** The stored scan of `/deliveries`, with its `color-contrast` violation. */
const deliveries = axeScanFixture("/deliveries");

/** Make every `fetch` answer with a copy of `response`, and hand back the stub to inspect calls. */
function answer(response: Response) {
  const fetch = vi.fn(async (_url: string) => response.clone());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// io's `{ error }`, a bare status, the caching and no retry are `getFromIo`'s and `IO_CACHE`'s,
// proved in `measure.test.ts`.

test("fetchAxeScan asks io for the page, and parses the scan", async () => {
  const fetch = answer(Response.json(deliveries));
  await expect(fetchAxeScan("/deliveries")).resolves.toStrictEqual(deliveries);
  expect(fetch).toHaveBeenCalledWith("/api/axe?page=%2Fdeliveries");
});

test("a 200 that is not a scan rejects, with zod's issues on one line", async () => {
  answer(Response.json({ ...deliveries, violations: [{ ruleId: "color-contrast" }] }));
  await expect(fetchAxeScan("/deliveries")).rejects.toThrow(
    /^io sent something that is not an axe-core scan: violations\.0\.\w+: [^\n]*$/,
  );
  // What a missing proxy looks like: Vite serves the page itself.
  answer(new Response("<!doctype html>", { headers: { "content-type": "text/html" } }));
  await expect(fetchAxeScan("/deliveries")).rejects.toThrow(/not an axe-core scan/);
});

test("the scan is keyed by the page alone", () => {
  expect(axeQuery("/settings/data").queryKey).toEqual(["axe", "/settings/data"]);
});

test("a URL page asks io with url=, keyed by the whole URL", async () => {
  // io keys a scan by the whole URL (`docs/adr/0003-any-target.md`, D5), and so does web.
  const fetch = answer(Response.json(deliveries));
  const page = "https://example.com/shop?a=1#top";
  await expect(fetchAxeScan(page)).resolves.toStrictEqual(deliveries);
  expect(fetch).toHaveBeenCalledWith("/api/axe?url=https%3A%2F%2Fexample.com%2Fshop%3Fa%3D1%23top");
  expect(axeQuery(page).queryKey).toEqual(["axe", page]);
  // Through the query too, so its key and its request name the same page.
  const client = new QueryClient();
  await client.fetchQuery(axeQuery(page));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/axe?url=https%3A%2F%2Fexample.com%2Fshop%3Fa%3D1%23top",
  );
});
