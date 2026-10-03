/**
 * Stage 7 of the filter pipeline, behaviour (`docs/RULES.md`): the dice that may rewrite the action
 * the Actor proposed before the loop performs it, every roll logged as `{ rule, p, rolled, fired }`
 * in the order rolled. B1 is here; B2 and B4 join in RULES' table order (s2-07, s2-08).
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

/**
 * Stage 7 on one proposed action. B1 applies to a click when the profile sets `doubleClick`, 0
 * included: a knob of 0 rolls and never fires, so the log shows the rule was checked. A rule that
 * does not apply draws nothing and logs nothing, and without a fired roll the performed action is
 * the proposed one itself.
 */
export function behave(
  proposed: Action,
  behaviour: Pick<Behaviour, "doubleClick">,
  draw: () => number,
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
  return { performed, dice };
}
