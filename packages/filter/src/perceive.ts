/**
 * The perception filter's entry: the one place a page measurement becomes an observation. The
 * Actor, the preview and the sweep all call `perceive`, so what the model read at a step, what the
 * preview shows and what the sweep counts come from the same code (`docs/PLAN.md`, F2 AC3).
 *
 * Zero LLM, no clock, no `Math.random`. Every roll is a `hash` of the run seed and the element key,
 * and the salience order reads measured values only, so the same measurement, profile and run seed
 * give the same observation, byte for byte.
 *
 * Browser-safe: this module and everything it reaches import `@wayford/core` and nothing else,
 * because the web preview (`s3-01`) runs it in the browser. `tsconfig.perceive.json` checks it
 * with no Node and no DOM types.
 *
 * Rules in scope (`docs/RULES.md`), in pipeline order: V2 outside the viewport; P1 contrast, P3
 * font size, P4 target size; K1 and K4, a pattern the persona does not know (`knowledge.ts`); K2,
 * a jargon term the persona does not know (`vocabulary.ts`); A1, the attention cap
 * (`attention.ts`). The rest of the pipeline is not here yet, and nothing stands in for it.
 */
import {
  type Behaviour,
  type ElementDecision,
  type FullObservation,
  hash,
  type Knowledge,
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
import { salienceOrder } from "./attention.js";
import { judgeCut } from "./band.js";
import { knowledgeDecisions } from "./knowledge.js";
import { maskName } from "./mask.js";
import { vocabularyMatcher } from "./vocabulary.js";

/**
 * What `perceive` reads of a profile: the perception thresholds, the patterns the persona does not
 * know, the words it knows, and the attention cap. A full `Profile` fits. The profile seed is not
 * in it, because the run seed decides (`docs/PLAN.md`, A20), and neither are `knownPatterns`
 * (RULES stage 4: they change nothing in the filter) or the other caps and dice, which are not
 * built here.
 */
export type PerceiveProfile = Pick<Profile, "perception"> & {
  knowledge: Pick<Knowledge, "unknownPatterns" | "domainVocabulary">;
  behaviour: Pick<Behaviour, "maxElements">;
};

/** What `perceive` reads besides the page and the persona: facts about the target app. */
export interface PerceiveOptions {
  /**
   * The target app's jargon list (`@wayford/core/fixtures` `targetAppJargon`). Without it, K2
   * never fires.
   */
  jargon?: readonly string[];
}

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
 * One element after pass 1: as measured, with the decisions stages 1 to 4 gave it, and the name
 * stage 4 gave it when K1, K4 or K2 renamed it.
 */
interface Decided {
  element: MeasuredElement;
  decisions: ElementDecision[];
  renamedName: string | undefined;
}

/**
 * Decide every measured element against the profile, and list them in the order the persona
 * reads the page in.
 *
 * The run seed decides; the profile seed is never read (`docs/PLAN.md`, A20). The parameter type
 * says so: `PerceiveProfile` takes the perception thresholds, `unknownPatterns`,
 * `domainVocabulary` and `maxElements`, and a full `Profile` still fits. `options.jargon` is the
 * target app's jargon list; `perceive` reads no file, so the caller passes it in.
 *
 * Pass 1, in measurement order, stages 1 to 4 on each element:
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
 * - Then stage 4, on every element, those V2 or perception made invisible too: K1 and K4
 *   (`knowledgeDecisions`), and K2, through the matcher `vocabularyMatcher` builds once per call.
 *   There is one only when the profile sets `domainVocabulary` and `options.jargon` holds a term
 *   the persona does not know. K2 is listed between K1 and K4, in rule id order. They rename the
 *   element and leave its state alone. An element K1 or K4 renamed takes its bare role, K2 or
 *   not: the bare role holds no jargon, so it covers K2. One only K2 renamed takes K2's
 *   replacement.
 *
 * Stage 5, only when the profile sets `maxElements`: every element goes into one `salienceOrder`,
 * the removed ones too. Down that order, the elements stages 1 to 3 left shown are kept up to the
 * cap, and each later one gets A1, becomes invisible and counts in `hiddenCount`. `attention.ts`
 * says why a smaller cap shows a prefix of the same order. With no cap the order is measurement
 * order and `hiddenCount` is 0.
 *
 * Final pass, down the order:
 * - Decisions are V2, P1, P3, P4, K1, K2, K4, A1, which is pipeline order, then rule id. The
 *   state is the worst of them.
 * - The evidence lists the elements in the order, and a shown element gets the next ref, so refs
 *   run `e1..eN` down it over shown elements only.
 * - A renamed element carries the name stage 4 gave it as `renamedName`. A degraded one that
 *   was not renamed carries its masked name; a renamed one never does, and neither does one A1
 *   cut.
 *
 * `stepIndex` is 0 because `perceive` does not know the step. The Actor loop sets it on the
 * result, `{ ...full, stepIndex }`, and `runResultFromEvents` rejects an observation whose
 * `stepIndex` differs from its step's.
 *
 * Neither input nor output is parsed. Like `toActorObservation`, this stays pure and fast; the
 * tests parse the output. `bbox`, `metrics` and `viewport` are copies, so a caller cannot change
 * the measurement through the result.
 */
export function perceive(
  measurement: PageMeasurement,
  profile: PerceiveProfile,
  runSeed: Seed,
  options: PerceiveOptions = {},
): FullObservation {
  // A run seed outside `Seed` is a bug. `hash` would throw it only once some element needs a roll,
  // so Ada would quietly get an observation; reject it here whatever the profile.
  if (!Seed.safeParse(runSeed).success) {
    throw new RangeError(`a run seed is an integer from 0 to 4294967295, got ${runSeed}`);
  }
  const { viewport } = measurement;
  // K2, built once: undefined unless the persona has a vocabulary and the list a term it lacks.
  const k2 = vocabularyMatcher(options.jargon ?? [], profile.knowledge.domainVocabulary);

  // Pass 1, in measurement order: stages 1 to 4.
  let belowFoldCount = 0;
  const decided: Decided[] = measurement.elements.map((element) => {
    const decisions: ElementDecision[] = [];
    const offscreen = viewportDecision(element, viewport);
    if (offscreen !== undefined) decisions.push(offscreen);
    const perceived = perceptionDecisions(element, profile.perception, runSeed);
    decisions.push(...perceived);
    // "N more below" is what scrolling could bring into view, not what perception removed (#118).
    if (offscreen?.side === "below" && !perceived.some((d) => d.state === "invisible")) {
      belowFoldCount += 1;
    }
    const patterns = knowledgeDecisions(element, profile.knowledge.unknownPatterns);
    const hit = k2?.(element.name);
    // K1, K2, K4: rule id order, which the evidence keeps within a stage.
    decisions.push(
      ...patterns.filter((d) => d.rule === "K1"),
      ...(hit === undefined ? [] : [{ stage: "knowledge", rule: "K2", terms: hit.terms } as const]),
      ...patterns.filter((d) => d.rule === "K4"),
    );
    // K1 and K4 rename to the bare role, which covers K2; K2 alone renames to its replacement.
    const renamedName = patterns.length > 0 ? element.role : hit?.renamed;
    return { element, decisions, renamedName };
  });

  // Stage 5: the cap keeps the most salient of what stages 1 to 3 left shown.
  const cap = profile.behaviour.maxElements;
  let order = decided;
  let hiddenCount = 0;
  if (cap !== undefined) {
    order = salienceOrder(measurement.elements, viewport).flatMap((index) => decided[index] ?? []);
    let kept = 0;
    for (const { decisions } of order) {
      // What V2 or perception removed is skipped, never cut; knowledge never hides an element.
      if (worstState(decisions) === "invisible") continue;
      if (kept < cap) {
        kept += 1;
        continue;
      }
      decisions.push({ stage: "attention", rule: "A1" });
      hiddenCount += 1;
    }
  }

  // Final pass, down the order: state, ref, rename and mask.
  const elements: ObservedElement[] = [];
  let shown = 0;
  for (const { element, decisions, renamedName } of order) {
    const state = worstState(decisions);
    if (state !== "invisible") shown += 1;
    const renamed = renamedName !== undefined;
    elements.push({
      ...(state === "invisible" ? {} : { ref: `e${shown}` }),
      key: element.key,
      role: element.role,
      name: element.name,
      bbox: { ...element.bbox },
      metrics: { ...element.metrics },
      state,
      decisions,
      ...(state === "degraded" && !renamed
        ? { maskedName: maskName(runSeed, element.key, element.name) }
        : {}),
      ...(renamed ? { renamedName } : {}),
    });
  }
  return {
    url: measurement.url,
    title: measurement.title,
    stepIndex: 0,
    viewport: { ...viewport },
    hiddenCount,
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
