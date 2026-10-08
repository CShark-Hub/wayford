/**
 * A `Report` is what the Analyst stores for one task: one run set's numbers per
 * persona, and the findings read off those runs (`docs/PLAN.md` F8,
 * `tasks/s4-04-analyst.md`).
 *
 * Code decides what is true; the model only words it. The counts, the
 * route-open seeds and the `deterministic` findings are computed from the
 * stored runs and the route table before the Analyst is called. The model
 * writes the recommendations and up to five hypotheses, into fields (A9), and
 * code checks them before they are stored.
 *
 * Each persona carries two numbers that are never merged: in how many seeds the
 * filter left a route open, and in how many the persona got through. The first
 * is the filter's and replays exactly from the seed. The gap to the second is
 * the wayfinding question, which only a hypothesis speaks to. A goal with no
 * route table has no first number: it is `null`, which a screen reads as "—"
 * (F8 AC6), never 0, which would claim every route closed.
 *
 * The rows behind each number are kept, one per seed, so a number opens exactly
 * the runs it counts, and the refines keep the counts from disagreeing with
 * them.
 *
 * Of the evidence, the schema checks what one document can: every evidence ref
 * names a run the report read, and every persona a finding or a closure names
 * is one of the report's. Whether the step exists it cannot check, since the
 * report holds no steps. The Analyst step checks that against the stored runs
 * and drops a finding that fails (F8 AC2).
 */
import { z } from "zod";
import { Finding } from "./finding.js";
import { AriaRole } from "./observation.js";
import { ProfileId, RuleId, RunId, Seed, TaskId } from "./primitives.js";
import { Cost, RunOutcome } from "./run.js";

/** A count of runs or seeds. */
const Count = z.number().int().nonnegative();

/** Agent's `ActorBackendName`, spelt here: core imports nothing from the workspace. */
export const ReportBackend = z.enum(["llm", "jev"]);
export type ReportBackend = z.infer<typeof ReportBackend>;

/**
 * Scout's line (`GroundTruth`): reached in N steps, not reached in N attempts,
 * or no file. Not reached is never "unreachable" (`ground-truth.ts`). The model
 * id stays on the line, so a hand-written ground truth (`hand`) reads as one.
 */
export const ScoutLine = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("reached"),
      steps: z.number().int().positive(),
      modelId: z.string().min(1),
      recordedAt: z.iso.datetime(),
    })
    .strict(),
  z
    .object({
      status: z.literal("notReached"),
      attempts: z.number().int().positive(),
      modelId: z.string().min(1),
      recordedAt: z.iso.datetime(),
    })
    .strict(),
  z.object({ status: z.literal("noGroundTruth") }).strict(),
]);
export type ScoutLine = z.infer<typeof ScoutLine>;

/** One seed of a persona's run set: the run the report read, how it ended, the routes left open. */
export const ReportSeed = z
  .object({
    seed: Seed,
    runId: RunId,
    outcome: RunOutcome,
    /** Route ids the filter left open in this seed, in walk order; null without a route table. */
    openRoutes: z.array(z.string().min(1)).nullable(),
  })
  .strict();
export type ReportSeed = z.infer<typeof ReportSeed>;

/** One persona's two numbers and the runs behind them. */
export const PersonaResult = z
  .object({
    profileId: ProfileId,
    runs: z.number().int().positive(),
    /** Runs the tool fell over in. Kept apart, so a crash never reads as the persona failing. */
    errors: Count,
    successes: Count,
    /** Seeds whose filtered observations left at least one route open; null without a route table. */
    routeOpenSeeds: Count.nullable(),
    /** Median wall-clock `durationMs` over the successful runs, kept as evidence; null without a
     *  success. Screens read `medianSimulatedMs`. */
    medianSuccessMs: z.number().nonnegative().nullable(),
    /** Median `simulatedMs` over the successful runs (B3's clock); null without a success, or when
     *  any one of them carries no time. Absent on a report stored before s2-09. */
    medianSimulatedMs: z.number().nonnegative().nullable().optional(),
    /** One per seed, by seed. */
    seeds: z.array(ReportSeed).min(1),
  })
  .strict()
  .superRefine((result, ctx) => {
    const { seeds } = result;
    const ended = (outcome: RunOutcome) => seeds.filter((s) => s.outcome === outcome).length;
    if (result.runs !== seeds.length) {
      ctx.addIssue({ code: "custom", path: ["runs"], message: "runs must be the number of seeds" });
    }
    if (result.successes !== ended("success")) {
      ctx.addIssue({
        code: "custom",
        path: ["successes"],
        message: "successes must count the seeds that ended in success",
      });
    }
    if (result.errors !== ended("error")) {
      ctx.addIssue({
        code: "custom",
        path: ["errors"],
        message: "errors must count the seeds that ended in error",
      });
    }
    if (new Set(seeds.map((s) => s.seed)).size !== seeds.length) {
      ctx.addIssue({ code: "custom", path: ["seeds"], message: "each seed appears once" });
    }
    if ((result.successes === 0) !== (result.medianSuccessMs === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["medianSuccessMs"],
        message: "medianSuccessMs is null exactly when there is no success",
      });
    }
    // Not "exactly": a success stored before s2-09 carries no simulated time to take a median of.
    if (result.successes === 0 && typeof result.medianSimulatedMs === "number") {
      ctx.addIssue({
        code: "custom",
        path: ["medianSimulatedMs"],
        message: "medianSimulatedMs is null when there is no success",
      });
    }

    // The route table belongs to the goal, not the seed, so a mix is a broken document. The share
    // is only checked against seeds that agree with each other.
    const withoutTable = seeds.filter((s) => s.openRoutes === null).length;
    if (withoutTable !== 0 && withoutTable !== seeds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["seeds"],
        message:
          "openRoutes is null on every seed or on none: a goal has a route table or it has not",
      });
      return;
    }
    const tableless = withoutTable > 0;
    if (tableless !== (result.routeOpenSeeds === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["routeOpenSeeds"],
        message: "routeOpenSeeds is null exactly when the seeds' openRoutes are",
      });
      return;
    }
    const open = seeds.filter((s) => s.openRoutes !== null && s.openRoutes.length > 0).length;
    if (result.routeOpenSeeds !== null && result.routeOpenSeeds !== open) {
      ctx.addIssue({
        code: "custom",
        path: ["routeOpenSeeds"],
        message: "routeOpenSeeds must count the seeds with at least one route open",
      });
    }
  });
