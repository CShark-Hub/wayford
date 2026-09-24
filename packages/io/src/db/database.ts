import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";

/** The committed migrations, written by `db:generate`. */
const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle/", import.meta.url));

/**
 * `DATABASE_URL` is `file:<path>`; better-sqlite3 takes the bare path. A
 * relative path resolves against the working directory, which is the io
 * package whenever pnpm runs the script.
 */
export function sqliteFilePath(databaseUrl: string): string {
  return databaseUrl.replace(/^file:/, "");
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
