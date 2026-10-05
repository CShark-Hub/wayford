# s1-06 — Route-open share per persona and seed set

Stream: s1
Milestone: week 4
Size: S
Depends on: none (s1-03 is merged)

## Context

Read first, in this order:

- `docs/PLAN.md` F8 AC6 and F9 AC2 — the two numbers this feeds
- `docs/RULES.md` "Calibration", the route table and its preamble
- `packages/filter/src/route-table.ts` and `route-walk.ts` — the walk and `routeSummary`, which compute the table over seeds 1 to 100
- `packages/filter/scripts/routes.ts` — the one caller today

## Goal

Any Node caller can ask "for this profile and these run seeds, which routes to the hard goal did the filter leave open, per seed", so the report, the sweep and the Analyst read one number from one function.

## Interface

- In: a `Profile` (or a `PerceiveProfile`), a list of `Seed`s, and the walked routes
- Out: from a Node-only subpath, `@wayford/filter/routes`: `walkRoutes` as today, and `routeOpenSeeds(walked, profile, seeds)` returning, per seed, the ids of the routes the filter left open
- Files expected to change: `packages/filter/src/route-table.ts`, `packages/filter/src/route-walk.ts`, a new `packages/filter/src/routes.ts` entry, `packages/filter/package.json` (`exports`), `packages/filter/scripts/routes.ts`

## Constraints

- A route is open in a seed when no step of it is cut, the same rule `routeSummary` applies. One function decides it, and `routeSummary` and `routeOpenSeeds` both call it.
- The walk is the hard goal's routes on the target app at its defaults. A task with no route table gets `undefined` from whatever helper maps a task to routes, and every screen shows that as "—", never as 0.
- `@wayford/filter/perceive` stays browser-safe: nothing it reaches imports the new subpath.
- The walk launches a browser and takes seconds. Callers walk once per process and reuse the result; say in the module comment that they should.

## Acceptance

- [ ] `pnpm --filter @wayford/filter test` passes, with a test of `routeOpenSeeds` on seeds 1 to 10:
  - Ada: every seed has A, B and C open.
  - Kai: every seed has B and C open, A closed.
  - Vera at her defaults: only A, and only in the seeds where the hard link is degraded.
  - Vera with the hard cut (contrast 3.0, softness 0): no route in any seed.
- [ ] `pnpm --filter @wayford/filter routes` prints the same tables as before this task (diff in the PR)
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- A route table for the easy goal.
- Any HTTP endpoint. The Analyst (`s4-04`) and the sweep (`s4-05`) call the function in process.

## Notes for the reviewer

- Check that the open rule lives in one place and that the RULES table did not move.
