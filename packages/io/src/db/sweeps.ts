import { type ProfileId, Sweep, type SweepAxis } from "@wayford/core";
import { and, desc, eq } from "drizzle-orm";
import { type Db, parseRow } from "./database.js";
import { atMillisecondWidth } from "./runs.js";
import { sweeps } from "./schema.js";

/** What `listSweeps` narrows by. Every key given must match; none given lists every sweep. */
export type SweepFilter = { profileId?: ProfileId; axis?: SweepAxis };

const stored = { id: sweeps.id, document: sweeps.document };
const fromRow = (row: { id: string; document: unknown }) =>
  parseRow("sweeps", row.id, Sweep, row.document);

/**
 * Store a sweep, or replace the one stored under its id: a sweep is saved
 * before its first value and again after each, so the row always holds its
 * latest state. `started_at` is stored at millisecond width, so it sorts as
 * text in time order; the document keeps it as given.
 */
export async function saveSweep(db: Db, sweep: Sweep): Promise<void> {
  const document = parseRow("sweeps", sweep.id, Sweep, sweep);
  const columns = {
    taskId: document.taskId,
    profileId: document.profileId,
    axis: document.axis,
    startedAt: atMillisecondWidth(document.startedAt),
    document,
  };
  await db
    .insert(sweeps)
    .values({ id: document.id, ...columns })
    .onConflictDoUpdate({ target: sweeps.id, set: columns });
}

/** The sweep with this id, or `undefined` when none is stored. */
export async function loadSweep(db: Db, id: string): Promise<Sweep | undefined> {
  const [row] = await db.select(stored).from(sweeps).where(eq(sweeps.id, id));
  return row === undefined ? undefined : fromRow(row);
}

/** Every sweep matching the filter, newest first; sweeps that started together, by id, last first. */
export async function listSweeps(db: Db, filter: SweepFilter = {}): Promise<Sweep[]> {
  const { profileId, axis } = filter;
  const rows = await db
    .select(stored)
    .from(sweeps)
    .where(
      and(
        profileId === undefined ? undefined : eq(sweeps.profileId, profileId),
        axis === undefined ? undefined : eq(sweeps.axis, axis),
      ),
    )
    .orderBy(desc(sweeps.startedAt), desc(sweeps.id));
  return rows.map(fromRow);
}
