import { describe, expect, test } from "vitest";
import { z } from "zod";
import { fakeLlm } from "./fake-llm.js";
import { type ChatMessage, type CompleteRequest, LlmError } from "./llm.js";

const MESSAGES: ChatMessage[] = [{ role: "user", content: "What is the capital of France?" }];

const Capital = z.object({ capital: z.string() });

const ZERO = { tokensIn: 0, tokensOut: 0, usd: 0 };

test("answers each role from its own queue, in order, from model fake at zero cost", async () => {
  const extractor = [{ capital: "Paris" }, { capital: "Rome" }];
  const llm = fakeLlm({ extractor, analyst: [{ capital: "Oslo" }] });
  const ask = (role: "extractor" | "analyst") =>
    llm.complete({ role, messages: MESSAGES, schema: Capital });

  const completions = [await ask("extractor"), await ask("analyst"), await ask("extractor")];
  expect(completions.map(({ value }) => value.capital)).toStrictEqual(["Paris", "Oslo", "Rome"]);
  expect(completions[0]).toStrictEqual({
    value: { capital: "Paris" },
    model: "fake",
    cost: ZERO,
    sampling: { temperature: 1 },
  });
  // The fake answered from its own copy: the test's array is still whole.
  expect(extractor).toStrictEqual([{ capital: "Paris" }, { capital: "Rome" }]);
});

test("records every request as it was sent, seed included", async () => {
  const llm = fakeLlm({ actor: [{ capital: "Paris" }, { capital: "Rome" }] });
  const history: ChatMessage[] = [{ role: "user", content: "first" }];
  const seeded = { role: "actor", messages: history, schema: Capital, seed: 7 } as const;
  await llm.complete(seeded);
  // A caller that keeps one history array must not rewrite what the first call recorded.
  history.push({ role: "user", content: "later" });
  await llm.complete({ role: "actor", messages: MESSAGES, schema: Capital });

  expect(llm.calls).toStrictEqual([
    { ...seeded, messages: [{ role: "user", content: "first" }] },
    { role: "actor", messages: MESSAGES, schema: Capital },
  ]);
});

test("reports the mapped temperature, 1 when unset, and providerSeed only when a seed is passed", async () => {
  const canned = { capital: "Paris" };
  const llm = fakeLlm({ actor: [canned, canned], scout: [canned] }, { actor: 0.7 });
  const sampling = (role: "actor" | "scout", seed?: number) =>
    llm
      .complete({
        role,
        messages: MESSAGES,
        schema: Capital,
        ...(seed === undefined ? {} : { seed }),
      })
      .then((completion) => completion.sampling);

  // 0, so a truthiness check on the seed would drop it.
  expect(await sampling("actor", 0)).toStrictEqual({ temperature: 0.7, providerSeed: 0 });
  expect(await sampling("actor")).toStrictEqual({ temperature: 0.7 });
  expect(await sampling("scout")).toStrictEqual({ temperature: 1 });
});

test("throws an Error entry as it is", async () => {
  const outage = new LlmError("llm_request_failed", "HTTP 503: overloaded", ZERO);
  const llm = fakeLlm({ actor: [outage] });

  const call = llm.complete({ role: "actor", messages: MESSAGES, schema: Capital });

  await expect(call).rejects.toBe(outage);
});

test("a canned object that fails the schema is llm_invalid_output at zero cost", async () => {
  const llm = fakeLlm({ extractor: [{ capital: 42 }] });

  const error = await llm
    .complete({ role: "extractor", messages: MESSAGES, schema: Capital })
    .catch((reason: unknown) => reason);

  expect(error).toBeInstanceOf(LlmError);
  expect(error).toMatchObject({ code: "llm_invalid_output", cost: ZERO });
  expect((error as LlmError).message).toContain("capital");
  expect((error as LlmError).cause).toBeInstanceOf(z.ZodError);
});

