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
