import { renderObservationForModel, rng, Sampling, toActorObservation } from "@wayford/core";
import { observationFixture } from "@wayford/core/fixtures";
import { describe, expect, test } from "vitest";
import { actorTurn, decisionDrawFor, providerSeedFor } from "./actor-backend.js";

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

describe("decisionDrawFor", () => {
  /** The first `count` values of a stream. */
  const first = (draw: () => number, count: number) => Array.from({ length: count }, draw);

  test("a seed gives the same values forever, which every stored Jev run depends on", () => {
    // Pinned, because a change moves the rolled value of every stored decision, and a replay would
    // draw other actions than its records hold. Computed outside this module, as
    // rng(floor(hash(7, "decision-draw") × 2^32)), its first three draws.
    expect(first(decisionDrawFor(7), 3)).toStrictEqual([
      0.3150290888734162, 0.19968862901441753, 0.7065585581585765,
    ]);
  });

  test("seeds 1 and 2 roll different first values", () => {
    expect(decisionDrawFor(1)()).not.toBe(decisionDrawFor(2)());
  });

  test("is a stream of its own, never the behaviour stream rng(seed) (ADR 0001 §3)", () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(decisionDrawFor(seed)(), `seed ${seed}`).not.toBe(rng(seed)());
    }
    // Past the first value too, and not the behaviour stream a few draws on: the two share no
    // value, so the behaviour dice are the same whichever backend runs.
    const decisions = first(decisionDrawFor(7), 10);
    const behaviour = first(rng(7), 10);
    expect(decisions.filter((value) => behaviour.includes(value))).toStrictEqual([]);
  });
});

describe("actorTurn", () => {
  test("carries the observation its page text renders, for a backend that offers the elements", () => {
    // The fixture's `/deliveries` page as the Actor was shown it.
    const deliveries = toActorObservation(observationFixture);

    const turn = actorTurn("you want to see a past order", deliveries, []);

    expect(turn.observation).toBe(deliveries);
    expect(turn.observationText).toBe(renderObservationForModel(deliveries));
  });
});
