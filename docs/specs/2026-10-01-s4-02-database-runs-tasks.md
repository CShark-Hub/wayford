# s4-02 — Database: runs and tasks: spec

Task: `tasks/s4-02-database-schema.md` · Branch: `feature/s4-02-database-schema` · Date: 2026-10-01
Status: approved 2026-10-01

## Goal

Runs and tasks can be stored and loaded unchanged, and runs listed by task, persona and outcome, so s4-03 can store real runs without more schema work.

## Constraints that bind

- Follow the `profiles` pattern: the whole record goes in a JSON document column and is parsed with the core schema on the way out. Real columns exist only for what a query filters or sorts on (task).
- `runs` columns beside the document: id, task, profile, seed, outcome, duration, cost in USD, start time. Steps stay inside the document (task). A steps table is out of scope.
- Postgres-compatible, so no SQLite-only types or functions (`docs/PLAN.md` A15). Tables and columns are `snake_case` and plural, `camelCase` in code (`docs/CONVENTIONS.md`, "Naming").
- Loading validates with the core schema. A row that fails raises an error naming the table and the id, never a partial record (task).
- Migrations are generated with `db:generate` and committed. `db:migrate` stays the only way to apply them (task, `docs/STACK.md` "Migrations").
- A boundary throws `WayfordError` with a `code` (`docs/CONVENTIONS.md`, "Errors").
- Out of scope: findings, sweeps and axe results; HTTP routes (s4-03).

## Design

### Tables, `packages/io/src/db/schema.ts`

```ts
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  document: text("document", { mode: "json" }).$type<Task>().notNull(),
});

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  profileId: text("profile_id").notNull(),
  seed: integer("seed").notNull(),
  outcome: text("outcome", { enum: RUN_OUTCOMES }).notNull(),
  durationMs: integer("duration_ms").notNull(),
  costUsd: real("cost_usd").notNull(),
  startedAt: text("started_at").notNull(),
  document: text("document", { mode: "json" }).$type<RunResult>().notNull(),
});
```

The generated SQL uses only `text`, `integer` and `real`, `PRIMARY KEY` and `NOT NULL`. The `outcome` enum is TypeScript-only; on disk it is plain `text`. The file's header comment is updated: it lists the tables and gives the Postgres type for each column, for whoever switches:

- `document` becomes `jsonb`.
- `seed` becomes `bigint`, because a `uint32` seed overflows Postgres `integer`.
- `cost_usd` becomes `double precision`, because Postgres `real` is 4 bytes.
- `started_at` becomes `timestamptz`. Kept as `text`, it still sorts correctly, because it is always stored at the fixed width set below.

### Functions

`packages/io/src/db/database.ts` gains:

```ts
/** The open database, as `openDatabase` returns it. */
export type Db = ReturnType<typeof openDatabase>;

/**
 * `schema.parse(value)`, or a `WayfordError` with code `invalid_row` whose
 * message names the table and the id, with the `ZodError` on `cause`.
 * Used on the way in and on the way out.
 */
export function parseRow<T>(table: string, id: string, schema: ZodType<T>, value: unknown): T;
```

`packages/io/src/db/tasks.ts`:

```ts
export async function saveTask(db: Db, task: Task): Promise<void>;
export async function loadTask(db: Db, id: string): Promise<Task | undefined>;
export async function listTasks(db: Db): Promise<Task[]>; // by id, ascending
```

`packages/io/src/db/runs.ts`:

```ts
export type RunFilter = { taskId?: string; profileId?: string; outcome?: RunOutcome };

/** `startedAt` is the run's `runStarted` timestamp: `RunResult` does not carry it. */
export async function saveRun(db: Db, run: RunResult, startedAt: string): Promise<void>;
export async function loadRun(db: Db, id: string): Promise<RunResult | undefined>;
/** Every run matching all the keys given, newest first: `started_at` desc, then `id` desc. */
export async function listRuns(db: Db, filter?: RunFilter): Promise<RunResult[]>;
```

The data flow:

- **Save.** `parseRow` runs the value through `Task` or `RunResult`. The parsed value becomes the document, and the columns are lifted from it. `startedAt` goes through `parseRow` with `z.iso.datetime()` and is stored as `new Date(startedAt).toISOString()`. That fixes the width, so text order is time order. The save is a plain insert. A second save of the same id throws the driver's primary-key error, since a run is stored once, when it ends.
- **Load.** Select by id. No row gives `undefined`. A row gives `parseRow` of its document.
- **List.** `and(...)` over `eq` for each key given (Drizzle drops `undefined` conditions). Then the order above, and `parseRow` on each document.

