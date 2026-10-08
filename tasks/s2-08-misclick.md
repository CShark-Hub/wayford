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
- Files expected to change: `packages/agent/src/**`; `docs/RULES.md` for B4's formula, its source and how it shares target size with P4; `packages/core/src/profile.ts` and the persona fixtures only if the motor limit becomes its own knob

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

- [x] `pnpm --filter @wayford/agent test` passes: 26 files, 490 tests
- [x] A unit test pins `p` for a few pairs of target size and motor limit, against values worked out by hand from the formula in RULES: `packages/agent/src/misclick.test.ts`, "a target of %d px under a limit of %d gives RULES' %f" ((22, 44) and (24, 48) 0.262706, (30, 44) 0.120061, (36, 44) 0.052099, (46, 48) 0.008878, (0, 48) 0.961219, to 6 places, the values of RULES' "B4 in detail" from Python's `math.erf`), and "p is RULES' series to the bit …" against RULES' "The arithmetic" run in Python
- [x] With a roll forced below `p`, a click on a small target performs a click on its nearest neighbour, and the roll is stored as fired with its `p`: `packages/agent/src/behaviour.test.ts`, "B4 fires on a draw of 0, and the click lands on the nearest control in reach"; in a run, `packages/agent/src/actor-loop.browser.test.ts`, "B4: misclick", "a roll under p clicks the neighbouring checkbox, stored fired with its p …" and "a roll under p sends the click on the ledger to Contact details …"
- [x] With a roll forced above `p`, the click lands on the target: `behaviour.test.ts`, "B4 rolls and holds on the highest draw, and the proposed click is performed as it was"; in a run, "a roll at or above p follows the ledger to the archive, and the run ends success"
- [x] A target at or above the limit rolls nothing: `behaviour.test.ts`, "a target at the limit takes no draw and rolls nothing, with a control in reach" and "… above the limit …"
- [x] Same seed and answers twice: identical rolls and performed actions on every step (F5 AC1): `actor-loop.browser.test.ts`, "a roll under p clicks the neighbouring checkbox, … and the same seed and answers twice give equal rolls and performed actions on every step (F5 AC1)", whose first run has B4 fired
- [x] In the `webm` of a real run where B4 fired, the cursor clicks the neighbour (PR): the loop on the served target app, a test profile (Ada with a motor limit of 48) on `/deliveries`, seed 35, `p` 0.008878, rolled 0.007454. The Actor clicked "Leave with a neighbour if I am out" (e12), and the press landed on "Text me on the day of delivery" (e13). The `webm` and the step screenshot are in the PR, with the cursor on the neighbour. The browser test checks the same in the step's screenshot: redder at the neighbour's action point than at the target's, which the cursor's red fill makes
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root, on the branch merged with `main` at 22a8ac1: biome clean on 444 files, typecheck exit 0, 177 files and 2886 tests passed (1 file and 3 tests skipped, as on `main`)

## Outcome

- P4 and B4 divide target size as an engineering split (`docs/RULES.md`, "P4 and B4"). The motor limit is its own knob, `behaviour.misclick`, a px threshold with its provenance and no softness. P4 is unchanged, so no route-table cell, sweep, Lens or Cast reading moves.
- No persona sets a limit yet (decided with the user at the spec). B4 works in the engine and for any profile that sets a limit. The goal's "motor persona" waits for the follow-up that moves Milo's 44 px from P4 into B4.
- `p` is the excess over the persona's miss rate at its limit: `erf(k) − erf(k · W / L)`. It is 0 at the limit, with no jump. It is floored at 0 where rounding just under the limit gives a hair below it.
- A miss lands on the nearest shown control whose box is within the limit of the aim point, a tie going to the earlier element. The press lands on that control's action point. A text block is no candidate.
- A click on a small control with no control in reach rolls nothing, which falls short of the task's "one roll per click on a small target". A miss onto empty space is a click on nothing, which an `Action` cannot carry. On the target app, the isolated small controls on the routes (the kebab, "Your data", "Order archive") roll nothing: B4 bites on crowded targets.
- RULES says what B4 gets wrong (it sends all of `p` to one neighbour; the aim point, square targets, misses onto text or empty space, no roll on a `type` or on a `doubleClick` the Actor proposes, and no miss onto a control perception or attention removed), that the limit read as an effective width is `folk`, and that a retry after a miss can be a B2 repeat.
- The review pass made `misclickOf` throw a plain `Error` on a ref that names no element of the page, as `act.ts`'s `targetOf` does: the loop checks every ref with `checkActionRef` first, so only a bug gets there, and `undefined` means only that B4 does not apply. It also cut the unit tests that repeated each other, and the `profile.test.ts` cases the spec and plan list beyond the softness one (a limit of 0 or below, a missing provenance, a misspelt key), which test zod's `positive()` and `.strict()` rather than our schema. The spec's interface sketch, acceptance mapping and plan predate these cuts.
- Follow-ups:
  - Milo's target size moved from P4 into B4, with a B4 row on the Cast and core's bundle-table test reading an object-valued knob. It needs misses onto empty space modelled first.
  - io's `provenanceOf` giving B4 its limit's provenance.
  - Run detail labelling a B4 roll as modelled.
  - The stale comment at `packages/core/src/run.ts:211`.
  - `constraintCount` counting `behaviour.misclick`: once Milo's only constraint, his target size, moves into B4, he would count 0 and the Cast would tag him `control`. Decide it with the Cast's B4 row.

## Out of scope

- Movement time (s2-09). Tremor, overshoot or any other cursor path animation. Misses on keys or scrolls.

## Notes for the reviewer

- Read the RULES change first: the formula, its source, and how P4 and B4 now divide target size between them.
- A miss onto a link that navigates leaves the run on another page. Check that the success condition is read off the page reached, not the one aimed at.
