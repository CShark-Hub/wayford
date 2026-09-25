import { afterEach, expect, test, vi } from "vitest";
import { fetchHealth } from "./health.js";

/** Make the next `fetch` answer with `response`, and hand back the stub to inspect calls. */
function answer(response: Response) {
  const fetch = vi.fn(async (_url: string) => response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("io is up when /api/health answers ok", async () => {
  const fetch = answer(Response.json({ ok: true }));
  await expect(fetchHealth()).resolves.toBe(true);
  expect(fetch).toHaveBeenCalledWith("/api/health");
});

test("an error from the proxy is not a healthy io", async () => {
  // Vite's proxy answers 502 while io is down.
  answer(new Response("Bad Gateway", { status: 502 }));
  await expect(fetchHealth()).rejects.toThrow(/502/);
});

test("JSON that does not say ok is not healthy", async () => {
  answer(Response.json({ ok: false }));
  await expect(fetchHealth()).rejects.toThrow(/ok/);
});

test("a 200 that is not io's answer is not healthy either", async () => {
  // What a missing proxy looks like: Vite serves the page itself for /api/health.
  answer(new Response("<!doctype html>", { headers: { "content-type": "text/html" } }));
  await expect(fetchHealth()).rejects.toThrow();
});
