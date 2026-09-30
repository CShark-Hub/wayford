import { inspect } from "node:util";
import { ActorResponse, LLM_ROLES } from "@wayford/core";
import pino from "pino";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { z } from "zod";
import { type ChatMessage, type Completion, createLlm, type LlmDeps, LlmError } from "./llm.js";
import { type LlmSettings, parseLlmSettings } from "./llm-settings.js";
import { loadModelPrices } from "./models.js";

// Distinctive, so a leak into a log line or an error cannot pass for a coincidence.
const KEY = "sk-test-4b8e1f6c";

const MESSAGES: ChatMessage[] = [
  { role: "system", content: "You are using a web page. Answer with one action as JSON." },
  { role: "user", content: "e1 link Help, e3 link Past orders" },
];

/** The request most tests send: the Actor, with core's `ActorResponse`. */
const ACTOR = { role: "actor", messages: MESSAGES, schema: ActorResponse } as const;

const CLICK = { narration: "Past orders sounds like it.", action: { type: "click", ref: "e3" } };

// Fails `ActorResponse` at `action.ref`.
const NO_REF = JSON.stringify({
  narration: "Past orders sounds like it.",
  action: { type: "click" },
});

/**
 * What the fake provider does with one call: answer, reject as a dropped connection does, or
 * hang until the call's own signal aborts.
 */
type Answer = Response | Error | "hang";

type Call = { url: string; init: RequestInit; body: Record<string, unknown> };

/** An adapter on a fake provider that answers from `answers` in order and records every call. */
function setup(answers: Answer[], options: { settings?: LlmSettings; timeoutMs?: number } = {}) {
  const calls: Call[] = [];
  const lines: Record<string, unknown>[] = [];
  const sleeps: number[] = [];
  const fetch = async (url: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    calls.push({ url: String(url), init, body: JSON.parse(String(init.body)) });
    const answer = answers.shift();
    if (answer === undefined) throw new Error("the fake provider has no answer left");
    if (answer instanceof Error) throw answer;
    if (answer !== "hang") return answer;
    const { signal } = init;
    if (!signal) throw new Error("the attempt carries no signal, so it could hang for good");
    return new Promise((_, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason)),
    );
  };
  const deps: LlmDeps = {
    logger: pino({ level: "info" }, { write: (line) => lines.push(JSON.parse(line)) }),
    fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  };
  const llm = createLlm(options.settings ?? parseLlmSettings({ LLM_API_KEY: KEY }), deps);
  return { llm, calls, lines, sleeps };
}

/** A chat completion carrying `content`, with the extra fields a real one has. */
function completion(
  content: string | null,
  usage = { prompt_tokens: 1000, completion_tokens: 200 },
): Response {
  const body = {
    id: "gen-1",
    model: "openai/gpt-6-luna-20260922",
    provider: "OpenAI",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { ...usage, total_tokens: usage.prompt_tokens + usage.completion_tokens },
  };
  return new Response(JSON.stringify(body), { status: 200 });
}

const click = () => completion(JSON.stringify(CLICK));

/** A 200 whose body breaks off midway, as a dropped connection leaves it. */
function brokenBody(): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"choices":[{"message":'));
      controller.error(new TypeError("terminated"));
    },
  });
  return new Response(stream, { status: 200 });
}

/**
 * A provider's error answer, `{ error: { code, message } }` as OpenRouter sends it: with its code
 * as the HTTP status, or inside a 200 when the host failed after OpenRouter had answered.
 */
function providerError(code: number, message = "provider error", status = code): Response {
  return new Response(JSON.stringify({ error: { message, code } }), { status });
}

/** The price of `tokensIn` and `tokensOut` on the Actor's default model, from models.yaml. */
function lunaUsd(tokensIn: number, tokensOut: number): number {
  const price = loadModelPrices()["openai/gpt-6-luna"];
  if (price === undefined) throw new Error("models.yaml has no price for openai/gpt-6-luna");
  return (tokensIn * price.input + tokensOut * price.output) / 1e6;
}

/** The error a call rejects with, checked to be the adapter's typed one. */
async function failure(call: Promise<unknown>): Promise<LlmError> {
  const error = await call.catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(LlmError);
  return error as LlmError;
}

