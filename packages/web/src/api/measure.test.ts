import { QueryClient } from "@tanstack/react-query";
import { measurementFixture } from "@wayford/core/fixtures";
import { afterEach, expect, test, vi } from "vitest";
import { fetchMeasurement, measurementQuery, pageParams } from "./measure.js";

/** Make every `fetch` answer with a copy of `response`, and hand back the stub to inspect calls. */
function answer(response: Response) {
  const fetch = vi.fn(async (_url: string) => response.clone());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("fetchMeasurement asks io for the device and the page, and parses the measurement", async () => {
  const fetch = answer(Response.json(measurementFixture));
  await expect(fetchMeasurement("mobile", "/settings/data")).resolves.toStrictEqual(
    measurementFixture,
  );
  expect(fetch).toHaveBeenCalledWith("/api/measure?device=mobile&page=%2Fsettings%2Fdata");
});

test("io's { error } is the rejection's message, as when the target app is down", async () => {
  answer(
    Response.json(
      { error: "target_app_unavailable: the target app did not load" },
      { status: 502 },
    ),
  );
  await expect(fetchMeasurement("desktop", "/deliveries")).rejects.toThrow(
    "target_app_unavailable: the target app did not load",
  );
});

test("an answer with no { error }, as the proxy's while io is down, rejects with its status", async () => {
  answer(new Response("Bad Gateway", { status: 502 }));
  await expect(fetchMeasurement("desktop", "/deliveries")).rejects.toThrow(
    "io did not answer (HTTP 502)",
  );
});

test("a 200 that is not a measurement rejects", async () => {
  answer(Response.json({ url: "http://localhost:5174/deliveries" }));
  await expect(fetchMeasurement("desktop", "/deliveries")).rejects.toThrow(/not a measurement/);
  // What a missing proxy looks like: Vite serves the page itself.
  answer(new Response("<!doctype html>", { headers: { "content-type": "text/html" } }));
  await expect(fetchMeasurement("desktop", "/deliveries")).rejects.toThrow(/not a measurement/);
});

test("a failed measurement is not retried", async () => {
  const fetch = answer(new Response("Bad Gateway", { status: 502 }));
  const client = new QueryClient();
  await client.prefetchQuery(measurementQuery("desktop", "/deliveries"));
  expect(client.getQueryState(measurementQuery("desktop", "/deliveries").queryKey)?.status).toBe(
    "error",
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("a URL page asks io with url=, keyed by the whole URL", async () => {
  // io keys a measurement by the whole URL (`docs/adr/0003-any-target.md`, D5), and so does web.
  const fetch = answer(Response.json(measurementFixture));
  const page = "https://example.com/shop?a=1#top";
  await expect(fetchMeasurement("desktop", page)).resolves.toStrictEqual(measurementFixture);
  expect(fetch).toHaveBeenCalledWith(
    "/api/measure?device=desktop&url=https%3A%2F%2Fexample.com%2Fshop%3Fa%3D1%23top",
  );
  expect(measurementQuery("mobile", page).queryKey).toEqual(["measure", "mobile", page]);
  // Through the query too, so its key and its request name the same page.
  const client = new QueryClient();
  await client.fetchQuery(measurementQuery("mobile", page));
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/measure?device=mobile&url=https%3A%2F%2Fexample.com%2Fshop%3Fa%3D1%23top",
  );
  // A target-app page is still asked for by its path.
  expect(pageParams("/settings/data")).toStrictEqual({ page: "/settings/data" });
  expect(pageParams(page)).toStrictEqual({ url: page });
});
