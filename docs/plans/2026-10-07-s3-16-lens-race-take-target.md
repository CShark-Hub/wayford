# s3-16 — The Lens and the Race take a target: plan

Task: `tasks/s3-16-lens-race-take-target.md` · Spec: `docs/specs/2026-10-07-s3-16-lens-race-take-target.md`
Status: approved 2026-10-07 (auto)

All paths are under `packages/web/`. Every command runs from the worktree root.

| # | Step | Files | Serves box | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | Lens data: the `url` param, `LensUrl`, the page as a path or URL, and io's params | `src/preview/search.ts`, `src/api/measure.ts`, `src/api/axe.ts`, `src/preview/search.test.ts`, `src/api/measure.test.ts`, `src/api/axe.test.ts` | 1 (`url=` resolved and measured) | `search.test.ts`: "a url= link resolves to that page off the target app, and wins over page=", "a refused url= reads as absent: nope, file:///etc/passwd and 123 open /deliveries, and none throws", "a page link drops url=, a URL link drops page=, a persona link keeps either". `measure.test.ts` and `axe.test.ts`: "a URL page asks io with url=, keyed by the whole URL" | `pnpm --filter @wayford/web exec vitest run src/preview/search.test.ts src/api/measure.test.ts src/api/axe.test.ts` green | 3 |
| 2 | Lens screen: the URL form, the stage union, no jargon off the target app, the URL copy, and the illustration's page as a string | `src/screens/lens.tsx`, `src/preview/illustration.tsx`, `src/screens/lens.test.tsx` | 1, 2, 3 | `lens.test.tsx`: "a url= link measures and draws that page, live, opened as given", "a failed URL page draws no page, never the stored /deliveries, and says why", "Kai on a url= page gets no jargon list: Fulfilment ledger is masked on page= and not on url=", "the URL form shows the page's URL, is noValidate, and opens a page by URL; a refused value shows the alert and navigates nowhere", "on a URL page the picker marks no page, and the illustration view links to /deliveries" | `pnpm --filter @wayford/web exec vitest run src/screens/lens.test.tsx` green, and every existing Lens test unchanged | 3, 4 (after 1) |
| 3 | Race state: `Goal`, stored goals, `goalChosen`, `initialPanel(goal?)`, and the calls reading `state.goal` | `src/arena/panel-state.ts`, `src/arena/panel-calls.ts`, `src/arena/fixture-race.ts`, `src/arena/panel-state.test.ts`, `src/arena/panel-calls.test.ts` | 4 (stored goal, no new check) | `panel-state.test.ts`: "a stored goal opens checked, and an edit of its sentence asks a check with its start URL and success", "storedGoals keeps io's order and leaves a preset's id out". `panel-calls.test.ts`: "a stored goal starts with POST /runs alone, no POST /tasks" | `pnpm --filter @wayford/web exec vitest run src/arena/panel-state.test.ts src/arena/panel-calls.test.ts` green | 1, 2 |
| 4 | Race view (as built: superseded by the spec's "The Race on main after #204 to #208 (build)"): the stored-goal select and its states (width capped, text truncated), the start line, `?task=`, the opening goal settled on a settled fetch, and the reducer moved into a keyed `RaceSetup` | `src/arena/start-panel.tsx`, `src/screens/arena.tsx`, `src/arena/start-panel.test.tsx`, `src/screens/arena.test.tsx` | 4 | `arena.test.tsx`: "/race?task= opens on the stored goal, checked, with its start and success shown", "/race?task= while the list loads shows a status and no panel", "/race?task= of no stored task opens the demo goal under a line naming the id", "/race?task= with a stale cached list waits for the refetch before choosing", "a failed list opens the demo goal at once (no retry)". `start-panel.test.tsx`: "stored goals are listed by host and goal; loading is a skeleton, a failure a line", "a preset's line is unchanged" | `pnpm --filter @wayford/web exec vitest run src/arena src/screens/arena.test.tsx` green | 2 (after 3) |
| 5 | Self-check: method-aware answers (PR #208's hunk), `/tasks` for the Race, new `lens · url` and `race · stored goal` entries, `race`'s ready waiting for `#arena-stored-goal` | `scripts/self-check.ts` | 6 (`check:self`) | `scripts/self-check.browser.test.ts` runs every listed screen; the two new entries are its test | `pnpm --filter @wayford/web check:self` passes | none (after 2 and 4) |
| 6 | Verification: lint, typecheck, test, `check:self`, the `pnpm dev` check, ticking the boxes and the Outcome | `tasks/s3-16-lens-race-take-target.md` | all | none | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @wayford/web check:self` green; the `pnpm dev` box done or left to the user with steps | none |

Notes:

- Steps 1→2 (the Lens) and 3→4 (the Race) are two tracks with disjoint files, and no step changes `pnpm-lock.yaml`.
- Step 2 keeps every existing Lens test passing untouched where its behaviour is unchanged: beats 1 to 3 do not move.
- Step 4 keeps `arena.test.tsx`'s three existing tests and `start-panel.test.tsx`'s preset tests as they are, apart from the rename `presetId` → `goal`: beat 4 does not move.
- Step 5's `self-check.browser.test.ts` runs as part of `pnpm test`.
- Step 6 also runs `lens.browser.test.ts` (in `pnpm test`), whose no-scroll check holds the Lens at 1280 × 720 with the new URL row.

## Decision log

in the spec
