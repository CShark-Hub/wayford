/**
 * The one way a package asks a model for something: `complete` sends the caller's messages to the
 * role's model on an OpenAI-compatible `/chat/completions` endpoint and returns a zod-parsed
 * object, what it cost and the sampling it was sent (`docs/PLAN.md`, "AI access").
 *
 * Plain `fetch` and no SDK, so the body holds the caller's messages and the role's settings and
 * nothing else reaches the model. Every setting comes from config, so there is no provider branch
 * here either.
 */
import { type Cost, LLM_ROLES, type LlmRole, Sampling, WayfordError } from "@wayford/core";
import type { Logger } from "pino";
import { z } from "zod";
import type { LlmSettings, RoleSettings } from "./llm-settings.js";
import { costOf, loadModelPrices, type ModelPrice, priceOf } from "./models.js";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type CompleteRequest<S extends z.ZodObject> = {
  role: LlmRole;
  messages: readonly ChatMessage[];
  /** An object at the root, because strict `json_schema` modes reject anything else there. */
  schema: S;
  /** Sent only when passed: the adapter never makes one up. */
  seed?: number;
};

export type Completion<T> = {
  value: T;
  /** The configured id, the one priced. The provider's answer may name a snapshot of it. */
  model: string;
  cost: Cost;
  sampling: Sampling;
};

export type Llm = {
  complete<S extends z.ZodObject>(request: CompleteRequest<S>): Promise<Completion<z.output<S>>>;
};

export type LlmDeps = {
  /** Fixed for the instance, so a caller builds one `Llm` per run, with the run's child logger. */
  logger: Logger;
  fetch?: typeof fetch;
  /** Tests record the backoff instead of waiting it out. */
  sleep?: (ms: number) => Promise<void>;
  /** Per attempt. */
  timeoutMs?: number;
};

/**
 * A call that failed. `cost` is what it spent before failing: those tokens are billed all the
 * same, and a run's total that dropped them would under-count.
 */
export class LlmError extends WayfordError {
  readonly cost: Cost;

  constructor(code: string, message: string, cost: Cost, options?: ErrorOptions) {
    super(code, message, options);
    this.cost = cost;
  }
}

/**
 * What a call is sent, as the run records it: the temperature, and the provider seed only when
 * the caller passed one. The adapter and its fake both build it here, so they cannot drift.
 */
export function samplingOf(temperature: number, seed?: number): Sampling {
  return Sampling.parse(seed === undefined ? { temperature } : { temperature, providerSeed: seed });
}

// `max` effort on an Analyst-sized prompt can think for minutes; a shorter limit cuts real calls.
const DEFAULT_TIMEOUT_MS = 300_000;

// The first attempt plus the "at most 3" retries of `docs/STACK.md`.
const MAX_ATTEMPTS = 4;
const FIRST_BACKOFF_MS = 1000;

// Enough of a provider's error to act on, without pasting a whole error page into a message.
const PROVIDER_TEXT_LIMIT = 300;

const Usage = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
});
type Usage = z.infer<typeof Usage>;

const Choice = z.object({ message: z.object({ content: z.string().nullable() }) });

// The fields the adapter reads. Providers add others, which pass unchecked.
const ChatCompletion = z.object({
  // A tuple with a rest element rather than an array, so "at least one choice" is in the type.
  choices: z.tuple([Choice], Choice),
  usage: Usage,
  // Which snapshot and which host answered, logged only: calls are not pinned to one host.
  model: z.string().optional(),
  provider: z.string().optional(),
});

// `code` is a number on OpenRouter, a string or null on OpenAI and Ollama. OpenRouter keeps the
// host's own reason in `metadata.raw`; its `message` alone is often "Provider returned error".
// Every field but `message` is optional: zod 4 requires a key typed `z.unknown()` to be present,
// and `metadata` takes other shapes on other errors, so any shape of it is accepted.
const ErrorObject = z.object({
  code: z.unknown().optional(),
  message: z.string(),
  metadata: z.object({ raw: z.unknown().optional() }).nullish().catch(null),
});
const ProviderError = z.object({ error: ErrorObject });

/**
 * OpenRouter sends `200 OK` once a host accepts the request, so a host that fails after that
 * reports inside the body: a top-level `error`, or a choice that ended in `error`, with or
 * without its own `error` object, next to partial output (openrouter.ai/docs, "Errors and
 * debugging", mid-stream errors).
 */
const MaybeErrorIn2xx = z.object({
  error: ErrorObject.optional(),
  choices: z
    .tuple([z.object({ error: ErrorObject.optional(), finish_reason: z.unknown() })], z.unknown())
    .optional(),
  usage: Usage.optional(),
});

/** What every attempt of one `complete` shares. `cost` is its running total. */
type Call = { role: LlmRole; config: RoleSettings; price: ModelPrice; logger: Logger; cost: Cost };

/**
 * One attempt, classified. Only a 2xx reports `usage`: the answer, or a host that failed inside
 * one. `what` names the failure for the error message.
 */
