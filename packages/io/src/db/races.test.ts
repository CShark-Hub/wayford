import type { Race } from "@wayford/core";
import { raceFixture, taskFixture } from "@wayford/core/fixtures";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test } from "vitest";
import { type TempStore, tempStore } from "../test-app.js";
import type { Db } from "./database.js";
import { listRaces, loadRace, saveRace } from "./races.js";
import { races } from "./schema.js";

let store: TempStore;
let db: Db;
beforeEach(async () => {
  store = await tempStore();
  db = store.db;
});
afterEach(() => store.close());

/** The hard goal's race fixture: Ada, Kai and Vera on seed 1, as `POST /runs` stores a race. */
const race: Race = raceFixture;

/** Zoya alone on the easy goal, an hour later. */
const later: Race = {
  id: "race_next-parcel",
  task: taskFixture("task_next-parcel"),
  startedAt: "2026-09-22T10:59:58.000Z",
  runs: [{ id: "run_zoya-easy-7", profileId: "prof_zoya", seed: 7 }],
};

const ids = (list: Race[]) => list.map(({ id }) => id);

test("a race loads back deep-equal, its task and runs whole", async () => {
  await saveRace(db, race);
  expect(await loadRace(db, race.id)).toStrictEqual(race);
});

test("the start time is lifted out of the document at millisecond width", async () => {
  const given = { ...race, startedAt: "2026-09-22T09:59:58Z" };
  await saveRace(db, given);
  const { document, ...columns } = db.select().from(races).all()[0] ?? {};
  expect(columns).toStrictEqual({ id: "race_past-order", startedAt: "2026-09-22T09:59:58.000Z" });
  // The document keeps the start time as given.
  expect(document).toStrictEqual(given);
});

test("an unknown id loads as undefined", async () => {
  // A stored race, so a lookup that ignored its id would return it.
  await saveRace(db, race);
  expect(await loadRace(db, "race_missing")).toBeUndefined();
});

test("listRaces lists newest first; races that started together, by id, last first", async () => {
  // As text, "…09:59:58Z" sorts after "…09:59:58.500Z", half a second later.
  const half = { ...later, id: "race_half", startedAt: "2026-09-22T09:59:58.500Z" };
  const together = { ...race, id: "race_together", startedAt: "2026-09-22T09:59:58Z" };
  for (const saved of [race, later, half, together]) await saveRace(db, saved);
  expect(ids(await listRaces(db))).toStrictEqual([
    "race_next-parcel",
    "race_half",
    "race_together",
    "race_past-order",
  ]);
});

test("a race core's schema refuses is not stored", async () => {
  // A race is a run set, so it has at least one run; core's `race.test.ts` holds the other cases.
  await expect(saveRace(db, { ...race, runs: [] })).rejects.toMatchObject({ code: "invalid_row" });
  expect(await listRaces(db)).toStrictEqual([]);
});

test("a tampered document fails loadRace and listRaces, naming the table and the id", async () => {
  await saveRace(db, race);
  await db
    .update(races)
    .set({ document: { ...race, runs: [] } })
    .where(eq(races.id, race.id));
  for (const load of [() => loadRace(db, race.id), () => listRaces(db)]) {
    await expect(load()).rejects.toMatchObject({
      code: "invalid_row",
      message: expect.stringContaining("races row race_past-order"),
    });
  }
});
