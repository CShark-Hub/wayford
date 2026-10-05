/**
 * The adapter against the real provider, run by hand: a one-field schema on `extractor` proves a
 * key, a strict body and the cost line work end to end, and core's `ActorResponse` on `actor`
 * shows now, not in s2-03, whether the Actor model's strict mode takes that schema's keywords.
 *
 * It needs a real key in the root `.env`, and both calls are billed. Like the other entry scripts,
 * `run-one.ts` among them, it reads the environment; the adapter itself is handed its settings.
 */
import { ActorResponse, type LlmRole } from "@wayford/core";
import pino from "pino";
import { z } from "zod";
import { loadRootEnv, printFailure } from "./cli.js";
import { type ChatMessage, createLlm } from "./llm.js";
import { parseLlmSettings } from "./llm-settings.js";

try {
  loadRootEnv();
  const settings = parseLlmSettings(process.env);
  // No pid or hostname in the lines: the output is pasted into a PR.
  const llm = createLlm(settings, { logger: pino({ base: null }) });

  const run = async (role: LlmRole, schema: z.ZodObject, messages: ChatMessage[]) => {
    const start = performance.now();
    const { value, model, cost } = await llm.complete({ role, schema, messages });
    // Printed only: the first real figure for sizing the adapter's timeout.
    const ms = Math.round(performance.now() - start);
    const effort = settings.roles[role].effort ?? "not sent";
    console.log(JSON.stringify(value, null, 2));
    console.log(
      `cost: ${cost.tokensIn} in, ${cost.tokensOut} out, ${cost.usd.toFixed(6)} USD (${model}, effort ${effort}, ${ms} ms)`,
    );
  };

  await run("extractor", z.object({ capital: z.string() }), [
    { role: "system", content: "Answer with one JSON object and nothing else." },
    {
      role: "user",
      content: 'What is the capital of France? Answer as JSON with the field "capital".',
    },
  ]);
  await run("actor", ActorResponse, [
    {
      role: "system",
      content:
        "You are using a web page. Answer with one JSON object holding a short narration and one action.",
    },
    {
      role: "user",
      content:
        'Goal: see what you ordered last month.\nPage: e1 link "Home", e2 link "Past orders"',
    },
  ]);
} catch (error) {
  printFailure(error);
  process.exitCode = 1;
}
