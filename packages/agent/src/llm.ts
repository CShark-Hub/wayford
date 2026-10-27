/**
 * The one way a package asks a model for something: `complete` sends the caller's messages to the
 * role's model on an OpenAI-compatible `/chat/completions` endpoint and returns a zod-parsed
 * object, what it cost and the sampling it was sent (`docs/PLAN.md`, "AI access"). `decide` asks
 * Jev one Choice question and returns a probability per option (`docs/adr/0001-jev-actor-backend.md`).
 *
 * Plain `fetch` and no SDK, so the body holds the caller's messages and the role's settings and
 * nothing else reaches the model. Every setting comes from config, so there is no provider branch
 * here either.
 *
 * `decide` speaks OpenRouter's System One API, as found on 2026-10-01 in the Jev guide
 * (https://openrouter.ai/docs/guides/community/jev) and the two pages it links: the TypeSafe SDK
 * page, which documents the System One API
 * (https://openrouter.ai/docs/guides/community/typesafe-sdk), and the Decisions API reference,
 * which documents the same body
 * (https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-questions-and-answers-request):
 *
 *   POST {baseUrl}/systemone
 *   { "model": "typesafe/jev-1.13", "state": "<text>",
 *     "questions": { "question": { "type": "choice", "instructions": "<text>",
 *                                  "criteria": { "<key>": "<description>", … } } } }
 *
 *   → { "id": "gen-dec-…", "model": "typesafe/jev-1.13-20260917", "provider": "TypeSafe",
 *       "answers": { "question": { "type": "choice", "choice": "<key>", "confidence": 0.75,
 *                                  "probabilities": { "<key>": 0.84, … } } },
 *       "usage": { "input_tokens": 476, "output_tokens": 70, "cost": 0.000019992 } }
 *
 * A Choice question takes up to 255 options. The docs say its probabilities sum to 1
 * (https://docs.typesafe.ai/primitives/choice), but Jev rounds each one to two decimals, so the
 * sum can fall short (see `Decision`).
 */
import {
  type Cost,
  LLM_ROLES,
  type LlmRole,
  Probability,
  Sampling,
  WayfordError,
} from "@wayford/core";
import type { Logger } from "pino";
import { z } from "zod";
import type { LlmSettings } from "./llm-settings.js";
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

/** One Jev Choice question. */
export type ChoiceQuestion = {
  instructions: string;
  /** Option key → what the option means, sent as Jev's `criteria`. Jev answers with these keys. */
  options: Readonly<Record<string, string>>;
};

export type DecideRequest = { role: LlmRole; state: string; question: ChoiceQuestion };

/**
 * Jev's answer, reported and never acted on: `decide` never samples. The Actor draws from
 * `probabilities` with the run seed (s2-06).
 */
export type Decision = {
  /**
   * One per offered key, each in [0, 1], as Jev sent them: rounded, so their sum can miss 1, and
   * a draw goes over the sum it gets. The key order is Jev's: iterate the offered options for any
   * order that matters.
   */
  probabilities: Record<string, number>;
  /** How concentrated the probabilities are, in [0, 1]. Stored, never acted on (ADR 0001). */
  confidence: number;
  /** Jev's own pick, one of the offered keys. */
  choice: string;
  /** The configured id, the one priced. The answer may name a snapshot of it. */
  model: string;
  cost: Cost;
};

export type Llm = {
  complete<S extends z.ZodObject>(request: CompleteRequest<S>): Promise<Completion<z.output<S>>>;
  decide(request: DecideRequest): Promise<Decision>;
};

