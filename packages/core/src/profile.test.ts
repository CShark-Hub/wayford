import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parse, stringify } from "yaml";
import { profileFixture, profileFixtures, profilesFixtureDir } from "./fixtures/index.js";
import { METRIC_NAMES, UI_PATTERNS } from "./primitives.js";
import { Behaviour, conflictingPatterns, constraintCount, Perception, Profile } from "./profile.js";

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
    const vera = rawFixture("vera") as {
      perception: { contrast: Record<string, unknown> };
    };
    delete vera.perception.contrast.provenance;
    const result = Profile.safeParse(vera);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("provenance");
  });

  test("an unsourced threshold is allowed, but has to say so", () => {
    const vera = rawFixture("vera") as {
      perception: { contrast: Record<string, unknown> };
    };
    vera.perception.contrast.provenance = "folk";
    expect(Profile.safeParse(vera).success).toBe(true);
    vera.perception.contrast.provenance = "vibes";
    expect(Profile.safeParse(vera).success).toBe(false);
  });

  test("softness is a probability", () => {
    const vera = rawFixture("vera") as {
      perception: { contrast: Record<string, unknown> };
    };
    vera.perception.contrast.softness = 1.5;
    expect(Profile.safeParse(vera).success).toBe(false);
  });

  test("seed is an integer", () => {
    const ada = rawFixture("ada") as Record<string, unknown>;
    ada.seed = 4211.5;
    expect(Profile.safeParse(ada).success).toBe(false);
  });

  test("a label is a bare name, not a sentence", () => {
    const ada = rawFixture("ada") as Record<string, unknown>;
    ada.label = "Ada, 29, graphic designer";
    expect(Profile.safeParse(ada).success).toBe(false);
    ada.label = "Ada";
    expect(Profile.safeParse(ada).success).toBe(true);
  });

  test("a description is mandatory", () => {
    const ada = rawFixture("ada") as Record<string, unknown>;
    delete ada.description;
    expect(Profile.safeParse(ada).success).toBe(false);
  });

  test("a Polish field name does not pass as an extra key", () => {
    const ada = rawFixture("ada") as Record<string, unknown>;
    ada.percepcja = { emulation: "none" };
    expect(Profile.safeParse(ada).success).toBe(false);
  });

  test("a misspelt behaviour key is rejected instead of switching its rule off", () => {
    const vera = rawFixture("vera") as { behaviour: Record<string, unknown> };
    vera.behaviour.doubleclick = vera.behaviour.doubleClick;
    delete vera.behaviour.doubleClick;
    const result = Profile.safeParse(vera);
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        code: "unrecognized_keys",
        path: ["behaviour"],
        keys: ["doubleclick"],
      }),
    ]);
  });

  test("emulation defaults to none", () => {
    expect(Perception.parse({}).emulation).toBe("none");
  });

  test("a run without a budget is rejected", () => {
    expect(Behaviour.safeParse({}).success).toBe(false);
  });

  test("an unknown ui pattern is rejected", () => {
    const ada = rawFixture("ada") as { knowledge: { unknownPatterns: string[] } };
    ada.knowledge.unknownPatterns = ["wizard"];
    expect(Profile.safeParse(ada).success).toBe(false);
  });

  test("a pattern both known and unknown is rejected", () => {
    const vera = rawFixture("vera") as { knowledge: { knownPatterns: string[] } };
    vera.knowledge.knownPatterns.push("hamburger");
    const result = Profile.safeParse(vera);
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ["knowledge"],
        message: expect.stringContaining("hamburger"),
      }),
    ]);
    // The knowledge section enforces it on its own, not only inside a whole profile.
    expect(Profile.shape.knowledge.safeParse(vera.knowledge).success).toBe(false);
  });

  test("a conflicting pattern listed twice is named once", () => {
    const vera = rawFixture("vera") as { knowledge: { knownPatterns: string[] } };
    vera.knowledge.knownPatterns.push("hamburger", "hamburger");
    const result = Profile.safeParse(vera);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message.match(/hamburger/g)).toHaveLength(1);
  });
});

