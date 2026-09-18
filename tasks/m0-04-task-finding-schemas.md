# m0-04 — Task and Finding schemas

Stream: m0
Milestone: week 1
Size: M
Depends on: m0-01

## Context

Read first, in this order:

- `AGENTS.md` sections "A task must not contain the solution" and "Every verdict clickable through to evidence"
- `docs/PLAN.md` F3, F8, assumption A9
- `KONCEPCJA.md` section "Przykład działania"

## Goal

Zod schemas for `Task` (goal plus deterministic success condition) and `Finding` (typed, evidence-linked), with fixtures, so the Extractor, the Analyst and the report UI agree on inputs and outputs.

## Interface

- In: nothing
- Out: `Task`, `SuccessCondition`, `Finding`, `FindingType` schemas and types, `taskFixtures`, `findingFixtures`, exported from `@wayford/core`
- Files expected to change: `packages/core/src/task.ts`, `packages/core/src/finding.ts`, fixtures and tests next to them

## Constraints

- `Task`: `id`, `goal` (one sentence, the user-facing wording), `startUrl`, `success`, `sourceStory` (optional, the original user story), `strippedPaths` (optional list of path fragments the Extractor removed).
- `SuccessCondition` is a closed union: `urlMatches` (pattern), `selectorPresent` (CSS selector), `requestObserved` (method plus URL pattern). No free text.
- `Finding`: `id`, `taskId`, `type` in `measurement | deterministic | hypothesis`, `title`, `detail`, `evidence` (non-empty list of `{ runId, stepIndex }`), `recommendation`, `personaIds` affected, optional `axeRuleId`.
- `evidence` must be non-empty at the schema level. A finding without evidence must not validate.
- Fixture tasks must not contain path words. Include the banned word check in the test.

## Acceptance

- [ ] `pnpm --filter @wayford/core test` passes and includes `task.test.ts` and `finding.test.ts`
- [ ] A test proves a `Finding` with empty `evidence` fails validation
- [ ] A test proves a `Task` fixture goal contains none of: `click`, `menu`, `settings`, `->`, `→`, `tab`, `button`
- [ ] Two task fixtures exist, both aimed at the target app described in m0-06

## Out of scope

- The Extractor itself and any LLM call.
- Rendering findings.

## Notes for the reviewer

- Check the fixture goals read like a person's intent, not like a test step.
