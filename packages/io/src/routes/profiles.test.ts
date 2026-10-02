import { profileFixtures } from "@wayford/core/fixtures";
import { describe, expect, onTestFinished, test } from "vitest";
import { testApp } from "../test-app.js";

describe("GET /profiles", () => {
  test("lists core's persona fixtures as Profile[], in core's order", async () => {
    const t = await testApp();
    onTestFinished(() => t.close());

    const res = await t.app.request("/profiles");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await res.json()).toStrictEqual(profileFixtures);
  });
});
