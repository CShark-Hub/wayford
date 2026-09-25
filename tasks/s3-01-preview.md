# s3-01 — Preview screen on the measurement fixture

Stream: s3
Milestone: week 2
Size: L
Depends on: s1-01, s3-02

## Context

Read first, in this order:

- `docs/PLAN.md` F2 and section "UI"
- `KONCEPCJA.md` section "Demo, 90 sekund", steps 1 and 2
- `packages/core/src/measurement.ts` and `observation.ts` after s1-01
- `packages/filter/src/` after s1-01 — the `./perceive` entry, and `packages/web/src/` after s3-02 — the router and the bundled fixtures
- `docs/STACK.md` sections "Web" and "Package import rules"

## Goal

The hero screen exists: sliders for a persona's perception thresholds on the left, the page as that persona perceives it on the right, redrawn from the same `perceive` the Actor uses every time a slider moves.

## Interface

- In: `measurementFixture` and the persona fixtures, bundled for the browser the way s3-02 bundles them; `perceive` from `@wayford/filter/perceive`
- Out: route `/preview` in `packages/web`, with persona, thresholds and seed in the URL, added to the router s3-02 sets up
- Files expected to change: `packages/web/**`, `pnpm-lock.yaml`, `docs/STACK.md` only for a dependency it does not list

## Constraints

- "Preview uses the same filter package as the Actor. There is no second visual approximation" (F2 AC3). The screen never decides visibility: it draws what `perceive` returns.
- The perceived page is drawn from the `FullObservation` alone, each element at its bbox: `visible` as is, `degraded` with its masked name, `invisible` not at all. A toggle shows removed elements as outlines with the rule that removed them, and that view is labelled as evidence, not perception.
- Sliders: contrast, font size and target size thresholds, the softness of each, and the seed. Starting values come from the chosen persona. All of it lives in the URL through TanStack Router search params, so a preview state is a link.
- Output register: sober, monochrome, monospace for seed and measurements (`docs/PLAN.md` "UI"). Every slider and every icon-only control has an accessible name.

## Acceptance

- [ ] `pnpm --filter @wayford/web test` passes and includes a test for the preview route
- [ ] A test renders `/preview` for Vera at a fixed seed and shows the "Order archive" element is drawn at a contrast threshold of 2.0 and not at 3.0 with softness 0
- [ ] A test shows the drawn elements are exactly the shown elements of `perceive(measurementFixture, profile, seed)` for the URL's values
- [ ] With `pnpm dev` running, dragging the contrast slider on `http://localhost:5173/preview` redraws in under 500 ms, shown by the React Profiler or a `performance.measure` logged to the console (screenshot in the PR)
- [ ] Opening a copied preview URL in a new tab restores the same persona, thresholds and seed
- [ ] `pnpm --filter @wayford/web build` passes
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- The live target app, an io endpoint for measurements, the screenshot layer and CDP emulation (F2 AC4, AC5). The live page comes in `s3-05`, week 3.
- The profile builder (F1).
- Knowledge, attention and memory sliders. Their rules land with `s1-03`, a week 4 stretch.

## Notes for the reviewer

- Move a slider across a threshold and watch one element change while the rest of the page stays put. If more changes, check `perceive` before the UI.
- Look for any visibility logic in `packages/web`. There should be none.