describe("fixtures", () => {
  test("there are four of them and each one validates", () => {
    expect(profileFixtures).toHaveLength(4);
    for (const fixture of profileFixtures) {
      expect(Profile.safeParse(fixture).success).toBe(true);
    }
    expect(profileFixtures.map((p) => p.id)).toEqual([
      "prof_ada",
      "prof_milo",
      "prof_vera",
      "prof_zoya",
    ]);
  });

  test("each one is a name and an English line about the bundle", () => {
    for (const fixture of profileFixtures) {
      expect(fixture.label).toMatch(/^\p{Lu}\p{L}+$/u);
      expect(fixture.description.length).toBeGreaterThan(20);
      expect(fixture.id).toBe(`prof_${fixture.label.toLowerCase()}`);
    }
  });

  test("every persona appears in the bundle table of docs/RULES.md", () => {
    const doc = readFileSync(RULES_MD, "utf8");
    const table = doc.slice(
      doc.indexOf("## Persona composition"),
      doc.indexOf("## Source registry"),
    );
    for (const fixture of profileFixtures) {
      expect(table).toContain(`| ${fixture.label} |`);
    }
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

  test("Vera is the bundle in docs/RULES.md", () => {
    const vera = profileFixture("prof_vera");
    expect(vera.perception.contrast?.threshold).toBe(3.0);
    expect(vera.perception.contrast?.softness).toBeGreaterThan(0);
    expect(vera.perception.fontPx?.threshold).toBe(16);
    expect(vera.perception.targetPx?.threshold).toBe(32);
    expect(vera.perception.emulation).toBe("blurredVision");
    expect(vera.knowledge.unknownPatterns).toEqual(["hamburger", "kebab", "breadcrumb"]);
    expect(vera.behaviour.maxElements).toBe(12);
    expect(vera.behaviour.memorySteps).toBe(3);
    expect(vera.behaviour.doubleClick).toBe(0.8);
    expect(vera.behaviour.budgetSeconds).toBe(120);
  });

  test("Ada has no thresholds, knows everything and is uncapped", () => {
    const ada = profileFixture("prof_ada");
    expect(ada.perception.contrast).toBeUndefined();
    expect(ada.perception.fontPx).toBeUndefined();
    expect(ada.perception.targetPx).toBeUndefined();
    expect(ada.perception.emulation).toBe("none");
    expect([...ada.knowledge.knownPatterns].sort()).toEqual([...UI_PATTERNS].sort());
    expect(ada.knowledge.unknownPatterns).toEqual([]);
    expect(ada.behaviour.maxElements).toBeUndefined();
    expect(ada.behaviour.maxOptions).toBeUndefined();
    expect(ada.behaviour.memorySteps).toBeUndefined();
    expect(ada.behaviour.budgetSeconds).toBe(120);
  });

  test("Milo is mobile, motor threshold only", () => {
    const milo = profileFixture("prof_milo");
    expect(milo.device).toBe("mobile");
    expect(milo.perception.targetPx?.threshold).toBe(44);
    expect(milo.perception.contrast).toBeUndefined();
    expect(milo.knowledge.unknownPatterns).toEqual([]);
    expect(milo.behaviour.maxElements).toBe(20);
    expect(milo.behaviour.memorySteps).toBe(6);
    expect(milo.behaviour.scrollWhenStuck).toBe(0.9);
    expect(milo.behaviour.budgetSeconds).toBe(90);
  });

  test("Zoya is the lower boundary: nothing known, everything capped", () => {
    const zoya = profileFixture("prof_zoya");
    expect(zoya.perception.contrast?.threshold).toBe(7.0);
    expect(zoya.perception.fontPx?.threshold).toBe(24);
    expect(zoya.perception.targetPx?.threshold).toBe(48);
    expect(zoya.perception.emulation).toBe("reducedContrast");
    expect(zoya.knowledge.knownPatterns).toEqual([]);
    expect([...zoya.knowledge.unknownPatterns].sort()).toEqual([...UI_PATTERNS].sort());
    expect(zoya.behaviour.maxElements).toBe(5);
    expect(zoya.behaviour.maxOptions).toBe(4);
    expect(zoya.behaviour.memorySteps).toBe(2);
  });

  test("Zoya is at least as strict as every other persona on every threshold they share", () => {
    const zoya = profileFixture("prof_zoya");
    for (const other of profileFixtures) {
      if (other.id === zoya.id) continue;
      for (const metric of METRIC_NAMES) {
        const theirs = other.perception[metric];
        if (!theirs) continue;
        expect(zoya.perception[metric]?.threshold).toBeGreaterThanOrEqual(theirs.threshold);
      }
    }
  });

  test("alphabetical order is the order of how much filter each persona switches on", () => {
    const counts = profileFixtures.map(constraintCount);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(new Set(counts).size).toBe(counts.length);
    expect(counts[0]).toBe(0);
  });

  test("the control persona switches nothing on and the boundary switches everything on", () => {
    const first = profileFixtures.at(0);
    const last = profileFixtures.at(-1);
    expect(first?.id).toBe("prof_ada");
    expect(last?.id).toBe("prof_zoya");
    for (const metric of METRIC_NAMES) {
      expect(first?.perception[metric]).toBeUndefined();
      expect(last?.perception[metric]).toBeDefined();
    }
    expect(constraintCount(last as never)).toBe(Math.max(...profileFixtures.map(constraintCount)));
  });

  test("no fixture describes a persona as able-bodied or impaired", () => {
    const banned = ["sprawn", "niesprawn", "impaired", "disabled", "able-bodied", "handicap"];
    const source = JSON.stringify(profileFixtures).toLowerCase();
    for (const word of banned) expect(source).not.toContain(word);
  });

  test("no fixture carries vocabulary from one industry", () => {
    const words = ["energy", "energia", "tariff", "taryfa", "meter", "licznik", "kwh"];
    const source = JSON.stringify(profileFixtures).toLowerCase();
    for (const word of words) expect(source).not.toContain(word);
  });
});
