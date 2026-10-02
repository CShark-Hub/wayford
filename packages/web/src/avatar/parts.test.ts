import type { Profile } from "@wayford/core";
import { profileFixture, profileFixtures } from "@wayford/core/fixtures";
import { expect, test } from "vitest";
import { type AvatarParts, avatarParts, personaColour } from "./parts.js";

/** The glasses on Vera with only her contrast threshold moved: her softness and provenance stay. */
function strokeWidthAt(threshold: number): number {
  const vera = profileFixture("prof_vera");
  const { contrast } = vera.perception;
  if (!contrast) throw new Error("Vera sets a contrast threshold");
  const { glasses } = avatarParts({
    ...vera,
    perception: { ...vera.perception, contrast: { ...contrast, threshold } },
  });
  if (!glasses) throw new Error(`no glasses at a contrast threshold of ${threshold}`);
  return glasses.strokeWidth;
}

/** The share of sand in the top bulb for a fixture persona. */
function sandOf(id: string): number {
  return avatarParts(profileFixture(id)).patience;
}

/** The parts drawn from the seed, which no dimension may move. */
function seedParts({ hue, tuft, brows, pattern }: AvatarParts) {
  return { hue, tuft, brows, pattern };
}

test("a contrast threshold of 7 gives thicker glasses than one of 3", () => {
  const thin = strokeWidthAt(3);
  const thick = strokeWidthAt(7);
  expect(thin).toBe(2.5);
  expect(thick).toBe(4.5);
  expect(thick).toBeGreaterThan(thin);
});

test("the glasses stop thickening at 10:1", () => {
  // The fixtures and the preview's sliders sit below the cap.
  expect(strokeWidthAt(10)).toBe(6);
  expect(strokeWidthAt(21)).toBe(6);
});

test("Milo holds a phone and Ada holds nothing", () => {
  expect(avatarParts(profileFixture("prof_milo")).held).toBe("phone");
  expect(avatarParts(profileFixture("prof_ada")).held).toBeNull();
});

test("a tablet profile holds a tablet", () => {
  const ada = profileFixture("prof_ada");
  expect(avatarParts({ ...ada, device: "tablet" }).held).toBe("tablet");
});

test("no contrast threshold, no glasses: Ada and Milo", () => {
  // Milo sets a target threshold, so this also shows the glasses follow contrast alone.
  for (const id of ["prof_ada", "prof_milo"]) {
    const profile = profileFixture(id);
    expect(profile.perception.contrast, id).toBeUndefined();
    expect(avatarParts(profile).glasses, id).toBeNull();
  }
});

test("more budget gives more sand: Milo (90 s) < Ada (120 s) < Zoya (180 s)", () => {
  const milo = sandOf("prof_milo");
  const ada = sandOf("prof_ada");
  const zoya = sandOf("prof_zoya");
  expect([milo, ada, zoya]).toEqual([0.3, 0.4, 0.6]);
  expect(milo).toBeLessThan(ada);
  expect(ada).toBeLessThan(zoya);
});

test("the hourglass is full from 300 s on", () => {
  const ada = profileFixture("prof_ada");
  for (const budgetSeconds of [300, 600]) {
    const parts = avatarParts({ ...ada, behaviour: { ...ada.behaviour, budgetSeconds } });
    expect(parts.patience, `${budgetSeconds} s`).toBe(1);
  }
});

test("each fixture's seed parts are pinned, so a persona keeps its colour and face", () => {
  // The draw order and the variant lists are part of the record, like the `rng` algorithm: a
  // change to either changes an existing persona's looks, and shows here.
  const parts = Object.fromEntries(
    profileFixtures.map((p) => [p.label, seedParts(avatarParts(p))]),
  );
  expect(parts).toStrictEqual({
    Ada: { hue: 330, tuft: "curl", brows: "none", pattern: "stripes" },
    Kai: { hue: 240, tuft: "sprout", brows: "arch", pattern: "dots" },
    Milo: { hue: 120, tuft: "curl", brows: "bar", pattern: "dots" },
    Vera: { hue: 180, tuft: "sprout", brows: "none", pattern: "stripes" },
    Zoya: { hue: 300, tuft: "curl", brows: "none", pattern: "stripes" },
  });
});

test("the five fixtures get five different hues", () => {
  // Ada's and Vera's first draws are 0.584 and 0.567. Only the step between bins keeps them apart.
  const hues = profileFixtures.map((p) => avatarParts(p).hue);
  expect(hues).toHaveLength(5);
  expect(new Set(hues).size).toBe(hues.length);
});

test("the persona colour is the avatar's hue: Vera's is oklch(0.75 0.12 180)", () => {
  expect(personaColour(profileFixture("prof_vera"))).toBe("oklch(0.75 0.12 180)");
  for (const profile of profileFixtures) {
    expect(personaColour(profile), profile.label).toBe(
      `oklch(0.75 0.12 ${avatarParts(profile).hue})`,
    );
  }
});

test("moving a threshold, the device or the budget leaves the hue, tuft, brows and pattern alone", () => {
  // The preview and the sweep move these dimensions, and a persona must stay recognisable.
  for (const profile of profileFixtures) {
    const moved: Profile = {
      ...profile,
      device: profile.device === "mobile" ? "desktop" : "mobile",
      perception: { ...profile.perception, contrast: { threshold: 4.5, provenance: "wcag22" } },
      behaviour: { ...profile.behaviour, budgetSeconds: profile.behaviour.budgetSeconds + 60 },
    };
    const before = avatarParts(profile);
    const after = avatarParts(moved);
    // Every dimension part moved, so the seed parts staying put is not a vacuous pass.
    expect(after.glasses, profile.label).not.toStrictEqual(before.glasses);
    expect(after.held, profile.label).not.toBe(before.held);
    expect(after.patience, profile.label).not.toBe(before.patience);
    expect(seedParts(after), profile.label).toStrictEqual(seedParts(before));
  }
});
