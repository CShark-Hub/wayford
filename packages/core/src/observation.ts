/**
 * The boundary between the perception filter and the Actor.
 *
 * Two shapes, on purpose. `FullObservation` is the evidence record: every
 * element the filter looked at, with the metrics it measured, every rule it
 * failed and the state it landed in. `Observation` is what the Actor gets:
 * only elements it may see, with nothing on them that says what was measured,
 * what was removed or what a masked name really said.
 *
 * `toActorObservation` is the only way from one to the other. It is a pure
 * projection, so the seed test (same profile, same run seed, same text) compares
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
  PIPELINE_STAGES,
  RULE_IDS,
  RuleId,
  StepIndex,
  UiPattern,
  Viewport,
} from "./primitives.js";

// ---------------------------------------------------------------------------
// Key
// ---------------------------------------------------------------------------

/**
 * An ARIA role as Playwright's `getByRole` names it: one lowercase word
 * (`link`, `button`, `columnheader`). Page-controlled, so it is held to a
 * token: a role cannot carry a space, a quote or a line break into the
 * Actor's text. A collector maps to these names; an exotic accessibility-tree
 * role (`RootWebArea`, `doc-toc`) fails to parse, which is intended. Any later
 * schema that carries a role (the filter's page measurement) reuses this one
 * instead of a free string.
 */
export const AriaRole = z.string().regex(/^[a-z]+$/, "a role is one lowercase ARIA role word");
export type AriaRole = z.infer<typeof AriaRole>;

/** An ancestor with a landmark role, and its accessible name when it has one. */
export const Landmark = z.object({ role: AriaRole, name: z.string().optional() }).strict();
export type Landmark = z.infer<typeof Landmark>;

/**
 * Stable structural key, `landmark/landmark//role:name`.
 *
 * Built from the element's role, its accessible name and the chain of named
 * landmark ancestors from the accessibility tree, in that order and nothing
 * else. No DOM index, no sibling position, no CSS path: a re-render that moves
 * the element or wraps it in a `div` leaves the key unchanged, so
 * `hash(run seed, key)` gives the same perception decision every step of a run.
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

/** The metric each perception rule compares (`docs/RULES.md`, stage 2). */
const RULE_METRIC = { P1: "contrast", P2: "contrast", P3: "fontPx", P4: "targetPx" } as const;

/**
 * A perception rule the element failed: the metric, the measured value, the
 * profile threshold, the rolled value when the threshold had a softness band
 * (`docs/RULES.md`, stages 2 and 3), and the state this rule alone gives. Only
 * a failing rule is recorded, so `value < threshold` (`>=` passes). Degradation
 * shares the stage: a `degraded` state here is stage 3. The roll is stored so a
 * reviewer can see why element X was degraded in run 7 and not in run 8.
 */
export const PerceptionDecision = z
  .object({
    stage: z.literal("perception"),
    rule: RuleId.extract(["P1", "P2", "P3", "P4"]),
    metric: MetricName,
    value: z.number(),
    threshold: z.number(),
    /** In `[0, 1)`, like the roll itself (`docs/RULES.md`, "The roll"). */
    rolled: z.number().min(0).lt(1).optional(),
    state: PerceptionState.exclude(["visible"]),
  })
  .strict()
  .refine((d) => d.metric === RULE_METRIC[d.rule], {
    path: ["metric"],
    message: "each perception rule compares one metric: P1 and P2 contrast, P3 fontPx, P4 targetPx",
  })
  .refine((d) => d.value < d.threshold, {
    path: ["value"],
    message: "only a failing rule is recorded: value must be below the threshold",
  })
  .refine((d) => d.state !== "degraded" || d.rolled !== undefined, {
    path: ["rolled"],
    message: "a degraded outcome comes from a soft band and stores its roll",
  });
export type PerceptionDecision = z.infer<typeof PerceptionDecision>;

/**
 * V2: wholly outside the viewport, on one side. No metric, no threshold. The
 * element is invisible. One side per element, and off a corner the horizontal
 * wins: the Actor scrolls only up and down (`Action`), so no scroll brings a
 * box left or right of the viewport into view (#116). Only `below` counts in
 * `belowFoldCount`, since the Actor is told "N more below", and only when
 * perception left the element shown (#118). `above`, `left` and `right` are
 * counted nowhere.
 */
export const ViewportDecision = z
  .object({
    stage: z.literal("viewport"),
    rule: z.literal("V2"),
    side: z.enum(["above", "below", "left", "right"]),
  })
  .strict();
export type ViewportDecision = z.infer<typeof ViewportDecision>;

/**
 * K1, K2, K4: the persona does not know the pattern (K1, K4) or a jargon term
 * in the name (K2). The name is replaced (`renamedName` on the element); the
 * state is left as perception decided. One schema for the stage, since a
 * second `knowledge` member would break the discriminated union.
 */
