import {
  decisionState,
  type ElementDecision,
  Finding,
  type FullObservation,
  type ObservedElement,
  type Profile,
  type RunResult,
  type ScoutLine,
  UnevidencedClosure,
} from "@wayford/core";
import { profileFixture } from "@wayford/core/fixtures";
import type { RouteClosed } from "@wayford/filter/routes";
import { describe, expect, test } from "vitest";
import { closureFindings, fallbackRecommendation, provenanceOf } from "./analyst-closures.js";
import { archiveLink, deliveries, firstSeed, storedRun } from "./test-app.js";

const ada = profileFixture("prof_ada");
const vera = profileFixture("prof_vera");

const REACHED: ScoutLine = {
  status: "reached",
  steps: 2,
  modelId: "openai/gpt-6-luna",
  recordedAt: "2026-10-03T12:00:00.000Z",
};
const NOT_REACHED: ScoutLine = {
  status: "notReached",
  attempts: 3,
  modelId: "openai/gpt-6-luna",
  recordedAt: "2026-10-03T12:00:00.000Z",
};
const SCOUT_SENTENCE =
  "Scout, with full vision, did not reach the goal either: this may be the feature, not the persona.";

/** Whether P1 cuts the archive link on Vera's `/deliveries` at `seed`. */
const cutByP1 = (seed: number) => {
  const link = archiveLink(deliveries(seed));
  return link.state === "invisible" && link.decisions.some((d) => d.rule === "P1");
};

// Read off the filter, never guessed: the first two seeds where P1 cuts the link and the first
// where it reaches Vera degraded. RULES: degraded in about one seed in three, cut in the rest.
const cutSeed = firstSeed(cutByP1);
const secondCutSeed = firstSeed((seed) => seed > cutSeed && cutByP1(seed));
const degradedSeed = firstSeed((seed) => archiveLink(deliveries(seed)).state === "degraded");

/** The same observation, as if taken on another page of the app. */
const elsewhere = (observation: FullObservation, path: string): FullObservation => ({
  ...observation,
  url: `http://localhost:5174${path}`,
});

/** Route A closing at the archive link in `seed`, as `routeClosings` gives it. */
function closingAt(seed: number, decisions?: ElementDecision[]): RouteClosed {
  return {
    seed,
    routeId: "A",
    page: "/deliveries",
    role: "link",
    name: "Order archive",
    decisions:
      decisions ??
      archiveLink(deliveries(seed)).decisions.filter((d) => decisionState(d) === "invisible"),
  };
}

/** Shown elements numbered `e1..eN` again, in order, as `FullObservation` requires. */
function renumbered(elements: ObservedElement[]): ObservedElement[] {
  let shown = 0;
  return elements.map((element) => {
    const { ref: _, ...rest } = element;
    if (element.state === "invisible") return rest;
    shown += 1;
    return { ...rest, ref: `e${shown}` };
  });
}

/** The observation with the archive link also cut by the attention cap (A1), counted as hidden. */
function cutByCap(observation: FullObservation): FullObservation {
  const elements = observation.elements.map((element): ObservedElement => {
    if (element.role !== "link" || element.name !== "Order archive") return element;
    const { maskedName: _, ...rest } = element;
    return {
      ...rest,
      state: "invisible",
      decisions: [...element.decisions, { stage: "attention", rule: "A1" }],
    };
  });
  return {
    ...observation,
    elements: renumbered(elements),
    hiddenCount: observation.hiddenCount + 1,
  };
}

/** The observation with a second "Order archive" link, shown, after the others. */
function withShownTwin(observation: FullObservation): FullObservation {
  const link = archiveLink(observation);
  const twin: ObservedElement = {
    key: `${link.key}:twin`,
    role: link.role,
    name: link.name,
    bbox: link.bbox,
    metrics: {},
    state: "visible",
    decisions: [],
  };
  return { ...observation, elements: renumbered([...observation.elements, twin]) };
}

function veraRun(seed: number, id: string, observations: FullObservation[]): RunResult {
  return storedRun({
    profile: vera,
    seed,
    runId: id,
    steps: observations.map((observation) => ({ observation })),
  });
}

