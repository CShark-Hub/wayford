import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  Bbox,
  ContrastRatio,
  isUnsourced,
  METRIC_NAMES,
  PERCEPTION_STATES,
  PROVENANCE_IDS,
  ProfileId,
  ProvenanceId,
  prefixedId,
  RULE_IDS,
  RuleId,
  Seed,
  smallerSide,
  stageOf,
  UNSOURCED,
  Viewport,
} from "./primitives.js";

const RULES_MD = fileURLToPath(new URL("../../../docs/RULES.md", import.meta.url));

describe("provenance", () => {
  test("every id in the registry table of docs/RULES.md is in PROVENANCE_IDS", () => {
    const doc = readFileSync(RULES_MD, "utf8");
    const registry = doc.slice(doc.indexOf("## Source registry"), doc.indexOf("## What is not"));
    const documented = [...registry.matchAll(/^\| `([a-z0-9]+)`/gm)].map((m) => m[1]);
    expect(documented.length).toBeGreaterThan(0);
    expect([...documented].sort()).toEqual([...PROVENANCE_IDS].sort());
  });

  test("folk and llm are the unsourced ones", () => {
    expect(isUnsourced("folk")).toBe(true);
    expect(isUnsourced("llm")).toBe(true);
    expect(isUnsourced("wcag22")).toBe(false);
    expect(UNSOURCED).toHaveLength(2);
  });

  test("an unknown source is rejected", () => {
    expect(ProvenanceId.safeParse("vibes").success).toBe(false);
  });
});

describe("rules", () => {
  test("every rule id in docs/RULES.md is in RULE_IDS", () => {
    const doc = readFileSync(RULES_MD, "utf8");
    const documented = [...doc.matchAll(/^\| ((?:P|K|V|A|M|B)\d+) \|/gm)].map((m) => m[1]);
    expect(documented.length).toBeGreaterThan(0);
    expect([...new Set(documented)].sort()).toEqual([...RULE_IDS].sort());
  });

  test("each rule maps to a pipeline stage", () => {
    expect(stageOf("P1")).toBe("perception");
    expect(stageOf("K2")).toBe("knowledge");
    expect(stageOf("V2")).toBe("viewport");
    expect(stageOf("A1")).toBe("attention");
    expect(stageOf("M1")).toBe("memory");
    expect(stageOf("B4")).toBe("behaviour");
    for (const rule of RULE_IDS) expect(() => stageOf(rule)).not.toThrow();
  });

  test("an unknown rule is rejected", () => {
    expect(RuleId.safeParse("Z9").success).toBe(false);
  });
});

describe("metrics and states", () => {
  test("metric names match the thresholds a profile can carry", () => {
    expect(METRIC_NAMES).toEqual(["contrast", "fontPx", "targetPx"]);
  });

  test("perception has three states, not two", () => {
    expect(PERCEPTION_STATES).toEqual(["visible", "degraded", "invisible"]);
  });

  test("contrast stays inside the WCAG range", () => {
    expect(ContrastRatio.safeParse(4.5).success).toBe(true);
    expect(ContrastRatio.safeParse(0.5).success).toBe(false);
    expect(ContrastRatio.safeParse(22).success).toBe(false);
  });

  test("a seed is a non-negative integer", () => {
    expect(Seed.safeParse(8814).success).toBe(true);
    expect(Seed.safeParse(8814.5).success).toBe(false);
    expect(Seed.safeParse(-1).success).toBe(false);
  });

  test("a seed fits the generator's 32-bit state, so none silently replays a smaller one", () => {
    expect(Seed.safeParse(0).success).toBe(true);
    expect(Seed.safeParse(4294967295).success).toBe(true);
    expect(Seed.safeParse(4294967296).success).toBe(false);
  });
});

describe("geometry", () => {
  test("target size compares the smaller side", () => {
    expect(smallerSide({ x: 0, y: 0, width: 120, height: 18 })).toBe(18);
  });

  test("a negative size is rejected", () => {
    expect(Bbox.safeParse({ x: 0, y: 0, width: -1, height: 10 }).success).toBe(false);
  });

  test("viewport defaults to a non-mobile scale of 1", () => {
    const vp = Viewport.parse({ width: 1280, height: 800 });
    expect(vp.deviceScaleFactor).toBe(1);
    expect(vp.isMobile).toBe(false);
  });
});

describe("identifiers", () => {
  test("a prefixed id accepts its own prefix only", () => {
    expect(ProfileId.safeParse("prof_vera").success).toBe(true);
    expect(ProfileId.safeParse("task_vera").success).toBe(false);
    expect(ProfileId.safeParse("vera").success).toBe(false);
  });

  test("uppercase and spaces are rejected", () => {
    const id = prefixedId("run");
    expect(id.safeParse("run_47").success).toBe(true);
    expect(id.safeParse("run_Vera").success).toBe(false);
    expect(id.safeParse("run_two words").success).toBe(false);
  });

  test("a canonical ULID fails until lowercased, and the error says lowercase", () => {
    const id = prefixedId("run");
    expect(id.safeParse("run_01j8z3ndektsv4rrffq69g5fav").success).toBe(true);
    const canonical = id.safeParse("run_01J8Z3NDEKTSV4RRFFQ69G5FAV");
    expect(canonical.success).toBe(false);
    expect(canonical.error?.issues[0]?.message).toMatch(/lowercase/);
  });

  test("the slug is lowercase ASCII letters, digits and dashes: no underscore, no leading dash", () => {
    const id = prefixedId("run");
    expect(id.safeParse("run_vera-hard-1").success).toBe(true);
    expect(id.safeParse("run_vera_hard_1").success).toBe(false);
    expect(id.safeParse("run_-vera").success).toBe(false);
    expect(id.safeParse("run_café").success).toBe(false);
  });
});
