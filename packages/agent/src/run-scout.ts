/**
 * Scout on both target-app goals, against a fresh build of the target app, run by hand whenever the
 * app changes: `pnpm --filter @wayford/agent scout`. Scout is the real model on the key in the
 * root `.env`, on the `scout` role, and every call is billed. Each task's ground truth goes to the
 * repository's `runs/ground-truth/<task id>.json`, and its attempts' runs to
 * `runs/ground-truth/attempts/<run id>/` (`docs/specs/2026-10-03-s2-04-scout.md`).
 *
 * The app is served on 5174, as `run-one.ts` serves it, so the recorded URLs read the origin core's
 * task fixtures name. A running `pnpm dev` or target-app preview holds that port and has to be
 * stopped first.
 *
 * Exit 0 when both files are written, whether or not the goals were reached: a goal Scout did not
 * reach is a result. 1 when the setup or a task failed; a failed task is printed and the next one
 * still runs, so a session on a real key is not lost. 2 for a usage error: it takes no arguments.
 */
import { join } from "node:path";
import type { GroundTruth, RunEvent, ScoutPath } from "@wayford/core";
import { taskFixtures } from "@wayford/core/fixtures";
import pino from "pino";
import {
  launchChromium,
  loadRootEnv,
  printFailure,
  RUNS_DIR,
  scriptArgs,
  serveOnFixturePort,
} from "./cli.js";
import { parseLlmSettings } from "./llm-settings.js";
import { scout } from "./scout.js";
import { TARGET_APP_DEFAULTS } from "./start-url.js";

// Named here, not in `cli.ts`: the Actor's commands import that module, and the Actor never
// learns where Scout writes (`actor-isolation.test.ts`).
const GROUND_TRUTH_DIR = join(RUNS_DIR, "ground-truth");

const USAGE = "usage: pnpm --filter @wayford/agent scout";

/** A URL as the printout shows it: its path, since every page is on the one served app. */
function page(url: string): string {
  return new URL(url).pathname;
}

/**
 * A path on one line: `/ —click "<key>"→ /deliveries —click "<key>"→ /deliveries/archive`. A key
 * holds the page's own text, quoted as JSON so a control character in it cannot reach the
 * terminal.
 */
function pathLine(path: ScoutPath): string {
  const steps = path.steps.map(
    (step) =>
      `${page(step.url)} —${step.action}${step.key === undefined ? "" : ` ${JSON.stringify(step.key)}`}→`,
  );
  return [...steps, page(path.reachedUrl)].join(" ");
}

/** What one task's ground truth says, and where it was written. */
function summary(truth: GroundTruth, usd: number): string {
  const reached = truth.attempts.filter((attempt) => attempt.outcome === "success").length;
  const lines = [
    `${truth.taskId}: reached in ${reached} of ${truth.attempts.length} attempts`,
    ...truth.attempts.map(
      ({ runId, outcome, path }) =>
        `  ${runId}  ${outcome}${path === undefined ? "" : `  ${pathLine(path)}`}`,
    ),
  ];
  if (truth.shortest !== undefined) {
    const steps = truth.shortest.path.steps.length;
    lines.push(`shortest  ${truth.shortest.runId} (${steps} step${steps === 1 ? "" : "s"})`);
  }
  if (truth.target !== undefined) {
    lines.push(`target    ${JSON.stringify(truth.target.key)} on ${page(truth.target.page)}`);
  }
  lines.push(
    `model     ${truth.modelId}`,
    `cost      ${usd.toFixed(6)} USD`,
    `file      ${join(GROUND_TRUTH_DIR, `${truth.taskId}.json`)}`,
  );
  return lines.join("\n");
}

/** A live line for an attempt's start and end, so a slow model is not silence. */
function progressLine(event: RunEvent): string | undefined {
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

/** Scout on every task fixture, and the exit code. */
async function main(): Promise<number> {
  loadRootEnv();
  const settings = parseLlmSettings(process.env);
  // Log lines to stderr, without pid or hostname, so stdout is the printout alone.
  const logger = pino({ base: null }, pino.destination(2));
  const app = await serveOnFixturePort();
  try {
    const browser = await launchChromium();
    try {
      let failed = false;
      for (const task of taskFixtures) {
        console.log(`\n${task.id}: ${task.goal}`);
        let usd = 0;
        try {
          const truth = await scout({
            browser,
            task,
            params: TARGET_APP_DEFAULTS,
            dir: GROUND_TRUTH_DIR,
            settings,
            logger,
            onEvent: (event) => {
              if (event.type === "runFinished" || event.type === "runFailed") usd += event.cost.usd;
              const line = progressLine(event);
              if (line !== undefined) console.log(line);
            },
          });
          console.log(`\n${summary(truth, usd)}`);
        } catch (error) {
          printFailure(error);
          failed = true;
        }
      }
      return failed ? 1 : 0;
    } finally {
      await browser.close();
    }
  } finally {
    await app.close();
  }
}

const args = scriptArgs(process.argv.slice(2));
if (args.length > 0) {
  console.error(`it takes no arguments, got ${args.join(" ")}\n${USAGE}`);
  process.exitCode = 2;
} else {
  try {
    process.exitCode = await main();
  } catch (error) {
    printFailure(error);
    process.exitCode = 1;
  }
}
