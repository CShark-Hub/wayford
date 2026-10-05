import pino from "pino";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { backendFactory } from "./backend-factory.js";
import { parseLlmSettings } from "./llm-settings.js";

// The defaults: the ladder's model on every role, and Jev's pinned id. Both are priced, so the
// real adapter is built, and nothing it builds may reach the network.
const settings = parseLlmSettings({ LLM_API_KEY: "test-key" });
const run = { logger: pino({ level: "silent" }), providerSeed: 0, decisionDraw: () => 0.5 };
const network = vi.fn(() => {
  throw new Error("a test reached the network");
});

beforeEach(() => {
  network.mockClear();
  vi.stubGlobal("fetch", network);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("backendFactory", () => {
  test("jev builds Jev's backend: its pinned model, and no sampling, sending nothing", () => {
    const backend = backendFactory("jev", settings)(run);

    expect(backend.modelId).toBe("typesafe/jev-1.13");
    expect(backend.sampling).toBeUndefined();
    expect(network).not.toHaveBeenCalled();
  });

  test("llm builds the LLM backend: the actor role's model and sampling, sending nothing", () => {
    const backend = backendFactory("llm", settings)(run);

    expect(backend.modelId).toBe(settings.roles.actor.model);
    expect(backend.sampling).toStrictEqual({
      temperature: settings.roles.actor.temperature,
      providerSeed: 0,
    });
    expect(network).not.toHaveBeenCalled();
  });

  test("an unset LLM_ACTOR_BACKEND builds the LLM backend, sending nothing", () => {
    const s = parseLlmSettings({ LLM_API_KEY: "test-key" });

    expect(backendFactory(s.actorBackend, s)(run).modelId).toBe(s.roles.actor.model);
    expect(network).not.toHaveBeenCalled();
  });
});
