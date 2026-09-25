import { defineConfig } from "drizzle-kit";

/**
 * For `db:generate`, which diffs `src/db/schema.ts` against the committed
 * migrations and writes the next one into `drizzle/`. Applying them is
 * `db:migrate`, which uses the app's own config (`src/db/database.ts`).
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
