/**
 * One persona on one task with one run seed, against a fresh build of the target app, run by
 * hand: `pnpm --filter @wayford/agent run:one -- --persona prof_ada --task task_next-parcel --seed 1`.
 * The Actor is the real model on the key in the root `.env`, and every call is billed. Each event
 * is printed as it arrives, and the run's `result.json`, `webm` and `trace.zip` go to the
 * repository's `runs/<run id>/` (`docs/specs/2026-10-01-s2-03-actor-loop.md`, "run-one.ts").
 *
 * The app is served on 5174, the port core's task fixtures name, so the observation's `URL:` line,
 * the prompt and the recorded start URL read the same origin in every run. It is a production
 * build, as seeded runs use (`docs/STACK.md`, "Target app"), so a running `pnpm dev` or target-app
 * preview, which hold that port, has to be stopped first.
 *
 * Exit 0 when the run finished, whatever its outcome: `gave_up` and `budget_exceeded` are
 * measurements, not failures. 1 for a run that failed or a setup that did, 2 for a usage error.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  type Action,
  type Cost,
  type RunEvent,
  type RunResult,
  Seed,
  WayfordError,
} from "@wayford/core";
import { profileFixture, profileFixtures, taskFixture, taskFixtures } from "@wayford/core/fixtures";
import { serveTargetApp, type TargetApp } from "@wayford/filter/serve-target-app";
import pino from "pino";
import { chromium } from "playwright";
import { runActor } from "./actor-loop.js";
import { llmActor } from "./llm-actor.js";
import { parseLlmSettings } from "./llm-settings.js";
import { TARGET_APP_DEFAULTS } from "./start-url.js";

// Found from this file, as smoke-llm's `.env` is, because pnpm starts the script in packages/agent.
const ENV_FILE = fileURLToPath(new URL("../../../.env", import.meta.url));
const RUNS_DIR = fileURLToPath(new URL("../../../runs/", import.meta.url));

/** The port of core's task fixtures, `http://localhost:5174/`. */
const TARGET_APP_PORT = 5174;

const USAGE =
  "usage: pnpm --filter @wayford/agent run:one -- --persona <profile id> --task <task id> --seed <run seed>";

interface Arguments {
  personaId: string;
  taskId: string;
  seed: Seed;
}

/**
 * The three options, or why they cannot be read. pnpm forwards the `--` that separates its own
 * options from the script's, and `parseArgs` would read everything after it as positionals.
 */