The functions are `async` and `await` the query builders. Drizzle's SQLite builders are awaitable, and every Postgres driver is async-only, so s4-03's call sites survive the A15 switch.

### Migration

`db:generate` with `--name runs_and_tasks` writes three files: `drizzle/0001_runs_and_tasks.sql`, `drizzle/meta/0001_snapshot.json` and an entry in `drizzle/meta/_journal.json`. The `--name` flag keeps the file name readable, matching `0000_init`.

### Barrel

Two lines go into `packages/io/src/index.ts`, `./db/runs.js` and `./db/tasks.js`. The barrel already exports `db/database` and `db/schema`.

## Files

| File | Why |
|---|---|
| `packages/io/src/db/schema.ts` | The `tasks` and `runs` tables, plus the header comment. |
| `packages/io/src/db/database.ts` | The `Db` type and `parseRow`, shared by the two modules. |
| `packages/io/src/db/tasks.ts`, `tasks.test.ts` | Save, load and list tasks, with their tests. |
| `packages/io/src/db/runs.ts`, `runs.test.ts` | Save, load and list runs, with their tests. |
| `packages/io/drizzle/0001_runs_and_tasks.sql`, `meta/0001_snapshot.json`, `meta/_journal.json` | Generated. |
| `packages/io/src/index.ts` | Outside the list: the two barrel lines above. |
| `tasks/s4-02-database-schema.md` | The box ticks and an Outcome section for the migrate box's path (decision log). |

Each test file migrates a fresh SQLite file in a temp dir per test, as `database.test.ts` does. `afterEach` closes `db.$client` before it removes the dir, because on Windows `rmSync` fails with EBUSY on an open database (a "(build)" row below).

## Acceptance mapping

| Acceptance box | Proven by |
|---|---|
| io tests pass and include a round-trip test for runs and for tasks | `pnpm --filter @wayford/io test`, with `runs.test.ts` and `tasks.test.ts`. |
| Saving then loading `runResultFixture` and every task fixture gives a deep-equal value | `runs.test.ts`: "the fixture run loads back deep-equal". `tasks.test.ts`: "every task fixture loads back deep-equal". Both use `toStrictEqual`. |
| Listing runs by task, profile and outcome returns the fixture run for matching values only | `runs.test.ts`: "listRuns returns the fixture run for matching task, profile and outcome only". It saves the fixture and a variant of it that differs in every filtered key: another id, `task_next-parcel`, `prof_ada` and `success`. Then it queries each key alone and all three together. A matching value returns the fixture alone, which leaves the variant out. The fixture's task and profile with the variant's outcome return `[]`. A `listRuns` that ignored any one key would fail. |
| `rm -f packages/io/wayford.sqlite && pnpm --filter @wayford/io db:migrate` creates the tables, and a second run is a no-op | At verify, run the box as written, then `rm -f wayford.sqlite` and the same migrate at the root. After each run, a `node -e` one-liner in `packages/io` lists the tables and the `__drizzle_migrations` rows. The second run must leave both unchanged. The existing test "migrating an up-to-date database again keeps its data" covers the same thing. |
| Root lint, typecheck and test pass | The three commands. |

Tests outside the boxes:

- A tampered document makes `loadRun`, `listRuns`, `loadTask` and `listTasks` throw `invalid_row` naming the table and the id.
- An invalid run or task makes its save throw and store nothing.
- An unknown id loads as `undefined`.
- `listRuns()` with no filter returns runs newest first.

## Decision log

