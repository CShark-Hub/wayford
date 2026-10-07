/**
 * The setup the by-hand commands share, held once (issue #153): the repository's `.env` and
 * `runs/`, the target app on the port core's task fixtures name, the Chromium launch, the seed
 * and argument reading, and the failure line. Each command used to hold its own copy, and a new
 * command would have copied it again (`tasks/s2-11-calibration-run.md`, Outcome). The Actor
 * backend a command runs on is built by `backend-factory.ts`, which io shares (issue #161).
 *
 * Importing it loads no `.env`, serves nothing and launches nothing, so a test can import it; a
 * command calls what it needs. It is not in the barrel, since it loads Playwright and
 * serve-target-app: it serves the commands, not the package's users. io's sweep CLI imports it
 * through `@wayford/agent/cli`.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type RunEvent, Seed, WayfordError } from "@wayford/core";
import { serveTargetApp, type TargetApp } from "@wayford/filter/serve-target-app";
import { type Browser, chromium } from "playwright";
import { ActorBackendName } from "./llm-settings.js";

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
 * The fixtures' origin, where the target app's tasks start: what decides a task is on the app
 * (ADR 0003, D2). Not a served app's `origin`: Vite reports `127.0.0.1` there under
 * `--dns-result-order=ipv4first`, and every run would then be on another site, without the app's
 * parameters and jargon list.
 */
export const TARGET_APP_ORIGIN = `http://localhost:${TARGET_APP_PORT}`;

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

/**
 * What the target app's home page holds and another app's does not: the name in its `<title>`
 * (`packages/target-app/index.html`).
 */
const TARGET_APP_MARK = "Quillmere";

/**
 * The target app on 5174: what already answers there, or a build served on it, so it is never
 * served twice beside `pnpm dev`. `reused` says which: `"dev"` for Vite's dev server, `"build"`
 * for a preview, `false` when this call served the build. `close` closes only what this call
 * served. `port` and `serve` are for tests: a free port, and a serve that builds nothing.
 */
export async function targetAppOnFixturePort(
  options: { port?: number; serve?: () => Promise<TargetApp> } = {},
): Promise<TargetApp & { reused: "dev" | "build" | false }> {
  const origin =
    options.port === undefined ? TARGET_APP_ORIGIN : `http://localhost:${options.port}`;
  // A refused connection, a timeout or any other fetch error means nothing serves the port; if
  // something holds it all the same, `serveOnFixturePort` fails with its own line, so the app is
  // still not served twice.
  const home = await probe(`${origin}/`);
  if (home === undefined) {
    const app = await (options.serve ?? serveOnFixturePort)();
    return { origin: app.origin, close: () => app.close(), reused: false };
  }
  // Vite moves another project to 5174 when 5173 is taken. Runs on it would be billed against that
  // app with the target app's parameters, and stored as the target app's.
  if (!home.text.includes(TARGET_APP_MARK)) {
    throw new WayfordError(
      "target_app_unavailable",
      `something other than the target app answers on ${origin}: its home page does not name ${TARGET_APP_MARK}. Stop it, so the target app can be served there.`,
    );
  }
  // Vite's dev server serves its client script; a preview of the build answers 404 for it.
  const client = await probe(`${origin}/@vite/client`);
  return { origin, close: async () => {}, reused: client?.status === 200 ? "dev" : "build" };
}

/**
 * Where a command's task runs, for its header: the task's origin, and whether it is the target
 * app and how that is served. `reused` is `targetAppOnFixturePort`'s, undefined off the app, where
 * nothing is served. The dev server is said out loud: `docs/STACK.md` wants a build for seeded runs.
 */
export function siteLine(origin: string, reused: "dev" | "build" | false | undefined): string {
  switch (reused) {
    case undefined:
      return `${origin}, not the target app: no parameters, no jargon list`;
    case false:
      return `${origin}, the target app, served here`;
    case "build":
      return `${origin}, the target app, already served`;
    case "dev":
      return `${origin}, the target app on the dev server (pnpm dev): docs/STACK.md wants a build for seeded runs`;
  }
}

/** The status and body `url` answers within a second, or undefined when it does not answer. */
async function probe(url: string): Promise<{ status: number; text: string } | undefined> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
    // Read whole, so the socket closes and a test's server can close.
    return { status: response.status, text: await response.text() };
  } catch {
    return undefined;
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
 * `--seeds`: `a-b` as every seed from a to b, or `n` as that one seed; or why it cannot be read.
 * More than `maxSeeds` seeds is refused as a typo.
 */
export function readSeeds(text: string, maxSeeds: number): Seed[] | string {
  const bad = `--seeds is a range a-b or a single seed n, integers from 0 to 4294967295, got ${text}`;
  const range = /^(\d+)(?:-(\d+))?$/.exec(text);
  if (range === null) return bad;
  // The match holds digits only, so `parseSeed` refuses a part only when it is out of range.
  const first = parseSeed(range[1] ?? "");
  const last = range[2] === undefined ? first : parseSeed(range[2]);
  if (first === undefined || last === undefined) return bad;
  if (first > last) return `--seeds ${text} runs backwards: the range's first seed is its lowest`;
  // Checked before the list is built, so a range of billions is refused, not allocated.
  if (last - first + 1 > maxSeeds) return `--seeds names more than ${maxSeeds} seeds: ${text}`;
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

/** Plain decimals only: `Number` would also read "1e3", " 7" or "0x10". NaN when not one. */
export function readDecimal(text: string): number {
  return /^(\d+(\.\d*)?|\.\d+)$/.test(text) ? Number(text) : Number.NaN;
}

/**
 * `--max-usd`: the limit it names, `fallback` when the flag is absent, or why it cannot be read.
 * Plain decimals only, for the same reason as the seeds: `Number` would also read "1e3" or "0x10".
 */
export function readMaxUsd(text: string | undefined, fallback: number): number | string {
  if (text === undefined) return fallback;
  const maxUsd = readDecimal(text);
  return maxUsd > 0 ? maxUsd : `--max-usd is a positive number of USD, got ${text}`;
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
 * A live line for a Scout attempt's start and end, so a slow model is not silence. agent's and
 * io's Scout commands print the same lines.
 */
export function attemptLine(event: RunEvent): string | undefined {
  switch (event.type) {
    case "runStarted":
      return `  attempt ${event.seed}  ${event.runId}`;
    case "runFinished":
      return `    ${event.outcome} after ${event.stepIndex + 1} steps`;
    case "runFailed":
      return `    error: ${event.error}`;
    default:
      return undefined;
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
