/**
 * An `Llm` for other packages' tests, so none of them calls a real model or needs a key. It ships
 * as `@wayford/agent/fake`, outside the main entry, so a server importing the adapter never
 * imports test code, as core keeps its fixtures behind `@wayford/core/fixtures`. s4-01's
 * Extractor scripts a first answer and a repair answer; s2-03's Actor loop scripts a sequence of
 * answers, and a fake that throws to reach its failure path.
 *
 * It answers from canned entries, one queue per role, and sends nothing.
 */
import type { LlmRole } from "@wayford/core";
import { z } from "zod";
import { type CompleteRequest, type Completion, type Llm, LlmError, samplingOf } from "./llm.js";

/** Per role, in the order the calls take them. An `Error` entry is thrown instead of answered. */
export type FakeAnswers = Partial<Record<LlmRole, unknown[]>>;

/** `calls` is every request received, in order, so a test can check what its code sent. */
export type FakeLlm = Llm & { calls: CompleteRequest<z.ZodObject>[] };

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

  async function complete<S extends z.ZodObject>(
    request: CompleteRequest<S>,
  ): Promise<Completion<z.output<S>>> {
    // The messages as they were sent, as the real adapter serialises them: a caller that keeps
    // pushing to one history array must not rewrite what earlier calls recorded.
    calls.push({ ...request, messages: [...request.messages] });
    const { role, schema, seed } = request;
    // Built before an entry is taken, as `complete` builds it before sending, so a seed that
    // Sampling refuses fails here the way it fails there.
    // 1 when unmapped, the parser's default for every role, so a stored `sampling` is one a real
    // run could have sent.
    const sampling = samplingOf(temperatures?.[role] ?? 1, seed);

    const queue = queues[role];
    // A plain Error, not an LlmError: running out is a test that scripted too few answers, and
    // a caller's failure path must not swallow it as a model failure.
    if (queue.length === 0) {
      throw new Error(`The fake LLM has no ${role} answer left: the test scripted too few.`);
    }
    const entry = queue.shift();
    if (entry instanceof Error) throw entry;

    const parsed = schema.safeParse(entry);
    // The real adapter's code for an answer that misses the schema, so a caller's handling of
    // it can be tested without a repair round to script.
    if (!parsed.success) {
      throw new LlmError(
        "llm_invalid_output",
        `The canned ${role} answer did not match the schema:\n${z.prettifyError(parsed.error)}`,
        { tokensIn: 0, tokensOut: 0, usd: 0 },
        { cause: parsed.error },
      );
    }
    return {
      value: parsed.data,
      model: "fake",
      cost: { tokensIn: 0, tokensOut: 0, usd: 0 },
      sampling,
    };
  }

  return { calls, complete };
}
