/**
 * A `Finding` is one line of the report. The Analyst fills these fields; it
 * never writes prose (`docs/PLAN.md` A9), because the UI has to be able to
 * separate what we measured from what we are guessing.
 *
 * Two rules from `AGENTS.md` are enforced by the schema rather than by review:
 * a finding carries its `type`, so a hypothesis can never be presented as a
 * measurement, and it carries at least one piece of evidence, so every verdict
 * is clickable through to the step it came from.
 */
import { z } from "zod";
import { FindingId, ProfileId, RunId, TaskId } from "./primitives.js";

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

/** The two the report can defend. The third is labelled as a guess, and is one. */
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
    stepIndex: z.number().int().nonnegative(),
  })
  .strict();
export type EvidenceRef = z.infer<typeof EvidenceRef>;

// ---------------------------------------------------------------------------
// Finding
// ---------------------------------------------------------------------------

export const Finding = z
  .object({
    id: FindingId,
    taskId: TaskId,
    type: FindingType,
    /** One line, the claim itself. */
    title: z.string().min(1),
    /** The claim with its numbers, or the reasoning behind the guess. */
    detail: z.string().min(1),
    /** Non-empty at the schema level: a finding we cannot point at is not shown. */
    evidence: z.array(EvidenceRef).min(1),
    /** What to change. Mandatory, so the report never stops at a complaint. */
    recommendation: z.string().min(1),
    /**
     * Who this bit. May be empty: a measurement holds whoever is looking, and
     * saying it affects everyone by naming everyone would be a lie the first
     * time a persona is added.
     */
    personaIds: z.array(ProfileId),
    /** Set when the finding repeats something axe-core already reported (F10 AC2). */
    axeRuleId: z.string().min(1).optional(),
  })
  .strict();
export type Finding = z.infer<typeof Finding>;

export function isHardFinding(finding: Finding): boolean {
  return HARD_FINDING_TYPES.includes(finding.type);
}
