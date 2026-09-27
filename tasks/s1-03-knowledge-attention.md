# s1-03 — Filter: knowledge and attention stages

Stream: s1
Milestone: week 4, stretch (moved from week 3 in `m0-08`: on the target app K1 never fires for a desktop persona, so the demo does not need it)
Size: L
Depends on: s1-01, s1-02, issue #36 (how K1 and K4 treat a pattern in neither list)

## Context

Read first, in this order:

- `AGENTS.md` section "Persona is a filter, not a prompt"
- `docs/RULES.md` stages 4 and 5 (knowledge, attention) and section "Thresholds, bands and the roll"
- `packages/filter/src/` after s1-02 — `collect` and `perceive`
- `packages/core/src/measurement.ts` and `packages/core/src/observation.ts`
- `packages/target-app/index.html` and `packages/target-app/src/main.ts` — the mobile menu, the app's only hamburger

## Goal

`perceive` applies the knowledge rules K1 and K4 and the attention rules A1 and A3, so a persona that does not know a pattern reads a bare role, and a persona with little attention sees the most salient elements first and only as many as it can hold.

## Interface

- In: `PageMeasurement`, `Profile` and `Seed` from `@wayford/core`
- Out: `perceive` extended with stages 4 and 5; `PageMeasurement` extended with what pattern detection needs to read (for example whether a control is icon-only or opens a popup), and `collect` filling it
- Files expected to change: `packages/filter/src/**`, `packages/core/src/measurement.ts`, its test and `fixtures/measurement.json`, `docs/RULES.md` (the salience formula)

## Constraints

- Deterministic, no dice: "the persona either knows a pattern or does not" (`docs/RULES.md`, stage 4).
- Pattern detection is heuristics on role, name, position and the measured attributes. Each heuristic is a pure function with a test on a target-app page where it fires and one where it must not. Wrong detection is a bug, not a finding.
- K1 and K4: a renamed element reads its bare role, in the field the fix for issue #16 gives `ObservedElement`, never as "partly legible". Its state stays what perception decided.
- A1: salience order from size, contrast and position, written into `docs/RULES.md` stage 5 as a formula before the code implements it; then truncation to `maxElements`. Cut elements stay in the evidence as `invisible` with an A1 decision and are counted in `hiddenCount`.
- A3: in a list or menu with more than `maxOptions` entries, only the first `maxOptions` pass and the rest are counted.
- Stages run in the pipeline order of `docs/RULES.md`: viewport, perception, knowledge, attention.
- Monotone: a smaller `maxElements` or `maxOptions` never shows more elements.
- `@wayford/filter/perceive` stays browser-safe and under 5 ms per call on `measurementFixture`.

## Acceptance

- [ ] `pnpm --filter @wayford/filter test` passes and includes `knowledge.test.ts` and `attention.test.ts`
- [ ] On the target app at a mobile viewport, a profile with `hamburger` in `unknownPatterns` reads the menu toggle as its bare role, and Milo, who knows the pattern, reads "Menu"
- [ ] Every pattern detector has a test on a page where it fires and one where it must not
- [ ] Vera (`maxElements` 12) on `/deliveries`: at most 12 shown elements, and `hiddenCount` equals the number of elements in the evidence with an A1 decision
- [ ] Same profile and run seed twice give string-equal Actor text with the new stages on, for all four persona fixtures
- [ ] Lowering `maxElements` from 20 to 1 in steps of 1 never adds an element to the shown set
- [ ] `bench:perceive` still prints under 5 ms on a developer laptop, and the `./perceive` import test still passes
- [ ] `docs/RULES.md` stage 5 states the salience formula the code implements
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- K2 vocabulary and K3 readability. Week 4 or the "what next" slide (issue #19).
- M1 memory: it truncates the Actor's history, so it belongs to s2-03.
- Behaviour dice, and preview sliders for the new caps.

## Notes for the reviewer

- Two reviewers: the task changes the filter contract and `docs/RULES.md`.
- Look at the five elements Zoya (`maxElements` 5) sees first on the home page. If they make no sense to a person, the salience formula is wrong, not the persona.
