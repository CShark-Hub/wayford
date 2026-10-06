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

- [ ] `pnpm --filter @wayford/web test` passes
- [ ] `pnpm --filter @wayford/web check:self` passes with the Race and run detail listed, in both themes
- [ ] The PR shows a race in progress and a step replay at 1280 × 720 beside the two reference screens, and the reviewer approves the look
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Live video, avatar motion, or a Jev toggle in the Race.
- Scout's line in the lanes, and any endpoint for Scout's ground truth.
- The runs list (`s3-14`).
