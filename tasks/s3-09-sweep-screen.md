# s3-09 — Sweep screen

Stream: s3
Milestone: week 4
Size: M
Depends on: s4-05, s3-07

## Context

Read first, in this order:

- `docs/PLAN.md` F9 and A8
- `docs/DEMO.md` beat 6 — contrast on Vera, then the axis switched to `maxElements` on Kai
- `docs/DESIGN.md` from `s3-07`
- `packages/core/src/sweep.ts` and its fixture from `s4-05`
- `packages/web/src/runs/task-results.tsx` — Recharts as the app already uses it

## Goal

The sweep screen shows a stored sweep: per value the success rate and the route-open share as two curves, the boundary marked, the table under the chart, and the switch between the two demo axes.

## Interface

- In: `GET /sweeps`, `GET /sweeps/:id`
- Out: a `/sweeps` route with a list and a `/sweeps/$sweepId` detail, and a nav entry
- Files expected to change: `packages/web/src/screens/sweep.tsx`, `sweeps.tsx` and their tests, `packages/web/src/sweep/**`, `packages/web/src/api/sweeps.ts`, `router.tsx`, `shell.tsx`

## Constraints

- **Two presets: Vera on contrast, Kai on `maxElements`.** Each opens the latest stored sweep for its persona and axis. Sweeps are started by `sweep` or `seed:demo`, never from this screen: beat 6 reads what `seed:demo` stored.
- **Two curves on one chart:** "Got through", the success rate, which is the agent's, and "Route open", the route-open share, which is the filter's and deterministic. The words are the report's.
- **The boundary is one marker** with its value and rate. With no boundary, the chart says "no boundary up to <last value>".
- **Each table cell opens the runs behind it.**
- **Looks and passes** as `docs/DESIGN.md` says. The screen joins the `check:self` list.

## Acceptance

- [ ] `pnpm --filter @wayford/web test` passes:
  - on the `Sweep` fixture, both curves and the marker render;
  - "no boundary" renders for a sweep without one;
  - a cell links to its runs;
  - a preset with no stored sweep says how to run one.
- [ ] `pnpm --filter @wayford/web check:self` passes with the sweep screens listed
- [ ] After `seed:demo --fake` (or a fake sweep before it lands), both demo sweeps open, and switching axis takes one click. Screenshots in the PR.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Starting a sweep, editing its range, or following one while it runs (cut on 2026-10-04: nobody starts a sweep on stage).
- Comparing two sweeps on one chart.
- Any axis beyond the two.

## Notes for the reviewer

- The chart is the slide. Check it on the projector size.
