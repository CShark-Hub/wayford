# s3-09 — Boundary screen: plan

Task: `tasks/s3-09-sweep-screen.md` · Spec: `docs/specs/2026-10-06-s3-09-boundary-screen.md`
Status: approved 2026-10-06 (auto)

Every path is under `packages/web/` unless it says otherwise. Every vitest command runs from the worktree root as `rtk proxy ./node_modules/.bin/vitest run --project @wayford/web <files>`.

| # | Step | Files | Serves box | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | io's sweeps for the web | `src/api/sweeps.ts`, `src/api/sweeps.test.ts`, `src/api/runs.ts` (one `export`) | 1 (curves), 4 (empty preset) | `sweeps.test.ts`: the filtered URL; parses `Sweep[]`; `fetchSweep` encodes the id; 404 is `null`; io's error rejects in its words; a non-sweep body rejects; the query keys | vitest on `src/api/sweeps.test.ts src/api/runs.test.ts` passes | 2 |
| 2 | What a sweep says, and how its axis reads | `src/boundary/axis.ts`, `axis.test.ts`, `src/boundary/reading.ts`, `reading.test.ts` | 1, 2 | `reading.test.ts`: four readings on Vera's fixture and the two variants built through `Sweep.parse`, plus `claimedRows` and `shares` with a null route table. `axis.test.ts`: `proseValue`, `gridValue` including a `from` > `to` grid, `seedsLabel`, `presetOf` | vitest on both files passes | 1 |
| 3 | The chart | `src/boundary/sweep-chart.tsx`, `sweep-chart.test.tsx` | 1, 2 | Static markup on Vera: route, through, gap, one post with the flag `boundary 3.0:1 · 2/10`, ticks 1.5 to 4.5. No boundary: "no boundary up to 4.5:1", no post. Stopped at 2.5: the stop line and its label, no post, no "no boundary", no point past 2.5. Null route table: no route line and no gap. The flag flips near the right edge. | vitest on `sweep-chart.test.tsx` passes | — (after 2) |
| 4 | The screen and its wiring | `src/boundary/value-table.tsx`, `value-runs.tsx`, `sweep-view.tsx`, `src/screens/boundary.tsx`, `boundary.test.tsx`, `src/router.tsx`, `src/components/top-bar.tsx`, `top-bar.test.tsx` | 1–4 | `boundary.test.tsx`, on the app's router with a seeded query client: `/boundary` opens Vera's latest sweep with its headline; `?axis=maxElements` opens Kai's; the switch has both presets; every cell links to `?value=<v>`; `?value=3` lists the ten runs, in seed order, as links to `/runs/$runId`, with outcomes from seeded `runQuery` data; an empty preset says how to run one; `/boundary/<unknown>` is the not-found empty state; the no-boundary and stopped headlines; the fault banner; the skeleton while pending; `SweepSource` reads `stored` and the backend. `top-bar.test.tsx`: `05 Boundary`, current on `/boundary`, `/boundary?axis=maxElements` and `/boundary/swp_…` | `pnpm --filter @wayford/web typecheck` and vitest on `src/screens/boundary.test.tsx src/components/top-bar.test.tsx src/router.test.tsx` pass | — (after 1, 2, 3) |
| 5 | The self-check lists the screen | `scripts/self-check.ts` | `check:self` | `scripts/self-check.browser.test.ts` already runs every listed screen in both themes | `pnpm --filter @wayford/web check:self` exits 0 with three screens listed | — (after 4) |
| 6 | Verify | `tasks/s3-09-sweep-screen.md` | all | — | see below | — (last) |

Step 4 notes:

- The table, the runs cells and the view are tested through the routed screen, as the spec's Files section says.
- Search params are typed through TanStack's `validateSearch`.
- A cell's `Link` keeps the current route: `/boundary` with `axis`, or `/boundary/$sweepId`, and sets `value`.

Step 6 runs every box's command and reads the real output:

1. `rtk proxy pnpm lint`, `pnpm typecheck`, `rtk proxy pnpm test` at the root.
2. `rtk proxy pnpm --filter @wayford/web test`.
3. `pnpm --filter @wayford/web check:self`.
4. `rg -n recharts packages/web/src -g '!runs/**'`.
5. For the screenshot box:
   - Store the demo's two sweeps in a scratch database: `pnpm seed:demo --fake` if PR #177 has merged, else core's fixture sweeps through io's `saveSweep`.
   - Start io on that database and web on it.
   - Take Playwright screenshots at 1280 × 720 of `/boundary` and `/boundary?axis=maxElements`, in Daylight and Night.
   - Check `scrollHeight <= 720` with no value open, and that one click on the switch changes the sweep.
   - Put the reference `docs/design/screens/boundary.html` beside them.
6. Tick each box with its evidence, and add an Outcome section if anything differs from the task file.

## Decision log

In the spec.
