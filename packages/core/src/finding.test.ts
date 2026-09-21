import { describe, expect, test } from "vitest";
import {
  EvidenceRef,
  FINDING_TYPES,
  Finding,
  HARD_FINDING_TYPES,
  isHardFinding,
} from "./finding.js";
import { findingFixtures, profileFixtures, taskFixtures } from "./fixtures/index.js";

function fixture(id: string): Finding {
  const found = findingFixtures.find((f) => f.id === id);
  if (!found) throw new Error(`No finding fixture ${id}`);
  return found;
}

function rawFixture(id: string): Record<string, unknown> {
  return JSON.parse(JSON.stringify(fixture(id)));
}

describe("FindingType", () => {
  test("the three types of docs/PLAN.md F8 AC1, and no fourth", () => {
    expect(FINDING_TYPES).toEqual(["measurement", "deterministic", "hypothesis"]);
    expect(Finding.shape.type.safeParse("opinion").success).toBe(false);
  });

  test("a hypothesis is the only soft one", () => {
    const hard = FINDING_TYPES.filter((type) => HARD_FINDING_TYPES.includes(type));
    expect(hard).toEqual(["measurement", "deterministic"]);
    expect(isHardFinding(fixture("fnd_archive-link-below-contrast"))).toBe(true);
    expect(isHardFinding(fixture("fnd_deliveries-label-reads-as-current-only"))).toBe(false);
  });
});

describe("EvidenceRef", () => {
  test("it points at a step of a stored run", () => {
    expect(EvidenceRef.safeParse({ runId: "run_01jbqk3v9x", stepIndex: 0 }).success).toBe(true);
  });

  test("a step index is a non-negative integer and a run id carries its prefix", () => {
    expect(EvidenceRef.safeParse({ runId: "run_01jbqk3v9x", stepIndex: -1 }).success).toBe(false);
    expect(EvidenceRef.safeParse({ runId: "run_01jbqk3v9x", stepIndex: 1.5 }).success).toBe(false);
    expect(EvidenceRef.safeParse({ runId: "01jbqk3v9x", stepIndex: 0 }).success).toBe(false);
  });
});

describe("Finding schema", () => {
  test("a finding with no evidence does not validate", () => {
    const finding = rawFixture("fnd_archive-link-target-size");
    finding.evidence = [];
    const result = Finding.safeParse(finding);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("evidence");
  });

  test("a finding with no recommendation does not validate", () => {
    const finding = rawFixture("fnd_archive-link-target-size");
    delete finding.recommendation;
    expect(Finding.safeParse(finding).success).toBe(false);
    finding.recommendation = "";
    expect(Finding.safeParse(finding).success).toBe(false);
  });

  test("a finding has to say which kind of claim it is", () => {
    const finding = rawFixture("fnd_archive-link-target-size");
    delete finding.type;
    expect(Finding.safeParse(finding).success).toBe(false);
  });

  test("affecting nobody in particular is allowed, naming a persona that does not exist is not", () => {
    const finding = rawFixture("fnd_archive-link-target-size");
    finding.personaIds = [];
    expect(Finding.safeParse(finding).success).toBe(true);
    finding.personaIds = ["vera"];
    expect(Finding.safeParse(finding).success).toBe(false);
  });

  test("the axe rule id is optional", () => {
    const finding = rawFixture("fnd_archive-link-below-contrast");
    expect(finding.axeRuleId).toBeUndefined();
    expect(Finding.safeParse(finding).success).toBe(true);
  });

  test("an extra key does not pass", () => {
    const finding = rawFixture("fnd_archive-link-target-size");
    finding.severity = "high";
    expect(Finding.safeParse(finding).success).toBe(false);
  });
});

describe("fixtures", () => {
  test("there is one per type and each one validates", () => {
    expect(findingFixtures).toHaveLength(FINDING_TYPES.length);
    for (const fixture of findingFixtures) {
      expect(Finding.safeParse(fixture).success).toBe(true);
    }
    expect(findingFixtures.map((f) => f.type)).toEqual([...FINDING_TYPES]);
  });

  test("every one is clickable through to a step", () => {
    for (const fixture of findingFixtures) {
      expect(fixture.evidence.length).toBeGreaterThan(0);
      expect(fixture.recommendation.length).toBeGreaterThan(0);
    }
  });

  test("every task and persona named by a finding exists", () => {
    const taskIds = new Set(taskFixtures.map((t) => t.id));
    const profileIds = new Set(profileFixtures.map((p) => p.id));
    for (const fixture of findingFixtures) {
      expect(taskIds).toContain(fixture.taskId);
      for (const personaId of fixture.personaIds) expect(profileIds).toContain(personaId);
    }
  });

  test("no fixture describes a persona as able-bodied or impaired", () => {
    const banned = ["impaired", "disabled", "able-bodied", "handicap", "sprawn"];
    const source = JSON.stringify(findingFixtures).toLowerCase();
    for (const word of banned) expect(source).not.toContain(word);
  });

  test("no fixture carries vocabulary from one industry", () => {
    const words = ["energy", "energia", "tariff", "taryfa", "meter", "licznik", "kwh"];
    const source = JSON.stringify(findingFixtures).toLowerCase();
    for (const word of words) expect(source).not.toContain(word);
  });
});