export type LlmDeps = {
  /** Fixed for the instance, so a caller builds one `Llm` per run, with the run's child logger. */
  logger: Logger;
  fetch?: typeof fetch;
  /** Tests record the backoff instead of waiting it out. */
  sleep?: (ms: number) => Promise<void>;
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

// `complete` is bounded by its role's `timeoutMs` (`llm-settings.ts`). Jev answers in 70 to 500 ms
// (ADR 0001), so 30 s is a hang rather than a slow answer: its timeout is not retried, and
// `LLM_ACTOR_TIMEOUT_MS`, sized for a chat model, does not apply.
const DECIDE_TIMEOUT_MS = 30_000;

/**
 * The roles whose timed-out chat attempt is retried, once a round. A request that does not stream
 * is generated and billed whether or not anyone waits for it, so the retry pays twice. A duplicate
 * Actor or Scout call costs about 0.0001 USD (calibration: 0.0019 USD a run), and losing it ends
 * the run `error`. The Extractor and the Analyst read large prompts, the Analyst at `max` effort,
 * so a duplicate is expensive there and their timeout fails the call
 * (`docs/adr/0005-llm-timeout-retry.md`).
 */
const RETRIES_A_TIMEOUT: ReadonlySet<LlmRole> = new Set(["actor", "scout"]);

// The first attempt plus the "at most 3" retries of `docs/STACK.md`.
const MAX_ATTEMPTS = 4;
const FIRST_BACKOFF_MS = 1000;
// The longest wait a `Retry-After` gets, so a rate-limited key or a provider without capacity
// cannot hold a run asleep for minutes. A longer ask waits this long, and the next attempt finds
// out whether that was enough.
const MAX_RETRY_AFTER_MS = 30_000;

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

// The fields `decide` reads. `answers` is checked against the question in `decide`, since only
// the question knows which keys were offered.
const SystemOneAnswer = z.object({
  answers: z.record(z.string(), z.unknown()),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    // OpenRouter's own figure, logged only: models.yaml prices every call.
    cost: z.number().optional(),
  }),
  model: z.string().optional(),
  provider: z.string().optional(),
});

/** The name of the one question `decide` asks per call, and of its answer. */
const QUESTION_KEY = "question";

/**
 * Jev's answer to a question offering `options`, as `decide` and its fake check it: a pick among
 * the offered keys, and a probability for exactly those keys, not all zero, so the Actor has
 * something to draw from (s2-06).
 */
export function choiceAnswer(options: ChoiceQuestion["options"]) {
  // With no options, no key parses, so every answer fails.
  const Key = z.enum(Object.keys(options) as [string, ...string[]]);
  return z.object({
    choice: Key,
    confidence: Probability,
    // Keyed by an enum, a zod 4 record is exhaustive: a missing key and an unknown one both fail.
    // The sum is not held to 1: Jev rounds each value to two decimals, so a long tail of small
    // ones rounds to zero and can take a tenth with it.
    probabilities: z
      .record(Key, Probability)
      .refine(
        (p) => Object.values(p).some((v) => v > 0),
        "at least one probability must be above zero",
      ),
  });
}

/** What every attempt of one call shares. `cost` is its running total. */
type Call = {
  role: LlmRole;
  model: string;
  price: ModelPrice;
  logger: Logger;
  cost: Cost;
  /** The bound on one attempt. */
  timeoutMs: number;
  /** Whether a round retries one timed-out attempt (`RETRIES_A_TIMEOUT`). */
  retriesTimeout: boolean;
};

/** Token counts as each endpoint's usage maps onto them, before they are priced. */
type Tokens = { tokensIn: number; tokensOut: number };

/**
 * One attempt, classified. Only a 2xx reports usage: the answer, or a host that failed inside
 * one. `what` names the failure for the error message.
 */
type Attempt<T> =
  | {
      kind: "ok";
      status: number;
      value: T;
      tokens: Tokens;
      served?: string | undefined;
      host?: string | undefined;
      reportedUsd?: number | undefined;
    }
  | Failure;

/** A `timeout` is retried or not by the call (`Call.retriesTimeout`), the other kinds as named. */
type Failure = {
  kind: "retry" | "fail" | "timeout";
  code: "llm_request_failed" | "llm_bad_response";
  outcome: string;
  what: string;
  status?: number;
  tokens?: Tokens;
  /** What the answer's `Retry-After` asked to wait before the next attempt, capped. */
  retryAfterMs?: number;
  cause?: unknown;
};

