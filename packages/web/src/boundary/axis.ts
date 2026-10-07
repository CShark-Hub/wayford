/**
 * How the Boundary screen names a sweep's axis and writes its values: the two demo presets, Vera on
 * `contrast` and Kai on `maxElements` (`docs/DEMO.md` beat 6), the value formats, the axis copy and
 * the meta line's range and seeds.
 *
 * Prose drops a trailing `.0` ("3:1"); the chart and the table keep the grid's precision ("3.0:1"),
 * as `docs/design/screens/boundary.html` writes them. A cap is a plain integer everywhere.
 */
import { type ProfileId, type Sweep, type SweepAxis, sweepValues } from "@wayford/core";

/** The two demo presets, by axis: each opens the latest stored sweep of its persona on its axis. */
export const BOUNDARY_PRESETS = {
  contrast: { profileId: "prof_vera", axis: "contrast" },
  maxElements: { profileId: "prof_kai", axis: "maxElements" },
} as const satisfies Record<SweepAxis, { profileId: ProfileId; axis: SweepAxis }>;

/** A value in prose: contrast in its shortest form with `:1` ("3:1", "2.5:1"), a cap as is ("10"). */
export function proseValue(axis: SweepAxis, value: number): string {
  switch (axis) {
    case "contrast":
      return `${value}:1`;
    case "maxElements":
      return String(value);
    default:
      return axis satisfies never;
  }
}

/**
 * A value on the chart and in the table: contrast on the grid's precision ("3.0:1", or "3.0"
 * without the unit), a cap as is ("10").
 */
export function gridValue(sweep: Sweep, value: number, unit = true): string {
  switch (sweep.axis) {
    case "contrast": {
      const fixed = value.toFixed(gridDecimals(sweep));
      return unit ? `${fixed}:1` : fixed;
    }
    case "maxElements":
      return String(value);
    default:
      return sweep satisfies never;
  }
}

/** The values a sweep runs, laxest first, over its whole range, stored or not (`sweepValues`). */
export function gridOf(sweep: Sweep): number[] {
  return sweepValues(sweep.axis, sweep.from, sweep.to, sweep.step);
}

/**
 * The most decimals any value of the sweep's full grid needs, at least 1 and at most 3: contrast
 * values sit on whole thousandths. The grid starts at the lower end whatever order `from` and `to`
 * come in, so a range given strict end first reads the same.
 */
function gridDecimals(sweep: Sweep): number {
  return Math.min(3, Math.max(1, ...gridOf(sweep).map(decimalsOf)));
}

/** The digits after the point in a number's shortest form: 1.25 has 2, 3 has 0. */
function decimalsOf(value: number): number {
  return String(value).split(".")[1]?.length ?? 0;
}

/** How each axis reads on the screen. */
export const AXIS_COPY: Record<
  SweepAxis,
  {
    /** The swept field in prose. */
    name: string;
    /** The axis switch's label, beside the preset's persona. */
    switchLabel: string;
    /** The chart's x title for `persona`. */
    xTitle: (persona: string) => string;
    /** The word after a prose value: none for contrast, whose value carries `:1`. */
    unit: string;
  }
> = {
  contrast: {
    name: "contrast threshold",
    switchLabel: "contrast",
    xTitle: (persona) => `${persona}'s contrast threshold, x:1`,
    unit: "",
  },
  maxElements: {
    name: "attention cap",
    switchLabel: "attention",
    xTitle: (persona) => `${persona}'s attention cap, elements`,
    unit: "elements",
  },
};

/** The meta line's range: the axis and its grid's ends, laxest first, "contrast 1.5–4.5:1". */
export function rangeLabel(sweep: Sweep): string {
  const grid = gridOf(sweep);
  const laxest = grid[0] ?? sweep.from;
  const strictest = grid.at(-1) ?? sweep.to;
  return `${sweep.axis} ${gridValue(sweep, laxest, false)}–${gridValue(sweep, strictest)}`;
}

/**
 * "seeds 1–10" when the seeds run on, ascending; "seeds 1, 3, 7" when not; "seed 4" for one. A
 * parsed `Sweep` holds at least one seed.
 */
export function seedsLabel(seeds: Sweep["seeds"]): string {
  if (seeds.length === 1) return `seed ${seeds[0]}`;
  const runsOn = seeds.every((seed, i) => i === 0 || seed - 1 === seeds[i - 1]);
  return runsOn ? `seeds ${seeds[0]}–${seeds.at(-1)}` : `seeds ${seeds.join(", ")}`;
}
