# s4-02 — Database: runs and tasks

Stream: s4
Milestone: week 2
Size: S
Depends on: m0-07, issues #13, #14 and #15 (the run record's shape)

## Context

Read first, in this order:

- `docs/PLAN.md` assumption A15 and F7
- `docs/STACK.md` section "API" — Drizzle and drizzle-kit
- `docs/CONVENTIONS.md` section "Naming" — tables and columns
- `packages/io/src/db/` after m0-07 — the `profiles` table, the pattern to follow
- `packages/core/src/run.ts` and `packages/core/src/task.ts` after issues #13 to #15

## Goal

Runs and tasks can be stored and loaded unchanged, and runs queried by what the dashboard filters on, so week 3 can store real runs without more schema work.

## Interface

- In: `RunResult` and `Task` from `@wayford/core`
- Out: Drizzle tables `runs` and `tasks` next to the existing `profiles`; a generated migration; save, load and list functions in `packages/io/src/db/`
- Files expected to change: `packages/io/src/db/**`, `packages/io/drizzle/**`

## Constraints

- The same pattern as `profiles` from m0-07: the whole record as a JSON document column, parsed with the core schema on the way out, plus real columns only for what a query filters or sorts on.
- `runs` columns beside the document: id, task, profile, seed, run index, outcome, duration, cost in USD, start time (F7 AC1, AC2). Steps stay inside the document.
- Postgres-compatible: no SQLite-only types or functions (A15). Tables and columns `snake_case` and plural (`docs/CONVENTIONS.md`).
- Loading validates with the core schema. A row that fails raises an error naming the table and the id, never a silently partial record.
- Migrations generated with `db:generate` and committed. `db:migrate` stays the only way to apply them.

## Acceptance

- [ ] `pnpm --filter @wayford/io test` passes and includes a round-trip test for runs and for tasks
- [ ] Saving then loading `runResultFixture` and every task fixture returns a deep-equal value
- [ ] A test lists runs by task, profile and outcome and gets the fixture run back for matching values only
- [ ] `rm -f packages/io/wayford.sqlite && pnpm --filter @wayford/io db:migrate` creates the tables, and a second run is a no-op
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- A separate steps table. A replay loads the run; a few dozen steps is not worth a join.
- Findings, sweeps and axe results. They get storage with their features in week 4.
- HTTP routes. They come with s4-03.

## Notes for the reviewer

- Open the generated SQL. Any SQLite-only construct blocks the merge.
