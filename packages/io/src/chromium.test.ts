/**
 * The shared Chromium on a fake `launch` (`docs/specs/2026-10-02-s4-03-runs-api.md`,
 * "chromium.ts"): one launch for runs that start together, and a new one after a disconnect or a
 * failed launch. No browser starts and no folder is made: every run here has a step cap of 0,
 * which `runActor` refuses before it touches the browser or reads `runsDir`, so a bare event
 * emitter carries `run` through as the browser. The real browser is `runs.browser.test.ts`'s.
 */
import { EventEmitter } from "node:events";
import { TARGET_APP_DEFAULTS } from "@wayford/agent";
import { WayfordError } from "@wayford/core";
import { profileFixture, taskFixture } from "@wayford/core/fixtures";
import type { Browser } from "playwright";
import { expect, test, vi } from "vitest";
import { sharedBrowser, sharedChromium } from "./chromium.js";
import type { RunFn } from "./runner.js";
import { noBackend, quiet } from "./test-app.js";

const INSTALL = "pnpm --filter @wayford/agent exec playwright install --only-shell chromium";

/**
 * A run's options with a step cap of 0, which `runActor` refuses before it uses the browser or
 * `runsDir`, so neither is real.
 */
function capped(): Parameters<RunFn>[0] {
  return {
    profile: profileFixture("prof_ada"),
    task: taskFixture("task_next-parcel"),
    seed: 1,
    params: TARGET_APP_DEFAULTS,
    runsDir: "unused",
    backend: noBackend,
    logger: quiet,
    maxSteps: 0,
  };
}

/** One run on `run` that gets its browser and goes on to `runActor`'s refusal of the cap. */
function runPastTheBrowser(run: RunFn): Promise<void> {
  return expect(run(capped())).rejects.toMatchObject({ code: "invalid_run_input" });
}

/**
 * A counting `launch` that rejects with each of `failures` in turn, then hands out fake browsers:
 * event emitters, since a browser's `disconnected` event is all the shared Chromium uses of it.
 */
function fakeChromium(...failures: Error[]) {
  const browsers: EventEmitter[] = [];
  const launch = vi.fn(async (): Promise<Browser> => {
    const failure = failures.shift();
    if (failure !== undefined) throw failure;
    const browser = new EventEmitter();
    browsers.push(browser);
    return browser as unknown as Browser;
  });
  return { launch, browsers };
}

test("runs that start together share one launch, and later runs reuse its browser", async () => {
  const { launch } = fakeChromium();
  const run = sharedChromium(sharedBrowser(launch));

  await Promise.all([runPastTheBrowser(run), runPastTheBrowser(run), runPastTheBrowser(run)]);
  expect(launch).toHaveBeenCalledTimes(1);

  await runPastTheBrowser(run);
  expect(launch).toHaveBeenCalledTimes(1);
});

test("a run after the browser disconnects launches a new one", async () => {
  const { launch, browsers } = fakeChromium();
  const run = sharedChromium(sharedBrowser(launch));
  await runPastTheBrowser(run);

  // As a browser that crashed does.
  (browsers[0] as EventEmitter).emit("disconnected");
  await runPastTheBrowser(run);
  expect(launch).toHaveBeenCalledTimes(2);

  await runPastTheBrowser(run);
  expect(launch).toHaveBeenCalledTimes(2);
});

test("a launch that rejects fails the run with the install command, and the next run launches again", async () => {
  const failure = new Error(
    "browserType.launch: Executable doesn't exist at /nowhere/headless_shell",
  );
  const { launch } = fakeChromium(failure);
  const run = sharedChromium(sharedBrowser(launch));

  const error = await run(capped()).catch((thrown: unknown) => thrown);
  expect(error).toBeInstanceOf(WayfordError);
  const { code, message, cause } = error as WayfordError;
  expect(code).toBe("browser_launch_failed");
  // The runner streams the message as the run's `runFailed`, so it says what to do.
  expect(message).toMatch(/^Chromium did not launch\./);
  expect(message).toContain(INSTALL);
  expect(cause).toBe(failure);

  await runPastTheBrowser(run);
  expect(launch).toHaveBeenCalledTimes(2);
});
