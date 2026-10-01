import { RunResult } from "@wayford/core";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { type Db, parseRow } from "./database.js";
import { runs } from "./schema.js";

/** What `listRuns` narrows by. Every key given must match; none given lists every run. */
export type RunFilter = Partial<Pick<RunResult, "taskId" | "profileId" | "outcome">>;

/** At millisecond width, so `started_at` sorts as text in time order. */
const StartedAt = z.object({
  startedAt: z.iso.datetime().transform((t) => new Date(t).toISOString()),
});

const stored = { id: runs.id, document: runs.document };
const fromRow = (row: { id: string; document: unknown }) =>
  parseRow("runs", row.id, RunResult, row.document);

/**
 * Store a run, once, when it has ended. `startedAt` is its `runStarted`
 * timestamp, which `RunResult` does not carry. An id already stored throws the
 * driver's primary-key error.
 */
export async function saveRun(db: Db, run: RunResult, startedAt: string): Promise<void> {
  const document = parseRow("runs", run.id, RunResult, run);
  const start = parseRow("runs", run.id, StartedAt, { startedAt });
  await db.insert(runs).values({
    id: document.id,
    taskId: document.taskId,
    profileId: document.profileId,
    seed: document.seed,
    outcome: document.outcome,
    durationMs: document.durationMs,
    costUsd: document.cost.usd,
    startedAt: start.startedAt,
    document,
  });
}

/** The run with this id, or `undefined` when none is stored. */
export async function loadRun(db: Db, id: string): Promise<RunResult | undefined> {
  const [row] = await db.select(stored).from(runs).where(eq(runs.id, id));
  return row === undefined ? undefined : fromRow(row);
}

/** Every run matching the filter, newest first; runs that started together, by id, last first. */
export async function listRuns(db: Db, filter: RunFilter = {}): Promise<RunResult[]> {
  const { taskId, profileId, outcome } = filter;
  const rows = await db
    .select(stored)
    .from(runs)
    .where(
      and(
        taskId === undefined ? undefined : eq(runs.taskId, taskId),
        profileId === undefined ? undefined : eq(runs.profileId, profileId),
        outcome === undefined ? undefined : eq(runs.outcome, outcome),
      ),
    )
    .orderBy(desc(runs.startedAt), desc(runs.id));
  return rows.map(fromRow);
}
