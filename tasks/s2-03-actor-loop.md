# s2-03 — Actor loop

Stream: s2
Milestone: week 3
Size: L
Depends on: s1-02, s2-01, s2-02, issue #31 (`ActorResponse` in core), issue #19 (knowledge never goes into the Actor prompt)

## Context

Read first, in this order:

- `AGENTS.md` sections "Persona is a filter, not a prompt", "Separated LLM roles" and "Traps already identified"
- `docs/PLAN.md` F5 and F12, and `docs/RULES.md` stages 6 and 7
- `packages/core/src/run.ts` — `RunEvent`, `runResultFromEvents`, `RunResult`
- `packages/agent/src/` after s2-01 and s2-02 — `complete`, the fake adapter, the run context
- `packages/filter/src/` after s1-02 — `collect` and `perceive`

## Goal

One command runs one persona on one task with one seed against the target app: the loop observes through the filter, asks the model for one action, applies the behaviour dice, acts, records evidence, emits every `RunEvent`, and leaves a `RunResult`, a `webm` and a `trace.zip` on disk.

## Interface

- In: `Profile`, `Task`, `Seed`, a run index, the target-app parameters
- Out: `runActor(...)` from `@wayford/agent`, which emits `RunEvent`s as they happen and returns the `RunResult`; the CLI `pnpm --filter @wayford/agent run:one -- --persona prof_vera --task task_past-order --seed 7`; files under `runs/<run id>/`
- Files expected to change: `packages/agent/src/**`, `packages/agent/package.json`, new `packages/agent/prompts/`

## Constraints

- "The Actor must be our own loop" (`AGENTS.md`). Each step: `collect`, `perceive`, `toActorObservation`, `renderObservationForModel`, then the model. The model gets nothing else from the page.
- The prompt template is identical for every persona: the goal sentence, the observation, the history, the actions it may take. No persona name, trait, threshold or impairment reaches it (F5 AC6).
- M1: the history is truncated to the last `memorySteps` steps; earlier steps are replaced by a one-line count.
- The model answers with `ActorResponse`. A ref the observation does not contain is a typed failure: one retry carrying the error, then the step counts as wasted. Never a Playwright crash.
- Acting: the cursor moves to the element's box first and the action lands at that point, so what the persona clicked is what the video shows.
- Behaviour, per `docs/RULES.md` stage 7 and assumption A12: B1 double click from `rng(run seed)`, B3 budget from `budgetSeconds` ending `budget_exceeded` (wall-clock, read from an injectable clock so tests never wait; the run records its elapsed time, since B3 is the one rule a seed does not reproduce), a `giveUp` ending `gave_up`, and a step cap from config. Every roll is stored as the run record allows. B2 and B4 are out of scope.
- Success is checked against the task's `SuccessCondition` after every action, deterministically, never by asking the model.
- Every event passes the `RunEvent` schema, and the `RunResult` written is `runResultFromEvents` of the events emitted. A crash ends with `runFailed` and the partial step stored.
- The run seed drives perception and dice (`docs/PLAN.md` A20). The temperature and provider seed sent are stored on the run where the schema has room for them.

## Acceptance

- [ ] `pnpm --filter @wayford/agent test` passes with a scripted fake adapter and no network
- [ ] With a fake that walks Home, Your account, Delivery address, Ada ends `success` on the easy goal after two actions
- [ ] Same persona, seed and fake script twice: every step's `actorObservationText` is string-equal
- [ ] With a hard contrast cut of 3.0, no step's `actorObservationText` contains "Order archive"
- [ ] With a fake clock, a fake that never reaches the goal ends `budget_exceeded` when the clock passes the budget, without the test waiting; one that answers `giveUp` ends `gave_up`; one that throws ends `runFailed` with the partial step stored
- [ ] A fake answering a ref the observation lacks gets one retry and the run does not crash
- [ ] A test shows a click becomes `doubleClick` exactly when `rolled < p`, and the roll is stored
- [ ] A test renders the first prompt for all four persona fixtures on the same observation and shows the four are identical and contain no persona name and none of "impaired", "disabled", "blind", "vision", "contrast"
- [ ] `runs/<run id>/result.json` validates as `RunResult` and deep-equals `runResultFromEvents` of the emitted events; the `webm` and the `trace.zip` exist
- [ ] With a real key, `run:one` for Ada on the easy goal ends `success` (output and cost in the PR)
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Scout (s2-04), storing runs in the database and HTTP (s4-03), the Analyst (week 4).
- Knowledge and attention stages: s1-03 adds them inside `perceive`, and the loop only calls `perceive`.
- B2 `scrollWhenStuck` and B4 misclick. Live video (cut in `m0-08`).

## Notes for the reviewer

- Read the prompt template first. Any line that differs between personas is a bug.
- Watch the `webm` of the real run: the cursor before every click and no other overlay of ours.
