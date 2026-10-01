import { Task } from "@wayford/core";
import { asc, eq } from "drizzle-orm";
import { type Db, parseRow } from "./database.js";
import { tasks } from "./schema.js";

const fromRow = (row: { id: string; document: unknown }) =>
  parseRow("tasks", row.id, Task, row.document);

/** Store a task, once. An id already stored throws the driver's primary-key error. */
export async function saveTask(db: Db, task: Task): Promise<void> {
  const document = parseRow("tasks", task.id, Task, task);
  await db.insert(tasks).values({ id: document.id, document });
}

/** The task with this id, or `undefined` when none is stored. */
export async function loadTask(db: Db, id: string): Promise<Task | undefined> {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
  return row === undefined ? undefined : fromRow(row);
}

/** Every stored task, by id. */
export async function listTasks(db: Db): Promise<Task[]> {
  const rows = await db.select().from(tasks).orderBy(asc(tasks.id));
  return rows.map(fromRow);
}
