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

- [x] `pnpm --filter @wayford/agent test` passes with a scripted fake adapter and no network 18 files, 334 tests. The loop boxes run in `actor-loop.browser.test.ts` on the served target app with `llmActor` on `fakeLlm`, and global `fetch` throws from the moment the app is up. The B1 boundaries run in `behaviour.test.ts` on a scripted draw.
- [x] With `memorySteps` 2, the prompt at step 4 holds steps 2 and 3 and one line counting the earlier ones; Ada, with no `memorySteps`, holds every earlier step "Kai's prompt at step 4 holds steps 2 and 3 after a count line, Ada's every step": cap 5, clicking "Your account" on `/`, "Deliveries" on `/account`, "Home" on `/deliveries`, then scroll and give up. The history of Kai's fifth request is exactly `- 2 earlier steps not shown.` followed by the lines of steps 2 and 3, with neither "Your account" nor `/account` in it. Ada's holds all four lines and no count line. Unit half: `history.test.ts`, `describe("memorySteps (M1)")`, which covers one dropped step, absent or ≥ the step count, a wasted step counting, and a count line that names nothing. Every loop run also checks its first requests against the rebuild with the persona's `memorySteps`.
- [x] Vera, one task, one run seed and the same fake Actor answers, twice: every step's `actorObservationText` and every B1 roll are equal (F5 AC1) "Vera reads the same text on one run seed, and a changed profile seed changes no text and no roll (F5 AC1, A20)": runs A and B, run seed 7, clicking Deliveries, then Home, then give up. Every `actorObservationText` and every step's `dice` are equal. Not vacuous: both clicks rolled B1.
- [x] With only `profile.seed` changed, every B1 roll and every call's provider seed are equal (A20) The same test, run C with `profile.seed` + 1. Its dice equal run A's, and every call's `seed` equals run A's, which is `providerSeedFor(7)`.
- [x] A click becomes `doubleClick` exactly when `rolled < p`, and the roll is stored; a wasted step uses up no roll `behaviour.test.ts`: p 0.5 does not fire on a draw of exactly 0.5, and fires on the largest double under it. p 0 never fires, p 1 always does, and every roll passes core's `DiceRoll`. A non-click, or a profile with no `doubleClick`, takes no draw. In the loop, "B1 draws the behaviour stream in order, and a wasted step draws nothing": Ada with `doubleClick` set between `rng(7)`'s first two draws runs a wasted step, a click, a scroll, a click and a give-up. The stored dice are `[none, [B1 on r1], [], [B1 on r2], []]`. The fired click is performed as `doubleClick` on the proposed ref, the unfired one as the click itself, and both land where their links go.
- [x] Every call of a fake run receives the same provider seed, the `RunResult`'s `actorSampling` holds it with the configured temperature, and seeds 1 and 2 send different provider seeds Every loop run checks it: `walk` in `actor-loop.browser.test.ts` asserts that each call the fake receives, retries included, carries `providerSeedFor(run seed)`, and that the `RunResult`'s `actorSampling` is `{ temperature: <configured actor temperature>, providerSeed }`. That covers every run in the file, on seeds 1, 7 and others. Unit: `llm-actor.test.ts` (every answer, the retry's too, sends the factory's seed; `sampling` holds the configured temperature) and `actor-backend.test.ts` (`Sampling` takes the provider seed at both ends of `Seed`; `providerSeedFor(7)` pinned at 935629358 and recomputed independently in review; seeds 1 and 2 differ).
- [x] With a fake clock, a fake that never reaches the goal ends `budget_exceeded` when the clock passes the budget, without the test waiting, and the run records its elapsed time `describe("the budget ends a run on its clock (B3)")`. Each answer moves a fake clock 40 s, on Ada (120 s) with a cap of 20. With clicks, the run ends `budget_exceeded` with steps 0 to 2 complete: step 2 was answered at exactly 120 s, still within the budget. Step 3 was answered at 160 s, so it is planned (`proposedAction`, no `urlAfter`) and never performed, and only `runFinished` follows its `actionPlanned`. `durationMs` is 160 000. With only missing refs, two wasted steps end it at 160 s. Neither test waits. Changing `>` to `>=` turns the first test red.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root Lint: 225 files, no fixes. Typecheck: clean in every package. Test: 81 files, 1298 tests, on Linux, after the review fixes; 85 files, 1314 tests after merging `main` with Scout (#152), whose `llmActor` role now sends the provider seed too.

## Out of scope

- B2 `scrollWhenStuck`, B4 misclick and simulated time: week 4 stretch.
- The Jev backend (s2-06).

## Notes for the reviewer

- The behaviour dice are one stream, so a roll depends on how many came before. The F5 AC1 box feeds the same Actor answers again and the dice roll again; feeding the performed actions back instead would skip the roll behind every `doubleClick` the dice made and shift every roll after it.
- Read a truncated prompt for Kai: the count line must not name what was dropped.

## Outcome

Built as `docs/specs/2026-10-03-s2-10-memory-dice-budget.md` says; its decision log has every choice. What a reader of this file should know:

- **Stage 7 lives in `behaviour.ts`.** `behave(proposed, behaviour, draw)` is pure. B1 rolls on a proposed click whenever the profile sets `doubleClick`, 0 included. The loop makes one stream per run, `rng(run seed)`, so s2-07 and s2-08 add B2 and B4 to `behave` in RULES' table order and the stream stays one. A run ends `gave_up` only on a performed `giveUp`.
- **M1's count line** is `- N earlier steps not shown.`, the observation's own register for A1. It comes first and names nothing that was dropped. A wasted step counts as a step.
- **B3 reads the clock twice.** Once right after `actionPlanned`: an answer that comes past the budget is planned and never performed, so no `success` is recorded past it. The step stays the run's last, incomplete one, which `calibration.ts`'s `endOf` already sorts as the clock. The clock is read again at the end of every step, with the cap, so a run of wasted steps also ends on it. Nothing in flight is cut. `RunActorOptions.now` drives every timestamp and `durationMs` too, so a fake-clock record stays consistent. Which limit ended a run is logged at `info`; core has no field for it.
- **The seam.** The backend factory gets `{ logger, providerSeed }`, and `ActorBackend.sampling` (required, `Sampling | undefined`) becomes `runStarted.actorSampling`. `calibration-run.ts`'s timing wrapper now forwards it; it would otherwise have dropped `actorSampling` from every calibration run.
- **A bad run seed** now rejects with `invalid_run_input` before `runStarted` is built, since the provider seed is drawn from it first.
- **Follow-ups.**
  - `docs/RULES.md` stage 7 says "`s2-03` builds that stream"; `s2-10` built it. A one-word fix, held for the next PR that touches RULES, since RULES takes two approvals.
  - PR #152 (Scout) changes `llmActor`'s factory body to take a `role`. Whichever merges second resolves a small conflict there.
  - The budget counts from `runStarted`, so opening the context, settling and screenshots count against `budgetSeconds` along with model latency. That was chosen so the budget and `durationMs` are one number. On the s2-11 calibration a run took under 10 s of Ada's 120, so this has no effect yet. s2-09's simulated clock replaces it.
  - `llmActor` builds `sampling` from the settings with the adapter's `samplingOf`, before any call. The adapter returns the same value on every `Completion`. A per-run `Llm` that reports its own sampling would leave one source; that is a change to `llm.ts` and the fake.
  - Core could record which limit ended a `budget_exceeded` run on `runFinished`. Today the log names it, and `endOf` infers it from the record.
