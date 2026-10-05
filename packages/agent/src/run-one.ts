/**
 * One persona on one task with one run seed, against a fresh build of the target app, run by
 * hand: `pnpm --filter @wayford/agent run:one -- --persona prof_ada --task task_next-parcel
 * --seed 1 [--backend llm|jev]`.
 * The Actor runs on the backend `--backend` names, else on `LLM_ACTOR_BACKEND` (default `llm`),
 * with the key in the root `.env`, and every call is billed. Each event is printed as it arrives,
 * and the run's `result.json`, `webm` and `trace.zip` go to the repository's `runs/<run id>/`
 * (`docs/specs/2026-10-01-s2-03-actor-loop.md`, "run-one.ts"). The Jev backend draws each action
 * from Jev's probabilities with the run seed and writes no narration, so a Jev step has no
 * narration line, and its action line also says what was rolled and how likely the drawn option
 * was.
 *
 * The app is served on 5174, the port core's task fixtures name, so the observation's `URL:` line,
 * the prompt and the recorded start URL read the same origin in every run. It is a production
 * build, as seeded runs use (`docs/STACK.md`, "Target app"), so a running `pnpm dev` or target-app
 * preview, which hold that port, has to be stopped first.
 *
 * Exit 0 when the run finished, whatever its outcome: `gave_up` and `budget_exceeded` are
 * measurements, not failures. 1 for a run that failed or a setup that did, 2 for a usage error.
 */
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  type Action,
  type Cost,
  type DecisionRecord,
  drawOption,
  type RunEvent,
  type RunResult,
  type Seed,
} from "@wayford/core";
import {
  profileFixture,
  profileFixtures,
  targetAppJargon,
  taskFixture,
  taskFixtures,
} from "@wayford/core/fixtures";
import pino from "pino";
import { runActor } from "./actor-loop.js";
import { backendFactory } from "./backend-factory.js";
import {
  BACKEND_USAGE,
  launchChromium,
  loadRootEnv,
  parseSeed,
  printFailure,
  RUNS_DIR,
  readBackend,
  scriptArgs,
  serveOnFixturePort,
} from "./cli.js";
import { type ActorBackendName, parseLlmSettings } from "./llm-settings.js";
import { TARGET_APP_DEFAULTS } from "./start-url.js";

const USAGE = `usage: pnpm --filter @wayford/agent run:one -- --persona <profile id> --task <task id> --seed <run seed> ${BACKEND_USAGE}`;

interface Arguments {
  personaId: string;
  taskId: string;
  seed: Seed;
  /** Absent: `LLM_ACTOR_BACKEND`'s, read once `.env` is loaded. */
  backend: ActorBackendName | undefined;
}

/**
 * The three required options and the optional backend, or why they cannot be read. pnpm forwards
 * the `--` that separates its own options from the script's, and `parseArgs` would read
 * everything after it as positionals.
 */
function readArguments(argv: readonly string[]): Arguments | string {
  const args = scriptArgs(argv);
  let values: { persona?: string; task?: string; seed?: string; backend?: string };
  try {
    ({ values } = parseArgs({
      args,
      options: {
        persona: { type: "string" },
        task: { type: "string" },
        seed: { type: "string" },
        backend: { type: "string" },
      },
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
  const parsed = parseSeed(seed);
  if (parsed === undefined) {
    return `--seed is a run seed, an integer from 0 to 4294967295, got ${seed}`;
  }
  const flag = readBackend(values.backend);
  if ("error" in flag) return flag.error;
  return { personaId: persona, taskId: task, seed: parsed, backend: flag.backend };
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

/**
 * How a decision backend drew the action: `rolled 0.412 → p 0.84 of 10 options`. `p` is the drawn
 * option's own probability, as Jev sent it. Not the confidence, which nothing reads during a run;
 * `result.json` keeps it.
 */
function howDrawn({ options, probabilities, rolled }: DecisionRecord): string {
  // The loop parsed the event, so the record draws an option and `drawOption` cannot throw.
  const p = probabilities[drawOption(probabilities, rolled)] ?? 0;
  return `rolled ${rolled.toFixed(3)} → p ${p.toFixed(2)} of ${options.length} options`;
}

/**
 * What one event says, as a line of the run's printout, on the backend named. The run's last
 * event is the summary's.
 */
function eventLine(event: RunEvent, backend: ActorBackendName): string | undefined {
  const step = `step ${event.stepIndex}`;
  switch (event.type) {
    case "runStarted":
      return [
        `run      ${event.runId}`,
        `persona  ${event.profileId}`,
        `task     ${event.taskId}`,
        `seed     ${event.seed}`,
        `start    ${event.startUrl}`,
        `backend  ${backend}`,
        `model    ${event.modelIds.actor}`,
      ].join("\n");
    case "stepObserved": {
      const { elements, url } = event.observation;
      const shown = elements.filter((element) => element.state !== "invisible").length;
      return `${step}   on ${url}: ${shown} of ${elements.length} elements shown`;
    }
    case "narration":
      return `         ${JSON.stringify(event.text)}`;
    case "actionPlanned": {
      // The proposed action, the one the backend chose, which the bill and a draw are for. B1 may
      // have doubled a click since; the performed action and its dice are in `result.json`.
      const drawn = event.decision === undefined ? "" : `${howDrawn(event.decision)}; `;
      return `         ${phrase(event.proposedAction)} (${drawn}${billed(event.cost)})`;
    }
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

/** The run, and its exit code: 0 when it finished, 1 when it failed. */
async function main(args: Arguments): Promise<number> {
  loadRootEnv();
  const settings = parseLlmSettings(process.env);
  const backendId = args.backend ?? settings.actorBackend;
  // Log lines to stderr, without pid or hostname, so stdout is the run alone and can be pasted.
  const logger = pino({ base: null }, pino.destination(2));
  const app = await serveOnFixturePort();
  try {
    const browser = await launchChromium();
    try {
      let failure: string | undefined;
      const result = await runActor({
        browser,
        profile: profileFixture(args.personaId),
        task: taskFixture(args.taskId),
        seed: args.seed,
        params: TARGET_APP_DEFAULTS,
        jargon: targetAppJargon,
        runsDir: RUNS_DIR,
        backend: backendFactory(backendId, settings),
        logger,
        onEvent: (event) => {
          if (event.type === "runFailed") failure = event.error;
          const line = eventLine(event, backendId);
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
    printFailure(error);
    process.exitCode = 1;
  }
}
