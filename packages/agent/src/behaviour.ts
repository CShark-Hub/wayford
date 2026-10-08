/**
 * Stage 7 of the filter pipeline, behaviour (`docs/RULES.md`): the dice that may rewrite the action
 * the Actor proposed before the loop performs it, every roll logged as `{ rule, p, rolled, fired }`
 * in the order rolled. B1, B2 and B4 roll here, in RULES' table order; B4's p and the neighbour a
 * miss lands on are `misclick.ts`'s, read off the step's evidence.
 *
 * `draw` is the run's behaviour stream, `rng(run seed)`, made once per run by the loop and drawn in
 * order across its steps, never from the profile seed (`docs/PLAN.md` A20). A rule takes one draw
 * when it applies and none otherwise, so a stored run replays its rolls.
 */
import {
  type Action,
  type Behaviour,
  type DiceRoll,
  type DiceRule,
  diceFires,
  type FullObservation,
} from "@wayford/core";
import { misclickOf } from "./misclick.js";

/** What stage 7 made of the action the Actor proposed: the action to perform and every roll. */
export interface Behaved {
  performed: Action;
  dice: DiceRoll[];
}

/** What stage 7 reads off the step besides the proposal. */
export interface BehaveStep {
  /** Whether the proposal repeats the Actor's previous one (B2, `history.ts`). */
  repeated: boolean;
  /** The step's evidence: B4 reads the target's size and the shown elements from it. */
  page: FullObservation;
}

/** B2's effect: the scroll it performs in place of a `giveUp` or a repeat. */
const SCROLL_DOWN: Action = { type: "scroll", direction: "down" };

/** Whether the Actor is stuck: `docs/RULES.md` stage 7, the B2 row (`repeated` from `history.ts`). */
function stuck(proposed: Action, repeated: boolean): boolean {
  if (proposed.type === "scroll" && proposed.direction === "down") return false;
  return proposed.type === "giveUp" || repeated;
}

/**
 * Stage 7 on one proposed action, its rules in RULES' table order.
 *
 * - B1 applies to a click when the profile sets `doubleClick`.
 * - B2 applies when the profile sets `scrollWhenStuck` and the Actor is stuck (`stuck`), unless
 *   B1 already fired: the action is then no longer the Actor's repeat, and core's roll audit holds
 *   a fired B1 to the double click it made.
 * - B4 applies to a click when the profile sets `misclick`, unless B2 fired, since the scroll it
 *   performs has no target, and only when `misclickOf` resolves: a control under the motor limit
 *   with a shown control in reach. A fired B4 moves the press to that neighbour and keeps its kind,
 *   so a double click B1 made misses as a double click.
 *
 * `step` is required, so a caller cannot switch B4 off by leaving the page out. A knob of 0 rolls
 * and never fires, so the log shows the rule was checked. A rule that does not apply draws nothing
 * and logs nothing, and without a fired roll the performed action is the proposed one itself.
 */
export function behave(
  proposed: Action,
  behaviour: Pick<Behaviour, "doubleClick" | "scrollWhenStuck" | "misclick">,
  draw: () => number,
  step: BehaveStep,
): Behaved {
  const dice: DiceRoll[] = [];
  // One roll: the next draw, logged fired or not in the order rolled, and whether it fired.
  const roll = (rule: DiceRule, p: number): boolean => {
    const rolled = draw();
    const fired = diceFires(p, rolled);
    dice.push({ rule, p, rolled, fired });
    return fired;
  };
  const click = proposed.type === "click" ? proposed : undefined;
  // B1: a click becomes a double click.
  const doubled =
    click !== undefined && behaviour.doubleClick !== undefined && roll("B1", behaviour.doubleClick);
  // B2: a stuck Actor scrolls down instead, and decides again on the next step.
  const scrolled =
    !doubled &&
    behaviour.scrollWhenStuck !== undefined &&
    stuck(proposed, step.repeated) &&
    roll("B2", behaviour.scrollWhenStuck);
  // B4: a click on a small control lands on the nearest control in reach.
  const miss =
    click !== undefined && !scrolled && behaviour.misclick !== undefined
      ? misclickOf(click.ref, step.page, behaviour.misclick.threshold)
      : undefined;
  const missed = miss !== undefined && roll("B4", miss.p);
  if (scrolled) return { performed: SCROLL_DOWN, dice };
  if (click === undefined || (!doubled && !missed)) return { performed: proposed, dice };
  // B1 changes how the press is made, B4 where it lands.
  return {
    performed: {
      type: doubled ? "doubleClick" : "click",
      ref: missed ? miss.neighbour : click.ref,
    },
    dice,
  };
}
