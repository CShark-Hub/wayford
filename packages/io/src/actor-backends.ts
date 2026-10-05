/**
 * The runner's Actor backends, built from the settings as `run:one` and `calibrate` build theirs,
 * and the default of a run set that names none: `LLM_ACTOR_BACKEND`'s, `llm` when unset (#161,
 * s2-12). Its own module so the route tests run the wiring `server.ts` runs. It loads agent's
 * runtime, so like `chromium.ts` it stays out of the barrel.
 */
import { backendFactory, type LlmSettings } from "@wayford/agent";
import type { RunnerOptions } from "./runner.js";

export function actorBackends(
  settings: LlmSettings,
): Pick<RunnerOptions, "backends" | "defaultBackend"> {
  return {
    backends: { llm: backendFactory("llm", settings), jev: backendFactory("jev", settings) },
    defaultBackend: settings.actorBackend,
  };
}
