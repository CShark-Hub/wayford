/**
 * The Actor backend a name stands for, on the settings: what `run:one`, `calibrate` and io's runs
 * build their Actor from, so one `LLM_ACTOR_BACKEND` gives one backend everywhere (issue #161).
 * In the barrel because io imports it, and agent's `exports` do not reach `cli.ts`.
 */
import type { ActorBackendFactory } from "./actor-backend.js";
import { jevActor } from "./jev-actor.js";
import { llmActor } from "./llm-actor.js";
import type { ActorBackendName, LlmSettings } from "./llm-settings.js";

/**
 * The factory of the backend named, on `settings`. A run set uses one backend, and nothing falls
 * back to the other (ADR 0001 §1). The switch covers every name the settings know, so a new one
 * fails to compile here until it has a backend.
 */
export function backendFactory(name: ActorBackendName, settings: LlmSettings): ActorBackendFactory {
  switch (name) {
    case "llm":
      return llmActor({ settings });
    case "jev":
      return jevActor({ settings });
  }
}
