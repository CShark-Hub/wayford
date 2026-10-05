import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import { ENV_FILE, parseSeed, RUNS_DIR, readBackend, scriptArgs } from "./cli.js";

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

describe("the repository paths", () => {
  test("RUNS_DIR and ENV_FILE sit at the repository root, beside pnpm-workspace.yaml", () => {
    expect(basename(RUNS_DIR)).toBe("runs");
    expect(basename(ENV_FILE)).toBe(".env");
    expect(dirname(RUNS_DIR)).toBe(dirname(ENV_FILE));
    expect(existsSync(join(dirname(ENV_FILE), "pnpm-workspace.yaml"))).toBe(true);
  });
});
