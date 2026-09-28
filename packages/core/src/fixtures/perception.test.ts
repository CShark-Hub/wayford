/**
 * The perception decisions the fixtures store, checked against the arithmetic
 * in `docs/RULES.md`, "Thresholds, bands and the roll" (issue #77).
 *
 * Fixtures are the shared vocabulary (`docs/KICKOFF.md`): `s1-01`, `s2-03` and
 * `s3-01` build against them, so a stored state the rules would not give
 * teaches the rules wrong. The oracle below is that section written out once,
 * not `perceive` (`s1-01`): the fixtures and the filter are each checked
 * against RULES, never against each other.
 */
import { describe, expect, test } from "vitest";
import { FullObservation, type ObservedElement, type PerceptionDecision } from "../observation.js";
import type { MetricName, PerceptionState, RuleId } from "../primitives.js";
import type { Perception } from "../profile.js";
import { observationFixture, profileFixture, runEventFixtures, runResultFixture } from "./index.js";

// ---------------------------------------------------------------------------
// The oracle
// ---------------------------------------------------------------------------

/**
 * The state RULES gives a measured value against a profile threshold, or
 * `undefined` for a value in the band with no stored roll: nothing decides it.
 */
function bandState(
  value: number,
  threshold: number,
  softness: number | undefined,
  rolled: number | undefined,
): PerceptionState | undefined {
  // `>=` passes: a value exactly on the threshold is visible.
  if (value >= threshold) return "visible";
  // Softness absent or 0 is a hard cut, and a hard cut never degrades.
  if (softness === undefined || softness === 0) return "invisible";
  // A soft cut's band runs from its floor up to the threshold.
  const floor = threshold * (1 - softness);
  if (value < floor) return "invisible";
  if (rolled === undefined) return undefined;
  // In the band: degraded when rolled < position, otherwise invisible.
  const position = (value - floor) / (threshold - floor);
  return rolled < position ? "degraded" : "invisible";
}

/**
 * The metric each threshold rule compares. P2 shares the contrast threshold
 * (`ContrastThreshold` in `profile.ts`). A decision under any other rule fails
 * the check, so this map gets extended instead of the decision going unchecked.
 */
const METRIC_OF_RULE: Partial<Record<RuleId, MetricName>> = {
  P1: "contrast",
  P2: "contrast",
  P3: "fontPx",
  P4: "targetPx",
};

// ---------------------------------------------------------------------------
// Reading the fixtures
// ---------------------------------------------------------------------------

/**
 * The perception decisions stored on one element. The only function here that
 * reads how an element stores them. Each decision carries the state its rule
 * alone gives, which is what the band arithmetic checks.
 */
function perceptionDecisions(element: ObservedElement): PerceptionDecision[] {
  return element.decisions.filter((d): d is PerceptionDecision => d.stage === "perception");
}

/** Every stored decision RULES would not give, one line each. */
function stateMismatches(
  observations: readonly FullObservation[],
  perception: Perception,
): string[] {
  const found: string[] = [];
  for (const observation of observations) {
    for (const element of observation.elements) {
      for (const d of perceptionDecisions(element)) {
        const at = `step ${observation.stepIndex} ${element.key} ${d.rule}`;
        const cut = perception[d.metric];
        if (METRIC_OF_RULE[d.rule] !== d.metric) {
          found.push(`${at}: ${d.rule} does not compare ${d.metric}`);
        } else if (cut === undefined) {
          found.push(`${at}: the profile sets no ${d.metric} threshold`);
        } else if (cut.threshold !== d.threshold) {
          found.push(`${at}: decided against ${d.threshold}, the profile's is ${cut.threshold}`);
        } else {
          const band = `${d.value} against ${d.threshold}, softness ${cut.softness ?? 0}`;
          const expected = bandState(d.value, d.threshold, cut.softness, d.rolled);
          if (expected === undefined) {
            found.push(`${at}: ${band}: in the band with no stored roll`);
          } else if (expected !== d.state) {
            found.push(
              `${at}: ${band}, rolled ${d.rolled ?? "none"}: RULES gives ${expected}, stored ${d.state}`,
            );
          }
        }
      }
    }
  }
  return found;
}

/**
 * Every element key stored with more than one roll across these observations,
 * one line each. The roll is one number per element per run, from
 * `hash(run seed, element key)`, so elements that share a key share it too.
 */
function splitRolls(observations: readonly FullObservation[]): string[] {
  const seen = new Map<string, { rolled: number; step: number }[]>();
  for (const observation of observations) {
    for (const element of observation.elements) {
      for (const d of perceptionDecisions(element)) {
        if (d.rolled === undefined) continue;
        const rolls = seen.get(element.key) ?? [];
        rolls.push({ rolled: d.rolled, step: observation.stepIndex });
        seen.set(element.key, rolls);
      }
    }
  }
  const split = [...seen].filter(([, rolls]) => new Set(rolls.map((r) => r.rolled)).size > 1);
  return split.map(([key, rolls]) => {
    const each = rolls.map((r) => `${r.rolled} at step ${r.step}`);
    return `${key}: ${each.join(", ")}`;
  });
}