export const KnowledgeDecision = z
  .object({
    stage: z.literal("knowledge"),
    rule: RuleId.extract(["K1", "K2", "K4"]),
    pattern: UiPattern.optional(),
    /**
     * K2: the jargon-list terms masked in the name, as the list spells them, in order of first
     * occurrence in the name.
     */
    terms: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict()
  .refine((d) => (d.rule === "K2") === (d.terms !== undefined), {
    path: ["terms"],
    message: "K2 names the terms it masked, and only K2 carries terms",
  })
  .refine((d) => d.rule !== "K2" || d.pattern === undefined, {
    path: ["pattern"],
    message: "K2 reads a term, not a pattern, so it carries no pattern",
  });
export type KnowledgeDecision = z.infer<typeof KnowledgeDecision>;

/** A1, A3: cut by the attention or option cap. Invisible, counted in `hiddenCount`. */
export const AttentionDecision = z
  .object({ stage: z.literal("attention"), rule: RuleId.extract(["A1", "A3"]) })
  .strict();
export type AttentionDecision = z.infer<typeof AttentionDecision>;

/** One rule an element failed, discriminated by pipeline stage. */
export const ElementDecision = z.discriminatedUnion("stage", [
  ViewportDecision,
  PerceptionDecision,
  KnowledgeDecision,
  AttentionDecision,
]);
export type ElementDecision = z.infer<typeof ElementDecision>;

const STATE_RANK: Record<PerceptionState, number> = { visible: 0, degraded: 1, invisible: 2 };

/** The state one decision gives on its own. Knowledge renames and leaves the state alone. */
export function decisionState(decision: ElementDecision): PerceptionState {
  if (decision.stage === "perception") return decision.state;
  if (decision.stage === "knowledge") return "visible";
  return "invisible";
}

/**
 * Rule precedence (`docs/RULES.md`, "Several rules"): the worst state wins,
 * `invisible` over `degraded` over `visible`. No decision is `visible`.
 */
export function worstState(decisions: readonly ElementDecision[]): PerceptionState {
  let worst: PerceptionState = "visible";
  for (const decision of decisions) {
    const state = decisionState(decision);
    if (STATE_RANK[state] > STATE_RANK[worst]) worst = state;
  }
  return worst;
}

/** Sort position of a decision: pipeline stage, then rule id. */
function decisionOrder(decision: ElementDecision): number {
  return (
    PIPELINE_STAGES.indexOf(decision.stage) * RULE_IDS.length + RULE_IDS.indexOf(decision.rule)
  );
}

/**
 * One element as evidence. Invariants, enforced below:
 * - `visible` or `degraded` carries a `ref`; `invisible` carries none, so the
 *   Actor-facing refs stay contiguous and a gap cannot reveal a removal;
 * - `decisions` lists every rule the element failed, none it passed, in
 *   pipeline order then rule id, and `state` is the worst of them;
 * - every soft perception decision carries the same roll: one per element;
 * - `renamedName` is there exactly when a knowledge rule renamed the element;
 * - a degraded element that was not renamed says what the Actor read instead
 *   (`maskedName`); a renamed one reads `renamedName` and carries no mask;
 * - an attention decision only on an element viewport and perception left
 *   shown, so `hiddenCount` never counts what perception removed.
 */
export const ObservedElement = z
  .object({
    ref: ElementRef.optional(),
    key: z.string().min(1),
    role: AriaRole,
    name: z.string(),
    bbox: Bbox,
    metrics: Metrics,
    state: PerceptionState,
    decisions: z.array(ElementDecision),
    maskedName: z.string().optional(),
    /** What the Actor reads after K1, K2 or K4. Independent of `maskedName`. */
    renamedName: z.string().optional(),
  })
  .strict()
  .superRefine((element, ctx) => {
    if (element.state === "invisible" && element.ref !== undefined) {
      ctx.addIssue({ code: "custom", path: ["ref"], message: "an invisible element has no ref" });
    }
    if (element.state !== "invisible" && element.ref === undefined) {
      ctx.addIssue({ code: "custom", path: ["ref"], message: "a shown element needs a ref" });
    }
    const worst = worstState(element.decisions);
    if (element.state !== worst) {
      ctx.addIssue({
        code: "custom",
        path: ["state"],
        message: `the state is the worst of the decisions: expected ${worst}, got ${element.state}`,
      });
    }
    element.decisions.forEach((decision, index) => {
      const previous = element.decisions[index - 1];
      if (previous !== undefined && decisionOrder(previous) >= decisionOrder(decision)) {
        ctx.addIssue({
          code: "custom",
          path: ["decisions", index],
          message: "decisions are in pipeline order, then rule id, with no repeat",
        });
      }
    });
    const rolls = new Set(
      element.decisions.flatMap((d) =>
        d.stage === "perception" && d.rolled !== undefined ? [d.rolled] : [],
      ),
    );
    if (rolls.size > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["decisions"],
        message: "an element is rolled once per run: every soft decision carries the same roll",
      });
    }
    const renamed = element.decisions.some((d) => d.stage === "knowledge");
    if (renamed !== (element.renamedName !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["renamedName"],
        message: "a renamed name exists exactly when a knowledge rule renamed the element",
      });
    }
    const masked = element.state === "degraded" && !renamed;
    if (masked && element.maskedName === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["maskedName"],
        message: "a degraded element must say what the Actor read instead",
      });
    }
    if (!masked && element.maskedName !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["maskedName"],
        message: "only a degraded element that was not renamed carries a masked name",
      });
    }
    const removedEarlier = element.decisions.some(
      (d) =>
        (d.stage === "viewport" || d.stage === "perception") && decisionState(d) === "invisible",
    );
    if (removedEarlier && element.decisions.some((d) => d.stage === "attention")) {
      ctx.addIssue({
        code: "custom",
        path: ["decisions"],
        message: "attention ranks only what viewport and perception left shown",
      });
    }
  });
