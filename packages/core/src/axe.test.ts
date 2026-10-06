import { describe, expect, test } from "vitest";
import { AxeScan, AxeUrl } from "./axe.js";
import { axeScanFixture, axeScanFixtures } from "./fixtures/index.js";

describe("axeScanFixtures", () => {
  test("parse, and hold /deliveries with color-contrast and /settings/data, at the defaults", () => {
    expect(AxeScan.array().parse(axeScanFixtures)).toEqual(axeScanFixtures);
    expect(axeScanFixtures.map((fixture) => fixture.url)).toEqual([
      "/deliveries?contrast=2&fontPx=16&targetPx=36",
      "/settings/data?contrast=2&fontPx=16&targetPx=36",
    ]);
    const deliveries = axeScanFixtures[0];
    expect(deliveries?.violations.map((violation) => violation.ruleId)).toContain("color-contrast");
  });
});

describe("AxeUrl", () => {
  test("a path with the app's query is a key", () => {
    expect(AxeUrl.safeParse("/settings/data?contrast=2&fontPx=16&targetPx=36").success).toBe(true);
  });

  // A stored scan holds for every origin the build is served on, so the key carries none.
  test.each([
    ["an origin", "http://localhost:5174/deliveries?contrast=2&fontPx=16&targetPx=36"],
    ["a protocol-relative origin", "//localhost:5174/deliveries?contrast=2&fontPx=16&targetPx=36"],
    ["a hash", "/deliveries?contrast=2&fontPx=16&targetPx=36#archive"],
    ["no query", "/deliveries"],
    ["an empty query", "/deliveries?"],
    ["no leading slash", "deliveries?contrast=2&fontPx=16&targetPx=36"],
  ])("a URL with %s is refused", (_, url) => {
    expect(AxeUrl.safeParse(url).success).toBe(false);
    expect(AxeScan.safeParse({ ...axeScanFixture("/deliveries"), url }).success).toBe(false);
  });
});
