/**
 * Shared vocabulary. Everything in this file is referenced by at least two
 * other schemas, so it is defined once, here, before they are written.
 *
 * Nothing in this file makes a design decision. The provenance ids and rule
 * ids are a transcription of `docs/RULES.md`; change that document first.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/** Source ids from the registry in `docs/RULES.md`. */
export const PROVENANCE_IDS = [
  "wcag22",
  "machado2009",
  "legge2011",
  "parhi2006",
  "hig",
  "material",
  "fitts",
  "iso9241",
  "hick",
  "cowan2001",
  "nngroup",
  "benway1998",
  "nielsen",
  "piaac",
  "pisarek",
  "flesch",
  "plain",
  "personalayer",
  "folk",
  "llm",
] as const;

export const ProvenanceId = z.enum(PROVENANCE_IDS);
export type ProvenanceId = z.infer<typeof ProvenanceId>;

/** A source id without a citation behind it. Reports must say so. */
export const UNSOURCED: readonly ProvenanceId[] = ["folk", "llm"];

export function isUnsourced(id: ProvenanceId): boolean {
  return UNSOURCED.includes(id);
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** Rule ids from `docs/RULES.md`. The letter is the pipeline stage. */
export const RULE_IDS = [
  // perception and degradation
  "P1",
  "P2",
  "P3",
  "P4",
  "P5",
  "P6",
  // knowledge
  "K1",
  "K2",
  "K3",
  "K4",
  // viewport
  "V1",
  "V2",
  // attention
  "A1",
  "A2",
  "A3",
  // memory
  "M1",
  // behaviour
  "B1",
  "B2",
  "B3",
  "B4",
] as const;

export const RuleId = z.enum(RULE_IDS);
export type RuleId = z.infer<typeof RuleId>;

/** The seven stages of the filter pipeline, in the order they run. */
export const PIPELINE_STAGES = [
  "viewport",
  "perception",
  "degradation",
  "knowledge",
  "attention",
  "memory",
  "behaviour",
] as const;

export const PipelineStage = z.enum(PIPELINE_STAGES);
export type PipelineStage = z.infer<typeof PipelineStage>;

const STAGE_BY_PREFIX: Record<string, PipelineStage> = {
  P: "perception",
  K: "knowledge",
  V: "viewport",
  A: "attention",
  M: "memory",
  B: "behaviour",
};

/**
 * Which pipeline stage a rule belongs to. Degradation shares the `P` prefix
 * with perception because it reads the same metrics; the state on the element
 * says which of the two happened.
 */
export function stageOf(rule: RuleId): PipelineStage {
  const stage = STAGE_BY_PREFIX[rule[0] as string];
  if (!stage) throw new Error(`No stage for rule ${rule}`);
  return stage;
}

// ---------------------------------------------------------------------------
// Metrics and perception outcome
// ---------------------------------------------------------------------------

/** What the filter measures on an element. Thresholds in a profile use the same names. */
export const METRIC_NAMES = ["contrast", "fontPx", "targetPx"] as const;

export const MetricName = z.enum(METRIC_NAMES);
export type MetricName = z.infer<typeof MetricName>;

/**
 * Three states, not two. Binary removal makes every failure "did not see it";
 * `degraded` is where misreading and wrong clicks come from.
 */
export const PERCEPTION_STATES = ["visible", "degraded", "invisible"] as const;

export const PerceptionState = z.enum(PERCEPTION_STATES);
export type PerceptionState = z.infer<typeof PerceptionState>;

/** WCAG 2.2 contrast ratio. 1:1 is identical, 21:1 is black on white. */
export const ContrastRatio = z.number().min(1).max(21);

/** A probability, and the width of a soft threshold band. */
export const Probability = z.number().min(0).max(1);

/**
 * Seed for `rng` and `hash`. Integer so it survives a URL and a filename; 32 bits because
 * that is the generator's whole state (`random.ts`), so a larger seed would silently replay a
 * smaller one.
 */
export const Seed = z.uint32();
export type Seed = z.infer<typeof Seed>;

/**
 * A step's position in its run. Referenced by the stored observation, by an
 * evidence pointer and by every `RunEvent` (`m0-05`), so it is defined once.
 */
export const StepIndex = z.number().int().nonnegative();

/**
 * A URL Playwright can actually navigate to.
 *
 * Two traps a bare `z.url()` walks into: `localhost:5174` parses with `localhost`
 * read as the scheme, and `http:///account` — one slash too many, the likeliest
 * typo of a real start URL — parses with `account` read as the host. The
 * protocol check catches the first; the host has to be a dotted name, an
 * address or literally `localhost` to catch the second.
 */
const HTTP_HOST =
  /^localhost$|^(\d{1,3}\.){3}\d{1,3}$|^\[[0-9a-f:]+\]$|^([a-z0-9-]+\.)+[a-z0-9-]+$/i;

export const HttpUrl = z.url({ protocol: /^https?$/, hostname: HTTP_HOST });

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export const Bbox = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});
export type Bbox = z.infer<typeof Bbox>;

