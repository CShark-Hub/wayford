/**
 * Test data, Node only: this file imports `@wayford/core/fixtures`, which reads its files with
 * `node:fs`, so no screen may import it. The Boundary screen's tests and the self-check share it:
 * the two stored sweeps, Vera's on contrast and Kai's on attention, and the variants of Vera's that
 * the tests read.
 *
 * The fixtures hold neither a sweep without a boundary nor one stopped at an error. Both are built
 * from Vera's through `Sweep.parse`, as every variant here is, so the schema's check of the
 * boundary keeps them honest.
 */
import { Sweep } from "@wayford/core";
import { sweepFixtures } from "@wayford/core/fixtures";

/** One fixture sweep by id. */
export function fixtureSweep(id: string): Sweep {
  const found = sweepFixtures.find((sweep) => sweep.id === id);
  if (found === undefined) throw new Error(`No sweep fixture ${id}`);
  return found;
}

const vera = fixtureSweep("swp_vera-contrast");

/**
 * An error at 2.5, before 3.0 falls under half: `boundaryOf` stops there. 4.0 errors too. `errors`
 * is how many runs errored at 2.5.
 */
export function stoppedSweep(errors = 1): Sweep {
  return Sweep.parse({
    ...vera,
    values: vera.values.map((row) => (row.value === 2.5 ? { ...row, errors } : row)),
    boundary: null,
  });
}

/** The fixture sweeps, and the variants of Vera's the tests read, by name. */
export const fixtureSweeps = {
  vera,
  kai: fixtureSweep("swp_kai-max-elements"),

  /**
   * Half or more through at every value, and no error: no boundary in range. Every seed keeps a
   * route open, since no more runs get through than had one (`docs/PLAN.md` F9 AC5).
   */
  noBoundary: Sweep.parse({
    ...vera,
    values: vera.values.map((row) => ({
      ...row,
      successes: Math.max(row.successes, 5),
      errors: 0,
      routeOpenSeeds: vera.seeds,
    })),
    boundary: null,
  }),

  /** One run errored at 2.5. See `stoppedSweep`. */
  stopped: stoppedSweep(),

  /** Vera's sweep on a goal with no route table. */
  noRoutes: Sweep.parse({
    ...vera,
    values: vera.values.map((row) => ({ ...row, routeOpenSeeds: null })),
  }),

  /** Stored after its first three values: the grid still holds seven. */
  incomplete: Sweep.parse({
    ...vera,
    status: "incomplete",
    values: vera.values.slice(0, 3),
    boundary: null,
  }),

  /** Stored before its first value finished. */
  empty: Sweep.parse({ ...vera, status: "incomplete", values: [], boundary: null }),
};
