# s2-10 — Actor loop: memory, behaviour dice and budget

Stream: s2
Milestone: week 3
Size: M
Depends on: s2-03

## Context

Read first, in this order:

- `AGENTS.md` sections "Randomness follows three different rules" and "Traps already identified"
- `docs/PLAN.md` F5 AC1, AC2 and AC5, and assumption A20
- `docs/RULES.md` stage 6 (M1) and stage 7 (B1, B3)
- `packages/agent/src/` after s2-03 — `runActor` and the one function that renders the history
- `packages/core/src/run.ts` — how a step stores its rolls, and `actorSampling`

## Goal

The loop truncates the Actor's history to the persona's memory, rolls the behaviour dice from the run seed, ends a run on its budget and sends the provider seed, so personas differ in memory and dice as `docs/RULES.md` says, and a stored run replays its rolls.

## Interface

- In: `runActor` from s2-03
- Out: the same `runActor`, with M1, B1, B3 and the provider seed
- Files expected to change: `packages/agent/src/**`

## Constraints

- M1: the history is truncated to the last `memorySteps` steps, and the earlier steps are replaced by a one-line count. Absent means unlimited. The truncation happens inside the history function s2-03 wrote, so every backend gets the same one, and the names in it stay the ones the Actor read.
- B1, per `docs/RULES.md` stage 7: a click becomes `doubleClick` when `rolled < p`. Each `rolled` is the next draw of one behaviour stream from `rng(run seed)`, never the profile seed (A20). Every roll is stored as `{ rule, p, rolled, fired }`. A wasted step rolls nothing.
- B3: `budgetSeconds` ends the run `budget_exceeded`. Wall-clock, read from an injectable clock so tests never wait. The run records its elapsed time, since B3 is the one rule a seed does not reproduce.
- The provider seed passed to every `complete` call of the run is `Math.floor(hash(run seed, "provider-seed") * 2 ** 31)`, a 31-bit integer, since some providers type `seed` as a signed 32-bit one. `runStarted` carries it with the actor's temperature as `actorSampling`, and `runResultFromEvents` copies that to the `RunResult`.

## Acceptance

- [ ] `pnpm --filter @wayford/agent test` passes with a scripted fake adapter and no network
- [ ] With `memorySteps` 2, the prompt at step 4 holds steps 2 and 3 and one line counting the earlier ones; Ada, with no `memorySteps`, holds every earlier step
- [ ] Vera, one task, one run seed and the same fake Actor answers, twice: every step's `actorObservationText` and every B1 roll are equal (F5 AC1)
- [ ] With only `profile.seed` changed, every B1 roll and every call's provider seed are equal (A20)
- [ ] A click becomes `doubleClick` exactly when `rolled < p`, and the roll is stored; a wasted step uses up no roll
- [ ] Every call of a fake run receives the same provider seed, the `RunResult`'s `actorSampling` holds it with the configured temperature, and seeds 1 and 2 send different provider seeds
- [ ] With a fake clock, a fake that never reaches the goal ends `budget_exceeded` when the clock passes the budget, without the test waiting, and the run records its elapsed time
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- B2 `scrollWhenStuck`, B4 misclick and simulated time: week 4 stretch.
- The Jev backend (s2-06).

## Notes for the reviewer

- The behaviour dice are one stream, so a roll depends on how many came before. The F5 AC1 box feeds the same Actor answers again and the dice roll again; feeding the performed actions back instead would skip the roll behind every `doubleClick` the dice made and shift every roll after it.
- Read a truncated prompt for Kai: the count line must not name what was dropped.
