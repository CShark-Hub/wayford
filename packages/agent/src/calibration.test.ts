/**
 * The calibration table's pure half (`docs/specs/2026-10-02-s2-11-calibration-run.md`): the set,
 * the route lookup, the ends, the medians, the go/no-go, the estimate (`models.ts`) and the
 * table. Every run is hand-built from core's run fixture and parsed with core's `RunResult`, so
 * each one is a shape the loop can store. No browser, no model.
 */
import {
  type CompleteRunStep,
  type IncompleteRunStep,
  RunResult,
  type RunStep,
} from "@wayford/core";
import { profileFixture, runResultFixture } from "@wayford/core/fixtures";
import { describe, expect, test } from "vitest";
import {
  type CalibrationRow,
  type CalibrationRun,
  calibrationSet,
  endOf,
  goNoGo,
  type RowSummary,
  renderTable,
  routeOf,
  summarise,
} from "./calibration.js";
import { estimateUsd, loadModelPrices, priceOf } from "./models.js";

const ORIGIN = "http://localhost:5174";
const MAX_STEPS = 20;
const HARD = "task_past-order";
const EASY = "task_next-parcel";

const template = runResultFixture.steps[0] as CompleteRunStep;

/** A step that observed `page` and landed on `next`, billed `tokensIn` in. */
function step(stepIndex: number, page: string, next: string, tokensIn = 1000): CompleteRunStep {
  const url = `${ORIGIN}${page}`;
  return {
    ...template,
    stepIndex,
    fullObservation: { ...template.fullObservation, url, stepIndex },
    urlBefore: url,
    urlAfter: `${ORIGIN}${next}`,
    cost: { tokensIn, tokensOut: 100, usd: 0.001 },
  };
}

/** The last step of a run cut short after the observation, before any action was planned. */
function cutShort(stepIndex: number, page: string): IncompleteRunStep {
  const { proposedAction, performedAction, dice, cost, urlAfter, screenshotPath, ...base } = step(
    stepIndex,
    page,
    page,
  );
  return { ...base, incomplete: true };
}

/** `count` complete steps on `/`, each landing on `/` again. */
function wander(count: number): CompleteRunStep[] {
  return Array.from({ length: count }, (_, i) => step(i, "/", "/"));
}

function run(fields: {
  steps: RunStep[];
  outcome: RunResult["outcome"];
  taskId?: string;
  durationMs?: number;
  usd?: number;
}): RunResult {
  return RunResult.parse({
    ...runResultFixture,
    taskId: fields.taskId ?? HARD,
    steps: fields.steps,
    outcome: fields.outcome,
    durationMs: fields.durationMs ?? 10_000,
    cost: { tokensIn: 0, tokensOut: 0, usd: fields.usd ?? 0.01 },
  });
}

/** A hard-goal success whose last step was on `lastPage`. */
function successVia(lastPage: string, steps = 2): RunResult {
  return run({
    outcome: "success",
    steps: [...wander(steps - 1), step(steps - 1, lastPage, "/deliveries/archive")],
  });
}

const viaA = successVia("/deliveries");
const viaB = successVia("/account", 3);
const viaC = successVia("/settings/data", 4);
const gaveUp = run({ outcome: "gave_up", steps: wander(2) });
const crashed = run({ outcome: "error", steps: [...wander(1), cutShort(1, "/account")] });

describe("calibrationSet", () => {
  test("lists the task's five rows, in its order, with the judged ones marked", () => {
    const rows = calibrationSet();
    expect(rows.map((row) => [row.label, row.profile.id, row.task.id, row.judged])).toStrictEqual([
      ["Ada, easy", "prof_ada", EASY, "reach"],
      ["Ada, hard", "prof_ada", HARD, "reach"],
      ["Vera, hard", "prof_vera", HARD, undefined],
      ["Kai, hard", "prof_kai", HARD, undefined],
      ["Vera hard-cut, hard", "prof_vera", HARD, "never"],
    ]);
  });

  test("the hard-cut Vera differs from Vera in her contrast cut alone", () => {
    const vera = profileFixture("prof_vera");
    const hardCut = calibrationSet()[4]?.profile;
    expect(hardCut?.perception.contrast).toStrictEqual({
      threshold: 3,
      softness: 0,
      provenance: vera.perception.contrast?.provenance,
    });
    expect({
      ...hardCut,
      perception: { ...hardCut?.perception, contrast: undefined },
    }).toStrictEqual({ ...vera, perception: { ...vera.perception, contrast: undefined } });
    // The fixture itself is untouched.
    expect(vera.perception.contrast?.softness).toBe(0.5);
  });
});

