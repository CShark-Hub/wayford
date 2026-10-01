import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunResult } from "@wayford/core";
import { runResultFixture as fixture } from "@wayford/core/fixtures";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type Db, migrateDatabase, openDatabase } from "./database.js";
import { listRuns, loadRun, type RunFilter, saveRun } from "./runs.js";
import { runs } from "./schema.js";

let dir: string;
let db: Db;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wayford-runs-"));
  const url = `file:${join(dir, "wayford.sqlite")}`;
  migrateDatabase(url);
  db = openDatabase(url);
});
// Closed before the directory goes: Windows will not remove an open database file.
afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

// `RunResult` carries no start time; this is the fixture run's `runStarted` timestamp.
const startedAt = "2026-09-22T10:00:00.000Z";

// Differs from the fixture in every key `listRuns` filters on, so a filter that
// ignored one of them would let this run through.
const other: RunResult = {
  ...fixture,
  id: "run_ada-easy-1",
  taskId: "task_next-parcel",
  profileId: "prof_ada",
  outcome: "success",
};
const otherStartedAt = "2026-09-22T11:00:00.000Z";

const ids = (list: RunResult[]) => list.map((run) => run.id);

test("the fixture run loads back deep-equal", async () => {
  await saveRun(db, fixture, startedAt);
  expect(await loadRun(db, fixture.id)).toStrictEqual(fixture);
});

test("the columns are lifted out of the document, the start time beside it at millisecond width", async () => {
  await saveRun(db, fixture, "2026-09-22T10:00:00Z");
  const { document, ...columns } = db.select().from(runs).all()[0] ?? {};
  expect(columns).toStrictEqual({
    id: "run_vera-hard-1",
    taskId: "task_past-order",
    profileId: "prof_vera",
    seed: 424242,
    outcome: "gave_up",
    durationMs: 15500,
    costUsd: 0.0201,
    startedAt: "2026-09-22T10:00:00.000Z",
  });
  expect(document).toStrictEqual(fixture);
});

test("an unknown id loads as undefined", async () => {
  // A stored run, so a lookup that ignored its id would return it.
  await saveRun(db, fixture, startedAt);
  expect(await loadRun(db, "run_missing")).toBeUndefined();
});

describe("listRuns", () => {
  beforeEach(async () => {
    await saveRun(db, fixture, startedAt);
    await saveRun(db, other, otherStartedAt);
  });

  test("returns the fixture run for matching task, profile and outcome only", async () => {
    const filters: RunFilter[] = [
      { taskId: fixture.taskId },
      { profileId: fixture.profileId },
      { outcome: fixture.outcome },
    ];
    for (const filter of filters) {
      expect(ids(await listRuns(db, filter))).toStrictEqual([fixture.id]);
    }
    const all = { taskId: fixture.taskId, profileId: fixture.profileId, outcome: fixture.outcome };
    expect(await listRuns(db, all)).toStrictEqual([fixture]);
    expect(await listRuns(db, { ...all, outcome: other.outcome })).toStrictEqual([]);
  });

  test("with no filter, every run comes back newest first, ties by id", async () => {
    await saveRun(db, { ...fixture, id: "run_vera-hard-2" }, startedAt);
    expect(ids(await listRuns(db))).toStrictEqual([
      "run_ada-easy-1",
      "run_vera-hard-2",
      "run_vera-hard-1",
    ]);
  });
});

test("start times order by time, whatever width they were given at", async () => {
  // As text, "…10:00:00Z" sorts after "…10:00:00.500Z", half a second later.
  await saveRun(db, fixture, "2026-09-22T10:00:00Z");
  await saveRun(db, other, "2026-09-22T10:00:00.500Z");
  expect(ids(await listRuns(db))).toStrictEqual([other.id, fixture.id]);
});

test("an invalid run or start time is refused and nothing is stored", async () => {
  const unseeded = { ...fixture, seed: -1 } as RunResult;
  await expect(saveRun(db, unseeded, startedAt)).rejects.toMatchObject({ code: "invalid_row" });
  await expect(saveRun(db, fixture, "yesterday")).rejects.toMatchObject({
    code: "invalid_row",
    message: expect.stringContaining("startedAt"),
  });
  expect(await listRuns(db)).toStrictEqual([]);
});

test("a tampered document fails loadRun and listRuns, naming the table and the id", async () => {
  await saveRun(db, fixture, startedAt);
  await db
    .update(runs)
    .set({ document: { ...fixture, outcome: "lost" } as unknown as RunResult })
    .where(eq(runs.id, fixture.id));
  for (const load of [() => loadRun(db, fixture.id), () => listRuns(db)]) {
    await expect(load()).rejects.toMatchObject({
      code: "invalid_row",
      message: expect.stringContaining("runs row run_vera-hard-1"),
    });
  }
});
