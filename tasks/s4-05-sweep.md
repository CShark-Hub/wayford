# s4-05 — Sweep: the boundary value on one capability axis

Stream: s4
Milestone: week 4
Size: L
Depends on: s1-06. The Jev box waits for s2-12.

## Context

Read first, in this order:

- `AGENTS.md` section "Untouchable core", point 3
- `docs/PLAN.md` F9, all five criteria, and A20 (one seed set reused for every value)
- `docs/RULES.md` "Monotone per perception rule" and the calibration row "Sweep on contrast"
- `packages/io/src/runner.ts` — `start(task, profiles, seeds)` takes `Profile` objects, so a swept profile is one in memory
- `packages/core/src/run.ts` — `RunSweep`, the optional `sweep` on `runStarted` and `RunResult` (landed for issue #64)

## Goal

One command runs a task for one persona across a range of one capability, the same seeds at every value, and store the success rate, the route-open share and the boundary value per value.

## Interface

- In: task, persona, axis (`contrast` or `maxElements`), from, to, step, seeds (at most 10), backend
- Out:
  - `Sweep` in `@wayford/core` with a fixture: id, inputs, per value the run ids, successes, route-open seeds, and the boundary or `null`;
  - already landed, part of #64: an optional `sweep: { sweepId, axis, value }` on `runStarted` and `RunResult`, carried by `runResultFromEvents`; `runActor`'s `sweep` option, refused unless its value is the one the profile sets; io's `fakeRun` carries it too; a `sweep_id` column on `runs`, filled by `saveRun`. Left here: passing `sweep` through the runner, whose `start` takes none yet, in the same PR as the `GET /runs` exclusion, so no sweep run is ever counted as the persona's own;
  - a `sweeps` table;
  - `GET /sweeps` and `GET /sweeps/:id`. A sweep is started in process by the CLI and by `seed:demo`; there is no `POST /sweeps`, since no screen starts one;
  - `pnpm --filter @wayford/io sweep -- --task … --persona … --axis … --from … --to … --step … --seeds 1-10 [--backend jev]` printing the table and the boundary.
- Files expected to change: new `packages/core/src/sweep.ts`, its test and fixture, `packages/core/src/index.ts`, `packages/io/src/runner.ts`, `packages/io/src/sweep*.ts`, `routes/sweeps.ts`, `routes/runs.ts`, `db/`, a new migration

## Constraints

- **Axes.** `contrast` sets `perception.contrast.threshold` and keeps its softness (F9 AC4). `maxElements` sets `behaviour.maxElements`. Nothing else in the profile and nothing in the app changes during a sweep.
- **Same seeds at every value** (F9 AC3). Values run from the laxest to the strictest, one run set each, through the runner's existing five slots.
- **The axis decides which end is laxest.** For `contrast` the lowest threshold is laxest, so values run upwards. For `maxElements` the highest cap is laxest, so values run downwards. The engine orders the range by axis, whatever order `--from` and `--to` are given in.
- **Boundary.** The first value, from the laxest, whose success rate falls below 50% (F9 AC5). With none, the sweep says "no boundary up to <last value>".
- **Route-open per value** comes from `routeOpenSeeds` with the swept profile.
- **Sweep runs stay out of persona stats.** `GET /runs` leaves out runs with a `sweep` unless asked for one `sweepId`, so the dashboard and the report do not count Vera at 4.5:1 as Vera.
- **Cost guard.** Before it starts, the sweep estimates its cost as `calibrate` does and refuses past a limit (`--max-usd`, default 2).

## Acceptance

- [ ] `pnpm --filter @wayford/core test` passes; the `Sweep` fixture parses
- [ ] `pnpm --filter @wayford/io test` passes with a fake backend:
  - every value runs the same seeds;
  - the boundary is the first value below 50%, and `null` when there is none;
  - on a `maxElements` sweep from 4 to 16, values run 16 down to 4, and a fake that fails below a cap of 12 gives the boundary 12, not 4;
  - on Vera's contrast, successes never exceed route-open seeds at any value (the RULES bound);
  - sweep runs are absent from `GET /runs` and present under their `sweepId`.
- [ ] With a real key on Jev, Vera's contrast from 1.5 to 4.5 in steps of 0.5 and Kai's `maxElements` from 4 to 16 in steps of 2, seeds 1 to 10, on `task_past-order`: both tables, boundaries, wall time and cost in the PR
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- The sweep screen (`s3-09`).
- Sweeping two axes at once, or any target-app parameter.
- Resuming a sweep after io restarts. A sweep cut off by a restart stays incomplete and says so.

## Notes for the reviewer

- Check that the swept profile is built once per value and that its softness never moves.
- Check the boundary on a rate that dips and recovers: the first dip below 50% wins.