describe("routeOf reads the route off the last page", () => {
  test.each([
    ["/deliveries", "A", viaA],
    ["/account", "B", viaB],
    ["/settings/data", "C", viaC],
  ])("a success from %s is route %s", (_page, route, result) => {
    expect(routeOf(result)).toBe(route);
  });

  test("a page no route ends on is ?", () => {
    expect(routeOf(successVia("/settings"))).toBe("?");
  });

  test("the easy goal has no route", () => {
    const easy = run({
      taskId: EASY,
      outcome: "success",
      steps: [step(0, "/", "/account"), step(1, "/account", "/account/address")],
    });
    expect(routeOf(easy)).toBeUndefined();
  });

  test("a run that did not succeed has no route", () => {
    expect(routeOf(gaveUp)).toBeUndefined();
    expect(routeOf(crashed)).toBeUndefined();
  });
});

describe("endOf tells the step cap from the clock", () => {
  test("success, gave_up and error end as themselves", () => {
    expect(endOf(viaA, MAX_STEPS)).toBe("success");
    expect(endOf(gaveUp, MAX_STEPS)).toBe("gave_up");
    expect(endOf(crashed, MAX_STEPS)).toBe("error");
  });

  test("budget_exceeded at maxSteps with a complete last step is the step cap", () => {
    expect(endOf(run({ outcome: "budget_exceeded", steps: wander(MAX_STEPS) }), MAX_STEPS)).toBe(
      "step_cap",
    );
  });

  test("budget_exceeded at maxSteps with a wasted last step is the step cap", () => {
    const { proposedAction, performedAction, dice, urlAfter, screenshotPath, ...base } = step(
      MAX_STEPS - 1,
      "/",
      "/",
    );
    const wasted: RunStep = {
      ...base,
      narration: "",
      wasted: true,
      rejected: [{ narration: "e99", action: { type: "click", ref: "e99" } }],
    };
    const result = run({
      outcome: "budget_exceeded",
      steps: [...wander(MAX_STEPS - 1), wasted],
    });
    expect(endOf(result, MAX_STEPS)).toBe("step_cap");
  });

  test("budget_exceeded with an incomplete last step at maxSteps is the clock", () => {
    const result = run({
      outcome: "budget_exceeded",
      steps: [...wander(MAX_STEPS - 1), cutShort(MAX_STEPS - 1, "/")],
    });
    expect(endOf(result, MAX_STEPS)).toBe("clock");
  });

  test("budget_exceeded below maxSteps is the clock, complete last step or not", () => {
    const cut = run({ outcome: "budget_exceeded", steps: [...wander(3), cutShort(3, "/")] });
    expect(endOf(cut, MAX_STEPS)).toBe("clock");
    expect(endOf(run({ outcome: "budget_exceeded", steps: wander(4) }), MAX_STEPS)).toBe("clock");
  });
});

/** A row of the set, by label. */
function row(label: string): CalibrationRow {
  const found = calibrationSet().find((candidate) => candidate.label === label);
  if (found === undefined) throw new Error(`no row ${label}`);
  return found;
}

function calibrationRun(seed: number, result: RunResult, latencyMs: number[] = []): CalibrationRun {
  return { seed, result, latencyMs };
}

