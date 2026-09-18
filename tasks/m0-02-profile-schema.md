# m0-02 — Profile schema and three fixtures

Stream: m0
Milestone: week 1
Size: M
Depends on: m0-01

## Context

Read first, in this order:

- `AGENTS.md` sections "Decisions and rationale" (persona is a filter, randomness rules, provenance)
- `KONCEPCJA.md` section "Profil = wiązka zdolności, nie zawód" (the YAML example is the starting point)
- `docs/PLAN.md` F1 and assumptions A11, A12
- `docs/RULES.md` — the pipeline, the rule ids and the source registry the profile refers to

## Goal

A zod schema for `Profile` and three fixtures (Ryszard, Anna, Marek) that every other package can import, so the filter, the frontend and the database agree on what a persona is.

## Interface

- In: nothing
- Out: `Profile` schema and type, `profileFixtures` array, exported from `@wayford/core`
- Files expected to change: `packages/core/src/profile.ts`, `packages/core/src/fixtures/profiles/*.yaml`, `packages/core/src/fixtures/index.ts`, `packages/core/src/profile.test.ts`

## Constraints

- Field names in English. The YAML in `KONCEPCJA.md` is Polish and is a sketch, not the contract.
- Three sections: `perception`, `behaviour`, `knowledge`. Plus `id`, `label`, `seed`, `device`.
- Perception thresholds: `contrast` (ratio, WCAG 2.2), `fontPx`, `targetPx`, each with `threshold` and optional `softness` in 0..1. Plus `emulation` from the CDP vision deficiency enum.
- Every threshold object carries `provenance`: a source id from the registry in `docs/RULES.md`, validated against that list, exported as a const array from `core` so the list has one home.
- Behaviour: `doubleClick`, `scrollWhenStuck`, `budgetSeconds` (RULES B1 to B3). Leave room for more via an open record, but do not add more.
- Attention and memory: `maxElements`, `maxOptions`, `memorySteps`, all optional integers (RULES A1, A3, M1).
- Perception state is three-valued in the filter (visible, degraded, invisible). The profile only carries `threshold` and `softness`; the band logic lives in `filter`.
- Knowledge: `knownPatterns`, `unknownPatterns` as string arrays, `domainVocabulary` as an optional string array.
- Schema must round-trip: parse YAML, validate, serialize, parse again, deep equal.
- `seed` is an integer.

## Acceptance

- [ ] `pnpm --filter @wayford/core test` passes and includes `profile.test.ts`
- [ ] The test validates all three fixtures and fails on a fixture missing `provenance`
- [ ] The test round-trips each fixture through YAML and asserts deep equality
- [ ] Fixtures match the three bundles in `docs/RULES.md` section "Persona composition"

## Out of scope

- Any filter logic. The schema describes thresholds, it does not apply them.
- Profile builder UI.
- Database tables.

## Notes for the reviewer

- Confirm no Polish field names leaked in.
- Confirm no energy-sector vocabulary in fixtures (see `AGENTS.md`, rejected domain context).
