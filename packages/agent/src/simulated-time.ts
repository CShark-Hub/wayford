/**
 * B3's simulated clock, as `docs/RULES.md` stage 7, "B3 in detail" defines it: what one step costs
 * the persona, and where the cursor stands after it. Pure: no clock and no dice, so the run seed
 * and the Actor's answers reproduce a run's times. The wall clock is the loop's, and decides
 * nothing.
 */
import {
  type Action,
  type Behaviour,
  type ElementRef,
  type FullObservation,
  type ObservedElement,
  smallerSide,
} from "@wayford/core";
import { actionPoint, type Point } from "./act.js";
import { oneLine } from "./history.js";

/** M, deciding: the KLM's mental preparation (Card, Moran and Newell 1980, 1983). */
const MENTAL_MS = 1350;

/** B, pressing or releasing a button: the KLM, as Kieras' guide (1993) gives it. */
const PRESS_MS = 100;

/** K, a keystroke: the KLM's average non-secretary typist, about 40 words a minute (1980). */
const KEYSTROKE_MS = 280;

/** Fitts's `a` for a mouse, MacKenzie, Sellen and Buxton 1991: a regression intercept, not a time. */
const FITTS_INTERCEPT_MS = -107;

/** Fitts's `b` for a mouse, per bit of the Shannon form's index of difficulty: the same fit. */
const FITTS_SLOPE_MS_PER_BIT = 223;

/**
 * P, pointing: Fitts's law in its Shannon form (MacKenzie 1992), `a + b · log2(D / W + 1)` for a
 * travel of `distancePx` to a target `widthPx` across, both in CSS px. Floored at 0, since `a` is
 * negative and a very short move computes below zero. `W` is held at 1 px at least, so a box of no
 * size is aimed at as a pixel. Unrounded: a step rounds its whole time once.
 */
export function movementMs(distancePx: number, widthPx: number): number {
  const bits = Math.log2(distancePx / Math.max(widthPx, 1) + 1);
  return Math.max(0, FITTS_INTERCEPT_MS + FITTS_SLOPE_MS_PER_BIT * bits);
}

/**
 * The persona's pace (RULES' "The pace"): `thinking` scales M, `motor` scales P, B and the one K
 * of a scroll or a back. Each is a factor of the norm, the KLM's average user.
 */
export interface Pace {
  thinking: number;
  motor: number;
}

/** The profile's two pace factors, 1 where it sets none. */
export function paceOf(behaviour: Pick<Behaviour, "thinkingTime" | "motorTime">): Pace {
  return {
    thinking: behaviour.thinkingTime?.factor ?? 1,
    motor: behaviour.motorTime?.factor ?? 1,
  };
}

/** A wasted step's time, in whole ms: one M, a look and a decision that came to nothing. */
export function wastedStepMs(pace: Pace): number {
  return Math.round(pace.thinking * MENTAL_MS);
}

/**
 * A planned step's time, in whole ms, and where the cursor stands after it, by `docs/RULES.md`
 * stage 7, "B3 in detail". `page` is the step's evidence, where only a shown element carries a ref,
 * and `from` the cursor's last point, or undefined before the first press: the first movement
 * starts at the centre of the viewport. The performed action decides the operators. A press is
 * timed to the element the Actor proposed and leaves the cursor on the performed one's action
 * point, so after a fired B4 the next movement starts from the neighbour. An action with no ref
 * leaves the cursor where it was.
 *
 * A ref the evidence lacks throws a plain `Error`, since only a bug gets one here: the loop checks
 * every answer's ref with `checkActionRef` before it plans.
 */
export function plannedStepMs(step: {
  proposed: Action;
  performed: Action;
  page: FullObservation;
  from: Point | undefined;
  pace: Pace;
}): { ms: number; cursor: Point | undefined } {
  const { proposed, performed, page, from, pace } = step;
  const { presses, keys, typed, waitMs } = operatorsOf(performed);
  let pointing = 0;
  let cursor = from;
  if ("ref" in performed) {
    // A proposal with no target is never performed as a press, so the fallback is a guard only.
    const aimedRef = "ref" in proposed ? proposed.ref : performed.ref;
    const aimed = shownOf(page, aimedRef);
    const start = from ?? { x: page.viewport.width / 2, y: page.viewport.height / 2 };
    const aim = actionPoint(aimed.bbox, page.viewport);
    const dx = aim.x - start.x;
    const dy = aim.y - start.y;
    // A text block has no `targetPx`, and is aimed at across its box's smaller side.
    pointing = movementMs(
      Math.sqrt(dx * dx + dy * dy),
      aimed.metrics.targetPx ?? smallerSide(aimed.bbox),
    );
    // The press lands on the aimed element unless a fired B4 moved it to the neighbour.
    cursor =
      performed.ref === aimedRef
        ? aim
        : actionPoint(shownOf(page, performed.ref).bbox, page.viewport);
  }
  const motor = pointing + presses * PRESS_MS + keys * KEYSTROKE_MS;
  const ms = Math.round(
    pace.thinking * MENTAL_MS + pace.motor * motor + typed * KEYSTROKE_MS + waitMs,
  );
  return { ms, cursor };
}

/** A performed action's operators beside its one M and its pointing (RULES' per-step table). */
interface Operators {
  /** B: 2 for a click or a `type`, 4 for a double click. */
  presses: number;
  /** The one K of a scroll or a back, at the persona's motor pace. */
  keys: number;
  /** The characters a `type` types, each a K at the norm's pace. */
  typed: number;
  /** A wait's own `ms`, time the persona chose to let pass. */
  waitMs: number;
}

function operatorsOf(action: Action): Operators {
  const none = { presses: 0, keys: 0, typed: 0, waitMs: 0 };
  switch (action.type) {
    case "click":
      return { ...none, presses: 2 };
    case "doubleClick":
      return { ...none, presses: 4 };
    case "type":
      // The one line `act.ts` types, counted in code points, so an emoji is one character.
      return { ...none, presses: 2, typed: [...oneLine(action.text)].length };
    case "scroll":
    case "back":
      return { ...none, keys: 1 };
    case "wait":
      return { ...none, waitMs: action.ms };
    case "giveUp":
      return none;
  }
}

/** The shown element `ref` names in the step's evidence. */
function shownOf(page: FullObservation, ref: ElementRef): ObservedElement {
  const element = page.elements.find((candidate) => candidate.ref === ref);
  if (element === undefined) {
    throw new Error(`the action names ${ref}, which step ${page.stepIndex}'s evidence lacks`);
  }
  return element;
}