describe("summarise gives the medians and end counts", () => {
  test("an odd count: the middle value, ends counted, routes counted", () => {
    const runs = [
      calibrationRun(1, viaA, [300, 100]), // 2 steps, 10 s
      calibrationRun(2, viaB, [200]), // 3 steps
      calibrationRun(
        3,
        run({ outcome: "gave_up", steps: wander(5), durationMs: 30_000 }),
        [500, 400],
      ),
      calibrationRun(4, run({ outcome: "budget_exceeded", steps: wander(MAX_STEPS) })),
      calibrationRun(5, crashed, [50]),
    ];
    const summary = summarise(row("Ada, hard"), runs, MAX_STEPS);
    expect(summary).toMatchObject({
      label: "Ada, hard",
      runs: 5,
      successes: 2,
      ends: { gave_up: 1, step_cap: 1, clock: 0, error: 1 },
      // Steps 2, 3, 5, 20, 2.
      medianSteps: 3,
      // 300, 100, 200, 500, 400, 50.
      medianLatencyMs: 250,
      medianPromptTokens: 1000,
      // 10, 10, 30, 10, 10 s.
      medianWallMs: 10_000,
      verdict: "fail",
    });
    expect(summary.routes).toStrictEqual({ A: 1, B: 1 });
    expect(summary.costUsd).toBeCloseTo(0.05, 10);
  });

  test("an even count: the mean of the two middle values", () => {
    const runs = [
      calibrationRun(1, successVia("/deliveries", 2), [100]),
      calibrationRun(2, successVia("/deliveries", 5), [400]),
      calibrationRun(3, successVia("/settings", 3), [200, 300]),
      calibrationRun(4, successVia("/account", 4)),
    ];
    const summary = summarise(row("Vera, hard"), runs, MAX_STEPS);
    expect(summary).toMatchObject({
      runs: 4,
      successes: 4,
      routes: { A: 2, "?": 1, B: 1 },
      ends: { gave_up: 0, step_cap: 0, clock: 0, error: 0 },
      medianSteps: 3.5,
      medianLatencyMs: 250,
    });
    // Reported, not judged.
    expect(summary.verdict).toBeUndefined();
  });

  test("tokens in per step skip a step that never planned; the medians of nothing are 0", () => {
    const mixed = run({
      outcome: "budget_exceeded",
      steps: [step(0, "/", "/", 900), step(1, "/", "/", 1300), cutShort(2, "/")],
    });
    expect(summarise(row("Kai, hard"), [calibrationRun(1, mixed)], MAX_STEPS)).toMatchObject({
      medianPromptTokens: 1100,
      medianLatencyMs: 0,
    });
    expect(summarise(row("Kai, hard"), [], MAX_STEPS)).toMatchObject({
      runs: 0,
      medianSteps: 0,
      medianLatencyMs: 0,
      medianPromptTokens: 0,
      medianWallMs: 0,
      costUsd: 0,
    });
  });
});

/** The row's summary over `results` on seeds 1, 2, .... */
function judged(verdictRow: CalibrationRow, results: RunResult[]): RowSummary {
  return summarise(
    verdictRow,
    results.map((result, i) => calibrationRun(i + 1, result)),
    MAX_STEPS,
  );
}

function times<T>(count: number, value: T): T[] {
  return Array.from({ length: count }, () => value);
}

describe("goNoGo scales to the seed count", () => {
  const adaEasy = row("Ada, easy");
  const adaHard = row("Ada, hard");
  const hardCut = row("Vera hard-cut, hard");
  const vera = row("Vera, hard");

  test("go at 4 of 5 for Ada and 0 of 5 for the hard cut; reported rows do not count", () => {
    const rows = [
      judged(adaEasy, [...times(4, viaA), gaveUp]),
      judged(adaHard, times(5, viaB)),
      judged(vera, times(5, viaA)),
      judged(hardCut, times(5, gaveUp)),
    ];
    expect(rows.map((summary) => summary.verdict)).toStrictEqual([
      "pass",
      "pass",
      undefined,
      "pass",
    ]);
    expect(goNoGo(rows, 0)).toBe("go");
  });

  test("no-go at 3 of 5 for Ada, or 1 of 5 for the hard cut", () => {
    const adaShort = judged(adaHard, [...times(3, viaA), ...times(2, gaveUp)]);
    const cutReached = judged(hardCut, [viaA, ...times(4, gaveUp)]);
    const allPass = judged(adaEasy, times(5, viaA));
    expect(adaShort.verdict).toBe("fail");
    expect(cutReached.verdict).toBe("fail");
    expect(goNoGo([allPass, adaShort], 0)).toBe("no-go");
    expect(goNoGo([allPass, cutReached], 0)).toBe("no-go");
  });

  test("an errored Ada run counts as a miss", () => {
    // Counted as misses, 3 of 5 fails; left out, 3 of 3 would pass.
    const rows = [judged(adaHard, [...times(3, viaA), crashed, crashed])];
    expect(goNoGo(rows, 0)).toBe("no-go");
  });

  test("an errored hard-cut run is not a pass", () => {
    // A crash measures nothing: five runs that never got going prove no cut held.
    const rejected = summarise(
      hardCut,
      [1, 2, 3, 4, 5].map((seed): CalibrationRun => ({ seed, error: "boom", latencyMs: [] })),
      MAX_STEPS,
    );
    expect(rejected).toMatchObject({ successes: 0, ends: { error: 5 }, verdict: "fail" });
    expect(goNoGo([rejected], 0)).toBe("no-go");
    // One crash among misses is enough.
    expect(judged(hardCut, [gaveUp, crashed]).verdict).toBe("fail");
  });

  test("ten seeds need 8 of 10", () => {
    const eight = judged(adaHard, [...times(8, viaA), ...times(2, gaveUp)]);
    const seven = judged(adaHard, [...times(7, viaA), ...times(3, gaveUp)]);
    const cut = judged(hardCut, times(10, gaveUp));
    expect(goNoGo([eight, cut], 0)).toBe("go");
    expect(goNoGo([seven, cut], 0)).toBe("no-go");
  });

  test("incomplete when any run did not start, whatever the rows read", () => {
    const passed = judged(adaEasy, times(4, viaA));
    const failed = judged(adaHard, times(2, gaveUp));
    expect([passed.verdict, failed.verdict]).toStrictEqual(["pass", "fail"]);
    expect(goNoGo([passed], 1)).toBe("incomplete");
    expect(goNoGo([passed, failed], 3)).toBe("incomplete");
  });
});

