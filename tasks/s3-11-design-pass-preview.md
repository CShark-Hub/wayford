# s3-11 — Lens: the preview redesigned

Stream: s3
Milestone: week 4
Size: M
Depends on: s3-13. Restyles the axe card if s4-06 is in.

## Context

Read first, in this order:

- `docs/DESIGN.md`:
  - "Principles";
  - "Screens";
  - "Components", the rows built here;
  - "Motion";
  - "Checked by".
- `docs/design/screens/lens.html` — the picture to match, opened in a browser
- `docs/DEMO.md` beats 1 to 3 — the Lens is the hero screen and opens the demo
- `docs/PLAN.md` F2
- `packages/web/src/screens/preview.tsx`, `packages/web/src/preview/**` and `packages/web/scripts/self-check.ts`

## Goal

The Lens, Wayford's hero screen, matches `docs/design/screens/lens.html`, and beats 1 to 3 read clearly on a projector.

## Interface

- Out: ThresholdGauge and FilterStates in `packages/web/src/components/`. The screen adopts `s3-13`'s SegmentedControl, Tag, SourceBadge, Banner and Skeleton.
- Files expected to change:
  - `packages/web/src/screens/preview.tsx`, renamed `lens.tsx` only once `s4-06` has merged;
  - `packages/web/src/preview/**`;
  - `packages/web/src/components/**`;
  - `packages/web/scripts/self-check.ts` and its browser test, for the exclusion below;
  - their tests only where a test reads a class name or a file path.

## Constraints

- **Look only.** What the filter decides and how the Lens measures stay as they are, so F2 AC3 holds.
  - The two views stay the two the screen has: Perceived and Evidence, with `evidence` in the URL as today.
  - There is no third view.
- **Layout.**
  - A 300 px left rail: the persona switcher, the persona's name, one ThresholdGauge per perception rule, the seed.
  - The stage on a measuring surface, with the page picker and the view switch above it.
  - A readout strip under it: counts, the rules that fired, and the axe card when `s4-06` is in.
- **Source badge.** `live page` when the page was measured just now, `stored page` when the stored fallback is shown. Both come from the screen's own fetch. No backend tag: no Actor runs here.
- **Gauges.** Each gauge is a native range input over the drawn ruler, so keyboard and screen readers get a real slider. The post is `signal` and the softness band runs below it.
- **Evidence.** A removed element is a dashed `signal` outline with its flag: rule id first, then the numbers, e.g. `P1 · 2.0 < 4.5`. A degraded element is hatched with its masked name.
- **The one animation.** An element that changes state as a gauge moves animates once, 240 ms. There is none under `prefers-reduced-motion`. Beat 2's moment, a masked link going to gone, must read from the back of a room.
- **Fit.** The rail, the stage and the strip fit 1280 × 720 with no scroll.
- **Self-check.**
  - The screen joins the `check:self` list.
  - The stage keeps the target app's weak contrast on purpose, so `SelfCheckScreen` gains an optional `exclude` selector and the Lens sets it to the stage, as `docs/DESIGN.md`, "Checked by" says.
  - Everything else on the screen is checked.

## Acceptance

- [x] `pnpm --filter @wayford/web test` passes, the preview's browser test included: `Test Files 44 passed (44)`, `Tests 381 passed (381)`. The browser test is now `src/screens/lens.browser.test.ts`, with a second test: a contrast move that removes Order archive fades its ghost out once (`lens-out`, 0.24 s, one iteration), and under reduced motion its animation is `none`
- [x] `pnpm --filter @wayford/web check:self` passes with the Lens listed, in both themes: `lens: skips [data-lens-stage]`, then `2 screens checked in Daylight and Night: 0 shortfalls`, exit 0. `scripts/self-check.browser.test.ts`: "a shortfall inside an exclude region is skipped, one outside it is not", and "an exclude that matches nothing fails, naming the selector"
- [x] The PR shows beats 1 to 3 at 1280 × 720 beside `docs/design/screens/lens.html`, and the reviewer approves the look. The screenshots are in the PR, taken on the live stack in Daylight and Night. #179 merged with no human review. The look was approved after merge, on 2026-10-08, by a reviewer who did not work on s3-11 ([comment on #179](https://github.com/CShark-Hub/promptozaury/pull/179#issuecomment-6069171479)), against fresh shots of beats 1 to 3 on `main` `b77a10e` in both themes. Two follow-ups: #224, the drawn page too small for beat 2 (fitting the whole page, then `s3-16`'s URL row), and #225, the evidence flags overlapping in beat 3
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root: `Checked 353 files … No fixes applied.`, typecheck exit 0, `Test Files 139 passed (139)`, `Tests 1963 passed (1963)`

## Outcome

Built as the spec says (`docs/specs/2026-10-06-s3-11-lens-redesign.md`), with these differences from this file and from `lens.html`:

- The tests and the URL pin seven sliders, so each gauge keeps a softness row, and the gauges drop `lens.html`'s scale row of landmark numbers to fit 720. The ruler runs 1–7, 0–32 and 0–56, as `lens.html` draws it; the URL still takes values up to 21, 48 and 96.
- The seed is a stepper whose middle box is the native range input, with − and + buttons.
- The persona switcher and the page picker stay links, so Back keeps working. The View switch is `SegmentedControl`, a radio group, so the test that read `aria-pressed` reads `aria-checked`.
- The axe card is in the strip, after the drawing; the s4-06 test that put it above the page's title follows. Every sentence the tests read is kept word for word.
- The page is drawn to scale, fit to the height the strip leaves: 589 × 306 px on `/deliveries` (0.46), the same in both views. `lens.html`'s redraw is stylised at full size. Only the flags and the strip's counts and tags are drawn at full size; an outline and a hatch sit on the scaled box, so Order archive is 47 × 17 px on screen and its masked name about 7 px. Beat 2's moment in Perceived is that box fading out. A flag may run past the frame's side onto the measuring surface; flags of elements close together still overlap (Kai's attention cuts in Evidence, Zoya on `/account`).
- No count deltas: they would need a second filter run.
- `lens.html`'s frame shadow is left out, as `docs/DESIGN.md` allows shadows only on cast cards and a finished lane.
- `router.tsx` changed one import, for the rename.

## Out of scope

- The illustration view (`s3-06`), and any real-page view.
- Any change to `perceive` or to what the Lens measures.
