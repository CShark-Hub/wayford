# s3-12 — Design pass: the arena and run detail

Stream: s3
Milestone: week 4
Size: M
Depends on: s3-07, s3-03. Restyles the decision panel if s3-10 is in.

## Context

Read first, in this order:

- `docs/DESIGN.md` from `s3-07`
- `docs/DEMO.md` beats 4 and 5 — the race, then a failed run's step replay
- `docs/PLAN.md` F6 and F7
- `packages/web/src/arena/**`, `screens/run-detail.tsx`, `runs/step-replay.tsx`, `screens/runs.tsx`

## Goal

The arena and run detail follow `docs/DESIGN.md`. The race reads at a glance, and a step replay puts the screenshot beside the text the model read. The runs list takes the new tokens.

## Interface

- Files expected to change: `packages/web/src/arena/**`, `packages/web/src/screens/run-detail.tsx`, `screens/runs.tsx`, `packages/web/src/runs/**`, their tests only where a test reads a class name

## Constraints

- Look only. Run events, avatar states and the replay's data stay as they are.
- The arena is input side, so playful: avatars, persona colours, finish order. Run detail is output side, so sober: dense, monospace for seed, run id and measurements.
- The narration line under each arena tile stays readable at 1280 × 720, since beat 4 reads it aloud.
- The screens join the `check:self` list, served the run fixture and its events.

## Acceptance

- [ ] `pnpm --filter @wayford/web test` passes
- [ ] `pnpm --filter @wayford/web check:self` passes with the arena, runs and run detail listed
- [ ] The PR shows a race in progress and a step replay at 1280 × 720, before and after, and the reviewer approves the look
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Live video, motion, or a Jev toggle in the arena.
