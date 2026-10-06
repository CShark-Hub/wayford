import { describe, expect, test } from "vitest";
import { WayfordError } from "./error.js";
import { profileFixture, sweepFixtures } from "./fixtures/index.js";
import {
  boundaryOf,
  MAX_SWEEP_VALUES,
  Sweep,
  type SweepAxis,
  sweepPlan,
  sweepValues,
  sweptProfile,
  sweptValueOf,
} from "./sweep.js";

function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return expect.unreachable("expected a throw");
}

function fixture(id: string): Sweep {
  const found = sweepFixtures.find((s) => s.id === id);
  if (!found) throw new Error(`No sweep fixture ${id}`);
  return found;
}

/** A raw document, typed loosely like the JSON it came from, so a test can break any field. */
// biome-ignore lint/suspicious/noExplicitAny: a test edits the raw document field by field.
type Doc = any;

/** A deep copy of a fixture to break. */
function raw(id: string): Doc {
  return JSON.parse(JSON.stringify(fixture(id)));
}

/** The messages of every issue `Sweep` raises on a document. */
function issues(document: unknown): string[] {
  const parsed = Sweep.safeParse(document);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
}

describe("Sweep", () => {
  test("both fixtures parse", () => {
    expect(sweepFixtures.map((s) => s.id)).toEqual(["swp_vera-contrast", "swp_kai-max-elements"]);
    for (const sweep of sweepFixtures) expect(issues(sweep)).toEqual([]);
  });

  test("both fixtures keep the RULES bound: successes never outnumber route-open seeds", () => {
    for (const sweep of sweepFixtures) {
      for (const row of sweep.values) {
        expect(row.successes).toBeLessThanOrEqual(row.routeOpenSeeds?.length ?? 0);
      }
    }
    expect(fixture("swp_vera-contrast").boundary).toBe(3);
  });

  test("a maxElements value or end that is not a whole number is rejected", () => {
    const kai = raw("swp_kai-max-elements");
    kai.from = 4.5;
    expect(Sweep.safeParse(kai).success).toBe(false);
  });

  // Each row breaks one rule of the refine on a fixture that passes.
  type Row = [claim: string, id: string, edit: (doc: Doc) => void, message: RegExp];
  const ROWS: Row[] = [
    [
      "a boundary that disagrees with the values",
      "swp_vera-contrast",
      (doc) => {
        doc.boundary = 3.5;
      },
      /boundary is 3, not 3.5/,
    ],
    [
      "a null boundary where a value falls below 50%",
      "swp_kai-max-elements",
      (doc) => {
        doc.boundary = null;
      },
      /boundary is 10, not null/,
    ],
    [
      "a value off the grid",
      "swp_vera-contrast",
      (doc) => {
        doc.values[1].value = 2.1;
      },
      /value 1 is 2.1, the grid has 2/,
    ],
    [
      "values out of order",
      "swp_kai-max-elements",
      (doc) => {
        doc.values.reverse();
        doc.boundary = 4;
      },
      /value 0 is 4, the grid has 16/,
    ],
    [
      "more values than the grid has",
      "swp_vera-contrast",
      (doc) => {
        doc.values.push({ ...doc.values[6], value: 5 });
      },
      /8 values, the grid has 7/,
    ],
    [
      "route-open seeds the sweep did not run",
      "swp_vera-contrast",
      (doc) => {
        doc.values[3].routeOpenSeeds = [2, 5, 11];
      },
      /route-open seed 11 is not one of the sweep's seeds/,
    ],
    [
      "duplicate seeds",
      "swp_vera-contrast",
      (doc) => {
        doc.seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 9];
        for (const row of doc.values) {
          row.routeOpenSeeds = row.routeOpenSeeds.filter((seed: number) => seed !== 10);
        }
      },
      /seeds are unique; 9 repeats/,
    ],
    [
      "more run ids than seeds",
      "swp_vera-contrast",
      (doc) => {
        doc.values[0].runIds.push("run_swp-vera-15-s11");
      },
      /11 run ids for 10 seeds/,
    ],
    [
      "successes and errors above the runs",
      "swp_vera-contrast",
      (doc) => {
        // After the boundary, so the errors leave it alone.
        doc.values[4].errors = 10;
      },
      /1 successes and 10 errors are more than 10 runs/,
    ],
    [
      "a complete sweep missing a value",
      "swp_kai-max-elements",
      (doc) => {
        doc.values.pop();
      },
      /a complete sweep has all 7 values; this one has 6/,
    ],
  ];
  test.each(ROWS)("rejects %s", (_claim, id, edit, message) => {
    const doc = raw(id);
    edit(doc);
    expect(issues(doc)).toEqual([expect.stringMatching(message)]);
  });

  test("an incomplete sweep may stop after any prefix, or before the first value", () => {
    const kai = raw("swp_kai-max-elements");
    kai.status = "incomplete";
    kai.values = kai.values.slice(0, 3);
    kai.boundary = null;
    expect(issues(kai)).toEqual([]);
    kai.values = [];
    expect(issues(kai)).toEqual([]);
  });
});

