/**
 * Test support for filter's own tests, never exported from the barrel and never reached from
 * `./perceive`: the persona ids, run seeds, what the Actor reads, an observed element by key, a
 * persona with its attention cap changed, and K1 and K4 on the kebab. The fixture tests and the
 * browser tests share it, as io's tests share `test-app.ts`.
 */
import {
  type FullObservation,
  type Profile,
  renderObservationForModel,
  toActorObservation,
} from "@wayford/core";

/** The five personas, in `profileFixtures` order. */
export const PERSONA_IDS = ["prof_ada", "prof_kai", "prof_milo", "prof_vera", "prof_zoya"];

/** Run seeds 1 to `count`. */
export const seeds = (count: number) => Array.from({ length: count }, (_, i) => i + 1);

export const actorText = (full: FullObservation) =>
  renderObservationForModel(toActorObservation(full));

/** The keys of the shown elements, in evidence order. */
export const shownKeys = (full: FullObservation) =>
  full.elements.filter((e) => e.state !== "invisible").map((e) => e.key);

export function observed(full: FullObservation, key: string) {
  const found = full.elements.find((e) => e.key === key);
  if (!found) throw new Error(`No observed element ${key}`);
  return found;
}

/** The persona with its attention cap set to `maxElements`, or unset. */
export function withCap(profile: Profile, maxElements: number | undefined): Profile {
  const copy = structuredClone(profile);
  if (maxElements === undefined) delete copy.behaviour.maxElements;
  else copy.behaviour.maxElements = maxElements;
  return copy;
}

/** Stage 4 on the kebab, for a persona that does not know the pattern. */
export const K1_K4 = [
  { stage: "knowledge", rule: "K1", pattern: "kebab" },
  { stage: "knowledge", rule: "K4", pattern: "kebab" },
];
