import { Report, type TaskId } from "@wayford/core";
import { eq } from "drizzle-orm";
import { type Db, parseRow } from "./database.js";
import { reports } from "./schema.js";

/**
 * Store a task's report, replacing the one stored before it: the latest report per task is the
 * one kept, since report history is out of scope (`tasks/s4-04-analyst.md`).
 */
export async function saveReport(db: Db, report: Report): Promise<void> {
  const document = parseRow("reports", report.taskId, Report, report);
  await db
    .insert(reports)
    .values({ taskId: document.taskId, document })
    .onConflictDoUpdate({ target: reports.taskId, set: { document } });
}

/** The report on this task, or `undefined` when none is stored. */
export async function loadReport(db: Db, taskId: TaskId): Promise<Report | undefined> {
  const [row] = await db.select().from(reports).where(eq(reports.taskId, taskId));
  return row === undefined ? undefined : parseRow("reports", row.taskId, Report, row.document);
}
