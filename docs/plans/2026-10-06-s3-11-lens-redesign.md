# s3-11 — Lens: the preview redesigned: plan

Task: `tasks/s3-11-design-pass-preview.md` · Spec: `docs/specs/2026-10-06-s3-11-lens-redesign.md`
Status: approved 2026-10-06 (auto)

Every command runs in the worktree root unless it says otherwise. `web` below is `pnpm --filter @wayford/web`.

| # | Step | Files | Serves box | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | Self-check `exclude` | `packages/web/scripts/self-check.ts`, `check-self.ts`, `self-check.browser.test.ts` | 2 | `self-check.browser.test.ts`: "a shortfall inside an exclude region is skipped, one outside it is not" (fake page, two faint paragraphs, one inside `#stage`) | `web exec vitest run scripts/self-check.browser.test.ts` green | 2 |
| 2 | Components and styles: `hatch` and `measure` utilities, the four 240 ms animations with reduced-motion `none`; `ThresholdGauge` with `useHeldValue`; `FilterStates` (`FILTER_STATE_CLASS`, `CutFlag`, `StateSwatch`); `SegmentedControl`'s exported class strings | `packages/web/src/index.css`, `src/components/threshold-gauge.tsx` (+ `.test.tsx`), `src/components/filter-states.tsx` (+ `.test.tsx`), `src/components/segmented-control.tsx` | 1 | `threshold-gauge.test.tsx` (post and fill position, value past max at the end, off draws no post, band from value × (1 − softness), `was` ghost only when given, `<output>` equals `aria-valuetext`); `filter-states.test.tsx` (class per state, flag side, quiet flag) | `web exec vitest run src/components` green; `web typecheck` | 1 |
| 3 | `PerceivedPage`: states from `FilterStates`, flags beside elements with `P1 · <value> < <threshold>`, quiet flags for attention and viewport cuts, renamed look, bottom crop, `scene` prop, `nextTrack` and keyed remounts with the `data-leaving` ghost | `src/preview/perceived-page.tsx`, `src/preview/perceived-page.test.tsx` | 1 | `perceived-page.test.tsx`: flag text, removed vs cut look, renamed look, crop height, `nextTrack` (change raises counter and keeps `was`, scene reset, no change returns `prev`) | `web exec vitest run src/preview` green | — |
| 4 | Screen: rename `preview.tsx` to `lens.tsx` (and both tests), `router.tsx` import; rail (persona links, name, gauges with tags and softness rows, seed stepper), stage (toolbar with picker, title, View `SegmentedControl`; banner; measuring surface with source line, frame, caption; skeleton), strip (counts, rules fired, axe card), top-bar source badge; `SearchSlider` restyled as the softness row | `src/screens/lens.tsx`, `src/screens/lens.test.tsx`, `src/screens/lens.browser.test.ts`, `src/router.tsx`, `src/preview/search-slider.tsx` | 1, 3 | `lens.test.tsx`: `viewOf` reads the radio group; axe card order after the drawing; counts and rules fired equal the observation's; Vera at `contrast=4.5` shows `folk · no source` and "was", at her own values `wcag22` and no "was" | `web exec vitest run src/screens src/router.test.tsx` green, `lens.browser.test.ts` included | — |
| 5 | The Lens in `check:self`; the animation browser test | `scripts/self-check.ts`, `src/screens/lens.browser.test.ts` | 1, 2 | `lens.browser.test.ts`: one ArrowRight from `contrast=2&contrastSoftness=0` removes Order archive, its ghost animates once to opacity 0; under reduced motion `animation-name` is `none` | `web check:self` prints `2 screens checked in Daylight and Night: 0 shortfalls`, exit 0; `web exec vitest run scripts src/screens/lens.browser.test.ts` green | — |
| 6 | Beats 1 to 3 at 1280 × 720 beside `lens.html`, Daylight and Night, in the browser pane; fix what reads wrong | screenshots in the scratchpad; fixes in step 4's and 3's files | 3 | — | Six screenshots taken (beats 1, 2 degraded, 2 at 4.5 Evidence, 3; Night of beats 2 and 3), nothing scrolls, flags and hatch read | — |
| 7 | Verification | `tasks/s3-11-design-pass-preview.md` | all | — | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `web test`, `web check:self` all green; boxes ticked with evidence | — |

Notes:

- Steps 1 and 2 touch disjoint files and change no lockfile, so they run at once. Steps 3 and 4 follow in order: 3 needs `FilterStates`, 4 needs the gauge and the page.
- Step 4 keeps every slider id, label, output, `aria-valuetext`, link href, status line, banner text, caption and axe sentence the tests read. The only test edits beyond the rename are the three the spec's decision log names: `viewOf`, the axe card's order, and nothing else.
- Step 5's Lens entry: `ready: 'main:has([data-state]):has(section[aria-label="axe-core"] li)'`, `responses: { "/measure": measurementFixture, "/axe": axeScanFixture("/deliveries") }`, `exclude: "[data-lens-stage]"`. If `collect` trips on the visually hidden names or the transparent range inputs, fix the markup, never the check.

## Decision log

in the spec