describe("the estimate", () => {
  const luna = priceOf(loadModelPrices(), "openai/gpt-6-luna");

  test("the estimate for the default set exceeds 0.01 USD on Luna", () => {
    // Five rows on seeds 1 to 5, 20 steps each.
    const estimate = estimateUsd(luna, calibrationSet().length * 5, MAX_STEPS);
    expect(estimate).toBeGreaterThan(0.01);
    // 25 runs × 20 steps × (2,000 × 0.10 + 500 × 0.50) / 1e6.
    expect(estimate).toBeCloseTo(0.225, 10);
  });
});

describe("renderTable", () => {
  test("names every row and carries the numbers the go/no-go reads", () => {
    const rows = [
      judged(row("Ada, easy"), [...times(4, viaA), gaveUp]),
      judged(row("Ada, hard"), [viaA, viaB, viaC, crashed, gaveUp]),
      judged(row("Vera, hard"), times(5, gaveUp)),
      // One success from a page no route ends on: the table shows it as "?", after the routes.
      judged(row("Kai, hard"), [viaB, successVia("/settings", 2), ...times(3, gaveUp)]),
      judged(row("Vera hard-cut, hard"), times(5, gaveUp)),
    ];
    const table = renderTable(rows, {
      backendId: "llm",
      model: "openai/gpt-6-luna",
      effort: "high",
      concurrency: 5,
      seeds: [1, 2, 3, 4, 5],
      maxSteps: MAX_STEPS,
    });
    const lines = table.split("\n");
    for (const summary of rows) {
      const line = lines.find((candidate) => candidate.startsWith(summary.label));
      expect(line, summary.label).toBeDefined();
      expect(line).toContain(`${summary.successes}/${summary.runs}`);
    }
    // Ada misses the hard goal at 3 of 5, one of them a crash.
    expect(lines.find((line) => line.startsWith("Ada, hard"))).toMatch(/A:1 B:1 C:1 .*\bfail$/);
    expect(lines.find((line) => line.startsWith("Kai, hard"))).toMatch(/ B:1 \?:1 /);
    expect(table).toContain("openai/gpt-6-luna");
    expect(table).toContain("llm");
    expect(table).toContain("1-5");
    expect(lines.find((line) => line.startsWith("Ada, easy"))).toMatch(/\bpass$/);
    expect(lines.find((line) => line.startsWith("Vera, hard"))).toMatch(/\breported$/);
  });

  test("a judged row left unjudged reads not judged, a reported one reported; one seed is n", () => {
    const { verdict, ...unjudged } = judged(row("Ada, hard"), [viaA]);
    const table = renderTable([unjudged, judged(row("Vera, hard"), [viaA])], {
      backendId: "llm",
      model: "openai/gpt-6-luna",
      effort: "high",
      concurrency: 5,
      seeds: [7],
      maxSteps: MAX_STEPS,
    });
    const lines = table.split("\n");
    expect(lines.find((line) => line.startsWith("Ada, hard"))).toMatch(/\bnot judged$/);
    expect(lines.find((line) => line.startsWith("Vera, hard"))).toMatch(/\breported$/);
    expect(lines).toContain("seeds        7");
  });

  test("a Jev header reads backend jev and effort n/a; an LLM one with no effort, default", () => {
    const rows = [judged(row("Ada, easy"), [viaA])];
    const header = {
      model: "typesafe/jev-1.13",
      effort: undefined,
      concurrency: 5,
      seeds: [1],
      maxSteps: MAX_STEPS,
    };
    // Jev takes no effort, so "default" would read as the endpoint's own.
    const jev = renderTable(rows, { ...header, backendId: "jev" }).split("\n");
    expect(jev).toContain("backend      jev");
    expect(jev).toContain("effort       n/a");
    const llm = renderTable(rows, { ...header, backendId: "llm" }).split("\n");
    expect(llm).toContain("backend      llm");
    expect(llm).toContain("effort       default");
  });
});