export type ObservedElement = z.infer<typeof ObservedElement>;

/**
 * Header shared by both shapes. `belowFoldCount` is rule V2: elements below the
 * viewport that perception (P1 to P4) left shown, which is what scrolling could
 * bring into view. `hiddenCount` is rules A1 and A3: elements the attention or
 * option cap cut. Each counted element is in `elements` as invisible with its
 * V2 or A1/A3 decision, enforced on `FullObservation`. What perception removed
 * (P1 to P4) is counted nowhere the Actor can see, below the viewport too
 * (#118): a person does not know how many things they failed to see.
 *
 * Every `bbox`, in both shapes, is a position in the viewport, in CSS px, as
 * the `PageMeasurement` gave it. No scroll offset is kept (#119): a stored box
 * places its element on the screen of its step, not on the page. The page
 * position, `bbox + scroll`, exists only in the measurement, which is not
 * stored.
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
    const count = (match: (d: ElementDecision) => boolean) =>
      observation.elements.filter((e) => e.decisions.some(match)).length;
    const hidden = count((d) => d.stage === "attention");
    if (observation.hiddenCount !== hidden) {
      ctx.addIssue({
        code: "custom",
        path: ["hiddenCount"],
        message: `hiddenCount counts the elements with an attention decision: expected ${hidden}`,
      });
    }
    // "N more below" is what scrolling could bring into view, so an element below the viewport
    // that perception made invisible keeps its V2 decision and is not counted (#118).
    const below = observation.elements.filter(
      (e) =>
        e.decisions.some((d) => d.stage === "viewport" && d.side === "below") &&
        !e.decisions.some((d) => d.stage === "perception" && d.state === "invisible"),
    ).length;
    if (observation.belowFoldCount !== below) {
      ctx.addIssue({
        code: "custom",
        path: ["belowFoldCount"],
        message: `belowFoldCount counts V2 below elements perception left shown: expected ${below}`,
      });
    }
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
 * `metrics`, no `decisions` (they contain the threshold). For a renamed element
 * `name` is already the renamed one and `state` is `visible`, otherwise for a
 * degraded element `name` is the masked one.
 */
export const ActorElement = z
  .object({
    ref: ElementRef,
    role: AriaRole,
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
 * elements, swap in the renamed or masked name, strip every evidence field. Element order
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
      // violation, and an empty name is the safe failure. A rename wins over a mask
      // because knowledge (stage 4) runs after degradation (stage 3), and a renamed
      // element reads its replacement whole, never as "partly legible".
      name:
        element.renamedName ??
        (element.state === "degraded" ? (element.maskedName ?? "") : element.name),
      bbox: element.bbox,
      state: element.renamedName === undefined ? element.state : "visible",
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
 * Page text is untrusted: a title, URL, role or name with a line break in it
 * would write its own lines into the Actor's observation. Every run of control
 * characters (C0 including TAB, DEL, C1 including NEL) and Unicode line or
 * paragraph separators becomes one space, so a page-controlled string always
 * stays on the line it was put on. Format characters (`Cf`, bidi overrides)
 * are left alone on purpose: they cannot start a new line. Clean text passes
 * through byte for byte.
 */
function oneLine(text: string): string {
  return text.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ");
}

/**
 * The exact text the Actor sees. One line per element, position included so
 * the model can reason about layout, nothing about why a name reads oddly
 * beyond "partly legible". The vocabulary here is what the banned-word test in
 * `observation.test.ts` guards.
 * Page-controlled strings pass through `oneLine`.
 */
export function renderObservationForModel(observation: Observation): string {
  const lines = [
    `Page: ${oneLine(observation.title)}`,
    `URL: ${oneLine(observation.url)}`,
    `Viewport: ${observation.viewport.width} x ${observation.viewport.height}`,
  ];
  for (const element of observation.elements) {
    const position = `${Math.round(element.bbox.x)},${Math.round(element.bbox.y)}`;
    // "partly legible" is the only hint a degraded element gets. It says what the
    // Actor experiences, not why, which is what keeps it off the banned list.
    const legibility = element.state === "degraded" ? ", partly legible" : "";
    lines.push(
      `[${element.ref}] ${oneLine(element.role)} ${JSON.stringify(oneLine(element.name))} at ${position}${legibility}`,
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
