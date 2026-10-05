# s1-06 — Route-open share per persona and seed set: plan

Spec: none. An S task needs none, its task file is the spec (`docs/CONVENTIONS.md`, "Git"), so the design and its decisions sit here and go into the PR body.
Status: approved 2026-10-05 (auto)

## Design

- `route-table.ts`, pure:
  - `closingStep(results)`: the index of a route's first cut step in one seed, or -1 when no step is cut and the route is open. It is the one open rule. `routeSummary` reads its closings from it, and `routeOpenSeeds` reads -1 as open.
  - `routeOpenSeeds(walked, profile, seeds, options = {})` returns `RouteOpenSeed[]`, `{ seed, open }` per seed in the order given, with `open` the route ids in walk order.
  - `routesFor(walks, taskId, device)` returns that device's walked routes for `task_past-order`, the one task with a route table, and `undefined` for any other task.
- `routes.ts`, new, the Node-only entry `@wayford/filter/routes`. It re-exports `walkRoutes`, `routeOpenSeeds`, `routesFor` and their types. Its module comment says to walk once per process and reuse the result.
- `package.json` adds `"./routes": "./src/routes.ts"`. `./perceive` reaches none of it, and `perceive-imports.test.ts` already fails if it ever does, since the walk would reach Playwright.
- `scripts/routes.ts` imports `walkRoutes` from the entry. Its tables do not change.

## Decision log

| Question | Taken | Why |
|---|---|---|
| What `walked` is | one device's `readonly WalkedRoute[]`, so `profile` can be a bare `PerceiveProfile` | The task allows a `PerceiveProfile`, and it carries no device. `routesFor` picks the device's routes. |
| How the result is shaped | `{ seed, open: string[] }[]`, in the order of `seeds` | It is JSON as it stands, for the report and the sweep to store, and the counts are a `filter` away. Seed order keeps it next to the run set. |
| Whether `perceive` options are passed | an optional 4th `options`, `{}` by default as in `perceive` | The share is about the observations the runs got, so the caller passes the jargon its runs used (io's runner passes `targetAppJargon`). K2 only renames, so it never moves the number today. |
| Which task has a route table | `routesFor` matches the id `task_past-order` | The hard goal is that fixture task everywhere: calibration, s4-04, s4-05. Matching a glob against where the routes lead would add machinery for one task. |
| Where `routesFor` lives | `route-table.ts`, re-exported by `routes.ts` | It is pure, next to the table it names. The entry stays re-exports only. |
| A device that was not walked | `routesFor` throws | That is the caller's bug: it walked the wrong devices. |
| Where the `routeOpenSeeds` test lives | `routes.browser.test.ts`, importing from `./routes.js` | It reuses the walk that file already takes once, and it tests the entry's own exports. |

## Steps

| # | Step | Files | Serves box | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | `closingStep`, `routeOpenSeeds`, `routesFor`, the entry and the export | `src/route-table.ts`, `src/route-walk.ts` (comment), `src/routes.ts`, `package.json`, `scripts/routes.ts`, `src/routes.browser.test.ts` | 1, 2 | the four persona cases on seeds 1 to 10 and `routesFor`'s `undefined`, red against a missing export | `rtk proxy pnpm --filter @wayford/filter test` green | — |
| 2 | Verify | — | 1, 2, 3 | — | `pnpm lint`, `pnpm typecheck` and `pnpm test` at the root green, and `pnpm --filter @wayford/filter routes` identical to the output from before the change (`diff`) | — |

Step 1 is one step: every file in it serves the same export, and the build stays in one hand.
