import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { loadConfig, loadConfigFromEnvFile } from "./config.js";

test("defaults apply when the environment is empty", () => {
  const cfg = loadConfig({});
  expect(cfg.PORT).toBe(3000);
  expect(cfg.LLM_BASE_URL).toBe("https://openrouter.ai/api/v1");
});

test("coerces PORT and rejects garbage", () => {
  expect(loadConfig({ PORT: "4000" }).PORT).toBe(4000);
  expect(() => loadConfig({ PORT: "abc" })).toThrow(/PORT/);
  expect(() => loadConfig({ LLM_BASE_URL: "not a url" })).toThrow(/LLM_BASE_URL/);
});

describe("LLM_BASE_URL", () => {
  test("accepts https anywhere and plain http only on loopback", () => {
    for (const url of [
      "https://openrouter.ai/api/v1",
      "http://localhost:11434/v1",
      "http://127.0.0.1:11434/v1",
      "http://[::1]:11434/v1",
    ]) {
      expect(loadConfig({ LLM_BASE_URL: url }).LLM_BASE_URL).toBe(url);
    }
  });

  test("rejects plain http to any other host, which would send the key in clear", () => {
    for (const url of [
      "http://example.com/v1",
      "http://localhost.example.com/v1",
      "http://0.0.0.0:11434/v1",
    ]) {
      expect(() => loadConfig({ LLM_BASE_URL: url })).toThrow(/LLM_BASE_URL: must use https/);
    }
  });

  test("rejects schemes other than http and https", () => {
    expect(() => loadConfig({ LLM_BASE_URL: "ftp://example.com" })).toThrow(/LLM_BASE_URL/);
  });
});

test("LLM_API_KEY is optional until s2-01, and an empty value counts as unset", () => {
  expect(loadConfig({}).LLM_API_KEY).toBeUndefined();
  expect(loadConfig({ LLM_API_KEY: "" }).LLM_API_KEY).toBeUndefined();
  expect(loadConfig({ LLM_API_KEY: "sk-test" }).LLM_API_KEY).toBe("sk-test");
});

describe("loadConfigFromEnvFile", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "wayford-env-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("the file fills in what the environment leaves unset, and never overrides it", () => {
    const file = join(dir, ".env");
    writeFileSync(file, "PORT=4321\nLOG_LEVEL=debug\n");
    const cfg = loadConfigFromEnvFile(file, { LOG_LEVEL: "warn" });
    expect(cfg.PORT).toBe(4321);
    expect(cfg.LOG_LEVEL).toBe("warn");
  });

  test("a missing file leaves the defaults", () => {
    expect(loadConfigFromEnvFile(join(dir, "absent.env"), {}).PORT).toBe(3000);
  });
});
