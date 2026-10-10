import { readFileSync } from "node:fs";
import {
  type Action,
  type FullObservation,
  newId,
  type PersonaResult,
  type Profile,
  RunResult,
  type RunStep,
  type ScoutLine,
} from "@wayford/core";
import {
  decisionRecordFixture,
  groundTruthFixture,
  kebabElement,
  measurementFixture,
  observationFixture,
  profileFixture,
  profileFixtures,
  runResultFixture,
  targetAppJargon,
  taskFixture,
} from "@wayford/core/fixtures";
import { perceive } from "@wayford/filter/perceive";
import { describe, expect, test } from "vitest";
import { ANALYST_PROMPT_FILE } from "./analyst.js";
import { clauseOf, type Draft } from "./analyst-closures.js";
import { analystCase } from "./analyst-digest.js";
import { archiveLink, deliveries, FAKE_JEV_MODEL, firstSeed, storedRun } from "./test-app.js";

const ada = profileFixture("prof_ada");
const kai = profileFixture("prof_kai");
const vera = profileFixture("prof_vera");

const TASK = taskFixture("task_past-order");
const SCOUT_RUN = { modelId: "openai/gpt-6-luna", recordedAt: "2026-10-03T12:00:00.000Z" };
const REACHED: ScoutLine = { status: "reached", steps: 2, ...SCOUT_RUN };

/** The case over `runs` on the LLM, with nothing else to say unless `over` gives it. */
function caseOf(runs: RunResult[], over: Partial<Parameters<typeof analystCase>[0]> = {}) {
  return analystCase({
    task: TASK,
    scout: REACHED,
    personas: [],
    drafts: [],
    runs,
    backend: "llm",
    scoutPath: undefined,
    ...over,
  });
}

/** A stored run of one step per observation, each with its narration when given. */
function runOf(
  profile: Profile,
  seed: number,
  runId: string,
  steps: { observation: FullObservation; narration?: string }[],
  modelId?: string,
): RunResult {
  return storedRun({ profile, seed, runId, steps, ...(modelId === undefined ? {} : { modelId }) });
}

/** `run` with step `index` replaced by `change` of it, parsed, so the result is a valid run. */
function withStep(
  run: RunResult,
  index: number,
  change: (step: RunStep) => Record<string, unknown>,
): RunResult {
  return RunResult.parse({
    ...run,
    steps: run.steps.map((step) => (step.stepIndex === index ? change(step) : step)),
  });
}

/** `run` with step `index` planning and performing `action`, no dice rolled. */
const acting = (run: RunResult, index: number, action: Action) =>
  withStep(run, index, (step) => ({ ...step, proposedAction: action, performedAction: action }));

/** The one line of `text` for step `index` of the run under `runId`. */
function stepLine(text: string, runId: string, index: number): string {
  const block = text.slice(text.indexOf(`run ${runId}:`));
  const line = block.split("\n").find((l) => l.trimStart().startsWith(`step ${index} on `));
  if (line === undefined) throw new Error(`no line for step ${index} of ${runId}`);
  return line.trim();
}

// Read off the filter, never guessed: a seed where Vera's P1 leaves "Order archive" degraded.
const degradedSeed = firstSeed((seed) => archiveLink(deliveries(seed)).state === "degraded");

