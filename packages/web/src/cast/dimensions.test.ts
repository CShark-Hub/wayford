import type { Profile } from "@wayford/core";
import { profileFixture, profileFixtures } from "@wayford/core/fixtures";
import { describe, expect, test } from "vitest";
import { castDimensions, type Dimension, type DimensionKey } from "./dimensions.js";

/** One row of a fixture's dimensions, by key. */
function row(profileId: string, key: DimensionKey): Dimension {
  return rowOf(profileFixture(profileId), key);
}

/** One row of a profile's dimensions, by key. */
function rowOf(profile: Profile, key: DimensionKey): Dimension {
  const found = castDimensions(profile).find((dimension) => dimension.key === key);
  if (found === undefined) throw new Error(`No ${key} row for ${profile.id}`);
  return found;
}

/** Ada's fixture with `perception` swapped in, for a threshold no fixture sets. */
function withPerception(perception: Profile["perception"]): Profile {
  return { ...profileFixture("prof_ada"), perception };
}

const THRESHOLDS: readonly DimensionKey[] = ["contrast", "fontPx", "targetPx"];

describe("castDimensions", () => {
  test("reads eight rows in the matrix's order, each labelled with the rule it feeds", () => {
    expect(
      castDimensions(profileFixture("prof_vera")).map((d) => [d.key, d.label, d.rule]),
    ).toEqual([
      ["contrast", "Contrast", "P1"],
      ["fontPx", "Font size", "P3"],
      ["targetPx", "Target size", "P4"],
      ["attention", "Attention", "A1"],
      ["memory", "Memory", "M1"],
      ["patience", "Patience", "B3"],
      ["patterns", "Patterns", "K1"],
      ["vocabulary", "Vocabulary", "K2"],
    ]);
  });

  test("a dimension the persona does not set has no value", () => {
    const keys: DimensionKey[] = [
      "contrast",
      "fontPx",
      "targetPx",
      "attention",
      "memory",
      "vocabulary",
    ];
    for (const key of keys) {
      expect(row("prof_ada", key), `Ada's ${key}`).toEqual(
        expect.objectContaining({ value: undefined }),
      );
    }
    expect(row("prof_milo", "contrast").value).toBeUndefined();
    expect(row("prof_vera", "vocabulary").value).toBeUndefined();
    // Unset, so nothing about a threshold either.
    expect(row("prof_ada", "contrast")).toEqual({
      key: "contrast",
      label: "Contrast",
      rule: "P1",
      value: undefined,
    });
  });

  test("values read as the screen sets them, in mono", () => {
    expect(castDimensions(profileFixture("prof_vera")).map((d) => d.value)).toEqual([
      "3.0:1",
      "16 px",
      "32 px",
      "20 items",
      "3 steps",
      "120 s",
      "9",
      undefined,
    ]);
    expect(row("prof_zoya", "contrast").value).toBe("7.0:1");
    // A ratio that is not whole reads as the profile holds it, never rounded up past it.
    const between = withPerception({
      contrast: { threshold: 4.45, provenance: "wcag22" },
      emulation: "none",
    });
    expect(rowOf(between, "contrast").value).toBe("4.45:1");
    expect(row("prof_milo", "targetPx").value).toBe("44 px");
    expect(row("prof_kai", "attention").value).toBe("11 items");
    expect(row("prof_kai", "memory").value).toBe("2 steps");
    expect(row("prof_kai", "vocabulary").value).toBe("15 words");
    expect(row("prof_milo", "patience").value).toBe("90 s");
  });

  test("only the three thresholds carry a provenance or a gauge, over all five fixtures", () => {
    for (const profile of profileFixtures) {
      for (const dimension of castDimensions(profile)) {
        const where = `${profile.id} ${dimension.key}`;
        if (THRESHOLDS.includes(dimension.key) && dimension.value !== undefined) {
          expect(dimension.provenance, where).toBeDefined();
          expect(dimension.gauge, where).toBeDefined();
        } else {
          expect(dimension.provenance, where).toBeUndefined();
          expect(dimension.gauge, where).toBeUndefined();
          expect(dimension.softness, where).toBeUndefined();
        }
      }
    }
    expect(row("prof_vera", "targetPx").provenance).toBe("folk");
    expect(row("prof_milo", "targetPx").provenance).toBe("hig");
  });

  test("softness shows only where it is above 0: Vera's and Zoya's contrast", () => {
    const soft = profileFixtures.flatMap((profile) =>
      castDimensions(profile)
        .filter((dimension) => dimension.softness !== undefined)
        .map((dimension) => [profile.id, dimension.key, dimension.softness]),
    );
    expect(soft).toEqual([
      ["prof_vera", "contrast", 0.5],
      ["prof_zoya", "contrast", 0.3],
    ]);
    const hard = withPerception({
      fontPx: { threshold: 16, softness: 0, provenance: "legge2011" },
      emulation: "none",
    });
    expect(rowOf(hard, "fontPx").softness).toBeUndefined();
  });

  test("patterns known is 12 less the unknown", () => {
    expect(row("prof_vera", "patterns")).toEqual(expect.objectContaining({ value: "9", known: 9 }));
    expect(row("prof_zoya", "patterns").known).toBe(0);
    expect(row("prof_ada", "patterns").known).toBe(12);
    expect(row("prof_kai", "patterns").known).toBe(7);
    // `known` belongs to K1 alone.
    for (const dimension of castDimensions(profileFixture("prof_ada"))) {
      if (dimension.key !== "patterns") expect(dimension.known, dimension.key).toBeUndefined();
    }
  });

  test("a repeated unknown pattern counts once", () => {
    const vera = profileFixture("prof_vera");
    const repeated: Profile = {
      ...vera,
      knowledge: {
        ...vera.knowledge,
        unknownPatterns: ["hamburger", "kebab", "hamburger", "breadcrumb", "kebab"],
      },
    };
    expect(rowOf(repeated, "patterns")).toEqual(expect.objectContaining({ value: "9", known: 9 }));
  });

  test("an empty vocabulary is set: it knows no word", () => {
    const kai = profileFixture("prof_kai");
    const none: Profile = { ...kai, knowledge: { ...kai.knowledge, domainVocabulary: [] } };
    expect(rowOf(none, "vocabulary").value).toBe("0 words");
  });

  test("the gauge places each threshold on the reference's ruler", () => {
    expect(row("prof_vera", "contrast").gauge).toBeCloseTo(1 / 3);
    expect(row("prof_zoya", "contrast").gauge).toBe(1);
    expect(row("prof_vera", "fontPx").gauge).toBe(0.5);
    expect(row("prof_zoya", "fontPx").gauge).toBe(1);
    expect(row("prof_milo", "targetPx").gauge).toBe(0.875);
    expect(row("prof_vera", "targetPx").gauge).toBe(0.5);
    expect(row("prof_zoya", "targetPx").gauge).toBe(1);
  });
});
