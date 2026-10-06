import { describe, expect, test } from "vitest";
import { FINDING_TYPES, isHardFinding } from "./finding.js";
import {
  measurementFixture,
  profileFixture,
  profileFixtures,
  reportFixture,
  reportFixtures,
  taskFixtures,
} from "./fixtures/index.js";
import { hash } from "./random.js";
import { PersonaResult, Report } from "./report.js";

/** A deep copy of a fixture report to break one rule on. */
function copy(taskId: string): Report {
  return structuredClone(reportFixture(taskId));
}

/** The persona row of `profileId`, which a test knows is there. */
function persona(report: Report, profileId: string): PersonaResult {
  const found = report.personas.find((result) => result.profileId === profileId);
  if (!found) throw new Error(`the fixture has no persona ${profileId}`);
  return found;
}

/** The finding at `index`, which a test knows is there. */
function finding(report: Report, index: number): Report["findings"][number] {
  const found = report.findings[index];
  if (!found) throw new Error(`the fixture has no finding ${index}`);
  return found;
}

/** The messages of every issue `schema` fails `value` with. */
function issues(schema: typeof Report | typeof PersonaResult, value: unknown): string[] {
  const parsed = schema.safeParse(value);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
}

const HARD = "task_past-order";
const EASY = "task_next-parcel";

describe("fixtures", () => {
  test("two reports, the hard goal then the easy one, each parses", () => {
    expect(reportFixtures.map((report) => report.taskId)).toEqual([HARD, EASY]);
    for (const report of reportFixtures) expect(issues(Report, report)).toEqual([]);
  });

  test("reportFixture finds a report by task and throws on an unknown one", () => {
    expect(reportFixture(EASY).taskId).toBe(EASY);
    expect(() => reportFixture("task_nothing")).toThrow("No report fixture task_nothing");
  });

  test("every task and persona a report names exists", () => {
    const taskIds = taskFixtures.map((task) => task.id);
    const profileIds = profileFixtures.map((profile) => profile.id);
    for (const report of reportFixtures) {
      expect(taskIds).toContain(report.taskId);
      for (const result of report.personas) expect(profileIds).toContain(result.profileId);
    }
  });

  test("the hard-goal fixture holds one finding of each type, and a soft one", () => {
    const { findings } = reportFixture(HARD);
    for (const type of FINDING_TYPES) {
      expect(findings.map((f) => f.type)).toContain(type);
    }
    // Kai's A1 rests on a folk cap: a filter decision, and soft all the same.
    const soft = findings.filter((f) => f.type === "deterministic" && !isHardFinding(f));
    expect(soft.map((f) => f.personaIds)).toEqual([["prof_kai"]]);
    expect(soft[0]?.basis).toEqual([{ rule: "A1", provenance: "folk" }]);
  });

  test("the hard goal: Scout reached it, and every persona has a route-open count", () => {
    const report = reportFixture(HARD);
    expect(report.scout).toMatchObject({ status: "reached", steps: 2 });
    for (const result of report.personas) expect(result.routeOpenSeeds).not.toBeNull();
    expect(report.unevidencedClosures.map((c) => [c.profileId, c.routeId])).toEqual([
      ["prof_vera", "B"],
      ["prof_vera", "C"],
    ]);
  });

  test("the hard goal's open routes follow the RULES route table", () => {
    // Ada keeps every route, Kai's A1 closes A, and Vera's P4 closes B and C at every seed.
    // Her A is open exactly in the seeds whose roll keeps the archive link in her band.
    const report = reportFixture(HARD);
    for (const { openRoutes } of persona(report, "prof_ada").seeds) {
      expect(openRoutes).toEqual(["A", "B", "C"]);
    }
    for (const { openRoutes } of persona(report, "prof_kai").seeds) {
      expect(openRoutes).toEqual(["B", "C"]);
    }

    const link = measurementFixture.elements.find((e) => e.key === "main//link:Order archive");
    const contrast = profileFixture("prof_vera").perception.contrast;
    if (link?.metrics.contrast === undefined || !contrast?.softness) {
      throw new Error("the archive link or Vera's soft contrast cut is gone");
    }
    const floor = contrast.threshold * (1 - contrast.softness);
    const position = (link.metrics.contrast - floor) / (contrast.threshold - floor);
    for (const { seed, openRoutes } of persona(report, "prof_vera").seeds) {
      expect(openRoutes).toEqual(hash(seed, link.key) < position ? ["A"] : []);
    }
  });

  test("the easy goal: no route table, no ground truth, one hypothesis", () => {
    const report = reportFixture(EASY);
    expect(report.scout).toEqual({ status: "noGroundTruth" });
    for (const result of report.personas) {
      expect(result.routeOpenSeeds).toBeNull();
      for (const { openRoutes } of result.seeds) expect(openRoutes).toBeNull();
    }
    expect(report.findings.map((f) => f.type)).toEqual(["hypothesis"]);
    expect(report.unevidencedClosures).toEqual([]);
  });

  test("no fixture describes a persona as impaired, or claims to predict people", () => {
    const banned = ["impaired", "disabled", "blind", "can't see", "cannot see", "predict"];
    const source = JSON.stringify(reportFixtures).toLowerCase();
    for (const word of banned) expect(source).not.toContain(word);
  });
});