beforeEach(() => {
  // Every test injects its own fetch. One that forgets fails here instead of calling a model.
  vi.stubGlobal("fetch", () => {
    throw new Error("a test reached the network");
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("sends the caller's messages, the role's model, temperature and effort, and a strict json_schema, and nothing else", async () => {
  const { llm, calls } = setup([click()]);
  await llm.complete(ACTOR);

  // Built another way than the adapter builds it: zod's schema with only the dialect dropped and
  // the union keyword renamed, so any other rewrite shows up as a difference.
  const { $schema: _dialect, ...zodSchema } = z.toJSONSchema(ActorResponse);
  const expected = JSON.parse(JSON.stringify(zodSchema).replaceAll('"oneOf":', '"anyOf":'));
  expect(calls).toHaveLength(1);
  expect(calls[0]?.body).toStrictEqual({
    model: "openai/gpt-6-luna",
    messages: MESSAGES,
    temperature: 1,
    reasoning: { effort: "high" },
    response_format: {
      type: "json_schema",
      json_schema: { name: "response", strict: true, schema: expected },
    },
  });
  expect(calls[0]?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
  expect(calls[0]?.init.method).toBe("POST");
  expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe(`Bearer ${KEY}`);
});

test("every role sends its own model, temperature and effort", async () => {
  const settings: LlmSettings = {
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: KEY,
    roles: {
      extractor: { model: "openai/gpt-6-sol", temperature: 0.2, effort: "low" },
      scout: { model: "anthropic/claude-opus-5.5", temperature: 0.7, effort: "xhigh" },
      actor: { model: "openai/gpt-6-luna", temperature: 1.3, effort: "minimal" },
      analyst: { model: "llama3.1:8b", temperature: 0 },
    },
  };
  const { llm, calls } = setup(
    LLM_ROLES.map(() => completion('{"ok":true}')),
    { settings },
  );
  const Ok = z.object({ ok: z.boolean() });
  const results: Completion<z.output<typeof Ok>>[] = [];
  for (const role of LLM_ROLES) {
    results.push(await llm.complete({ role, messages: MESSAGES, schema: Ok }));
  }

  expect(calls.map(({ body }) => [body.model, body.temperature, body.reasoning])).toStrictEqual([
    ["openai/gpt-6-sol", 0.2, { effort: "low" }],
    ["anthropic/claude-opus-5.5", 0.7, { effort: "xhigh" }],
    ["openai/gpt-6-luna", 1.3, { effort: "minimal" }],
    ["llama3.1:8b", 0, undefined],
  ]);
  expect(results.map(({ model, sampling }) => [model, sampling])).toStrictEqual([
    ["openai/gpt-6-sol", { temperature: 0.2 }],
    ["anthropic/claude-opus-5.5", { temperature: 0.7 }],
    ["openai/gpt-6-luna", { temperature: 1.3 }],
    ["llama3.1:8b", { temperature: 0 }],
  ]);
});

test("sends seed only when the caller passes one, and returns it as Sampling", async () => {
  const { llm, calls } = setup([click(), click()]);
  const unseeded = await llm.complete(ACTOR);
  // 0, so a truthiness check on the seed would drop it.
  const seeded = await llm.complete({ ...ACTOR, seed: 0 });

  expect(calls).toHaveLength(2);
  expect(calls[0]?.body).not.toHaveProperty("seed");
  expect(calls[1]?.body.seed).toBe(0);
  expect(unseeded.sampling).toStrictEqual({ temperature: 1 });
  expect(seeded.sampling).toStrictEqual({ temperature: 1, providerSeed: 0 });
});

test("sends no reasoning field for a role without an effort", async () => {
  const settings = parseLlmSettings({ LLM_API_KEY: KEY, LLM_ACTOR_EFFORT: "default" });
  const { llm, calls, lines } = setup([click()], { settings });
  await llm.complete(ACTOR);

  expect(calls).toHaveLength(1);
  expect(calls[0]?.body).not.toHaveProperty("reasoning");
  expect(lines[0]).not.toHaveProperty("effort");
});

test("sends JSON mode for a model priced with jsonSchema: false", async () => {
  const settings = parseLlmSettings({
    LLM_API_KEY: KEY,
    LLM_BASE_URL: "http://localhost:11434/v1",
    LLM_ACTOR_MODEL: "llama3.1:8b",
    LLM_ACTOR_EFFORT: "default",
  });
  const { llm, calls } = setup([click()], { settings });
  const result = await llm.complete(ACTOR);

  expect(result.value).toStrictEqual(CLICK);
  expect(calls[0]?.url).toBe("http://localhost:11434/v1/chat/completions");
  expect(calls[0]?.body.response_format).toStrictEqual({ type: "json_object" });
  // JSON mode adds nothing to the prompt: the caller's messages state the format.
  expect(calls[0]?.body.messages).toStrictEqual(MESSAGES);
});

test("repairs once with the zod error and bills both rounds", async () => {
  const { llm, calls, lines } = setup([
    completion(NO_REF, { prompt_tokens: 1000, completion_tokens: 200 }),
    completion(JSON.stringify(CLICK), { prompt_tokens: 1300, completion_tokens: 100 }),
  ]);
  const result = await llm.complete(ACTOR);

  expect(result.value).toStrictEqual(CLICK);
  expect(calls).toHaveLength(2);
  const [answer, repair] = calls.map(({ body: { messages, ...rest } }) => ({ messages, rest }));
  expect(repair?.rest).toStrictEqual(answer?.rest);
  expect(repair?.messages).toStrictEqual([
    ...MESSAGES,
    { role: "assistant", content: NO_REF },
    { role: "user", content: expect.stringContaining("action.ref") },
  ]);
  expect(lines.map(({ round }) => round)).toStrictEqual(["answer", "repair"]);
  expect(result.cost).toStrictEqual({
    tokensIn: 2300,
    tokensOut: 300,
    usd: expect.closeTo(lunaUsd(2300, 300), 12),
  });
});

test("a second invalid answer is llm_invalid_output after exactly two requests", async () => {
  const { llm, calls } = setup([completion(NO_REF), completion(NO_REF)]);
  const error = await failure(llm.complete(ACTOR));

  expect(calls).toHaveLength(2);
  expect(error.code).toBe("llm_invalid_output");
  expect(error.message).toContain("action.ref");
  expect(error.cause).toBeInstanceOf(z.ZodError);
  expect(error.cost).toStrictEqual({
    tokensIn: 2000,
    tokensOut: 400,
    usd: expect.closeTo(lunaUsd(2000, 400), 12),
  });
});

// A null content is a reasoning model that spent its whole output budget thinking. It sends no
// assistant turn: Anthropic's API refuses an empty one before the last message.
test.each([
  ["prose", "Sure! I will click e3.", [{ role: "assistant", content: "Sure! I will click e3." }]],
  ["no content", null, []],
])("an answer that is not JSON (%s) goes to the repair round", async (_, content, echoed) => {
  const { llm, calls } = setup([completion(content), click()]);
  const result = await llm.complete(ACTOR);

  expect(result.value).toStrictEqual(CLICK);
  expect(calls).toHaveLength(2);
  expect(calls[1]?.body.messages).toStrictEqual([
    ...MESSAGES,
    ...echoed,
    { role: "user", content: expect.stringMatching(/not valid JSON|Unexpected end of JSON/) },
  ]);
});

test("a failed repair round still carries the answer round's cost", async () => {
  const { llm, calls } = setup([completion(NO_REF), providerError(400, "bad request")]);
  const error = await failure(llm.complete(ACTOR));

  expect(calls).toHaveLength(2);
  expect(error.code).toBe("llm_request_failed");
  expect(error.cost).toStrictEqual({
    tokensIn: 1000,
    tokensOut: 200,
    usd: expect.closeTo(lunaUsd(1000, 200), 12),
  });
});

test("retries 429 and 503 with exponential backoff and logs every attempt", async () => {
  const { llm, calls, lines, sleeps } = setup([providerError(429), providerError(503), click()]);
  const result = await llm.complete(ACTOR);

  expect(result.value).toStrictEqual(CLICK);
  expect(calls).toHaveLength(3);
  // Every retry re-sends the whole request, unchanged.
  expect(calls.map(({ init }) => init.body)).toStrictEqual(Array(3).fill(calls[0]?.init.body));
  expect(sleeps).toStrictEqual([1000, 2000]);
  const attempt = { role: "actor", model: "openai/gpt-6-luna", effort: "high", round: "answer" };
  expect(lines).toMatchObject([
    { level: 40, ...attempt, attempt: 1, outcome: "http_429", status: 429 },
    { level: 40, ...attempt, attempt: 2, outcome: "http_503", status: 503 },
    {
      level: 30,
      ...attempt,
      attempt: 3,
      outcome: "ok",
      status: 200,
      tokensIn: 1000,
      tokensOut: 200,
      // Which snapshot and host answered: calls are not pinned to one host.
      served: "openai/gpt-6-luna-20260922",
      host: "OpenAI",
    },
  ]);
  // The key, and the messages and answer, which say "Past orders".
  const logged = JSON.stringify(lines);
  for (const leak of [KEY, "Past orders"]) {
    expect(logged).not.toContain(leak);
  }
});

test("gives up after three retries", async () => {
  const { llm, calls, sleeps } = setup([
    // 500, the commonest 5xx, pins the boundary: the rule is ">= 500", not "> 500".
    providerError(500),
    new TypeError("fetch failed"),
    providerError(503),
    providerError(503, "no capacity"),
  ]);
  const error = await failure(llm.complete(ACTOR));

  expect(calls).toHaveLength(4);
  expect(sleeps).toStrictEqual([1000, 2000, 4000]);
  expect(error.code).toBe("llm_request_failed");
  expect(error.message).toMatch(/4 attempts.*503: no capacity/);
  expect(error.cost).toStrictEqual({ tokensIn: 0, tokensOut: 0, usd: 0 });
  expect(inspect(error, { depth: null })).not.toContain(KEY);
});

test("does not retry 400", async () => {
  const { llm, calls, lines, sleeps } = setup([
    providerError(400, "Invalid schema: 'minLength' is not permitted"),
  ]);
  const error = await failure(llm.complete(ACTOR));

  expect(calls).toHaveLength(1);
  expect(sleeps).toStrictEqual([]);
  expect(error.code).toBe("llm_request_failed");
  expect(error.message).toContain("400");
  expect(error.message).toContain("Invalid schema: 'minLength' is not permitted");
  // `inspect` renders the message, the stack, the cause and every own property.
  expect(inspect(error, { depth: null })).not.toContain(KEY);
  expect(JSON.stringify(lines)).not.toContain(KEY);
});

test("retries a network error, a body cut off midway included", async () => {
  const { llm, calls, lines, sleeps } = setup([
    new TypeError("fetch failed"),
    brokenBody(),
    click(),
  ]);
  const result = await llm.complete(ACTOR);

  expect(result.value).toStrictEqual(CLICK);
  expect(calls).toHaveLength(3);
  expect(sleeps).toStrictEqual([1000, 2000]);
  expect(lines.map(({ outcome }) => outcome)).toStrictEqual(["network", "network", "ok"]);
});

test("does not retry a timed-out attempt", async () => {
  const { llm, calls, lines, sleeps } = setup(["hang"], { timeoutMs: 20 });
  const error = await failure(llm.complete(ACTOR));

  expect(calls).toHaveLength(1);
  expect(sleeps).toStrictEqual([]);
  expect(error.code).toBe("llm_request_failed");
  expect(error.message).toMatch(/timeout after 0\.02 s/);
  expect(lines.map(({ outcome }) => outcome)).toStrictEqual(["timeout"]);
  expect(inspect(error, { depth: null })).not.toContain(KEY);
});

test("a 2xx that is not a chat completion is llm_bad_response, not retried", async () => {
  const { llm, calls, lines, sleeps } = setup([
    new Response("<html>gateway page</html>", { status: 200 }),
  ]);
  const error = await failure(llm.complete(ACTOR));

  expect(calls).toHaveLength(1);
  expect(sleeps).toStrictEqual([]);
  expect(error.code).toBe("llm_bad_response");
  expect(lines.map(({ outcome }) => outcome)).toStrictEqual(["bad_response"]);
});

// OpenRouter sends 200 once a host accepts the call, so a host that fails later reports in the
// body (openrouter.ai/docs, "Errors and debugging").
test("an error inside a 2xx is read as its code: a 502 is retried, a 400 is not", async () => {
  const retried = setup([providerError(502, "Provider returned error", 200), click()]);
  const result = await retried.llm.complete(ACTOR);
  expect(result.value).toStrictEqual(CLICK);
  expect(retried.lines.map(({ outcome }) => outcome)).toStrictEqual(["error_in_body_502", "ok"]);

  const refused = setup([providerError(400, "Provider returned error", 200)]);
  const error = await failure(refused.llm.complete(ACTOR));
  expect(refused.calls).toHaveLength(1);
  expect(error.code).toBe("llm_request_failed");
});

// OpenRouter's `message` is often just "Provider returned error"; the host's reason is in
// `metadata.raw`, and the error names both.
test.each([
  ["an HTTP error", 400],
  ["an error inside a 2xx", 200],
])("%s carries the host's own reason", async (_, status) => {
  const error = {
    code: 400,
    message: "Provider returned error",
    metadata: { raw: "strict mode rejects minLength" },
  };
  const { llm } = setup([new Response(JSON.stringify({ error }), { status })]);
  const failed = await failure(llm.complete(ACTOR));

  expect(failed.code).toBe("llm_request_failed");
  expect(failed.message).toContain("Provider returned error: strict mode rejects minLength");
});

const PARTIAL = { role: "assistant", content: '{"narration":"Past or' };

// The 402 a $0 balance gets, as OpenRouter sent it on 2026-09-30: `metadata` with no `raw`.
test("an error whose metadata has no raw reads as its message, not as raw JSON", async () => {
  const error = {
    message: "Insufficient credits. This account never purchased credits.",
    code: 402,
    metadata: { limit_source: "openrouter_credits", remedy_hint: "Add credits" },
  };
  const { llm, calls } = setup([new Response(JSON.stringify({ error }), { status: 402 })]);
  const failed = await failure(llm.complete(ACTOR));

  expect(calls).toHaveLength(1);
  expect(failed.message).toContain("failed with HTTP 402: Insufficient credits.");
  expect(failed.message).not.toContain('{"error"');
});

// Neither `code` nor `metadata.raw` is required, so a failed host with neither is still caught.
test("an error inside a 2xx without a code or raw metadata counts as 502 and is retried", async () => {
  const error = { message: "Provider returned error", metadata: { provider_name: "Nvidia" } };
  const failedHost = new Response(
    JSON.stringify({
      error,
      choices: [{ message: PARTIAL, finish_reason: "stop" }],
      usage: { prompt_tokens: 1000, completion_tokens: 50 },
    }),
    { status: 200 },
  );
  const { llm, calls, lines } = setup([failedHost, click()]);
  const result = await llm.complete(ACTOR);

  expect(result.value).toStrictEqual(CLICK);
  expect(lines.map(({ outcome }) => outcome)).toStrictEqual(["error_in_body_502", "ok"]);
  // Two attempts of the answer round, the same body each time: no repair round was built.
  expect(calls.map(({ init }) => init.body)).toStrictEqual(Array(2).fill(calls[0]?.init.body));
});

const disconnected = { message: "Provider disconnected mid-stream" };

test.each([
  ["a choice with its own error", { error: { code: 502, ...disconnected } }, {}],
  ["a choice with finish_reason error only", {}, {}],
  // A string code, as OpenAI-style bodies carry, fails no parse: it counts as 502.
  [
    "a top-level error with a string code",
    { finish_reason: "stop" },
    { error: { code: "server_error", ...disconnected } },
  ],
])(
  "a 2xx reporting a failed host (%s) is retried, and its partial output never reaches a repair round",
  async (_, onChoice, onBody) => {
    const cutOff = new Response(
      JSON.stringify({
        ...onBody,
        choices: [{ message: PARTIAL, finish_reason: "error", ...onChoice }],
        usage: { prompt_tokens: 1000, completion_tokens: 50 },
      }),
      { status: 200 },
    );
    const { llm, calls } = setup([cutOff, click()]);
    const result = await llm.complete(ACTOR);

    expect(result.value).toStrictEqual(CLICK);
    // Two attempts of the answer round, the same body each time: no repair round was built.
    expect(calls.map(({ init }) => init.body)).toStrictEqual(Array(2).fill(calls[0]?.init.body));
    // The cut-off attempt's reported usage is billed with the answer that followed.
    expect(result.cost).toStrictEqual({
      tokensIn: 2000,
      tokensOut: 250,
      usd: expect.closeTo(lunaUsd(2000, 250), 12),
    });
  },
);

test("bills usage at the models.yaml price", async () => {
  const { llm } = setup([
    completion(JSON.stringify(CLICK), { prompt_tokens: 12_345, completion_tokens: 678 }),
  ]);
  const result = await llm.complete(ACTOR);

  expect(result.model).toBe("openai/gpt-6-luna");
  expect(result.cost).toStrictEqual({
    tokensIn: 12_345,
    tokensOut: 678,
    usd: expect.closeTo(lunaUsd(12_345, 678), 12),
  });
});

test("rejects a model id missing from models.yaml at construction", () => {
  const settings = parseLlmSettings({
    LLM_API_KEY: KEY,
    LLM_ANALYST_MODEL: "openai/gpt-7-unpriced",
  });
  expect(() => setup([], { settings })).toThrow(
    expect.objectContaining({
      code: "llm_unknown_model",
      message: expect.stringContaining("openai/gpt-7-unpriced"),
    }),
  );
});
