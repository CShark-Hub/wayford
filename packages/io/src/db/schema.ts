/**
 * The database schema. drizzle-kit generates the SQL into `drizzle/` from this
 * file, and `db:migrate` applies it.
 *
 * Every table follows one pattern: the whole record as a JSON document, and
 * real columns only for what a query filters or sorts on. `runs.ts` and
 * `tasks.ts` parse each document with its core schema on the way in and out
 * (`parseRow` in `database.ts`). `profiles` has no read or write functions yet,
 * so nothing checks its rows. Findings, sweeps and axe results get tables with
 * their features.
 *
 * Written to stay Postgres-compatible (`docs/STACK.md`): `text`, `integer` and
 * `real` only, nothing SQLite-only. A switch rewrites this file with `pg-core`
 * and regenerates the migrations, with four columns taking another type there:
 * - `document` becomes `jsonb`;
 * - `runs.seed` becomes `bigint`, since a `uint32` seed overflows `integer`;
 * - `runs.cost_usd` becomes `double precision`, since Postgres `real` is 4 bytes;
 * - `runs.started_at` becomes `timestamptz`. As `text` it sorts correctly too,
 *   because `saveRun` stores it at a fixed width.
 */
import { type Profile, RUN_OUTCOMES, type RunResult, type Task } from "@wayford/core";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * A saved profile is its whole `Profile`. `id` and `label` are lifted out of
 * the document so a list needs no JSON.
 */
export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  document: text("document", { mode: "json" }).$type<Profile>().notNull(),
});

/** A saved task is its whole `Task`. Nothing filters or sorts tasks, so only `id` is lifted out. */
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  document: text("document", { mode: "json" }).$type<Task>().notNull(),
});

/**
 * A stored run is its whole `RunResult`, steps included: a replay loads the
 * run. The columns beside it are for the dashboard's filters, figures and order
 * (`docs/PLAN.md` F7), lifted out of the document except `started_at`, which
 * `saveRun` is given.
 */
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
