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

- [x] `pnpm --filter @wayford/core test` passes; the `Sweep` fixture parses. Both fixtures (Vera on contrast, Kai on `maxElements`) parse in `sweep.test.ts`, beside a rejection for each break of the contract's checks.
- [x] `pnpm --filter @wayford/io test` passes with a fake backend:
  - every value runs the same seeds;
  - the boundary is the first value below 50%, and `null` when there is none;
  - on a `maxElements` sweep from 4 to 16, values run 16 down to 4, and a fake that fails at a cap of 12 or below gives the boundary 12, not 4;
  - on Vera's contrast, successes never exceed route-open seeds at any value (the RULES bound);
  - sweep runs are absent from `GET /runs` and present under their `sweepId`.

  Evidence:
  - `sweep.test.ts` (12 tests) covers the first three.
  - `sweep.browser.test.ts` covers the bound on the real filter, not a fake one. Vera on contrast 2.0, 3.0 and 4.0, seeds 1, 2, 3 and 6, with real `runActor`, the route walk and a fake Actor that follows route A through masked names, succeeds on exactly the route-open seeds: 4/4, 2/2 (the degraded seeds 1 and 6) and 0/0. An exact-name fake turns it red.
  - `routes/runs.test.ts` and `db/runs.test.ts` cover the last.
- [x] With a real key on Jev, Vera's contrast from 1.5 to 4.5 in steps of 0.5 and Kai's `maxElements` from 4 to 16 in steps of 2, seeds 1 to 10, on `task_past-order`: both tables, boundaries, wall time and cost in the PR. Run 2026-10-06 on `typesafe/jev-1.13`; the tables are below and in the PR.

  **Vera, contrast:** `swp_01m47w6a632awns7gmq9rc1c61`. Boundary **3.0** (rate 40%), wall time 2 m 10 s, 0.0425 USD (estimated 0.1176).

  | value | success | route-open | errors |
  |---|---|---|---|
  | 1.5 | 10/10 | 10/10 | 0 |
  | 2.0 | 10/10 | 10/10 | 0 |
  | 2.5 | 5/10 | 5/10 | 0 |
  | 3.0 | 4/10 | 4/10 | 0 |
  | 3.5 | 1/10 | 1/10 | 0 |
  | 4.0 | 0/10 | 0/10 | 0 |
  | 4.5 | 0/10 | 0/10 | 0 |

  Successes equal the route-open seeds at every value, which is the RULES bound held exactly. 2.5 is 5/10, not below 50%, so the boundary is 3.0.

  **An earlier run** (`swp_01m47t7wx16ymhrxm1xmcy8hz1`, 13 m 02 s, 0.0426 USD) had the same numbers, except that two runs at 1.5 errored on a loaded machine: a page-input timeout and a Jev call timeout, both in the first run set. Under the errors rule it stored no boundary ("no boundary: 1.5 had errors"), which is the rule refusing to claim past an unmeasured value.

  **Kai, maxElements:** `swp_01m47v0h707dsy8845a2jsgynd`. Boundary **12** (rate 0%), wall time 1 m 54 s, 0.0427 USD (estimated 0.1176).

  | value | success | route-open | errors |
  |---|---|---|---|
  | 16 | 10/10 | 10/10 | 0 |
  | 14 | 10/10 | 10/10 | 0 |
  | 12 | 0/10 | 10/10 | 0 |
  | 10 | 0/10 | 10/10 | 0 |
  | 8 | 0/10 | 0/10 | 0 |
  | 6 | 0/10 | 0/10 | 0 |
  | 4 | 0/10 | 0/10 | 0 |

  At caps 12 and 10, the filter leaves a route open on every seed and Kai still gets nowhere. That gap is the agent's own wayfinding (F9 AC2): a hypothesis, not a measurement. Kai's own cap, 11, falls inside it.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root: 118 files, 1789 tests, after merging s4-04 (#170).

## Outcome

Built as `docs/specs/2026-10-05-s4-05-sweep.md` says. Its decision log holds every choice, the ones taken during the build and the reviews marked "(build)". What a reader of this file should know:

- **Base.** The task builds on PR #165, the sweep fields on the run record (part of #64), and PR #167 (s2-12), which runs a run set on a chosen backend. Both are on `main`. The runner takes the sweep as a field of #167's `RunSetOptions`.
- **The contract.** `Sweep` is a new contract at rest in core (`sweep.ts`), flat and discriminated on `axis`, with a `complete` or `incomplete` status. Its check recomputes the boundary from the stored numbers, and core holds the pure helpers `sweepValues`, `boundaryOf`, `sweptValueOf` and `sweptProfile`. Agent's sweep check uses `sweptValueOf`, so the mapping from axis to field lives once.
- **Errors.** A run that errors, or is never stored, counts in `errors`. The boundary stops at the first value with any error and is null from there, so a crash never produces a boundary. The CLI exits 1 when any run errored.
- **Personas without the field.** A contrast sweep on a persona with no contrast threshold is refused (`sweep_axis_unset`). A `maxElements` sweep on a persona with no cap is allowed.
- **Route-open.** It is `null` and prints "—" for a task with no route table.
- **The cost guard has two halves:** the up-front estimate (agent's `estimateUsd`, now on its barrel through `models.ts`) and a stop before the next value once the stored spend reaches `--max-usd`.
- **The CLI.** `pnpm --filter @wayford/io sweep -- --task … --persona … --axis … --from … --to … --step … --seeds 1-10 [--backend jev] [--max-usd 2]`.
  - Every refusal comes before anything is served.
  - It serves the target app on 5174 itself and walks the routes once, when the task has a route table.
  - It is one of three io modules, with `server.ts` and the `analyse` CLI, to load agent's runtime, and it stays out of the barrel.
- **Files outside the expected list:**
  - in agent: `actor-loop.ts`, `models.ts`, `calibration.ts`, `calibration-run.ts`, `calibration.test.ts` and `index.ts`;
  - in agent: `package.json` (the `./cli` export) and `cli.ts`, so the sweep CLI imports `calibrate`'s helpers instead of copying them;
  - in io: `runner.test.ts`, `sweep.browser.test.ts`, `app.ts`, `index.ts`, and comments in `server.ts` and `chromium.ts`;
  - `run.ts` and its test changed in #165, not here.

## Out of scope

- The sweep screen (`s3-09`).
- Sweeping two axes at once, or any target-app parameter.
- Resuming a sweep after io restarts. A sweep cut off by a restart stays incomplete and says so.

## Notes for the reviewer

- Check that the swept profile is built once per value and that its softness never moves.
- Check the boundary on a rate that dips and recovers: the first dip below 50% wins.
