/**
 * `runActor` on one shared Chromium (s4-03): the `RunFn` that `server.ts` hands the runner. Every
 * run opens its own context on the one browser (F6 AC1). The first run launches it, not the boot,
 * so `pnpm dev` stays quick for API work that never runs anything
 * (`docs/specs/2026-10-02-s4-03-runs-api.md`, "chromium.ts" and decision log, "The browser").
 *
 * It stays out of io's barrel (spec, decision log, "The barrel"): it loads agent's runtime and
 * Playwright. Outside its tests, `server.ts` is its only importer.
 */
import { runActor } from "@wayford/agent";
import { WayfordError } from "@wayford/core";
import { type Browser, chromium } from "playwright";
import type { RunFn } from "./runner.js";

/**
 * `runActor` on one Chromium for every run: launched by the first run, reused, launched again
 * after a disconnect. It holds the launch's promise, not the browser, so runs that start together
 * await one launch, and five first runs still launch one browser. A launch that rejects fails
 * every run waiting on it with `browser_launch_failed`, which the runner streams as each run's
 * `runFailed`, and the next run launches again. Nothing here closes the browser: Playwright's
 * signal handlers close it on SIGINT, SIGTERM and SIGHUP, and its `exit` hook kills it when the
 * process exits. Playwright exits only on SIGINT; `shutdown.ts` makes io exit on the other two.
 */
export function sharedChromium(launch: () => Promise<Browser> = () => chromium.launch()): RunFn {
  // The launch in flight or done, cleared when its browser disconnects or it rejects. Only its own
  // handlers clear it, and a new launch starts only once it is cleared.
  let current: Promise<Browser> | undefined;

  function shared(): Promise<Browser> {
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
  }

  // `runActor` opens the run's context on the browser and never closes the browser.
  return async (options) => runActor({ ...options, browser: await shared() });
}

/**
 * Worded as `run-one.ts` words it, since the runner streams the message to the client: what to
 * do. Why is in `cause`, which the runner's log keeps whole.
 */
function notLaunched(error: unknown): WayfordError {
  return new WayfordError(
    "browser_launch_failed",
    "Chromium did not launch. If it is not installed, run " +
      "`pnpm --filter @wayford/agent exec playwright install --only-shell chromium`.",
    { cause: error },
  );
}
