import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WayfordError } from "@wayford/core";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { type ZodType, z } from "zod";
import { ENV_FILE } from "../config.js";
import * as schema from "./schema.js";

/** The committed migrations, written by `db:generate`. */
const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle/", import.meta.url));

/**
 * The file better-sqlite3 opens for a `DATABASE_URL`: `file:<path>`, a
 * `file://` URL, a bare path, or `:memory:`. A relative path resolves from the
 * repository root, where `.env` lives, so one value names one file whichever
 * directory a script starts in. SQLite URI extras such as `file::memory:` or a
 * `?mode=ro` query are not supported and would be read as part of the path.
 */
export function sqliteFilePath(databaseUrl: string): string {
  if (databaseUrl === ":memory:") return databaseUrl;
  if (databaseUrl.startsWith("file://")) return fileURLToPath(databaseUrl);
  return resolve(dirname(ENV_FILE), databaseUrl.replace(/^file:/, ""));
}

/** Open the database, creating the file if it does not exist. Close with `db.$client.close()`. */
export function openDatabase(databaseUrl: string) {
  return drizzle({ client: new Database(sqliteFilePath(databaseUrl)), schema });
}

/** The open database, as `openDatabase` returns it. */
export type Db = ReturnType<typeof openDatabase>;

/**
 * Parse a row's value with its core schema, on the way in and on the way out,
 * so a stored record loads back exactly as written or not at all. A value that
 * fails throws a `WayfordError` with code `invalid_row` naming the table and
 * the id, the `ZodError` on `cause`: never a partial record. A document that is
 * not JSON at all fails earlier, in Drizzle's JSON column, with a bare
 * `SyntaxError`; only a write that goes around `saveRun` and `saveTask` can
 * store one.
 */
export function parseRow<T>(table: string, id: string, schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new WayfordError(
      "invalid_row",
      `${table} row ${id} is invalid:\n${z.prettifyError(parsed.error)}`,
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

/** Apply every migration the database has not seen yet. Safe to run on an up-to-date database. */
export function migrateDatabase(databaseUrl: string): void {
  const db = openDatabase(databaseUrl);
  try {
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    db.$client.close();
  }
}
