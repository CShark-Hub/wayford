import { measurementFixture, profileFixtures, taskFixtures } from "@wayford/core/fixtures";
import { expect, test } from "vitest";
import { bundledMeasurement, bundledProfiles, bundledTasks } from "./bundled-fixtures.js";

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

test("the bundled tasks deep-equal taskFixtures, in file order", () => {
  // The same two loaders over tasks.json: the arena's presets must be the goals io's runs and the
  // target app's GOALS are, easy first.
  expect(bundledTasks).toStrictEqual(taskFixtures);
});
