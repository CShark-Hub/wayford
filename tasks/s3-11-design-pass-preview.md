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

- [ ] `pnpm --filter @wayford/web test` passes, the preview's browser test included
- [ ] `pnpm --filter @wayford/web check:self` passes with the Lens listed, in both themes. A test shows that a shortfall inside an `exclude` region is skipped and one outside it is not.
- [ ] The PR shows beats 1 to 3 at 1280 × 720 beside `docs/design/screens/lens.html`, and the reviewer approves the look
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- The illustration view (`s3-06`), and any real-page view.
- Any change to `perceive` or to what the Lens measures.
