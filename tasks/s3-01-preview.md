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
- Sliders: contrast, font size and target size thresholds, the softness of each, and the seed. Thresholds and softness start from the chosen persona. The seed stands in for a run seed: it starts at 1, never at the profile's seed, and stays when the persona changes (`docs/PLAN.md` A20). All of it lives in the URL through TanStack Router search params, so a preview state is a link.
- Output register: sober, monochrome, monospace for seed and measurements (`docs/PLAN.md` "UI"). Every slider and every icon-only control has an accessible name.

## Acceptance

- [x] `pnpm --filter @wayford/web test` passes and includes a test for the preview route. 12 files, 74 tests pass. The route is tested through the app's router in `src/screens/preview.test.tsx`, 13 tests. Its parts have their own: `src/preview/search.test.ts` (11), `perceived-page.test.tsx` (7), and `src/bundled-fixtures.test.ts` "the bundled measurement deep-equals measurementFixture".
- [x] A test renders `/preview` for Vera at a fixed seed and shows the "Order archive" element is drawn at a contrast threshold of 2.0 and not at 3.0 with softness 0. `src/screens/preview.test.tsx` "Order archive is drawn at a contrast threshold of 2 and not at 3, softness 0" renders `?persona=prof_vera&seed=1&contrast=2&contrastSoftness=0`, then the same at `contrast=3`. Every other drawn box is unchanged between the two.
- [x] A test shows the drawn elements are exactly the shown elements of `perceive(measurementFixture, profile, seed)` for the URL's values. `src/screens/preview.test.tsx` "the drawn elements are exactly the shown elements of perceive for the URL's values" covers all four personas at their own values, and Vera with every slider moved at seed 7, where visible, degraded and invisible elements all occur. It builds each profile from the URL by hand, calls the real `perceive` on core's `measurementFixture`, and compares ref, state, name, box and font size in order. A spy shows the screen's own `perceive` got a measurement deep-equal to `measurementFixture`.
- [x] With `pnpm dev` running, dragging the contrast slider on `http://localhost:5173/preview` redraws in under 500 ms, shown by the React Profiler or a `performance.measure` logged to the console (screenshot in the PR). Checked in the browser pane with web's dev server, after the look cut (Outcome). Stepping by keyboard from 2.0 to 2.4 at softness 0 logged `preview redraw 72.9 ms`, 70.3, 77.0 and 66.3 ms, and at 2.1 only "Order archive" left the page (18 drawn boxes to 17). A mouse drag from 2.4 to 15.1 logged 14.5 and 160.0 ms. During a drag, a logged redraw includes up to 150 ms of waiting for its batch of URL writes, since the timing starts at the batch's first input. Before the cut, the two PR reviews measured 28 to 185 ms per redraw in headless Chromium. The DevTools screenshot, taken by hand after the cut, is in the PR body: every logged redraw there is 5.7 to 162.9 ms.
- [x] Opening a copied preview URL in a new tab restores the same persona, thresholds and seed. Checked in the browser pane. Through the UI: Zoya, contrast down to 6.9, seed up to 3, Evidence. The URL read `?persona=prof_zoya&seed=3&contrast=6.9&evidence=true`. A new tab on that URL showed the same seven slider values, persona, view and drawn elements, 3 of 19 shown. `src/screens/preview.test.tsx` "a URL that sets every control restores every control" covers it without a browser.
- [x] A test renders `/preview` for Vera with no seed in the URL and shows that the seed slider reads 1 and every `perceive` call gets seed 1; at seed 7, switching to Zoya with the persona control keeps seed 7 in the URL, and every `perceive` call after the switch gets seed 7 (A20). `src/screens/preview.test.tsx` "with no seed in the URL, the seed slider reads 1 and every perceive call gets 1" and "switching to Zoya with the persona control keeps seed 7". The second reads the Zoya link's `href` off `nav[aria-label="Persona"]`, pushes it on the same router, and checks every call after the switch. The first renders `?persona=prof_vera` as written: the seed is defaulted when the URL resolves, never written into it.
- [x] `pnpm --filter @wayford/web build` passes. `✓ built`: 494 kB of JavaScript, 156 kB gzipped, under Vite's 500 kB advisory.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root. Lint checks 156 files and applies no fixes. The typecheck is clean. 49 test files, 763 tests pass.

## Out of scope

- The live target app, an io endpoint for measurements, the screenshot layer and CDP emulation (F2 AC4, AC5). The live page comes in `s3-05`, week 3.
- The profile builder (F1).
- Knowledge, attention and memory sliders. Their rules land with `s1-03`, a week 4 stretch.

## Notes for the reviewer

- Move a slider across a threshold and watch one element change while the rest of the page stays put. If more changes, check `perceive` before the UI.
- Look for any visibility logic in `packages/web`. There should be none.

