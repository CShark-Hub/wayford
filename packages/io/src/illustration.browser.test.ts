/**
 * `GET /illustration` on the real `liveIllustration`, against the served target app
 * (`docs/specs/2026-10-07-s3-06-illustration-view.md`, "Acceptance mapping", box 1): a PNG of
 * `/deliveries` under `blurredVision` whose bytes differ from the one under `none`, through one
 * shared Chromium, and a second request for one pair answered from io's cache.
 *
 * The bytes depend on the browser build, so the test compares the two pictures with each other,
 * never with a stored one.
 */
import { serveTargetApp, type TargetApp } from "@wayford/filter/serve-target-app";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { sharedBrowser } from "./chromium.js";
import { liveIllustration } from "./live-illustration.js";
import type { IllustrateFn } from "./routes/illustration.js";
import { getBytes, type TestApp, testApp } from "./test-app.js";

// Building the app and launching Chromium take longer than vitest's 5 s hook default.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

/** The eight bytes every PNG starts with. */
const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

let target: TargetApp;
let io: TestApp;
/** Every browser the shared Chromium launched, so the test can count them and close them. */
const browsers: Browser[] = [];
/** Every capture the live `IllustrateFn` was asked for, in order. */
const captures: Parameters<IllustrateFn>[] = [];

beforeAll(async () => {
  target = await serveTargetApp({ port: 0 });
  const live = liveIllustration({
    browser: sharedBrowser(async () => {
      const browser = await chromium.launch();
      browsers.push(browser);
      return browser;
    }),
    origin: target.origin,
  });
  io = await testApp({
    illustrate: (device, emulation) => {
      captures.push([device, emulation]);
      return live(device, emulation);
    },
  });
});

afterAll(async () => {
  await Promise.all(browsers.map((browser) => browser.close()));
  await io?.close();
  await target?.close();
});

/** `GET /illustration?<query>`, answered 200 as a PNG: its bytes. */
async function pictured(query: string): Promise<Uint8Array> {
  const { status, contentType, bytes } = await getBytes(io.app, `/illustration?${query}`);
  expect(status, query).toBe(200);
  expect(contentType, query).toBe("image/png");
  expect(bytes.subarray(0, PNG_SIGNATURE.length), query).toStrictEqual(PNG_SIGNATURE);
  return bytes;
}

test("blurredVision pictures /deliveries in other bytes than no emulation does, both PNG", async () => {
  const plain = await pictured("emulation=none");
  const blurred = await pictured("emulation=blurredVision");
  expect(Buffer.from(blurred).equals(Buffer.from(plain))).toBe(false);
  // Both on one Chromium, each in a context of its own, closed once its picture was taken.
  expect(browsers).toHaveLength(1);
  expect(browsers.flatMap((browser) => browser.contexts())).toEqual([]);
});

test("a second request for one device and emulation is answered from the cache", async () => {
  const before = captures.length;
  const first = await pictured("device=mobile&emulation=reducedContrast");
  const again = await pictured("emulation=reducedContrast&device=mobile");
  expect(again).toStrictEqual(first);
  expect(captures.slice(before)).toEqual([["mobile", "reducedContrast"]]);
});
