/**
 * What a stored sweep says, for the Boundary screen's headline, lead and chart: a boundary, no
 * boundary in range, a walk stopped at an errored value, or nothing measured yet.
 *
 * The walk is core's `boundaryOf`, never copied here. The `Sweep` schema checks `sweep.boundary`
 * against it, so a parsed sweep's boundary is trusted as stored, and the rest follows from how
 * `boundaryOf` returns null: at the first error only when no value before it fell under half, else
 * at the end with none under half. The denominator is the seed set, as `boundaryOf` counts.
 */
import type { Sweep, SweepValue } from "@wayford/core";

/** One sweep's reading. A stopped sweep claims nothing past its row; `none` and `empty` never stop. */
export type SweepReading =
  /** `row` is the value `sweep.boundary` names. */
  | { kind: "boundary"; row: SweepValue }
  /** No boundary, and `row` is the first value with an error, where `boundaryOf` stopped. */
  | { kind: "stopped"; row: SweepValue }
  /** No boundary and no error: half or more got through at every stored value, up to `last`. */
  | { kind: "none"; last: SweepValue }
  /** No value stored yet: an incomplete sweep. */
  | { kind: "empty" };

/** The reading of a parsed sweep. Throws only for a boundary that names no stored row, a bug. */
export function readSweep(sweep: Sweep): SweepReading {
  if (sweep.boundary !== null) {
    const row = sweep.values.find((value) => value.value === sweep.boundary);
    if (row === undefined) {
      throw new Error(`${sweep.id}: the boundary ${sweep.boundary} is not a stored value`);
    }
    return { kind: "boundary", row };
  }
  const errored = sweep.values.find((value) => value.errors > 0);
  if (errored !== undefined) return { kind: "stopped", row: errored };
  const last = sweep.values.at(-1);
  return last === undefined ? { kind: "empty" } : { kind: "none", last };
}

/** Rows the chart may draw: up to and including a stopped row, else all of them. */
export function claimedRows(sweep: Sweep, reading: SweepReading): SweepValue[] {
  if (reading.kind !== "stopped") return [...sweep.values];
  const stop = sweep.values.findIndex((value) => value.value === reading.row.value);
  return sweep.values.slice(0, stop + 1);
}

/** Got through over the seed set, and route open, or null with no route table. */
export function shares(
  sweep: Sweep,
  row: SweepValue,
): { through: number; routeOpen: number | null } {
  const seeds = sweep.seeds.length;
  return {
    through: row.successes / seeds,
    routeOpen: row.routeOpenSeeds === null ? null : row.routeOpenSeeds.length / seeds,
  };
}
