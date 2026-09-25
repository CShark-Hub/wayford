import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
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

/** Apply every migration the database has not seen yet. Safe to run on an up-to-date database. */
export function migrateDatabase(databaseUrl: string): void {
  const db = openDatabase(databaseUrl);
  try {
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    db.$client.close();
  }
}
