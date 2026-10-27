import { inspect } from "node:util";
import { ActorResponse, LLM_ROLES } from "@wayford/core";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, onTestFinished, test, vi } from "vitest";
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
function setup(answers: Answer[], options: { settings?: LlmSettings } = {}) {
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
      extractor: { model: "openai/gpt-6-sol", temperature: 0.2, effort: "low", timeoutMs: 300_000 },
      scout: {
        model: "anthropic/claude-opus-5.5",
        temperature: 0.7,
        effort: "xhigh",
        timeoutMs: 60_000,
      },
      actor: { model: "openai/gpt-6-luna", temperature: 1.3, effort: "minimal", timeoutMs: 60_000 },
      analyst: { model: "llama3.1:8b", temperature: 0, timeoutMs: 300_000 },
    },
    actorBackend: "llm",
    jevModel: "typesafe/jev-1.13",
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
  // Every attempt's wall time, so model time can be told apart from a step's settle and act.
  const ms = expect.any(Number);
  expect(lines).toMatchObject([
    { level: 40, ...attempt, attempt: 1, outcome: "http_429", status: 429, ms },
    { level: 40, ...attempt, attempt: 2, outcome: "http_503", status: 503, ms },
    {
      level: 30,
      ...attempt,
      attempt: 3,
      outcome: "ok",
      status: 200,
      ms,
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

// OpenRouter sends 408 when the host timed out, over HTTP or inside a 2xx.
test("retries 408 like 429", async () => {
  const { llm, lines, sleeps } = setup([
    providerError(408),
    providerError(408, "Provider timed out", 200),
    click(),
  ]);
  const result = await llm.complete(ACTOR);

  expect(result.value).toStrictEqual(CLICK);
  expect(sleeps).toStrictEqual([1000, 2000]);
  expect(lines.map(({ outcome }) => outcome)).toStrictEqual([
    "http_408",
    "error_in_body_408",
    "ok",
  ]);
});

/** An error answer with `status`, as OpenRouter sends it, asking for `Retry-After: value`. */
function askingToWait(status: number, value: string): Response {
  const body = JSON.stringify({ error: { message: "Try again later", code: status } });
  return new Response(body, { status, headers: { "retry-after": value } });
}

test.each([
  [429, "7", [7000, 2000]],
  [429, "0.5", [500, 2000]],
  // Capped, so a rate-limited key cannot hold a run asleep for minutes.
  [429, "600", [30_000, 2000]],
  // The date form is not read, so the backoff stands.
  [429, "Wed, 21 Oct 2026 07:28:00 GMT", [1000, 2000]],
  // OpenRouter sends one on a 503 too, when no provider can take the request.
  [503, "7", [7000, 2000]],
])(
  "a %i with Retry-After: %s waits %j before the next two attempts",
  async (status, value, waits) => {
    const { llm, sleeps } = setup([askingToWait(status, value), providerError(503), click()]);
    expect((await llm.complete(ACTOR)).value).toStrictEqual(CLICK);
    expect(sleeps).toStrictEqual(waits);
  },
);

/** Every role timed out after `ms`, so a "hang" ends its attempt at once. */
function timingOut(ms: number): LlmSettings {
  const variables = LLM_ROLES.map((role) => [`LLM_${role.toUpperCase()}_TIMEOUT_MS`, String(ms)]);
  return parseLlmSettings({ LLM_API_KEY: KEY, ...Object.fromEntries(variables) });
}

// A duplicate Actor or Scout call costs about 0.0001 USD, and losing it ends the run `error`.
test.each(["actor", "scout"] as const)(
  "retries a timed-out %s attempt once with the same bytes, and warns that it is not counted",
  async (role) => {
    const { llm, calls, lines, sleeps } = setup(["hang", click()], { settings: timingOut(20) });
    const started = performance.now();
    const result = await llm.complete({ ...ACTOR, role });
    const elapsed = performance.now() - started;

    expect(result.value).toStrictEqual(CLICK);
    expect(calls.map(({ init }) => init.body)).toStrictEqual(Array(2).fill(calls[0]?.init.body));
    expect(sleeps).toStrictEqual([1000]);
    const ms = expect.any(Number);
    expect(lines).toMatchObject([
      { level: 40, role, attempt: 1, outcome: "timeout", ms },
      // Said on its own line, so the run's cost is read as reported usage, short of the bill.
      { level: 40, role, timedOut: 1, msg: "llm timed-out attempt billed but not counted" },
      { level: 30, role, attempt: 2, outcome: "ok", ms, tokensIn: 1000, tokensOut: 200 },
    ]);
    // `ms` is the attempt's wall time: the one that timed out waited out its 20 ms, give or take
    // the millisecond a timer can fire early, and no longer than the whole call took.
    expect(lines[0]?.ms).toBeGreaterThanOrEqual(15);
    expect(lines[0]?.ms).toBeLessThanOrEqual(Math.ceil(elapsed));
    // The provider still billed the request it was not waited for, but reported no usage for it,
    // so the cost holds the answer's usage alone.
    expect(result.cost).toStrictEqual({
      tokensIn: 1000,
      tokensOut: 200,
      usd: expect.closeTo(lunaUsd(1000, 200), 12),
    });
  },
);

test.each([
  ["two timeouts in a row", ["hang", "hang"] as Answer[]],
  ["a timeout after a retried 503", ["hang", providerError(503), "hang"] as Answer[]],
])("a second timeout in a round is not retried (%s)", async (_, answers) => {
  const attempts = answers.length;
  const { llm, calls, lines } = setup(answers, { settings: timingOut(20) });
  const error = await failure(llm.complete(ACTOR));

  expect(calls).toHaveLength(attempts);
  expect(error.code).toBe("llm_request_failed");
  expect(error.message).toContain(
    `failed after ${attempts} attempts. The last one got a timeout after 0.02 s, which the provider may still bill`,
  );
  expect(lines.at(-1)).toMatchObject({ attempt: attempts, outcome: "timeout" });
  // The first timeout was retried and billed, so its line is there though no attempt answered.
  const billed = lines.filter(({ msg }) => msg === "llm timed-out attempt billed but not counted");
  expect(billed).toHaveLength(1);
  // No attempt answered, so nothing gives the usage of the ones that timed out.
  expect(error.cost).toStrictEqual({ tokensIn: 0, tokensOut: 0, usd: 0 });
  expect(inspect(error, { depth: null })).not.toContain(KEY);
});

test("the repair round has a timeout retry of its own", async () => {
  const { llm, calls, lines } = setup(
    [
      "hang",
      completion(NO_REF, { prompt_tokens: 1000, completion_tokens: 200 }),
      "hang",
      completion(JSON.stringify(CLICK), { prompt_tokens: 1300, completion_tokens: 100 }),
    ],
    { settings: timingOut(20) },
  );
  const result = await llm.complete(ACTOR);

  expect(result.value).toStrictEqual(CLICK);
  expect(calls).toHaveLength(4);
  expect(lines.filter(({ msg }) => msg === "llm attempt")).toMatchObject([
    { round: "answer", outcome: "timeout" },
    { round: "answer", outcome: "ok" },
    { round: "repair", outcome: "timeout" },
    { round: "repair", outcome: "ok" },
  ]);
  // Both rounds' reported usage, and none for the two attempts that timed out.
  expect(result.cost).toStrictEqual({
    tokensIn: 2300,
    tokensOut: 300,
    usd: expect.closeTo(lunaUsd(2300, 300), 12),
  });
});

// Both read a large prompt, the Analyst at `max` effort, so a duplicate is expensive. Each is
// bounded by its own variable.
test.each([
  ["extractor", "LLM_EXTRACTOR_TIMEOUT_MS", "30", "0.03 s"],
  ["analyst", "LLM_ANALYST_TIMEOUT_MS", "40", "0.04 s"],
] as const)("does not retry a timed-out %s attempt", async (role, variable, ms, bound) => {
  const settings = parseLlmSettings({ LLM_API_KEY: KEY, [variable]: ms });
  const { llm, calls, lines, sleeps } = setup(["hang"], { settings });
  const Ok = z.object({ ok: z.boolean() });
  const error = await failure(llm.complete({ role, messages: MESSAGES, schema: Ok }));

  expect(calls).toHaveLength(1);
  expect(sleeps).toStrictEqual([]);
  expect(error.code).toBe("llm_request_failed");
  expect(error.message).toBe(
    `The ${role} call to openai/gpt-6-luna failed with a timeout after ${bound}, which the provider may still bill`,
  );
  expect(lines.map(({ outcome }) => outcome)).toStrictEqual(["timeout"]);
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

describe("decide", () => {
  const OPTIONS = {
    e1: 'Click the link "Home"',
    e3: 'Click the link "Past orders"',
    back: "Go back to the previous page",
  };
  const STATE = "Goal: you want to see what you ordered three months ago\nPage: Deliveries";
  const QUESTION = { instructions: "Which one action do you take next?", options: OPTIONS };
  const DECIDE = { role: "actor", state: STATE, question: QUESTION } as const;

  const PICK = { choice: "e3", confidence: 0.75, probabilities: { e1: 0.1, e3: 0.84, back: 0.06 } };
  // The usage of the System One example in OpenRouter's docs: 476 tokens at 0.042 USD per million.
  const USAGE = { input_tokens: 476, output_tokens: 70, cost: 0.000019992 };

  /** A System One answer to the one question `decide` asks, with the extra fields a real one has. */
  function answer(fields: Record<string, unknown>): Response {
    const body = {
      id: "gen-dec-1789738314-X5e5eKGQdvR9rblyX250",
      model: "typesafe/jev-1.13-20260917",
      provider: "TypeSafe",
      answers: { question: { type: "choice", ...fields } },
      usage: USAGE,
    };
    return new Response(JSON.stringify(body), { status: 200 });
  }

  const picked = () => answer(PICK);

  /** What `tokensIn` costs on Jev, from models.yaml. Its output tokens are free. */
  function jevUsd(tokensIn: number): number {
    const price = loadModelPrices()["typesafe/jev-1.13"];
    if (price === undefined) throw new Error("models.yaml has no price for typesafe/jev-1.13");
    expect(price.output).toBe(0);
    return (tokensIn * price.input) / 1e6;
  }

  test("sends the state, the one question and the pinned model to System One, and nothing else", async () => {
    // The Actor's chat model moved, so a body naming it would show here.
    const settings = parseLlmSettings({ LLM_API_KEY: KEY, LLM_ACTOR_MODEL: "openai/gpt-6-sol" });
    const { llm, calls } = setup([picked()], { settings });
    await llm.decide(DECIDE);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://openrouter.ai/api/v1/systemone");
    expect(calls[0]?.init.method).toBe("POST");
    expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe(`Bearer ${KEY}`);
    expect(calls[0]?.body).toStrictEqual({
      model: "typesafe/jev-1.13",
      state: STATE,
      questions: {
        question: { type: "choice", instructions: QUESTION.instructions, criteria: OPTIONS },
      },
    });
  });

  test("returns a probability per offered key, the confidence, Jev's pick, the model and the cost", async () => {
    const { llm } = setup([picked()]);
    const decision = await llm.decide(DECIDE);

    expect(decision).toStrictEqual({
      probabilities: { e1: 0.1, e3: 0.84, back: 0.06 },
      confidence: 0.75,
      choice: "e3",
      model: "typesafe/jev-1.13",
      // Priced from models.yaml, output tokens at zero.
      cost: { tokensIn: 476, tokensOut: 70, usd: expect.closeTo(jevUsd(476), 12) },
    });
    // OpenRouter's own figure for the same usage agrees with the table.
    expect(decision.cost.usd).toBeCloseTo(USAGE.cost, 12);
  });

  // Jev rounds each value to two decimals, so a tail of small ones rounds to zero and the sum
  // can fall well short of 1. The answer is still one to draw from, and comes back as sent.
  test("accepts probabilities whose sum rounding left short of 1", async () => {
    const rounded = { e1: 0.85, e3: 0.05, back: 0 };
    const { llm } = setup([answer({ ...PICK, choice: "e1", probabilities: rounded })]);
    expect((await llm.decide(DECIDE)).probabilities).toStrictEqual(rounded);
  });

  test.each([
    [
      "names a key not offered",
      { ...PICK, probabilities: { e1: 0.1, e3: 0.8, back: 0.05, e9: 0.05 } },
      "e9",
    ],
    ["misses an offered key", { ...PICK, probabilities: { e1: 0.16, e3: 0.84 } }, "back"],
    ["picks a key not offered", { ...PICK, choice: "e9" }, "choice"],
    ["has no confidence", { choice: "e3", probabilities: PICK.probabilities }, "confidence"],
    [
      "puts zero on every option, leaving nothing to draw",
      { ...PICK, probabilities: { e1: 0, e3: 0, back: 0 } },
      "above zero",
    ],
  ])(
    "an answer that %s is llm_invalid_output, billed and not retried",
    async (_, fields, named) => {
      const { llm, calls, sleeps } = setup([answer(fields)]);
      const error = await failure(llm.decide(DECIDE));

      expect(calls).toHaveLength(1);
      expect(sleeps).toStrictEqual([]);
      expect(error.code).toBe("llm_invalid_output");
      expect(error.message).toContain(named);
      expect(error.cause).toBeInstanceOf(z.ZodError);
      expect(error.cost).toStrictEqual({
        tokensIn: 476,
        tokensOut: 70,
        usd: expect.closeTo(jevUsd(476), 12),
      });
    },
  );

  test("retries 429 and 503 with the same body, logging every attempt, but not 400", async () => {
    const retried = setup([providerError(429), providerError(503), picked()]);
    const decision = await retried.llm.decide(DECIDE);

    expect(decision.choice).toBe("e3");
    expect(retried.calls.map(({ init }) => init.body)).toStrictEqual(
      Array(3).fill(retried.calls[0]?.init.body),
    );
    expect(retried.sleeps).toStrictEqual([1000, 2000]);
    const attempt = { role: "actor", model: "typesafe/jev-1.13", round: "decide" };
    const ms = expect.any(Number);
    expect(retried.lines).toMatchObject([
      { level: 40, ...attempt, attempt: 1, outcome: "http_429", status: 429, ms },
      { level: 40, ...attempt, attempt: 2, outcome: "http_503", status: 503, ms },
      {
        level: 30,
        ...attempt,
        attempt: 3,
        outcome: "ok",
        status: 200,
        ms,
        tokensIn: 476,
        tokensOut: 70,
        served: "typesafe/jev-1.13-20260917",
        host: "TypeSafe",
        reportedUsd: USAGE.cost,
      },
    ]);
    // The key, the state and the options never reach a log line.
    const logged = JSON.stringify(retried.lines);
    for (const leak of [KEY, "three months ago", "Past orders"]) {
      expect(logged).not.toContain(leak);
    }

    const refused = setup([providerError(400, "criteria must hold at least two options")]);
    const error = await failure(refused.llm.decide(DECIDE));
    expect(refused.calls).toHaveLength(1);
    expect(refused.sleeps).toStrictEqual([]);
    expect(error.code).toBe("llm_request_failed");
    expect(error.message).toContain(
      "The actor call to typesafe/jev-1.13 failed with HTTP 400: criteria must hold at least two options",
    );
  });

  test("an error inside a 2xx counts as its code: 502 without one is retried, a 400 is not", async () => {
    const failedHost = new Response(
      JSON.stringify({ error: { message: "Provider returned error" } }),
      { status: 200 },
    );
    const retried = setup([failedHost, picked()]);
    expect((await retried.llm.decide(DECIDE)).choice).toBe("e3");
    expect(retried.lines.map(({ outcome }) => outcome)).toStrictEqual(["error_in_body_502", "ok"]);

    const refused = setup([providerError(400, "Provider returned error", 200)]);
    const error = await failure(refused.llm.decide(DECIDE));
    expect(refused.calls).toHaveLength(1);
    expect(error.code).toBe("llm_request_failed");
    expect(refused.lines.map(({ outcome }) => outcome)).toStrictEqual(["error_in_body_400"]);
  });

  // Jev answers in under a second (ADR 0001), so 30 s is a hang whatever the Actor's chat timeout
  // is, and a hang is not retried (`docs/adr/0005-llm-timeout-retry.md`, D4).
  test("a timed-out attempt fails at 30 s, not at the Actor's timeout, and is not retried", async () => {
    // A thousandth of every bound, so Jev's 30 s passes in 30 ms.
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    const spy = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => timeout(ms / 1000));
    onTestFinished(() => spy.mockRestore());
    const { llm, calls, lines, sleeps } = setup(["hang", picked()], { settings: timingOut(20) });
    const error = await failure(llm.decide(DECIDE));

    expect(calls).toHaveLength(1);
    expect(sleeps).toStrictEqual([]);
    expect(error.message).toBe(
      "The actor call to typesafe/jev-1.13 failed with a timeout after 30 s, which the provider may still bill",
    );
    expect(lines.map(({ outcome }) => outcome)).toStrictEqual(["timeout"]);
  });

  test("a 2xx that is not a System One answer is llm_bad_response, not retried", async () => {
    const { llm, calls } = setup([completion('{"ok":true}')]);
    const error = await failure(llm.decide(DECIDE));

    expect(calls).toHaveLength(1);
    expect(error.code).toBe("llm_bad_response");
    expect(error.message).toContain("not a System One answer");
  });

  test("rejects a Jev model missing from models.yaml at construction", () => {
    const settings = parseLlmSettings({ LLM_API_KEY: KEY, LLM_JEV_MODEL: "typesafe/jev-9.99" });
    expect(() => setup([], { settings })).toThrow(
      expect.objectContaining({
        code: "llm_unknown_model",
        message: expect.stringContaining("typesafe/jev-9.99"),
      }),
    );
  });
});
