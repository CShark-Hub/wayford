/**
 * How a sweep reads in a printout: the sweep CLI's table and `seed:demo`'s summary word a value,
 * a rate, the boundary and a wall time the same way (s4-05, s4-07). Pure, so either command and
 * its test can import it without loading agent's runtime.
 */
import { boundaryOf, type SweepAxis, type SweepValue } from "@wayford/core";

/** A value as the table prints it: a contrast ratio with at least one decimal, a cap as it is. */
export function shown(axis: SweepAxis, value: number): string {
  return axis === "contrast" && Number.isInteger(value) ? value.toFixed(1) : String(value);
}

export function percent(successes: number, seeds: number): string {
  return `${Math.round((successes / seeds) * 100)}%`;
}

/** A value's route-open seeds out of all, or "—" for a task with no route table, never 0. */
export function routeOpenShare(row: SweepValue, seeds: number): string {
  return row.routeOpenSeeds === null ? "—" : `${row.routeOpenSeeds.length}/${seeds}`;
}

/**
 * The line under the table: the boundary, else why there is none, from core's `boundaryOf`, as the
 * stored sweep has it. Rows settled before a stop give the same answer.
 */
export function boundaryLine(axis: SweepAxis, rows: readonly SweepValue[], seeds: number): string {
  const boundary = boundaryOf(rows, seeds);
  const at = rows.find((row) => row.value === boundary);
  if (at !== undefined) {
    return `boundary   ${shown(axis, at.value)} (rate ${percent(at.successes, seeds)})`;
  }
  // No boundary and an errored value: `boundaryOf` stopped there.
  const errored = rows.find((row) => row.errors > 0);
  if (errored !== undefined) {
    return `no boundary: ${shown(axis, errored.value)} had errors, so nothing past it is claimed`;
  }
  const last = rows.at(-1);
  return last === undefined
    ? "boundary   none: no value ran"
    : `no boundary up to ${shown(axis, last.value)}`;
}

/** A duration as `4m 07s`. */
export function wallTime(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}