export type PersonaResult = z.infer<typeof PersonaResult>;

/**
 * A route the filter closed that no step of the persona's runs shows: listed,
 * not a finding. The route-open number already counts it; without a step on its
 * page there is nothing to click through to (F8 AC2).
 */
export const UnevidencedClosure = z
  .object({
    profileId: ProfileId,
    routeId: z.string().min(1),
    /** The page of the step the route closed at, as a path. */
    page: z.string().startsWith("/"),
    role: AriaRole,
    name: z.string(),
    rules: z.array(RuleId).min(1),
    /** In how many of the persona's seeds the route closed there. */
    seeds: z.number().int().positive(),
  })
  .strict();
export type UnevidencedClosure = z.infer<typeof UnevidencedClosure>;

export const Report = z
  .object({
    taskId: TaskId,
    /** The one backend every run read was on (A22). */
    backend: ReportBackend,
    /** When the Analyst ran. A timestamp only. */
    analysedAt: z.iso.datetime(),
    /** The `analyst` role's configured model. */
    analystModelId: z.string().min(1),
    runCount: z.number().int().positive(),
    /** What the runs read cost, summed, and what the one Analyst call cost. */
    cost: z.object({ runs: Cost, analyst: Cost }).strict(),
    /** Context, not a verdict: it says whether the feature works at all. */
    scout: ScoutLine,
    personas: z.array(PersonaResult).min(1),
    findings: z.array(Finding),
    /** Stored runs of the task the report did not read, so a reader knows they exist. */
    leftOut: z.object({ olderRuns: Count, otherBackend: Count, sweepRuns: Count }).strict(),
    unevidencedClosures: z.array(UnevidencedClosure),
  })
  .strict()
  .superRefine((report, ctx) => {
    const runs = report.personas.reduce((sum, result) => sum + result.runs, 0);
    if (report.runCount !== runs) {
      ctx.addIssue({
        code: "custom",
        path: ["runCount"],
        message: "runCount must be the sum of the personas' runs",
      });
    }
    const personaIds = new Set(report.personas.map((result) => result.profileId));
    if (personaIds.size !== report.personas.length) {
      ctx.addIssue({ code: "custom", path: ["personas"], message: "each persona appears once" });
    }
    const runIds = new Set(report.personas.flatMap((result) => result.seeds.map((s) => s.runId)));

    report.findings.forEach((finding, i) => {
      if (finding.taskId !== report.taskId) {
        ctx.addIssue({
          code: "custom",
          path: ["findings", i, "taskId"],
          message: "a finding is about the report's task",
        });
      }
      finding.evidence.forEach((ref, j) => {
        if (!runIds.has(ref.runId)) {
          ctx.addIssue({
            code: "custom",
            path: ["findings", i, "evidence", j, "runId"],
            message: "evidence names a run the report did not read",
          });
        }
      });
      finding.personaIds.forEach((id, j) => {
        if (!personaIds.has(id)) {
          ctx.addIssue({
            code: "custom",
            path: ["findings", i, "personaIds", j],
            message: "a finding names a persona the report does not hold",
          });
        }
      });
    });
    report.unevidencedClosures.forEach((closure, i) => {
      if (!personaIds.has(closure.profileId)) {
        ctx.addIssue({
          code: "custom",
          path: ["unevidencedClosures", i, "profileId"],
          message: "a closure names a persona the report does not hold",
        });
      }
    });
  });
export type Report = z.infer<typeof Report>;