describe("sweepValues", () => {
  test("contrast runs upwards, laxest first, whatever order the ends come in", () => {
    const up = [1.5, 2, 2.5, 3, 3.5, 4, 4.5];
    expect(sweepValues("contrast", 1.5, 4.5, 0.5)).toEqual(up);
    expect(sweepValues("contrast", 4.5, 1.5, 0.5)).toEqual(up);
  });

  test("maxElements runs downwards, the highest cap first", () => {
    const down = [16, 14, 12, 10, 8, 6, 4];
    expect(sweepValues("maxElements", 4, 16, 2)).toEqual(down);
    expect(sweepValues("maxElements", 16, 4, 2)).toEqual(down);
  });

  test("a far end off the grid is clipped", () => {
    expect(sweepValues("contrast", 1.5, 4.4, 0.5)).toEqual([1.5, 2, 2.5, 3, 3.5, 4]);
    expect(sweepValues("maxElements", 3, 16, 5)).toEqual([16, 11, 6]);
  });

  test("each value is from + i × step, counted in thousandths, with no drift", () => {
    const values = sweepValues("contrast", 1, 2, 0.1);
    expect(values).toEqual([1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2]);
  });

  test("a sweep runs up to MAX_SWEEP_VALUES values", () => {
    expect(sweepValues("maxElements", 1, MAX_SWEEP_VALUES, 1)).toHaveLength(MAX_SWEEP_VALUES);
  });

  test.each([
    ["a step of 0", "contrast", 1.5, 4.5, 0],
    ["a negative step", "contrast", 1.5, 4.5, -0.5],
    ["a non-integer maxElements step", "maxElements", 4, 16, 1.5],
    ["a non-integer maxElements end", "maxElements", 4.5, 16, 2],
    ["an empty range", "contrast", 3, 3, 0.5],
    ["a contrast end past 21:1", "contrast", 1.5, 25, 0.5],
    ["a cap of 0", "maxElements", 0, 16, 2],
    ["a contrast step finer than a thousandth", "contrast", 1.5, 4.5, 0.0001],
    ["a contrast end off the thousandths", "contrast", 1.0005, 1.0105, 0.001],
    ["a contrast step off the thousandths", "contrast", 1.5, 4.5, 0.0015],
    ["more values than a sweep runs", "contrast", 1, 21, 0.001],
    ["a cap range of billions", "maxElements", 1, 1_000_000_000, 1],
  ] as [string, SweepAxis, number, number, number][])(
    "%s throws invalid_sweep_range",
    (_claim, axis, from, to, step) => {
      const thrown = thrownBy(() => sweepValues(axis, from, to, step));
      expect(thrown).toBeInstanceOf(WayfordError);
      expect(thrown).toHaveProperty("code", "invalid_sweep_range");
    },
  );
});

