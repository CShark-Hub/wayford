# s3-09 — Boundary screen

Stream: s3
Milestone: week 4
Size: M
Depends on: s4-05, s3-13

## Context

Read first, in this order:

- `docs/PLAN.md` F9 and A8
- `docs/DEMO.md` beat 6 — contrast on Vera, then the axis switched to `maxElements` on Kai
- `docs/DESIGN.md`, "Charts", and `docs/design/screens/boundary.html`, the picture to match
- `packages/core/src/sweep.ts` and its fixture from `s4-05`

## Goal

The Boundary screen shows a stored sweep. It has:

- a headline that names the boundary value;
- per value, the success rate and the route-open share as two curves;
- the boundary marked;
- the value table beside the chart;
- the switch between the two demo axes.

## Interface

- In: `GET /sweeps`, `GET /sweeps/:id`
- Out:
  - a `/boundary` route whose typed search param picks the preset;
  - a `/boundary/$sweepId` route for any stored sweep;
  - the `05 Boundary` entry in the top bar's story nav.
- Files expected to change:
  - `packages/web/src/screens/boundary.tsx` and its test, `packages/web/src/boundary/**`, `packages/web/src/api/sweeps.ts`;
  - `router.tsx`, the top bar.

## Constraints

- **Two presets: Vera on contrast, Kai on `maxElements`.** Each opens the latest stored sweep for its persona and axis. Sweeps are started by `sweep` or `seed:demo`, never from this screen: beat 6 reads what `seed:demo` stored.
- **Two curves on one chart:** "Got through", the success rate, which is the agent's, and "Route open", the route-open share, which is the filter's and deterministic. The words are the report's.
- **The boundary is one marker** with its value and rate.
  - The headline says it as a sentence with the number in `display-xl`, in the agent's words, never the route's: e.g. "Under half get through from 3:1." The boundary is a got-through number (`boundaryOf`), so it is never "where the route closes".
  - With no boundary in range, the chart says "no boundary up to <last value>".
  - Where `boundaryOf` stopped at a value with an errored run, the chart names that value and the error, and claims nothing past it. It never says "no boundary" there.
- **Source badge:** `stored`, with `sweep.backend` as the backend tag.
- **The chart is plain SVG** from the tokens, as `docs/DESIGN.md`, "Charts" says. No chart library.
- **Each table cell opens the runs behind it.**
- **Fit.** The headline, chart and table fit 1280 × 720.
- **Looks and passes** as `docs/DESIGN.md` says. The screen joins the `check:self` list.

## Acceptance

- [ ] `pnpm --filter @wayford/web test` passes:
  - on the `Sweep` fixture, both curves and the marker render;
  - "no boundary" renders for a sweep without one, and a sweep stopped at an errored value names that value instead;
  - a cell links to its runs;
  - a preset with no stored sweep says how to run one.
- [ ] `pnpm --filter @wayford/web check:self` passes with the Boundary screen listed, in both themes
- [ ] `rg -n recharts packages/web/src -g '!runs/**'` prints nothing
- [ ] After `seed:demo --fake` (or a fake sweep before it lands), both demo sweeps open, and switching axis takes one click. Screenshots in the PR, beside `docs/design/screens/boundary.html`.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Starting a sweep, editing its range, or following one while it runs (cut on 2026-10-04: nobody starts a sweep on stage).
- Comparing two sweeps on one chart.
- Any axis beyond the two.

## Notes for the reviewer

- The chart is the slide. Check it on the projector size.
