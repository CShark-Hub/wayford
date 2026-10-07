/**
 * The browser side of a run: one Playwright context opened for a persona, a task and a seed on
 * the target app or another site, with the persona's device, its vision emulation, the fake
 * cursor and every recording running (`docs/PLAN.md` F5 AC7, F12; `docs/RULES.md` V1, P6).
 * Closing it leaves one `webm`, one `trace.zip` and one PNG per step in the caller's directory,
 * each named for persona, seed and run id.
 *
 * No model, no filter and no `RunEvent`: what to click, and what a step is, are the Actor loop's
 * (s2-03). The font check belongs to whoever measures, so it is not here either.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { Profile, RunId, Seed, StepIndex, Task, WayfordError } from "@wayford/core";
import type { Browser, BrowserContext, Page, Video } from "playwright";
import { z } from "zod";
import { CURSOR_HOLD_MS, installCursor, showCursor } from "./cursor.js";
import { deviceContextOptions } from "./device.js";
import { startUrlFor, type TargetAppParams } from "./start-url.js";

export interface RunContextOptions {
  /** Chromium, owned by the caller: one browser, one context per run (F6 AC1, s4-03). */
  browser: Browser;
  profile: Profile;
  task: Task;
  seed: Seed;
  runId: RunId;
  /** The target app's parameters, put on the start URL. Absent on another site (`startUrlFor`). */
  params?: TargetAppParams;
  outputDir: string;
}

export interface RunContext {
  readonly page: Page;
  /**
   * Exactly the URL `goto` received (`startUrlFor`), for `runStarted` and `RunResult`. Never
   * `page.url()`.
   */
  readonly startUrl: string;
  /** The device's mobile flag, for `collect(page, { isMobile })` (s2-03): a page cannot tell. */
  readonly isMobile: boolean;
  /**
   * Moves the fake cursor to a viewport point and holds it there. Call it before a click, at the
   * click's point.
   */
  moveCursor(point: { x: number; y: number }): Promise<void>;
  /**
   * Puts the real pointer back on the point the last cursor move went to, where the last action
   * pressed; nothing before the first move. Call it before the page is settled and measured: after
   * a navigation or a scroll Chromium updates what is hovered on a timer of its own, and this
   * decides it now, so a step's screenshot and the next measurement see the same hover state
   * (s2-03).
   */
  restorePointer(): Promise<void>;
  /**
   * A viewport PNG of the page now, taken after step `step`'s action (core's post-action
   * screenshot). Returns its path. Call it once the action's navigation, if any, has loaded:
   * putting the cursor back evaluates in the page, which fails while a document is replaced.
   */
  screenshot(step: number): Promise<string>;
  /** Stops the trace, closes the context, names the video. */
  close(): Promise<RunRecording>;
}

export interface RunRecording {
  videoPath: string;
  tracePath: string;
}

// This parse is what keeps `/`, `\`, `..` and spaces out of the file names, since the run id, the
// seed and the label all reach them and the TypeScript types are plain strings and numbers. A run
// id is `run_` then `[a-z0-9-]`, a seed a uint32, a label one capitalised word of Unicode letters,
// so a name can hold `ë`.
const RunInputs = z.object({
  profile: Profile,
  task: Task,
  seed: Seed,
  runId: RunId,
  outputDir: z.string().min(1),
});

/**
 * Opens a run: a context with the persona's device and recordings, the cursor installed, the
 * vision emulation set, and the page loaded at the start URL with no history behind it.
 *
 * Inputs that fail core's schemas throw a `WayfordError` with code `invalid_run_context`, and
 * parameters outside the target app's ranges one with `invalid_target_app_params`, before
 * anything is created. With no `params` the page loads at `task.startUrl` exactly as given. A
 * start that fails, a response that is not OK included, closes the context, deletes the unfinished
 * video and throws one with code `run_start_failed`, the start's own error as its cause. A browser
 * that is already gone refuses the delete, and can leave Playwright's `page@….webm` behind, as
 * `close` can.
 */
