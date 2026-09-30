/**
 * `openRunContext` on the running target app, against the browser boxes of
 * `tasks/s2-02-evidence-capture.md` (`docs/specs/2026-09-30-s2-02-evidence-capture.md`,
 * "Acceptance mapping"). The app is built and served on a free port, one Chromium serves every
 * test but the one that kills its own, and each test writes into a fresh temporary directory.
 * Where a screenshot or a measurement is compared, the bundled font is checked first
 * (`packages/target-app/README.md`, "Font").
 */
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Task, WayfordError } from "@wayford/core";
import { profileFixture, taskFixture } from "@wayford/core/fixtures";
import { collect } from "@wayford/filter";
import { serveTargetApp, type TargetApp } from "@wayford/filter/serve-target-app";
import { type Browser, chromium, type Locator, type Page } from "playwright";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { deviceContextOptions } from "./device.js";
import { openRunContext, type RunContext, type RunContextOptions } from "./run-context.js";
import { TARGET_APP_DEFAULTS } from "./start-url.js";

// Recording, encoding and saving a video take longer than vitest's 5 s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const RUN_SEED = 7;

let app: TargetApp;
let browser: Browser;
let outputDir: string;

beforeAll(async () => {
  browser = await chromium.launch().catch((error: unknown) => {
    throw new Error(
      "Chromium did not launch. If it is not installed, run " +
        "`pnpm --filter @wayford/agent exec playwright install --only-shell chromium`.",
      { cause: error },
    );
  });
  app = await serveTargetApp();
});

afterAll(async () => {
  await browser?.close();
  await app?.close();
});

beforeEach(async () => {
  outputDir = await mkdtemp(join(tmpdir(), "wayford-run-"));
});

afterEach(async () => {
  // A test that failed half way leaves its context open, and its video would hold the directory.
  await Promise.all(browser.contexts().map((context) => context.close()));
  await rm(outputDir, { recursive: true, force: true, maxRetries: 3 });
});

/** The past-order task, started on the served app's `/deliveries` unless told otherwise. */
function pastOrder(startUrl = `${app.origin}/deliveries`): Task {
  return { ...taskFixture("task_past-order"), startUrl };
}

/** A run of the past-order task for a persona fixture, at the app's defaults and seed 7. */
function openRun(
  profileId: string,
  runId: string,
  overrides: Partial<RunContextOptions> = {},
): Promise<RunContext> {
  return openRunContext({
    browser,
    profile: profileFixture(profileId),
    task: pastOrder(),
    seed: RUN_SEED,
    runId,
    params: TARGET_APP_DEFAULTS,
    outputDir,
    ...overrides,
  });
}

/** The error `promise` rejects with, checked to be the boundary's typed one with `code`. */
async function rejection(promise: Promise<unknown>, code: string): Promise<WayfordError> {
  const error = await promise.catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(WayfordError);
  expect((error as WayfordError).code).toBe(code);
  return error as WayfordError;
}

async function expectInter(page: Page): Promise<void> {
  // A font that failed to load falls back to a system one, and the page would be drawn in it.
  const inter = await page.evaluate(() => document.fonts.check('16px "Inter"'));
  expect(inter, `the bundled Inter font on ${page.url()}`).toBe(true);
}

/** A locator's centre in whole pixels, as a pointer lands, so the cursor's box compares exactly. */
async function centreOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`${locator} has no box`);
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

const orderArchive = (page: Page) => page.getByRole("link", { name: "Order archive", exact: true });

/**
 * Moves the cursor onto "Order archive" and clicks at that point, as the Actor loop will, and
 * waits for the archive. The cursor sits on top of the link, so the click reaches the link only if
 * it passes through. Returns the point.
 */
async function clickArchive(run: RunContext): Promise<{ x: number; y: number }> {
  const point = await centreOf(orderArchive(run.page));
  await run.moveCursor(point);
  await Promise.all([
    run.page.waitForURL("**/deliveries/archive", { timeout: 5_000 }),
    run.page.mouse.click(point.x, point.y),
  ]);
  return point;
}

