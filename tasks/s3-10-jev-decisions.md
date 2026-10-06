# s3-10 — Jev decisions in run detail

Stream: s3
Milestone: week 4
Size: S
Depends on: s2-06

## Context

Read first, in this order:

- `docs/adr/0001-jev-actor-backend.md` — decisions 3, 4 and 6: the draw, the record, confidence stored but never acted on
- `packages/core/src/run.ts` after s2-06 — `DecisionRecord`, `drawOption`, and `decisionRecordFixture`
- `packages/web/src/screens/run-detail.tsx` and `runs/step-replay.tsx`
- `docs/DESIGN.md`, row JevDraw, if `s3-13` is in

## Goal

In run detail, a Jev step shows what the model was offered and how likely it found each option, where the seeded roll landed and which action that drew, so a viewer sees where the model hesitated.

## Interface

- In: `RunResult` steps with an optional `decision`
- Out: a decision panel in the step replay; the run header names the Actor backend and model
- Files expected to change: `packages/web/src/runs/step-replay.tsx`, a new `packages/web/src/runs/decision*.tsx` and its test, `screens/run-detail.tsx`

## Constraints

- One bar per offered option, in offer order, labelled with its description, which is the masked name for a degraded element. The drawn option is marked, and so is the rolled value on the cumulative scale.
- The confidence is labelled as the model's, a hypothesis about how ambiguous the page was, never about the persona (ADR 0001, decision 6).
- A step with no `decision`, every LLM step, shows nothing new.
- With `s3-13` in, the panel is `docs/DESIGN.md`'s JevDraw: the options laid end to end on 0–1, the rolled needle in `signal`, and the drawn segment filled. Without it, `s3-12` restyles the panel.

## Acceptance

- [x] `pnpm --filter @wayford/web test` passes: on `decisionRecordFixture` the panel shows ten bars, marks `e3` ("Deliveries") as drawn, and shows the confidence with its label; an LLM step shows no panel
  - 30 files, 280 tests. `decision-panel.test.tsx` covers the fixture: ten bars in offer order, `e3` the only one drawn, confidence 0.71 with "the model's" label.
  - The same file draws on probabilities `[0.5, 0, 0.5]`, where core's draw and the top pick differ, so a panel that marked the top pick would fail it.
  - In `step-replay.test.tsx`, a Jev step draws the Decision section, and every step of the LLM fixture run draws only the five sections.
- [x] On a real Jev run (`run:one --backend jev`, or `seed:demo --fake` once `s4-07` is in), the panel renders. Screenshot in the PR.
  - It renders. The run was `run_01m47w76p695vy4dhemjpne0ak`: Vera, seed 8, contrast 3.0 on `typesafe/jev-1.13`, from the real-key sweep of `s4-05`. It was served by `pnpm dev` from that stored run, so no new run was billed.
  - Its step 0 offered 17 options. Jev gave "Deliveries" 0.61, but the roll of 0.046 drew "Your account" (0.25), so the panel shows the draw, not the top pick.
  - The header reads `jev` beside `typesafe/jev-1.13`.
  - Screenshots of the panel and the header are on PR #174. They sit on the unmerged `assets/s3-10-screenshots` branch, so `main` gets no binaries, as `s3-07` did; delete that branch once this merges.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root
  - 119 files, 1800 tests.

## Out of scope

- Anything in the arena. The live race runs on the LLM (`docs/DEMO.md`).
- Using the confidence in the report.

## Outcome

- **The panel** is the Decision section of the step replay (`runs/decision-panel.tsx`), drawn only on a step that carries a `decision`. It sits between the evidence and the action.
  - There is one row per option, in offer order: its description (a degraded element's masked name), its probability as stored, a bar for its share of the draw, and its range on the cumulative scale from 0 to 1.
  - The drawn option is marked, from core's `drawOption`. The rolled value is printed once, and each row's range shows where it lands.
- **Not JevDraw yet.** `s3-13` was not in, so the panel is a table with bars, not `docs/DESIGN.md`'s JevDraw strip. `s3-12` restyles it (Constraints).
- **The header** adds "Actor backend" beside "Actor model".
  - Web cannot match the model id to Jev's, so the backend is `jev` when any step carries a decision and `llm` otherwise.
  - That is io's `backendOf` without its first check, the model match. So any Jev run that stopped before its first planned action reads `llm`, where io's gap is only such a run on an earlier Jev version. The model id beside it still names Jev.
- **Two files outside the list:**
  - `runs/fixture-runs.ts` gains `fixtureJevRun` for the tests, the fixture run with the decision record on step 0. It is test data, kept out of `fixtureRuns`.
  - `runs/details.tsx` is new: `Details`, `Detail` and the note and table classes, moved out of `step-replay.tsx` so the panel shares them without an import cycle.
- **Follow-up:** the backend rule now lives in web and in io's `backendOf`. Having `GET /runs/:id` return the run's backend would give web io's full rule and remove the copy.