describe("analystCase: the sections", () => {
  test("goal, Scout's line, the numbers, the findings and the runs, in that order", () => {
    const run = runOf(ada, 1, "run_ada-1", [{ observation: observationFixture }]);
    const personas: PersonaResult[] = [
      {
        profileId: "prof_ada",
        runs: 1,
        errors: 0,
        successes: 0,
        routeOpenSeeds: 1,
        medianSuccessMs: null,
        seeds: [{ seed: 1, runId: "run_ada-1", outcome: "gave_up", openRoutes: ["A"] }],
      },
    ];
    const text = caseOf([run], { personas });
    const at = (part: string) => {
      const index = text.indexOf(part);
      expect(index, part).toBeGreaterThanOrEqual(0);
      return index;
    };
    const order = [
      at(TASK.goal),
      at("Scout reached the goal in 2 steps: the feature works."),
      at("Ada (prof_ada): 1 run, 0 got through, 0 errors, a route open in 1 of 1 seed"),
      at("Findings computed from the page"),
      at("run run_ada-1: Ada (prof_ada), seed 1, gave_up, 1 step, simulated time —"),
    ];
    expect(order).toEqual(order.toSorted((a, b) => a - b));
  });

  test("Scout's line: reached, not reached, no ground truth, and a hand-written one", () => {
    const run = runOf(ada, 1, "run_ada-1", [{ observation: observationFixture }]);
    expect(caseOf([run])).toContain("Scout reached the goal in 2 steps: the feature works.");
    const notReached: ScoutLine = { status: "notReached", attempts: 3, ...SCOUT_RUN };
    expect(caseOf([run], { scout: notReached })).toContain(
      "Scout did not reach the goal in 3 attempts.",
    );
    expect(caseOf([run], { scout: { status: "noGroundTruth" } })).toContain(
      "Scout: no ground truth.",
    );
    const hand: ScoutLine = { status: "reached", steps: 2, ...SCOUT_RUN, modelId: "hand" };
    expect(caseOf([run], { scout: hand })).toContain("written by hand");
  });

  test("a persona without a route table reads — for its route-open number, never 0", () => {
    const run = runOf(ada, 1, "run_ada-1", [{ observation: observationFixture }]);
    const personas: PersonaResult[] = [
      {
        profileId: "prof_ada",
        runs: 1,
        errors: 0,
        successes: 1,
        routeOpenSeeds: null,
        medianSuccessMs: 4000,
        medianSimulatedMs: 2300,
        seeds: [{ seed: 1, runId: "run_ada-1", outcome: "success", openRoutes: null }],
      },
    ];
    const line = caseOf([run], { personas })
      .split("\n")
      .find((l) => l.startsWith("Ada (prof_ada)"));
    expect(line).toContain("route open: —");
    expect(line).toContain("median simulated time to success 2.3 s");
  });

  test("the persona line gives the simulated median, never the wall-clock one", () => {
    const run = runOf(ada, 1, "run_ada-1", [{ observation: observationFixture }]);
    // As a report stored before s2-09 holds it: a wall-clock median and no simulated one.
    const older: PersonaResult = {
      profileId: "prof_ada",
      runs: 1,
      errors: 0,
      successes: 1,
      routeOpenSeeds: 1,
      medianSuccessMs: 4000,
      seeds: [{ seed: 1, runId: "run_ada-1", outcome: "success", openRoutes: ["A"] }],
    };
    const lineOf = (result: PersonaResult) =>
      caseOf([run], { personas: [result] })
        .split("\n")
        .find((l) => l.startsWith("Ada (prof_ada)"));
    const timed = lineOf({ ...older, medianSimulatedMs: 2300 });
    expect(timed).toMatch(/, median simulated time to success 2\.3 s$/);
    expect(timed).not.toContain("4.0 s");
    // A success with no simulated time: null, or absent on the older report.
    for (const untimed of [{ ...older, medianSimulatedMs: null }, older]) {
      expect(lineOf(untimed)).toMatch(/, median simulated time to success —$/);
    }
  });

  test("every run given is in the case, under its persona's label", () => {
    const runs = [
      runOf(ada, 1, "run_ada-1", [{ observation: observationFixture }]),
      runOf(kai, 2, "run_kai-2", [{ observation: observationFixture }]),
      runOf(vera, 3, "run_vera-3", [{ observation: observationFixture }]),
    ];
    const text = caseOf(runs);
    expect(text).toContain("run run_ada-1: Ada (prof_ada), seed 1");
    expect(text).toContain("run run_kai-2: Kai (prof_kai), seed 2");
    expect(text).toContain("run run_vera-3: Vera (prof_vera), seed 3");
  });
});

