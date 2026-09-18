import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parse, stringify } from "yaml";
import { profileFixture, profileFixtures, profilesFixtureDir } from "./fixtures/index.js";
import { METRIC_NAMES, UI_PATTERNS } from "./primitives.js";
import { Behaviour, conflictingPatterns, Perception, Profile } from "./profile.js";

const RULES_MD = new URL("../../../docs/RULES.md", import.meta.url);

function rawFixture(name: string): unknown {
  return parse(readFileSync(`${profilesFixtureDir}${name}.yaml`, "utf8"));
}

describe("Profile schema", () => {
  test("every perception key is a metric the filter measures", () => {
    const keys = Object.keys(Perception.shape).filter((k) => k !== "emulation");
    expect(keys.sort()).toEqual([...METRIC_NAMES].sort());
  });

  test("a threshold without provenance is rejected", () => {
    const ryszard = rawFixture("ryszard") as {
      perception: { contrast: Record<string, unknown> };
    };
    delete ryszard.perception.contrast.provenance;
    const result = Profile.safeParse(ryszard);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("provenance");
  });

  test("an unsourced threshold is allowed, but has to say so", () => {
    const ryszard = rawFixture("ryszard") as {
      perception: { contrast: Record<string, unknown> };
    };
    ryszard.perception.contrast.provenance = "folk";
    expect(Profile.safeParse(ryszard).success).toBe(true);
    ryszard.perception.contrast.provenance = "vibes";
    expect(Profile.safeParse(ryszard).success).toBe(false);
  });

  test("softness is a probability", () => {
    const ryszard = rawFixture("ryszard") as {
      perception: { contrast: Record<string, unknown> };
    };
    ryszard.perception.contrast.softness = 1.5;
    expect(Profile.safeParse(ryszard).success).toBe(false);
  });

  test("seed is an integer", () => {
    const anna = rawFixture("anna") as Record<string, unknown>;
    anna.seed = 4211.5;
    expect(Profile.safeParse(anna).success).toBe(false);
  });

  test("a Polish field name does not pass as an extra key", () => {
    const anna = rawFixture("anna") as Record<string, unknown>;
    anna.percepcja = { emulation: "none" };
    expect(Profile.safeParse(anna).success).toBe(false);
  });

  test("behaviour stays open for the rules week 2 adds", () => {
    const marek = rawFixture("marek") as { behaviour: Record<string, unknown> };
    marek.behaviour.misclick = 0.3;
    const parsed = Profile.safeParse(marek);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.behaviour.misclick).toBe(0.3);
  });

  test("emulation defaults to none", () => {
    expect(Perception.parse({}).emulation).toBe("none");
  });

  test("a run without a budget is rejected", () => {
    expect(Behaviour.safeParse({}).success).toBe(false);
  });

  test("an unknown ui pattern is rejected", () => {
    const anna = rawFixture("anna") as { knowledge: { unknownPatterns: string[] } };
    anna.knowledge.unknownPatterns = ["wizard"];
    expect(Profile.safeParse(anna).success).toBe(false);
  });
});

describe("fixtures", () => {
  test("there are three of them and each one validates", () => {
    expect(profileFixtures).toHaveLength(3);
    for (const fixture of profileFixtures) {
      expect(Profile.safeParse(fixture).success).toBe(true);
    }
    expect(profileFixtures.map((p) => p.id)).toEqual(["prof_anna", "prof_marek", "prof_ryszard"]);
  });

  test("each one round-trips through YAML", () => {
    for (const fixture of profileFixtures) {
      const again = Profile.parse(parse(stringify(fixture)));
      expect(again).toEqual(fixture);
    }
  });

  test("no persona both knows and does not know a pattern", () => {
    for (const fixture of profileFixtures) {
      expect(conflictingPatterns(fixture)).toEqual([]);
    }
  });

  test("every provenance id used by a fixture exists in docs/RULES.md", () => {
    const registry = readFileSync(RULES_MD, "utf8");
    for (const fixture of profileFixtures) {
      for (const threshold of Object.values(fixture.perception)) {
        if (threshold === undefined || typeof threshold === "string") continue;
        expect(registry).toContain(`\`${threshold.provenance}\``);
      }
    }
  });

  test("Ryszard is the bundle in docs/RULES.md", () => {
    const ryszard = profileFixture("prof_ryszard");
    expect(ryszard.perception.contrast?.threshold).toBe(3.0);
    expect(ryszard.perception.contrast?.softness).toBeGreaterThan(0);
    expect(ryszard.perception.fontPx?.threshold).toBe(16);
    expect(ryszard.perception.targetPx?.threshold).toBe(32);
    expect(ryszard.perception.emulation).toBe("blurredVision");
    expect(ryszard.knowledge.unknownPatterns).toEqual(["hamburger", "kebab", "breadcrumb"]);
    expect(ryszard.behaviour.maxElements).toBe(12);
    expect(ryszard.behaviour.memorySteps).toBe(3);
    expect(ryszard.behaviour.doubleClick).toBe(0.8);
    expect(ryszard.behaviour.budgetSeconds).toBe(120);
  });

  test("Anna has no thresholds, knows everything and is uncapped", () => {
    const anna = profileFixture("prof_anna");
    expect(anna.perception.contrast).toBeUndefined();
    expect(anna.perception.fontPx).toBeUndefined();
    expect(anna.perception.targetPx).toBeUndefined();
    expect(anna.perception.emulation).toBe("none");
    expect([...anna.knowledge.knownPatterns].sort()).toEqual([...UI_PATTERNS].sort());
    expect(anna.knowledge.unknownPatterns).toEqual([]);
    expect(anna.behaviour.maxElements).toBeUndefined();
    expect(anna.behaviour.maxOptions).toBeUndefined();
    expect(anna.behaviour.memorySteps).toBeUndefined();
    expect(anna.behaviour.budgetSeconds).toBe(120);
  });

  test("Marek is mobile, motor threshold only", () => {
    const marek = profileFixture("prof_marek");
    expect(marek.device).toBe("mobile");
    expect(marek.perception.targetPx?.threshold).toBe(44);
    expect(marek.perception.contrast).toBeUndefined();
    expect(marek.knowledge.unknownPatterns).toEqual([]);
    expect(marek.behaviour.maxElements).toBe(20);
    expect(marek.behaviour.memorySteps).toBe(6);
    expect(marek.behaviour.scrollWhenStuck).toBe(0.9);
    expect(marek.behaviour.budgetSeconds).toBe(90);
  });

  test("no fixture carries vocabulary from one industry", () => {
    const words = ["energy", "energia", "tariff", "taryfa", "meter", "licznik", "kwh"];
    const source = JSON.stringify(profileFixtures).toLowerCase();
    for (const word of words) expect(source).not.toContain(word);
  });
});
