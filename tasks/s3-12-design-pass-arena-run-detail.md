# s3-12 — Race and run detail redesigned

Stream: s3
Milestone: week 4
Size: M
Depends on: s3-13, s3-03. Restyles the decision panel if s3-10 is in.

## Context

Read first, in this order:

- `docs/DESIGN.md`:
  - "Screens";
  - the rows of "Components" built here: Outcome, RaceLane, StepTimeline;
  - "Copy".
- `docs/design/screens/race.html` and `run-detail.html` — the pictures to match
- `docs/DEMO.md` beats 4 and 5 — the race, then a failed run's step replay
- `docs/PLAN.md` F6 and F7
- `packages/web/src/arena/**`, `screens/run-detail.tsx`, `runs/step-replay.tsx`

## Goal

The Race and run detail match their reference screens:

- the race reads at a glance, one lane per persona;
- a step replay puts the screenshot beside the text the model read.

## Interface

- Out: Outcome, RaceLane and StepTimeline in `packages/web/src/components/`.
- Files expected to change:
  - `packages/web/src/arena/**`, which may be renamed `race/`;
  - `packages/web/src/screens/run-detail.tsx`, `runs/step-replay.tsx`;
  - `packages/web/src/components/**`;
  - their tests only where a test reads a class name or a file path.

## Constraints

- **Look only.** Run events, avatar states and the replay's data stay as they are.
- **Race setup.** One strip, not a form:
  - the goal choice with its sentence large and its success condition in mono;
  - the cast as avatar toggles, 3 to 5;
  - the seed;
  - `Start the race` as the one primary button.
- **Race lanes.** One lane per persona, stacked full width:
  - avatar and name, the step pips by kind, the goal post;
  - the latest screenshot;
  - the outcome and the clock in mono;
  - the narration labelled `narration · after the fact`.

  There is no progress bar: the Actor never knows how far the goal is. There is no Scout line either: no ground truth reaches the web app. Three lanes fit 1280 × 720 with no scroll.
- **Source badges**, from each screen's own data:
  - the Race shows `live` while its streams are open, and no backend tag, since the screen does not know the backend;
  - run detail shows `stored`, with the backend its Actor model names.
- **Run detail.**
  - The header reads `persona | seed | run id` in mono, with the facts row and the two downloads.
  - The StepTimeline moves with ← and →.
  - Two columns: the screenshot with the click point in `signal`, and the model's text, line-numbered on `paper-sunken`.
  - Filtered out, Dice and Jev sit under the screenshot.
- The screens join the `check:self` list, served the run fixture and its events.

## Acceptance

- [x] `pnpm --filter @wayford/web test` passes
  - The web suite passes in full: 817 tests in 62 files, the self-check's browser tests included. Run after the third PR review's fixes and the merge of `main` with s3-06.
  - New tests: `outcome`, `race-lane`, `step-timeline` and `jev-draw` (`src/components/`), the race folds in `arena/race.test.tsx`, and a lost lane with no step under way in `arena/race-view.test.tsx`. In `scripts/self-check.browser.test.ts`:
    - the badges: `live` while a race runs, none once every run has ended, and `stored` with the backend on run detail;
    - the 720 px fit of the live race and of a race with a detail line in every lane, in both themes;
    - real ← and → presses on run detail;
    - the click point and its flag inside the 180 px crop near the top of the page, mid-page and low on it;
    - the Jev label row ending inside 720.
- [x] `pnpm --filter @wayford/web check:self` passes with the Race and run detail listed, in both themes
  - It prints `floors: text 4.5:1 and 16 px, targets 32 px`, then `10 screens checked in Daylight and Night: 0 shortfalls`, and exits 0 (after the merges of `main` with s3-08, s3-09 and s3-06).
  - The screens are `cast`, `lens` (from `s3-11`), `lens-illustration` (from `s3-06`), `race` (the setup strip), `race-live` (three lanes from `demoRace`), `report` (from `s3-08`), `boundary` and `boundary · maxElements` (from `s3-09`), `run-detail` (`run_vera-hard-1?step=1`) and `run-detail-jev` (`run_vera-hard-jev`).