describe("analystCase: the findings", () => {
  const run = runOf(vera, 1, "run_vera-1", [{ observation: observationFixture }]);
  const evidence = [{ runId: "run_vera-1", stepIndex: 0 }];
  const measurement: Draft = {
    key: "d1",
    finding: {
      id: newId("finding"),
      taskId: TASK.id,
      type: "measurement",
      title:
        "axe-core: Elements must meet minimum color contrast ratio thresholds (color-contrast)",
      detail: "axe-core 4.13.0 reports color-contrast on /deliveries.",
      evidence,
      basis: [],
      personaIds: [],
      axeRuleId: "color-contrast",
    },
    fallback: "Fix what axe-core's color-contrast rule reports on /deliveries.",
  };
  const closure: Draft = {
    key: "d2",
    finding: {
      id: newId("finding"),
      taskId: TASK.id,
      type: "deterministic",
      title: 'The link "Order archive" on /deliveries is cut by P1 for Vera in 1 of 1 seed',
      detail: "Route A closes at this step.",
      evidence,
      basis: [{ rule: "P1", provenance: "wcag22" }],
      personaIds: ["prof_vera"],
    },
    fallback: "Raise its contrast to at least 3:1 against its background.",
  };

  test("a draft with no persona is an axe-core measurement on the page, and no rule reads none", () => {
    const lines = caseOf([run], { drafts: [measurement, closure] }).split("\n");
    const first = lines.indexOf("## Findings computed from the page") + 1;
    expect(lines.slice(first, first + 6)).toEqual([
      `d1, axe-core measurement on the page: ${measurement.finding.title}`,
      "  rules: none",
      `  detail: ${measurement.finding.detail}`,
      `d2, Vera: ${closure.finding.title}`,
      "  rules: P1",
      `  detail: ${closure.finding.detail}`,
    ]);
  });
});

