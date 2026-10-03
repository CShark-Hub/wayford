import { Sampling } from "@wayford/core";
import { describe, expect, test } from "vitest";
import { providerSeedFor } from "./actor-backend.js";

describe("providerSeedFor", () => {
  test("is an integer from 0 to 2^31 - 1, which core's Sampling takes as a provider seed", () => {
    // Both ends of `Seed`, and the seed whose provider seed is pinned below.
    for (const seed of [0, 7, 2 ** 32 - 1]) {
      const providerSeed = providerSeedFor(seed);
      expect(Sampling.parse({ temperature: 1, providerSeed }).providerSeed).toBe(providerSeed);
    }
  });

  test("a seed gives the same provider seed forever, which every stored run depends on", () => {
    // Pinned, because a change moves the provider seed of every stored run: a replay would send
    // its calls another seed than its `actorSampling` records. Computed outside this module, as
    // floor(hash(7, "provider-seed") × 2^31) with FNV-1a and one mulberry32 step.
    expect(providerSeedFor(7)).toBe(935629358);
  });

  test("seeds 1 and 2 send different provider seeds", () => {
    expect(providerSeedFor(1)).not.toBe(providerSeedFor(2));
  });
});
