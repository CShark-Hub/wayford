import {
  type CompleteRunStep,
  type ElementDecision,
  type IncompleteRunStep,
  RunResult,
} from "@wayford/core";
import { decisionRecordFixture, runResultFixture } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { screenshotUrl } from "../api/runs.js";
import { decode, detailsOf, lineOf, rowsOf, sectionOf } from "../preview/rendered-markup.js";
import { fixtureJevRun, fixtureStep } from "./fixture-runs.js";
import { decisionLine, StepReplay, usd } from "./step-replay.js";

/** The five sections, in the order the replay draws them. */
const SECTIONS = ["Screenshots", "Actor's view", "Evidence", "Action", "Narration"];

/** One step of `run`, replayed on its own. */
function replay(stepIndex: number, run: RunResult = runResultFixture): string {
  const step = run.steps.find((s) => s.stepIndex === stepIndex);
  if (step === undefined) throw new Error(`${run.id} has no step ${stepIndex}`);
  return renderToStaticMarkup(<StepReplay run={run} step={step} />);
}

/** The fixture run's step with this `stepIndex`, which must be one whose action landed. */
function completeStep(stepIndex: number): CompleteRunStep {
  const step = fixtureStep(stepIndex);
  if ("wasted" in step || "incomplete" in step) {
    throw new Error(`the fixture's step ${stepIndex} is not complete`);
  }
  return step;
}

/** The text of every `<h3>`, in document order. */
function h3Texts(html: string): string[] {
  return [...html.matchAll(/<h3(?:\s[^>]*)?>(.*?)<\/h3>/gs)].map((h) => lineOf(h[1] ?? ""));
}

/** Every section but `heading`, by heading. */
function otherSections(html: string, heading: string): [string, string][] {
  return SECTIONS.filter((s) => s !== heading).map((s) => [s, sectionOf(html, s)]);
}

/** The body rows of a table whose header row is `header`, as objects keyed by that header. */
function recordsOf(html: string): Record<string, string>[] {
  const [header, ...rows] = rowsOf(html);
  if (header === undefined) return [];
  return rows.map((cells) => Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ""])));
}

/** A figure of the Screenshots section: its `<h4>` label, its image's `src` if any, its caption. */
type Figure = { label: string; src: string | undefined; caption: string };

/** Each figure of the Screenshots section, in order. */
function figuresOf(html: string): Figure[] {
  const figures = sectionOf(html, "Screenshots").matchAll(/<figure(?:\s[^>]*)?>(.*?)<\/figure>/gs);
  return [...figures].map((figure) => {
    const body = figure[1] ?? "";
    return {
      label: lineOf(body.match(/<h4(?:\s[^>]*)?>(.*?)<\/h4>/s)?.[1] ?? ""),
      src: body.match(/<img [^>]*src="([^"]*)"/)?.[1],
      caption: lineOf(body.match(/<figcaption(?:\s[^>]*)?>(.*?)<\/figcaption>/s)?.[1] ?? ""),
    };
  });
}

test("every LLM step draws the five sections in order, each labelled by its own <h3>, and no Decision", () => {
  for (const { stepIndex } of runResultFixture.steps) {
    const html = replay(stepIndex);
    expect(h3Texts(html), `step ${stepIndex}`).toEqual(SECTIONS);
    for (const heading of SECTIONS) expect(() => sectionOf(html, heading)).not.toThrow();
  }
});

describe("a step Jev chose", () => {
  const html = replay(0, fixtureJevRun);

  test("draws a Decision section between the evidence and the action", () => {
    expect(h3Texts(html)).toEqual([
      "Screenshots",
      "Actor's view",
      "Evidence",
      "Decision",
      "Action",
      "Narration",
    ]);
  });

  test("its Decision section is the panel: the options, the drawn one, the model's confidence", () => {
    const decision = sectionOf(html, "Decision");
    expect(rowsOf(decision)).toHaveLength(1 + decisionRecordFixture.options.length);
    expect(lineOf(decision)).toContain("drawn: the roll lands here");
    expect(detailsOf(decision).Confidence).toContain("the model's");
  });
});

describe("narration is interpretation, so it sits under Narration and nowhere else", () => {
  test("a complete step: step 0's narration", () => {
    const html = replay(0);
    const { narration } = fixtureStep(0);
    const section = lineOf(sectionOf(html, "Narration"));
    expect(section).toContain(narration);
    expect(section).toContain("interpretation, not measurement");
    for (const [heading, other] of otherSections(html, "Narration")) {
      expect(lineOf(other), heading).not.toContain(narration);
    }
  });

  test("a wasted step: step 3's refused answers, each labelled by the ref it was not shown", () => {
    const html = replay(3);
    const step = fixtureStep(3);
    if (!("wasted" in step)) throw new Error("the fixture's step 3 is wasted");
    const narrations = step.rejected.map((answer) => answer.narration);
    expect(narrations).toHaveLength(2);

    const section = lineOf(sectionOf(html, "Narration"));
    expect(section).toContain(`Answer 1, not shown: click e3 ${narrations[0]}`);
    expect(section).toContain(`Answer 2, not shown: click e5 ${narrations[1]}`);
    for (const [heading, other] of otherSections(html, "Narration")) {
      for (const narration of narrations) expect(lineOf(other), heading).not.toContain(narration);
    }
  });
});

