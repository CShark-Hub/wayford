/**
 * `judgeCut` against `docs/RULES.md`, "Thresholds, bands and the roll". The rows are the ones
 * core's fixture oracle checks (`packages/core/src/fixtures/perception.test.ts`), so the filter
 * and the fixtures are each held to RULES, never to each other.
 */
import { profileFixture } from "@wayford/core/fixtures";
import { describe, expect, test, vi } from "vitest";
import { type CutOutcome, judgeCut } from "./band.js";

const degraded = (rolled: number): CutOutcome => ({ state: "degraded", rolled });
const missed = (rolled: number): CutOutcome => ({ state: "invisible", rolled });
const cut: CutOutcome = { state: "invisible" };

describe("the band arithmetic of docs/RULES.md", () => {
  type Row = [
    claim: string,
    value: number,
    threshold: number,
    softness: number | undefined,
    rolled: number,
    outcome: CutOutcome | undefined,
  ];
  const ROWS: Row[] = [
    ["a value on the threshold is visible", 3, 3, 0.5, 0, undefined],
    ["a value above the threshold is visible", 3.5, 3, 0.5, 0, undefined],
    ["a hard cut never degrades", 15, 16, undefined, 0, cut],
    ["softness 0 is a hard cut", 2.9, 3, 0, 0, cut],
    ["below the floor is invisible", 1.49, 3, 0.5, 0, missed(0)],
    ["on the floor the position is 0, so no roll degrades", 1.5, 3, 0.5, 0, missed(0)],
    // Softness 0.25, where 1 − softness and softness differ: the floor is 3, not 1.
    ["the floor is threshold × (1 − softness)", 2.5, 4, 0.25, 0, missed(0)],
    // Exactly representable: floor 2, position 0.5, so the comparison is exact.
    ["a roll below the position degrades", 3, 4, 0.5, 0.49, degraded(0.49)],
    ["a roll equal to the position does not", 3, 4, 0.5, 0.5, missed(0.5)],
    ["a roll above the position does not", 3, 4, 0.5, 0.51, missed(0.51)],
    ["the worked example, position 0.337, degrades at 0.33", 2.006, 3, 0.5, 0.33, degraded(0.33)],
    ["the worked example, position 0.337, is missed at 0.34", 2.006, 3, 0.5, 0.34, missed(0.34)],
    // Softness 1 puts the floor at 0, so the position is value / threshold: 1 / 4 = 0.25.
    ["softness 1 puts the floor at 0", 1, 4, 1, 0.24, degraded(0.24)],
    ["softness 1, a roll equal to the position does not", 1, 4, 1, 0.25, missed(0.25)],
  ];
  test.each(ROWS)("%s", (_claim, value, threshold, softness, rolled, outcome) => {
    expect(judgeCut(value, { threshold, softness }, () => rolled)).toStrictEqual(outcome);
  });
});

describe("the roll", () => {
  test("is not drawn when the value passes", () => {
    const roll = vi.fn(() => 0);
    expect(judgeCut(3, { threshold: 3, softness: 0.5 }, roll)).toBeUndefined();
    expect(judgeCut(8, { threshold: 3 }, roll)).toBeUndefined();
    expect(roll).not.toHaveBeenCalled();
  });

  test("is not drawn on a hard cut, which stores none", () => {
    const roll = vi.fn(() => 0);
    expect(judgeCut(2, { threshold: 3 }, roll)).toStrictEqual(cut);
    expect(judgeCut(2, { threshold: 3, softness: 0 }, roll)).toStrictEqual(cut);
    expect(judgeCut(2, { threshold: 3, softness: undefined }, roll)).toStrictEqual(cut);
    expect(roll).not.toHaveBeenCalled();
  });

  test.each([
    ["in the band", 2.5],
    ["below the floor", 1],
  ])("is drawn once on a soft failure %s, and returned", (_where, value) => {
    const roll = vi.fn(() => 0.7);
    const outcome = judgeCut(value, { threshold: 3, softness: 0.5 }, roll);
    expect(roll).toHaveBeenCalledTimes(1);
    expect(outcome?.rolled).toBe(0.7);
  });
});

describe("a profile's thresholds", () => {
  // Vera: contrast 3.0 with softness 0.5, a hard 16 px font cut, a hard 32 px target cut.
  const { contrast, fontPx, targetPx } = profileFixture("prof_vera").perception;
  if (!contrast || !fontPx || !targetPx) throw new Error("Vera sets all three thresholds");

  test("are passed as the profile stores them", () => {
    expect(judgeCut(2.006, contrast, () => 0.33)).toStrictEqual(degraded(0.33));
    expect(judgeCut(2.006, contrast, () => 0.34)).toStrictEqual(missed(0.34));
    // 16 px passes her 16 px cut, since `>=` passes.
    expect(judgeCut(16, fontPx, () => 0)).toBeUndefined();
    expect(judgeCut(22, targetPx, () => 0)).toStrictEqual(cut);
  });
});