type Attempt =
  | {
      kind: "ok";
      status: number;
      content: string | null;
      usage: Usage;
      served?: string | undefined;
      host?: string | undefined;
    }
  | {
      kind: "retry" | "fail";
      code: "llm_request_failed" | "llm_bad_response";
      outcome: string;
      what: string;
      status?: number;
      usage?: Usage;
      cause?: unknown;
    };

type Parsed<T> =
  | { ok: true; value: T }
  | { ok: false; errorText: string; error: SyntaxError | z.ZodError };

export function createLlm(settings: LlmSettings, deps: LlmDeps): Llm {
  const prices = loadModelPrices();
  // Every role up front, so an unknown model fails at boot and not on the first Analyst call.
  for (const role of LLM_ROLES) priceOf(prices, settings.roles[role].model);

  const endpoint = `${settings.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const headers = {
    authorization: `Bearer ${settings.apiKey}`,
    "content-type": "application/json",
  };
  const send = deps.fetch ?? fetch;
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function attempt(payload: string): Promise<Attempt> {
    const signal = AbortSignal.timeout(timeoutMs);
    let response: Response;
    let text: string;
    try {
      response = await send(endpoint, { method: "POST", headers, body: payload, signal });
      // Whole, before anything uses it: a body cut off midway rejects here and is retried as a
      // network error, never parsed as half an answer.
      text = await response.text();
    } catch (error) {
      // A timeout is not retried: an aborted request that does not stream is still generated and
      // billed, so a retry would pay for the same tokens twice, with no usage to record either.
      if (signal.aborted) {
        const what = `a timeout after ${timeoutMs / 1000} s, which the provider may still bill`;
        return { kind: "fail", code: "llm_request_failed", outcome: "timeout", what, cause: error };
      }
      const what = `a network error: ${networkReason(error)}`;
      return { kind: "retry", code: "llm_request_failed", outcome: "network", what, cause: error };
    }
    return classify(response.status, parseJson(text), text);
  }

  /** One round: the same bytes until a chat completion, or until retrying cannot help. */
  async function post(
    call: Call,
    round: "answer" | "repair",
    body: object,
  ): Promise<string | null> {
    // Never a message, the content, the key or a header.
    const logger = call.logger.child({ round });
    // Serialised once, so every attempt sends the same complete request, whatever the caller
    // does with its message array meanwhile.
    const payload = JSON.stringify(body);
    for (let n = 1; ; n++) {
      if (n > 1) await sleep(FIRST_BACKOFF_MS * 2 ** (n - 2));
      const result = await attempt(payload);
      if (result.usage !== undefined) {
        const { prompt_tokens, completion_tokens } = result.usage;
        call.cost = addCost(call.cost, costOf(call.price, prompt_tokens, completion_tokens));
      }
      if (result.kind === "ok") {
        const { status, usage, served, host } = result;
        const line = {
          attempt: n,
          outcome: "ok",
          status,
          tokensIn: usage.prompt_tokens,
          tokensOut: usage.completion_tokens,
          served,
          host,
        };
        logger.info(line, "llm attempt");
        return result.content;
      }
      logger.warn({ attempt: n, outcome: result.outcome, status: result.status }, "llm attempt");
      if (result.kind === "fail") throw failed(call, result, `failed with ${result.what}`);
      if (n === MAX_ATTEMPTS) {
        throw failed(call, result, `failed after ${n} attempts. The last one got ${result.what}`);
      }
    }
  }

  async function complete<S extends z.ZodObject>(
    request: CompleteRequest<S>,
  ): Promise<Completion<z.output<S>>> {
    const { role, messages, schema, seed } = request;
    const config = settings.roles[role];
    const sampling = samplingOf(config.temperature, seed);
    const price = priceOf(prices, config.model);
    // The effort is on every line because the run record has no field for it yet.
    const logger = deps.logger.child({ role, model: config.model, effort: config.effort });
    const call: Call = { role, config, price, logger, cost: { tokensIn: 0, tokensOut: 0, usd: 0 } };
    const body = {
      model: config.model,
      messages,
      temperature: config.temperature,
      ...(seed === undefined ? {} : { seed }),
      ...(config.effort === undefined ? {} : { reasoning: { effort: config.effort } }),
      response_format: responseFormat(price, schema),
    };

    const answer = await post(call, "answer", body);
    const first = parseAnswer(schema, answer);
    if (first.ok) return { value: first.value, model: config.model, cost: call.cost, sampling };

    // One repair round, written out rather than looped, so it cannot run twice. An empty answer
    // sends no assistant turn: Anthropic's API refuses an empty one before the last message.
    const repairMessages: ChatMessage[] = [
      ...messages,
      ...(answer ? [{ role: "assistant" as const, content: answer }] : []),
      {
        role: "user",
        content: `Your answer did not match the required schema:\n${first.errorText}\nAnswer again with only the corrected JSON object.`,
      },
    ];
    const second = parseAnswer(
      schema,
      await post(call, "repair", { ...body, messages: repairMessages }),
    );
    if (second.ok) return { value: second.value, model: config.model, cost: call.cost, sampling };
    throw new LlmError(
      "llm_invalid_output",
      `The ${role} answer from ${config.model} did not match the schema after one repair round:\n${second.errorText}`,
      call.cost,
      { cause: second.error },
    );
  }

  return { complete };
}

/**
 * What an HTTP answer means for the round. A 429 or a 5xx is retried, and so is an error a 2xx
 * carries in its body, which counts as its own code (502 when it has none).
 */
function classify(status: number, json: unknown, text: string): Attempt {
  if (status < 200 || status >= 300) {
    return failure(status, `http_${status}`, `HTTP ${status}: ${providerText(json, text)}`);
  }
  const inBody = MaybeErrorIn2xx.safeParse(json);
  const choice = inBody.success ? inBody.data.choices?.[0] : undefined;
  const error = inBody.success ? (inBody.data.error ?? choice?.error) : undefined;
  if (inBody.success && (error !== undefined || choice?.finish_reason === "error")) {
    const code = typeof error?.code === "number" && Number.isInteger(error.code) ? error.code : 502;
    const message = error === undefined ? "the answer ended in error" : errorWords(error);
    // A host that failed inside a 2xx may still bill its partial output. The output itself is
    // dropped: it never reaches a repair round.
    const { usage } = inBody.data;
    return {
      ...failure(code, `error_in_body_${code}`, `error ${code} in a 2xx body: ${message}`),
      ...(usage === undefined ? {} : { usage }),
    };
  }
  const parsed = ChatCompletion.safeParse(json);
  if (!parsed.success) {
    const what = `HTTP ${status} that is not a chat completion: ${providerText(json, text)}`;
    return { kind: "fail", code: "llm_bad_response", outcome: "bad_response", what, status };
  }
  const { choices, usage, model: served, provider: host } = parsed.data;
  return { kind: "ok", status, content: choices[0].message.content, usage, served, host };
}

function failure(status: number, outcome: string, what: string): Attempt {
  const kind = status === 429 || status >= 500 ? "retry" : "fail";
  return { kind, code: "llm_request_failed", outcome, what, status };
}

function failed(call: Call, result: Attempt & { kind: "retry" | "fail" }, says: string): LlmError {
  return new LlmError(
    result.code,
    `The ${call.role} call to ${call.config.model} ${says}`,
    call.cost,
    result.cause === undefined ? undefined : { cause: result.cause },
  );
}

function responseFormat(price: ModelPrice, schema: z.ZodObject) {
  if (!price.jsonSchema) return { type: "json_object" };
  return {
    type: "json_schema",
    json_schema: { name: "response", strict: true, schema: strictJsonSchema(schema) },
  };
}

/**
 * `schema` as strict modes take it. They accept `anyOf` only, where zod writes `oneOf` for a
 * discriminated union. The looser `anyOf` is safe because every answer is re-parsed with zod.
 */
function strictJsonSchema(schema: z.ZodObject): unknown {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema, {
    // Called on schema nodes only, so a property that happens to be named `oneOf` stays.
    override: ({ jsonSchema }) => {
      if (jsonSchema.oneOf === undefined) return;
      jsonSchema.anyOf = jsonSchema.oneOf;
      delete jsonSchema.oneOf;
    },
  });
  return rest;
}

function parseAnswer<S extends z.ZodObject>(
  schema: S,
  content: string | null,
): Parsed<z.output<S>> {
  let json: unknown;
  try {
    // A null content is no answer, and fails here like any other text that is not JSON.
    json = JSON.parse(content ?? "");
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { ok: false, errorText: error.message, error };
  }
  const parsed = schema.safeParse(json);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, errorText: z.prettifyError(parsed.error), error: parsed.error };
}

/** The provider's own words: its `error` when the body is JSON that has one, else the text. */
function providerText(json: unknown, text: string): string {
  const parsed = ProviderError.safeParse(json);
  return parsed.success ? errorWords(parsed.data.error) : text.slice(0, PROVIDER_TEXT_LIMIT);
}

/** An error's message, with the host's reason after it when OpenRouter passed one on. */
function errorWords(error: z.infer<typeof ErrorObject>): string {
  const raw = error.metadata?.raw;
  const reason =
    raw === undefined || raw === null ? "" : typeof raw === "string" ? raw : JSON.stringify(raw);
  return (reason === "" ? error.message : `${error.message}: ${reason}`).slice(
    0,
    PROVIDER_TEXT_LIMIT,
  );
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Node's `fetch` says only "fetch failed"; what failed (refused, DNS, TLS) is in its cause. */
function networkReason(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message} (${error.cause.message})` : error.message;
}

function addCost(a: Cost, b: Cost): Cost {
  return {
    tokensIn: a.tokensIn + b.tokensIn,
    tokensOut: a.tokensOut + b.tokensOut,
    usd: a.usd + b.usd,
  };
}
