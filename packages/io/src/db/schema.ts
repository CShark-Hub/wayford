/**
 * The database schema. One table so far, there to prove the pipeline: the
 * schema is written here, drizzle-kit generates the SQL into `drizzle/`, and
 * `db:migrate` applies it. Tasks, runs, steps and findings arrive with their
 * features.
 *
 * Written to stay Postgres-compatible (`docs/STACK.md`): plain text columns,
 * JSON stored as text, nothing SQLite-only.
 */
import type { Profile } from "@wayford/core";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * A saved profile is its whole `Profile`, validated before it is written.
 * `id` and `label` are lifted out of the document so a list needs no JSON.
 */
export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  document: text("document", { mode: "json" }).$type<Profile>().notNull(),
});
