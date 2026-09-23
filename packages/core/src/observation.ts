/**
 * The boundary between the perception filter and the Actor.
 *
 * Two shapes, on purpose. `FullObservation` is the evidence record: every
 * element the filter looked at, with the metric it measured, the rule that
 * decided and the state it landed in. `Observation` is what the Actor gets:
 * only elements it may see, with nothing on them that says what was measured,
 * what was removed or what a masked name really said.
 *
 * `toActorObservation` is the only way from one to the other. It is a pure
 * projection, so the seed test (same profile, same seed, same text) compares
 * `renderObservationForModel(toActorObservation(full))` and nothing else.
 *
 * Nothing here computes a metric or applies a threshold. That is `filter`.
 */
import { z } from "zod";
import { ElementRef } from "./action.js";
import {
  Bbox,
  ContrastRatio,
  HttpUrl,
  MetricName,
  PerceptionState,
  Probability,
  RuleId,
  StepIndex,
  Viewport,
} from "./primitives.js";

// ---------------------------------------------------------------------------
// Key
// ---------------------------------------------------------------------------

/** An ancestor with a landmark role, and its accessible name when it has one. */
export const Landmark = z.object({ role: z.string().min(1), name: z.string().optional() }).strict();
export type Landmark = z.infer<typeof Landmark>;

/**
 * Stable structural key, `landmark/landmark//role:name`.
 *
 * Built from the element's role, its accessible name and the chain of named
 * landmark ancestors from the accessibility tree, in that order and nothing
 * else. No DOM index, no sibling position, no CSS path: a re-render that moves
 * the element or wraps it in a `div` leaves the key unchanged, so
 * `hash(seed, key)` gives the same perception decision every step of a run.
 *
 * Two identical controls under the same landmark share a key. That is the
 * intended reading: the same button gets the same decision.
 */
export function elementKey(input: {
  role: string;
  name: string;
  path: readonly Landmark[];
}): string {
  const path = input.path.map((l) => (l.name === undefined ? l.role : `${l.role}:${l.name}`));
  return `${path.join("/")}//${input.role}:${input.name}`;
}

// ---------------------------------------------------------------------------
// Evidence side
// ---------------------------------------------------------------------------

/**
 * What the filter measured. Keys are `MetricName`, so a profile threshold and
 * the value it was compared against share a name. Each is optional because not
 * every element has every metric: an icon has no font size.
 */
export const Metrics = z
  .object({
    contrast: ContrastRatio.optional(),
    fontPx: z.number().positive().optional(),
    targetPx: z.number().nonnegative().optional(),
  })
  .strict();
export type Metrics = z.infer<typeof Metrics>;

/**
 * Why an element landed in its state: the rule, the metric, the measured value,
 * the profile threshold, and the rolled value when the threshold had a softness
 * band (`docs/RULES.md`, stages 2 and 3). The roll is stored so a reviewer can
 * see why element X was degraded in run 7 and not in run 8.
 */
export const PerceptionDecision = z
  .object({
    rule: RuleId,
    metric: MetricName,
    value: z.number(),
    threshold: z.number(),
    rolled: Probability.optional(),
  })
  .strict();
export type PerceptionDecision = z.infer<typeof PerceptionDecision>;

/**
 * One element as evidence. Invariants, enforced below:
 * - `visible` or `degraded` carries a `ref`; `invisible` carries none, so the
 *   Actor-facing refs stay contiguous and a gap cannot reveal a removal;
 * - anything but `visible` says which rule decided;
 * - `degraded` says what the Actor read instead (`maskedName`).
 */
export const ObservedElement = z
  .object({
    ref: ElementRef.optional(),
    key: z.string().min(1),
    role: z.string().min(1),
    name: z.string(),
    bbox: Bbox,
    metrics: Metrics,
    state: PerceptionState,
    decision: PerceptionDecision.optional(),
    maskedName: z.string().optional(),
  })
  .strict()
  .superRefine((element, ctx) => {
    if (element.state === "invisible" && element.ref !== undefined) {
      ctx.addIssue({ code: "custom", path: ["ref"], message: "an invisible element has no ref" });
    }
    if (element.state !== "invisible" && element.ref === undefined) {
      ctx.addIssue({ code: "custom", path: ["ref"], message: "a shown element needs a ref" });
    }
    if (element.state !== "visible" && element.decision === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["decision"],
        message: `a ${element.state} element must say which rule decided`,
      });
    }
    if (element.state === "degraded" && element.maskedName === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["maskedName"],
        message: "a degraded element must say what the Actor read instead",
      });
    }
    if (element.state !== "degraded" && element.maskedName !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["maskedName"],
        message: "only a degraded element carries a masked name",
      });
    }
  });
export type ObservedElement = z.infer<typeof ObservedElement>;

