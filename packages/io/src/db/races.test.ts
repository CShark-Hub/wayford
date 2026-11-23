import type { Race } from "@wayford/core";
import { raceFixture, taskFixture } from "@wayford/core/fixtures";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test } from "vitest";
import { type TempStore, tempStore } from "../test-app.js";
import type { Db } from "./database.js";
import { listRaces, loadRace, saveRace, updateRace } from "./races.js";
import { races } from "./schema.js";

let store: TempStore;
let db: Db;
beforeEach(async () => {
  store = await tempStore();
  db = store.db;
});
afterEach(() => store.close());

/**
 * The hard goal's race fixture: Ada, Kai, Vera and Milo on seed 1, and the stop that dropped Milo's
 * run before it started (#6).
 */
const race: Race = raceFixture;

/** The fixture's race as `POST /runs` stored it, before its stop. */
const unstopped: Race = {
  id: race.id,
  task: race.task,
  startedAt: race.startedAt,
  runs: race.runs,
};

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

test("an updated race reads back whole, its start time as stored", async () => {
  await saveRace(db, unstopped);
  await updateRace(db, race);
  expect(await loadRace(db, race.id)).toStrictEqual(race);
  expect(await listRaces(db)).toStrictEqual([race]);
  // Still the one row, its start time as `saveRace` stored it.
  expect(db.select().from(races).all()).toStrictEqual([
    { id: race.id, startedAt: "2026-09-22T09:59:58.000Z", document: race },
  ]);
});

test("an update core's schema refuses changes nothing", async () => {
  await saveRace(db, unstopped);
  // A stop naming a run the race does not have; core's `race.test.ts` holds the other cases.
  const refused = {
    ...race,
    cancelled: { at: "2026-09-22T10:00:20.000Z", dequeued: ["run_zoya-past-order-1"] },
  };
  await expect(updateRace(db, refused)).rejects.toMatchObject({ code: "invalid_row" });
  expect(await loadRace(db, race.id)).toStrictEqual(unstopped);
});

test("an update of a race no row holds throws race_not_found and changes nothing", async () => {
  // Another race stored, so an update that ignored the id would change it.
  await saveRace(db, later);
  await expect(updateRace(db, race)).rejects.toMatchObject({
    code: "race_not_found",
    message: expect.stringContaining("race_past-order"),
  });
  expect(await listRaces(db)).toStrictEqual([later]);
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