/** Where one kind of call goes, and how its answers are read. */
type Endpoint<T> = {
  url: string;
  /** Reads a 2xx. `attempt` fails or retries every other status before it gets here. */
  classify: (status: number, json: unknown, text: string) => Attempt<T>;
};

type Parsed<T> =
  | { ok: true; value: T }
  | { ok: false; errorText: string; error: SyntaxError | z.ZodError };

export function createLlm(settings: LlmSettings, deps: LlmDeps): Llm {
  const prices = loadModelPrices();
  // Every role up front, so an unknown model fails at boot and not on the first Analyst call.
  for (const role of LLM_ROLES) priceOf(prices, settings.roles[role].model);
  // And Jev's, whatever the backend, for the same reason.
  priceOf(prices, settings.jevModel);

  const baseUrl = settings.baseUrl.replace(/\/+$/, "");
  const chat: Endpoint<string | null> = {
    url: `${baseUrl}/chat/completions`,
    classify: classifyChat,
  };
  const systemOne: Endpoint<unknown> = { url: `${baseUrl}/systemone`, classify: classifyDecision };
  const headers = {
    authorization: `Bearer ${settings.apiKey}`,
    "content-type": "application/json",
  };
  const send = deps.fetch ?? fetch;
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function attempt<T>(
    endpoint: Endpoint<T>,
    payload: string,
    timeoutMs: number,
  ): Promise<Attempt<T>> {
    const signal = AbortSignal.timeout(timeoutMs);
    let response: Response;
    let text: string;
    try {
      response = await send(endpoint.url, { method: "POST", headers, body: payload, signal });
      // Whole, before anything uses it: a body cut off midway rejects here and is retried as a
      // network error, never parsed as half an answer.
      text = await response.text();
    } catch (error) {
      // An aborted request that does not stream is still generated and billed, so a retry pays
      // for the same tokens twice, with no usage to record for the first. Whether to pay is the
      // call's to decide (`RETRIES_A_TIMEOUT`).
      if (signal.aborted) {
        const what = `a timeout after ${timeoutMs / 1000} s, which the provider may still bill`;
        return {
          kind: "timeout",
          code: "llm_request_failed",
          outcome: "timeout",
          what,
          cause: error,
        };
      }
      const what = `a network error: ${networkReason(error)}`;
      return { kind: "retry", code: "llm_request_failed", outcome: "network", what, cause: error };
    }
    const json = parseJson(text);
    if (!response.ok) return httpFailure(response, json, text);
    return endpoint.classify(response.status, json, text);
  }

  /** A new call on `model`, at zero cost. `bindings` join the role and model on its log lines. */
  function newCall(
    role: LlmRole,
    model: string,
    bounds: Pick<Call, "timeoutMs" | "retriesTimeout">,
    bindings: object = {},
  ): Call {
    const logger = deps.logger.child({ role, model, ...bindings });
    const cost = { tokensIn: 0, tokensOut: 0, usd: 0 };
    return { role, model, price: priceOf(prices, model), logger, cost, ...bounds };
  }

  /** One round: the same bytes until an answer, or until retrying cannot help. */
  async function post<T>(
    call: Call,
    round: "answer" | "repair" | "decide",
    endpoint: Endpoint<T>,
    body: object,
  ): Promise<T> {
    // Never a message, the state, the options, the content, the key or a header.
    const logger = call.logger.child({ round });
    // Serialised once, so every attempt sends the same complete request, whatever the caller
    // does with its message array or its options meanwhile.
    const payload = JSON.stringify(body);
    let timedOut = false;
    for (let n = 1; ; n++) {
      const started = performance.now();
      const result = await attempt(endpoint, payload, call.timeoutMs);
      // Logged only, so model time can be told apart from a step's settle and act.
      const ms = Math.round(performance.now() - started);
      if (result.tokens !== undefined) {
        const { tokensIn, tokensOut } = result.tokens;
        call.cost = addCost(call.cost, costOf(call.price, tokensIn, tokensOut));
      }
      if (result.kind === "ok") {
        const { status, tokens, served, host, reportedUsd } = result;
        const line = {
          attempt: n,
          outcome: "ok",
          status,
          ms,
          ...tokens,
          served,
          host,
          reportedUsd,
        };
        logger.info(line, "llm attempt");
        return result.value;
      }
      logger.warn(
        { attempt: n, outcome: result.outcome, status: result.status, ms },
        "llm attempt",
      );
      const retry =
        result.kind === "retry" || (result.kind === "timeout" && call.retriesTimeout && !timedOut);
      if (!retry || n === MAX_ATTEMPTS) {
        const says =
          n === 1
            ? `failed with ${result.what}`
            : `failed after ${n} attempts. The last one got ${result.what}`;
        throw failed(call, result, says);
      }
      if (result.kind === "timeout") {
        timedOut = true;
        // Billed with no usage to show for it, so the call's cost, which holds reported usage
        // only, leaves it out, whether or not a later attempt answers. Its own line says so.
        logger.warn({ timedOut: 1 }, "llm timed-out attempt billed but not counted");
      }
      await sleep(result.retryAfterMs ?? FIRST_BACKOFF_MS * 2 ** (n - 1));
    }
  }

  async function complete<S extends z.ZodObject>(
    request: CompleteRequest<S>,
  ): Promise<Completion<z.output<S>>> {
    const { role, messages, schema, seed } = request;
    const config = settings.roles[role];
    const sampling = samplingOf(config.temperature, seed);
    const bounds = { timeoutMs: config.timeoutMs, retriesTimeout: RETRIES_A_TIMEOUT.has(role) };
    // The effort is on every line because the run record has no field for it yet.
    const call = newCall(role, config.model, bounds, { effort: config.effort });
    const body = {
      model: config.model,
      messages,
      temperature: config.temperature,
      ...(seed === undefined ? {} : { seed }),
      ...(config.effort === undefined ? {} : { reasoning: { effort: config.effort } }),
      response_format: responseFormat(call.price, schema),
    };

    const answer = await post(call, "answer", chat, body);
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
      await post(call, "repair", chat, { ...body, messages: repairMessages }),
    );
    if (second.ok) return { value: second.value, model: config.model, cost: call.cost, sampling };
    throw new LlmError(
      "llm_invalid_output",
      `The ${role} answer from ${config.model} did not match the schema after one repair round:\n${second.errorText}`,
      call.cost,
      { cause: second.error },
    );
  }

  async function decide(request: DecideRequest): Promise<Decision> {
    const { role, state, question } = request;
    const model = settings.jevModel;
    // Built before the call, from the keys offered then, whatever the caller does meanwhile.
    const answerSchema = choiceAnswer(question.options);
    const call = newCall(role, model, { timeoutMs: DECIDE_TIMEOUT_MS, retriesTimeout: false });
    const body = {
      model,
      state,
      questions: {
        [QUESTION_KEY]: {
          type: "choice",
          instructions: question.instructions,
          criteria: question.options,
        },
      },
    };

    const parsed = answerSchema.safeParse(await post(call, "decide", systemOne, body));
    if (parsed.success) return { ...parsed.data, model, cost: call.cost };
    // No repair round and no retry: Jev writes no text to repair, and asking again bills the
    // same question twice.
    throw new LlmError(
      "llm_invalid_output",
      `The ${role} decision from ${model} did not answer the question asked:\n${z.prettifyError(parsed.error)}`,
      call.cost,
      { cause: parsed.error },
    );
  }

  return { complete, decide };
}

