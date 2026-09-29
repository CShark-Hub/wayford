/**
 * The name a `degraded` element shows the Actor: seen, but not read whole. Some of its characters
 * become `MASK_GLYPH`, which `toActorObservation` shows in place of the real name.
 *
 * This follows "The mask" as open PR #112 writes it into `docs/RULES.md`. Every number is a `hash`
 * of the run seed and the element key, so the masked name is a pure function of the run seed,
 * the key and the name: the element shows the same mask at every step of a run, and a stored run
 * gives it back.
 *
 * - The share masked is its own draw, `hash(run seed, key + ":mask")`, never the element's
 *   `rolled`. An element is degraded only when `rolled < position`, so reusing the roll would
 *   give the one nearest the band floor, the hardest to see, only ever a light mask.
 * - The maskable characters are the name's code points that are not whitespace, `n` of them.
 *   Iterating by code point keeps an astral character whole: it is masked or kept, never split
 *   into a lone surrogate. Whitespace stays, so the word breaks still show.
 * - For `n >= 2`, `k = 1 + floor(share × (n − 1))` are masked: at least one, never all.
 * - Which `k`: the maskable code point at index `i` of the name draws
 *   `hash(run seed, key + ":mask:" + i)`, and the `k` lowest draws are masked, ties by index.
 * - "At least one, never all" cannot both hold below two characters. A one-character name is
 *   masked whole, since a degraded name must not read whole. An empty or whitespace-only name has
 *   nothing to mask and comes back unchanged.
 * - Each masked code point becomes one glyph, so the name keeps its length in code points.
 */
import { hash, type Seed } from "@wayford/core";

/** U+2592 MEDIUM SHADE, the glyph the core fixtures mask with (`Ar▒▒ive`). */
export const MASK_GLYPH = "▒";

const WHITESPACE = /\s/u;

export function maskName(runSeed: Seed, key: string, name: string): string {
  const chars = [...name];
  const maskable = chars.flatMap((char, i) => (WHITESPACE.test(char) ? [] : [i]));
  const n = maskable.length;
  if (n === 0) return name;
  const k = n === 1 ? 1 : 1 + Math.floor(hash(runSeed, `${key}:mask`) * (n - 1));
  const masked = new Set(
    maskable
      .map((i) => ({ i, draw: hash(runSeed, `${key}:mask:${i}`) }))
      .sort((a, b) => a.draw - b.draw || a.i - b.i)
      .slice(0, k)
      .map(({ i }) => i),
  );
  return chars.map((char, i) => (masked.has(i) ? MASK_GLYPH : char)).join("");
}