const started = runEventFixtures[0];
if (started?.type !== "runStarted") throw new Error("the fixture stream must open with runStarted");

/** Each fixture that stores perception decisions, with the perception block behind them. */
const FIXTURES = [
  {
    name: "observation.json",
    observations: [observationFixture],
    // The fixture names no profile and states no softness. Its decisions use
    // Vera's thresholds, a 3:1 contrast cut with a band under it and a 16 px hard
    // font cut, so her perception block stands in for its illustrative profile.
    // Any contrast softness above 10/21 (about 0.4762) gives the same states; hers is 0.5.
    // Nothing else in a profile enters a perception decision.
    perception: profileFixture("prof_vera").perception,
  },
  {
    name: "run-events.json",
    observations: runEventFixtures.flatMap((event) =>
      event.type === "stepObserved" ? [event.observation] : [],
    ),
    perception: profileFixture(started.profileId).perception,
  },
  {
    name: "run-result.json",
    observations: runResultFixture.steps.map((step) => step.fullObservation),
    perception: profileFixture(runResultFixture.profileId).perception,
  },
];

describe("perception decisions in the fixtures", () => {
  test.each(FIXTURES)(
    "$name stores the state docs/RULES.md gives each one",
    ({ observations, perception }) => {
      const decisions = observations.flatMap((o) => o.elements.flatMap(perceptionDecisions));
      expect(decisions.length).toBeGreaterThan(0);
      expect(stateMismatches(observations, perception)).toEqual([]);
    },
  );

  test.each(FIXTURES)("$name keeps one roll per element", ({ observations }) => {
    expect(splitRolls(observations)).toEqual([]);
  });

  test("the roll issue #77 found at step 2, 0.44, fails both checks", () => {
    const observed = (stepIndex: number): FullObservation => {
      const step = runResultFixture.steps.find((s) => s.stepIndex === stepIndex);
      if (!step) throw new Error(`the fixture run has no step ${stepIndex}`);
      return step.fullObservation;
    };
    // Every roll in step 2's observation set back to 0.44, whichever shape holds
    // it. The observation only, never the whole step: the behaviour dice that
    // issue #15 puts on a step store a `rolled` of their own.
    const reverted = FullObservation.parse(
      JSON.parse(JSON.stringify(observed(2)), (key, value) => (key === "rolled" ? 0.44 : value)),
    );
    const perception = profileFixture(runResultFixture.profileId).perception;
    expect(stateMismatches([reverted], perception)).toEqual([
      "step 2 main//link:Archive P1: 2.1 against 3, softness 0.5, rolled 0.44: RULES gives invisible, stored degraded",
    ]);
    expect(splitRolls([observed(1), reverted])).toEqual([
      "main//link:Archive: 0.37 at step 1, 0.44 at step 2",
    ]);
  });
});

describe("the band arithmetic of docs/RULES.md", () => {
  type Row = [
    claim: string,
    value: number,
    threshold: number,
    softness: number | undefined,
    rolled: number | undefined,
    state: PerceptionState | undefined,
  ];
  const ROWS: Row[] = [
    ["a value on the threshold is visible", 3, 3, 0.5, undefined, "visible"],
    ["a hard cut never degrades", 15, 16, undefined, 0, "invisible"],
    ["softness 0 is a hard cut", 2.9, 3, 0, 0, "invisible"],
    ["below the floor is invisible, no roll needed", 1.49, 3, 0.5, undefined, "invisible"],
    ["on the floor the position is 0, so no roll degrades", 1.5, 3, 0.5, 0, "invisible"],
    // Softness 0.25, where 1 − softness and softness differ: the floor is 3, not 1.
    ["the floor is threshold × (1 − softness)", 2.5, 4, 0.25, 0, "invisible"],
    // Exactly representable: floor 2, position 0.5, so the comparison is exact.
    ["a roll below the position degrades", 3, 4, 0.5, 0.49, "degraded"],
    ["a roll equal to the position does not", 3, 4, 0.5, 0.5, "invisible"],
    ["the worked example, position 0.337, degrades at 0.33", 2.006, 3, 0.5, 0.33, "degraded"],
    ["the worked example, position 0.337, is missed at 0.34", 2.006, 3, 0.5, 0.34, "invisible"],
    ["in the band, no stored roll decides nothing", 2.1, 3, 0.5, undefined, undefined],
  ];
  test.each(ROWS)("%s", (_claim, value, threshold, softness, rolled, state) => {
    expect(bandState(value, threshold, softness, rolled)).toBe(state);
  });
});
