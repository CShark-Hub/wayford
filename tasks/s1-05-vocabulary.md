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

- [x] `pnpm --filter @wayford/filter test` passes and includes `vocabulary.test.ts` 12 files, 261 tests. `vocabulary.test.ts` covers the match rule: whole-term and case-insensitive; known through the phrase or every word; no second mask inside a masked phrase; the rest of the name kept; `terms` in first-occurrence order in the list's spelling; blank terms ignored.
- [x] On the collected measurement of `/settings/data`: Kai's Actor text shows "Fulfilment ledger" as `[unfamiliar term]`; Ada, with no `domainVocabulary`, reads it whole; a profile whose vocabulary holds both words reads it whole `target-app-routes.browser.test.ts` "K2: Kai reads the ledger as [unfamiliar term], Ada and a full vocabulary read it whole", with the list passed as `perceive`'s new `options.jargon`.
- [x] Kai's evidence on that element carries a K2 decision that names the masked terms, `renamedName` is set, and its state is unchanged "K2 is recorded with its terms and leaves the state alone": `{ stage: "knowledge", rule: "K2", terms: ["Fulfilment ledger"] }`, `renamedName` `[unfamiliar term]`, state as without the list. `routes.browser.test.ts` "Kai's route C stays open: K2 renames its final link and cuts nothing".
- [x] Same measurement, profile and run seed twice give string-equal Actor text for all five persona fixtures "five personas, seeds 1 to 100, the same Actor text twice on /settings/data"; the existing `/deliveries` determinism test still passes.
- [x] The Actor prompt template contains no vocabulary list, checked by a test `llm-actor.test.ts` "the templates hold no vocabulary word and no jargon term": names blanked, whole-word and case-insensitive, over every fixture's `domainVocabulary` and the jargon list. The F5 AC6 test still sends Kai's and Ada's first requests identical.
- [x] `docs/RULES.md` stage 4 states the match rule, the order between K1, K4 and K2, and where the jargon list comes from Stage 4's "Vocabulary (K2)" and "The jargon list" paragraphs and the K2 row; "Several rules" adds K2 and its known understatement; Kai's route C cell is now a fact.
- [x] `bench:perceive` still prints under 5 ms on a developer laptop, and the `./perceive` import test still passes `perceive on measurementFixture: 100 calls, average 0.017 ms (budget 5 ms, within), 1054 elements shown`; `perceive-imports.test.ts` passes, since `vocabulary.ts` imports nothing.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root 102 files, 1545 tests, rebased on `main` with #158 (s2-06) at `14f126f`. `bench:perceive` averages 0.021 ms.

## Outcome

Built as `docs/specs/2026-10-05-s1-05-vocabulary.md` says. Its decision log has every choice, the ones taken during the build marked "(build)". What a reader of this file should know:

- **Where the list lives.** `packages/core/src/fixtures/jargon.json` holds the target app's jargon list, provenance `folk`, one term: "Fulfilment ledger". It reaches `perceive` as a fourth argument, `{ jargon }`, so `perceive` reads no file and stays browser-safe.
  - Core exports `JargonList`, the schema both loaders use, and `targetAppJargon`.
  - Web bundles the same file as `bundledJargon`.
  - No `Task` field: the list is per target app, and the preview and route table call `perceive` with no task.
- **The core contract change.** `KnowledgeDecision` now accepts K2, with `terms`, the jargon-list entries it masked. K1/K4 win the name (the bare role) and K2 is still recorded, listed K1, K2, K4. Core also exports `wholeTerm`, now shared by the filter and the agent test.
- **The matcher.** `vocabularyMatcher` in `packages/filter/src/vocabulary.ts` builds one regex per `perceive` call and owns every check on whether K2 fires. It takes 0.22 ms per call on a synthetic 300-element page with 30 terms.
- **Every place that perceives passes the list:**
  - the preview and the route table;
  - real runs, through a required `RunActorOptions.jargon`, so typecheck finds a forgotten caller;
  - io's runs, through `server.ts` and the runner;
  - `run:one`, calibration and Scout. Scout's profile sets no vocabulary, so K2 stays off there.
- **Files outside the expected list:**
  - in web: the bundled list, the preview, and the replay line `K2 Fulfilment ledger`;
  - in agent: `actor-loop.ts` and every `runActor` caller, plus the template test;
  - in io: the runner and `server.ts`;
  - core's `jargon.ts`, `fixtures/index.ts` and `task.ts`;
  - the filter scripts;
  - RULES outside stage 4.
- **Known understatement**, stated in RULES: a degraded element that K2 renames reads its replacement whole. When the term is only part of the name, the other words would reach the model unmasked. No fixture reaches that case today.

## Out of scope

- K3 readability: the "what next" slide.
- Detecting jargon automatically, or a list written by a model (that would be provenance `llm`).
- Jargon lists for sites other than the target app.

## Notes for the reviewer

- Two reviewers: the task changes `observation.ts` and `docs/RULES.md`.
- Check the list is short and defensible: every term on it is one a team member would call shop jargon, not a word picked to make Kai fail.