test("a wasted step's Action lists the refused answers as refs the Actor was not shown", () => {
  const action = sectionOf(replay(3), "Action");
  expect(action).toMatch(/<h4[^>]*>Refs the Actor was not shown<\/h4>/);
  const items = [...action.matchAll(/<li(?:\s[^>]*)?>(.*?)<\/li>/gs)].map((li) =>
    lineOf(li[1] ?? ""),
  );
  expect(items).toEqual(["click e3", "click e5"]);
  expect(lineOf(action)).not.toContain("Proposed");
});

test("step 2 shows the proposed click, the performed doubleClick and the B1 roll that fired", () => {
  const action = sectionOf(replay(2), "Action");
  expect(detailsOf(action)).toEqual({
    Proposed: "click e2",
    Performed: "doubleClick e2",
    Cost: "$0.0037, 1340 tokens in, 220 out",
  });
  expect(recordsOf(action)).toEqual([{ Rule: "B1", p: "0.8", Rolled: "0.62", Fired: "fired" }]);
});

test("a billed cost never reads as $0.0000", () => {
  const dollars = [0.0201, 0.0037, 0.000244, 0.000019992, 0].map((value) =>
    usd({ tokensIn: 0, tokensOut: 0, usd: value }),
  );
  expect(dollars).toEqual(["$0.0201", "$0.0037", "$0.00024", "$0.000020", "$0.0000"]);
});

test("a roll that did not fire reads so, and a step with no roll says none was rolled", () => {
  expect(recordsOf(sectionOf(replay(0), "Action"))).toEqual([
    { Rule: "B1", p: "0.8", Rolled: "0.91", Fired: "not fired" },
  ]);
  const scroll = sectionOf(replay(1), "Action");
  expect(rowsOf(scroll)).toEqual([]);
  expect(lineOf(scroll)).toContain("No dice rolled");
});

describe("step 1: the evidence has the real name, the Actor's view the masked one", () => {
  const html = replay(1);
  const evidence = sectionOf(html, "Evidence");
  const rows = recordsOf(evidence);
  const byName = (name: string) => {
    const row = rows.find((r) => r.Name === name);
    if (row === undefined) throw new Error(`no evidence row names ${name}`);
    return row;
  };

  test("Archive: degraded, read as Ar▒▒ive, by P1 and its roll", () => {
    expect(byName("Archive")).toEqual({
      Ref: "e4",
      Role: "link",
      Name: "Archive",
      State: "degraded",
      "Actor read": "Ar▒▒ive",
      Metrics: "contrast 2.1, fontPx 16, targetPx 36",
      Decisions: "P1 contrast 2.1 < 3, rolled 0.37: degraded",
    });
  });

  test("every element is a row, in stored order, removed ones not shown to the Actor", () => {
    expect(rows.map((r) => r.Name)).toEqual([
      "Home",
      "Deliveries",
      "Settings",
      "Sort by date",
      "Archive",
      "Privacy",
      "Terms",
    ]);
    expect(byName("Sort by date")).toMatchObject({
      Ref: "none",
      State: "invisible",
      "Actor read": "not shown",
      Decisions: "P3 fontPx 11 < 16: invisible",
    });
    expect(byName("Privacy")).toMatchObject({ Ref: "none", Decisions: "V2 below" });
    expect(byName("Home")).toMatchObject({ Ref: "e1", "Actor read": "Home", Decisions: "none" });
  });

  test("the page's header: URL, title and both counts", () => {
    expect(detailsOf(evidence)).toEqual({
      URL: "http://localhost:5174/deliveries",
      Title: "Deliveries",
      "Hidden (A1, A3)": "0",
      "Below the fold (V2)": "2",
    });
  });

  test("the Actor's view reads Ar▒▒ive and never Archive", () => {
    const view = lineOf(sectionOf(html, "Actor's view"));
    expect(view).toContain("Ar▒▒ive");
    expect(view).not.toContain("Archive");
  });
});

test("the Actor's view is the stored text, byte for byte, in a <pre>, never a fresh render", () => {
  // The fold stores exactly what core renders, so only a stored text that differs from a render
  // tells the two apart.
  const run = RunResult.parse({
    ...runResultFixture,
    steps: runResultFixture.steps.map((s) => ({
      ...s,
      actorObservationText: `${s.actorObservationText}\nas stored`,
    })),
  });
  for (const step of run.steps) {
    const view = sectionOf(replay(step.stepIndex, run), "Actor's view");
    const pre = view.match(/<pre(?:\s[^>]*)?>(.*?)<\/pre>/s)?.[1];
    if (pre === undefined) throw new Error(`step ${step.stepIndex} has no <pre>`);
    expect(decode(pre), `step ${step.stepIndex}`).toBe(step.actorObservationText);
  }
});

