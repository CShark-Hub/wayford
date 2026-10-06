import type { Report } from "@wayford/core";
import { reportFixture } from "@wayford/core/fixtures";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test } from "vitest";
import { type TempStore, tempStore } from "../test-app.js";
import { loadReport, saveReport } from "./reports.js";
import { reports } from "./schema.js";

let store: TempStore;
beforeEach(async () => {
  store = await tempStore();
});
afterEach(async () => {
  await store.close();
});

const report = reportFixture("task_past-order");

test("a saved report loads back deep-equal", async () => {
  await saveReport(store.db, report);
  expect(await loadReport(store.db, report.taskId)).toStrictEqual(report);
});

test("a second report on the same task replaces the first, in one row", async () => {
  await saveReport(store.db, report);
  const later: Report = {
    ...report,
    analysedAt: "2026-10-06T09:00:00.000Z",
    analystModelId: "anthropic/claude-opus-5.5",
  };
  await saveReport(store.db, later);
  expect(await loadReport(store.db, report.taskId)).toStrictEqual(later);
  expect(store.db.select().from(reports).all()).toHaveLength(1);
});

test("a task with no stored report loads as undefined", async () => {
  // A stored report, so a lookup that ignored the task id would return it.
  await saveReport(store.db, report);
  expect(await loadReport(store.db, "task_next-parcel")).toBeUndefined();
});

test("an invalid report is refused and nothing is stored", async () => {
  const miscounted = { ...report, runCount: report.runCount + 1 } as Report;
  await expect(saveReport(store.db, miscounted)).rejects.toMatchObject({ code: "invalid_row" });
  expect(store.db.select().from(reports).all()).toStrictEqual([]);
});

test("a tampered document fails loadReport, naming the table and the task", async () => {
  await saveReport(store.db, report);
  await store.db
    .update(reports)
    .set({ document: { ...report, backend: "scout" } as unknown as Report })
    .where(eq(reports.taskId, report.taskId));
  await expect(loadReport(store.db, report.taskId)).rejects.toMatchObject({
    code: "invalid_row",
    message: expect.stringContaining("reports row task_past-order"),
  });
});
