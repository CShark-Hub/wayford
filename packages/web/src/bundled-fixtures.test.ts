import { measurementFixture, profileFixtures } from "@wayford/core/fixtures";
import { expect, test } from "vitest";
import { bundledMeasurement, bundledProfiles } from "./bundled-fixtures.js";

test("the bundled profiles deep-equal profileFixtures", () => {
  // Two loaders over the same YAML files: core's reads them from disk, the
  // browser's gets them inlined by Vite. Anything one parses differently, or
  // sorts differently, shows up here.
  expect(bundledProfiles).toStrictEqual(profileFixtures);
});

test("the bundled measurement deep-equals measurementFixture", () => {
  // The same two loaders over measurement.json: the preview must perceive the page the Actor's
  // tests perceive, element for element.
  expect(bundledMeasurement).toStrictEqual(measurementFixture);
});
