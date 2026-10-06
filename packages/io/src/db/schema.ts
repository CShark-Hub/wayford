/**
 * The database schema. drizzle-kit generates the SQL into `drizzle/` from this
 * file, and `db:migrate` applies it.
 *
 * Every table follows one pattern: the whole record as a JSON document, and
 * real columns only for what a query filters or sorts on. `runs.ts`, `tasks.ts`,
 * `reports.ts`, `sweeps.ts` and `axe.ts` parse each document with its core
 * schema on the way in and out (`parseRow` in `database.ts`). `profiles` has no
 * read or write functions yet, so nothing checks its rows. Findings are stored
 * inside their report. `axe_results` holds one axe-core scan per target-app
 * page and app parameters, keyed by the page's URL.
 *
 * Written to stay Postgres-compatible (`docs/STACK.md`): `text`, `integer` and
 * `real` only, nothing SQLite-only. A switch rewrites this file with `pg-core`
 * and regenerates the migrations, with four columns taking another type there:
 * - `document` becomes `jsonb`;
 * - `runs.seed` becomes `bigint`, since a `uint32` seed overflows `integer`;
 * - `runs.cost_usd` becomes `double precision`, since Postgres `real` is 4 bytes;
 * - `runs.started_at` and `sweeps.started_at` become `timestamptz`. As `text`
 *   they sort correctly too, because `saveRun` and `saveSweep` store them at a
 *   fixed width.
 */
import {
  type AxeScan,
  type Profile,
  type Report,
  RUN_OUTCOMES,
  type RunResult,
  SWEEP_AXES,
  type Sweep,
  type Task,
} from "@wayford/core";
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
  /** The run's `sweep.sweepId`, null outside a sweep (issue #64), so sweep
   *  runs can be kept apart from a persona's own. */
  sweepId: text("sweep_id"),
  document: text("document", { mode: "json" }).$type<RunResult>().notNull(),
});

/**
 * A stored sweep is its whole `Sweep`, its values and boundary included. The
 * columns beside it are for the sweep list's filters and order, lifted out of
 * the document, `started_at` at a fixed width.
 */
export const sweeps = sqliteTable("sweeps", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  profileId: text("profile_id").notNull(),
  axis: text("axis", { enum: SWEEP_AXES }).notNull(),
  startedAt: text("started_at").notNull(),
  document: text("document", { mode: "json" }).$type<Sweep>().notNull(),
});

/**
 * A stored report is its whole `Report`, the latest one per task: a new report on a task replaces
 * the one before, since report history is out of scope (`tasks/s4-04-analyst.md`). Nothing filters
 * or sorts reports, so only `task_id` is lifted out.
 */
export const reports = sqliteTable("reports", {
  taskId: text("task_id").primaryKey(),
  document: text("document", { mode: "json" }).$type<Report>().notNull(),
});

/**
 * A stored axe result is its whole `AxeScan`: one target-app page at one set of app parameters,
 * scanned once. Its `url`, the page's path and the app's query with no origin, is the key; nothing
 * filters or sorts on anything else, so the scan time stays in the document.
 */
export const axeResults = sqliteTable("axe_results", {
  url: text("url").primaryKey(),
  document: text("document", { mode: "json" }).$type<AxeScan>().notNull(),
});