/**
 * Header shared by both shapes. `belowFoldCount` is rule V2: elements outside
 * the viewport. `hiddenCount` is rule A1: elements the attention cap cut. What
 * perception removed (P1 to P4) is counted nowhere the Actor can see: a person
 * does not know how many things they failed to see.
 */
const header = {
  url: HttpUrl,
  title: z.string(),
  stepIndex: StepIndex,
  viewport: Viewport,
  hiddenCount: z.number().int().nonnegative(),
  belowFoldCount: z.number().int().nonnegative(),
  /** Off by default (`docs/PLAN.md`, A16). A path, never inline bytes. */
  screenshotPath: z.string().min(1).optional(),
};

/**
 * Everything the filter saw at one step. Stored per step as evidence.
 *
 * The shown elements (`visible` or `degraded`) are numbered `e1..eN` in the
 * order they appear, with no gap and no repeat. Enforced here, on the array,
 * because a per-element check cannot see a gap, and a gap between `e1` and
 * `e3` tells the Actor exactly how many elements were removed between them.
 */
export const FullObservation = z
  .object({ ...header, elements: z.array(ObservedElement) })
  .strict()
  .superRefine((observation, ctx) => {
    let expected = 1;
    observation.elements.forEach((element, index) => {
      if (element.ref === undefined) return;
      if (element.ref !== `e${expected}`) {
        ctx.addIssue({
          code: "custom",
          path: ["elements", index, "ref"],
          message: `shown elements are numbered in order without gaps: expected e${expected}, got ${element.ref}`,
        });
      }
      expected += 1;
    });
  });
export type FullObservation = z.infer<typeof FullObservation>;

// ---------------------------------------------------------------------------
// Actor side
// ---------------------------------------------------------------------------

/** The two states an element can be in and still be shown. */
export const ActorPerceptionState = z.enum(["visible", "degraded"]);
export type ActorPerceptionState = z.infer<typeof ActorPerceptionState>;

/**
 * One element as the Actor sees it. No `key` (it contains the real name), no
 * `metrics`, no `decision` (they contain the threshold). For a degraded element
 * `name` is already the masked one.
 */
export const ActorElement = z
  .object({
    ref: ElementRef,
    role: z.string().min(1),
    name: z.string(),
    bbox: Bbox,
    state: ActorPerceptionState,
  })
  .strict();
export type ActorElement = z.infer<typeof ActorElement>;

/** What the Actor receives. Text-first; the screenshot is a path behind a flag. */
export const Observation = z.object({ ...header, elements: z.array(ActorElement) }).strict();
export type Observation = z.infer<typeof Observation>;

/**
 * Project the evidence record onto what the Actor may see: drop invisible
 * elements, swap in the masked name, strip every evidence field. Element order
 * is preserved; the filter has already sorted by salience (rule A1).
 */
export function toActorObservation(full: FullObservation): Observation {
  const elements: ActorElement[] = [];
  for (const element of full.elements) {
    if (element.state === "invisible" || element.ref === undefined) continue;
    elements.push({
      ref: element.ref,
      role: element.role,
      // Never fall back to the real name: an unmasked degraded element is a schema
      // violation, and an empty name is the safe failure.
      name: element.state === "degraded" ? (element.maskedName ?? "") : element.name,
      bbox: element.bbox,
      state: element.state,
    });
  }
  const observation: Observation = {
    url: full.url,
    title: full.title,
    stepIndex: full.stepIndex,
    viewport: full.viewport,
    hiddenCount: full.hiddenCount,
    belowFoldCount: full.belowFoldCount,
    elements,
  };
  if (full.screenshotPath !== undefined) observation.screenshotPath = full.screenshotPath;
  return observation;
}

/**
 * The exact text the Actor sees. One line per element, position included so
 * the model can reason about layout, nothing about why a name reads oddly
 * beyond "partly legible". The vocabulary here is what the banned-word test in
 * `observation.test.ts` guards.
 */
export function renderObservationForModel(observation: Observation): string {
  const lines = [
    `Page: ${observation.title}`,
    `URL: ${observation.url}`,
    `Viewport: ${observation.viewport.width} x ${observation.viewport.height}`,
  ];
  for (const element of observation.elements) {
    const position = `${Math.round(element.bbox.x)},${Math.round(element.bbox.y)}`;
    // "partly legible" is the only hint a degraded element gets. It says what the
    // Actor experiences, not why, which is what keeps it off the banned list.
    const legibility = element.state === "degraded" ? ", partly legible" : "";
    lines.push(
      `[${element.ref}] ${element.role} ${JSON.stringify(element.name)} at ${position}${legibility}`,
    );
  }
  if (observation.hiddenCount > 0) {
    lines.push(`${observation.hiddenCount} more elements not shown`);
  }
  if (observation.belowFoldCount > 0) {
    lines.push(`${observation.belowFoldCount} more below, scroll to see them`);
  }
  return lines.join("\n");
}
