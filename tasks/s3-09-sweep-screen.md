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
  - The headline says it as a sentence with the number in `display-xl`, in the agent's words, never the route's: e.g. "Under half get through, first at 3:1." The boundary is a got-through number (`boundaryOf`), so it is never "where the route closes". It is also the first value only, never "from 3:1 on": the rate is not monotone, and a stricter value can climb back over half.
  - With no boundary in range, the chart says "no boundary up to <last value>".
  - Where `boundaryOf` stopped at a value with an errored run, the chart names that value and the error, and claims nothing past it. It never says "no boundary" there.
- **Source badge:** `stored`, with `sweep.backend` as the backend tag.
- **The chart is plain SVG** from the tokens, as `docs/DESIGN.md`, "Charts" says. No chart library.
- **Each table cell opens the runs behind it.**
- **Fit.** The headline, chart and table fit 1280 × 720.
- **Looks and passes** as `docs/DESIGN.md` says. The screen joins the `check:self` list.

## Acceptance

- [x] `pnpm --filter @wayford/web test` passes: 56 files, 617 tests, on 2026-10-07 after merging main (with `s3-08` and `s4-07`) and the PR review fixes. By sub-box:
  - **Curves and marker:**
    - `boundary/sweep-chart.test.tsx` draws Vera's and Kai's fixtures: route open and got through, the gap, one post and its flag `boundary 3.0:1 · 2/10`;
    - `screens/boundary.test.tsx` "the chart draws both series, the post and its flag".
  - **No boundary, and a stopped sweep:**
    - `sweep-chart.test.tsx` draws "no boundary up to 4.5:1", and "stops at 2.5:1 · 1 run errored" with a solid fault stop line, no post, never "no boundary" and nothing drawn past it;
    - `boundary.test.tsx` "no boundary in range: the headline says so up to the last value" and "stopped at an error: the headline names the value and the error, never no boundary";
    - `boundary/reading.test.ts` reads both.
  - **A cell links to its runs:** `boundary.test.tsx`:
    - "each cell of a row links to that value's runs on the preset";
    - "?value=3 lists the ten runs at 3.0:1, in seed order, each linking to its detail";
    - the same on `/boundary/$sweepId`;
    - "a run io fails to send is drawn as no outcome, under a fault banner with Try again" (PR review).
  - **An empty preset:** `boundary.test.tsx` "a preset with no stored sweep says how to store one", naming `pnpm seed:demo` and `pnpm --filter @wayford/io sweep`.