/** The smaller side, which is what WCAG 2.2 target size compares. */
export function smallerSide(box: Bbox): number {
  return Math.min(box.width, box.height);
}

export const Viewport = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  deviceScaleFactor: z.number().positive().default(1),
  isMobile: z.boolean().default(false),
});
export type Viewport = z.infer<typeof Viewport>;

// ---------------------------------------------------------------------------
// Device and emulation
// ---------------------------------------------------------------------------

export const DEVICE_KINDS = ["desktop", "tablet", "mobile"] as const;

export const DeviceKind = z.enum(DEVICE_KINDS);
export type DeviceKind = z.infer<typeof DeviceKind>;

/**
 * Values accepted by CDP `Emulation.setEmulatedVisionDeficiency`.
 * Emulation illustrates in screenshots; the filter decides from measured
 * metrics (see `docs/RULES.md`, rule P6).
 */
export const VISION_DEFICIENCIES = [
  "none",
  "blurredVision",
  "reducedContrast",
  "achromatopsia",
  "deuteranopia",
  "protanopia",
  "tritanopia",
] as const;

export const VisionDeficiency = z.enum(VISION_DEFICIENCIES);
export type VisionDeficiency = z.infer<typeof VisionDeficiency>;

// ---------------------------------------------------------------------------
// Interface patterns (knowledge dimension, rules K1 and K4)
// ---------------------------------------------------------------------------

export const UI_PATTERNS = [
  "hamburger",
  "kebab",
  "breadcrumb",
  "carousel",
  "tabs",
  "accordion",
  "fab",
  "infiniteScroll",
  "swipe",
  "search",
  "cart",
  "backLink",
] as const;

export const UiPattern = z.enum(UI_PATTERNS);
export type UiPattern = z.infer<typeof UiPattern>;

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

/** Prefix per entity, so an id is readable in a log line and a URL. */
export const ID_PREFIXES = {
  profile: "prof",
  task: "task",
  run: "run",
  step: "step",
  finding: "fnd",
  sweep: "swp",
} as const;

export type IdPrefix = (typeof ID_PREFIXES)[keyof typeof ID_PREFIXES];

/**
 * `<prefix>_<slug>`. The slug is lowercase ASCII letters, digits and dashes and
 * does not start with a dash; it holds no underscore, so an id has exactly one.
 * Lowercase only, so an id has one spelling and compares as a plain string. A
 * ULID passes lowercased; its canonical uppercase form fails (`docs/STACK.md`).
 */
export function prefixedId<P extends IdPrefix>(prefix: P) {
  return z
    .string()
    .regex(
      new RegExp(`^${prefix}_[a-z0-9][a-z0-9-]*$`),
      `expected ${prefix}_<slug>: lowercase ASCII letters, digits and dashes, not starting with a dash`,
    );
}

export const ProfileId = prefixedId(ID_PREFIXES.profile);
export const TaskId = prefixedId(ID_PREFIXES.task);
export const RunId = prefixedId(ID_PREFIXES.run);
export const StepId = prefixedId(ID_PREFIXES.step);
export const FindingId = prefixedId(ID_PREFIXES.finding);
export const SweepId = prefixedId(ID_PREFIXES.sweep);

export type ProfileId = z.infer<typeof ProfileId>;
export type TaskId = z.infer<typeof TaskId>;
export type RunId = z.infer<typeof RunId>;
export type StepId = z.infer<typeof StepId>;
export type FindingId = z.infer<typeof FindingId>;
export type SweepId = z.infer<typeof SweepId>;
