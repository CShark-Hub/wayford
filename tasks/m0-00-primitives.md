# m0-00 — Shared primitives

Stream: m0
Milestone: week 1
Size: S
Depends on: m0-01

## Context

Read first, in this order:

- `docs/RULES.md` — the source registry and the rule ids are transcribed from it
- `docs/CONVENTIONS.md` — naming, the barrel rule
- `docs/PLAN.md` section "Contracts frozen in M0"

## Goal

One file holding every name that two or more of `m0-02`, `m0-03`, `m0-04` would otherwise each invent, so those three tasks can be written in parallel without agreeing on anything.

## Interface

- In: nothing
- Out: `packages/core/src/primitives.ts` exporting provenance ids, rule ids, pipeline stages, metric names, perception states, contrast and probability and seed, geometry, device and vision-deficiency enums, interface patterns, prefixed id schemas
- Files expected to change: `packages/core/src/primitives.ts`, `packages/core/src/primitives.test.ts`, `packages/core/src/index.ts`

## Constraints

- Nothing in this file makes a design decision. Every list is a transcription of `docs/RULES.md`.
- A test parses `docs/RULES.md` and fails if the document and the code disagree. This is the point of the task: the registry cannot drift.
- No dependencies beyond zod.

## Acceptance

- [x] `pnpm --filter @wayford/core test` passes and includes `primitives.test.ts` — 15 tests in `primitives.test.ts`
- [x] A test compares `PROVENANCE_IDS` against the registry table in `docs/RULES.md` and fails on a mismatch — `every id in the registry table of docs/RULES.md is in PROVENANCE_IDS`, which parses the table out of the document
- [x] A test compares `RULE_IDS` against the rule tables in `docs/RULES.md` and fails on a mismatch — `every rule id in docs/RULES.md is in RULE_IDS`
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

Merged in PR #5.

## Out of scope

- `Profile`, `Observation`, `Action`, `Task`, `Finding`. This task defines their vocabulary, not them.
- Any filter logic.

## Notes for the reviewer

- If a name here belongs to exactly one later schema, it does not belong here. Send it back.
