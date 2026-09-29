/**
 * The perception filter's entry: the one place a page measurement becomes an observation. The
 * Actor, the preview and the sweep all call `perceive`, so what the model read at a step, what the
 * preview shows and what the sweep counts come from the same code (`docs/PLAN.md`, F2 AC3).
 *
 * Zero LLM, no clock, no `Math.random`. Every number is a `hash` of the run seed and the element
 * key, so the same measurement, profile and run seed give the same observation, byte for byte.
 *
 * Browser-safe: this module and everything it reaches import `@wayford/core` and nothing else,
 * because the web preview (`s3-01`) runs it in the browser. `tsconfig.perceive.json` checks it
 * with no Node and no DOM types.
 *
 * Rules in scope (`docs/RULES.md`): V2 outside the viewport, P1 contrast, P3 font size, P4 target
 * size. The rest of the pipeline is not here yet, and nothing stands in for it.
 */
import {
  type ElementDecision,
  type FullObservation,
  hash,
  type MeasuredElement,
  type ObservedElement,
  type PageMeasurement,
  type PerceptionDecision,
  type Profile,
  Seed,
  type Viewport,
  type ViewportDecision,
  worstState,
} from "@wayford/core";
import { judgeCut } from "./band.js";
import { maskName } from "./mask.js";

/**
 * The perception rules in scope, in rule id order, which is the order their decisions are listed
 * in. Each compares one metric. P4 is for controls only (`docs/RULES.md`, "What is measured").
 */
const PERCEPTION_RULES = [
  { rule: "P1", metric: "contrast", controlsOnly: false },
  { rule: "P3", metric: "fontPx", controlsOnly: false },
  { rule: "P4", metric: "targetPx", controlsOnly: true },
] as const;

/**
 * Decide every measured element against the profile's thresholds, in measurement order.
 *
 * The run seed decides; the profile seed is never read (`docs/PLAN.md`, A20). The parameter type
 * says so: only `perception` is taken, and a full `Profile` still fits.
 *
 * Per element:
 * - V2 first. The box is in viewport coordinates and the viewport is `[0, width) × [0, height)`.
 *   A box that starts at or past the viewport's width is right of it, and one that starts left of
 *   0 and ends at or left of 0 is left of it. The same edges on the vertical make below and
 *   above. A box that overlaps the viewport at all is inside, and so is a zero-width or
 *   zero-height box at 0. One side per element, and left and right are checked first: the Actor
 *   scrolls only up and down, so a box off a corner is never counted as more below (#116).
 * - Then P1, P3 and P4, on every element, V2-cut ones too, because "every rule an element fails
 *   is recorded". A rule applies when the profile sets its threshold and the element has its
 *   metric. They also decide the count: an element below the viewport is counted in
 *   `belowFoldCount` only when none of them is `invisible` (#118).
 * - One roll per element, `hash(run seed, key)`, drawn at most once and only when a soft rule
 *   fails. Every soft decision on the element stores that same roll.
 * - Decisions are pushed V2, P1, P3, P4, which is pipeline order, then rule id. The state is the
 *   worst of them.
 * - A shown element gets the next ref, so refs run `e1..eN` over shown elements only. A degraded
 *   one carries its masked name.
 *
 * `stepIndex` is 0 because `perceive` does not know the step. The Actor loop sets it on the
 * result, `{ ...full, stepIndex }`, and `runResultFromEvents` rejects an observation whose
 * `stepIndex` differs from its step's. `hiddenCount` is 0 until the attention rules land
 * (`s1-03`).
 *
 * Neither input nor output is parsed. Like `toActorObservation`, this stays pure and fast; the
 * tests parse the output. `bbox`, `metrics` and `viewport` are copies, so a caller cannot change
 * the measurement through the result.
 */
export function perceive(
  measurement: PageMeasurement,
  profile: Pick<Profile, "perception">,
  runSeed: Seed,
): FullObservation {
  // A run seed outside `Seed` is a bug. `hash` would throw it only once some element needs a roll,
  // so Ada would quietly get an observation; reject it here whatever the profile.
  if (!Seed.safeParse(runSeed).success) {
    throw new RangeError(`a run seed is an integer from 0 to 4294967295, got ${runSeed}`);
  }
  const elements: ObservedElement[] = [];
  let shown = 0;
  let belowFoldCount = 0;
  for (const element of measurement.elements) {
    const decisions: ElementDecision[] = [];
    const offscreen = viewportDecision(element, measurement.viewport);
    if (offscreen !== undefined) decisions.push(offscreen);
    const perceived = perceptionDecisions(element, profile.perception, runSeed);
    decisions.push(...perceived);
    // "N more below" is what scrolling could bring into view, not what perception removed (#118).
    if (offscreen?.side === "below" && !perceived.some((d) => d.state === "invisible")) {
      belowFoldCount += 1;
    }
    const state = worstState(decisions);
    if (state !== "invisible") shown += 1;
    elements.push({
      ...(state === "invisible" ? {} : { ref: `e${shown}` }),
      key: element.key,
      role: element.role,
      name: element.name,
      bbox: { ...element.bbox },
      metrics: { ...element.metrics },
      state,
      decisions,
      ...(state === "degraded" ? { maskedName: maskName(runSeed, element.key, element.name) } : {}),
    });
  }
  return {
    url: measurement.url,
    title: measurement.title,
    stepIndex: 0,
    viewport: { ...measurement.viewport },
    hiddenCount: 0,
    belowFoldCount,
    elements,
  };
}

/**
 * V2: the side of the viewport the element lies wholly beyond, or nothing when it is on screen.
 * Left and right come first, so a box off a corner is never below (#116).
 */
function viewportDecision(
  element: MeasuredElement,
  viewport: Viewport,
): ViewportDecision | undefined {
  const { x, y, width, height } = element.bbox;
  if (x >= viewport.width) return { stage: "viewport", rule: "V2", side: "right" };
  if (x < 0 && x + width <= 0) return { stage: "viewport", rule: "V2", side: "left" };
  if (y >= viewport.height) return { stage: "viewport", rule: "V2", side: "below" };
  if (y < 0 && y + height <= 0) return { stage: "viewport", rule: "V2", side: "above" };
  return undefined;
}

/** P1, P3 and P4: one decision per rule the element fails, none for a rule it passes. */
function perceptionDecisions(
  element: MeasuredElement,
  perception: Profile["perception"],
  runSeed: Seed,
): PerceptionDecision[] {
  // Once per element per run, shared by all its soft rules (`docs/RULES.md`, "The roll").
  let rolled: number | undefined;
  const roll = () => {
    if (rolled === undefined) rolled = hash(runSeed, element.key);
    return rolled;
  };
  const decisions: PerceptionDecision[] = [];
  for (const { rule, metric, controlsOnly } of PERCEPTION_RULES) {
    const cut = perception[metric];
    const value = element.metrics[metric];
    if (cut === undefined || value === undefined) continue;
    if (controlsOnly && element.kind !== "control") continue;
    const outcome = judgeCut(value, cut, roll);
    if (outcome === undefined) continue;
    // Keys in schema order, so the evidence for a seed is byte-stable. A hard cut has no roll.
    const failed = { stage: "perception" as const, rule, metric, value, threshold: cut.threshold };
    decisions.push(
      outcome.rolled === undefined
        ? { ...failed, state: outcome.state }
        : { ...failed, rolled: outcome.rolled, state: outcome.state },
    );
  }
  return decisions;
}
