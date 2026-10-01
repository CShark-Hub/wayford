/**
 * `decide` against the real provider, run by hand: the go/no-go probe of
 * `docs/adr/0001-jev-actor-backend.md`. Jev gets core's fixture observation as the Actor sees it,
 * with the target app's hard goal, and one option per element ref plus `back`. It prints every
 * option with its probability, highest first, and a cost line. Whether the top option is the one
 * a human would pick is the reviewer's call, written in the PR.
 *
 * It is no Actor: the instruction is a probe's, not s2-06's template, and nothing is drawn.
 *
 * It needs a real key in the root `.env`, and the call is billed, at a few hundred input tokens.
 * Like `smoke-llm.ts`, it reads the environment; everything else is handed its settings.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderObservationForModel, toActorObservation, WayfordError } from "@wayford/core";
import { observationFixture } from "@wayford/core/fixtures";
import pino from "pino";
import { createLlm } from "./llm.js";
import { parseLlmSettings } from "./llm-settings.js";

// Found from this file, as io's `ENV_FILE` is, because pnpm starts the script in packages/agent.
const ENV_FILE = fileURLToPath(new URL("../../../.env", import.meta.url));

// The hard goal sentence of the target app, already free of path words (`tasks/m0-06-target-app.md`).
const GOAL = "you want to see what you ordered three months ago";

const INSTRUCTIONS =
  "You are the person using this web page, trying to reach the goal above. Which one action do you take next?";

try {
  // Node's loader skips a variable the environment already holds, so a real one wins.
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const settings = parseLlmSettings(process.env);
  // No pid or hostname in the lines: the output is pasted into a PR.
  const llm = createLlm(settings, { logger: pino({ base: null }) });

  const observation = toActorObservation(observationFixture);
  const state = `Goal: ${GOAL}\n\n${renderObservationForModel(observation)}`;
  // Each description from the Actor-facing element, so a degraded one goes under its masked name.
  const options: Record<string, string> = {};
  for (const { ref, role, name } of observation.elements) {
    options[ref] = `Click the ${role} ${JSON.stringify(name)}`;
  }
  options.back = "Go back to the previous page";

  const start = performance.now();
  const decision = await llm.decide({
    role: "actor",
    state,
    question: { instructions: INSTRUCTIONS, options },
  });
  // Printed only: the first real figure for Jev's latency.
  const ms = Math.round(performance.now() - start);

  const { probabilities, confidence, choice, model, cost } = decision;
  // `decide` checked that the keys are exactly the offered ones.
  const ranked = Object.entries(probabilities).sort(([, a], [, b]) => b - a);
  for (const [key, probability] of ranked) {
    console.log(`${probability.toFixed(3)}  ${key.padEnd(4)}  ${options[key]}`);
  }
  console.log(`confidence: ${confidence}, Jev's own pick: ${choice}`);
  console.log(
    `cost: ${cost.tokensIn} in, ${cost.tokensOut} out, ${cost.usd.toFixed(8)} USD (${model}, ${ms} ms)`,
  );
} catch (error) {
  // `LlmError` is a `WayfordError`, so one check covers both. Never the settings: they hold the key.
  // Anything else is a bug, printed whole with its stack.
  if (error instanceof WayfordError) console.error(`${error.code}: ${error.message}`);
  else console.error(error);
  process.exitCode = 1;
}
