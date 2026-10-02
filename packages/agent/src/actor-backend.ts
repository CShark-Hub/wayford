/**
 * The Actor backend: the one seam between the loop and whatever picks the next action
 * (`tasks/s2-03-actor-loop.md`, Constraints). The loop observes, checks the answer's ref, acts and
 * records; a backend only answers a turn. The LLM backend is `llm-actor.ts`. s2-06 adds Jev behind
 * the same seam (`docs/adr/0001-jev-actor-backend.md`), and the loop does not change for it.
 */
import {
  type ActorResponse,
  type Cost,
  type ElementRef,
  type Observation,
  renderObservationForModel,
} from "@wayford/core";
import type { Logger } from "pino";
import { type HistoryStep, oneLine, renderHistory } from "./history.js";

/**
 * What a backend is given for one step: the goal sentence, the page as the persona was shown it,
 * and what the Actor has done so far, the last two already rendered, so every backend reads the
 * same text. No profile is in it: the persona reaches a backend only through the observation
 * (and, from s2-10, through how much of the history it remembers, M1).
 */
export interface ActorTurn {
  goal: string;
  /** `renderObservationForModel` of the Actor-facing observation: the page as the model reads it. */
  observationText: string;
  /** `renderHistory` of the steps so far: the one history renderer's text. */
  history: string;
  /**
   * Set on a step's second ask, after the first answer named a ref this page lacks: that answer
   * as parsed, and its ref. The ref check and the one retry are the loop's, so every backend
   * obeys "one retry, then wasted"; a backend only phrases the retry.
   */
  retry?: { refused: ActorResponse; ref: ElementRef };
}

/** One answer as parsed, and what it cost, the adapter's repairs and retries included. */
export interface ActorAnswer {
  response: ActorResponse;
  cost: Cost;
}

export interface ActorBackend {
  /**
   * `runStarted.modelIds.actor`. Known before the first call, since `runStarted` is emitted
   * before anything is asked.
   */
  readonly modelId: string;
  /**
   * The answer to one turn. A failed call rejects: an `LlmError` carries the cost it already
   * billed, which the loop adds to the run's before it ends the run.
   */
  answer(turn: ActorTurn): Promise<ActorAnswer>;
}

/**
 * Builds one run's backend. `runActor` calls it once per run, after the run id exists, with the
 * run's child logger, so what the backend logs, its `Llm`'s lines included, carries the run id.
 */
export type ActorBackendFactory = (run: { logger: Logger }) => ActorBackend;

/**
 * The turn the loop hands its backend for one step. The page is rendered by core's renderer and
 * the steps by the one history renderer, so no backend renders either for itself. It takes no
 * profile, so a persona has no other way into a backend. The goal is kept on one line, as page
 * text is, so a goal with a line break cannot write a line of the prompt.
 */
export function actorTurn(
  goal: string,
  observation: Observation,
  history: readonly HistoryStep[],
): ActorTurn {
  return {
    goal: oneLine(goal),
    observationText: renderObservationForModel(observation),
    history: renderHistory(history),
  };
}
