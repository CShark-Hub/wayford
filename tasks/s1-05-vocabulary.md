# s1-05 — Filter: vocabulary (K2)

Stream: s1
Milestone: week 4
Size: M
Depends on: s1-03, s1-04

## Context

Read first, in this order:

- `AGENTS.md` sections "Persona is a filter, not a prompt" and "Provenance on every threshold"
- `docs/RULES.md` stage 4 (K2) and "Several rules"
- `packages/filter/src/perceive.ts` after s1-03 — the knowledge stage and how K1 renames
- `packages/core/src/observation.ts` — `ElementDecision`, `renamedName`, `toActorObservation`
- `packages/target-app/settings/data.html` after s1-04 — route C and its "Fulfilment ledger" link

## Goal

`perceive` masks a jargon term the persona does not know as `[unfamiliar term]`, so Kai reads "Fulfilment ledger" without the words that would tell a shopper what it holds, while Ada reads it whole.

## Interface

- In: `PageMeasurement`, `Profile` and `Seed` from `@wayford/core`, plus the target app's jargon list
- Out: `perceive` with K2; a K2 decision in the evidence; the jargon list as a data file
- Files expected to change: `packages/filter/src/**`, `packages/core/src/observation.ts` and its test, `docs/RULES.md` stage 4, the jargon list's file

## Constraints

- Deterministic, no dice: "the persona either knows a pattern or does not" (`docs/RULES.md`, stage 4). The same holds for a word.
- K2 applies only when the profile sets `domainVocabulary`, as K1 reads only `unknownPatterns`. Every mask then points to one entry of the jargon list and to its absence from the persona's vocabulary, both of which the report can cite.
- The jargon list is per target app, provenance `folk`, and stays a data file. `perceive` reads no file and stays browser-safe, since the preview runs it. Where the list lives and how it reaches `perceive` (an option of `perceive`, a field of `Task`, the run's config) is this task's decision. A `Task` field changes a core contract, and the PR says so.
- Matching: the jargon list holds terms, each a word or a phrase, matched whole and case-insensitive. A term is known when `domainVocabulary` holds it, or holds every word of it. Each unknown term found in a name becomes one `[unfamiliar term]`, a word inside a masked phrase is not masked again, and the rest of the name stays. "Fulfilment ledger" is listed as one phrase.
- K2 renames through `renamedName`, so the element reads its replacement whole, never as "partly legible", and its state stays what perception decided (`docs/RULES.md`, "Several rules"). When K1 or K4 also renames the element, one of them wins. Decide which and write the order into `docs/RULES.md` stage 4.
- The vocabulary reaches the Actor only through the observation, never through the prompt template (F5 AC6, issue #19).
- `@wayford/filter/perceive` stays browser-safe and under 5 ms per call on `measurementFixture`.

## Acceptance

- [ ] `pnpm --filter @wayford/filter test` passes and includes `vocabulary.test.ts`
- [ ] On the collected measurement of `/settings/data`: Kai's Actor text shows "Fulfilment ledger" as `[unfamiliar term]`; Ada, with no `domainVocabulary`, reads it whole; a profile whose vocabulary holds both words reads it whole
- [ ] Kai's evidence on that element carries a K2 decision that names the masked terms, `renamedName` is set, and its state is unchanged
- [ ] Same measurement, profile and run seed twice give string-equal Actor text for all five persona fixtures
- [ ] The Actor prompt template contains no vocabulary list, checked by a test
- [ ] `docs/RULES.md` stage 4 states the match rule, the order between K1, K4 and K2, and where the jargon list comes from
- [ ] `bench:perceive` still prints under 5 ms on a developer laptop, and the `./perceive` import test still passes
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- K3 readability: the "what next" slide.
- Detecting jargon automatically, or a list written by a model (that would be provenance `llm`).
- Jargon lists for sites other than the target app.

## Notes for the reviewer

- Two reviewers: the task changes `observation.ts` and `docs/RULES.md`.
- Check the list is short and defensible: every term on it is one a team member would call shop jargon, not a word picked to make Kai fail.
