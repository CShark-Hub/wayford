import { inspect } from "node:util";
import { WayfordError } from "@wayford/core";
import { describe, expect, test } from "vitest";
import { parseLlmSettings } from "./llm-settings.js";

// Distinctive, so a leak into an error cannot pass for a coincidence.
const KEY = "sk-or-v1-test-7c1e9a4d";

/** The error `parseLlmSettings` throws for `env`, checked to be the boundary's typed one. */
function settingsError(env: Record<string, string | undefined>): WayfordError {
  try {
    parseLlmSettings(env);
  } catch (error) {
    expect(error).toBeInstanceOf(WayfordError);
    expect((error as WayfordError).code).toBe("invalid_llm_settings");
    return error as WayfordError;
  }
  throw new Error("parseLlmSettings accepted settings it should reject");
}

describe("LLM_API_KEY", () => {
  test("a missing key is rejected, with a message saying where the key goes", () => {
    expect(settingsError({}).message).toMatch(/LLM_API_KEY: .*OpenRouter key .*root \.env/);
  });

  test("an empty key counts as missing", () => {
    expect(settingsError({ LLM_API_KEY: "" }).message).toMatch(/LLM_API_KEY: .*root \.env/);
  });

  // `fetch` refuses such a header with an error that quotes it whole, key included.
  test("a key with a line break or a space is refused at boot, without echoing it", () => {
    for (const key of [`${KEY}\n`, `${KEY}\r\nx`, `Bearer ${KEY}`]) {
      const error = settingsError({ LLM_API_KEY: key });
      expect(error.message).toMatch(/LLM_API_KEY: must be one line of printable characters/);
      expect(inspect(error, { depth: null })).not.toContain(KEY);
    }
  });

  test("a key alone is enough: OpenRouter, with the Actor on the ladder's pick", () => {
    const settings = parseLlmSettings({ LLM_API_KEY: KEY });
    expect(settings.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(settings.roles.actor).toStrictEqual({
      model: "openai/gpt-6-luna",
      temperature: 1,
      effort: "high",
    });
  });
});

describe("LLM_BASE_URL", () => {
  test.each([
    "https://api.openai.com/v1",
    "http://localhost:11434/v1",
    "http://127.0.0.1:11434/v1",
    "http://[::1]:11434/v1",
  ])("accepts %s", (url) => {
    expect(parseLlmSettings({ LLM_API_KEY: KEY, LLM_BASE_URL: url }).baseUrl).toBe(url);
  });

  test.each(["http://example.com", "http://localhost.example.com/v1", "http://0.0.0.0:11434/v1"])(
    "rejects %s, which would send the key in clear",
    (url) => {
      expect(settingsError({ LLM_API_KEY: KEY, LLM_BASE_URL: url }).message).toMatch(
        /LLM_BASE_URL: must use https/,
      );
    },
  );

  test.each(["ftp://example.com", "not a url"])("rejects %s", (url) => {
    expect(settingsError({ LLM_API_KEY: KEY, LLM_BASE_URL: url }).message).toMatch(/LLM_BASE_URL/);
  });
});

describe("the role variables", () => {
  test("one override per role reaches that role only", () => {
    const defaults = parseLlmSettings({ LLM_API_KEY: KEY }).roles;
    const settings = parseLlmSettings({
      LLM_API_KEY: KEY,
      LLM_EXTRACTOR_TEMPERATURE: "2",
      LLM_SCOUT_TEMPERATURE: "0",
      LLM_ACTOR_EFFORT: "low",
      LLM_ANALYST_MODEL: "anthropic/claude-opus-5.5",
    });
    expect(settings.roles).toStrictEqual({
      extractor: { ...defaults.extractor, temperature: 2 },
      scout: { ...defaults.scout, temperature: 0 },
      actor: { ...defaults.actor, effort: "low" },
      analyst: { ...defaults.analyst, model: "anthropic/claude-opus-5.5" },
    });
  });

  test("effort default sends no effort, so the key is absent rather than undefined", () => {
    const settings = parseLlmSettings({ LLM_API_KEY: KEY, LLM_SCOUT_EFFORT: "default" });
    expect(settings.roles.scout).not.toHaveProperty("effort");
  });

  test("an empty value takes the default, so a blank line in .env drops no effort", () => {
    const defaults = parseLlmSettings({ LLM_API_KEY: KEY }).roles;
    const settings = parseLlmSettings({
      LLM_API_KEY: KEY,
      LLM_ACTOR_EFFORT: "",
      LLM_ACTOR_MODEL: "",
    });
    expect(settings.roles.actor).toStrictEqual(defaults.actor);
  });

  test("an effort outside OpenRouter's list is rejected", () => {
    expect(settingsError({ LLM_API_KEY: KEY, LLM_ACTOR_EFFORT: "extreme" }).message).toMatch(
      /LLM_ACTOR_EFFORT/,
    );
  });

  test.each(["-0.1", "2.1", "warm"])("a temperature of %s is rejected", (temperature) => {
    const error = settingsError({ LLM_API_KEY: KEY, LLM_ANALYST_TEMPERATURE: temperature });
    expect(error.message).toMatch(/LLM_ANALYST_TEMPERATURE/);
  });
});

describe("LLM_ACTOR_BACKEND and LLM_JEV_MODEL", () => {
  test("a key alone runs the Actor on the LLM, with Jev pinned to typesafe/jev-1.13", () => {
    const settings = parseLlmSettings({ LLM_API_KEY: KEY });
    expect(settings.actorBackend).toBe("llm");
    expect(settings.jevModel).toBe("typesafe/jev-1.13");
  });

  test("accepts the Jev backend on the pinned model", () => {
    const settings = parseLlmSettings({
      LLM_API_KEY: KEY,
      LLM_ACTOR_BACKEND: "jev",
      LLM_JEV_MODEL: "typesafe/jev-1.13",
    });
    expect(settings).toMatchObject({ actorBackend: "jev", jevModel: "typesafe/jev-1.13" });
  });

  test("a backend other than llm or jev is rejected, on the line naming its variable", () => {
    const error = settingsError({ LLM_API_KEY: KEY, LLM_ACTOR_BACKEND: "claude-code" });
    expect(error.message).toMatch(/^ {2}LLM_ACTOR_BACKEND: \S/m);
    expect(error.message).not.toContain("claude-code");
  });

  // ADR 0001: both change the model under a tuned run. The System One API routes a bare id
  // under `typesafe/`, and `jev-latest` as `~typesafe/jev-latest`.
  test.each(["~typesafe/jev-latest", "typesafe/jev-router", "jev-latest", "jev-router"])(
    "rejects %s, which floats",
    (model) => {
      const error = settingsError({ LLM_API_KEY: KEY, LLM_JEV_MODEL: model });
      expect(error.message).toMatch(/^ {2}LLM_JEV_MODEL: must name a pinned Jev version/m);
      expect(error.message).not.toContain(model);
    },
  );
});

test("every offending variable gets its own line", () => {
  const error = settingsError({ LLM_BASE_URL: "http://example.com", LLM_SCOUT_EFFORT: "extreme" });
  const [header, ...lines] = error.message.split("\n");
  expect(header).toBe("Invalid LLM settings:");
  expect(lines.map((line) => /^ {2}(\w+): \S/.exec(line)?.[1]).sort()).toStrictEqual([
    "LLM_API_KEY",
    "LLM_BASE_URL",
    "LLM_SCOUT_EFFORT",
  ]);
});

test("no value reaches the error, the key least of all", () => {
  const error = settingsError({
    LLM_API_KEY: KEY,
    LLM_BASE_URL: "http://example.com/leak",
    LLM_ACTOR_EFFORT: "leaky",
  });
  // `inspect` renders the message, the stack, the cause and every own property.
  const rendered = inspect(error, { depth: null });
  for (const value of [KEY, "example.com/leak", "leaky"]) {
    expect(rendered).not.toContain(value);
  }
});