export async function openRunContext(options: RunContextOptions): Promise<RunContext> {
  const { browser, params, ...inputs } = options;
  const parsed = RunInputs.safeParse(inputs);
  if (!parsed.success) {
    throw new WayfordError(
      "invalid_run_context",
      `Invalid run context:\n${z.prettifyError(parsed.error)}`,
      { cause: parsed.error },
    );
  }
  const { profile, task, seed, runId, outputDir } = parsed.data;
  const startUrl = startUrlFor(task, params);

  // Every file the run writes starts with it, flat in the caller's directory.
  const stem = `${profile.label.toLowerCase()}-seed${seed}-${runId}`;
  await mkdir(outputDir, { recursive: true });

  const device = deviceContextOptions(profile.device);
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  try {
    context = await browser.newContext({
      ...device,
      // The viewport's size: Playwright's default scales the video down to fit 800 × 800.
      recordVideo: { dir: outputDir, size: device.viewport },
    });
    await installCursor(context);
    // Before the page exists, so `newPage` and `goto` are in the trace. The title follows the run
    // header of F7 AC4.
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      title: `${profile.label} | seed ${seed} | ${runId}`,
    });
    page = await context.newPage();

    // P6 (`docs/RULES.md`): the persona's vision emulation, through CDP. It changes screenshots
    // and video only, and nothing measured or decided may read it: the decision is P1, on the
    // measured contrast. The emulation is illustration in the step PNGs, the video and the trace
    // filmstrip. `collect` reads computed styles and boxes, which the emulation does not change
    // (a probe measured the same page identically with and without it). The emulated PNGs and
    // video are evidence for people. They must never become the Actor's or the Analyst's image
    // input: PLAN A16's screenshot flag has to take an unemulated shot, a follow-up for whoever
    // builds A16.
    //
    // `none` is sent too, so every persona takes one path. The emulation is per page and survives
    // navigation, cross-origin included. The session stays open for the run, since detaching it
    // clears the emulation; it ends with the page.
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setEmulatedVisionDeficiency", {
      type: profile.perception.emulation,
    });

    // `goto` waits for `load`. A response that is not OK is a failed start: the target app
    // answers a trailing slash with an empty 404, and a run on that blank page would read as "the
    // persona could not find it" when the start itself was broken.
    const response = await page.goto(startUrl);
    if (response === null || !response.ok()) {
      throw new Error(`the start URL answered ${response?.status() ?? "with no response"}`);
    }
    // Clears the history behind the start page, so the tab's history starts there, as a fresh
    // tab's does. A `back` at the start then goes nowhere instead of landing on the about:blank
    // Playwright opened the page with, which the collector cannot measure (s2-03).
    await cdp.send("Page.resetNavigationHistory");
    const video = page.video();
    if (video === null) throw new Error("the page records no video");
    return runContext({
      context,
      page,
      video,
      startUrl,
      isMobile: device.isMobile,
      outputDir,
      stem,
    });
  } catch (error) {
    // No half-written `webm` stays behind: Playwright finishes it on close, then it goes. Both
    // calls are best-effort, so a browser that died mid-start still yields the typed error, with
    // the start's error as its cause rather than the cleanup's.
    const video = page?.video();
    await context?.close().catch(() => undefined);
    await video?.delete().catch(() => undefined);
    const reason = error instanceof Error ? error.message.split("\n", 1)[0] : String(error);
    const message = `the run could not start at ${startUrl}: ${reason}`;
    throw new WayfordError("run_start_failed", message, { cause: error });
  }
}

/**
 * The handle over an opened run. Paths are `join(outputDir, …)`, so they keep the caller's relative
 * or absolute form.
 */
function runContext({
  context,
  page,
  video,
  startUrl,
  isMobile,
  outputDir,
  stem,
}: {
  context: BrowserContext;
  page: Page;
  video: Video;
  startUrl: string;
  isMobile: boolean;
  outputDir: string;
  stem: string;
}): RunContext {
  // Where the last move put the cursor, which is where the last action pressed: a step's screenshot
  // draws the cursor back there, and `restorePointer` puts the real pointer back there.
  let cursorAt: { x: number; y: number } | undefined;

  return {
    page,
    startUrl,
    isMobile,

    async moveCursor(point) {
      await showCursor(page, point);
      cursorAt = { x: point.x, y: point.y };
      await sleep(CURSOR_HOLD_MS);
    },

    async restorePointer() {
      if (cursorAt !== undefined) await page.mouse.move(cursorAt.x, cursorAt.y);
    },

    async screenshot(step) {
      const parsed = StepIndex.safeParse(step);
      if (!parsed.success) {
        throw new WayfordError("invalid_step", `a step is a non-negative integer, got ${step}`, {
          cause: parsed.error,
        });
      }
      // A navigating click replaced the document and its cursor. A real pointer stays where it
      // clicked, so the post-action PNG shows it there.
      if (cursorAt !== undefined) await showCursor(page, cursorAt);
      // `n` is unpadded, like core's fixtures.
      const path = join(outputDir, `${stem}-step-${parsed.data}.png`);
      // The viewport only, what the persona sees. `css` makes a PNG pixel a CSS pixel, so it lines
      // up with the measurement's boxes on every device.
      await page.screenshot({ path, scale: "css" });
      return path;
    },

    // Not memoised: s2-03 closes once, in its `finally`. A failed trace stop still closes the
    // context and names the video, and then close rejects.
    async close() {
      const videoPath = join(outputDir, `${stem}.webm`);
      const tracePath = join(outputDir, `${stem}.trace.zip`);
      try {
        await context.tracing.stop({ path: tracePath });
      } finally {
        await context.close();
        // Playwright names the file `page@<guid>.webm` and takes no name, so it is copied, then
        // deleted.
        await video.saveAs(videoPath);
        await video.delete();
      }
      return { videoPath, tracePath };
    },
  };
}
