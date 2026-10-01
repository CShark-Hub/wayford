# s2-08 — B4: misclick on small targets

Stream: s2
Milestone: week 4
Size: M
Depends on: s2-10 (the behaviour stream and B1)

## Context

Read first, in this order:

- `docs/RULES.md` rule P4, "What is measured", and stage 7 with the B4 row
- `docs/PLAN.md` F5 AC1 to AC3
- `packages/core/src/run.ts` — `DiceRule`, which already holds B4, and the roll audit
- `packages/core/src/measurement.ts` — `targetPx`, the clickable area, against `bbox`
- `packages/agent/src/` after s2-10 — acting at a point, the cursor and the behaviour stream

## Goal

A click on a target smaller than the persona's motor limit misses with a probability from the effective-width model, rolled and logged, and lands on the nearest neighbour, as RULES' B4 row says, so a motor persona fails small targets with its hand and not only with its eyes.

## Interface

- In: the clicked element's `targetPx` and `bbox`, the shown elements around it, the persona's motor limit, the behaviour stream
- Out: the performed action, a click on the neighbour's ref, and the B4 roll with its `p`
- Files expected to change: `packages/agent/src/**`; `docs/RULES.md` for B4's formula, its source and how it shares target size with P4, which takes the filter contract's two approvals; `packages/core/src/profile.ts` and the persona fixtures only if the motor limit becomes its own knob

## Constraints

- RULES B4: "for targets smaller than the persona's motor threshold, with probability from the effective-width model the click lands on the nearest neighbour", sourced to ISO 9241-9 and MacKenzie 1992. The formula for `p`, from the target's size and the persona's limit, and its source, go into the B4 row before the code.
- Decide first, in the spec. P4 already removes a target below `perception.targetPx` (a hard cut) or degrades it in its band, so with today's personas B4 could only fire on a degraded target. Seeing a target and hitting it are two capabilities. The options:
  - B4 only in P4's band;
  - a separate motor limit in `Behaviour`, with P4 kept for seeing;
  - P4 moved out of perception into B4 for motor personas.

  The choice changes RULES, and maybe `Profile`, and the spec says why.
- Whatever the spec picks, Vera's hard P4 cut keeps closing the entrances to routes B and C (`s1-04`): that is what leaves the contrast sweep on Vera with one route. If the choice would turn that cut into a miss probability for her, the spec says how the sweep keeps one route before the code changes anything.
- The dice follow RULES stage 7: one roll per click on a small target, `p` from the model, logged fired or not. A target at or above the limit rolls nothing.
- Where a miss lands is fixed by geometry once the roll fires, never by a second random draw, so a seed reproduces it. The spec defines "nearest" (from the click point, over shown elements).
- The video shows what happened: the cursor goes to the point the click actually lands (F5 AC7).
- Claim less: a B4 miss is a hypothesis from a model with a source, and the report never presents it as a measured miss.

## Acceptance

- [ ] `pnpm --filter @wayford/agent test` passes
- [ ] A unit test pins `p` for a few pairs of target size and motor limit, against values worked out by hand from the formula in RULES
- [ ] With a roll forced below `p`, a click on a small target performs a click on its nearest neighbour, and the roll is stored as fired with its `p`
- [ ] With a roll forced above `p`, the click lands on the target
- [ ] A target at or above the limit rolls nothing
- [ ] Same seed and answers twice: identical rolls and performed actions on every step (F5 AC1)
- [ ] In the `webm` of a real run where B4 fired, the cursor clicks the neighbour (PR)
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Movement time (s2-09). Tremor, overshoot or any other cursor path animation. Misses on keys or scrolls.

## Notes for the reviewer

- Read the RULES change first: the formula, its source, and how P4 and B4 now divide target size between them.
- A miss onto a link that navigates leaves the run on another page. Check that the success condition is read off the page reached, not the one aimed at.
