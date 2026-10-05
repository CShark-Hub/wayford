# s2-07 — B2: scroll when stuck

Stream: s2
Milestone: week 4
Size: S
Depends on: s2-10 (the behaviour stream and B1)

## Context

Read first, in this order:

- `docs/RULES.md` stage 7: "The firing rule", "What is logged", "B2 in the log" and the B2 row
- `docs/PLAN.md` F5 AC1, AC2, AC4 and AC5
- `packages/core/src/run.ts` — `DiceRule`, the dice roll and the roll audit's structural checks
- `packages/agent/src/` after s2-10 — the loop, the behaviour stream and how B1 rolls

## Goal

When the Actor would give up or repeat itself, a persona with `scrollWhenStuck` scrolls down instead, with that probability, rolled from the run's behaviour stream and logged, so Milo (0.9) and Zoya (0.3) keep looking where Ada would stop.

## Interface

- In: `profile.behaviour.scrollWhenStuck` (`Probability`), the action the Actor proposed, and the step before it
- Out: the step's performed action and its B2 roll, `{ rule, p, rolled, fired }`, in the run record (`packages/core/src/run.ts`)
- Files expected to change: `packages/agent/src/**`; `docs/RULES.md` only to pin what a repeat is (see Constraints)

## Constraints

- `docs/RULES.md` stage 7: one draw of the run seed's behaviour stream per rule that applies, firing when `rolled < p`, every roll logged fired or not, never a draw of the profile seed (`docs/PLAN.md` A20).
- B2 applies to a `giveUp` and to a repeated action. What counts as a repeat (the same type and ref as the step before, or the same performed action) is decided here, written into RULES' B2 row, and tested.
- A fired B2 performs a `scroll` down, the proposed action stays on the step, and the Actor decides again on the next step (RULES, "B2 in the log").
- A fired B2 on a `giveUp` is not a give-up: the run goes on. Only a `giveUp` that is performed ends `gave_up` (F5 AC4).
- The behaviour stream is one stream. A B2 roll moves every later roll, as a B1 roll does, so the same seed and answers still give the same rolls (F5 AC1). The order of B1 and B2 on one step follows RULES' table order.
- The step cap still ends a run that B2 keeps alive (F5 AC5).
- RULES' B2 row already marks the probability `folk`. Carrying it into a finding's basis is not this task: behaviour knobs carry no provenance field (`packages/core/src/profile.ts`).

## Acceptance

- [ ] `pnpm --filter @wayford/agent test` passes
- [ ] With `scrollWhenStuck` 1, a fake that answers `giveUp` on step 2 gets a scroll performed on step 2, its roll stored as fired, and the run goes on to step 3
- [ ] With `scrollWhenStuck` 0, the same fake ends `gave_up` on step 2, its roll stored as not fired
- [ ] A repeated action, as RULES' B2 row defines it (Constraints), rolls B2, and a fired roll performs a scroll
- [ ] Same seed and answers twice: every B1 and B2 roll is equal (F5 AC1)
- [ ] Every step of the `RunResult` passes core's roll audit
- [ ] With `scrollWhenStuck` 1 and a fake that only gives up, the run ends `budget_exceeded` at the step cap
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- B4 and simulated time (s2-08, s2-09). Scrolling up or sideways. Any change to the prompt.

## Notes for the reviewer

- Check the log of a step where B2 fired on a `giveUp`: the proposed action is the give-up and the performed one the scroll.
