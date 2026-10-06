/**
 * A `Sweep` runs one task for one persona across a range of one capability,
 * the same seeds at every value, and stores per value how many got through and
 * how many had a route open (`docs/PLAN.md` F9, `AGENTS.md`, "Untouchable
 * core", point 3). It is a record at rest beside the seven contracts, and new,
 * so none of them changes.
 *
 * The swept value is a profile threshold or cap, never an app parameter, and
 * its softness stays fixed (F9 AC4). `sweptProfile` is the one place that sets
 * it and `sweptValueOf` the one place that reads it, for io, agent and the
 * sweep screen.
 *
 * The values run from the laxest end, which the axis decides: the lowest
 * contrast threshold, the highest attention cap. The boundary is the first
 * value from there whose success rate falls below 50% (F9 AC5), unless an
 * error comes first: then there is none (`boundaryOf`). The schema
 * checks a stored boundary against its own numbers, so the two never disagree.
 */
import { z } from "zod";
import { WayfordError } from "./error.js";
import { ContrastRatio, ProfileId, RunId, Seed, SweepId, TaskId } from "./primitives.js";
import { Profile } from "./profile.js";
import { MAX_RUN_SET_SEEDS, type RunSweep } from "./run.js";

// ---------------------------------------------------------------------------
// Axes, statuses, backends
// ---------------------------------------------------------------------------

/**
 * The capability axes a sweep can move, as `RunSweep` names them (`run.ts`). An axis on one list
 * and not the other fails to compile: the `satisfies` here one way, `EveryRunSweepAxis` the other.
 */
export const SWEEP_AXES = [
  "contrast",
  "maxElements",
] as const satisfies readonly RunSweep["axis"][];

export const SweepAxis = z.enum(SWEEP_AXES);
export type SweepAxis = z.infer<typeof SweepAxis>;

type EveryRunSweepAxis = [Exclude<RunSweep["axis"], SweepAxis>] extends [never] ? true : never;
true satisfies EveryRunSweepAxis;

/** A sweep is saved `incomplete` before its first value and `complete` after its last. */
export const SWEEP_STATUSES = ["complete", "incomplete"] as const;

export const SweepStatus = z.enum(SWEEP_STATUSES);
export type SweepStatus = z.infer<typeof SweepStatus>;

/** The Actor backends a sweep can run on; agent's `ActorBackendName` has the same names (pinned by a test in io). */
export const SWEEP_BACKENDS = ["llm", "jev"] as const;

export const SweepBackend = z.enum(SWEEP_BACKENDS);
export type SweepBackend = z.infer<typeof SweepBackend>;

// ---------------------------------------------------------------------------
// The grid and the boundary
// ---------------------------------------------------------------------------

/** Contrast values sit on a grid of thousandths, the precision `collect` reports a ratio at. */
const CONTRAST_DECIMALS = 1000;

/** Slack for reading a decimal as whole thousandths: 4.5 × 1000 need not be exactly 4500. */
const EPSILON = 1e-6;

/** The most values one sweep runs. A range is counted against it before its grid is built. */
export const MAX_SWEEP_VALUES = 50;

function rangeError(message: string): WayfordError {
  return new WayfordError("invalid_sweep_range", message);
}

/** A contrast end or step in whole thousandths. Off that grid, two values would round alike. */
function thousandths(x: number, name: "end" | "step"): number {
  const whole = Math.round(x * CONTRAST_DECIMALS);
  if (Math.abs(x * CONTRAST_DECIMALS - whole) > EPSILON) {
    throw rangeError(`a contrast ${name} is a whole number of thousandths, not ${x}`);
  }
  return whole;
}

/** How many values a range of `span` by `step` holds, refused above `MAX_SWEEP_VALUES`. */
function gridSize(span: number, step: number): number {
  const count = Math.floor(span / step) + 1;
  if (count > MAX_SWEEP_VALUES) {
    throw rangeError(`the range holds ${count} values; a sweep runs at most ${MAX_SWEEP_VALUES}`);
  }
  return count;
}

/**
 * The values a sweep runs, laxest first: ascending for `contrast`, descending
 * for `maxElements`, whatever order `from` and `to` come in. Each value is
 * `start ± i × step`, never a running sum, counted in whole thousandths for
 * `contrast`. The far end is kept when it falls on the grid and clipped
 * otherwise.
 *
 * Throws `invalid_sweep_range` for a step that is not positive, a
 * `maxElements` end or step that is not a whole number, a `contrast` end or
 * step that is not a whole number of thousandths, two equal ends, an end the
 * profile field cannot hold, or more than `MAX_SWEEP_VALUES` values.
 */