/**
 * What a 2xx chat answer means for the round. An error it carries in its body counts as its own
 * code (502 when it has none), so a 429 or a 5xx there is retried like an HTTP one.
 */
function classifyChat(status: number, json: unknown, text: string): Attempt<string | null> {
  const inBody = MaybeErrorIn2xx.safeParse(json);
  const choice = inBody.success ? inBody.data.choices?.[0] : undefined;
  const error = inBody.success ? (inBody.data.error ?? choice?.error) : undefined;
  if (inBody.success && (error !== undefined || choice?.finish_reason === "error")) {
    // A host that failed inside a 2xx may still bill its partial output. The output itself is
    // dropped: it never reaches a repair round.
    const { usage } = inBody.data;
    return {
      ...errorInBody(error),
      ...(usage === undefined ? {} : { tokens: tokensOf(usage) }),
    };
  }
  const parsed = ChatCompletion.safeParse(json);
  if (!parsed.success) {
    const what = `HTTP ${status} that is not a chat completion: ${providerText(json, text)}`;
    return { kind: "fail", code: "llm_bad_response", outcome: "bad_response", what, status };
  }
  const { choices, usage, model: served, provider: host } = parsed.data;
  const value = choices[0].message.content;
  return { kind: "ok", status, value, tokens: tokensOf(usage), served, host };
}

