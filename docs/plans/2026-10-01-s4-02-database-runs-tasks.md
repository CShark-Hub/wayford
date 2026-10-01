# s4-02 — Database: runs and tasks: plan

Spec: `docs/specs/2026-10-01-s4-02-database-runs-tasks.md`
Status: approved 2026-10-01

| # | Step | Files | Serves box | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | Tables, migration, `Db` and `parseRow` | `packages/io/src/db/schema.ts`, `database.ts`, `database.test.ts`, `packages/io/drizzle/**` | migrate box, and the base for every round trip | `database.test.ts`: "parseRow returns the parsed value" and "parseRow throws invalid_row naming the table and the id" | The two tests pass. `0001_runs_and_tasks.sql` is read and holds only `text`, `integer`, `real`, `PRIMARY KEY` and `NOT NULL`. A second `db:generate` reports nothing to do. `pnpm --filter @wayford/io typecheck` passes. | — |
| 2 | Tasks: save, load, list | `packages/io/src/db/tasks.ts`, `tasks.test.ts` | io tests with a task round trip; every task fixture deep-equal | `tasks.test.ts`: every task fixture loads back deep-equal; `listTasks` by id; an unknown id is `undefined`; an invalid task's save throws and stores nothing; a tampered document makes `loadTask` and `listTasks` throw `invalid_row` | `pnpm --filter @wayford/io exec vitest run src/db/tasks.test.ts` passes | 3 |
| 3 | Runs: save, load, list | `packages/io/src/db/runs.ts`, `runs.test.ts` | io tests with a run round trip; `runResultFixture` deep-equal; the list box | `runs.test.ts`: the fixture run loads back deep-equal; `listRuns` by each key and all three, against the fixture and a variant differing in every key, plus a value no run has; no filter means newest first; an unknown id is `undefined`; an invalid run or `startedAt` throws on save and stores nothing; a tampered document makes `loadRun` and `listRuns` throw `invalid_row` | `pnpm --filter @wayford/io exec vitest run src/db/runs.test.ts` passes | 2 |
| 4 | Barrel lines | `packages/io/src/index.ts` | — | none: `index.test.ts` already imports the barrel | `pnpm --filter @wayford/io test` and `pnpm typecheck` pass | — |
| 5 | Verify | `tasks/s4-02-database-schema.md` | every box | — | `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root. The migrate box passes as written and with the root path (`rm -f wayford.sqlite`): tables listed, and the second run leaves the tables and the `__drizzle_migrations` rows unchanged. Boxes ticked with their evidence, plus an Outcome note on the migrate box's path. | — |

Notes:

- **Step 1.** Generate with `pnpm --filter @wayford/io db:generate --name runs_and_tasks`. If pnpm 12 mangles the flag, run `pnpm --filter @wayford/io exec drizzle-kit generate --name runs_and_tasks`. The `outcome` column imports `RUN_OUTCOMES` from `@wayford/core`.
- **Steps 2 and 3.** They touch disjoint files. The barrel is its own step so neither one edits `index.ts`. An S task is built by the orchestrator alone (start-task, "Build"), so they run in sequence anyway. Each test's database is closed before its temp dir is removed (`afterEach` in the build, see the spec's "(build)" row).
- **Step 3's variant run.** `{ ...runResultFixture, id: "run_ada-easy-1", taskId: "task_next-parcel", profileId: "prof_ada", outcome: "success" }`. It parses: `RunResult`'s refine only places incomplete and wasted steps, and the fixture's wasted step 3 is not last.
- **No step touches** `pnpm-lock.yaml` or any package outside io.
