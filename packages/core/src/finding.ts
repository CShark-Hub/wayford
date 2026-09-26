/**
 * A `Finding` is one line of the report. The Analyst fills these fields; it
 * never writes prose (`docs/PLAN.md` A9), because the UI has to be able to
 * separate what we measured from what we are guessing.
 *
 * Two rules from `AGENTS.md` are enforced by the schema rather than by review:
 * a finding carries its `type`, so a hypothesis can never be presented as a
 * measurement, and it carries at least one piece of evidence, so every verdict
 * is clickable through to the step it came from. A third: a `deterministic`
 * finding names the rules and threshold sources it rests on, and
 * `isHardFinding` treats any `folk` or `llm` source as soft. The schema cannot
 * check those sources against the profiles; the Analyst step copies them in
 * code (`docs/PLAN.md` F8 AC5).
 */
import { z } from "zod";
import {
  FindingId,
  isUnsourced,
  ProfileId,
  ProvenanceId,
  RuleId,
  RunId,
  StepIndex,
  TaskId,
} from "./primitives.js";

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

/**
 * `measurement` is a number read off the page, `deterministic` is a filter
 * decision that follows from the profile, `hypothesis` is the Analyst reading
 * the narration. Only the first two survive someone asking how we know.
 */
export const FINDING_TYPES = ["measurement", "deterministic", "hypothesis"] as const;

export const FindingType = z.enum(FINDING_TYPES);
export type FindingType = z.infer<typeof FindingType>;

/** The two types the report can defend, provided their basis is sourced (`isHardFinding`). */
export const HARD_FINDING_TYPES: readonly FindingType[] = ["measurement", "deterministic"];

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/**
 * A pointer into a stored run. `stepIndex` is the step's position in that run,
 * which is what the replay view scrolls to.
 */
export const EvidenceRef = z
  .object({
    runId: RunId,
    stepIndex: StepIndex,
  })
  .strict();
export type EvidenceRef = z.infer<typeof EvidenceRef>;

// ---------------------------------------------------------------------------
// Basis
// ---------------------------------------------------------------------------

/**
 * Which rule of `docs/RULES.md` produced the claim, and where that rule's
 * threshold comes from. A `deterministic` finding follows from the profile, so
 * it is only as defensible as the thresholds it rests on: a `folk` or `llm`
 * source makes it soft in the report, whatever its type says.
 */
export const FindingBasis = z
  .object({
    rule: RuleId,
    provenance: ProvenanceId,
  })
  .strict();
export type FindingBasis = z.infer<typeof FindingBasis>;

// ---------------------------------------------------------------------------
// Finding
// ---------------------------------------------------------------------------

export const Finding = z
  .object({
    id: FindingId,
    taskId: TaskId,
    type: FindingType,
    /** One line, the claim itself. */
    title: z.string().trim().min(1),
    /** The claim with its numbers, or the reasoning behind the guess. */
    detail: z.string().trim().min(1),
    /** Non-empty at the schema level: a finding we cannot point at is not shown. */
    evidence: z.array(EvidenceRef).min(1),
    /**
     * The rules and threshold sources the claim rests on. Required on every
     * finding so the Analyst's structured output has one shape; may be empty
     * except on a `deterministic` finding, which is a filter decision and has
     * to name the rule that made it.
     */
    basis: z.array(FindingBasis),
    /** What to change. Mandatory, so the report never stops at a complaint. */
    recommendation: z.string().trim().min(1),
    /**
     * Who this bit. May be empty: a measurement holds whoever is looking, and
     * saying it affects everyone by naming everyone would be a lie the first
     * time a persona is added.
     */
    personaIds: z.array(ProfileId),
    /** Set when the finding repeats something axe-core already reported (F10 AC2). */
    axeRuleId: z.string().trim().min(1).optional(),
  })
  .strict()
  .superRefine((finding, ctx) => {
    // F10 AC2 lets a measurement or deterministic finding cite an axe
    // violation. A hypothesis is the Analyst reading the narration, so hanging
    // a machine check's rule id on one would put the strongest provenance
    // signal we have on the one claim that cannot carry it.
    if (finding.axeRuleId !== undefined && !HARD_FINDING_TYPES.includes(finding.type)) {
      ctx.addIssue({
        code: "custom",
        path: ["axeRuleId"],
        message: `only ${HARD_FINDING_TYPES.join(" and ")} findings cite an axe rule; this one is a ${finding.type}`,
      });
    }
    if (finding.type === "deterministic" && finding.basis.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["basis"],
        message: "a deterministic finding names at least one rule and the source of its threshold",
      });
    }
  });
export type Finding = z.infer<typeof Finding>;

/**
 * Hard means the report can defend it: a measurement or a filter decision, and
 * none of the thresholds behind it is `folk` or `llm`. Anything else keeps its
 * type but is marked soft.
 */
export function isHardFinding(finding: Finding): boolean {
  return (
    HARD_FINDING_TYPES.includes(finding.type) &&
    !finding.basis.some((entry) => isUnsourced(entry.provenance))
  );
}
