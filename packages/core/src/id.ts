/**
 * New ids: an entity's prefix from `ID_PREFIXES` and a lowercase ULID,
 * `task_01k6h3q8z1x7v2c9m4n5p6r7s8` (`docs/STACK.md`, "Ids").
 *
 * `Date.now()` here is a timestamp, never a decision (`docs/CONVENTIONS.md`, "Determinism rules").
 * The random part comes from `crypto.getRandomValues`, not from `Math.random` and not from a run's
 * seed: an id names a thing and decides nothing, and two runs of one seed are still two runs.
 */
import { ID_PREFIXES } from "./primitives.js";

export type IdEntity = keyof typeof ID_PREFIXES;

/** Crockford base32 in lowercase, which leaves out i, l, o and u. */
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/** `<prefix>_<ulid>`: `newId("task")` gives "task_01k6h3q8z1x7v2c9m4n5p6r7s8". */
export function newId(entity: IdEntity): string {
  return `${ID_PREFIXES[entity]}_${timePart(Date.now())}${randomPart()}`;
}

/** The time in ms as 10 characters, most significant first, so ids sort by it as strings. */
function timePart(ms: number): string {
  let rest = ms;
  let chars = "";
  for (let i = 0; i < 10; i++) {
    chars = ALPHABET.charAt(rest % 32) + chars;
    rest = Math.floor(rest / 32);
  }
  return chars;
}

/** 16 characters of 5 random bits each. 256 is a multiple of 32, so each one is uniform. */
function randomPart(): string {
  // `crypto` is a global in Node and in every browser, but filter's `tsconfig.perceive.json`
  // compiles core with no DOM and no Node types, so nothing declares it there. Read through one
  // cast, at call time.
  const crypto = (
    globalThis as unknown as { crypto: { getRandomValues(array: Uint8Array): Uint8Array } }
  ).crypto;
  let chars = "";
  for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
    chars += ALPHABET.charAt(byte & 31);
  }
  return chars;
}
