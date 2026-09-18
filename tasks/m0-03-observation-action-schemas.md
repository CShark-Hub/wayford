# m0-03 — Observation and Action schemas (the filter contract)

Stream: m0
Milestone: week 1
Size: L
Depends on: m0-01

## Context

Read first, in this order:

- `AGENTS.md` section "Persona is a filter, not a prompt" and "Traps already identified"
- `docs/PLAN.md` sections "Filter internals" and "Contracts frozen in M0", assumption A16
- `docs/RULES.md` — three perception states, salience ordering, "N more below" counts
- `KONCEPCJA.md` section "Architektura"
- `packages/core/src/primitives.ts` — `Bbox`, `Viewport`, `MetricName`, `PerceptionState`, `RuleId` already exist (from `m0-00`). Import them, do not redefine them.

## Goal

Two zod schemas that define the boundary between the perception filter and the Actor: what the Actor may see (`Observation`) and what it may do (`Action`), with one fixture each, so stream 1 and stream 2 can work without talking to each other.

## Interface

- In: nothing
- Out: `Observation`, `ObservedElement`, `Action` schemas and types, `observationFixture`, `actionFixtures`, exported from `@wayford/core`
- Files expected to change: `packages/core/src/observation.ts`, `packages/core/src/action.ts`, `packages/core/src/fixtures/observation.json`, `packages/core/src/fixtures/actions.json`, tests next to each

## Constraints

- `Observation` is text-first: a list of `ObservedElement` plus `url`, `title`, `stepIndex`, `viewport`. Screenshot is an optional path, off by default.
- `ObservedElement` has: `ref` (short stable id the model uses to point at things), `key` (stable structural key used by the filter, derived from role, name and path, never DOM index), `role`, `name`, `bbox`, `metrics` (`contrast`, `fontPx`, `targetPx`), `state` (`visible | degraded | invisible`, the filter decision), `decision` (which rule id decided, the metric value, the threshold, and the rolled value if softness applied), `maskedName` when degraded.
- `Observation` also carries `hiddenCount` and `belowFoldCount` so the Actor knows something exists without knowing what (RULES V2, A1).
- The filter emits only elements with state `visible` or `degraded` to the Actor. The full list including hidden ones is kept for evidence. Model this as two exports or a flag, but the type the Actor receives must not carry hidden elements.
- `Action` is a closed union: `click`, `doubleClick`, `type`, `scroll`, `back`, `wait`, `giveUp`. Each with the minimal payload. `click` and `type` point at a `ref`.
- Include a `renderObservationForModel(observation): string` helper that produces the exact text the Actor sees. This is what the seed test compares.
- No persona or impairment words anywhere in the rendered text. Add a test that greps for a banned list.

## Acceptance

- [ ] `pnpm --filter @wayford/core test` passes and includes `observation.test.ts` and `action.test.ts`
- [ ] Fixture observation validates and `renderObservationForModel` output is snapshot-tested
- [ ] A test proves that an element with `visible: false` cannot appear in the Actor-facing type (type-level or runtime, both accepted)
- [ ] A test proves the banned word list is absent from the rendered text

## Out of scope

- Computing metrics. That is stream 1.
- Calling any model.
- `RunEvent` and `RunResult` (m0-05).

## Notes for the reviewer

- This is the most important file in the project. Reject anything that lets the Actor learn what was removed.
- Check that `key` is stable by construction and documented in a comment.