- [x] `pnpm --filter @wayford/web check:self` passes with the Boundary screen listed, in both themes.
  - It lists `boundary` (`/boundary`, Vera) and `boundary · maxElements` (`/boundary/swp_kai-max-elements`).
  - Output: `floors: text 4.5:1 and 16 px, targets 32 px`, then `5 screens checked in Daylight and Night: 0 shortfalls` (with main's Lens and Report beside them), exit 0.
  - Each Boundary entry is ready once its headline shows and the top bar carries the `stored` badge. With `<SweepSource>` taken out of the screen, `check:self` exits 1 (PR review).
  - `scripts/self-check.browser.test.ts` runs the same in `pnpm test`, for every listed screen in both themes.
- [x] `rg -n recharts packages/web/src -g '!**/runs/**'` prints nothing: no output, exit 1, with ripgrep 15.2.0.
  - The glob first read `!runs/**`. rg anchors that to the working directory, so from the repo root it matched `runs/task-results.tsx` (PR review).
  - Without the exclusion, rg finds `runs/task-results.tsx` alone.
- [x] After a fake sweep, both demo sweeps open, and switching axis takes one click. Screenshots in the PR, beside `docs/design/screens/boundary.html`.
  - On 2026-10-07, after merging main with `s4-07` (PR #177), `pnpm seed:demo --fake` on a fresh `DATABASE_URL=file:./wayford-fake.sqlite` stored 200 runs, 2 reports and 2 sweeps, exit 0. Vera's boundary is 2.5 and Kai's 16, as in `s4-07`'s own fake run.
  - `pnpm dev` ran on it, and Playwright opened the screens at 1280 × 720:
    - in Daylight and Night, `/boundary` reads "Under half get through, first at 2.5:1." and `/boundary?axis=maxElements` reads "Under half get through, first at 16.". The top bar reads `stored jev`;
    - `scrollHeight` is 720 and `scrollWidth` 1280 on both presets and on `/boundary?value=2.5`, in both themes;
    - one click on "attention · Kai" from `/boundary` lands on `/boundary?axis=maxElements` with Kai's headline;
    - a seed cell at 2.5 opens its run's detail.
  - With io answering 500 to every `GET /runs/:id`, `/boundary?value=2.5` shows "10 runs of 10 could not be read from io. io answered 500: probe", and no cell has a border, a fill or a slash. "Try again", with io answering again, reads all ten.
  - The first screenshots, taken before `seed:demo` merged, ran on core's fixture sweeps saved with io's `saveSweep`. The stopped sweep's screenshot is still one of those, since `seed:demo` stores no stopped sweep.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root.
  - On 2026-10-07, after merging main and the PR review fixes: lint, 390 files, no errors; typecheck, exit 0.
  - Test: 154 files, 2224 tests. One failed locally: `@wayford/agent`'s `settle.browser.test.ts` "a 400 ms CSS animation is waited out". This machine's headless Chromium draws no animation frames. CI passes that test on main at `e927852`, which this branch merged, and the branch changes nothing in `agent`. The PR's CI run is the reference for this box.

## Outcome

Built as `docs/specs/2026-10-06-s3-09-boundary-screen.md` says. Where it differs from this file:

- **How a cell opens its runs.**
  - Every cell of a row links to `?value=<v>`. That opens a panel under the table with one cell per seed:
    - the border is route open or closed;
    - the fill is got through;
    - a slash is an error.
  - Each seed cell links to the run's detail.
  - The Runs screen cannot list a sweep's runs, so the screen shows them itself.
- **The headline names the first value only**, as #184 asks: "Under half get through, first at 3:1.", and the chart's `aria-label` the same. The longer sentence did not fit beside the switch at 1280, so the head now follows the picture: the meta line and the switch share the top row, and the headline has the row under them to itself. The meta line drops "at every value" to make room. Both presets end at 718 px.
- **Seed cells and the empty state, after `s3-08` landed** (PR review):
  - A read seed cell is `s3-08`'s `SeedCell`, pulled out of `SeedStrip`, with its `SeedLegend` and `OUTCOME_WORDS`, so both screens draw one cell. `SeedStrip` itself takes settled outcomes, while this panel reads its runs one by one, so the panel lays the cells out.
  - A cell whose run is still loading is a skeleton. One whose run failed to load is a blank sunken cell under a fault banner with "Try again". Neither is drawn as an outcome.
  - The empty state stays local: `EmptyState` draws an `<h2>` under the Report's own `<h1>` and takes a plain-string line, and the Boundary's empty state is the page's only heading, with two commands in its line.
- **Files outside the list:**
  - `components/seed-strip.tsx`: `SeedCell` pulled out of `SeedStrip` and exported, with `RouteState` (PR review);
  - `components/top-bar.test.tsx`: the top bar's test, which numbers `05 Boundary` and keeps it current on every Boundary URL;
  - `scripts/self-check.ts`: the two Boundary screens;
  - `screens/lens.test.tsx` (`preview.test.tsx` before main renamed it): one line, its whole-nav check now expects `05 Boundary`.
- **The screenshot box** ran on `seed:demo --fake` data once `s4-07` merged. The same run ticks `s4-07`'s box 3, which its PR handed to this one: `tasks/s4-07-seed-demo.md` is changed for that box alone.

## Out of scope

- Starting a sweep, editing its range, or following one while it runs (cut on 2026-10-04: nobody starts a sweep on stage).
- Comparing two sweeps on one chart.
- Any axis beyond the two.

## Notes for the reviewer

- The chart is the slide. Check it on the projector size.
