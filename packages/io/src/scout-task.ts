/**
 * agent's Scout as a `ScoutFn` (s4-10), on the runs function io's runs use, so it shares their one
 * Chromium, and a test hands it `fakeRun()`.
 *
 * It loads agent's runtime and Playwright, so like `chromium.ts` it stays out of the barrel, and
 * the routes get the `ScoutFn` handed in. Outside its tests, `server.ts` imports it.
 */
import type { Llm, LlmSettings } from "@wayford/agent";
import { scout } from "@wayford/agent/scout";
import type { Logger } from "pino";
import type { RunFn } from "./runner.js";
import type { ScoutFn } from "./scout-jobs.js";

/** Scout on `run`, on the `scout` role of `settings`; `llm` replaces the adapter in tests. */
export function scoutTask(deps: {
  run: RunFn;
  settings: LlmSettings;
  logger: Logger;
  llm?: (logger: Logger) => Llm;
}): ScoutFn {
  const { run, settings, logger, llm } = deps;
  return ({ task, params, dir }) =>
    scout({
      run,
      task,
      ...(params !== undefined && { params }),
      dir,
      settings,
      ...(llm !== undefined && { llm }),
      logger: logger.child({ taskId: task.id }),
    });
}