/** As `classifyChat`, for a System One answer. Its `answers` entry is checked by `decide`. */
function classifyDecision(status: number, json: unknown, text: string): Attempt<unknown> {
  const inBody = ProviderError.safeParse(json);
  if (inBody.success) return errorInBody(inBody.data.error);
  const parsed = SystemOneAnswer.safeParse(json);
  if (!parsed.success) {
    const what = `HTTP ${status} that is not a System One answer: ${providerText(json, text)}`;
    return { kind: "fail", code: "llm_bad_response", outcome: "bad_response", what, status };
  }
  const { answers, usage, model: served, provider: host } = parsed.data;
  return {
    kind: "ok",
    status,
    value: answers[QUESTION_KEY],
    tokens: { tokensIn: usage.input_tokens, tokensOut: usage.output_tokens },
    served,
    host,
    reportedUsd: usage.cost,
  };
}

/**
 * A status outside 2xx, whatever the endpoint: a 408, a 429 or a 5xx is retried, anything else
 * fails. A retry waits what the answer's `Retry-After` asks: OpenRouter sends one on a 429 or a
 * 503 and asks `fetch` clients to honour it (openrouter.ai/docs, "Errors and debugging").
 */
function httpFailure(response: Response, json: unknown, text: string): Failure {
  const { status } = response;
  const result = failure(status, `http_${status}`, `HTTP ${status}: ${providerText(json, text)}`);
  const wait = retryAfterMs(response.headers);
  return wait === undefined ? result : { ...result, retryAfterMs: wait };
}

/**
 * A `Retry-After` in its delay-seconds form, in ms, up to `MAX_RETRY_AFTER_MS`. The HTTP-date
 * form, or none, leaves the backoff as it is.
 */
function retryAfterMs(headers: Headers): number | undefined {
  const value = headers.get("retry-after")?.trim();
  if (value === undefined || !/^\d+$/.test(value)) return undefined;
  return Math.min(Number(value) * 1000, MAX_RETRY_AFTER_MS);
}

/** An error a 2xx carries, as its own code, or 502 when it has none. */
function errorInBody(error: z.infer<typeof ErrorObject> | undefined): Failure {
  const code = typeof error?.code === "number" && Number.isInteger(error.code) ? error.code : 502;
  const message = error === undefined ? "the answer ended in error" : errorWords(error);
  return failure(code, `error_in_body_${code}`, `error ${code} in a 2xx body: ${message}`);
}

// 408 is OpenRouter's answer when the host timed out (openrouter.ai/docs, "Errors and debugging").
function failure(status: number, outcome: string, what: string): Failure {
  const kind = status === 408 || status === 429 || status >= 500 ? "retry" : "fail";
  return { kind, code: "llm_request_failed", outcome, what, status };
}

function failed(call: Call, result: Failure, says: string): LlmError {
  return new LlmError(
    result.code,
    `The ${call.role} call to ${call.model} ${says}`,
    call.cost,
    result.cause === undefined ? undefined : { cause: result.cause },
  );
}

function tokensOf(usage: Usage): Tokens {
  return { tokensIn: usage.prompt_tokens, tokensOut: usage.completion_tokens };
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
