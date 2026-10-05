/**
 * The Actor's Jev backend (`docs/adr/0001-jev-actor-backend.md`): a turn becomes one Choice
 * question to Jev through the adapter's `decide`, and the action is drawn from the probabilities
 * it sends back.
 *
 * The persona reaches Jev only through the observation and the M1 history, in the same turn text
 * the LLM reads (`turnText`), plus one fixed instruction file, `prompts/jev-question.md`, the same
 * for every persona (`docs/PLAN.md` F5 AC6). The options come from the Actor-facing observation:
 * one click per element it shows, under the name it shows, so a degraded element is offered
 * masked and a hidden one is never offered.
 *
 * Jev picks nothing here. The action is drawn from its probabilities, in the order the options
 * were offered, with the run's decision stream, so a run on the same seed and the same
 * probabilities draws the same actions (ADR 0001 §3). Jev's own pick is logged and never used.
 * Its confidence is stored on the step's record, and nothing reads it.
 *
 * The backend never calls `complete`, so it writes no narration: a Jev step's is the empty
 * string, and the loop emits no `narration` event for it.
 */
import { type DecisionOption, drawOption, type Observation, WayfordError } from "@wayford/core";
import type { Logger } from "pino";
import type { ActorBackendFactory, ActorTurn } from "./actor-backend.js";
import { elementName } from "./history.js";
import { createLlm, type DecideRequest, type Llm } from "./llm.js";
import type { LlmSettings } from "./llm-settings.js";
import { readPrompt, turnText } from "./prompts.js";

/** Jev's Choice limit: a question takes at most 255 options (s2-05). */
export const JEV_MAX_OPTIONS = 255;

/** Core's option, plus the key it is sent under. */
export type JevOption = DecisionOption & { key: string };

/** The one instruction file. It holds no placeholder, so every byte of it reaches Jev as written. */
const QUESTION = readPrompt("jev-question.md");

/**
 * The options of one turn, in offer order: one click per element the Actor was shown, in the
 * page's order, then the four moves every page offers. A click's key is its ref, and its words
 * name the ref too, so an option is tied to its page line whether or not Jev reads the keys, and
 * two elements with the same role and name are never offered under the same words. The element is
 * named as the history names it (`elementName`). The fixed keys cannot collide with a ref, which
 * is always `e<n>`.
 *
 * No `doubleClick`: stage 7's B1 makes one from a drawn click. No `type` or `wait`: each needs a
 * value someone has to write, the text or the time, and Jev writes no text.
 */
export function jevOptions(observation: Observation): JevOption[] {
  const clicks = observation.elements.map(
    (element): JevOption => ({
      key: element.ref,
      action: { type: "click", ref: element.ref },
      description: `Click [${element.ref}], the ${elementName(element)}`,
    }),
  );
  // Built fresh on every call, so no caller shares an action object with another turn's.
  return [
    ...clicks,
    {
      key: "scroll_down",
      action: { type: "scroll", direction: "down" },
      description: "Scroll the page down",
    },
    {
      key: "scroll_up",
      action: { type: "scroll", direction: "up" },
      description: "Scroll the page up",
    },
    { key: "back", action: { type: "back" }, description: "Go back to the page before" },
    {
      key: "give_up",
      action: { type: "giveUp" },
      description: "Stop, because you think you cannot get it done here",
    },
  ];
}

/**
 * The `decide` request for one turn: the turn text as the state, which is the LLM's user message
 * byte for byte, and the one instruction file, with each option's words under its key, in offer
 * order.
 *
 * Exported so a test can rebuild a stored step's request and compare it with what was sent.
 */
export function jevRequest(turn: ActorTurn, options: readonly JevOption[]): DecideRequest {
  return {
    role: "actor",
    state: turnText(turn),
    question: {
      instructions: QUESTION.text,
      options: Object.fromEntries(options.map((option) => [option.key, option.description])),
    },
  };
}

/**
 * The Jev backend's factory. `runActor` calls it once per run with the run's logger and decision
 * stream, and each call builds one `Llm` for that run, as `llmActor` does, since the adapter fixes
 * its logger per instance. By default that is `createLlm` on `settings`, which checks every
 * model's price, Jev's included, so an unpriced one fails before the run starts; `llm` replaces
 * it in tests. The backend's `modelId` is Jev's pinned model, and its `sampling` is `undefined`:
 * Jev is sent no temperature and no seed.
 *
 * Each answer is one `decide` on the `actor` role. The page's options are passed whole: more than
 * Jev takes fails the run before any call, so nothing is billed, since trimming the list would be
 * a second filter that no rule names. An `LlmError` propagates as it is, so the loop adds the cost
 * it carries and ends the run. Then one value from the run's decision stream draws the action, and
 * the answer carries the record of how, which the loop puts on `actionPlanned`.
 */
export function jevActor({
  settings,
  llm: buildLlm = (logger: Logger) => createLlm(settings, { logger }),
}: {
  settings: LlmSettings;
  llm?: (logger: Logger) => Llm;
}): ActorBackendFactory {
  return ({ logger, decisionDraw }) => {
    const llm = buildLlm(logger);
    return {
      modelId: settings.jevModel,
      sampling: undefined,
      async answer(turn) {
        // The loop asks again only after an answer named a ref the page lacks, and every option
        // names a shown ref or none, so only a bug reaches this.
        if (turn.retry !== undefined) {
          throw new Error(
            `the Jev backend was asked to retry after ${turn.retry.ref}, which it cannot have answered: every option it draws names a ref the page shows, or none`,
          );
        }
        const options = jevOptions(turn.observation);
        if (options.length > JEV_MAX_OPTIONS) {
          throw new WayfordError(
            "jev_too_many_options",
            `the page offers ${options.length} options, more than Jev's Choice limit of ${JEV_MAX_OPTIONS}; the list is never trimmed, since trimming it would be a second, hidden filter`,
          );
        }

        const decision = await llm.decide(jevRequest(turn, options));
        // In offer order, which the draw runs over; `decide` checked that every key is there.
        const probabilities = options.map((option) => decision.probabilities[option.key] ?? 0);
        const rolled = decisionDraw();
        const chosen = options[drawOption(probabilities, rolled)];
        // `drawOption` lands inside the list or throws, so only a bug reaches this.
        if (chosen === undefined) {
          throw new Error(`the draw of ${rolled} landed on no option of ${options.length}`);
        }

        // Never the state or the options, which the adapter does not log either: the step's
        // evidence and its record hold them.
        logger.info(
          {
            jevChoice: decision.choice,
            drawn: chosen.key,
            rolled,
            confidence: decision.confidence,
          },
          "jev decision",
        );
        return {
          response: { action: chosen.action, narration: "" },
          cost: decision.cost,
          decision: {
            options: options.map(({ action, description }) => ({ action, description })),
            probabilities,
            confidence: decision.confidence,
            rolled,
          },
        };
      },
    };
  };
}
