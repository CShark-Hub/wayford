# m0-05 — RunEvent and RunResult schemas

Stream: m0
Milestone: week 1
Size: M
Depends on: m0-03

## Context

Read first, in this order:

- `docs/PLAN.md` F5, F6, F7, F12 and section "Architecture"
- `packages/core/src/observation.ts` and `packages/core/src/action.ts` after m0-03 merges
- `AGENTS.md` section "Randomness follows three different rules"

## Goal

A zod schema for the live stream (`RunEvent`) and for the stored result (`RunResult`), with fixtures, so the ring, the dashboard replay and the Analyst consume the same shape.

## Interface

- In: `Observation`, `Action` from `@wayford/core`
- Out: `RunEvent`, `RunStep`, `RunResult`, `RunOutcome` schemas and types, `runResultFixture`, `runEventFixtures`, exported from `@wayford/core`
- Files expected to change: `packages/core/src/run.ts`, fixtures and tests next to it

## Constraints

- `RunEvent` is a closed union keyed by `type`: `runStarted`, `stepObserved` (carries the Actor-facing observation), `actionPlanned` (carries the action and the dice roll if any), `actionPerformed` (carries url after, screenshot path), `narration` (free text from the model, labelled as such), `runFinished` (outcome, duration), `runFailed` (error, distinct from `gave_up`). Every event has `runId`, `stepIndex`, `timestamp`.
- `RunOutcome`: `success | gave_up | budget_exceeded | error`.
- `RunStep` is the stored per-step record: full observation including hidden elements (for evidence), Actor-facing observation text, action, dice roll, narration, screenshot path, url before and after.
- `RunResult`: `id`, `taskId`, `profileId`, `seed`, `runIndex`, `steps`, `outcome`, `durationMs`, `videoPath`, `tracePath`, `cost` (tokens in, tokens out, USD), `modelIds` per role.
- Fixture `RunResult` has at least four steps and ends in `gave_up`. Fixture events describe the same run.

## Acceptance

- [x] `pnpm --filter @wayford/core test` passes and includes `run.test.ts` — 96 tests across 5 files pass
- [x] A test replays fixture events into a reducer and obtains a `RunResult` equal to the fixture result — `runResultFromEvents(runEventFixtures)` deep-equals `runResultFixture`
- [x] Fixture serializes to JSON under 200 KB — `run-result.json` is ~11.5 KB

## Out of scope

- SSE transport, database tables, Playwright.

## Notes for the reviewer

- The reducer from events to result is the contract the ring and the dashboard depend on. Keep it pure and in `core`.
