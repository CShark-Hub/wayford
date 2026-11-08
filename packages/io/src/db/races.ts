/**
 * The races: each the run set one `POST /runs` started, stored so the web can reopen a race's live
 * view after leaving the screen or reloading, and list past races (issue #194). A race holds no
 * status. Whether it is still running is the runner's to say, at read time (`raceStatus` in
 * `routes/races.ts`), so no restart can leave a race "running" for good.
 *
 * A race is written twice at most: stored once when its runs start, and updated once by the stop
 * that drops its runs still waiting for a slot (#6), which records them in its `cancelled`.
 */
import { Race, WayfordError } from "@wayford/core";
import { desc, eq } from "drizzle-orm";
import { type Db, parseRow } from "./database.js";
import { atMillisecondWidth } from "./runs.js";
import { races } from "./schema.js";

const stored = { id: races.id, document: races.document };
const fromRow = (row: { id: string; document: unknown }) =>
  parseRow("races", row.id, Race, row.document);

/**
 * Store a race, once, when `POST /runs` has started its runs; a stop is the one later write
 * (`updateRace`). `started_at` is stored at millisecond width, so it sorts as text in time order;
 * the document keeps it as given.
 */
export async function saveRace(db: Db, race: Race): Promise<void> {
  const document = parseRow("races", race.id, Race, race);
  await db.insert(races).values({
    id: document.id,
    startedAt: atMillisecondWidth(document.startedAt),
    document,
  });
}

/**
 * Replace the document of the race stored under `race.id` with `race`, parsed on the way in as
 * `saveRace` parses it: how a stop records the runs it dropped (#6). `started_at` stays as
 * `saveRace` stored it. Throws `race_not_found` when no race is stored under that id, so a stop
 * never reads as recorded when nothing was written.
 */
export async function updateRace(db: Db, race: Race): Promise<void> {
  const document = parseRow("races", race.id, Race, race);
  const { changes } = await db.update(races).set({ document }).where(eq(races.id, document.id));
  if (changes === 0) {
    throw new WayfordError("race_not_found", `no races row ${document.id} to update`);
  }
}

/** The race with this id, or `undefined` when none is stored. */
export async function loadRace(db: Db, id: string): Promise<Race | undefined> {
  const [row] = await db.select(stored).from(races).where(eq(races.id, id));
  return row === undefined ? undefined : fromRow(row);
}

/** Every stored race, newest first; races that started together, by id, last first. */
export async function listRaces(db: Db): Promise<Race[]> {
  const rows = await db.select(stored).from(races).orderBy(desc(races.startedAt), desc(races.id));
  return rows.map(fromRow);
}
