# m0-02 — Profile schema and four fixtures

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
- `packages/core/src/primitives.ts` — `ProvenanceId`, `MetricName`, `Seed`, `DeviceKind`, `VisionDeficiency`, `UiPattern`, `ProfileId` already exist (from `m0-00`). Import them, do not redefine them.

## Goal

A zod schema for `Profile` and four fixtures (Ada, Milo, Vera, Zoya) that every other package can import, so the filter, the frontend and the database agree on what a persona is.

Zoya was added to the task after the first three were written: the set needed a lower boundary, a persona with every dimension switched on at once, so the boundary sweep has two ends to run between. `docs/RULES.md` carries all four bundles.

The names are a system, not decoration. The initial is the dimension the persona is defined by (all clear, mobile and motor, vision, and the far end of the scale), so alphabetical order is the order of how much filter each one switches on and `profileFixtures` needs no sorting.

## Interface

- In: nothing
- Out: `Profile` schema and type from `@wayford/core`; the `profileFixtures` array from `@wayford/core/fixtures`, which is a separate entry point because it reads the YAML from disk and a `node:fs` import in the barrel breaks the typecheck of `filter`, `agent`, `web` and `target-app`
- Files expected to change: `packages/core/src/profile.ts`, `packages/core/src/fixtures/profiles/*.yaml`, `packages/core/src/fixtures/index.ts`, `packages/core/src/profile.test.ts`, `packages/core/package.json` (the `yaml` dependency and the `./fixtures` entry point)

## Constraints

- Field names in English. The YAML in `KONCEPCJA.md` is Polish and is a sketch, not the contract.
- Three sections: `perception`, `behaviour`, `knowledge`. Plus `id`, `label`, `description`, `seed`, `device`.
- `label` is the persona's bare name, nothing else. The sentence describing the bundle lives in `description`, in English. No job title, no "able-bodied" or "impaired" wording (see `AGENTS.md`, "English only, no locales").
- Perception thresholds: `contrast` (ratio, WCAG 2.2), `fontPx`, `targetPx`, each with `threshold` and optional `softness` in 0..1. Plus `emulation` from the CDP vision deficiency enum.
- Every threshold object carries `provenance`, typed as `ProvenanceId` from `packages/core/src/primitives.ts`. That list already exists; do not redefine it.
- Behaviour: `doubleClick`, `scrollWhenStuck`, `budgetSeconds` (RULES B1 to B3). Leave room for more via an open record, but do not add more.
- Attention and memory: `maxElements`, `maxOptions`, `memorySteps`, all optional integers (RULES A1, A3, M1).
- Perception state is three-valued in the filter (visible, degraded, invisible). The profile only carries `threshold` and `softness`; the band logic lives in `filter`.
- Knowledge: `knownPatterns`, `unknownPatterns` as string arrays, `domainVocabulary` as an optional string array.
- Schema must round-trip: parse YAML, validate, serialize, parse again, deep equal.
- `seed` is an integer.

## Acceptance

- [ ] `pnpm --filter @wayford/core test` passes and includes `profile.test.ts`
- [ ] The test validates all four fixtures and fails on a fixture missing `provenance`
- [ ] The test round-trips each fixture through YAML and asserts deep equality
- [ ] Fixtures match the four bundles in `docs/RULES.md` section "Persona composition"

## Out of scope

- Any filter logic. The schema describes thresholds, it does not apply them.
- Profile builder UI.
- Database tables.

## Notes for the reviewer

- Confirm no Polish field names leaked in, and that `label` holds a name and nothing else.
- `maxElements`, `maxOptions` and `memorySteps` sit inside `behaviour`, because the profile has three sections and they had nowhere else to go. They are consumed by pipeline stages 5 and 6, not by stage 7.
- Confirm no energy-sector vocabulary in fixtures (see `AGENTS.md`, rejected domain context).