## Outcome

What shipped, for the next reader. The design and every decision are in `docs/specs/2026-10-01-s3-01-preview.md`.

- **URL contract** (`packages/web/src/preview/search.ts`). `/preview` takes `persona`, `seed`, `contrast`, `fontPx`, `targetPx`, their `…Softness`, and `evidence`, every one optional. Each falls back on its own when `resolvePreview` reads it: `persona` to Vera, `seed` to 1 (never the profile's seed), a threshold or softness to the persona's own. A threshold slider's lowest position, contrast 1 and 0 px, means "does not gate", and the threshold is left out of the perception. `resolvePreview` turns a validated search into what the sliders show, the persona's own cuts, the perception `perceive` gets and whether the persona's bundle was edited. `personaSearch` is a persona link's search: the new persona with the same seed and view.
- **Drawing** (`src/preview/perceived-page.tsx`). `PerceivedPage` draws a `FullObservation` at its measured boxes, scaled with container units, so the markup carries the measured px. A shown element reads the name `toActorObservation` gives its ref. A removed element is not drawn; in the evidence view it is a dashed outline tagged with the rules that removed it (`P1 2.005 < 3`). The caption says what `perceive` returned and for whose thresholds, with "edited" once a slider moved them, never what a person sees.
- **Screen** (`src/screens/preview.tsx`). `perceive` runs on every render, on `bundledMeasurement` (`src/bundled-fixtures.ts`). A slider writes the URL with `replace`, at most once per 150 ms: each write is a `history.replaceState`, which Safari caps at 100 and Chrome at 200 per 10 s, and a drag fires an input per frame. The last value of a drag always lands, and whatever is queued lands when the slider loses focus, before a click elsewhere. A queued value belongs to the history entry it was moved on, so it never rewrites the entry a Back lands on. A persona link pushes.
- **Sliders** (`src/preview/search-slider.tsx`). Native range inputs in the persona colour (`accent-color`), with a label and a monospace readout. TanStack commits a navigation inside a React transition, so each slider keeps the value it was moved to until the URL catches up. Every slider is keyed by the history entry, so Back, Forward and a persona link start it afresh on the URL's value.

**Beyond the task file.** At gate 1 the user asked for "a modern, professional app with a fun hackathon touch", and the spec's "Look" section was built: a live avatar, an "Edited" badge with a reset link, a sliding persona switcher, a hand-styled slider with a tick at the persona's own value, counts, a legend, an empty state and elements that faded as they crossed a threshold, with `framer-motion`. After the branch was written, `docs/PLAN.md` "UI" moved the look to week 4's design pass, so the second human review on #136 cut all of that. What stays beyond the task file:

- a `Perceived | Evidence` segmented control in place of a single toggle;
- one persona-colour accent, on the sliders, the active persona and the frame's top edge;
- Inter (copied from target-app) and JetBrains Mono (the official variable woff2, downloaded with the user's agreement), each with its OFL in `public/fonts/`. Both are `docs/STACK.md` picks, so `docs/STACK.md` did not change.

The current persona's own link is the way back once a slider has moved its values. The spec's "Look" section keeps the cut design as a starting point for week 4.

**Worth knowing.**
- **Defaults are the resolver's.** No param is defaulted in `validateSearch`, so a short link is canonical and renders as written, in the browser and in a static render. The branch review moved them there: defaulted in the validator, a URL without them was answered with a redirect in a static render.
- **Test readers.** No DOM library is installed, so the tests read static markup with the regex readers in `src/preview/rendered-markup.ts`. A reader keyed on one attribute misses whatever lacks it: the PR review found drawn boxes read by `data-ref`, which a removed element lacks, and they are now read by `data-state`. The readers also rest on "a box holds no `<div>`", so each one that reads an element to its first closing tag throws when that element holds one of its own tag. Whether web tests keep these, or move to a DOM such as happy-dom (a new `docs/STACK.md` line), is a team question before s3-05.
- **`pnpm dev` and io.** io exits at boot without `LLM_API_KEY` in the root `.env`, which predates this task. The preview needs no io; web and target-app run.
- **Build size.** The bundle is 494 kB (156 kB gzipped), up from 481 kB on `main`, with the filter and zod in it, just under Vite's 500 kB advisory. With framer-motion it was 630 kB. Splitting the preview route out is a follow-up if it matters.
- **Overlapping tags.** Where the measurement puts two boxes on one spot (a nav `li` and its link), or boxes sit close at a narrow width, evidence tags overprint. Each outline names its element to a screen reader.
- **For s3-05.** Swap `bundledMeasurement` for io's measurement at the one `perceive` call in `PreviewScreen`. An element V2 removes lies outside the viewport, and the canvas is the viewport's size and clips, so its outline and tag cannot be seen, though `perceive` removed it. The stored page has none; the live pages will.
