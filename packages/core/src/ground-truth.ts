/**
 * Ground truth: what Scout found when it walked a task with full vision
 * (`docs/PLAN.md` F4, `tasks/s2-04-scout.md`). It is the only way the report can
 * tell "the feature is broken" from "the feature works but Vera could not find
 * it" (`AGENTS.md`, "Scout is mandatory").
 *
 * Scout makes up to three attempts. Each one is an ordinary run of the Actor
 * loop, and its run folder, `attempts/<run id>/` beside this file, holds its
 * evidence. io's run routes do not serve it: those runs are not in io's
 * database or its runs directory. The shortest successful attempt is the
 * ground truth. Every successful attempt is kept with its path, so the report
 * can say a route works even when it is not the shortest.
 *
 * Two conventions the schema cannot check:
 * - `reached: false` means Scout did not reach the goal in its attempts, never
 *   that the goal is unreachable. Claim less than you would like to.
 * - A hand-written file, the fallback when a real Scout run fails, says
 *   `modelId: "hand"` and uses run ids `run_hand-*`, which name no run folder.
 *   So a reader can label it hand-written rather than measured.
 *
 * The Actor never reads this (`AGENTS.md`). agent's `actor-isolation.test.ts`
 * fails when a module the Actor runs from reaches it.
 */
import { z } from "zod";
import { ActionType } from "./action.js";
import { HttpUrl, RunId, TaskId } from "./primitives.js";
import { RunOutcome } from "./run.js";

/** One action of a path: the page it ran on, what it was, and the element it named. */
export const PathStep = z
  .object({
    /** The step's `urlBefore`: the page as observed, so with no target parameters on it. */
    url: HttpUrl,
    action: ActionType,
    /** The key of the element the action named. Absent for one that names none: a scroll, a
     *  `back`, a wait. */
    key: z.string().min(1).optional(),
  })
  .strict();
export type PathStep = z.infer<typeof PathStep>;

/**
 * Every action an attempt ran, in order, and where the last one landed. A
 * wasted step ran nothing, so it is no step of a path.
 */
export const ScoutPath = z
  .object({
    steps: z.array(PathStep).min(1),
    /** The last step's `urlAfter`: the page the goal was met on. */
    reachedUrl: z.url(),
  })
  .strict();
export type ScoutPath = z.infer<typeof ScoutPath>;

/** One attempt: the run that holds its evidence, how it ended, and its path when it succeeded. */
export const ScoutAttempt = z
  .object({
    runId: RunId,
    outcome: RunOutcome,
    path: ScoutPath.optional(),
  })
  .strict()
  .superRefine((attempt, ctx) => {
    if ((attempt.outcome === "success") !== (attempt.path !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["path"],
        message: "an attempt has a path exactly when it succeeded",
      });
    }
  });
export type ScoutAttempt = z.infer<typeof ScoutAttempt>;

/**
 * One task's ground truth, as Scout writes it to `<task id>.json`.
 *
 * `shortest` repeats its attempt's path, so the file answers "how far is the
 * goal" without a lookup. The refines keep the copy and the rest of the file
 * consistent with the attempts, a hand-written file included.
 */
export const GroundTruth = z
  .object({
    taskId: TaskId,
    /** Scout's model. Its attempts record it as `modelIds.actor` too, since in a Scout attempt
     *  Scout plays the Actor's part (`ModelIds`). */
    modelId: z.string().min(1),
    /** The URL every attempt passed to `goto`, target parameters included. */
    startUrl: HttpUrl,
    /** When Scout finished. A timestamp only: the app may have changed since. */
    recordedAt: z.iso.datetime(),
    reached: z.boolean(),
    /** Every attempt, in the order run. */
    attempts: z.array(ScoutAttempt).min(1),
    /** The ground truth: the successful attempt with the fewest steps, the first of them on a
     *  tie, with its path. Present exactly when `reached`. */
    shortest: z.object({ runId: RunId, path: ScoutPath }).strict().optional(),
    /** The last element the shortest path acted on, and the page it is on: for a URL goal, the
     *  link that reached it. Absent when that path named no element. */
    target: z
      .object({ key: z.string().min(1), page: HttpUrl })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((truth, ctx) => {
    const derived = groundTruthOf(truth.attempts);
    if (truth.reached !== derived.reached) {
      ctx.addIssue({
        code: "custom",
        path: ["reached"],
        message: "reached must say whether some attempt succeeded",
      });
    }
    if (!truth.reached && truth.attempts.some((attempt) => attempt.outcome === "error")) {
      ctx.addIssue({
        code: "custom",
        path: ["reached"],
        message: "a crashed attempt is no evidence that the goal is out of reach; run Scout again",
      });
    }
    // Stringify is a sound equality here: both sides are built from the same parsed attempts, by
    // strict schemas that keep their key order.
    if (JSON.stringify(truth.shortest) !== JSON.stringify(derived.shortest)) {
      ctx.addIssue({
        code: "custom",
        path: ["shortest"],
        message:
          "shortest must be the first successful attempt with the fewest steps, with its path",
      });
    }
    if (JSON.stringify(truth.target) !== JSON.stringify(derived.target)) {
      ctx.addIssue({
        code: "custom",
        path: ["target"],
        message: "target must be the last element the shortest path acted on, with its page",
      });
    }
  });
export type GroundTruth = z.infer<typeof GroundTruth>;

/** What a ground truth derives from its attempts. */
interface Derived {
  reached: boolean;
  shortest?: { runId: string; path: ScoutPath };
  target?: { key: string; page: string };
}

/**
 * The one rule for what attempts say, which Scout writes by and the schema
 * checks by. The goal is reached when an attempt succeeded. `shortest` is the
 * first successful attempt with the fewest steps, so a tie goes to the earlier
 * one. `target` is the last element that path acted on, with its page.
 */
export function groundTruthOf(attempts: readonly ScoutAttempt[]): Derived {
  let shortest: Derived["shortest"];
  for (const { runId, path } of attempts) {
    if (path === undefined) continue;
    if (shortest === undefined || path.steps.length < shortest.path.steps.length) {
      shortest = { runId, path };
    }
  }
  const last = shortest?.path.steps.findLast((step) => step.key !== undefined);
  return {
    reached: attempts.some((attempt) => attempt.outcome === "success"),
    ...(shortest && { shortest }),
    ...(last?.key !== undefined && { target: { key: last.key, page: last.url } }),
  };
}
