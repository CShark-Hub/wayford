/**
 * An `Llm` for other packages' tests, so none of them calls a real model or needs a key. It ships
 * as `@wayford/agent/fake`, outside the main entry, so a server importing the adapter never
 * imports test code, as core keeps its fixtures behind `@wayford/core/fixtures`. s4-01's
 * Extractor scripts a first answer and a repair answer; s2-03's Actor loop answers from the
 * request, finding each ref by its element's name, since refs depend on each persona's
 * observation, and scripts a fake that throws to reach its failure path; s2-06's Jev backend
 * scripts Jev's probabilities from the request the same way, putting them on an option by its
 * element's name, since refs differ per persona.
 *
 * It answers from canned entries, one queue per role, and sends nothing.
 */
import type { Cost, LlmRole } from "@wayford/core";
import { z } from "zod";
import {
  type CompleteRequest,
  type Completion,
  choiceAnswer,
  type DecideRequest,
  type Decision,
  type Llm,
  LlmError,
  samplingOf,
} from "./llm.js";

/**
 * Per role, in the order the calls take them, `complete` and `decide` from the same queue. A
 * `decide` entry is Jev's answer, `{ choice, confidence, probabilities }`. An `Error` entry is
 * thrown instead of answered. A function entry, for either call, is called with the request as
 * recorded and answers with what it returns, so a test can answer from what it was asked.
 */
export type FakeAnswers = Partial<Record<LlmRole, unknown[]>>;

/**
 * `calls` is every `complete` request received and `decideCalls` every `decide` request, each in
 * order, so a test can check what its code sent.
 */
export type FakeLlm = Llm & { calls: CompleteRequest<z.ZodObject>[]; decideCalls: DecideRequest[] };

export function fakeLlm(
  answers: FakeAnswers,
  temperatures?: Partial<Record<LlmRole, number>>,
): FakeLlm {
  // Copied, so a test can reuse its arrays and still assert on them after the calls.
  const queues: Record<LlmRole, unknown[]> = {
    extractor: [...(answers.extractor ?? [])],
    scout: [...(answers.scout ?? [])],
    actor: [...(answers.actor ?? [])],
    analyst: [...(answers.analyst ?? [])],
  };
  const calls: CompleteRequest<z.ZodObject>[] = [];
  const decideCalls: DecideRequest[] = [];

  /** The role's next entry. An `Error` entry is thrown instead. */
  function take(role: LlmRole): unknown {
    const queue = queues[role];
    // A plain Error, not an LlmError: running out is a test that scripted too few answers, and
    // a caller's failure path must not swallow it as a model failure.
    if (queue.length === 0) {
      throw new Error(`The fake LLM has no ${role} answer left: the test scripted too few.`);
    }
    const entry = queue.shift();
    if (entry instanceof Error) throw entry;
    return entry;
  }

  /**
   * The role's next entry for one request. A function entry is called with the request as
   * recorded, and what it returns, awaited, is the entry from here on: an Error is thrown, and
   * anything else is for the caller to check.
   */
  async function entryFor(role: LlmRole, recorded: unknown): Promise<unknown> {
    const entry = take(role);
    if (typeof entry !== "function") return entry;
    const answered: unknown = await entry(recorded);
    if (answered instanceof Error) throw answered;
    return answered;
  }

  async function complete<S extends z.ZodObject>(
    request: CompleteRequest<S>,
  ): Promise<Completion<z.output<S>>> {
    // The messages as they were sent, as the real adapter serialises them: a caller that keeps
    // pushing to one history array must not rewrite what earlier calls recorded.
    const recorded = { ...request, messages: [...request.messages] };
    calls.push(recorded);
    const { role, schema, seed } = request;
    // Built before an entry is taken, as `complete` builds it before sending, so a seed that
    // Sampling refuses fails here the way it fails there.
    // 1 when unmapped, the parser's default for every role, so a stored `sampling` is one a real
    // run could have sent.
    const sampling = samplingOf(temperatures?.[role] ?? 1, seed);

    const parsed = schema.safeParse(await entryFor(role, recorded));
    // Without a repair round to script.
    if (!parsed.success) {
      throw invalid(`The canned ${role} answer did not match the schema`, parsed.error);
    }
    return { value: parsed.data, model: "fake", cost: zeroCost(), sampling };
  }

  async function decide(request: DecideRequest): Promise<Decision> {
    const { role, question } = request;
    // The options as they were sent: a caller that reuses one options object must not rewrite
    // what earlier calls recorded.
    const recorded = { ...request, question: { ...question, options: { ...question.options } } };
    decideCalls.push(recorded);

    // Checked as the real adapter checks Jev's answer, against the options as they were sent.
    const options = recorded.question.options;
    const parsed = choiceAnswer(options).safeParse(await entryFor(role, recorded));
    if (!parsed.success) {
      throw invalid(`The canned ${role} decision did not answer the question asked`, parsed.error);
    }
    return { ...parsed.data, model: "fake", cost: zeroCost() };
  }

  return { calls, decideCalls, complete, decide };
}

/**
 * The real adapter's code for an answer that misses its schema, so a caller's handling of it can
 * be tested on the fake.
 */
function invalid(says: string, error: z.ZodError): LlmError {
  return new LlmError("llm_invalid_output", `${says}:\n${z.prettifyError(error)}`, zeroCost(), {
    cause: error,
  });
}

function zeroCost(): Cost {
  return { tokensIn: 0, tokensOut: 0, usd: 0 };
}
