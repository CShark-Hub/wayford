/**
 * A profile read as the Cast draws it: one row per dimension the filter reads, in the matrix's
 * order, each labelled with the rule it feeds (`docs/RULES.md`, "Persona composition"). The matrix
 * and the CastCard both read a profile through `castDimensions`, so they never disagree.
 *
 * A dimension the persona does not set has no value, and the screen reads it as `—`, never as zero
 * and never as "all". Only the three perception thresholds carry a source, so only they carry a
 * provenance, a place on a ruler and a softness: nothing else in a profile is cited.
 */
import {
  type ContrastThreshold,
  type PixelThreshold,
  type Profile,
  type ProvenanceId,
  type RuleId,
  UI_PATTERNS,
} from "@wayford/core";
import { count } from "../components/outcome-words.js";

/**
 * Each row's key, label and the rule it feeds, in matrix order: three perception thresholds, two
 * caps, patience, then knowledge. The one place the order is written; the matrix, the card and
 * `castDimensions` all follow it.
 */
export const DIMENSION_ROWS = [
  { key: "contrast", label: "Contrast", rule: "P1" },
  { key: "fontPx", label: "Font size", rule: "P3" },
  { key: "targetPx", label: "Target size", rule: "P4" },
  { key: "attention", label: "Attention", rule: "A1" },
  { key: "memory", label: "Memory", rule: "M1" },
  { key: "patience", label: "Patience", rule: "B3" },
  { key: "patterns", label: "Patterns", rule: "K1" },
  { key: "vocabulary", label: "Vocabulary", rule: "K2" },
] as const satisfies readonly { key: string; label: string; rule: RuleId }[];
export type DimensionKey = (typeof DIMENSION_ROWS)[number]["key"];

/** One row of a persona's spec, as the matrix's cell and the CastCard's plate draw it. */
export type Dimension = {
  key: DimensionKey;
  label: string;
  rule: RuleId;
  /** The value as the screen sets it, in mono; undefined when the persona does not set it. */
  value: string | undefined;
  /** The threshold's source: on P1, P3 and P4 alone, and only when set. */
  provenance?: ProvenanceId;
  /** Where the threshold sits on its ruler, 0 to 1: on P1, P3 and P4 alone, when set. */
  gauge?: number;
  /** The threshold's softness, when above 0: on P1, P3 and P4 alone. The CastCard shows it. */
  softness?: number;
  /** K1 alone: how many of the 12 patterns the persona knows. */
  known?: number;
};

/** How many interface patterns a persona can know (`docs/RULES.md`, stage 4): 12. */
export const PATTERN_COUNT = UI_PATTERNS.length;

type ThresholdKey = "contrast" | "fontPx" | "targetPx";

/**
 * Each threshold's ruler, `docs/design/screens/cast.html`'s: wide enough that Zoya, the far end,
 * sits at its end. Not the Lens's rulers, which run further for a slider to move past her.
 */
const RULERS: Record<ThresholdKey, { min: number; max: number; format: (n: number) => string }> = {
  // A whole ratio in the reference's one decimal, `3.0:1`; any other as written, never rounded up.
  contrast: {
    min: 1,
    max: 7,
    format: (ratio) => `${Number.isInteger(ratio) ? ratio.toFixed(1) : ratio}:1`,
  },
  fontPx: { min: 8, max: 24, format: (px) => `${px} px` },
  targetPx: { min: 16, max: 48, format: (px) => `${px} px` },
};

/** What a row reads off a profile: everything but its key, label and rule. */
type Reading = Omit<Dimension, "key" | "label" | "rule">;

/** A reading of `n` through `format`, or no value when `n` is absent. */
function plain(n: number | undefined, format: (n: number) => string): Reading {
  return { value: n === undefined ? undefined : format(n) };
}

/** A perception threshold's reading: its value, source, place on the ruler and softness, when set. */
function threshold(
  key: ThresholdKey,
  set: ContrastThreshold | PixelThreshold | undefined,
): Reading {
  if (set === undefined) return { value: undefined };
  const { min, max, format } = RULERS[key];
  const softness = set.softness ?? 0;
  return {
    value: format(set.threshold),
    provenance: set.provenance,
    gauge: Math.min(1, Math.max(0, (set.threshold - min) / (max - min))),
    ...(softness > 0 ? { softness } : {}),
  };
}

/** How each row reads a profile. Keyed by `DimensionKey`, so a row with no reading fails typecheck. */
const READINGS: Record<DimensionKey, (profile: Profile) => Reading> = {
  contrast: ({ perception }) => threshold("contrast", perception.contrast),
  fontPx: ({ perception }) => threshold("fontPx", perception.fontPx),
  targetPx: ({ perception }) => threshold("targetPx", perception.targetPx),
  attention: ({ behaviour }) => plain(behaviour.maxElements, (n) => count(n, "item")),
  memory: ({ behaviour }) => plain(behaviour.memorySteps, (n) => count(n, "step")),
  patience: ({ behaviour }) => plain(behaviour.budgetSeconds, (seconds) => `${seconds} s`),
  patterns: ({ knowledge }) => {
    // The schema allows a repeat, so the unknown are counted as a set: a pattern in neither list
    // is known (`docs/RULES.md`, K1).
    const known = PATTERN_COUNT - new Set(knowledge.unknownPatterns).size;
    return { value: `${known}`, known };
  },
  vocabulary: ({ knowledge }) => plain(knowledge.domainVocabulary?.length, (n) => count(n, "word")),
};

/** The eight rows of a persona's spec, in matrix order: P1, P3, P4, A1, M1, B3, K1, K2. */
export function castDimensions(profile: Profile): Dimension[] {
  return DIMENSION_ROWS.map((row) => ({ ...row, ...READINGS[row.key](profile) }));
}
