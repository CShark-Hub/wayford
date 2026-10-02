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

/** The persona bundle table of docs/RULES.md: each row's label and the cells after it. */
function bundleRows(): { label: string; cells: string[] }[] {
  const lines = readFileSync(RULES_MD, "utf8").split("\n");
  const header = lines.findIndex((line) => line.startsWith("| Persona |"));
  if (header === -1) throw new Error("docs/RULES.md has no persona bundle table");
  const rows: { label: string; cells: string[] }[] = [];
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith("|")) break;
    const [label = "", ...cells] = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    rows.push({ label, cells });
  }
  return rows;
}

/**
 * The numbers a row states, by the word before each. Anything in parentheses, such as a citation,
 * is dropped first, commas and all. A `word number` pair then counts only where it opens a cell or
 * a comma-separated item. A `:1` after the number is dropped and a `soft` after it kept:
 * `contrast 7:1 soft` reads `7 soft`.
 */
function statedNumbers(cells: readonly string[]): Record<string, string> {
  const stated: Record<string, string> = {};
  for (const item of cells.flatMap((cell) => cell.replace(/\([^)]*\)/g, "").split(","))) {
    const pair = /^(\w+) (\d+(?:\.\d+)?)(?::1)?( soft)?/.exec(item.replaceAll("`", "").trim());
    if (pair?.[1] !== undefined) stated[pair[1]] = `${Number(pair[2])}${pair[3] ?? ""}`;
  }
  return stated;
}

/** What the table calls a numeric field, where that is not the field's own name. */
const TABLE_WORD: Record<string, string> = {
  fontPx: "font",
  targetPx: "target",
  budgetSeconds: "budget",
};

/** A fixture's numbers as its row would state them: a threshold with softness reads `N soft`. */
function fixtureNumbers(profile: Profile): Record<string, string> {
  const numbers: Record<string, string> = {};
  for (const metric of METRIC_NAMES) {
    const cut = profile.perception[metric];
    if (cut === undefined) continue;
    const soft = (cut.softness ?? 0) > 0 ? " soft" : "";
    numbers[TABLE_WORD[metric] ?? metric] = `${cut.threshold}${soft}`;
  }
  for (const [field, value] of Object.entries(profile.behaviour)) {
    if (value !== undefined) numbers[TABLE_WORD[field] ?? field] = `${value}`;
  }
  return numbers;
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
  test("there are five of them and each one validates", () => {
    expect(profileFixtures).toHaveLength(5);
    for (const fixture of profileFixtures) {
      expect(Profile.safeParse(fixture).success).toBe(true);
    }
    expect(profileFixtures.map((p) => p.id)).toEqual([
      "prof_ada",
      "prof_kai",
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

  test("the bundle table of docs/RULES.md has one row per persona, in fixture order", () => {
    expect(bundleRows().map((row) => row.label)).toEqual(profileFixtures.map((p) => p.label));
  });

  test("each persona's numbers in the RULES bundle table equal its fixture's, both ways", () => {
    const rows = bundleRows();
    for (const fixture of profileFixtures) {
      const row = rows.find((r) => r.label === fixture.label);
      expect(statedNumbers(row?.cells ?? []), fixture.label).toEqual(fixtureNumbers(fixture));
    }
  });

  test("the row reader takes a number where an item opens, keeps soft, and skips a citation", () => {
    // The comma inside the citation would open an item `SC 1.4.6)` if parentheses were kept.
    const cells = [
      "contrast 7:1 soft (WCAG 2.2, SC 1.4.6), font 24",
      "no contrast rule, budget 120 s",
    ];
    expect(statedNumbers(cells)).toEqual({ contrast: "7 soft", font: "24", budget: "120" });
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

  test("Vera: blurredVision, and hamburger, kebab and breadcrumb unknown", () => {
    const vera = profileFixture("prof_vera");
    expect(vera.perception.emulation).toBe("blurredVision");
    expect(vera.knowledge.unknownPatterns).toEqual(["hamburger", "kebab", "breadcrumb"]);
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
  });

  test("Milo is mobile, motor threshold only", () => {
    const milo = profileFixture("prof_milo");
    expect(milo.device).toBe("mobile");
    expect(METRIC_NAMES.filter((metric) => milo.perception[metric])).toEqual(["targetPx"]);
    expect(milo.knowledge.unknownPatterns).toEqual([]);
  });

  test("Zoya is the lower boundary: nothing known, everything capped", () => {
    const zoya = profileFixture("prof_zoya");
    expect(zoya.perception.emulation).toBe("reducedContrast");
    expect(zoya.knowledge.knownPatterns).toEqual([]);
    expect([...zoya.knowledge.unknownPatterns].sort()).toEqual([...UI_PATTERNS].sort());
    expect(zoya.behaviour.maxElements).toBeDefined();
    expect(zoya.behaviour.maxOptions).toBeDefined();
    expect(zoya.behaviour.memorySteps).toBeDefined();
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

  test("fixtures sort by name, from Ada, who switches nothing on, to Zoya, who switches on the most", () => {
    // In between the order is the alphabet, not the count: Kai switches on more than Milo.
    const labels = profileFixtures.map((p) => p.label);
    expect(labels).toEqual([...labels].sort());
    // The two ends are "the control persona switches nothing on and the boundary ..." below.
    const counts = profileFixtures.map(constraintCount);
    expect(counts.filter((count) => count === Math.max(...counts))).toHaveLength(1);
  });

  test("Kai sees what Ada sees", () => {
    // Kai differs from Ada only in knowledge, attention and memory.
    const ada = profileFixture("prof_ada");
    const kai = profileFixture("prof_kai");
    expect(kai.perception).toStrictEqual(ada.perception);
    expect(kai.device).toBe(ada.device);
    const vocabulary = kai.knowledge.domainVocabulary ?? [];
    expect(vocabulary.length).toBeGreaterThan(0);
    expect(vocabulary).not.toContain("fulfilment");
    expect(vocabulary).not.toContain("ledger");
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