describe("analystCase: the runs", () => {
  const header = (text: string, id: string) =>
    text.split("\n").find((l) => l.startsWith(`run ${id}:`));

  test("a run's header gives its simulated time, never the wall clock's", () => {
    const steps = Array.from({ length: 3 }, () => ({ observation: observationFixture }));
    // Three steps of one second each on the wall clock, 12.3 s on the simulated one.
    const timed = storedRun({
      profile: vera,
      seed: 1,
      runId: "run_vera-1",
      steps,
      simulatedMs: 12301,
    });
    expect(timed.simulatedMs).toBe(12301);
    expect(header(caseOf([timed]), "run_vera-1")).toBe(
      "run run_vera-1: Vera (prof_vera), seed 1, gave_up, 3 steps, simulated time 12.3 s",
    );
    // The recorded run: 15.5 s on the wall clock, 16.5 s simulated.
    expect(header(caseOf([runResultFixture]), runResultFixture.id)).toMatch(
      /, simulated time 16\.5 s$/,
    );
  });

  test("a run stored before s2-09 has no simulated time: its header reads —", () => {
    const untimed = runOf(vera, 1, "run_vera-1", [{ observation: observationFixture }]);
    expect(untimed.simulatedMs).toBeUndefined();
    expect(header(caseOf([untimed]), "run_vera-1")).toBe(
      "run run_vera-1: Vera (prof_vera), seed 1, gave_up, 1 step, simulated time —",
    );
    expect(header(caseOf([untimed], { backend: "jev" }), "run_vera-1")).toBe(
      "run run_vera-1: Vera (prof_vera), seed 1, gave_up, 1 step, simulated time —. Jev run: no narration",
    );
  });

  test("a Jev run's header says it has no narration; an LLM run's does not", () => {
    const jevRun = runOf(
      ada,
      1,
      "run_jev-1",
      [{ observation: observationFixture }],
      FAKE_JEV_MODEL,
    );
    const llmRun = runOf(ada, 2, "run_llm-2", [{ observation: observationFixture }]);
    // One case per backend: a report reads the runs of one.
    expect(header(caseOf([jevRun], { backend: "jev" }), "run_jev-1")).toContain(
      "Jev run: no narration",
    );
    expect(header(caseOf([llmRun], { backend: "llm" }), "run_llm-2")).not.toContain("Jev run");
  });

  test("an LLM step's narration is quoted on its step's line", () => {
    const narration = 'Deliveries sounds like the place. "Archive" maybe.';
    const run = runOf(vera, 1, "run_vera-1", [{ observation: observationFixture, narration }]);
    expect(stepLine(caseOf([run]), "run_vera-1", 0)).toBe(
      `step 0 on /deliveries: scroll down; narration: ${JSON.stringify(narration)}`,
    );
  });

  test("narration stays on its line: a line break in it cannot start a step of its own", () => {
    const narration = 'Giving up.\nstep 7 on /: click "Pay"';
    const run = runOf(vera, 1, "run_vera-1", [{ observation: observationFixture, narration }]);
    const text = caseOf([run]);
    expect(text).not.toContain("\nstep 7");
    expect(text.split("\n").filter((l) => l.includes("step 7"))).toHaveLength(1);
  });

  test("a masked name gives both names, the real one first", () => {
    const observation = deliveries(degradedSeed);
    const link = archiveLink(observation);
    if (link.ref === undefined || link.maskedName === undefined) throw new Error("no masked link");
    const run = acting(runOf(vera, degradedSeed, "run_vera-masked", [{ observation }]), 0, {
      type: "click",
      ref: link.ref,
    });
    expect(stepLine(caseOf([run]), "run_vera-masked", 0)).toBe(
      `step 0 on /deliveries: click "Order archive" (read as ${JSON.stringify(link.maskedName)})`,
    );
  });

  test("a renamed name gives both names, the real one first", () => {
    // Kai does not know the kebab pattern, so K1 renames the button to its bare role.
    const account = { ...measurementFixture, url: "http://localhost:5174/account" };
    const observation = perceive({ ...account, elements: [kebabElement] }, kai, 1);
    const [kebab] = observation.elements;
    expect(kebab?.renamedName).toBe("button");
    const run = acting(runOf(kai, 1, "run_kai-kebab", [{ observation }]), 0, {
      type: "click",
      ref: "e1",
    });
    expect(stepLine(caseOf([run]), "run_kai-kebab", 0)).toBe(
      'step 0 on /account: click "More options" (read as "button")',
    );
  });

  test("each action reads with the element's name; a name read as is is given once", () => {
    const steps = Array.from({ length: 6 }, () => ({ observation: observationFixture }));
    let run = runOf(ada, 1, "run_ada-actions", steps);
    const actions: Action[] = [
      { type: "click", ref: "e3" },
      { type: "type", ref: "e1", text: "past orders" },
      { type: "back" },
      { type: "wait", ms: 500 },
      { type: "scroll", direction: "up" },
      { type: "giveUp" },
    ];
    actions.forEach((action, index) => {
      run = acting(run, index, action);
    });
    const text = caseOf([run]);
    expect([0, 1, 2, 3, 4, 5].map((i) => stepLine(text, "run_ada-actions", i))).toEqual([
      'step 0 on /deliveries: click "Deliveries"',
      'step 1 on /deliveries: type "past orders" into "Home"',
      "step 2 on /deliveries: back",
      "step 3 on /deliveries: wait 500 ms",
      "step 4 on /deliveries: scroll up",
      "step 5 on /deliveries: giveUp",
    ]);
  });

  test("the recorded run: a doubleClick the dice made, a wasted step, and the narration", () => {
    const text = caseOf([runResultFixture]);
    const line = (i: number) => stepLine(text, runResultFixture.id, i);
    expect(line(0)).toMatch(/^step 0 on \/: click "Deliveries"; narration: "I want to see/);
    expect(line(2)).toMatch(
      /^step 2 on \/deliveries: doubleClick "Settings" \(planned as click "Settings", changed by B1\); narration: /,
    );
    expect(line(3)).toBe(
      "step 3 on /settings: no action: every answer named an element not on the page",
    );
    // The refused answers' own narration is not the step's.
    expect(text).not.toContain("The faint link from the last page has to be here too.");
  });

  test("an incomplete step without an action says the run stopped there", () => {
    const last = runResultFixture.steps.at(-1);
    if (last === undefined) throw new Error("the fixture has no step");
    const { stepIndex, fullObservation, actorObservationText, startedAt, endedAt, urlBefore } =
      last;
    const run = RunResult.parse({
      ...runResultFixture,
      outcome: "error",
      steps: [
        ...runResultFixture.steps.slice(0, -1),
        {
          stepIndex,
          fullObservation,
          actorObservationText,
          narration: "",
          startedAt,
          endedAt,
          urlBefore,
          incomplete: true,
        },
      ],
    });
    expect(stepLine(caseOf([run]), run.id, stepIndex)).toBe(
      `step ${stepIndex} on /settings: no action: the run stopped here`,
    );
  });

  test("a Jev step's options, probabilities and confidence never reach the case", () => {
    // The fixture's draw lands on Deliveries, `e3` of the observation fixture.
    const run = withStep(
      runOf(ada, 1, "run_jev-decided", [{ observation: observationFixture }], FAKE_JEV_MODEL),
      0,
      (step) => ({
        ...step,
        proposedAction: { type: "click", ref: "e3" },
        performedAction: { type: "click", ref: "e3" },
        decision: decisionRecordFixture,
      }),
    );
    const text = caseOf([run], { backend: "jev" });
    expect(stepLine(text, "run_jev-decided", 0)).toBe('step 0 on /deliveries: click "Deliveries"');
    for (const p of decisionRecordFixture.probabilities) {
      expect(text).not.toContain(String(p).replace(/^0/, ""));
    }
    expect(text).not.toContain(String(decisionRecordFixture.confidence).replace(/^0/, ""));
    expect(text.toLowerCase()).not.toMatch(/confidence|probabilit|option/);
    for (const { description } of decisionRecordFixture.options) {
      expect(text).not.toContain(description);
    }
  });
});

describe("analystCase: what the filter cut from a run that did not get through", () => {
  /** `/deliveries`, or `measurement`, as the filter gives it to `profile` at `seed`. */
  const perceived = (profile: Profile, seed: number, measurement = measurementFixture) =>
    perceive(measurement, profile, seed, { jargon: targetAppJargon });

  // Read off the filter, never guessed: a seed where Vera's P1 cuts "Order archive".
  const cutSeed = firstSeed((seed) => archiveLink(deliveries(seed)).state === "invisible");
  const p1 = archiveLink(deliveries(cutSeed)).decisions.find((d) => d.rule === "P1");
  if (p1 === undefined) throw new Error("P1 does not cut the archive link");
  // The same page under another path, with the link cut there too: only the page tells them apart.
  const account = perceived(vera, cutSeed, {
    ...measurementFixture,
    url: "http://localhost:5174/account",
  });

  /** Ada, through in one step: a click on "Order archive" on `/deliveries`. */
  function adaThrough(): RunResult {
    const observation = perceived(ada, 1);
    const { ref } = archiveLink(observation);
    if (ref === undefined) throw new Error("Ada does not see the archive link");
    const run = storedRun({
      profile: ada,
      seed: 1,
      runId: "run_ada-through",
      steps: [{ observation }],
      outcome: "success",
    });
    return acting(run, 0, { type: "click", ref });
  }

  /** A run of `profile` standing on `observations`, one step each, ended `outcome`. */
  function standing(
    profile: Profile,
    seed: number,
    runId: string,
    observations: FullObservation[],
    outcome: "success" | "gave_up" | "budget_exceeded" = "gave_up",
  ): RunResult {
    const steps = observations.map((observation) => ({ observation }));
    return storedRun({ profile, seed, runId, steps, outcome });
  }

  /** The lines of a run's block that are neither its header nor a step. */
  function cutLines(text: string, runId: string): string[] {
    const block = text
      .slice(text.indexOf(`run ${runId}:`))
      .split("\n")
      .slice(1);
    const end = block.findIndex((line) => !line.startsWith("  "));
    return block.slice(0, end).filter((line) => !line.startsWith("  step "));
  }

  const HEADING =
    "  cut from this agent at these steps, of what a run that got through or Scout used:";

  test("an element a run that got through clicked, cut by P1 here, gives its steps and clause", () => {
    const cut = deliveries(cutSeed);
    expect(archiveLink(account).state).toBe("invisible");
    // `/deliveries` again, with a query string a page on another site may add.
    const queried = perceived(vera, cutSeed, {
      ...measurementFixture,
      url: "http://localhost:5174/deliveries?utm_source=mail",
    });
    const run = standing(vera, cutSeed, "run_vera-cut", [cut, cut, cut, account, queried]);
    const text = caseOf([adaThrough(), run]);
    expect(cutLines(text, "run_vera-cut")).toEqual([
      HEADING,
      `    link "Order archive" on /deliveries, steps 0 to 2, 4. ${clauseOf(p1, vera)}`,
    ]);
    // The wording the closure findings use, with the measured value against the threshold.
    expect(text).toMatch(
      /steps 0 to 2, 4\. P1: contrast 2\.005:1, below Vera's threshold of 3:1\./,
    );
    // The run that got through gets no lines.
    expect(cutLines(text, "run_ada-through")).toEqual([]);
  });

  test("steps that are not consecutive are listed one by one", () => {
    const cut = deliveries(cutSeed);
    const run = standing(vera, cutSeed, "run_vera-cut", [cut, account, cut, cut]);
    expect(cutLines(caseOf([adaThrough(), run]), "run_vera-cut")[1]).toMatch(
      /^ {4}link "Order archive" on \/deliveries, steps 0, 2, 3\. P1: /,
    );
  });

  test("an attention cut reads as A1, with the persona's cap", () => {
    const observation = perceived(kai, 1);
    const a1 = archiveLink(observation).decisions.find((d) => d.rule === "A1");
    if (a1 === undefined) throw new Error("A1 does not cut the archive link for Kai");
    const run = standing(kai, 1, "run_kai-cut", [observation], "budget_exceeded");
    expect(cutLines(caseOf([adaThrough(), run]), "run_kai-cut")).toEqual([
      HEADING,
      `    link "Order archive" on /deliveries, step 0. ${clauseOf(a1, kai)}`,
    ]);
  });

  test("an element that reached the model, shown or degraded, is no cut", () => {
    const degraded = deliveries(degradedSeed);
    expect(archiveLink(degraded).state).toBe("degraded");
    const runs = [
      adaThrough(),
      standing(vera, degradedSeed, "run_vera-degraded", [degraded]),
      standing(ada, 2, "run_ada-shown", [perceived(ada, 2)]),
    ];
    const text = caseOf(runs);
    expect(cutLines(text, "run_vera-degraded")).toEqual([]);
    expect(cutLines(text, "run_ada-shown")).toEqual([]);
  });

  test("two elements with one key, one of them shown, are no cut", () => {
    const archive = measurementFixture.elements.find((e) => e.name === "Order archive");
    if (archive === undefined) throw new Error("the measurement has no archive link");
    // The same link again above it, at a contrast every threshold passes.
    const twin = {
      ...archive,
      bbox: { ...archive.bbox, y: 560 },
      metrics: { ...archive.metrics, contrast: 7 },
    };
    const page = perceived(vera, cutSeed, {
      ...measurementFixture,
      elements: [...measurementFixture.elements, twin],
    });
    const states = page.elements.filter((e) => e.key === archive.key).map((e) => e.state);
    expect(states.toSorted()).toEqual(["invisible", "visible"]);
    const run = standing(vera, cutSeed, "run_vera-twin", [page]);
    expect(cutLines(caseOf([adaThrough(), run]), "run_vera-twin")).toEqual([]);
  });

  test("an element V2 alone cut, out of the viewport, is no cut", () => {
    const archive = measurementFixture.elements.find((e) => e.name === "Order archive");
    if (archive === undefined) throw new Error("the measurement has no archive link");
    const below = { ...archive, bbox: { ...archive.bbox, y: 2000 } };
    const page = perceived(ada, 2, {
      ...measurementFixture,
      elements: measurementFixture.elements.map((e) => (e.key === archive.key ? below : e)),
    });
    expect(archiveLink(page).decisions.map((d) => d.rule)).toEqual(["V2"]);
    const run = standing(ada, 2, "run_ada-below", [page]);
    expect(cutLines(caseOf([adaThrough(), run]), "run_ada-below")).toEqual([]);
  });

  test("a persona with a route table gets no lines: its closure findings say it", () => {
    const run = standing(vera, cutSeed, "run_vera-cut", [deliveries(cutSeed)]);
    const result = (routeOpenSeeds: number | null): PersonaResult => ({
      profileId: "prof_vera",
      runs: 1,
      errors: 0,
      successes: 0,
      routeOpenSeeds,
      medianSuccessMs: null,
      medianSimulatedMs: null,
      seeds: [
        {
          seed: cutSeed,
          runId: "run_vera-cut",
          outcome: "gave_up",
          openRoutes: routeOpenSeeds === null ? null : [],
        },
      ],
    });
    const withTable = caseOf([adaThrough(), run], { personas: [result(0)] });
    expect(cutLines(withTable, "run_vera-cut")).toEqual([]);
    expect(withTable).not.toContain("cut from this agent");
    const without = caseOf([adaThrough(), run], { personas: [result(null)] });
    expect(cutLines(without, "run_vera-cut")[0]).toBe(HEADING);
  });

  test("a run that got through, or ended on an error, gets no lines", () => {
    const cut = deliveries(cutSeed);
    const through = standing(vera, cutSeed, "run_vera-through", [cut], "success");
    const failed = RunResult.parse({
      ...standing(vera, cutSeed, "run_vera-error", [cut]),
      outcome: "error",
    });
    const text = caseOf([adaThrough(), through, failed]);
    expect(cutLines(text, "run_vera-through")).toEqual([]);
    expect(cutLines(text, "run_vera-error")).toEqual([]);
  });

  test("a click by a run that did not get through makes nothing used", () => {
    // Vera clicks the archive link where it reached her degraded, and still does not get through.
    const degraded = deliveries(degradedSeed);
    const { ref } = archiveLink(degraded);
    if (ref === undefined) throw new Error("the degraded link has no ref");
    const clicked = acting(standing(vera, degradedSeed, "run_vera-clicked", [degraded]), 0, {
      type: "click",
      ref,
    });
    const cut = standing(vera, cutSeed, "run_vera-cut", [deliveries(cutSeed)]);
    expect(cutLines(caseOf([clicked, cut]), "run_vera-cut")).toEqual([]);
  });

  test("only a decision that itself cuts the element gives a clause", () => {
    const page = perceived(kai, 1);
    const a1 = archiveLink(page).decisions.find((d) => d.rule === "A1");
    if (a1 === undefined) throw new Error("A1 does not cut the archive link for Kai");
    // By hand, since no bundled profile gives both: P1 left the link degraded before A1 cut it.
    const p1Degraded = { ...p1, state: "degraded" as const, rolled: 0.9 };
    const both = {
      ...page,
      elements: page.elements.map((e) =>
        e.key === archiveLink(page).key ? { ...e, decisions: [p1Degraded, a1] } : e,
      ),
    };
    const run = standing(kai, 1, "run_kai-both", [both]);
    expect(cutLines(caseOf([adaThrough(), run]), "run_kai-both")).toEqual([
      HEADING,
      `    link "Order archive" on /deliveries, step 0. ${clauseOf(a1, kai)}`,
    ]);
  });

  test("Scout's path alone makes an element used, by its key and page", () => {
    const scoutPath = groundTruthFixture.shortest?.path.steps;
    expect(scoutPath?.map((step) => step.key)).toContain("main//link:Order archive");
    const run = standing(vera, cutSeed, "run_vera-cut", [deliveries(cutSeed)]);
    expect(cutLines(caseOf([run]), "run_vera-cut")).toEqual([]);
    expect(cutLines(caseOf([run], { scoutPath }), "run_vera-cut")).toEqual([
      HEADING,
      `    link "Order archive" on /deliveries, step 0. ${clauseOf(p1, vera)}`,
    ]);
  });
});

describe("the prompt template", () => {
  const prompt = readFileSync(ANALYST_PROMPT_FILE, "utf8");

  test("names no persona label", () => {
    for (const { label } of profileFixtures) {
      expect(prompt, label).not.toMatch(new RegExp(`\\b${label}\\b`, "i"));
    }
  });

  test("holds no trait word", () => {
    for (const word of ["impair", "disab", "blind", "vision", "sight"]) {
      expect(prompt.toLowerCase(), word).not.toContain(word);
    }
  });

  test("asks for recommendations and hypotheses, and for nothing else", () => {
    expect(prompt).toContain('"recommendations"');
    expect(prompt).toContain('"hypotheses"');
    // The answer's shape names its two keys only.
    const shape = prompt.slice(prompt.indexOf("{"));
    expect(shape).not.toMatch(/"(?:basis|provenance|personaIds|type|measurement)"/);
  });
});
