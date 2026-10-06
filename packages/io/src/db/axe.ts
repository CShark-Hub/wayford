/**
 * The stored axe-core scans, one per target-app page and app parameters, keyed by the page's URL.
 *
 * A stored scan is kept until it is cleared, and nothing clears it on its own: a change to the
 * target app or an axe-core upgrade keeps serving the old scan. To scan again, run
 * `DELETE FROM axe_results` on the database `DATABASE_URL` names; the next request then scans
 * afresh.
 */
import { AxeScan } from "@wayford/core";
import { eq } from "drizzle-orm";
import { type Db, parseRow } from "./database.js";
import { axeResults } from "./schema.js";

/** Store a page's scan, replacing the one stored under its URL. */
export async function saveAxeScan(db: Db, scan: AxeScan): Promise<void> {
  const document = parseRow("axe_results", scan.url, AxeScan, scan);
  await db
    .insert(axeResults)
    .values({ url: document.url, document })
    .onConflictDoUpdate({ target: axeResults.url, set: { document } });
}

/** The scan stored under this URL, or `undefined` when none is stored. */
export async function loadAxeScan(db: Db, url: string): Promise<AxeScan | undefined> {
  const [row] = await db.select().from(axeResults).where(eq(axeResults.url, url));
  return row === undefined ? undefined : parseRow("axe_results", row.url, AxeScan, row.document);
}
