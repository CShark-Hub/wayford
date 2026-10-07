import {
  type DecisionRecord,
  type FinishedOutcome,
  PersonaResult,
  type Profile,
  RunResult,
  type RunSweep,
} from "@wayford/core";
import { observationFixture, profileFixture } from "@wayford/core/fixtures";
import { describe, expect, test } from "vitest";
import {
  backendOf,
  byPersona,
  defaultBackend,
  personaResults,
  type RouteFactsOf,
  selectRuns,
} from "./analyst-runs.js";
import { FAKE_JEV_MODEL, FAKE_LLM_MODEL, storedRun } from "./test-app.js";

const ada = profileFixture("prof_ada");
const kai = profileFixture("prof_kai");
const vera = profileFixture("prof_vera");

const SWEEP: RunSweep = { sweepId: "swp_contrast-test", axis: "contrast", value: 3 };

/** A stored run of one step on `/deliveries`. */
function run(
  profile: Profile,
  seed: number,
  options: {
    id: string;
    modelId?: string;
    sweep?: RunSweep;
    outcome?: FinishedOutcome;
    durationMs?: number;
  },
): RunResult {
  const { id, ...rest } = options;
  return storedRun({
    profile,
    seed,
    runId: id,
    steps: [{ observation: observationFixture }],
    ...rest,
  });
}

const ids = (runs: readonly RunResult[]) => runs.map((r) => r.id);

describe("backendOf", () => {
  test("a run is Jev's when the Actor's model is Jev's, and the LLM's otherwise", () => {
    expect(
      backendOf(run(vera, 1, { id: "run_jev", modelId: FAKE_JEV_MODEL }), FAKE_JEV_MODEL),
    ).toBe("jev");
    expect(
      backendOf(run(vera, 1, { id: "run_llm", modelId: FAKE_LLM_MODEL }), FAKE_JEV_MODEL),
    ).toBe("llm");
  });

  test("a step carrying a decision marks the run as Jev's under another model id", () => {
    // A Jev run from before a pinned-version bump: an older model id, but its steps were drawn.
    const older = run(vera, 1, { id: "run_jev-before-bump", modelId: "fake-jev-0" });
    // One option, the scroll the step performed, so the draw replays to its proposed action.
    const decision: DecisionRecord = {
      options: [{ action: { type: "scroll", direction: "down" }, description: "Scroll down" }],
      probabilities: [1],
      confidence: 0.9,
      rolled: 0.5,
    };
    const drawn = RunResult.parse({
      ...older,
      steps: older.steps.map((step) => ({ ...step, decision })),
    });
    expect(backendOf(older, FAKE_JEV_MODEL)).toBe("llm");
    expect(backendOf(drawn, FAKE_JEV_MODEL)).toBe("jev");
  });
});

describe("defaultBackend", () => {
  const llm = run(vera, 1, { id: "run_llm", modelId: FAKE_LLM_MODEL });
  const jev = run(vera, 2, { id: "run_jev", modelId: FAKE_JEV_MODEL });

  test("the one backend every run is on", () => {
    expect(defaultBackend([llm], FAKE_JEV_MODEL)).toBe("llm");
    expect(defaultBackend([jev], FAKE_JEV_MODEL)).toBe("jev");
  });

  test("Jev when the runs are on both backends, or there is none", () => {
    expect(defaultBackend([llm, jev], FAKE_JEV_MODEL)).toBe("jev");
    expect(defaultBackend([], FAKE_JEV_MODEL)).toBe("jev");
  });

  test("a sweep run does not count: the report leaves it out", () => {
    const sweep = run(vera, 3, { id: "run_jev-sweep", modelId: FAKE_JEV_MODEL, sweep: SWEEP });
    expect(defaultBackend([llm, sweep], FAKE_JEV_MODEL)).toBe("llm");
  });
});

describe("selectRuns", () => {
  // Newest first, as `listRuns` returns them.
  const runs = [
    run(vera, 1, { id: "run_vera-1-latest" }),
    run(vera, 1, { id: "run_vera-1-sweep", sweep: SWEEP }),
    run(vera, 1, { id: "run_vera-1-jev", modelId: FAKE_JEV_MODEL }),
    run(vera, 2, { id: "run_vera-2-latest" }),
    run(vera, 1, { id: "run_vera-1-older" }),
    run(ada, 1, { id: "run_ada-1" }),
    run(vera, 2, { id: "run_vera-2-older" }),
    // A sweep on the other backend is counted as a sweep run, the first reason checked.
    run(vera, 1, { id: "run_vera-1-jev-sweep", modelId: FAKE_JEV_MODEL, sweep: SWEEP }),
  ];

  test("the latest run per persona and seed is chosen", () => {
    const { chosen } = selectRuns(runs, "llm", FAKE_JEV_MODEL);
    expect(chosen).toHaveLength(3);
    expect(new Set(ids(chosen))).toEqual(
      new Set(["run_ada-1", "run_vera-1-latest", "run_vera-2-latest"]),
    );
  });

  test("sweep runs, runs on the other backend and older runs are each counted", () => {
    expect(selectRuns(runs, "llm", FAKE_JEV_MODEL).leftOut).toEqual({
      olderRuns: 2,
      otherBackend: 1,
      sweepRuns: 2,
    });
  });

  test("on the other backend the same runs count the other way round", () => {
    const { chosen, leftOut } = selectRuns(runs, "jev", FAKE_JEV_MODEL);
    expect(ids(chosen)).toEqual(["run_vera-1-jev"]);
    expect(leftOut).toEqual({ olderRuns: 0, otherBackend: 5, sweepRuns: 2 });
  });

  test("no runs, nothing chosen and nothing left out", () => {
    expect(selectRuns([], "jev", FAKE_JEV_MODEL)).toEqual({
      chosen: [],
      leftOut: { olderRuns: 0, otherBackend: 0, sweepRuns: 0 },
    });
  });
});

