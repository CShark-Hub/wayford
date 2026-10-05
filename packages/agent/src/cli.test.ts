import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { backendFactory, ENV_FILE, parseSeed, RUNS_DIR, readBackend, scriptArgs } from "./cli.js";
import { parseLlmSettings } from "./llm-settings.js";

describe("parseSeed", () => {
  test.each([
    ["0", 0],
    ["7", 7],
    ["4294967295", 4294967295],
  ])("%s is the seed %d", (text, seed) => {
    expect(parseSeed(text)).toBe(seed);
  });

  // `Number` would read the first five, and the last two are outside a seed's range.
  test.each(["1e3", " 7", "7 ", "0x10", "", "-1", "4294967296"])("%j is refused", (text) => {
    expect(parseSeed(text)).toBeUndefined();
  });
});

describe("scriptArgs", () => {
  // Only a leading -- is the one pnpm forwards; one anywhere else is the script's.
  test.each([
    [
      ["--", "--seed", "1"],
      ["--seed", "1"],
    ],
    [
      ["--seed", "--"],
      ["--seed", "--"],
    ],
    [["--", "--"], ["--"]],
    [[], []],
  ])("%j is %j", (argv, args) => {
    expect(scriptArgs(argv)).toEqual(args);
  });
});

describe("readBackend", () => {
  test("an absent flag leaves the backend to LLM_ACTOR_BACKEND", () => {
    expect(readBackend(undefined)).toStrictEqual({ backend: undefined });
  });

  test.each(["llm", "jev"] as const)("%s is that backend", (text) => {
    expect(readBackend(text)).toStrictEqual({ backend: text });
  });

  // Only the exact names: a backend that is not one of ours is never guessed at.
  test.each(["", "JEV", "claude-code"])("%j is refused with the names it could be", (text) => {
    expect(readBackend(text)).toStrictEqual({ error: `--backend is llm or jev, got ${text}` });
  });
});

describe("backendFactory", () => {
  // The defaults: the ladder's model on every role, and Jev's pinned id. Both are priced, so the
  // real adapter is built, and nothing it builds may reach the network.
  const settings = parseLlmSettings({ LLM_API_KEY: "k" });
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
});

describe("the repository paths", () => {
  test("RUNS_DIR and ENV_FILE sit at the repository root, beside pnpm-workspace.yaml", () => {
    expect(basename(RUNS_DIR)).toBe("runs");
    expect(basename(ENV_FILE)).toBe(".env");
    expect(dirname(RUNS_DIR)).toBe(dirname(ENV_FILE));
    expect(existsSync(join(dirname(ENV_FILE), "pnpm-workspace.yaml"))).toBe(true);
  });
});