/**
 * What the page holds of the cursor. It tries to focus the cursor, which is safe mid-test: focus
 * does nothing on an element that cannot take it, and one that can fails the `focused` check.
 */
function cursorIn(page: Page) {
  return page.evaluate(() => {
    const all = document.querySelectorAll("[data-wayford-cursor]");
    const cursor = all[0];
    if (!(cursor instanceof HTMLElement)) return { count: all.length };
    const box = cursor.getBoundingClientRect();
    cursor.focus();
    return {
      count: all.length,
      display: getComputedStyle(cursor).display,
      centre: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      size: { width: box.width, height: box.height },
      onRoot: cursor.parentElement === document.documentElement,
      ariaHidden: cursor.getAttribute("aria-hidden"),
      role: cursor.getAttribute("role"),
      tabindex: cursor.getAttribute("tabindex"),
      focused: document.activeElement === cursor,
      // Read from the style, since a short transition would be over by the time a move returns.
      transition: getComputedStyle(cursor).transitionDuration,
      animation: getComputedStyle(cursor).animationName,
      animations: document.getAnimations().length,
    };
  });
}

/** The width and height a PNG's header declares. */
function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

test("Vera's start URL carries all three parameters and the loaded page drops them", async () => {
  const run = await openRun("prof_vera", "run_vera-start-1");
  expect(run.startUrl).toBe(`${app.origin}/deliveries?contrast=2&fontPx=16&targetPx=36`);
  expect(run.page.url()).toBe(`${app.origin}/deliveries`);
  // The app saves the parameters only from a URL that carries them, so `goto` received them.
  const saved = await run.page.evaluate(() => sessionStorage.getItem("wayford-target-params"));
  expect(JSON.parse(saved ?? "null")).toStrictEqual({ contrast: 2, fontPx: 16, targetPx: 36 });
  await run.close();
});

test("Milo's run is a phone and Ada's a desktop", async () => {
  const seenFrom = (page: Page) =>
    page.evaluate(() => ({
      mobile: (navigator as Navigator & { userAgentData?: { mobile: boolean } }).userAgentData
        ?.mobile,
      touchPoints: navigator.maxTouchPoints,
      width: window.innerWidth,
    }));

  const milo = await openRun("prof_milo", "run_milo-device-1");
  expect(milo.isMobile).toBe(true);
  const phone = await seenFrom(milo.page);
  expect(phone.mobile).toBe(true);
  expect(phone.touchPoints).toBeGreaterThan(0);
  expect(phone.width).toBeLessThan(500);
  // A PNG pixel is a CSS pixel, whatever the device's scale.
  const png = await readFile(await milo.screenshot(0));
  expect(pngSize(png)).toStrictEqual({ width: 412, height: 839 });
  await milo.close();

  const ada = await openRun("prof_ada", "run_ada-device-1");
  expect(ada.isMobile).toBe(false);
  expect(await seenFrom(ada.page)).toStrictEqual({ mobile: false, touchPoints: 0, width: 1280 });
  await ada.close();
});

test("the cursor centres on its point, after a navigation too, and stays out of reach", async () => {
  const run = await openRun("prof_ada", "run_ada-cursor-1");
  // Every new document holds one, from the init script, hidden until it is placed.
  expect(await cursorIn(run.page)).toMatchObject({ count: 1, display: "none" });

  const outOfReach = {
    count: 1,
    display: "block",
    size: { width: 24, height: 24 },
    onRoot: true,
    ariaHidden: "true",
    role: null,
    tabindex: null,
    focused: false,
    transition: "0s",
    animation: "none",
    animations: 0,
  };
  await run.moveCursor({ x: 300, y: 200 });
  expect(await cursorIn(run.page)).toStrictEqual({ ...outOfReach, centre: { x: 300, y: 200 } });

  // A navigating click replaces the document, and the new one's cursor is not placed yet.
  const archive = await clickArchive(run);
  expect(await cursorIn(run.page)).toMatchObject({ count: 1, display: "none" });
  // The step's screenshot puts it back where the click landed, before the shot: the PNG differs
  // from the same view with the cursor hidden.
  const step = await readFile(await run.screenshot(0));
  expect(await cursorIn(run.page)).toStrictEqual({ ...outOfReach, centre: archive });
  await run.page.evaluate(() => {
    const cursor = document.querySelector<HTMLElement>("[data-wayford-cursor]");
    cursor?.style.setProperty("display", "none", "important");
  });
  const hidden = await run.page.screenshot({ scale: "css" });
  expect(step.equals(hidden), "the step PNG shows the cursor").toBe(false);

  // A move from a visible spot, which a transition would animate.
  await run.moveCursor({ x: 640, y: 360 });
  expect(await cursorIn(run.page)).toStrictEqual({ ...outOfReach, centre: { x: 640, y: 360 } });
  await run.close();
});

