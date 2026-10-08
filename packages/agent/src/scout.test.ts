import { constraintCount, Profile } from "@wayford/core";
import { expect, test } from "vitest";
import { SCOUT_PROFILE } from "./scout.js";

test("Scout's profile is full vision: no threshold, no cap, every pattern known, no dice", () => {
  const profile = Profile.parse(SCOUT_PROFILE);

  // Thresholds, caps and unknown patterns: every switch the filter has.
  expect(constraintCount(profile)).toBe(0);
  // B1, B2 and B4, the three dice a profile can switch on, which `constraintCount` does not count.
  expect(profile.behaviour.doubleClick).toBeUndefined();
  expect(profile.behaviour.scrollWhenStuck).toBeUndefined();
  expect(profile.behaviour.misclick).toBeUndefined();
});
