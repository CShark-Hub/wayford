# s3-15 — Target screen: a site and a goal in, every screen out: plan

Task: `tasks/s3-15-target-screen.md` · Spec: `docs/specs/2026-10-07-s3-15-target-screen.md`
Status: approved 2026-10-07 (auto)

| # | Step | Files | Serves box | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | io calls: `startRuns` takes `backend`, `storedTaskQuery`, Scout's two calls | `packages/web/src/api/runs.ts`, `api/runs.test.ts`, `api/scout.ts`, `api/scout.test.ts` | 1, 3 | See note 1 | `rtk proxy ./node_modules/.bin/vitest run --project @wayford/web packages/web/src/api` green | 2 |
| 2 | The screen's rules | `packages/web/src/target/target-state.ts`, `target-state.test.ts` | 1 | See note 2 | `rtk proxy ./node_modules/.bin/vitest run --project @wayford/web packages/web/src/target` green | 1 |
| 3 | The calls | `packages/web/src/target/target-calls.ts`; its tests in `packages/web/src/screens/target.test.tsx` | 1 | See note 3 | `rtk proxy ./node_modules/.bin/vitest run --project @wayford/web packages/web/src/screens/target.test.tsx` green | — (after 1 and 2) |
| 4 | The views, the screen and its route | `packages/web/src/target/target-view.tsx`, `packages/web/src/screens/target.tsx`, `packages/web/src/router.tsx`, `screens/target.test.tsx` | 1, 2 | See note 4 | `rtk proxy ./node_modules/.bin/vitest run --project @wayford/web` green; `rtk proxy pnpm --filter @wayford/web typecheck` green | — (after 3) |
| 5 | The top bar's Target link, and DESIGN's two lines | `packages/web/src/components/top-bar.tsx`, `top-bar.test.tsx`, `docs/DESIGN.md` | 1 | `top-bar.test.tsx`: Target links to `/target` and sits outside the story nav, which still holds exactly 01 to 05 | `rtk proxy ./node_modules/.bin/vitest run --project @wayford/web packages/web/src/components/top-bar.test.tsx` green | — (after 4: the link type-checks only once the route exists) |
| 6 | The self-check's four entries | `packages/web/scripts/self-check.ts` | 4 | The entries are the test: `target`, `target · refused`, `target · goal`, `target · report` | `rtk proxy pnpm --filter @wayford/web check:self` exits 0 with the four listed | — (after 4 and 5) |
| 7 | Verify | `tasks/s3-15-target-screen.md` for the ticks | all | — | See note 7 | — |

Notes:

1. Step 1's tests first:
   - `scout.test.ts`: GET 200, 202, 404, 502 with io's error, a non-JSON 502 and a 500; POST 202 and 404.
   - `runs.test.ts`: `backend` is sent only when given; `storedTaskQuery` finds the task, or answers `null`.
2. Step 2's tests first, in `target-state.test.ts`:
   - each form edit resets the check;
   - `formBlocker`'s order;
   - `taskRequestOf` trims and builds `success`;
   - an ok answer leaves the form unchecked;
   - persona and seed edits only when no set is starting, running or reporting;
   - `runsStarting` from idle, reported and reportFailed only;
   - `runsPolled`: the last run stored moves the set to `reporting` and counts an attempt, and `error` is kept until a clean poll;
   - `reportAsked` counts an attempt from idle, running, reported and reportFailed, and returns the same state elsewhere;
   - `seedsOf`, `runSetBlocker`, `runButtonLabel`, `progressLine`, `scoutLine`;
   - `runsRequestOf` in profiles' order, with `backend: "llm"`.
3. Step 3's tests first, in `target.test.tsx`:
   - `checkTarget` on 201, 422 and 502;
   - `readScout` and `startScout` dispatching each state, a rejection included;
   - `startRunSet` POSTs `backend: "llm"` and the seeds;
   - `pollRunSet` dispatches only the stored runs, and a rejected call as `error`;
   - `writeReport` POSTs `{ backend: "llm" }` and dispatches only its answer.
4. Step 4's tests first, in `target.test.tsx`:
   - the four the task names: "a refused goal blocks every start", "an accepted goal shows the links with the task id", "the run set's progress line", "the report link once the runs end";
   - the empty state for an unknown id, and the fault banner;
   - "Write the report" while idle or running;
   - none of `docs/DEMO.md`'s banned words.
5. Steps 1 and 2 touch disjoint files and run in parallel. No step changes `pnpm-lock.yaml`: no dependency is added.
6. Every command runs in the worktree. Lint is Biome through `rtk proxy pnpm lint`. vitest runs through `rtk proxy` so its output is read as is.
7. Step 7 runs:
   - `rtk proxy pnpm lint`, `rtk proxy pnpm typecheck`, `rtk proxy pnpm test`, and `check:self`;
   - the `pnpm dev` box by hand, on a public site, with Ada and Vera on three seeds;
   - the Scout box, if PR #191 has merged.

## Decision log

In the spec.
