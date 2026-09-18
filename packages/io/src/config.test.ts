import { expect, test } from "vitest";
import { loadConfig } from "./config.js";

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
