/**
 * Stage 4, knowledge: K2 vocabulary (`docs/RULES.md`, stage 4). A term on the target app's jargon
 * list that the persona does not know reads as `[unfamiliar term]`.
 *
 * Deterministic, no dice: the persona either knows a term or does not. A term is known when the
 * vocabulary, case-folded, holds the whole term, or holds every whitespace-separated word of it.
 * Each unknown term is matched whole and case-insensitively, as core's `wholeTerm` matches. The
 * name is read once, left to right: at each place in the name, longer terms are tried first,
 * terms of equal length in the list's order, and replaced text is never matched again, so a word
 * inside a masked phrase is not masked twice. A blank term is ignored. The rest of the name stays
 * as written.
 *
 * `vocabularyMatcher` does the per-persona work once (the known set, the unknown terms in match
 * order, the one pattern) and gives a function `perceive` applies to every element's name, or
 * nothing when K2 cannot fire for that persona and list.
 *
 * Browser-safe: imports only `@wayford/core`, reached from `./perceive`.
 */
import { wholeTerm } from "@wayford/core";

/** What an unknown term reads as. */
export const UNFAMILIAR = "[unfamiliar term]";

/** Whether the case-folded vocabulary holds the whole term, or every word of it. */
function isKnown(term: string, known: ReadonlySet<string>): boolean {
  const folded = term.toLowerCase();
  // The term is not blank, so it has at least one word.
  return (
    known.has(folded) ||
    folded
      .trim()
      .split(/\s+/u)
      .every((word) => known.has(word))
  );
}

/** The K2 replacement of one name: the masked terms and the name as the persona reads it. */
export type VocabularyMatch = (name: string) => { terms: string[]; renamed: string } | undefined;

/**
 * K2 for one persona and one jargon list, built once and applied to every name. Undefined when K2
 * cannot fire: the persona has no `vocabulary`, or the list holds no non-blank term it does not
 * know. All of K2's gating is here, so `perceive` only calls what it gets.
 *
 * The matcher gives each occurrence of an unknown term in `name` as `[unfamiliar term]`. `terms`
 * holds the list's spelling of each masked term, in order of first occurrence in the name. It
 * gives undefined when nothing is replaced.
 */
export function vocabularyMatcher(
  jargon: readonly string[],
  vocabulary: readonly string[] | undefined,
): VocabularyMatch | undefined {
  if (vocabulary === undefined) {
    return undefined;
  }
  const known = new Set(vocabulary.map((word) => word.toLowerCase()));
  const unknown = jargon
    // A blank term matches nothing whole: its empty pattern would match everywhere.
    .filter((term) => term.trim() !== "" && !isKnown(term, known))
    // Stable, so terms of equal length keep the list's order.
    .sort((a, b) => b.length - a.length);
  if (unknown.length === 0) {
    return undefined;
  }

  // One capture group per term, longest first: an alternation tries them in order at each place.
  // `wholeTerm` escapes a term's own parentheses, so group i + 1 is `unknown[i]`. `replace`
  // resets a global pattern's `lastIndex`, so one pattern serves every name.
  const pattern = new RegExp(unknown.map((term) => `(${wholeTerm(term).source})`).join("|"), "giu");
  return (name) => {
    const terms: string[] = [];
    const renamed = name.replace(pattern, (...match: unknown[]) => {
      const term = unknown.find((_, index) => match[index + 1] !== undefined);
      if (term !== undefined && !terms.includes(term)) {
        terms.push(term);
      }
      return UNFAMILIAR;
    });
    return terms.length === 0 ? undefined : { terms, renamed };
  };
}
