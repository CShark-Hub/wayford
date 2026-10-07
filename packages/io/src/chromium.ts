/**
 * `runActor` on one shared Chromium (s4-03): the `RunFn` that `server.ts` hands the runner. Every
 * run opens its own context on the one browser (F6 AC1), and so does every live measurement of a
 * target-app page (s3-05, `live-measure.ts`). The first caller launches it, not the boot, so
 * `pnpm dev` stays quick for API work that never runs anything
 * (`docs/specs/2026-10-02-s4-03-runs-api.md`, "chromium.ts" and decision log, "The browser").
 *
 * It stays out of io's barrel (spec, decision log, "The barrel"): it loads agent's runtime and
 * Playwright. Outside its tests, `server.ts`, the sweep CLI, `sweep-cli.ts`, `seed:demo`,
 * `seed-demo-cli.ts`, and the axe-core scanner, `axe-scan.ts`, are its only importers.
 */
import { runActor } from "@wayford/agent";
import { WayfordError } from "@wayford/core";
import { type Browser, chromium } from "playwright";
import type { RunFn } from "./runner.js";

/** The one Chromium, launched by its first caller and handed to every caller after it. */
export type SharedBrowser = () => Promise<Browser>;

/**
 * One Chromium for every run and every measurement (s3-05): launched by the first caller, reused,
 * launched again after a disconnect. It holds the launch's promise, not the browser, so callers
 * that start together await one launch, and five first runs still launch one browser. A launch
 * that rejects fails every caller waiting on it with `browser_launch_failed`, which the runner
 * streams as each run's `runFailed`, and the next caller launches again. Nothing here closes the
 * browser: Playwright's SIGINT handler closes it and exits; on SIGTERM and SIGHUP `shutdown.ts`
 * exits first, and Playwright's `exit` hook kills it.
 */
export function sharedBrowser(
  launch: () => Promise<Browser> = () => chromium.launch(),
): SharedBrowser {
  // The launch in flight or done, cleared when its browser disconnects or it rejects. Only its own
  // handlers clear it, and a new launch starts only once it is cleared.
  let current: Promise<Browser> | undefined;

  return () => {
    if (current !== undefined) return current;
    current = launch().then(
      (browser) => {
        browser.once("disconnected", () => {
          current = undefined;
        });
        return browser;
      },
      (error: unknown) => {
        current = undefined;
        throw notLaunched(error);
      },
    );
    return current;
  };
}

/**
 * `runActor` on `browser`: every run opens its own context on the one browser (F6 AC1). No
 * default: a browser of its own would be a second Chromium beside the measurements' one.
 */
export function sharedChromium(browser: SharedBrowser): RunFn {
  // `runActor` opens the run's context on the browser and never closes the browser.
  return async (options) => runActor({ ...options, browser: await browser() });
}

/**
 * Worded as agent's `launchChromium` (`cli.ts`) words it, since the runner streams the message to
 * the client: what to do. Why is in `cause`, which the runner's log keeps whole.
 */
function notLaunched(error: unknown): WayfordError {
  return new WayfordError(
    "browser_launch_failed",
    "Chromium did not launch. If it is not installed, run " +
      "`pnpm --filter @wayford/agent exec playwright install --only-shell chromium`.",
    { cause: error },
  );
}
