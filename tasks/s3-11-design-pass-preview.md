# s3-11 — Design pass: the preview

Stream: s3
Milestone: week 4
Size: M
Depends on: s3-07. Restyles the axe card if s4-06 is in.

## Context

Read first, in this order:

- `docs/DESIGN.md` from `s3-07`
- `docs/DEMO.md` beats 1 to 3 — the preview is the hero screen and opens the demo
- `docs/PLAN.md` F2
- `packages/web/src/screens/preview.tsx` and `packages/web/src/preview/**`

## Goal

The preview, Wayford's hero screen, follows `docs/DESIGN.md`, and beats 1 to 3 read clearly on a projector.

## Interface

- Files expected to change: `packages/web/src/screens/preview.tsx`, `packages/web/src/preview/**`, their tests only where a test reads a class name

## Constraints

- Look only. What the filter decides and how the preview draws it stay as they are, so F2 AC3 holds.
- Beat 2's moment carries the screen. A masked link turning into a gone link as the slider moves must be visible from the back of a room.
- The persona switcher, sliders and page picker are input side, so playful. The perceived page and evidence view are output side, so sober.
- The screen joins the `check:self` list.

## Acceptance

- [ ] `pnpm --filter @wayford/web test` passes, the preview's browser test included
- [ ] `pnpm --filter @wayford/web check:self` passes with the preview listed
- [ ] The PR shows beats 1 to 3 at 1280 × 720, before and after, and the reviewer approves the look
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- The illustration view (`s3-06`).
- Any change to `perceive` or to what the preview measures.
