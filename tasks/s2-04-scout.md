# s2-04 — Scout: ground truth per task

Stream: s2
Milestone: week 3
Size: S
Depends on: s2-03

## Context

Read first, in this order:

- `AGENTS.md` section "Scout is mandatory"
- `docs/PLAN.md` F4
- `packages/agent/src/` after s2-03 — the loop Scout reuses
- `packages/core/src/task.ts` — a task and its success condition
- `packages/target-app/README.md` section "Goals" — the two known routes

## Goal

For each task an unconstrained run records whether the goal is reachable, the path it took and the target element, so the report can tell "the feature is broken" from "the feature works but Vera could not find it".

## Interface

- In: `Task`
- Out: a `GroundTruth` schema and fixture in core (task id, reached or not, the path as URLs and element keys, the target element's key and page); `scout(task)` from `@wayford/agent`; one JSON file per task under `runs/ground-truth/`
- Files expected to change: `packages/agent/src/**`, new `packages/core/src/ground-truth.ts` with its test and fixture, `packages/core/src/fixtures/index.ts`, `packages/core/src/index.ts` (one line)

## Constraints

- Full vision: a profile with no thresholds, no caps, every pattern known, and no behaviour dice. Model role `scout`. Up to 3 attempts; the shortest successful one is the ground truth, and no success is a result too.
- Run it by hand when the target app changes. No cache and no DOM hash: we own the app and know when it changes.
- "The Actor has no access to Scout's output" (`AGENTS.md`). A test walks the imports from the Actor entry and fails if a Scout module or the ground-truth directory appears (F4 AC3).

## Acceptance

- [ ] `pnpm --filter @wayford/core test` and `pnpm --filter @wayford/agent test` pass, and the ground-truth fixture validates
- [ ] With a scripted fake, Scout on the hard goal records the path `/`, `/deliveries`, `/deliveries/archive` and the "Order archive" key as the target
- [ ] A probe import of the Scout module on the Actor path makes the import test fail; the output is in the PR and the probe is removed
- [ ] With a real key, Scout reaches both target-app goals and writes both files (output in the PR)
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Using ground truth in the report, and calling Scout from the runs API. Week 4, with the Analyst.
- Caching, invalidation, a database table.

## Notes for the reviewer

- If a real Scout run fails, the fallback is a hand-written ground-truth file per task: both routes are in `packages/target-app/README.md`. Do not let Scout block anything else.
- Lint does not guard F4 AC3: the Biome rules in `biome.json` work per package and see direct imports only (`docs/STACK.md`, "Package import rules"), so the import-walking test is the guard.
