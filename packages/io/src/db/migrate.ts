/**
 * `pnpm --filter @wayford/io db:migrate`: create the SQLite file `DATABASE_URL`
 * names, if it is missing, and apply every pending migration.
 */
import { loadConfigFromEnvFile } from "../config.js";
import { migrateDatabase, sqliteFilePath } from "./database.js";

const { DATABASE_URL } = loadConfigFromEnvFile();
migrateDatabase(DATABASE_URL);
console.log(`migrated ${sqliteFilePath(DATABASE_URL)}`);
