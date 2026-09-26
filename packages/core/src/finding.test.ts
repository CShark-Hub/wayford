import { describe, expect, test } from "vitest";
import {
  EvidenceRef,
  FINDING_TYPES,
  Finding,
  FindingBasis,
  HARD_FINDING_TYPES,
  isHardFinding,
} from "./finding.js";
import {
  findingFixtures,
  observationFixture,
  profileFixture,
  profileFixtures,
  taskFixtures,
} from "./fixtures/index.js";

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

  test("a hypothesis is soft by type", () => {
    const hard = FINDING_TYPES.filter((type) => HARD_FINDING_TYPES.includes(type));
    expect(hard).toEqual(["measurement", "deterministic"]);
    expect(isHardFinding(fixture("fnd_archive-link-contrast-ratio"))).toBe(true);
    expect(isHardFinding(fixture("fnd_archive-link-below-contrast"))).toBe(true);
    expect(isHardFinding(fixture("fnd_deliveries-label-reads-as-current-only"))).toBe(false);
  });

  test("a finding resting on a folk or llm threshold is soft whatever its type", () => {
    // Vera's target threshold has no citation behind it. A P4 filter decision
    // about her is deterministic in how it was made, not in how far it holds.
    const provenance = profileFixture("prof_vera").perception.targetPx?.provenance;
    expect(provenance).toBe("folk");

    const deterministic = rawFixture("fnd_archive-link-below-contrast");
    deterministic.personaIds = ["prof_vera"];
    deterministic.basis = [{ rule: "P4", provenance }];
    expect(isHardFinding(Finding.parse(deterministic))).toBe(false);

    deterministic.basis = [{ rule: "P4", provenance: "llm" }];
    expect(isHardFinding(Finding.parse(deterministic))).toBe(false);

    deterministic.basis = [
      { rule: "P1", provenance: "wcag22" },
      { rule: "P4", provenance: "folk" },
    ];
    expect(isHardFinding(Finding.parse(deterministic))).toBe(false);

    deterministic.basis = [{ rule: "P1", provenance: "wcag22" }];
    expect(isHardFinding(Finding.parse(deterministic))).toBe(true);

    const measurement = rawFixture("fnd_archive-link-contrast-ratio");
    measurement.basis = [{ rule: "P4", provenance: "folk" }];
    expect(isHardFinding(Finding.parse(measurement))).toBe(false);
  });
});