test("a move while the page is still loading leaves one cursor", async () => {
  const run = await openRun("prof_ada", "run_ada-mid-load-1");
  // A page whose head waits on a script the test holds back. A move then lands after `<html>`
  // exists and before DOMContentLoaded, while the init script still waits for it.
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await run.page.route(`${app.origin}/held.js`, async (route) => {
    await held;
    await route.fulfill({ contentType: "text/javascript", body: "" });
  });
  await run.page.route(`${app.origin}/mid-load`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><head><script src="/held.js"></script></head><body></body></html>',
    }),
  );
  await run.page.goto(`${app.origin}/mid-load`, { waitUntil: "commit" });
  await run.page.waitForFunction(() => document.documentElement !== null);
  await run.moveCursor({ x: 100, y: 100 });
  release();
  await run.page.waitForLoadState("domcontentloaded");
  expect(await cursorIn(run.page)).toMatchObject({
    count: 1,
    display: "block",
    centre: { x: 100, y: 100 },
  });
  await run.close();
});

test("close leaves one webm, one trace.zip and one PNG per step, all named for persona, seed and run id", async () => {
  const runId = "run_vera-evidence-1";
  const run = await openRun("prof_vera", runId);
  await clickArchive(run);
  const first = await run.screenshot(0);
  await run.moveCursor({ x: 640, y: 360 });
  const second = await run.screenshot(1);
  const recording = await run.close();

  const stem = `vera-seed7-${runId}`;
  const names = [`${stem}-step-0.png`, `${stem}-step-1.png`, `${stem}.trace.zip`, `${stem}.webm`];
  // Exactly these, so Playwright's own `page@….webm` left behind fails it.
  expect((await readdir(outputDir)).sort()).toStrictEqual([...names].sort());
  const [step0, step1, tracePath, videoPath] = names.map((name) => join(outputDir, name));
  expect([first, second]).toStrictEqual([step0, step1]);
  expect(recording).toStrictEqual({ videoPath, tracePath });
  expect((await stat(recording.videoPath)).size).toBeGreaterThan(0);
  const trace = await readFile(recording.tracePath);
  expect(trace.subarray(0, 2).toString("latin1")).toBe("PK");
});

test("Vera's blurred screenshot differs from Ada's, and still after a navigation", async () => {
  // A run's step PNG on /deliveries, then on the archive after a navigation.
  const shotsOf = async (profileId: string, runId: string) => {
    const run = await openRun(profileId, runId);
    await expectInter(run.page);
    const deliveries = await readFile(await run.screenshot(0));
    await run.page.goto(`${app.origin}/deliveries/archive`);
    await expectInter(run.page);
    const archive = await readFile(await run.screenshot(1));
    await run.close();
    return { deliveries, archive };
  };
  const vera = await shotsOf("prof_vera", "run_vera-blur-1");
  const ada = await shotsOf("prof_ada", "run_ada-blur-1");
  const control = await shotsOf("prof_ada", "run_ada-blur-2");

  // The control: the same persona's shots are the same bytes, so a difference is the emulation.
  expect(ada.deliveries.equals(control.deliveries), "Ada against Ada on /deliveries").toBe(true);
  expect(ada.archive.equals(control.archive), "Ada against Ada on the archive").toBe(true);
  expect(vera.deliveries.equals(ada.deliveries), "Vera against Ada on /deliveries").toBe(false);
  expect(vera.archive.equals(ada.archive), "Vera against Ada on the archive").toBe(false);
});

