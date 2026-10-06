/**
 * The adapter's price table: what a call costs, per model id, read from
 * `packages/agent/models.yaml`. A model missing from the file is an error, never
 * a free call, so a new default fails at boot instead of under-counting a run.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Cost, WayfordError } from "@wayford/core";
import { parse } from "yaml";
import { z } from "zod";
import type { ActorBackendName, LlmSettings } from "./llm-settings.js";

export const ModelPrice = z
  .object({
    /** USD per million input tokens, OpenRouter's list price. */
    input: z.number().nonnegative(),
    /** USD per million output tokens, OpenRouter's list price. Reasoning tokens
     *  bill at this rate too. */
    output: z.number().nonnegative(),
    /** False: the endpoint gets JSON mode, not strict `json_schema`. */
    jsonSchema: z.boolean().default(true),
  })
  .strict();
export type ModelPrice = z.infer<typeof ModelPrice>;

const PriceTable = z.record(z.string().min(1), ModelPrice);

/**
 * Read and validate `models.yaml`. The path is found from this file rather than
 * the working directory, because pnpm starts every script inside its own
 * package and vitest runs from the root.
 */
export function loadModelPrices(): Record<string, ModelPrice> {
  const source = readFileSync(fileURLToPath(new URL("../models.yaml", import.meta.url)), "utf8");
  return PriceTable.parse(parse(source));
}

/** The price of `model`, or `llm_unknown_model` when the table has none. */
export function priceOf(prices: Record<string, ModelPrice>, model: string): ModelPrice {
  // Own keys only: an id such as "constructor" must not find Object's
  // prototype and bill as NaN.
  const price = Object.hasOwn(prices, model) ? prices[model] : undefined;
  if (price === undefined) {
    throw new WayfordError(
      "llm_unknown_model",
      `Model "${model}" has no price in packages/agent/models.yaml. Add its OpenRouter list price there; an unpriced model is never billed as free.`,
    );
  }
  return price;
}

/** What `tokensIn` and `tokensOut` cost at `price`, whose rates are per million. */
export function costOf(price: ModelPrice, tokensIn: number, tokensOut: number): Cost {
  return { tokensIn, tokensOut, usd: (tokensIn * price.input + tokensOut * price.output) / 1e6 };
}

// Per Actor call. The real calibration run of 2026-10-02 (Luna at effort high) measured about
// 1,000 tokens in and 100 out per step; these keep a margin of about 2x to 5x over it.
const ESTIMATE_TOKENS_IN_PER_STEP = 2000;
const ESTIMATE_TOKENS_OUT_PER_STEP = 500;

/**
 * What a set of runs would cost if every run took every step at that per-step figure. An
 * estimate, not a bound: retries, repairs, long reasoning and a regional host can exceed it. On a
 * free model it is 0. `calibrate` and the sweep CLI check it before they start.
 */
export function estimateUsd(price: ModelPrice, runs: number, maxSteps: number): number {
  const perStep = costOf(price, ESTIMATE_TOKENS_IN_PER_STEP, ESTIMATE_TOKENS_OUT_PER_STEP).usd;
  return runs * maxSteps * perStep;
}

/**
 * The set's estimated cost, or a `WayfordError` with `code` when it exceeds `maxUsd`:
 * `calibration_over_budget` from `calibrate`, `sweep_over_budget` from the sweep. Each checks it
 * before anything is served or launched.
 */
export function checkEstimate(
  price: ModelPrice,
  runs: number,
  maxSteps: number,
  maxUsd: number,
  code: string,
): number {
  const estimate = estimateUsd(price, runs, maxSteps);
  if (estimate > maxUsd) {
    const steps = `${maxSteps} step${maxSteps === 1 ? "" : "s"}`;
    throw new WayfordError(
      code,
      `the estimate for ${runs} runs of at most ${steps} is ${usd(estimate)}, over the limit of ${usd(maxUsd)}`,
    );
  }
  return estimate;
}

/** The model the Actor runs on `backend`: Jev's on Jev, the Actor role's on the LLM. */
export function actorModelOf(settings: LlmSettings, backend: ActorBackendName): string {
  return backend === "jev" ? settings.jevModel : settings.roles.actor.model;
}

/** An amount as the CLI and the errors print it, like `0.2250 USD`. */
export function usd(amount: number): string {
  return `${amount.toFixed(4)} USD`;
}