function readArguments(argv: readonly string[]): Arguments | string {
  const args = argv[0] === "--" ? argv.slice(1) : [...argv];
  let values: { persona?: string; task?: string; seed?: string };
  try {
    ({ values } = parseArgs({
      args,
      options: { persona: { type: "string" }, task: { type: "string" }, seed: { type: "string" } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  const { persona, task, seed } = values;
  if (persona === undefined || task === undefined || seed === undefined) {
    return "--persona, --task and --seed are all required";
  }
  if (!profileFixtures.some((profile) => profile.id === persona)) {
    return `no persona ${persona}: one of ${profileFixtures.map((profile) => profile.id).join(", ")}`;
  }
  if (!taskFixtures.some((fixture) => fixture.id === task)) {
    return `no task ${task}: one of ${taskFixtures.map((fixture) => fixture.id).join(", ")}`;
  }
  // Digits only, since `Number` would also read "1e3", " 7" or "0x10".
  const parsed = Seed.safeParse(/^\d+$/.test(seed) ? Number(seed) : Number.NaN);
  if (!parsed.success) return `--seed is a run seed, an integer from 0 to 4294967295, got ${seed}`;
  return { personaId: persona, taskId: task, seed: parsed.data };
}

/** An action as one short phrase: `click e3`, `scroll down`, `type "Bern" into e4`. */
function phrase(action: Action): string {
  switch (action.type) {
    case "click":
    case "doubleClick":
      return `${action.type} ${action.ref}`;
    case "type":
      return `type ${JSON.stringify(action.text)} into ${action.ref}`;
    case "scroll":
      return `scroll ${action.direction}`;
    case "wait":
      return `wait ${action.ms} ms`;
    case "back":
    case "giveUp":
      return action.type;
  }
}

function billed(cost: Cost): string {
  return `${cost.tokensIn} in, ${cost.tokensOut} out, ${cost.usd.toFixed(6)} USD`;
}

/** What one event says, as a line of the run's printout. The run's last event is the summary's. */
function eventLine(event: RunEvent): string | undefined {
  const step = `step ${event.stepIndex}`;
  switch (event.type) {
    case "runStarted":
      return [
        `run      ${event.runId}`,
        `persona  ${event.profileId}`,
        `task     ${event.taskId}`,
        `seed     ${event.seed}`,
        `start    ${event.startUrl}`,
        `model    ${event.modelIds.actor}`,
      ].join("\n");
    case "stepObserved": {
      const { elements, url } = event.observation;
      const shown = elements.filter((element) => element.state !== "invisible").length;
      return `${step}   on ${url}: ${shown} of ${elements.length} elements shown`;
    }
    case "narration":
      return `         ${JSON.stringify(event.text)}`;
    case "actionPlanned":
      // Proposed and performed are one action until s2-10's dice can rewrite it.
      return `         ${phrase(event.proposedAction)} (${billed(event.cost)})`;
    case "actionPerformed":
      return `         landed on ${event.urlAfter}`;
    case "stepWasted": {
      const refused = event.rejected.map(({ action }) => phrase(action)).join(", then ");
      return `         wasted: ${refused} named a ref the page lacks (${billed(event.cost)})`;
    }
    case "runFinished":
    case "runFailed":
      return undefined;
  }
}

/** The run's last lines: how it ended, what it cost, and where its files are. */
function summary(result: RunResult, failure: string | undefined): string {
  const runDir = join(RUNS_DIR, result.id);
  const lines = [
    "",
    `outcome  ${result.outcome}${failure === undefined ? "" : `: ${failure}`}`,
    `steps    ${result.steps.length}`,
    `time     ${(result.durationMs / 1000).toFixed(1)} s`,
    `cost     ${billed(result.cost)}`,
    `result   ${join(runDir, "result.json")}`,
  ];
  if (result.videoPath !== undefined) lines.push(`video    ${join(runDir, result.videoPath)}`);
  if (result.tracePath !== undefined) lines.push(`trace    ${join(runDir, result.tracePath)}`);
  return lines.join("\n");
}

/**
 * Serves the build on 5174, or says why not in one line: a setup to fix, not a bug's stack. When
 * the port is taken, the line also says what most likely holds it.
 */
async function serve(): Promise<TargetApp> {
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

/** The run, and its exit code: 0 when it finished, 1 when it failed. */
async function main(args: Arguments): Promise<number> {
  // Node's loader skips a variable the environment already holds, so a real one wins.
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const settings = parseLlmSettings(process.env);
  // Log lines to stderr, without pid or hostname, so stdout is the run alone and can be pasted.
  const logger = pino({ base: null }, pino.destination(2));
  const app = await serve();
  try {
    const browser = await chromium.launch().catch((error: unknown) => {
      throw new Error(
        "Chromium did not launch. If it is not installed, run " +
          "`pnpm --filter @wayford/agent exec playwright install --only-shell chromium`.",
        { cause: error },
      );
    });
    try {
      let failure: string | undefined;
      const result = await runActor({
        browser,
        profile: profileFixture(args.personaId),
        task: taskFixture(args.taskId),
        seed: args.seed,
        params: TARGET_APP_DEFAULTS,
        runsDir: RUNS_DIR,
        backend: llmActor({ settings }),
        logger,
        onEvent: (event) => {
          if (event.type === "runFailed") failure = event.error;
          const line = eventLine(event);
          if (line !== undefined) console.log(line);
        },
      });
      console.log(summary(result, failure));
      return result.outcome === "error" ? 1 : 0;
    } finally {
      await browser.close();
    }
  } finally {
    await app.close();
  }
}

const args = readArguments(process.argv.slice(2));
if (typeof args === "string") {
  console.error(`${args}\n${USAGE}`);
  process.exitCode = 2;
} else {
  try {
    process.exitCode = await main(args);
  } catch (error) {
    // Never the settings: they hold the key. Anything that is not a `WayfordError` is a bug,
    // printed whole with its stack.
    if (error instanceof WayfordError) console.error(`${error.code}: ${error.message}`);
    else console.error(error);
    process.exitCode = 1;
  }
}
