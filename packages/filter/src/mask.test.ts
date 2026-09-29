/**
 * `maskName` against "The mask" (`docs/RULES.md` as open PR #112 writes it) and the task's line:
 * a pure function of the run seed, the key and the name, at least one character masked, never
 * all of them, the share from its own draw and never from the element's roll.
 */
import { hash } from "@wayford/core";
import { describe, expect, test } from "vitest";
import { MASK_GLYPH, maskName } from "./mask.js";

const NAMES = [
  "Order archive",
  "ab",
  "a b",
  "Zoë",
  "Help",
  "Go 🚀 now",
  "𝒜𝒷𝒸",
  "  padded  ",
  "Leave with a neighbour if I am out",
  "1 parcel in transit, expected Friday between 10:00 and 14:00.",
];
const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const keyOf = (name: string) => `main//link:${name}`;

const isSpace = (char: string) => /\s/u.test(char);
const maskableCount = (name: string) => [...name].filter((char) => !isSpace(char)).length;
const maskedCount = (masked: string) => [...masked].filter((char) => char === MASK_GLYPH).length;

/** Every (name, run seed) pair, with the masked name. */
const CASES = NAMES.flatMap((name) =>
  SEEDS.map((seed) => ({ name, seed, masked: maskName(seed, keyOf(name), name) })),
);

describe("the masked name", () => {
  test("is the same for the same run seed, key and name", () => {
    for (const { name, seed, masked } of CASES) {
      expect(maskName(seed, keyOf(name), name)).toBe(masked);
    }
  });

  // Part of the record: a stored run's `maskedName` was drawn with this algorithm, so a change to
  // it changes every past mask.
  test("is pinned", () => {
    const key = keyOf("Order archive");
    expect(maskName(1, key, "Order archive")).toBe("Or▒▒r ▒▒▒hive");
    expect(maskName(3, key, "Order archive")).toBe("Or▒er archive");
  });

  test("is seeded: run seeds give different masks", () => {
    const masks = (name: string) => new Set(SEEDS.map((seed) => maskName(seed, keyOf(name), name)));
    expect(masks("Order archive").size).toBeGreaterThan(1);
    // One of two characters is masked, and which one follows the run seed.
    expect(masks("ab")).toEqual(new Set([`${MASK_GLYPH}b`, `a${MASK_GLYPH}`]));
  });

  test("masks at least one character and never all of them", () => {
    for (const { name, seed, masked } of CASES) {
      const count = maskedCount(masked);
      expect(count, `${name} at run seed ${seed}`).toBeGreaterThanOrEqual(1);
      expect(count, `${name} at run seed ${seed}`).toBeLessThanOrEqual(maskableCount(name) - 1);
    }
  });

  test("masks every count from 1 to n − 1 over run seeds", () => {
    const name = "Order archive";
    const counts = new Set(SEEDS.map((seed) => maskedCount(maskName(seed, keyOf(name), name))));
    expect([...counts].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  test("keeps every whitespace and every unmasked character in place", () => {
    const moved = CASES.filter(({ name, masked }) => {
      const chars = [...name];
      const out = [...masked];
      const kept = (char: string, i: number) => {
        const original = chars[i] ?? "";
        return char === original || (char === MASK_GLYPH && !isSpace(original));
      };
      return out.length !== chars.length || !out.every(kept);
    });
    expect(moved).toEqual([]);
  });

  test("never splits an astral character into a lone surrogate", () => {
    for (const { masked } of CASES) {
      expect(masked).not.toMatch(/\p{Cs}/u);
    }
    // The rocket is code point 3 of "Go 🚀 now", and some run seeds mask it while others keep it.
    const name = "Go 🚀 now";
    const rocket = new Set(SEEDS.map((seed) => [...maskName(seed, keyOf(name), name)][3]));
    expect(rocket).toEqual(new Set(["🚀", MASK_GLYPH]));
  });

  test("masks a one-character name whole", () => {
    for (const seed of SEEDS) {
      expect(maskName(seed, keyOf("a"), "a")).toBe(MASK_GLYPH);
      expect(maskName(seed, keyOf("🚀"), "🚀")).toBe(MASK_GLYPH);
      expect(maskName(seed, keyOf(" x "), " x ")).toBe(` ${MASK_GLYPH} `);
    }
  });

  test("returns an empty or whitespace-only name unchanged", () => {
    for (const seed of SEEDS) {
      for (const name of ["", "   ", "\t\n "]) {
        expect(maskName(seed, keyOf(name), name)).toBe(name);
      }
    }
  });
});

describe("the mask draw", () => {
  const name = "Order archive";
  const key = keyOf(name);
  const n = maskableCount(name);
  const seeds = Array.from({ length: 1000 }, (_, i) => i + 1);
  const count = (seed: number) => maskedCount(maskName(seed, key, name));
  const fromDraw = (draw: number) => 1 + Math.floor(draw * (n - 1));

  test("sets the masked count: 1 + floor(hash(run seed, key + ':mask') × (n − 1))", () => {
    for (const seed of seeds) {
      expect(count(seed), `run seed ${seed}`).toBe(fromDraw(hash(seed, `${key}:mask`)));
    }
  });

  test("is not the element's roll, hash(run seed, key)", () => {
    expect(seeds.some((seed) => count(seed) !== fromDraw(hash(seed, key)))).toBe(true);
    const r = correlation(
      seeds.map(count),
      seeds.map((seed) => hash(seed, key)),
    );
    expect(Math.abs(r)).toBeLessThan(0.2);
  });

  test("picks the positions with the lowest per-position draws", () => {
    for (const seed of SEEDS) {
      const chars = [...name];
      const lowest = chars
        .flatMap((char, i) => (isSpace(char) ? [] : [{ i, draw: hash(seed, `${key}:mask:${i}`) }]))
        .sort((a, b) => a.draw - b.draw)
        .slice(0, count(seed))
        .map(({ i }) => i);
      const expected = chars.map((char, i) => (lowest.includes(i) ? MASK_GLYPH : char)).join("");
      expect(maskName(seed, key, name), `run seed ${seed}`).toBe(expected);
    }
  });
});

/** Pearson's r of two equally long series. */
function correlation(xs: readonly number[], ys: readonly number[]): number {
  const mean = (vs: readonly number[]) => vs.reduce((sum, v) => sum + v, 0) / vs.length;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  xs.forEach((x, i) => {
    const dx = x - mx;
    const dy = (ys[i] ?? 0) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  });
  return sxy / Math.sqrt(sxx * syy);
}
