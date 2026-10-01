# s1-03 — Filter: knowledge and attention stages

Stream: s1
Milestone: week 3 (moved back from the week 4 stretch on 2026-10-01: with `s1-04` the target app has a desktop kebab and a crowded page, so K1, K4 and A1 close routes in the demo)
Size: L
Depends on: s1-01, s1-02, s1-04 (the kebab's markup, Vera's cap of 20 and the route table in RULES), issue #124 (a nav list item measured beside its own link would spend two attention slots on one name)

## Context

Read first, in this order:

- `AGENTS.md` section "Persona is a filter, not a prompt"
- `docs/RULES.md` stages 4 and 5 (knowledge, attention) and section "Thresholds, bands and the roll"
- `packages/filter/src/` after s1-02 — `collect` and `perceive`
- `packages/core/src/measurement.ts` and `packages/core/src/observation.ts`
- `docs/RULES.md` "Calibration" after s1-04 — the table of what the filter is expected to leave on each route
- `packages/target-app/index.html` and `packages/target-app/src/page-script.ts` (`wireMenu`, wired up in `src/main.ts`) — the mobile menu, the app's only hamburger; after `s1-04`, the kebab on `/account`

## Goal

`perceive` applies the knowledge rules K1 and K4 and the attention rule A1, so a persona that does not know a pattern reads a bare role, and a persona with little attention sees the most salient elements first and only as many as it can hold.

## Interface

- In: `PageMeasurement`, `Profile` and `Seed` from `@wayford/core`
- Out: `perceive` extended with stages 4 and 5; `PageMeasurement` extended with what pattern detection needs to read (for example whether a control is icon-only or opens a popup), and `collect` filling it
- Files expected to change: `packages/filter/src/**`, `packages/core/src/measurement.ts`, its test and `fixtures/measurement.json`, `docs/RULES.md` (the salience formula), and the preview in `packages/web` (after s3-01), which must pass `perceive` the whole persona, not its perception alone (F2 AC3)

## Constraints

- Deterministic, no dice: "the persona either knows a pattern or does not" (`docs/RULES.md`, stage 4).
- Pattern detection is heuristics on role, name, position and the measured attributes. Each heuristic is a pure function with a test on a target-app page where it fires and one where it must not. Wrong detection is a bug, not a finding.
- K1 and K4: a renamed element reads its bare role, in the field the fix for issue #16 gives `ObservedElement`, never as "partly legible". Its state stays what perception decided.
- A1: salience order from size, contrast and position, written into `docs/RULES.md` stage 5 as a formula before the code implements it; then truncation to `maxElements`. Cut elements stay in the evidence as `invisible` with an A1 decision and are counted in `hiddenCount`.
- Salience is defined for an element with no text metrics, such as the icon-only kebab: the formula ranks it by what it has (size, position) and says so, never by a default that puts it first or last.
- Kai's routes B and C stay open in the filter: each entrance is shown, renamed or masked, never cut (the route table in `docs/RULES.md`). That is what makes Kai's result depend on the agent and not on the filter. If under a formula that makes sense to a person they do not survive at Kai's `maxElements`, raise Kai's cap in RULES and the fixture and say so in the PR. Never tune the formula to the target app.
- A1 must not cut the path the contrast sweep measures (issue #89). The salience formula reads measured values, never the perception state. If no salience formula from size, contrast and position passes the #89 acceptance box on Vera's "Order archive" and "Deliveries" links, stop and ask the team: that is a decision about Vera, not about the code.
- Stages run in the pipeline order of `docs/RULES.md`: viewport, perception, knowledge, attention.
- `docs/RULES.md` "Monotone per perception rule" says this task fixes the order of A1 and A3. With A3 cut, write there instead that A1 alone shows a prefix of one salience order, and leave the order to whoever builds A3.
- Monotone in the cap: A1 shows a prefix of one salience order, so for a fixed run seed a smaller `maxElements` shows a subset of what a larger one shows. The sweep on `maxElements` (F9) relies on it. Not monotone in the perception thresholds, and not meant to be (`docs/RULES.md`, "Monotone per perception rule"): a stricter threshold that removes one element can free a slot for another.
- `@wayford/filter/perceive` stays browser-safe and under 5 ms per call on `measurementFixture`.

## Acceptance

- [ ] `pnpm --filter @wayford/filter test` passes and includes `knowledge.test.ts` and `attention.test.ts`
- [ ] On the target app at a mobile viewport, a profile with `hamburger` in `unknownPatterns` reads the menu toggle as its bare role, and Milo, who knows the pattern, reads "Menu"
- [ ] On `/account` at the desktop viewport, Kai's Actor text (`kebab` unknown) shows the "More options" control as its bare role, and Ada's shows "More options"
- [ ] Every pattern detector has a test on a page where it fires and one where it must not
- [ ] Zoya (`maxElements` 5) on `/` and Kai on `/settings/data`: no more shown elements than the cap, and `hiddenCount` equals the number of elements in the evidence with an A1 decision
- [ ] `pnpm --filter @wayford/filter routes`, no model involved, prints a table of persona × route × page: for each route's entrance and final link, whether the filter shows it, renames it, masks it or cuts it, and by which rule. Its rows match the route table in `docs/RULES.md` for all five personas, and the output is in the PR
- [ ] The preview's perceived page equals `perceive` with the whole persona (`search.test.ts` in `packages/web`)
- [ ] Same measurement, profile and run seed twice give string-equal Actor text with the new stages on, for every persona fixture
- [ ] For every persona fixture, lowering `maxElements` from 20 to 1 in steps of 1 never adds an element to the shown set
- [ ] Vera's full profile (`maxElements` 20 since s1-04), run seeds 1 to 1000, at the target app's defaults and at contrast thresholds 1.0 to 8.0 in steps of 0.25: A1 never cuts "Order archive" on `/deliveries` in a seed where perception leaves it shown, and never cuts her nav link "Deliveries" on `/` where perception shows it (measurements from `collect` on the target app) (issue #89)
- [ ] `bench:perceive` still prints under 5 ms on a developer laptop, and the `./perceive` import test still passes
- [ ] `docs/RULES.md` stage 5 states the salience formula the code implements
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- K2 vocabulary: `s1-05`, week 4. K3 readability: the "what next" slide (issue #19).
- A3, the option cap: cut on 2026-10-01 to fit week 3, a week 4 stretch. Zoya's `maxOptions` stays in her profile and does nothing until it lands.
- M1 memory: it truncates the Actor's history, so it belongs to s2-10.
- Behaviour dice, and preview sliders for the new caps.

## Notes for the reviewer

- Two reviewers: the task changes the filter contract and `docs/RULES.md`.
- Look at the five elements Zoya (`maxElements` 5) sees first on the home page, and the ones Kai sees on `/account` and `/settings/data`. If they make no sense to a person, the salience formula is wrong, not the persona.
- Check the #89 box on the real `/` and `/deliveries` measurements, not only on `measurementFixture`.