function findings(input: {
  runs: RunResult[];
  closings: RouteClosed[];
  profile?: Profile;
  seeds?: number;
  scout?: ScoutLine;
}) {
  return closureFindings({
    taskId: "task_past-order",
    profile: input.profile ?? vera,
    runs: input.runs,
    closings: input.closings,
    seeds: input.seeds ?? 3,
    scout: input.scout ?? REACHED,
  });
}

describe("closureFindings: evidence", () => {
  const cut = deliveries(cutSeed);
  const cutAgain = deliveries(secondCutSeed);

  test("a step on /deliveries with the link cut is evidence; the same page under another path is not", () => {
    const runs = [
      veraRun(secondCutSeed, "run_vera-b", [cutAgain]),
      veraRun(cutSeed, "run_vera-a", [elsewhere(cut, "/settings"), cut]),
    ];
    const { drafts, unevidenced } = findings({
      runs,
      closings: [closingAt(cutSeed), closingAt(secondCutSeed)],
    });
    expect(unevidenced).toEqual([]);
    expect(drafts).toHaveLength(1);
    // By run, then step: the runs read in seed order.
    const expected = [
      { runId: "run_vera-a", stepIndex: 1 },
      { runId: "run_vera-b", stepIndex: 0 },
    ];
    if (cutSeed > secondCutSeed) expected.reverse();
    expect(drafts[0]?.finding.evidence).toEqual(expected);
  });

  test("a step with the link degraded is no evidence, and no evidence lists the closure instead", () => {
    const runs = [
      veraRun(degradedSeed, "run_vera-degraded", [deliveries(degradedSeed)]),
      veraRun(cutSeed, "run_vera-elsewhere", [elsewhere(cut, "/settings")]),
    ];
    const { drafts, unevidenced } = findings({
      runs,
      closings: [closingAt(cutSeed), closingAt(secondCutSeed)],
    });
    expect(drafts).toEqual([]);
    expect(unevidenced).toEqual([
      {
        profileId: "prof_vera",
        routeId: "A",
        page: "/deliveries",
        role: "link",
        name: "Order archive",
        rules: ["P1"],
        seeds: 2,
      },
    ]);
    expect(UnevidencedClosure.safeParse(unevidenced[0]).success).toBe(true);
  });

  test("a step whose link another rule cut is no evidence of this closure", () => {
    const attention: ElementDecision = { stage: "attention", rule: "A1" };
    const { drafts, unevidenced } = findings({
      runs: [veraRun(cutSeed, "run_vera-a", [cut])],
      closings: [closingAt(cutSeed, [attention])],
    });
    expect(drafts).toEqual([]);
    expect(unevidenced.map((c) => c.rules)).toEqual([["A1"]]);
  });

  test("a link P1 only degraded and the cap then cut is no evidence of a P1 closing", () => {
    // The step's link is invisible and carries P1, but its P1 decision is `degraded`: the cut is
    // A1's. The finding claims a P1 cut, so this step does not show it.
    const capped = cutByCap(deliveries(degradedSeed));
    const link = archiveLink(capped);
    expect(link.state).toBe("invisible");
    expect(link.decisions.map((d) => [d.rule, decisionState(d)])).toEqual([
      ["P1", "degraded"],
      ["A1", "invisible"],
    ]);
    const { drafts, unevidenced } = findings({
      runs: [veraRun(degradedSeed, "run_vera-capped", [capped])],
      closings: [closingAt(cutSeed)],
    });
    expect(drafts).toEqual([]);
    expect(unevidenced.map((c) => c.rules)).toEqual([["P1"]]);
  });

  test("a cut link beside a shown one of the same role and name is no evidence", () => {
    // The route table takes the best element of a role and name, so one shown "Order archive"
    // keeps the route open on that step, whatever happened to the other.
    const { drafts, unevidenced } = findings({
      runs: [veraRun(cutSeed, "run_vera-twin", [withShownTwin(cut)])],
      closings: [closingAt(cutSeed)],
    });
    expect(drafts).toEqual([]);
    expect(unevidenced.map((c) => c.rules)).toEqual([["P1"]]);
  });

  test("no runs at all: every closure is listed, one per route and closing step", () => {
    const entrance: RouteClosed = {
      seed: cutSeed,
      routeId: "B",
      page: "/account",
      role: "button",
      name: "More options",
      decisions: [
        {
          stage: "perception",
          rule: "P4",
          metric: "targetPx",
          value: 28,
          threshold: 32,
          state: "invisible",
        },
      ],
    };
    const { drafts, unevidenced } = findings({
      runs: [],
      closings: [closingAt(cutSeed), entrance, closingAt(secondCutSeed)],
    });
    expect(drafts).toEqual([]);
    expect(unevidenced.map((c) => [c.routeId, c.rules, c.seeds])).toEqual([
      ["A", ["P1"], 2],
      ["B", ["P4"], 1],
    ]);
  });
});

