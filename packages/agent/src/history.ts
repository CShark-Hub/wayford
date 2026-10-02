/**
 * The one history renderer: what the Actor has done so far, one line per step, the same text for
 * every backend. `s2-10` truncates it here (M1, `docs/RULES.md` stage 6), so no backend keeps a
 * history of its own.
 *
 * A step holds the Actor-facing `Observation` it was shown, never the `FullObservation`, so a
 * target can only be named as the Actor read it, masked or renamed. A history that repeated the
 * name in the evidence would hand the persona what the filter took away.
 *
 * A line tells the action the Actor proposed, not the one performed: from `s2-10` the behaviour
 * dice can perform a click as a double click (B1), and "you double-clicked" would tell the model
 * what the dice did. A target is named by its role and shown name, never by its ref: every page
 * gives its refs out again, so an old ref names another element now (the fixture run's wasted
 * step reuses the page before's `e3`). No narration either: it is the model's interpretation, and
 * the Jev backend (s2-06) writes none.
 */
import type { Action, ElementRef, Observation } from "@wayford/core";

/**
 * One step as the Actor took it: the page it was shown and the action it proposed there, or
 * `wasted` when both of its answers named a ref that page lacked (`WastedRunStep`).
 */
export type HistoryStep =
  | { observation: Observation; proposed: Action }
  | { observation: Observation; wasted: true };

/**
 * The history the Actor reads: `Nothing yet.` before the first step, then one line per step,
 * oldest first, `- On <url>: you <move>.`
 *
 * A proposed ref that the step's own observation lacks throws a plain `Error`: the loop keeps a
 * step's action only once its ref was found there, so only a bug reaches it.
 */
export function renderHistory(steps: readonly HistoryStep[]): string {
  if (steps.length === 0) return "Nothing yet.";
  return steps.map(historyLine).join("\n");
}

function historyLine(step: HistoryStep): string {
  const where = `- On ${oneLine(step.observation.url)}:`;
  // One line, the same for every persona, and it names nothing: the ref was not on the page, and
  // repeating it would only invite the same miss.
  if ("wasted" in step) {
    return `${where} you pointed at something that was not on that page, so nothing happened.`;
  }
  return `${where} you ${move(step.proposed, step.observation)}.`;
}

/** What the Actor did, in the past tense, as it follows "you". */
function move(action: Action, observation: Observation): string {
  switch (action.type) {
    case "click":
      return `clicked ${target(action.ref, observation)}`;
    case "doubleClick":
      return `double-clicked ${target(action.ref, observation)}`;
    case "type":
      return `typed ${JSON.stringify(oneLine(action.text))} into ${target(action.ref, observation)}`;
    case "scroll":
      return `scrolled ${action.direction}`;
    case "back":
      return "went back";
    case "wait":
      return `waited ${action.ms} ms`;
    // A giveUp ends the run, so this line shows only when a behaviour rule performs something
    // else in its place (B2, `docs/RULES.md` stage 7).
    case "giveUp":
      return "gave up";
  }
}

/**
 * The element `ref` named on that step's page, by its role and the name it showed, quoted as
 * `renderObservationForModel` quotes it, so the history reads the name as the page line did.
 */
function target(ref: ElementRef, observation: Observation): string {
  const element = observation.elements.find((shown) => shown.ref === ref);
  if (element === undefined) {
    throw new Error(
      `step ${observation.stepIndex} proposed ${ref}, which its observation does not show: a step whose ref was refused is kept as wasted`,
    );
  }
  return `${oneLine(element.role)} ${JSON.stringify(oneLine(element.name))}`;
}

/**
 * Core's `oneLine` (`packages/core/src/observation.ts`), copied: it is private there, and that
 * file is frozen. Page text is untrusted, so a line break in a URL, role or name would write its
 * own line into the history. Every run of control characters and Unicode line or paragraph
 * separators becomes one space, as in the observation. Typed text goes through it too, so a
 * step stays one line whatever the model typed, and `act.ts` types it so, so the page gets what
 * the history says and a line break is never an Enter. `actorTurn` puts the goal through it, so a
 * goal cannot write a line of the prompt either.
 */
export function oneLine(text: string): string {
  return text.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ");
}
