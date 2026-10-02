/**
 * `Profile` is a capability bundle, never a job title. The engine reads the
 * dimensions below; `label`, a bare name, and `description`, one line about
 * the bundle, are for people.
 *
 * The schema describes thresholds. It never applies them: the band logic that
 * turns a threshold plus a softness into `visible | degraded | invisible`
 * lives in `filter`. See `docs/RULES.md` for the pipeline and the rule ids.
 */
import { z } from "zod";
import {
  ContrastRatio,
  DeviceKind,
  Probability,
  ProfileId,
  ProvenanceId,
  Seed,
  UiPattern,
  VisionDeficiency,
} from "./primitives.js";

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/**
 * One measurable limit. `provenance` is mandatory: a number we cannot cite is
 * still allowed, but it has to say `folk` or `llm` out loud, because the report
 * repeats it (see `docs/RULES.md`, source registry).
 *
 * `softness` widens the threshold into a band. Zero, or absent, is a hard cut.
 */
function threshold<T extends z.ZodType<number>>(value: T) {
  return z
    .object({
      threshold: value,
      softness: Probability.optional(),
      provenance: ProvenanceId,
    })
    .strict();
}

/** WCAG 2.2 contrast ratio, rules P1 and P2. */
export const ContrastThreshold = threshold(ContrastRatio);
export type ContrastThreshold = z.infer<typeof ContrastThreshold>;

/** CSS pixels: font size (P3) and target size (P4). */
export const PixelThreshold = threshold(z.number().positive());
export type PixelThreshold = z.infer<typeof PixelThreshold>;

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/**
 * What the persona can see. Every key matches a `MetricName`, so the filter
 * looks a threshold up by the name of the metric it just measured.
 *
 * An absent threshold means the metric does not gate this persona at all.
 * `emulation` only drives the screenshot layer (rule P6); the decision is P1.
 */
export const Perception = z
  .object({
    contrast: ContrastThreshold.optional(),
    fontPx: PixelThreshold.optional(),
    targetPx: PixelThreshold.optional(),
    emulation: VisionDeficiency.default("none"),
  })
  .strict();
export type Perception = z.infer<typeof Perception>;

/**
 * What the persona does with what reached it, plus the caps on how much reaches
 * it at all. The dice (B1, B2; B4 is next) are rolled per action; the caps are
 * deterministic truncation applied by stages 5 and 6. They share a section
 * because a profile has three sections, not five.
 *
 * Closed like the other sections, so a misspelt key such as `doubleclick`
 * fails instead of switching B1 off. A rule that needs a knob of its own adds
 * the key when it lands.
 */
export const Behaviour = z
  .object({
    /** B1: probability a click becomes a double click. */
    doubleClick: Probability.optional(),
    /** B2: probability a scroll is injected when the Actor is stuck. */
    scrollWhenStuck: Probability.optional(),
    /** B3: wall-clock budget for the run, after which it ends `budget_exceeded`. */
    budgetSeconds: z.number().int().positive(),
    /** A1: how many elements survive the salience ordering. Absent is unlimited. */
    maxElements: z.number().int().positive().optional(),
    /** A3: how many entries of a list or menu are passed. Absent is unlimited. */
    maxOptions: z.number().int().positive().optional(),
    /** M1: how many steps of history the Actor keeps. Absent is unlimited. */
    memorySteps: z.number().int().positive().optional(),
  })
  .strict();
export type Behaviour = z.infer<typeof Behaviour>;

/**
 * What the persona understands. Fully deterministic, no dice (rules K1 to K4).
 * Patterns are the shared `UiPattern` vocabulary so a typo fails validation
 * instead of silently dropping a pattern the persona was meant not to know: a
 * pattern in neither list is known (`docs/RULES.md`, stage 4).
 */
export const Knowledge = z
  .object({
    knownPatterns: z.array(UiPattern),
    unknownPatterns: z.array(UiPattern),
    domainVocabulary: z.array(z.string()).optional(),
  })
  .strict()
  .superRefine((knowledge, ctx) => {
    // RULES stage 4: the persona either knows a pattern or does not. The check
    // sits on the section, not on `Profile`, so the builder's knowledge block
    // validates on its own and `Profile` keeps `.pick()`, `.omit()` and
    // `.partial()`, which zod refuses on a refined object.
    const both = [...new Set(conflictingPatterns({ knowledge }))];
    if (both.length === 0) return;
    ctx.addIssue({
      code: "custom",
      message: `a pattern is known or unknown, never both; remove ${both.join(", ")} from one list`,
    });
  });
export type Knowledge = z.infer<typeof Knowledge>;

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const Profile = z
  .object({
    id: ProfileId,
    /** The persona's name and nothing else. One word, English like the rest. */
    label: z.string().regex(/^\p{Lu}\p{L}+$/u, "a label is one capitalised name"),
    /** One English line: what this bundle is and which limits define it. */
    description: z.string().min(1),
    /** Draws the avatar and nothing else: runs take their own seed (`docs/PLAN.md` A20). */
    seed: Seed,
    /** Drives real device emulation, rule V1. */
    device: DeviceKind,
    perception: Perception,
    behaviour: Behaviour,
    knowledge: Knowledge,
  })
  .strict();
export type Profile = z.infer<typeof Profile>;

/** A pattern the persona knows cannot also be one it does not know. */
export function conflictingPatterns(profile: Pick<Profile, "knowledge">): UiPattern[] {
  const unknown = new Set(profile.knowledge.unknownPatterns);
  return profile.knowledge.knownPatterns.filter((p) => unknown.has(p));
}

/**
 * How many dimensions of the filter a persona switches on: perception
 * thresholds, attention and memory caps, and patterns it does not recognise.
 *
 * Not a severity score and not comparable across metrics — a 44 px target
 * threshold and a 3:1 contrast threshold constrain different things and cannot
 * be added up. This counts switches, which is enough to tell the control
 * persona, with none, from the boundary, with the most. The personas between
 * them sort by name, not by this count (docs/RULES.md, "Persona composition").
 */
export function constraintCount(profile: Profile): number {
  const thresholds = [
    profile.perception.contrast,
    profile.perception.fontPx,
    profile.perception.targetPx,
  ].filter(Boolean).length;
  const caps = [
    profile.behaviour.maxElements,
    profile.behaviour.maxOptions,
    profile.behaviour.memorySteps,
  ].filter((cap) => cap !== undefined).length;
  return thresholds + caps + profile.knowledge.unknownPatterns.length;
}
