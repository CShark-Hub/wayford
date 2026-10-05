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

- [x] `pnpm --filter @wayford/filter test` passes, with a test of `routeOpenSeeds` on seeds 1 to 10:
  - Ada: every seed has A, B and C open.
  - Kai: every seed has B and C open, A closed.
  - Vera at her defaults: only A, and only in the seeds where the hard link is degraded.
  - Vera with the hard cut (contrast 3.0, softness 0): no route in any seed.

  12 files, 266 tests passed. The four cases are the `routeOpenSeeds on seeds 1 to 10` tests in `routes.browser.test.ts`. Vera's degraded seeds come from `perceive` on `/deliveries` directly, not from the route table: A is open in seeds 1, 6, 7 and 8, 4 of 10.
- [x] `pnpm --filter @wayford/filter routes` prints the same tables as before this task (diff in the PR). `diff` of the output on `origin/main` against the branch: empty.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root. Biome checked 273 files with no fixes, typecheck is clean, and 102 files with 1550 tests passed.

## Out of scope

- A route table for the easy goal.
- Any HTTP endpoint. The Analyst (`s4-04`) and the sweep (`s4-05`) call the function in process.

## Notes for the reviewer

- Check that the open rule lives in one place and that the RULES table did not move.

## Outcome

Shipped as the interface says, with two additions:

- `routeOpenSeeds(walked, profile, seeds, options = {})` takes an optional fourth argument, `perceive`'s options. The caller passes the jargon its runs were given, so the number is about the observations those runs got. K2 only renames, so the jargon does not move the number today.
- `routesFor(walks, taskId, device)` is the helper the constraints mention. It returns the walk on the persona's device for the hard goal, `task_past-order`, `undefined` for any other task, and throws for a device that was not walked. `walked` is one device's routes, so `profile` can be a bare `PerceiveProfile`.

The open rule is `closingStep` in `route-table.ts`: the index of a route's first cut step in one seed, or -1 when the route is open. `routeSummary` reads its closings from it, and `routeOpenSeeds` reads -1 as open.
