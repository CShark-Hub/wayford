import { readFileSync } from "node:fs";
import {
  type Action,
  type FullObservation,
  type PersonaResult,
  type Profile,
  RunResult,
  type RunStep,
  type ScoutLine,
} from "@wayford/core";
import {
  decisionRecordFixture,
  kebabElement,
  measurementFixture,
  observationFixture,
  profileFixture,
  profileFixtures,
  runResultFixture,
  taskFixture,
} from "@wayford/core/fixtures";
import { perceive } from "@wayford/filter/perceive";
import { describe, expect, test } from "vitest";
import { ANALYST_PROMPT_FILE } from "./analyst.js";
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
      at("run run_ada-1: Ada (prof_ada), seed 1, gave_up, 1 step, 1.0 s"),
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
        seeds: [{ seed: 1, runId: "run_ada-1", outcome: "success", openRoutes: null }],
      },
    ];
    const line = caseOf([run], { personas })
      .split("\n")
      .find((l) => l.startsWith("Ada (prof_ada)"));
    expect(line).toContain("route open: —");
    expect(line).toContain("median time to success 4.0 s");
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

describe("analystCase: the runs", () => {
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
    const header = (text: string, id: string) =>
      text.split("\n").find((l) => l.startsWith(`run ${id}:`));
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
