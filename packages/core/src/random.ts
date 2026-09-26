/**
 * The seeded randomness every decision in a run draws from (`docs/CONVENTIONS.md`, "Determinism
 * rules"). No decision draws from anything else: `pnpm lint` rejects `Math.random` in every
 * package (`biome-plugins/no-math-random.grit`).
 *
 * Two functions, for two kinds of draw:
 *
 * - `rng(seed)` is a stream: each call gives the next number, so the order of draws matters.
 *   For draws taken in sequence, such as the parts of an avatar.
 * - `hash(seed, key)` gives one number per key, whatever was drawn before it. Perception calls it
 *   with the run seed and the element key, so an element keeps its roll at every step of a run
 *   (`docs/RULES.md`, "The roll").
 *
 * Both give numbers in [0, 1), so a roll `rolled < p` always fires at p = 1 and never at p = 0.
 * Both are plain 32-bit integer arithmetic, with no clock, no platform API and no state shared
 * between calls, so Node and a browser give the same numbers.
 *
 * The algorithms are part of the record: a stored run is reproduced from its seed alone, so a
 * change to either one changes every past decision. The tests pin their output.
 */
import { Seed } from "./primitives.js";

/** 2^32, which turns a 32-bit unsigned integer into a number in [0, 1). */
const U32 = 2 ** 32;

/**
 * mulberry32 (Tommy Ettinger, in the form bryc published): a 32-bit state advanced by a constant
 * and scrambled on every draw. The same seed gives the same sequence.
 */
export function rng(seed: Seed): () => number {
  let state = checked(seed);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / U32;
  };
}

/**
 * FNV-1a 32-bit over the UTF-8 bytes of `${seed}:${key}`, then the first draw of `rng` seeded
 * with that digest. The seed is written in decimal, which has no colon, so two different
 * (seed, key) pairs never hash the same text.
 *
 * The draw is needed. FNV-1a alone gives keys that differ only at the end nearly the same number:
 * the links of a list ("Order 1041", "Order 1042") would be seen or missed together in every run.
 * A roll can still be checked by hand, with any FNV-1a tool and then one mulberry32 step.
 */
export function hash(seed: Seed, key: string): number {
  return rng(fnv1a(`${checked(seed)}:${key}`))();
}

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (const byte of utf8(text)) {
    h = Math.imul(h ^ byte, 0x01000193);
  }
  return h >>> 0;
}

/** The 32-bit arithmetic would wrap a seed outside `Seed` onto another seed's numbers. */
function checked(seed: Seed): Seed {
  if (!Seed.safeParse(seed).success) {
    throw new RangeError(`a seed is an integer from 0 to 4294967295, got ${seed}`);
  }
  return seed;
}

/**
 * UTF-8 without `TextEncoder`, which `filter` and `agent` cannot see: they compile core with no
 * DOM and no Node types. A lone surrogate is encoded like any other code point, not replaced, so
 * two different keys never become the same bytes.
 */
function utf8(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}