describe("byPersona", () => {
  test("one group per persona with runs, in profileFixtures order, each by seed ascending", () => {
    const chosen = [
      run(vera, 2, { id: "run_vera-2" }),
      run(ada, 1, { id: "run_ada-1" }),
      run(vera, 1, { id: "run_vera-1" }),
      run(kai, 1, { id: "run_kai-1" }),
    ];
    const groups = byPersona(chosen);
    expect(groups.map((g) => [g.profile.id, ids(g.runs)])).toEqual([
      ["prof_ada", ["run_ada-1"]],
      ["prof_kai", ["run_kai-1"]],
      ["prof_vera", ["run_vera-1", "run_vera-2"]],
    ]);
  });

  test("a run of a profile that is not bundled throws unknown_profile, naming the run", () => {
    const stranger: Profile = { ...vera, id: "prof_stranger", label: "Stranger" };
    const chosen = [run(vera, 1, { id: "run_vera-1" }), run(stranger, 1, { id: "run_stranger-1" })];
    expect(() => byPersona(chosen)).toThrow(
      expect.objectContaining({
        code: "unknown_profile",
        message: expect.stringContaining("run_stranger-1"),
      }),
    );
  });
});

describe("personaResults", () => {
  const facts = (entries: [string, RouteFactsOf][]) => new Map(entries);
  /** `personaResults` over `chosen` grouped as the report groups them. */
  const resultsOf = (chosen: readonly RunResult[], over = facts([])) =>
    personaResults(byPersona(chosen), over);

  test("counts each persona's runs, successes and errors, seeds ascending", () => {
    const chosen = [
      run(vera, 3, { id: "run_vera-3", outcome: "success", durationMs: 3000 }),
      run(vera, 1, { id: "run_vera-1", outcome: "gave_up" }),
      run(vera, 2, { id: "run_vera-2", outcome: "budget_exceeded" }),
    ];
    // An error is a `runFailed`, which `storedRun` does not emit: the fold's outcome, set after.
    const failed = RunResult.parse({ ...run(vera, 4, { id: "run_vera-4" }), outcome: "error" });
    const [result] = resultsOf([...chosen, failed]);
    expect(result).toEqual({
      profileId: "prof_vera",
      runs: 4,
      errors: 1,
      successes: 1,
      routeOpenSeeds: null,
      medianSuccessMs: 3000,
      seeds: [
        { seed: 1, runId: "run_vera-1", outcome: "gave_up", openRoutes: null },
        { seed: 2, runId: "run_vera-2", outcome: "budget_exceeded", openRoutes: null },
        { seed: 3, runId: "run_vera-3", outcome: "success", openRoutes: null },
        { seed: 4, runId: "run_vera-4", outcome: "error", openRoutes: null },
      ],
    });
    expect(PersonaResult.safeParse(result).success).toBe(true);
  });

  test("one result per persona with runs, in profileFixtures order", () => {
    const chosen = [
      run(vera, 1, { id: "run_vera-1" }),
      run(ada, 1, { id: "run_ada-1" }),
      run(kai, 1, { id: "run_kai-1" }),
    ];
    const results = resultsOf(chosen);
    expect(results.map((r) => r.profileId)).toEqual(["prof_ada", "prof_kai", "prof_vera"]);
  });

  test("route-open seeds count the seeds with a route open; null without the persona's facts", () => {
    const chosen = [
      run(ada, 1, { id: "run_ada-1" }),
      run(vera, 3, { id: "run_vera-3" }),
      run(vera, 1, { id: "run_vera-1" }),
      run(vera, 2, { id: "run_vera-2" }),
    ];
    const veraFacts: RouteFactsOf = {
      open: [
        { seed: 1, open: ["A"] },
        { seed: 2, open: [] },
        { seed: 3, open: ["B", "C"] },
      ],
      closings: [],
    };
    // Ada is absent from the facts: no route table for her.
    const [adaResult, veraResult] = resultsOf(chosen, facts([["prof_vera", veraFacts]]));
    expect(adaResult?.routeOpenSeeds).toBeNull();
    expect(adaResult?.seeds.map((s) => s.openRoutes)).toEqual([null]);
    expect(veraResult?.routeOpenSeeds).toBe(2);
    expect(veraResult?.seeds.map((s) => s.openRoutes)).toEqual([["A"], [], ["B", "C"]]);
  });

  test("the median over successes is web's: the middle value, or the mean of the two middles", () => {
    const successes = (durations: number[]) =>
      durations.map((durationMs, i) =>
        run(vera, i + 1, { id: `run_vera-${i + 1}`, outcome: "success", durationMs }),
      );
    const median = (durations: number[]) => resultsOf(successes(durations))[0]?.medianSuccessMs;
    expect(median([3000, 1000, 2000])).toBe(2000);
    expect(median([4000, 1000, 3000, 2000])).toBe(2500);
    // Not over the runs that did not succeed.
    const mixed = [...successes([1000]), run(vera, 9, { id: "run_vera-9", durationMs: 9000 })];
    expect(resultsOf(mixed)[0]?.medianSuccessMs).toBe(1000);
    expect(resultsOf([run(vera, 1, { id: "run_vera-1" })])[0]).toMatchObject({
      successes: 0,
      medianSuccessMs: null,
    });
  });
});
