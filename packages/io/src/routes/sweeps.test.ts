/**
 * `GET /sweeps` and `GET /sweeps/:id` serve the stored sweeps
 * (`docs/specs/2026-10-05-s4-05-sweep.md`, "io: storage and routes"). How a sweep is stored is
 * `db/sweeps.test.ts`'s.
 */
import type { Sweep } from "@wayford/core";
import { sweepFixtures } from "@wayford/core/fixtures";
import { describe, expect, onTestFinished, test } from "vitest";
import { saveSweep } from "../db/sweeps.js";
import { getJson, type TestApp, testApp } from "../test-app.js";

const [vera, kai] = sweepFixtures as [Sweep, Sweep];

/** A test app with both sweep fixtures stored, closed after the test. */
async function appWithSweeps(): Promise<TestApp> {
  const t = await testApp();
  onTestFinished(() => t.close());
  for (const sweep of sweepFixtures) await saveSweep(t.db, sweep);
  return t;
}

describe("GET /sweeps", () => {
  test("lists every stored sweep newest first", async () => {
    const { app } = await appWithSweeps();
    const { status, body } = await getJson(app, "/sweeps");
    expect(status).toBe(200);
    expect(body).toStrictEqual([kai, vera]);
  });

  test("passes the filter on to the store, which owns what it means", async () => {
    const { app } = await appWithSweeps();
    expect(await getJson(app, "/sweeps?profileId=prof_vera")).toStrictEqual({
      status: 200,
      body: [vera],
    });
  });

  test("with nothing stored, an empty list", async () => {
    const t = await testApp();
    onTestFinished(() => t.close());
    expect(await getJson(t.app, "/sweeps")).toStrictEqual({ status: 200, body: [] });
  });

  test("an unknown key, a value outside its schema or a repeated key is a 400", async () => {
    const { app } = await appWithSweeps();
    for (const query of [
      "persona=prof_vera",
      "axis=fontSize",
      "profileId=vera",
      "axis=contrast&axis=maxElements",
    ]) {
      const { status, body } = await getJson(app, `/sweeps?${query}`);
      expect(status, query).toBe(400);
      expect(typeof body.error).toBe("string");
    }
  });
});

describe("GET /sweeps/:id", () => {
  test("returns the stored sweep", async () => {
    const { app } = await appWithSweeps();
    expect(await getJson(app, `/sweeps/${vera.id}`)).toStrictEqual({ status: 200, body: vera });
  });

  test("an id no stored sweep has, or one that is no sweep id, is a 404", async () => {
    const { app } = await appWithSweeps();
    for (const id of ["swp_missing", "run_vera-hard-1"]) {
      expect(await getJson(app, `/sweeps/${id}`)).toStrictEqual({
        status: 404,
        body: { error: `no stored sweep ${id}` },
      });
    }
  });
});
