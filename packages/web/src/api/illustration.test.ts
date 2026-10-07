import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, test, vi } from "vitest";
import { illustrationQuery } from "./illustration.js";

/** The eight bytes every PNG starts with, enough of one for a body that claims to be a PNG. */
const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Make every `fetch` answer with a copy of `response`, and hand back the stub to inspect calls. */
function answer(response: Response) {
  const fetch = vi.fn(async (_url: string) => response.clone());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/** A PNG answer, as io's `/illustration` sends one. */
function png(): Response {
  return new Response(PNG_SIGNATURE, { headers: { "content-type": "image/png" } });
}

/** Ask the query for its picture, through a client as the screen asks. */
function picture(device: "desktop" | "mobile", emulation: "none" | "blurredVision") {
  return new QueryClient().fetchQuery(illustrationQuery(device, emulation));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("an ok PNG asks io for the device and the emulation, and gives an object URL of its bytes", async () => {
  const fetch = answer(png());
  const createObjectURL = vi
    .spyOn(URL, "createObjectURL")
    .mockReturnValue("blob:http://localhost/vera");
  await expect(picture("desktop", "blurredVision")).resolves.toBe("blob:http://localhost/vera");
  expect(fetch).toHaveBeenCalledWith("/api/illustration?device=desktop&emulation=blurredVision");
  const [blob] = createObjectURL.mock.calls[0] ?? [];
  expect(blob).toBeInstanceOf(Blob);
  expect(new Uint8Array(await (blob as Blob).arrayBuffer())).toStrictEqual(PNG_SIGNATURE);
});

test("io's { error } is the rejection's message, as when the target app is down", async () => {
  answer(
    Response.json(
      { error: "target_app_unavailable: the target app did not load" },
      { status: 502 },
    ),
  );
  await expect(picture("desktop", "blurredVision")).rejects.toThrow(
    "target_app_unavailable: the target app did not load",
  );
});

test("an answer with no { error }, as the proxy's while io is down, rejects with its status", async () => {
  answer(new Response("Bad Gateway", { status: 502 }));
  await expect(picture("desktop", "none")).rejects.toThrow("io did not answer (HTTP 502)");
});

test("a 200 that is not a PNG rejects, and makes no object URL", async () => {
  const createObjectURL = vi.spyOn(URL, "createObjectURL");
  // What a missing proxy looks like: Vite serves the page itself.
  answer(new Response("<!doctype html>", { headers: { "content-type": "text/html" } }));
  await expect(picture("desktop", "none")).rejects.toThrow("io sent something that is not a PNG");
  answer(Response.json({ url: "http://localhost:5174/deliveries" }));
  await expect(picture("desktop", "none")).rejects.toThrow("io sent something that is not a PNG");
  expect(createObjectURL).not.toHaveBeenCalled();
});

test("a failed picture is not retried", async () => {
  const fetch = answer(new Response("Bad Gateway", { status: 502 }));
  const client = new QueryClient();
  await client.prefetchQuery(illustrationQuery("desktop", "blurredVision"));
  expect(client.getQueryState(illustrationQuery("desktop", "blurredVision").queryKey)?.status).toBe(
    "error",
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
