import { profileFixtures } from "@wayford/core/fixtures";
import { expect, test } from "vitest";
import { bundledProfiles } from "./bundled-fixtures.js";

test("the bundled profiles deep-equal profileFixtures", () => {
  // Two loaders over the same YAML files: core's reads them from disk, the
  // browser's gets them inlined by Vite. Anything one parses differently, or
  // sorts differently, shows up here.
  expect(bundledProfiles).toStrictEqual(profileFixtures);
});