| Question | Taken | Why |
|---|---|---|
| Where the start time comes from | It is `saveRun`'s third argument, the `runStarted` timestamp. `loadRun` and `listRuns` do not return it. | `RunResult` has no start time, and core is frozen. The first step's `startedAt` is a later instant (10:00:01 against 10:00:00 in the fixture), and it is absent on a run that fails before its first observation. s4-03 folds the events, so it has `events[0].timestamp`. Load and list return core shapes, and the column orders the list. |
| The start time's format | ISO text, normalized to millisecond UTC with `toISOString()`. | At a fixed width, text order is time order. Text is portable; Postgres would take `timestamptz`. |
| Validate on save | Yes, with the same schema, storing the parsed value. | A bad document fails at the write that made it, not in the dashboard's list. A load then returns exactly what was stored. |
| The error | One code on save and load: `WayfordError` `invalid_row`, naming table and id, with the `ZodError` on `cause`. | This is the task's constraint, and `code` is what s4-03 branches on. |
| A missing row | `undefined`. | s4-03 maps it to `404`. A missing row is not an error. |
| The same id saved twice | A plain insert, so the driver's primary-key error propagates. | A run is stored once, when it ends, and ids are minted once. An upsert would hide a double store. |
| `tasks` columns | `id` and `document` only. | Nothing filters or sorts tasks: `GET /tasks` lists them all. |
| Foreign keys | None. | s4-03 may serve profiles from the fixture files rather than the table, and an FK would also force a write order on F11's seed script. A run's document already names its task and profile. |
| Indexes | None. | A hackathon stores hundreds of runs, and a full scan of that is sub-millisecond. An index is one line in `schema.ts` when it is needed. |
| Column types | `text`, `integer`, `real`, with the Postgres mapping in `schema.ts`'s header. | All three exist in Postgres. The header names the four columns that take another type there. |
| Backticks in the generated SQL | Accepted. | They are drizzle-kit's SQLite dialect output, as in `0000_init`. A Postgres switch regenerates the migrations from a `pg-core` schema. The reviewer's check is on types and functions. |
| Sync or async | `async`. | Postgres drivers are async-only. Async now keeps s4-03's call sites when A15's switch comes. |
| Module layout | `db/runs.ts` and `db/tasks.ts`, with `parseRow` in `database.ts`, plus the barrel lines. | One feature per file. s4-03 can add profiles the same way. |
| `listRuns` order | `started_at` desc, then `id` desc. | Newest first is the dashboard's order. The id makes the order total. |
| Filters | `taskId`, `profileId` and `outcome`. Seed, duration and cost are columns only. | The three filters are F7 AC1 and s4-03's query string. Duration and cost serve F7 AC2 and the dashboard's cost, and seed serves the week 4 sweep. All are listed by the task. |
| The migrate box's path | Run as written plus at the root path, with an Outcome note in the task file. | `sqliteFilePath` resolves a relative `DATABASE_URL` from the repository root (m0-07), so `db:migrate` writes `<root>/wayford.sqlite`. The box's `rm -f packages/io/wayford.sqlite` removes a file it never writes. The box's intent still holds in a fresh worktree. |
| The migration's name | `0001_runs_and_tasks`, set with `--name`. | It matches `0000_init` rather than drizzle-kit's random name. |
| Closing each test's database (build) | `afterEach` closes `db.$client` before it removes the temp dir, in place of a `finally` in each test. | It gives the same guarantee, since `afterEach` runs when a test fails, without repeating the close in 14 tests. |
| A stored document that is not JSON at all (build, from the branch review) | The limit is stated in `parseRow`'s comment, not handled. Such a row fails with Drizzle's bare `SyntaxError`, which names no table and no id. | Only a write that goes around `saveRun` and `saveTask` can store one. Handling it means giving up Drizzle's JSON column for these two tables. |
| Where the start time is checked and widened (build, simplify pass) | One schema, `z.object({ startedAt: z.iso.datetime().transform(...) })`, parsed through `parseRow`. | The width rule sits on the schema that names it, and a bad start time's error says `at startedAt` rather than reading like a bad document. |
| The error for a duplicate id (build, the branch review's question) | The driver's own error (`SQLITE_CONSTRAINT_PRIMARYKEY` here), accepted for now. | No caller has to tell a duplicate apart yet. s4-03 or F11's seed script can wrap it in a code when one does. |

Settled by recommendation. Rows added during the build are marked "(build)".

## Risks

- **pnpm 12 and arguments.** pnpm 12 may mangle `--name` the way it does vitest's flags (memory). The fallback is `pnpm --filter @wayford/io exec drizzle-kit generate --name runs_and_tasks`, the same command that `db:generate` runs.
- **Unexpected SQL.** drizzle-kit may emit something unplanned, such as a table rebuild. The SQL is read before committing.
- **A `.env` in the worktree.** One that sets `DATABASE_URL` would move the migrate box's file. This worktree is fresh, and `.env` is gitignored and never read here.

## Review note

One round with the `spec-reviewer` agent. Verdict "ready after fixes": one blocking finding and three nits, all taken.

- **The list test (blocking).** The variant shared the fixture's `taskId`, so a `listRuns` that ignored the task key would have passed. The variant now differs in every filtered key, and a value no run has is queried too.
- **`started_at` on Postgres (nit).** The header's mapping now names it.
- **`listTasks` (nit).** It is added to the tampered-document test.
- **Closing the database (nit).** Each test's database is closed before its temp dir is removed, because Windows will not remove an open file. The build does it in `afterEach`, not a `finally` in each test (see the decision log's "(build)" row).

No finding was rejected.