describe("closureFindings: the finding", () => {
  const cut = deliveries(cutSeed);
  const runs = [veraRun(cutSeed, "run_vera-a", [cut])];
  const closings = [closingAt(cutSeed), closingAt(secondCutSeed)];

  test("a deterministic finding about Vera, titled with the element, rules and seeds", () => {
    const [draft] = findings({ runs, closings }).drafts;
    expect(draft?.finding).toMatchObject({
      taskId: "task_past-order",
      type: "deterministic",
      personaIds: ["prof_vera"],
      title: 'The link "Order archive" on /deliveries is cut by P1 for Vera in 2 of 3 seeds',
    });
    expect(draft?.finding.id).toMatch(/^fnd_/);
    expect(draft?.closing).toEqual(closings[0]);
  });

  test("basis P1 copies Vera's contrast provenance, wcag22", () => {
    const [draft] = findings({ runs, closings }).drafts;
    expect(draft?.finding.basis).toEqual([{ rule: "P1", provenance: "wcag22" }]);
  });

  test("with a recommendation added, the draft is a valid Finding", () => {
    const [draft] = findings({ runs, closings }).drafts;
    expect(Finding.safeParse({ ...draft?.finding, recommendation: "x" }).success).toBe(true);
  });

  test("the detail names the route, the value against the threshold and the band below it", () => {
    const [draft] = findings({ runs, closings }).drafts;
    const detail = draft?.finding.detail ?? "";
    expect(detail).toContain("Route A");
    expect(detail).toContain("2.005:1");
    expect(detail).toContain("threshold of 3:1");
    expect(detail).toContain(
      "Vera's cut has a band from 1.5:1 to 3:1, inside which the seed's roll decides between degraded and cut",
    );
    // "Soft" is the report's word for a folk or llm source; P1 here is wcag22, a hard finding.
    expect(detail.toLowerCase()).not.toContain("soft");
    expect(detail).not.toContain(SCOUT_SENTENCE);
    for (const word of ["can't see", "impaired", "blind", "predict"]) {
      expect(detail.toLowerCase()).not.toContain(word);
    }
  });

  test("a value just under the threshold is truncated, never rounded up to it", () => {
    // 31.9999996 px under Vera's 32 px target cut must not read "32 px, below … 32 px".
    const target: ElementDecision = {
      stage: "perception",
      rule: "P4",
      metric: "targetPx",
      value: 31.9999996,
      threshold: 32,
      state: "invisible",
    };
    // A link the cap cut, so the step shows the closing's A1; P1 only degraded it in this seed.
    const capped = cutByCap(deliveries(degradedSeed));
    const { drafts } = findings({
      runs: [veraRun(degradedSeed, "run_vera-target", [capped])],
      closings: [closingAt(degradedSeed, [target, { stage: "attention", rule: "A1" }])],
    });
    const detail = drafts[0]?.finding.detail ?? "";
    expect(detail).toContain("target size 31.999 px, below Vera's threshold of 32 px");
  });

  test("the detail ends with Scout's sentence only when Scout did not reach the goal", () => {
    const detail = (scout: ScoutLine) =>
      findings({ runs, closings, scout }).drafts[0]?.finding.detail ?? "";
    expect(detail(NOT_REACHED).endsWith(SCOUT_SENTENCE)).toBe(true);
    expect(detail(REACHED)).not.toContain("Scout");
    expect(detail({ status: "noGroundTruth" })).not.toContain("Scout");
  });

  test("the rules are the union over the group's seeds, in pipeline order", () => {
    const below: ElementDecision = { stage: "viewport", rule: "V2", side: "below" };
    const attention: ElementDecision = { stage: "attention", rule: "A1" };
    // Seeds can close one step on different rules: here P1 in one, A1 and V2 in two others.
    const [draft] = findings({
      runs,
      closings: [closingAt(101, [attention]), closingAt(cutSeed), closingAt(102, [below])],
      seeds: 10,
    }).drafts;
    expect(draft?.finding.basis.map((b) => b.rule)).toEqual(["V2", "P1", "A1"]);
    expect(draft?.finding.title).toBe(
      'The link "Order archive" on /deliveries is cut by V2, P1, A1 for Vera in 3 of 10 seeds',
    );
    expect(draft?.finding.detail).toContain("cap of 20 elements");
    expect(draft?.finding.detail).toContain("below the viewport");
  });

  test("a rule whose threshold the profile does not set gives no basis entry", () => {
    // Ada sets no contrast threshold: her P1 has no source to copy, her V2 is folk.
    const below: ElementDecision = { stage: "viewport", rule: "V2", side: "below" };
    const [draft] = findings({
      profile: ada,
      runs,
      closings: [closingAt(cutSeed, [below, ...closingAt(cutSeed).decisions])],
    }).drafts;
    expect(draft?.finding.basis).toEqual([{ rule: "V2", provenance: "folk" }]);
  });
});

