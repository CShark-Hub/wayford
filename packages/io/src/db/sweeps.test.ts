import type { Sweep } from "@wayford/core";
import { sweepFixtures } from "@wayford/core/fixtures";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test } from "vitest";
import { type TempStore, tempStore } from "../test-app.js";
import type { Db } from "./database.js";
import { sweeps } from "./schema.js";
import { listSweeps, loadSweep, saveSweep } from "./sweeps.js";

let store: TempStore;
let db: Db;
beforeEach(async () => {
  store = await tempStore();
  db = store.db;
});
afterEach(() => store.close());

const [vera, kai] = sweepFixtures as [Sweep, Sweep];

/** Vera's sweep cut off after two values, as a running sweep is saved: 9/10 and 8/10, so no boundary yet. */
const running: Sweep = {
  ...vera,
  status: "incomplete",
  values: vera.values.slice(0, 2),
  boundary: null,
};

const ids = (list: Sweep[]) => list.map((sweep) => sweep.id);

test("every sweep fixture loads back deep-equal", async () => {
  for (const sweep of sweepFixtures) await saveSweep(db, sweep);
  for (const sweep of sweepFixtures) {
    expect(await loadSweep(db, sweep.id)).toStrictEqual(sweep);
  }
});

test("a second save of the same id replaces the first", async () => {
  await saveSweep(db, running);
  await saveSweep(db, vera);
  expect(await loadSweep(db, vera.id)).toStrictEqual(vera);
  expect(await listSweeps(db)).toStrictEqual([vera]);
});

test("the columns are lifted out of the document", async () => {
  await saveSweep(db, vera);
  const { document, ...columns } = db.select().from(sweeps).all()[0] ?? {};
  expect(columns).toStrictEqual({
    id: "swp_vera-contrast",
    taskId: "task_past-order",
    profileId: "prof_vera",
    axis: "contrast",
    startedAt: "2026-10-05T09:00:00.000Z",
  });
  expect(document).toStrictEqual(vera);
});

test("an unknown id loads as undefined", async () => {
  // A stored sweep, so a lookup that ignored its id would return it.
  await saveSweep(db, vera);
  expect(await loadSweep(db, "swp_missing")).toBeUndefined();
});

test("listSweeps lists newest first, and narrows by persona and axis", async () => {
  const older = { ...running, id: "swp_vera-older", startedAt: "2026-10-04T09:00:00.000Z" };
  for (const sweep of [vera, older, kai]) await saveSweep(db, sweep);

  expect(ids(await listSweeps(db))).toStrictEqual([kai.id, vera.id, older.id]);
  expect(ids(await listSweeps(db, { profileId: "prof_vera" }))).toStrictEqual([vera.id, older.id]);
  expect(ids(await listSweeps(db, { axis: "maxElements" }))).toStrictEqual([kai.id]);
  expect(await listSweeps(db, { profileId: "prof_vera", axis: "maxElements" })).toStrictEqual([]);
});

test("start times order by time, whatever width they were given at", async () => {
  // As text, "…09:00:00Z" sorts after "…09:00:00.500Z", half a second later.
  await saveSweep(db, { ...vera, startedAt: "2026-10-05T09:00:00Z" });
  await saveSweep(db, { ...kai, startedAt: "2026-10-05T09:00:00.500Z" });
  expect(ids(await listSweeps(db))).toStrictEqual([kai.id, vera.id]);
});

test("an invalid sweep is refused and nothing is stored", async () => {
  // Vera's rate falls below 50% at 3.0, so a null boundary disagrees with her numbers.
  const wrong = { ...vera, boundary: null } as Sweep;
  await expect(saveSweep(db, wrong)).rejects.toMatchObject({ code: "invalid_row" });
  expect(await listSweeps(db)).toStrictEqual([]);
});

test("a tampered document fails loadSweep and listSweeps, naming the table and the id", async () => {
  await saveSweep(db, vera);
  await db
    .update(sweeps)
    .set({ document: { ...vera, seeds: [] } })
    .where(eq(sweeps.id, vera.id));
  for (const load of [() => loadSweep(db, vera.id), () => listSweeps(db)]) {
    await expect(load()).rejects.toMatchObject({
      code: "invalid_row",
      message: expect.stringContaining("sweeps row swp_vera-contrast"),
    });
  }
});
