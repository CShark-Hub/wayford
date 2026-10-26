/**
 * The Actor's LLM backend: a turn becomes chat messages built from three plain prompt files,
 * sent to the `actor` role through the adapter and parsed as core's `ActorResponse`.
 *
 * The template is the same for every persona (`docs/PLAN.md` F5 AC6). What differs between two
 * personas reaches it only through the observation and the history, both rendered before a
 * backend sees the turn (`actor-backend.ts`). The files live in `packages/agent/prompts/`, read
 * through `prompts.ts`, so a reviewer can read the template before any code, and they hold no
 * comments, since every byte of them reaches the model.
 */
import { ActorResponse, MAX_WAIT_MS } from "@wayford/core";
import type { Logger } from "pino";
import type { ActorBackendFactory, ActorTurn } from "./actor-backend.js";
import { type ChatMessage, createLlm, type Llm, samplingOf } from "./llm.js";
import type { LlmSettings } from "./llm-settings.js";
import { fill, readPrompt, turnText } from "./prompts.js";

/** The constant system message, its one placeholder filled at load from core's engine guard. */
const SYSTEM = fill(readPrompt("actor-system.md"), { maxWaitMs: String(MAX_WAIT_MS) });
const RETRY = readPrompt("actor-retry.md");

/**
 * The chat messages for one turn: the system message, then the turn as one user message
 * (`turnText`), which gives the goal, then the history, then the page. On a retry the refused
 * answer follows as the model's own turn, serialised as it was parsed, then the retry text naming
 * the ref it missed, so the model reads the retry as a reply to what it said, as in the adapter's
 * repair round.
 *
 * Exported so a test can rebuild a request from a stored step and compare it with what was sent.
 */
export function actorMessages(turn: ActorTurn): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: turnText(turn) },
  ];
  if (turn.retry !== undefined) {
    messages.push(
      { role: "assistant", content: JSON.stringify(turn.retry.refused) },
      { role: "user", content: fill(RETRY, { ref: turn.retry.ref }) },
    );
  }
  return messages;
}

/**
 * The LLM backend's factory. `runActor` calls it once per run with the run's logger and provider
 * seed, and each call builds one `Llm` for that run, since the adapter fixes its logger per
 * instance (`LlmDeps`). By default that is `createLlm` on `settings`, each attempt bounded by the
 * role's own `timeoutMs` (`LLM_ACTOR_TIMEOUT_MS`, `LLM_SCOUT_TIMEOUT_MS`, 60 s unset).
 * `createLlm` checks every role's price, so an unpriced model fails before the run starts; `llm`
 * replaces it in tests. The backend's `modelId` is the configured model of its role and its `sampling` that
 * role's temperature with the run's provider seed, both known before its first call.
 *
 * `role` is `actor` unless Scout plays the part (`scout.ts`): the same prompt and loop, on Scout's
 * model. `settings.roles[role]` is the one source of the model, the temperature, the effort and
 * the timeout.
 *
 * Each answer is one `complete` on that role with `ActorResponse` and the run's provider seed, so
 * every call of a run is sent the same one (A20); repairs and retries are the adapter's own, the
 * one retry of a timed-out attempt included, and their cost is in the answer's. An `LlmError`
 * propagates as it is, so the loop adds the cost it carries and ends the run. The model picks the
 * action itself, so the backend reads nothing from the run's decision stream and its answers carry
 * no `decision`.
 */
export function llmActor(options: {
  settings: LlmSettings;
  role?: "actor" | "scout";
  llm?: (logger: Logger) => Llm;
}): ActorBackendFactory {
  const {
    settings,
    role = "actor",
    llm: buildLlm = (logger: Logger) => createLlm(settings, { logger }),
  } = options;
  return ({ logger, providerSeed }) => {
    const llm = buildLlm(logger);
    return {
      modelId: settings.roles[role].model,
      sampling: samplingOf(settings.roles[role].temperature, providerSeed),
      async answer(turn) {
        const completion = await llm.complete({
          role,
          messages: actorMessages(turn),
          schema: ActorResponse,
          seed: providerSeed,
        });
        return { response: completion.value, cost: completion.cost };
      },
    };
  };
}
