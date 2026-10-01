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
- `runs` columns beside the document: id, task, profile, seed, outcome, duration, cost in USD, start time (F7 AC1, AC2). Steps stay inside the document.
- Postgres-compatible: no SQLite-only types or functions (A15). Tables and columns `snake_case` and plural (`docs/CONVENTIONS.md`).
- Loading validates with the core schema. A row that fails raises an error naming the table and the id, never a silently partial record.
- Migrations generated with `db:generate` and committed. `db:migrate` stays the only way to apply them.

## Acceptance

- [x] `pnpm --filter @wayford/io test` passes and includes a round-trip test for runs and for tasks. 7 files, 46 tests. `packages/io/src/db/runs.test.ts` holds 8 of them and `tasks.test.ts` 5, and `database.test.ts` gains 1 for `parseRow`.
- [x] Saving then loading `runResultFixture` and every task fixture returns a deep-equal value. The tests are "the fixture run loads back deep-equal" and "every task fixture loads back deep-equal", both with `toStrictEqual`. "the columns are lifted out of the document, the start time beside it at millisecond width" checks each column against the fixture too.
- [x] A test lists runs by task, profile and outcome and gets the fixture run back for matching values only. The test is "returns the fixture run for matching task, profile and outcome only". Beside the fixture it stores a run that differs in every filtered key: `task_next-parcel`, `prof_ada` and `success`. For each key alone, the fixture's value returns the fixture alone, which leaves the other run out. All three keys together return `[fixture]`, and the fixture's task and profile with the other run's outcome return `[]`.
- [x] `rm -f packages/io/wayford.sqlite && pnpm --filter @wayford/io db:migrate` creates the tables, and a second run is a no-op. Run as written in a worktree with no database file. It printed `migrated <worktree>\wayford.sqlite`: the file sits at the repository root, see Outcome.
  - **First run.** It created `__drizzle_migrations`, `profiles`, `runs` and `tasks`, with two migration rows: `0000_init` and `0001_runs_and_tasks`.
  - **Second run.** Same tables, same two rows, with the same hashes and timestamps.
  - **At the root.** `rm -f wayford.sqlite` and the same command gave the same four tables and two rows.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root. Lint checked 151 files with no fixes, typecheck passed in every package, and the tests ran 48 files, 745 tests.

## Out of scope

- A separate steps table. A replay loads the run; a few dozen steps is not worth a join.
- Findings, sweeps and axe results. They get storage with their features in week 4.
- HTTP routes. They come with s4-03.

## Notes for the reviewer

- Open the generated SQL. Any SQLite-only construct blocks the merge.

## Outcome

What shipped, for the next reader. The design and every decision are in `docs/specs/2026-10-01-s4-02-database-runs-tasks.md`.

- **Two tables** in `packages/io/src/db/schema.ts`, with migration `packages/io/drizzle/0001_runs_and_tasks.sql`.
  - `tasks` holds `id` and `document`.
  - `runs` holds `id`, `task_id`, `profile_id`, `seed`, `outcome`, `duration_ms`, `cost_usd`, `started_at` and `document`.
  - The SQL uses only `text`, `integer`, `real`, `PRIMARY KEY` and `NOT NULL`. The schema's header names the wider Postgres type four columns take on a switch: `document` → `jsonb`, `seed` → `bigint`, `cost_usd` → `double precision`, `started_at` → `timestamptz`.
  - There are no foreign keys and no indexes.
- **Storage functions.** `saveTask`, `loadTask` and `listTasks` are in `db/tasks.ts`; `saveRun`, `loadRun` and `listRuns` in `db/runs.ts`. All are async: Drizzle's SQLite builders are awaited, so a Postgres driver keeps the call sites.
  - Every document goes through its core schema on save and on load (`parseRow` in `database.ts`). A failure throws `WayfordError` `invalid_row` naming the table and the id.
  - A missing id loads as `undefined`. Saving an id twice throws the driver's primary-key error.
- **The start time is an argument.** `RunResult` has no start time, so `saveRun(db, run, startedAt)` takes the run's `runStarted` timestamp. s4-03 has it as `events[0].timestamp`. It is stored at millisecond width, so `started_at` sorts as text. It orders `listRuns` (newest first, then by id) and is not returned: loads and lists return plain `RunResult`s.
- **The migrate box's path.** A relative `DATABASE_URL` resolves from the repository root (`sqliteFilePath`, m0-07), so `db:migrate` writes `<root>/wayford.sqlite`. The box's `rm -f packages/io/wayford.sqlite` removes a file that is never written. On a checkout that already has a database, the command to start fresh is `rm -f wayford.sqlite && pnpm --filter @wayford/io db:migrate`.
- **Outside the files expected:** two lines in `packages/io/src/index.ts`, the io barrel, which already exported `db/database` and `db/schema`.
