import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Task } from "@wayford/core";
import { taskFixture, taskFixtures } from "@wayford/core/fixtures";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test } from "vitest";
import { type Db, migrateDatabase, openDatabase } from "./database.js";
import { tasks } from "./schema.js";
import { listTasks, loadTask, saveTask } from "./tasks.js";

let dir: string;
let db: Db;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wayford-tasks-"));
  const url = `file:${join(dir, "wayford.sqlite")}`;
  migrateDatabase(url);
  db = openDatabase(url);
});
// Closed before the directory goes: Windows will not remove an open database file.
afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

test("every task fixture loads back deep-equal", async () => {
  for (const task of taskFixtures) await saveTask(db, task);
  for (const task of taskFixtures) {
    expect(await loadTask(db, task.id)).toStrictEqual(task);
  }
});

test("listTasks returns every stored task by id", async () => {
  for (const task of [...taskFixtures].reverse()) await saveTask(db, task);
  // By code unit, as SQLite compares text: `localeCompare` orders "-" and "_" the other way.
  const byId = [...taskFixtures].sort((a, b) => (a.id < b.id ? -1 : 1));
  expect(await listTasks(db)).toStrictEqual(byId);
});

test("an unknown id loads as undefined", async () => {
  expect(await loadTask(db, "task_missing")).toBeUndefined();
});

test("an invalid task is refused and nothing is stored", async () => {
  const routed = { ...taskFixture("task_past-order"), goal: "click the archive menu" } as Task;
  await expect(saveTask(db, routed)).rejects.toMatchObject({ code: "invalid_row" });
  expect(await listTasks(db)).toStrictEqual([]);
});

test("a tampered document fails loadTask and listTasks, naming the table and the id", async () => {
  const task = taskFixture("task_past-order");
  await saveTask(db, task);
  await db
    .update(tasks)
    .set({ document: { ...task, goal: "" } })
    .where(eq(tasks.id, task.id));
  for (const load of [() => loadTask(db, task.id), () => listTasks(db)]) {
    await expect(load()).rejects.toMatchObject({
      code: "invalid_row",
      message: expect.stringContaining("tasks row task_past-order"),
    });
  }
});
