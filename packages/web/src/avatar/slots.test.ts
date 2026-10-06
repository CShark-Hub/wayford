import { profileFixtures } from "@wayford/core/fixtures";
import { expect, test } from "vitest";
import { slotOf } from "./slots.js";

test("the five fixtures are pinned: Ada graphite, Vera cobalt, Kai raspberry, Milo jade, Zoya violet", () => {
  const slots = Object.fromEntries(profileFixtures.map((p) => [p.label, slotOf(p.id)]));
  expect(slots).toStrictEqual({
    Ada: "graphite",
    Kai: "raspberry",
    Milo: "jade",
    Vera: "cobalt",
    Zoya: "violet",
  });
});

test("any other id takes the fallback, an object's own keys included", () => {
  for (const id of ["prof_custom", "", "prof_Vera", "constructor", "__proto__", "toString"]) {
    expect(slotOf(id), id).toBe("fallback");
  }
});