export function sweepValues(axis: SweepAxis, from: number, to: number, step: number): number[] {
  if (![from, to, step].every(Number.isFinite)) {
    throw rangeError(`the range ${from} to ${to} by ${step} has a number that is not finite`);
  }
  if (step <= 0) throw rangeError(`the step must be positive, not ${step}`);
  if (from === to) throw rangeError(`the range ${from} to ${to} is empty: give two different ends`);
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);

  switch (axis) {
    case "contrast": {
      if (!ContrastRatio.safeParse(lo).success || !ContrastRatio.safeParse(hi).success) {
        throw rangeError(`a contrast range lies within 1 to 21, not ${lo} to ${hi}`);
      }
      const start = thousandths(lo, "end");
      const end = thousandths(hi, "end");
      const by = thousandths(step, "step");
      if (by < 1) throw rangeError(`a contrast step is at least 0.001, not ${step}`);
      return Array.from(
        { length: gridSize(end - start, by) },
        (_, i) => (start + i * by) / CONTRAST_DECIMALS,
      );
    }
    case "maxElements":
      if (![from, to, step].every(Number.isInteger)) {
        throw rangeError(`a maxElements range is whole numbers, not ${from} to ${to} by ${step}`);
      }
      if (lo < 1) throw rangeError(`a maxElements cap is at least 1, not ${lo}`);
      return Array.from({ length: gridSize(hi - lo, step) }, (_, i) => hi - i * step);
    default:
      return axis satisfies never;
  }
}

/**
 * Walks the values laxest first. At the first value with an error it returns
 * `null`: a run that crashed or was never stored leaves that value not fully
 * measured, and the sweep claims nothing past it (claim less than you'd like
 * to). Otherwise the boundary is the first value whose success rate is
 * strictly below 50%, and `null` when none is. So a crash never makes a
 * boundary.
 *
 * A dip that recovers still wins: the rate is not monotone (`docs/RULES.md`,
 * "Monotone per perception rule"), and the first value where most do not get
 * through is the finding.
 */