describe("FindingBasis", () => {
  test("a basis entry is a rule id and a source id, nothing else", () => {
    expect(FindingBasis.safeParse({ rule: "P4", provenance: "folk" }).success).toBe(true);
    expect(FindingBasis.safeParse({ rule: "Z9", provenance: "folk" }).success).toBe(false);
    expect(FindingBasis.safeParse({ rule: "P4", provenance: "vibes" }).success).toBe(false);
    expect(FindingBasis.safeParse({ rule: "P4", provenance: "folk", threshold: 32 }).success).toBe(
      false,
    );
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

  test("a pointer carries nothing but the pointer", () => {
    expect(
      EvidenceRef.safeParse({ runId: "run_01jbqk3v9x", stepIndex: 0, screenshot: "a.png" }).success,
    ).toBe(false);
  });
});

describe("Finding schema", () => {
  test("a finding with no evidence does not validate", () => {
    const finding = rawFixture("fnd_archive-link-contrast-ratio");
    finding.evidence = [];
    const result = Finding.safeParse(finding);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("evidence");
  });

  test("a finding with no recommendation does not validate", () => {
    const finding = rawFixture("fnd_archive-link-contrast-ratio");
    delete finding.recommendation;
    expect(Finding.safeParse(finding).success).toBe(false);
    finding.recommendation = "";
    expect(Finding.safeParse(finding).success).toBe(false);
  });

  test("a finding has to say which kind of claim it is", () => {
    const finding = rawFixture("fnd_archive-link-contrast-ratio");
    delete finding.type;
    expect(Finding.safeParse(finding).success).toBe(false);
  });

  test("a finding without a claim or without its reasoning does not validate", () => {
    for (const field of ["title", "detail"]) {
      const finding = rawFixture("fnd_archive-link-contrast-ratio");
      delete finding[field];
      expect(Finding.safeParse(finding).success).toBe(false);
      finding[field] = "   ";
      expect(Finding.safeParse(finding).success).toBe(false);
    }
  });

  test("affecting nobody in particular is allowed, an id without its prefix is not", () => {
    const finding = rawFixture("fnd_archive-link-contrast-ratio");
    finding.personaIds = [];
    expect(Finding.safeParse(finding).success).toBe(true);
    finding.personaIds = ["vera"];
    expect(Finding.safeParse(finding).success).toBe(false);
  });

  test("the schema checks the shape of a persona id, not that the persona exists", () => {
    // Deliberate: `core` holds no registry to check against. The fixture-level
    // cross-check below is what catches an id that is well formed but unknown.
    const finding = rawFixture("fnd_archive-link-contrast-ratio");
    finding.personaIds = ["prof_nobody"];
    expect(Finding.safeParse(finding).success).toBe(true);
  });

  test("the axe rule id is optional", () => {
    const finding = rawFixture("fnd_archive-link-below-contrast");
    expect(finding.axeRuleId).toBeUndefined();
    expect(Finding.safeParse(finding).success).toBe(true);
  });

  test("only a measurement or deterministic finding may cite an axe rule (F10 AC2)", () => {
    const hypothesis = rawFixture("fnd_deliveries-label-reads-as-current-only");
    hypothesis.axeRuleId = "color-contrast";
    const result = Finding.safeParse(hypothesis);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("axeRuleId");

    const deterministic = rawFixture("fnd_archive-link-below-contrast");
    deterministic.axeRuleId = "color-contrast";
    expect(Finding.safeParse(deterministic).success).toBe(true);
  });

  test("a deterministic finding with no basis does not validate", () => {
    const finding = rawFixture("fnd_archive-link-below-contrast");
    finding.basis = [];
    const result = Finding.safeParse(finding);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("basis");
    delete finding.basis;
    expect(Finding.safeParse(finding).success).toBe(false);
  });

  test("a measurement or a hypothesis may rest on no rule, but still carries the key", () => {
    for (const id of [
      "fnd_archive-link-contrast-ratio",
      "fnd_deliveries-label-reads-as-current-only",
    ]) {
      const finding = rawFixture(id);
      finding.basis = [];
      expect(Finding.safeParse(finding).success).toBe(true);
      delete finding.basis;
      expect(Finding.safeParse(finding).success).toBe(false);
    }
  });

  test("an extra key does not pass", () => {
    const finding = rawFixture("fnd_archive-link-contrast-ratio");
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

  test("every contrast ratio a finding quotes is grounded in another fixture", () => {
    // The finding fixtures and the observation fixture describe the same
    // element of the same page. Nothing but this test stops them drifting,
    // and a `measurement` whose numbers are not in evidence is the one thing
    // the type is supposed to rule out.
    const WCAG_ANCHORS = [3, 4.5, 7];
    const measured = observationFixture.elements
      .map((element) => element.metrics.contrast)
      .filter((value): value is number => value !== undefined);
    const thresholds = profileFixtures
      .map((profile) => profile.perception.contrast?.threshold)
      .filter((value): value is number => value !== undefined);
    const grounded = new Set([...measured, ...thresholds, ...WCAG_ANCHORS]);

    const quoted = findingFixtures.flatMap((finding) =>
      [...`${finding.title} ${finding.detail}`.matchAll(/(\d+(?:\.\d+)?):1/g)].map((match) =>
        Number(match[1]),
      ),
    );
    expect(quoted.length).toBeGreaterThan(0);
    for (const ratio of quoted) expect(grounded).toContain(ratio);
  });

  test("a finding names only personas the claim can hold for", () => {
    // `fnd_archive-link-below-contrast` says the link never reaches the Actor.
    // That is only deterministic for a persona whose threshold sits above the
    // softness band, so it must not name one whose outcome is a dice roll.
    const archive = observationFixture.elements.find((e) => e.key === "main//link:Archive");
    const contrast = archive?.metrics.contrast;
    if (contrast === undefined) throw new Error("the observation fixture no longer has the link");

    for (const personaId of fixture("fnd_archive-link-below-contrast").personaIds) {
      const perception = profileFixtures.find((p) => p.id === personaId)?.perception.contrast;
      if (!perception) throw new Error(`${personaId} sets no contrast threshold to be below`);
      const bandFloor = perception.threshold * (1 - (perception.softness ?? 0));
      expect(contrast).toBeLessThan(bandFloor);
    }
  });

  test("a finding's basis agrees with the profiles it names", () => {
    // Only the threshold rules whose provenance is set per profile are checked
    // here. A fixture resting on any other rule fails the first assertion, so
    // the map gets extended instead of the entry going unchecked.
    const METRIC_OF_RULE = {
      P1: "contrast",
      P3: "fontPx",
      P4: "targetPx",
    } as const;
    for (const finding of findingFixtures) {
      for (const entry of finding.basis) {
        expect(Object.keys(METRIC_OF_RULE)).toContain(entry.rule);
        const metric = METRIC_OF_RULE[entry.rule as keyof typeof METRIC_OF_RULE];
        const held = finding.personaIds.map((personaId) => {
          const threshold = profileFixture(personaId).perception[metric];
          if (!threshold) throw new Error(`${personaId} sets no ${metric} threshold`);
          expect(finding.basis).toContainEqual({
            rule: entry.rule,
            provenance: threshold.provenance,
          });
          return threshold.provenance;
        });
        expect(held).toContain(entry.provenance);
      }
    }
  });

  test("every rule a fixture's detail quotes is in its basis", () => {
    for (const finding of findingFixtures) {
      const quoted = new Set(finding.detail.match(/\b[PKVAMB]\d\b/g) ?? []);
      const based = finding.basis.map((entry) => entry.rule);
      for (const rule of quoted) expect(based).toContain(rule);
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
