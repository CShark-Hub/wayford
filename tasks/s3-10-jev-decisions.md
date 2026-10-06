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

- [ ] `pnpm --filter @wayford/web test` passes: on `decisionRecordFixture` the panel shows ten bars, marks `e3` ("Deliveries") as drawn, and shows the confidence with its label; an LLM step shows no panel
- [ ] On a real Jev run (`run:one --backend jev`, or `seed:demo --fake` once `s4-07` is in), the panel renders. Screenshot in the PR.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Anything in the arena. The live race runs on the LLM (`docs/DEMO.md`).
- Using the confidence in the report.
