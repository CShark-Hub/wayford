import { describe, expect, test } from "vitest";
import * as core from "./index.js";
import { hash, rng } from "./random.js";

// The expected numbers were computed outside this module: with bryc's published mulberry32, and
// with an FNV-1a over `TextEncoder` bytes that reproduces the published vectors ("" 0x811c9dc5,
// "a" 0xe40c292c, "foobar" 0xbf9cf968). Any FNV-1a 32-bit tool gives a digest back from the
// string in its comment. Each is written as the 32-bit output over 2^32, which is exact.

const U32 = 2 ** 32;
const ARCHIVE = "main//link:Order archive";

function draws(seed: number, n: number): number[] {
  const next = rng(seed);
  return Array.from({ length: n }, () => next());
}

function shareBelow(p: number, rolls: readonly number[]): number {
  return rolls.filter((rolled) => rolled < p).length / rolls.length;
}

describe("rng", () => {
  test("a seed replays the same numbers forever, which every stored run depends on", () => {
    expect(draws(0, 3)).toEqual([0x4434b462 / U32, 0x00159c37 / U32, 0x39285b08 / U32]);
    expect(draws(424242, 3)).toEqual([0x20f301e8 / U32, 0x3c7f3e58 / U32, 0x2f0b3ebe / U32]);
    expect(draws(U32 - 1, 3)).toEqual([0xe57bf3d3 / U32, 0x3081a5a4 / U32, 0xb7350390 / U32]);
  });

  test("each stream is its own: drawing from one never moves another", () => {
    const first = rng(424242);
    const second = rng(424242);
    first();
    first();
    expect(second()).toBe(0x20f301e8 / U32);
  });

  test("draws stay in [0, 1), so a roll against p = 1 always fires and against p = 0 never", () => {
    let lowest = 1;
    let highest = 0;
    for (const drawn of draws(1, 100_000)) {
      lowest = Math.min(lowest, drawn);
      highest = Math.max(highest, drawn);
    }
    expect(lowest).toBeGreaterThanOrEqual(0);
    expect(highest).toBeLessThan(1);
  });
});

describe("hash", () => {
  test("is the first mulberry32 draw from the FNV-1a digest of the UTF-8 bytes of `seed:key`", () => {
    // fnv1a("424242:main//link:Order archive") = 0x45e2a0b8
    expect(hash(424242, ARCHIVE)).toBe(0x41383512 / U32);
    // fnv1a("0:") = 0x17ed628f
    expect(hash(0, "")).toBe(0xeac996bf / U32);
    // fnv1a("4294967295:navigation:Primary//link:Archive") = 0xdd572760
    expect(hash(U32 - 1, "navigation:Primary//link:Archive")).toBe(0xceb340b8 / U32);
    // Two-, three- and four-byte characters: fnv1a("7:main//link:Zoë ▒ 🦊") = 0xe350fb95
    expect(hash(7, "main//link:Zoë ▒ 🦊")).toBe(0x2bf2ade5 / U32);
  });

  test("gives an element the same roll at every step, whatever was hashed in between", () => {
    const before = hash(424242, ARCHIVE);
    for (let i = 0; i < 100; i++) hash(i, `main//link:Item ${i}`);
    expect(hash(424242, ARCHIVE)).toBe(before);
  });

  test("keeps the seed and the key apart: seed 1 with key 2x is not seed 12 with key x", () => {
    expect(hash(1, "2x")).not.toBe(hash(12, "x"));
  });

  test("an element's rolls over seeds 1 to 1000 fall below p in a share of about p", () => {
    // s1-01 checks Vera's degraded share against the band position over these seeds.
    const rolls = Array.from({ length: 1000 }, (_, i) => hash(i + 1, ARCHIVE));
    for (const p of [0.1, 0.337, 0.5, 0.9]) {
      expect(Math.abs(shareBelow(p, rolls) - p)).toBeLessThanOrEqual(0.05);
    }
  });

  test("elements whose keys differ only at the end roll independently, not in lockstep", () => {
    // FNV-1a alone gave these two links nearly the same roll in every run: both came out below
    // 0.337 in a third of the seeds, where independent rolls do so in about 0.337².
    const p = 0.337;
    const first = "main//link:Order 1041";
    const second = "main//link:Order 1042";
    let both = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      if (hash(seed, first) < p && hash(seed, second) < p) both++;
    }
    expect(Math.abs(both / 1000 - p * p)).toBeLessThanOrEqual(0.05);
  });

  test("the elements of one run get rolls spread over [0, 1), not one shared roll", () => {
    const rolls = Array.from({ length: 1000 }, (_, i) => hash(424242, `main//link:Item ${i}`));
    for (const p of [0.1, 0.337, 0.5, 0.9]) {
      expect(Math.abs(shareBelow(p, rolls) - p)).toBeLessThanOrEqual(0.05);
    }
  });
});

describe("seeds", () => {
  test.each([-1, 1.5, Number.NaN, U32])(
    "%s is refused, not wrapped onto another seed's numbers",
    (seed) => {
      expect(() => rng(seed)).toThrow(RangeError);
      expect(() => hash(seed, ARCHIVE)).toThrow(RangeError);
    },
  );
});

test("both are exported from @wayford/core", () => {
  expect(core.rng).toBe(rng);
  expect(core.hash).toBe(hash);
});
