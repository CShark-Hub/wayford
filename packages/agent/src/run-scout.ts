/**
 * Scout on both target-app goals, run by hand whenever the app changes:
 * `pnpm --filter @wayford/agent scout`. Scout is the real model on the key in the
 * root `.env`, on the `scout` role, and every call is billed. Each task's ground truth goes to the
 * repository's `runs/ground-truth/<task id>.json`, and its attempts' runs to
 * `runs/ground-truth/attempts/<run id>/` (`docs/specs/2026-10-03-s2-04-scout.md`).
 *
 * The app is on 5174, so the recorded URLs read the origin core's task fixtures name. What already
 * answers there is reused, a running `pnpm dev` or target-app preview, and a build is served only
 * when nothing does. The dev server is said out loud: `docs/STACK.md` wants a build for seeded runs.
 *
 * Exit 0 when both files are written, whether or not the goals were reached: a goal Scout did not
 * reach is a result. 1 when the setup or a task failed; a failed task is printed and the next one
 * still runs, so a session on a real key is not lost. 2 for a usage error: it takes no arguments.
 */
import { join } from "node:path";
import { taskFixtures } from "@wayford/core/fixtures";
import pino from "pino";
import { runActor } from "./actor-loop.js";
import {
  attemptLine,
  launchChromium,
  loadRootEnv,
  printFailure,
  RUNS_DIR,
  scriptArgs,
  siteLine,
  targetAppOnFixturePort,
} from "./cli.js";
import { parseLlmSettings } from "./llm-settings.js";
import { scout, scoutSummary } from "./scout.js";
import { TARGET_APP_DEFAULTS } from "./start-url.js";

// Named here, not in `cli.ts`: the Actor's commands import that module, and the Actor never
// learns where Scout writes (`actor-isolation.test.ts`).
const GROUND_TRUTH_DIR = join(RUNS_DIR, "ground-truth");

const USAGE = "usage: pnpm --filter @wayford/agent scout";

/** Scout on every task fixture, and the exit code. */
async function main(): Promise<number> {
  loadRootEnv();
  const settings = parseLlmSettings(process.env);
  // Log lines to stderr, without pid or hostname, so stdout is the printout alone.
  const logger = pino({ base: null }, pino.destination(2));
  const app = await targetAppOnFixturePort();
  console.log(`site: ${siteLine(app.origin, app.reused)}`);
  try {
    const browser = await launchChromium();
    try {
      let failed = false;
      for (const task of taskFixtures) {
        console.log(`\n${task.id}: ${task.goal}`);
        let usd = 0;
        try {
          const truth = await scout({
            run: (options) => runActor({ ...options, browser }),
            task,
            params: TARGET_APP_DEFAULTS,
            dir: GROUND_TRUTH_DIR,
            settings,
            logger,
            onEvent: (event) => {
              if (event.type === "runFinished" || event.type === "runFailed") usd += event.cost.usd;
              const line = attemptLine(event);
              if (line !== undefined) console.log(line);
            },
          });
          const file = join(GROUND_TRUTH_DIR, `${truth.taskId}.json`);
          console.log(`\n${scoutSummary(truth, usd, file)}`);
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