describe("the two screenshots: the page observed, and the page after the action", () => {
  const id = runResultFixture.id;

  test("step 0 observed the start page, which no step's screenshot shows", () => {
    expect(figuresOf(replay(0))).toEqual([
      { label: "Observed", src: undefined, caption: "No screenshot of the start page" },
      { label: "After", src: screenshotUrl(id, 0), caption: "After this step's action" },
    ]);
  });

  test("step 1 observed the page step 0's action left", () => {
    expect(figuresOf(replay(1))).toEqual([
      {
        label: "Observed",
        src: screenshotUrl(id, 0),
        caption: "The page this step observed, as step 0's action left it",
      },
      { label: "After", src: screenshotUrl(id, 1), caption: "After this step's action" },
    ]);
  });

  test("wasted step 3 observed step 2's page, and no action ran after it", () => {
    expect(figuresOf(replay(3))).toEqual([
      {
        label: "Observed",
        src: screenshotUrl(id, 2),
        caption: "The page this step observed, as step 2's action left it",
      },
      { label: "After", src: undefined, caption: "No action ran" },
    ]);
  });

  test("step 4 skips the wasted step 3 and observed step 2's page too", () => {
    expect(figuresOf(replay(4))[0]?.src).toBe(screenshotUrl(id, 2));
  });

  test("a page an earlier step left with no screenshot is not called the start page", () => {
    const { screenshotPath: _, ...bare } = completeStep(2);
    const run = RunResult.parse({
      ...runResultFixture,
      steps: runResultFixture.steps.map((s) => (s.stepIndex === 2 ? bare : s)),
    });
    expect(figuresOf(replay(3, run))[0]).toEqual({
      label: "Observed",
      src: undefined,
      caption: "No screenshot was kept of the page this step observed",
    });
  });
});

describe("an incomplete last step", () => {
  /**
   * The fixture run cut short in its last step, the give-up, as a run that ran out of budget is
   * stored: with the action planned but not landed, or with none planned.
   */
  function cutShort(planned: boolean): RunResult {
    const {
      urlAfter: _,
      screenshotPath: __,
      proposedAction,
      performedAction,
      dice,
      cost,
      ...base
    } = completeStep(4);
    const step: IncompleteRunStep = planned
      ? { ...base, incomplete: true, proposedAction, performedAction, dice, cost }
      : { ...base, incomplete: true };
    return RunResult.parse({
      ...runResultFixture,
      outcome: "budget_exceeded",
      steps: [...runResultFixture.steps.slice(0, -1), step],
    });
  }

  test("stopped before an action was planned: no action, no After screenshot, its narration", () => {
    const html = replay(4, cutShort(false));
    expect(lineOf(sectionOf(html, "Action"))).toContain(
      "The run stopped before an action was planned",
    );
    expect(figuresOf(html)[1]).toEqual({
      label: "After",
      src: undefined,
      caption: "The run stopped before the action landed",
    });
    expect(lineOf(sectionOf(html, "Narration"))).toContain("I give up");
  });

  test("stopped after the action was planned: the planned action, which never landed", () => {
    const action = sectionOf(replay(4, cutShort(true)), "Action");
    expect(lineOf(action)).toContain("never landed");
    expect(detailsOf(action)).toMatchObject({ Proposed: "giveUp", Planned: "giveUp" });
    expect(detailsOf(action)).not.toHaveProperty("Performed");
  });
});

test("a decision line prints the rule the data names, whatever its stage", () => {
  const lines: [ElementDecision, string][] = [
    [
      {
        stage: "perception",
        rule: "P1",
        metric: "contrast",
        value: 2.1,
        threshold: 3,
        rolled: 0.42,
        state: "degraded",
      },
      "P1 contrast 2.1 < 3, rolled 0.42: degraded",
    ],
    [
      {
        stage: "perception",
        rule: "P4",
        metric: "targetPx",
        value: 20,
        threshold: 44,
        state: "invisible",
      },
      "P4 targetPx 20 < 44: invisible",
    ],
    [{ stage: "viewport", rule: "V2", side: "below" }, "V2 below"],
    [{ stage: "knowledge", rule: "K1", pattern: "hamburger" }, "K1 hamburger"],
    [{ stage: "knowledge", rule: "K2", terms: ["Fulfilment ledger"] }, "K2 Fulfilment ledger"],
    [{ stage: "knowledge", rule: "K2", terms: ["ledger", "SKU"] }, "K2 ledger, SKU"],
    [{ stage: "knowledge", rule: "K4" }, "K4"],
    [{ stage: "attention", rule: "A1" }, "A1"],
    [{ stage: "attention", rule: "A3" }, "A3"],
  ];
  for (const [decision, line] of lines) expect(decisionLine(decision)).toBe(line);
});