test("the vision emulation does not reach the measurement", async () => {
  const vera = profileFixture("prof_vera");
  expect(vera.perception.emulation).toBe("blurredVision");
  const run = await openRun("prof_vera", "run_vera-measure-1");
  await expectInter(run.page);
  // Parked on the link, so a hit-test that ignored `pointer-events` would find the cursor.
  await run.moveCursor(await centreOf(orderArchive(run.page)));
  const emulated = await collect(run.page, { isMobile: run.isMobile });

  const context = await browser.newContext(deviceContextOptions(vera.device));
  try {
    const page = await context.newPage();
    await page.goto(run.startUrl);
    await expectInter(page);
    const bare = await collect(page);
    expect(JSON.stringify(emulated)).toBe(JSON.stringify(bare));
  } finally {
    await context.close();
  }
  // Not vacuous: the measurement holds the link the cursor sits on.
  expect(emulated.elements.map((element) => element.key)).toContain("main//link:Order archive");
  await run.close();
});

test("a start that answers 404 throws run_start_failed and leaves no video", async () => {
  // The target app answers a trailing slash with an empty 404.
  const start = openRun("prof_vera", "run_vera-404-1", {
    task: pastOrder(`${app.origin}/deliveries/`),
  });
  const error = await rejection(start, "run_start_failed");
  expect(error.cause).toBeDefined();
  expect(await readdir(outputDir)).toStrictEqual([]);
  expect(browser.contexts()).toStrictEqual([]);
});

test("a browser that dies during the start throws run_start_failed, with the start's error as cause", async () => {
  // Its own browser, since this one dies. The server takes the request and never answers, and
  // closes the browser the moment the request arrives, so `goto` is still waiting.
  const own = await chromium.launch();
  const silent = createServer(() => {
    own.close().catch(() => undefined);
  });
  await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve));
  const { port } = silent.address() as AddressInfo;
  try {
    const start = openRun("prof_vera", "run_vera-gone-1", {
      browser: own,
      task: pastOrder(`http://127.0.0.1:${port}/deliveries`),
    });
    const error = await rejection(start, "run_start_failed");
    // The cleanup's own refusal on the dead browser does not replace it.
    expect(error.cause).toBeInstanceOf(Error);
    expect((error.cause as Error).message).toContain("page.goto");
  } finally {
    await own.close();
    silent.closeAllConnections();
    await new Promise<void>((resolve) => silent.close(() => resolve()));
  }
});

test("a run id that is a path, such as run_../x, is refused before anything is created", async () => {
  const start = openRun("prof_vera", "run_../x", { outputDir: join(outputDir, "runs") });
  const error = await rejection(start, "invalid_run_context");
  expect(error.message).toContain("runId");
  // The output directory was never made, and no context opened.
  expect(await readdir(outputDir)).toStrictEqual([]);
  expect(browser.contexts()).toStrictEqual([]);
});

test("parameters outside the app's ranges are refused with their own code, before anything is created", async () => {
  const start = openRun("prof_vera", "run_vera-params-1", {
    params: { ...TARGET_APP_DEFAULTS, contrast: 0 },
  });
  await rejection(start, "invalid_target_app_params");
  expect(await readdir(outputDir)).toStrictEqual([]);
  expect(browser.contexts()).toStrictEqual([]);
});

test("a screenshot for a step that is no step index is refused", async () => {
  const run = await openRun("prof_ada", "run_ada-step-1");
  await rejection(run.screenshot(-1), "invalid_step");
  expect((await readdir(outputDir)).filter((name) => name.endsWith(".png"))).toStrictEqual([]);
  await run.close();
});
