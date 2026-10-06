import { RunResult, type SweepId } from "@wayford/core";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { type Db, parseRow } from "./database.js";
import { runs } from "./schema.js";

/**
 * What `listRuns` narrows by. Every key given must match; none given lists every run outside a
 * sweep. A sweep's runs are listed only by their `sweepId`, so they are never counted as the
 * persona's own: on the dashboard, or by the Analyst through this same function.
 */
export type RunFilter = Partial<Pick<RunResult, "taskId" | "profileId" | "outcome">> & {
  /** One sweep's runs. Without it, sweep runs are left out, so none counts as its persona's own. */
  sweepId?: SweepId;
  /**
   * Every run, sweep runs included, for a reader that leaves them out itself and says how many, as
   * the Analyst does (s4-04). Not on `GET /runs`, whose query cannot name it.
   */
  sweeps?: "include";
};

/**
 * A valid timestamp at millisecond width, so `started_at` sorts as text in time order: runs' and
 * sweeps'.
 */
export const atMillisecondWidth = (timestamp: string): string => new Date(timestamp).toISOString();

const StartedAt = z.object({ startedAt: z.iso.datetime().transform(atMillisecondWidth) });

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
    sweepId: document.sweep?.sweepId ?? null,
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
  const { taskId, profileId, outcome, sweepId, sweeps } = filter;
  const rows = await db
    .select(stored)
    .from(runs)
    .where(
      and(
        taskId === undefined ? undefined : eq(runs.taskId, taskId),
        profileId === undefined ? undefined : eq(runs.profileId, profileId),
        outcome === undefined ? undefined : eq(runs.outcome, outcome),
        sweepId !== undefined
          ? eq(runs.sweepId, sweepId)
          : sweeps === "include"
            ? undefined
            : isNull(runs.sweepId),
      ),
    )
    .orderBy(desc(runs.startedAt), desc(runs.id));
  return rows.map(fromRow);
}