export function boundaryOf(
  values: readonly { value: number; successes: number; errors: number }[],
  seedCount: number,
): number | null {
  for (const row of values) {
    if (row.errors > 0) return null;
    if (row.successes / seedCount < 0.5) return row.value;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The swept field
// ---------------------------------------------------------------------------

/** The profile field an axis names, or undefined when the profile does not set it. */
export function sweptValueOf(profile: Profile, axis: SweepAxis): number | undefined {
  switch (axis) {
    case "contrast":
      return profile.perception.contrast?.threshold;
    case "maxElements":
      return profile.behaviour.maxElements;
    default:
      return axis satisfies never;
  }
}

/**
 * A copy of `profile` with the field an axis names set to `value`, checked by
 * `Profile`. Softness, provenance, the id and every other field stay as they
 * are.
 *
 * `contrast` on a profile with no contrast threshold throws `sweep_axis_unset`:
 * it has no softness to keep (F9 AC4). `maxElements` on a profile with no cap
 * is allowed: no cap is unlimited, a cap has no softness or provenance to
 * invent, and the laxest end approaches unlimited.
 */
export function sweptProfile(profile: Profile, axis: SweepAxis, value: number): Profile {
  switch (axis) {
    case "contrast": {
      const contrast = profile.perception.contrast;
      if (contrast === undefined) {
        throw new WayfordError(
          "sweep_axis_unset",
          `${profile.id} sets no contrast threshold, so a contrast sweep has no softness to keep`,
        );
      }
      return Profile.parse({
        ...profile,
        perception: { ...profile.perception, contrast: { ...contrast, threshold: value } },
      });
    }
    case "maxElements":
      return Profile.parse({ ...profile, behaviour: { ...profile.behaviour, maxElements: value } });
    default:
      return axis satisfies never;
  }
}

/**
 * The values a sweep of `profile` runs (`sweepValues`), once `sweptProfile` has checked the axis
 * on the persona at the laxest value: every refusal io's engine and CLI make before anything runs.
 * Throws as those two do.
 */
export function sweepPlan(
  profile: Profile,
  axis: SweepAxis,
  from: number,
  to: number,
  step: number,
): number[] {
  const values = sweepValues(axis, from, to, step);
  // `sweepValues` never returns an empty grid; the laxest value checks the axis for them all.
  sweptProfile(profile, axis, values[0] ?? from);
  return values;
}

// ---------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------

/** One value of a sweep and how its run set went. */
const sweepValue = <V extends z.ZodType<number>>(value: V) =>
  z
    .object({
      value,
      /** One per seed, in seed order, a never-stored run too: a value is appended once all its runs settled. */
      runIds: z.array(RunId),
      /** Runs stored with outcome `success`. */
      successes: z.number().int().nonnegative(),
      /** Runs stored as `error`, or never stored: both count as not getting through. */
      errors: z.number().int().nonnegative(),
      /** Seeds where the swept profile leaves at least one route open; null when the task has no route table. */
      routeOpenSeeds: z.array(Seed).nullable(),
    })
    .strict();

const base = {
  id: SweepId,
  taskId: TaskId,
  profileId: ProfileId,
  backend: SweepBackend,
  /** The same seeds at every value (F9 AC3, A20). */
  seeds: z.array(Seed).min(1).max(MAX_RUN_SET_SEEDS),
  startedAt: z.iso.datetime(),
  status: SweepStatus,
};

export const Sweep = z
  .discriminatedUnion("axis", [
    z
      .object({
        ...base,
        axis: z.literal("contrast"),
        from: ContrastRatio,
        to: ContrastRatio,
        /** A difference between ratios, not a ratio: 0.5 is a step. */
        step: z.number().positive(),
        values: z.array(sweepValue(ContrastRatio)),
        boundary: ContrastRatio.nullable(),
      })
      .strict(),
    z
      .object({
        ...base,
        axis: z.literal("maxElements"),
        from: z.number().int().positive(),
        to: z.number().int().positive(),
        step: z.number().int().positive(),
        values: z.array(sweepValue(z.number().int().positive())),
        boundary: z.number().int().positive().nullable(),
      })
      .strict(),
  ])
  .superRefine((sweep, ctx) => {
    const seeds = new Set(sweep.seeds);
    const repeated = sweep.seeds.filter((seed, i) => sweep.seeds.indexOf(seed) !== i);
    if (repeated.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["seeds"],
        message: `seeds are unique; ${[...new Set(repeated)].join(", ")} repeats`,
      });
    }

    sweep.values.forEach((row, i) => {
      if (row.runIds.length > sweep.seeds.length) {
        ctx.addIssue({
          code: "custom",
          path: ["values", i, "runIds"],
          message: `${row.runIds.length} run ids for ${sweep.seeds.length} seeds`,
        });
      }
      if (row.successes + row.errors > row.runIds.length) {
        ctx.addIssue({
          code: "custom",
          path: ["values", i],
          message: `${row.successes} successes and ${row.errors} errors are more than ${row.runIds.length} runs`,
        });
      }
      for (const seed of row.routeOpenSeeds ?? []) {
        if (!seeds.has(seed)) {
          ctx.addIssue({
            code: "custom",
            path: ["values", i, "routeOpenSeeds"],
            message: `route-open seed ${seed} is not one of the sweep's seeds`,
          });
        }
      }
    });

    let grid: number[];
    try {
      grid = sweepValues(sweep.axis, sweep.from, sweep.to, sweep.step);
    } catch (error) {
      if (!(error instanceof WayfordError)) throw error;
      ctx.addIssue({ code: "custom", path: ["step"], message: error.message });
      return;
    }
    if (sweep.values.length > grid.length) {
      ctx.addIssue({
        code: "custom",
        path: ["values"],
        message: `${sweep.values.length} values, the grid has ${grid.length}`,
      });
    }
    // The values are the grid's first ones, in its order: a sweep stops early, never skips.
    const offGrid = sweep.values.findIndex((row, i) => i < grid.length && row.value !== grid[i]);
    if (offGrid !== -1) {
      ctx.addIssue({
        code: "custom",
        path: ["values", offGrid, "value"],
        message: `value ${offGrid} is ${sweep.values[offGrid]?.value}, the grid has ${grid[offGrid]}`,
      });
    }
    if (sweep.status === "complete" && sweep.values.length < grid.length) {
      ctx.addIssue({
        code: "custom",
        path: ["values"],
        message: `a complete sweep has all ${grid.length} values; this one has ${sweep.values.length}`,
      });
    }

    const boundary = boundaryOf(sweep.values, sweep.seeds.length);
    if (sweep.boundary !== boundary) {
      ctx.addIssue({
        code: "custom",
        path: ["boundary"],
        message: `the boundary is ${boundary}, not ${sweep.boundary}: the first value below 50% from the laxest end, none past an error`,
      });
    }
  });
export type Sweep = z.infer<typeof Sweep>;

/** One value of a stored sweep, as the CLI prints it and the sweep screen draws it. */
export type SweepValue = Sweep["values"][number];