describe("sweepPlan", () => {
  test("returns the grid once the axis is set on the persona", () => {
    const vera = profileFixture("prof_vera");
    expect(sweepPlan(vera, "contrast", 4.5, 1.5, 0.5)).toEqual([1.5, 2, 2.5, 3, 3.5, 4, 4.5]);
  });

  test.each([
    ["a bad range", "prof_vera", "contrast", 3, 3, 0.5, "invalid_sweep_range"],
    ["contrast on Kai", "prof_kai", "contrast", 1.5, 4.5, 0.5, "sweep_axis_unset"],
  ] as [string, string, SweepAxis, number, number, number, string][])(
    "refuses %s",
    (_claim, profileId, axis, from, to, step, code) => {
      const thrown = thrownBy(() => sweepPlan(profileFixture(profileId), axis, from, to, step));
      expect(thrown).toBeInstanceOf(WayfordError);
      expect(thrown).toHaveProperty("code", code);
    },
  );
});

describe("boundaryOf", () => {
  const rows = (successes: number[], errors: number[] = []) =>
    successes.map((s, i) => ({ value: 1 + i, successes: s, errors: errors[i] ?? 0 }));

  test("strictly below 50%: 5 of 10 is not a boundary, 4 of 10 is", () => {
    expect(boundaryOf(rows([10, 5, 5]), 10)).toBeNull();
    expect(boundaryOf(rows([10, 5, 4]), 10)).toBe(3);
  });

  test("a dip that recovers is still the boundary", () => {
    expect(boundaryOf(rows([9, 3, 8, 2]), 10)).toBe(2);
  });

  test("no value below 50% gives null, and so does no value at all", () => {
    expect(boundaryOf(rows([10, 9, 7]), 10)).toBeNull();
    expect(boundaryOf([], 10)).toBeNull();
  });

  test("an errored value before any dip gives null", () => {
    expect(boundaryOf(rows([9, 8, 2], [0, 1, 0]), 10)).toBeNull();
  });

  test("an errored value after the boundary does not change it", () => {
    expect(boundaryOf(rows([9, 3, 0], [0, 0, 1]), 10)).toBe(2);
  });

  test("a value both under 50% and errored gives null: errors are checked first", () => {
    expect(boundaryOf(rows([9, 3, 0], [0, 1, 0]), 10)).toBeNull();
  });
});

describe("sweptValueOf and sweptProfile", () => {
  const vera = profileFixture("prof_vera");
  const kai = profileFixture("prof_kai");
  const ada = profileFixture("prof_ada");

  test("sweptValueOf reads the field an axis names", () => {
    expect(sweptValueOf(vera, "contrast")).toBe(3);
    expect(sweptValueOf(vera, "maxElements")).toBe(20);
    expect(sweptValueOf(kai, "contrast")).toBeUndefined();
    expect(sweptValueOf(ada, "maxElements")).toBeUndefined();
  });

  test("contrast on a persona with no contrast threshold throws sweep_axis_unset", () => {
    const thrown = thrownBy(() => sweptProfile(kai, "contrast", 3));
    expect(thrown).toBeInstanceOf(WayfordError);
    expect(thrown).toHaveProperty("code", "sweep_axis_unset");
  });

  test("maxElements sets a cap on Ada, who has none", () => {
    expect(sweptProfile(ada, "maxElements", 12).behaviour.maxElements).toBe(12);
  });

  test("only the swept field changes, and the input is left alone", () => {
    const before = structuredClone(vera);
    const contrast = sweptProfile(vera, "contrast", 2);
    expect({
      ...contrast,
      perception: {
        ...contrast.perception,
        contrast: { ...contrast.perception.contrast, threshold: 3 },
      },
    }).toEqual(vera);
    const cap = sweptProfile(kai, "maxElements", 4);
    expect({ ...cap, behaviour: { ...cap.behaviour, maxElements: 11 } }).toEqual(kai);
    expect(vera).toEqual(before);
  });

  test("a value the profile cannot hold is rejected by Profile", () => {
    expect(() => sweptProfile(vera, "contrast", 0.5)).toThrow();
    expect(() => sweptProfile(kai, "maxElements", 2.5)).toThrow();
  });
});
