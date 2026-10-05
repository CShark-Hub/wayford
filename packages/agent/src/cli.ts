/**
 * The setup the by-hand commands share, held once (issue #153): the repository's `.env` and
 * `runs/`, the target app on the port core's task fixtures name, the Chromium launch, the seed
 * and argument reading, the factory of the Actor backend a command runs on, and the failure line. Each command
 * used to hold its own copy, and a new command would have copied it again
 * (`tasks/s2-11-calibration-run.md`, Outcome).
 *
 * Importing it loads no `.env`, serves nothing and launches nothing (the backends it names read
 * their prompt files), so a test can import it; a command calls what it needs. It is not in the
 * barrel: it serves the commands, not the package's users.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Seed, WayfordError } from "@wayford/core";
import { serveTargetApp, type TargetApp } from "@wayford/filter/serve-target-app";
import { type Browser, chromium } from "playwright";
import type { ActorBackendFactory } from "./actor-backend.js";
import { jevActor } from "./jev-actor.js";
import { llmActor } from "./llm-actor.js";
import { ActorBackendName, type LlmSettings } from "./llm-settings.js";

/**
 * The repository's `.env`, which holds the key. Found from this file, as io's `ENV_FILE` is,
 * because pnpm starts a script in packages/agent.
 */
export const ENV_FILE = fileURLToPath(new URL("../../../.env", import.meta.url));
/** The repository's `runs/`, found the same way: one folder per run, and the commands' reports. */
export const RUNS_DIR = fileURLToPath(new URL("../../../runs/", import.meta.url));

/** Loads the root `.env`, when there is one, into `process.env`. */
export function loadRootEnv(): void {
  // Node's loader skips a variable the environment already holds, so a real one wins.
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
}

/** The port of core's task fixtures, `http://localhost:5174/`. */
export const TARGET_APP_PORT = 5174;

/**
 * Serves the build on 5174, so the observation's `URL:` line, the prompt and the recorded URLs
 * read the origin core's task fixtures name. Or says why not in one line: a setup to fix, not a
 * bug's stack. When the port is taken, the line also says what most likely holds it.
 */
export async function serveOnFixturePort(): Promise<TargetApp> {
  try {
    return await serveTargetApp({ port: TARGET_APP_PORT });
  } catch (error) {
    const reason = error instanceof Error ? (error.message.split("\n", 1)[0] ?? "") : String(error);
    const taken = /EADDRINUSE|already in use/i.test(reason)
      ? " Stop pnpm dev or the target-app preview, which hold that port."
      : "";
    throw new WayfordError(
      "target_app_unavailable",
      `the target app could not be served on ${TARGET_APP_PORT}: ${reason}.${taken}`,
      { cause: error },
    );
  }
}

/** Chromium, or an error that says how to install it, with why it did not launch in `cause`. */
export async function launchChromium(): Promise<Browser> {
  return chromium.launch().catch((error: unknown) => {
    throw new Error(
      "Chromium did not launch. If it is not installed, run " +
        "`pnpm --filter @wayford/agent exec playwright install --only-shell chromium`.",
      { cause: error },
    );
  });
}

/** A run seed written in digits, or `undefined`: `Number` would also read "1e3", " 7" or "0x10". */
export function parseSeed(text: string): Seed | undefined {
  const parsed = Seed.safeParse(/^\d+$/.test(text) ? Number(text) : Number.NaN);
  return parsed.success ? parsed.data : undefined;
}

/**
 * The script's own arguments. pnpm forwards the `--` that separates its own options from the
 * script's; only a leading one is pnpm's, so only that one is dropped.
 */
export function scriptArgs(argv: readonly string[]): string[] {
  return argv[0] === "--" ? argv.slice(1) : [...argv];
}

/** `--backend` as a command's usage line names it, from the settings' own names. */
export const BACKEND_USAGE = `[--backend ${ActorBackendName.options.join("|")}]`;

/**
 * `--backend`'s value: the backend it names, `undefined` when the flag is absent and
 * `LLM_ACTOR_BACKEND` decides once `.env` is loaded, or why it cannot be read. Only the exact
 * names count, so a typo or another tool's name is refused rather than guessed at.
 */
export function readBackend(
  text: string | undefined,
): { backend: ActorBackendName | undefined } | { error: string } {
  if (text === undefined) return { backend: undefined };
  const parsed = ActorBackendName.safeParse(text);
  if (parsed.success) return { backend: parsed.data };
  return { error: `--backend is ${ActorBackendName.options.join(" or ")}, got ${text}` };
}

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

/**
 * A failure on one line: a `WayfordError` by its code, `LlmError` included since it is one.
 * Anything else is a bug, printed whole with its stack.
 */
export function printFailure(error: unknown): void {
  // Never the settings: they hold the key.
  if (error instanceof WayfordError) console.error(`${error.code}: ${error.message}`);
  else console.error(error);
}