describe("PersonaResult", () => {
  const ada = () => persona(copy(HARD), "prof_ada");
  const vera = () => persona(copy(HARD), "prof_vera");

  test("runs, successes and errors count the seeds", () => {
    expect(issues(PersonaResult, { ...ada(), runs: 4 })).toEqual([
      "runs must be the number of seeds",
    ]);
    expect(issues(PersonaResult, { ...ada(), successes: 2 })).toEqual([
      "successes must count the seeds that ended in success",
    ]);
    expect(issues(PersonaResult, { ...ada(), errors: 1 })).toEqual([
      "errors must count the seeds that ended in error",
    ]);
  });

  test("a seed appears once", () => {
    const result = ada();
    const [first, second] = result.seeds;
    if (!first || !second) throw new Error("the fixture has fewer than two seeds");
    second.seed = first.seed;
    expect(issues(PersonaResult, result)).toEqual(["each seed appears once"]);
  });

  test("open routes are null on every seed or on none", () => {
    const result = ada();
    const [first] = result.seeds;
    if (!first) throw new Error("the fixture has no seed");
    first.openRoutes = null;
    expect(issues(PersonaResult, result)).toEqual([
      "openRoutes is null on every seed or on none: a goal has a route table or it has not",
    ]);
  });

  test("routeOpenSeeds is null exactly without a route table, and otherwise counts", () => {
    expect(issues(PersonaResult, { ...vera(), routeOpenSeeds: null })).toEqual([
      "routeOpenSeeds is null exactly when the seeds' openRoutes are",
    ]);
    expect(issues(PersonaResult, { ...vera(), routeOpenSeeds: 3 })).toEqual([
      "routeOpenSeeds must count the seeds with at least one route open",
    ]);
    const easy = persona(copy(EASY), "prof_vera");
    expect(issues(PersonaResult, { ...easy, routeOpenSeeds: 0 })).toEqual([
      "routeOpenSeeds is null exactly when the seeds' openRoutes are",
    ]);
  });

  test("the median is null exactly when nothing got through", () => {
    expect(issues(PersonaResult, { ...ada(), medianSuccessMs: null })).toEqual([
      "medianSuccessMs is null exactly when there is no success",
    ]);
    expect(issues(PersonaResult, { ...vera(), medianSuccessMs: 30_000 })).toEqual([
      "medianSuccessMs is null exactly when there is no success",
    ]);
  });
});

describe("Report", () => {
  test("runCount is the sum of the personas' runs", () => {
    const report = copy(HARD);
    report.runCount += 1;
    expect(issues(Report, report)).toEqual(["runCount must be the sum of the personas' runs"]);
  });

  test("a persona appears once", () => {
    const report = copy(HARD);
    const ada = persona(report, "prof_ada");
    report.personas.push(structuredClone(ada));
    report.runCount += ada.runs;
    expect(issues(Report, report)).toEqual(["each persona appears once"]);
  });

  test("every finding is about the report's task", () => {
    const report = copy(HARD);
    finding(report, 0).taskId = EASY;
    expect(issues(Report, report)).toEqual(["a finding is about the report's task"]);
  });

  test("evidence names a run the report read", () => {
    const report = copy(HARD);
    const [ref] = finding(report, 0).evidence;
    if (!ref) throw new Error("the fixture's finding has no evidence");
    ref.runId = "run_vera-past-order-9";
    expect(issues(Report, report)).toEqual(["evidence names a run the report did not read"]);
  });

  test("a finding or a closure names only personas of the report", () => {
    const report = copy(HARD);
    finding(report, 0).personaIds = ["prof_zoya"];
    expect(issues(Report, report)).toEqual(["a finding names a persona the report does not hold"]);

    const closures = copy(HARD);
    const [closure] = closures.unevidencedClosures;
    if (!closure) throw new Error("the fixture has no unevidenced closure");
    closure.profileId = "prof_milo";
    expect(issues(Report, closures)).toEqual([
      "a closure names a persona the report does not hold",
    ]);
  });
});