- [x] The PR shows a race in progress and a step replay at 1280 × 720 beside the two reference screens, and the reviewer approves the look
  - The screenshots are on the PR, in Daylight and Night, beside `docs/design/screens/race.html` and `run-detail.html` taken at the same size.
  - Approved by the reviewer, Grzegorz, who merged PR #181 on 2026-10-07 after his review at 7d8bcf2.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root
  - Lint: 408 files. Typecheck: exit 0. Test: 161 files passed, 1 skipped; 2467 tests passed, 3 skipped. Run after the third PR review's fixes and the merge of `main` with s3-06.

## Out of scope

- Live video, avatar motion, or a Jev toggle in the Race.
- Scout's line in the lanes, and any endpoint for Scout's ground truth.
- The runs list (`s3-14`).

## Outcome

Built as `docs/specs/2026-10-06-s3-12-race-run-detail.md` says, after the gate 1 change that keeps run detail's video player. Its decision log holds every choice. These are the differences from this file and the references:

- **Tests.** They changed wherever the markup they read changed, not only where they read a class name or a file path.
  - The outcome words are now `docs/DESIGN.md`'s: Got through, Gave up, Over budget, Error.
  - The race clock reads `0:15.5`.
  - Tabs replaced the replay's sections, and toggle buttons replaced the cast's checkboxes.
  - Every behaviour the old tests pinned is still pinned, with three deliberate drops:
    - the old evidence table gave every observed element a row, and Filtered out lists only the elements a rule touched (the model's text shows the rest, verbatim);
    - the Previous step and Next step links are gone, since the StepTimeline's links and the ← → keys do their job;
    - the header's task goal, and its fallback to the task id while the tasks load, are gone; the task id is in the facts.
- **Race setup.** The goal choice is a SegmentedControl and the cast is `aria-pressed` avatar buttons. A visually hidden radio or checkbox would have escaped `check:self`, which measures only what is drawn.
- **Race lanes.** The narration sits beside the screenshot, two lines, or one under a detail line, so three lanes fit 720 in any state. The lane has no dimension line, the clock is set in `readout`, and the finish order is a list for screen readers alone, with the places on the goal posts.
- **Run detail.**
  - The video player stays, in a Recording section under the replay.
  - The screenshot is a 180 px crop that moves to keep the click point in view.
  - The goal sentence and its `GET /tasks` left the header.
  - The downloads sit beside the facts in row 2, not in row 1, so a real run id fits row 1.
  - Elements no rule touched are not listed under Filtered out.
- **The decision panel** is now JevDraw, with every option in offer order. Under its bar one row names the likely options with their probabilities, so demo beat 5 reads them at 1280 × 720 without a scroll.
- **Files outside the list.**
  - `src/runs/details.tsx`, the run detail's shared pieces: its notes and tables moved to tokens, and it now holds the shared `Fact`, `FACTS` and `Mark`.
  - `src/screens/arena.tsx` and its test: the page column and the visually hidden h1.
  - `src/runs/fixture-runs.ts`, test data: the Jev fixture writes no narration, as a Jev run does.
  - `scripts/self-check.ts` gains answers that are not 200 JSON (a status, an event stream, an image), and `act`, the clicks that bring a screen to the state measured.
  - `src/arena/demo-race.ts` holds the race the self-check serves, apart from `fixture-race.ts`, which plain tsx cannot load.
- **Follow-ups.**
  - The badge and the backend tag are spans, which `collect` does not measure, so `check:self` does not hold them to the floors.
  - With a real run id (a ULID) and a seed of up to four digits, the run detail header holds one line and the Jev draw bar is inside 720. The options list under it is below the fold, as is a longer seed's bar.
