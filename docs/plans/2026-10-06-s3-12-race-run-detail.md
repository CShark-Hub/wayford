# s3-12 — Race and run detail redesigned: plan

Task: `tasks/s3-12-design-pass-arena-run-detail.md` · Spec: `docs/specs/2026-10-06-s3-12-race-run-detail.md`
Status: approved 2026-10-06

This is the plan as approved. The build departed from it where the spec's decision log says: `index.css` stayed unchanged (step 1's `hatch` is s3-11's), and `raceSource` (step 6) went in the simplify pass.

All paths are under `packages/web/` unless they start with `docs/` or `tasks/`. "vitest X" means `pnpm --dir packages/web exec vitest run X`. "biome X" means `pnpm exec biome check X`, run from the worktree root.

| # | Step | Files | Serves box | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | Hatch utility and Outcome | `src/index.css`, `src/components/outcome.tsx`, `outcome.test.tsx` | web test | `outcome.test.tsx`: each kind's word; Waiting, Moving and Stuck equal `STATE_WORDS`; `outcomeKind` for all four `RunOutcome`s; colour class per kind (`text-ink-2`, `text-fault`, the live glyph on `--p`) | vitest `src/components/outcome.test.tsx` green; biome on the three files | none (first) |
| 2 | RaceLane | `src/components/race-lane.tsx`, `race-lane.test.tsx` | web test | Pip kinds draw their classes; the end mark for Gave up, Over budget and Error; the goal post reached with "1st"; the track's `aria-label`; "No screenshot yet"; the narration label with and without text; a fault detail; `shadow-raised` once finished | vitest `src/components/race-lane.test.tsx` green; biome | 3, 4, 5 |
| 3 | StepTimeline | `src/components/step-timeline.tsx`, `step-timeline.test.tsx` | web test | `aria-current="step"`, wasted hatch, the last step's border and glyph, `?step=N` hrefs, aria-labels; `stepKeyDelta` on every guard; `neighbourStep` at both ends and at -1 | vitest `src/components/step-timeline.test.tsx` green; biome | 2, 4, 5 |
| 4 | JevDraw and the Jev tab | `src/components/jev-draw.tsx`, `jev-draw.test.tsx`, `src/runs/decision-panel.tsx`, `decision-panel.test.tsx` | web test | `jev-draw.test.tsx`: segment widths from `drawScale` sum to 100 %; on `[0.5, 0, 0.5]` the drawn segment is `drawOption`'s, not the top pick; the needle at `rolled`; the `aria-label`. `decision-panel.test.tsx` rewritten: ten options in offer order, `e3` drawn and marked "drawn", the confidence labelled the model's | vitest both test files green; biome. `step-replay.test.tsx`'s Decision test may go red here; step 7 owns that file and rewrites it | 2, 3, 5 |
| 5 | Self-check harness | `scripts/self-check.ts`, `scripts/self-check.browser.test.ts` | check:self | Fake-page tests: a `jsonAnswer(…, 201)` reaches the page with its status; an `eventStreamAnswer` delivers its events to an `EventSource` in order, with `lastEventId` set; `act` runs before `ready` is awaited; `PNG_ANSWER` loads as an image | vitest `scripts/self-check.browser.test.ts` green, Cast included | 2, 3, 4 |
| 6 | Race folds and `demoRace` | `src/arena/race.ts`, `race.test.tsx`, `src/arena/fixture-race.ts` | web test | `stepPips` on every prefix of Vera's events and on Kai's partial run; `throughPlaces` with a tie; `clockText` (`—`, `0:03.0`, `0:15.5`, `1:15.4`); `stepsText` running and ended; `laneOutcome` for every `AvatarState`, each ended outcome and lost; `raceSource` before, during and after; `demoRace` parses and ends as the spec says | vitest `src/arena/race.test.tsx` green; biome | 7 (needs 2) |
| 7 | Run detail | `src/screens/run-detail.tsx`, `run-detail.test.tsx`, `src/runs/step-replay.tsx`, `step-replay.test.tsx`, `src/runs/details.tsx` | web test | The two test files rewritten to the spec first:<br>- header h1 text; the facts; the two downloads; the Recording section with the player and `not recorded`<br>- the timeline's links and current step; the caption<br>- the Observed and After figures; the click point at `bbox / viewport`<br>- the three tabs and their contents, the Jev tab only on a decision step; the numbered lines joining to the stored text byte for byte; the marked line<br>- the narration section; the states, with "Try again" | vitest both files and `decision-panel.test.tsx` green; biome | 6, 8 (needs 1, 3, 4) |
| 8 | Race screen | `src/arena/race-view.tsx`, `race-view.test.tsx`, `src/arena/start-panel.tsx`, `start-panel.test.tsx`, `src/arena/panel-calls.ts`, `panel-calls.test.ts`, `src/screens/arena.tsx`, `src/screens/arena.test.tsx` | web test | Tests rewritten to the spec first:<br>- **Strip:** the goal SegmentedControl; the `aria-pressed` cast toggles, with the sixth disabled at five; the seed; Start as the one primary button; the blockers and alerts<br>- **Race:** lanes in run order; Outcome words, clock and steps; the detail lines; the hidden finish order as the one live region; ordinals; `Race` carries `task` and `label` | vitest `src/arena` and `src/screens/arena.test.tsx` green; biome | 7 (needs 1, 2, 6) |
| 9 | Self-check screens | `scripts/self-check.ts`, `scripts/self-check.browser.test.ts`, plus any screen file from steps 7 and 8 that a shortfall points to | check:self | The badges test and the 720 fit test, written before the four entries are added | `pnpm --filter @wayford/web check:self` exits 0 on 5 screens × 2 themes; vitest `scripts/self-check.browser.test.ts` green | none (needs 5, 7, 8) |
| 10 | Verify | `tasks/s3-12-design-pass-arena-run-detail.md` | all | none | `pnpm lint`, `pnpm typecheck`, `pnpm test` at the root; `pnpm --filter @wayford/web check:self`; screenshots of the Race in progress and the step replay at 1280 × 720 in both themes, beside the references; boxes ticked with evidence | none (last) |

## Notes

- **Order:** 1 → {2, 3, 4, 5} → {6 → 8, 7} → 9 → 10.
  - Step 6 imports the `Pip` type from step 2.
  - Step 7 needs steps 3 and 4.
  - Step 8 needs steps 2 and 6.
  - Step 9 needs steps 5, 7 and 8.
- **No dependency changes,** so no step touches `pnpm-lock.yaml`. Parallel steps have disjoint files.
- **While steps run in parallel,** the web package typecheck can show errors in files another step owns. Each step's done-check covers its own files: `tsc` errors are read only for those files. The full typecheck runs at 9 and 10.
- **Step 4** may turn `step-replay.test.tsx` red until step 7 rewrites it. That is expected, and nothing is committed with it red at the end of a wave.
- **Step 9** may restyle a screen file to fix a shortfall the check finds. That diff goes in step 9's commit.
- **Commits:** one per step, `s3-12: <step>`, made by the orchestrator after reading the step's diff and running its done-check.
- **Determinism rules** do not reach this task: no `Math.random`, and no clock in any fold. `clockText` formats a number it is given.

## Decision log

in the spec
