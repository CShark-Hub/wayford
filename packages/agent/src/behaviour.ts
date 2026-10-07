/**
 * Stage 7 of the filter pipeline, behaviour (`docs/RULES.md`): the dice that may rewrite the action
 * the Actor proposed before the loop performs it, every roll logged as `{ rule, p, rolled, fired }`
 * in the order rolled. B1 and B2 are here; B4 joins in RULES' table order (s2-08).
 *
 * `draw` is the run's behaviour stream, `rng(run seed)`, made once per run by the loop and drawn in
 * order across its steps, never from the profile seed (`docs/PLAN.md` A20). A rule takes one draw
 * when it applies and none otherwise, so a stored run replays its rolls.
 */
import { type Action, type Behaviour, type DiceRoll, diceFires } from "@wayford/core";

/** What stage 7 made of the action the Actor proposed: the action to perform and every roll. */
export interface Behaved {
  performed: Action;
  dice: DiceRoll[];
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
 *
 * A knob of 0 rolls and never fires, so the log shows the rule was checked. A rule that does not
 * apply draws nothing and logs nothing, and without a fired roll the performed action is the
 * proposed one itself.
 */
export function behave(
  proposed: Action,
  behaviour: Pick<Behaviour, "doubleClick" | "scrollWhenStuck">,
  draw: () => number,
  repeated = false,
): Behaved {
  const dice: DiceRoll[] = [];
  let performed = proposed;
  // B1: a click becomes a double click.
  if (proposed.type === "click" && behaviour.doubleClick !== undefined) {
    const p = behaviour.doubleClick;
    const rolled = draw();
    const fired = diceFires(p, rolled);
    dice.push({ rule: "B1", p, rolled, fired });
    if (fired) performed = { type: "doubleClick", ref: proposed.ref };
  }
  // B2: a stuck Actor scrolls down instead, and decides again on the next step.
  if (
    behaviour.scrollWhenStuck !== undefined &&
    performed === proposed &&
    stuck(proposed, repeated)
  ) {
    const p = behaviour.scrollWhenStuck;
    const rolled = draw();
    const fired = diceFires(p, rolled);
    dice.push({ rule: "B2", p, rolled, fired });
    if (fired) performed = SCROLL_DOWN;
  }
  return { performed, dice };
}