test("a function entry answers from the request as recorded, once per call", async () => {
  const received: CompleteRequest<z.ZodObject>[] = [];
  // Reads the question, as s2-03's tests read the turn to find a ref by its element's name.
  const answerFromQuestion = (request: CompleteRequest<z.ZodObject>) => {
    received.push(request);
    const question = request.messages.at(-1)?.content ?? "";
    return { capital: question.includes("Norway") ? "Oslo" : "Paris" };
  };
  const llm = fakeLlm({ actor: [answerFromQuestion, answerFromQuestion] });
  const ask = (content: string) =>
    llm.complete({ role: "actor", messages: [{ role: "user", content }], schema: Capital });

  const completions = [await ask("What is the capital of France?"), await ask("And of Norway?")];

  expect(completions.map(({ value }) => value.capital)).toStrictEqual(["Paris", "Oslo"]);
  expect(received).toStrictEqual(llm.calls);
});

test("a function entry that returns an Error throws it", async () => {
  const outage = new LlmError("llm_request_failed", "HTTP 503: overloaded", ZERO);
  const llm = fakeLlm({ actor: [() => outage] });

  const call = llm.complete({ role: "actor", messages: MESSAGES, schema: Capital });

  await expect(call).rejects.toBe(outage);
});

test("an empty queue throws a plain Error naming the role", async () => {
  const llm = fakeLlm({ extractor: [{ capital: "Paris" }] });
  await llm.complete({ role: "extractor", messages: MESSAGES, schema: Capital });

  for (const role of ["extractor", "scout"] as const) {
    const error = await llm
      .complete({ role, messages: MESSAGES, schema: Capital })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(LlmError);
    expect((error as Error).message).toContain(role);
  }
});

describe("decide", () => {
  const OPTIONS = { e1: 'Click the link "Home"', back: "Go back to the previous page" };
  const QUESTION = { instructions: "Which one action do you take next?", options: OPTIONS };
  const decide = (llm: ReturnType<typeof fakeLlm>, state = "Page: Home") =>
    llm.decide({ role: "actor", state, question: QUESTION });

  test("answers from the role's queue with canned probabilities, from model fake at zero cost", async () => {
    const llm = fakeLlm({
      actor: [
        { choice: "e1", confidence: 0.9, probabilities: { e1: 1, back: 0 } },
        { choice: "back", confidence: 0.1, probabilities: { e1: 0.5, back: 0.5 } },
      ],
    });

    expect(await decide(llm)).toStrictEqual({
      choice: "e1",
      confidence: 0.9,
      probabilities: { e1: 1, back: 0 },
      model: "fake",
      cost: ZERO,
    });
    expect((await decide(llm)).probabilities).toStrictEqual({ e1: 0.5, back: 0.5 });
  });

  test("records every request as it was sent, apart from complete's", async () => {
    const llm = fakeLlm({
      actor: [{ choice: "e1", confidence: 0.9, probabilities: { e1: 1, back: 0 } }],
    });
    const options: Record<string, string> = { ...OPTIONS };
    await llm.decide({ role: "actor", state: "Page: Home", question: { ...QUESTION, options } });
    // A caller that keeps one options object must not rewrite what the call recorded.
    options.e9 = 'Click the link "Later"';

    expect(llm.decideCalls).toStrictEqual([
      { role: "actor", state: "Page: Home", question: QUESTION },
    ]);
    expect(llm.calls).toStrictEqual([]);
  });

  // `choiceAnswer`'s cases are llm.test.ts's; this shows the fake fails the way the adapter does.
  test("a canned answer naming a key not offered is llm_invalid_output at zero cost", async () => {
    const canned = { choice: "e9", confidence: 0.9, probabilities: { e1: 1, back: 0 } };
    const error = await decide(fakeLlm({ actor: [canned] })).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ code: "llm_invalid_output", cost: ZERO });
    expect((error as LlmError).cause).toBeInstanceOf(z.ZodError);
  });

  test("takes from the queue complete takes from, in call order", async () => {
    const pick = { choice: "back", confidence: 0.6, probabilities: { e1: 0.2, back: 0.8 } };
    const llm = fakeLlm({ actor: [{ capital: "Paris" }, pick] });

    await llm.complete({ role: "actor", messages: MESSAGES, schema: Capital });
    expect((await decide(llm)).choice).toBe("back");
  });
});