describe("provenanceOf", () => {
  test("perception rules copy the profile's threshold source", () => {
    expect(provenanceOf("P1", vera)).toBe("wcag22");
    expect(provenanceOf("P2", vera)).toBe("wcag22");
    expect(provenanceOf("P3", vera)).toBe("legge2011");
    expect(provenanceOf("P4", vera)).toBe("folk");
  });

  test("a perception rule whose threshold the profile does not set has none", () => {
    expect(provenanceOf("P1", ada)).toBeUndefined();
    expect(provenanceOf("P4", ada)).toBeUndefined();
  });

  test("caps, pattern lists, vocabulary and the viewport are folk where the profile sets them", () => {
    const kai = profileFixture("prof_kai");
    const zoya = profileFixture("prof_zoya");
    for (const rule of ["A1", "K1", "K4", "V2"] as const) {
      expect(provenanceOf(rule, vera)).toBe("folk");
    }
    expect(provenanceOf("A3", zoya)).toBe("folk");
    expect(provenanceOf("K2", kai)).toBe("folk");
  });

  test("a cap, a pattern list or a vocabulary the profile does not set gives none", () => {
    // Ada sets no cap, no unknown pattern and no vocabulary; Vera no option cap and no vocabulary.
    for (const rule of ["A1", "A3", "K1", "K2", "K4"] as const) {
      expect(provenanceOf(rule, ada)).toBeUndefined();
    }
    expect(provenanceOf("A3", vera)).toBeUndefined();
    expect(provenanceOf("K2", vera)).toBeUndefined();
    expect(provenanceOf("V2", ada)).toBe("folk");
  });

  test("any other rule has none", () => {
    expect(provenanceOf("M1", vera)).toBeUndefined();
    expect(provenanceOf("B1", vera)).toBeUndefined();
  });
});

describe("fallbackRecommendation", () => {
  test("from the closing's first decision, with the profile's threshold", () => {
    expect(fallbackRecommendation(closingAt(cutSeed))).toBe(
      "Raise its contrast to at least 3:1 against its background.",
    );
    const target: ElementDecision = {
      stage: "perception",
      rule: "P4",
      metric: "targetPx",
      value: 28,
      threshold: 32,
      state: "invisible",
    };
    expect(fallbackRecommendation(closingAt(cutSeed, [target]))).toBe(
      "Make its target at least 32 px on its smaller side.",
    );
    expect(fallbackRecommendation(closingAt(cutSeed, [{ stage: "attention", rule: "A1" }]))).toBe(
      "Make it stand out more on the page, or put fewer things beside it.",
    );
    expect(
      fallbackRecommendation(
        closingAt(cutSeed, [{ stage: "viewport", rule: "V2", side: "below" }]),
      ),
    ).toBe("Bring it into view without scrolling.");
  });
});
