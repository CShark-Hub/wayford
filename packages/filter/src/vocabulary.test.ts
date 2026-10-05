/**
 * Stage 4's K2 match rule against the spec ("`packages/filter/src/vocabulary.ts`") and
 * `docs/RULES.md` stage 4, and when `vocabularyMatcher` gives no matcher. Pure strings, no
 * browser: that `perceive` applies the matcher is its tests' and the browser tests'.
 */
import { profileFixture } from "@wayford/core/fixtures";
import { describe, expect, test } from "vitest";
import { UNFAMILIAR, vocabularyMatcher } from "./vocabulary.js";

const LEDGER = "Fulfilment ledger";

/** Kai's vocabulary, as `kai.yaml` lists it. */
const KAI = profileFixture("prof_kai").knowledge.domainVocabulary ?? [];

/** The matcher for `jargon` and `vocabulary`, applied to one name. */
const vocabularyRename = (
  name: string,
  jargon: readonly string[],
  vocabulary: readonly string[] | undefined,
) => vocabularyMatcher(jargon, vocabulary)?.(name);

describe("the matcher", () => {
  test("a persona with no vocabulary gets none", () => {
    expect(vocabularyMatcher([LEDGER], undefined)).toBeUndefined();
  });

  test("a list with no term the vocabulary lacks gets none", () => {
    expect(vocabularyMatcher([], KAI)).toBeUndefined();
    expect(vocabularyMatcher(["", " "], [])).toBeUndefined();
    expect(vocabularyMatcher(["Order", "parcel"], KAI)).toBeUndefined();
  });

  test("one matcher serves every name", () => {
    const match = vocabularyMatcher(["ledger"], KAI);
    expect(match?.("ledger")?.renamed).toBe(UNFAMILIAR);
    expect(match?.("Open the ledger")?.renamed).toBe(`Open the ${UNFAMILIAR}`);
    expect(match?.("Your data")).toBeUndefined();
    expect(match?.("ledger")).toEqual({ terms: ["ledger"], renamed: UNFAMILIAR });
  });
});

describe("matching", () => {
  test("an unknown term that is the whole name becomes one marker", () => {
    expect(vocabularyRename(LEDGER, [LEDGER], KAI)).toEqual({
      terms: [LEDGER],
      renamed: UNFAMILIAR,
    });
  });

  test("is case-insensitive", () => {
    expect(vocabularyRename("FULFILMENT LEDGER", [LEDGER], KAI)).toEqual({
      terms: [LEDGER],
      renamed: UNFAMILIAR,
    });
    expect(vocabularyRename("fulfilment ledger", [LEDGER], KAI)?.renamed).toBe(UNFAMILIAR);
  });

  test("is whole-term: a term inside a longer word is not matched", () => {
    expect(vocabularyRename("Ledgers", ["ledger"], KAI)).toBeUndefined();
    expect(vocabularyRename("Subledger", ["ledger"], KAI)).toBeUndefined();
    expect(vocabularyRename("Fulfilment ledgers", [LEDGER], KAI)).toBeUndefined();
  });

  test("punctuation next to a term is a word boundary", () => {
    expect(vocabularyRename("Open the ledger.", ["ledger"], KAI)?.renamed).toBe(
      `Open the ${UNFAMILIAR}.`,
    );
    expect(vocabularyRename("(ledger)", ["ledger"], KAI)?.renamed).toBe(`(${UNFAMILIAR})`);
  });

  test("a phrase is matched whole, not word by word", () => {
    expect(vocabularyRename("Fulfilment and ledger", [LEDGER], KAI)).toBeUndefined();
  });

  test("regex specials in a term are literal, and an end that is not a word character needs no boundary", () => {
    expect(vocabularyRename("Use C++ here", ["C++"], KAI)).toEqual({
      terms: ["C++"],
      renamed: `Use ${UNFAMILIAR} here`,
    });
    expect(vocabularyRename("Use Cxx here", ["C.."], KAI)).toBeUndefined();
    expect(vocabularyRename("Ask (a.k.a. RMA) now", ["(a.k.a. RMA)"], KAI)?.renamed).toBe(
      `Ask ${UNFAMILIAR} now`,
    );
    expect(vocabularyRename("Pay $5 [net]", ["$5 [net]"], KAI)?.renamed).toBe(`Pay ${UNFAMILIAR}`);
    // A term that ends in punctuation needs no word boundary there.
    expect(vocabularyRename("C++Builder", ["C++"], KAI)?.renamed).toBe(`${UNFAMILIAR}Builder`);
  });
});

describe("known terms", () => {
  test("a vocabulary that holds the phrase knows it", () => {
    expect(vocabularyRename(LEDGER, [LEDGER], ["fulfilment ledger"])).toBeUndefined();
  });

  test("a vocabulary that holds every word of the phrase knows it", () => {
    expect(vocabularyRename(LEDGER, [LEDGER], ["ledger", "fulfilment", "order"])).toBeUndefined();
  });

  test("a vocabulary that holds only some words of the phrase does not know it", () => {
    expect(vocabularyRename(LEDGER, [LEDGER], ["ledger"])?.renamed).toBe(UNFAMILIAR);
  });

  test("a vocabulary entry in another case still knows the term", () => {
    expect(vocabularyRename(LEDGER, [LEDGER], ["FULFILMENT Ledger"])).toBeUndefined();
    expect(vocabularyRename(LEDGER, [LEDGER], ["Fulfilment", "LEDGER"])).toBeUndefined();
  });

  test("an empty vocabulary knows nothing", () => {
    expect(vocabularyRename(LEDGER, [LEDGER], [])).toEqual({
      terms: [LEDGER],
      renamed: UNFAMILIAR,
    });
  });

  test("a vocabulary entry is a whole word, not a prefix", () => {
    expect(vocabularyRename(LEDGER, [LEDGER], ["fulfil", "ledger"])?.renamed).toBe(UNFAMILIAR);
  });

  test("a known term is left alone while an unknown one in the same name is masked", () => {
    expect(vocabularyRename("Order ledger", ["order", "ledger"], KAI)).toEqual({
      terms: ["ledger"],
      renamed: `Order ${UNFAMILIAR}`,
    });
  });
});

describe("the result", () => {
  test("no listed term in the name gives undefined", () => {
    expect(vocabularyRename("Your data", [LEDGER], KAI)).toBeUndefined();
  });

  test("an empty list gives undefined", () => {
    expect(vocabularyRename(LEDGER, [], KAI)).toBeUndefined();
  });

  test("the rest of the name stays as written", () => {
    expect(vocabularyRename("Open the Fulfilment ledger, then Save", [LEDGER], KAI)).toEqual({
      terms: [LEDGER],
      renamed: `Open the ${UNFAMILIAR}, then Save`,
    });
  });

  test("every occurrence is replaced and the term is listed once", () => {
    expect(vocabularyRename("ledger to ledger", ["ledger"], KAI)).toEqual({
      terms: ["ledger"],
      renamed: `${UNFAMILIAR} to ${UNFAMILIAR}`,
    });
  });

  test("terms come in order of first occurrence in the name, spelled as the list spells them", () => {
    expect(vocabularyRename("SKU from the LEDGER, sku again", ["ledger", "SKU"], KAI)).toEqual({
      terms: ["SKU", "ledger"],
      renamed: `${UNFAMILIAR} from the ${UNFAMILIAR}, ${UNFAMILIAR} again`,
    });
  });
});

describe("overlapping terms", () => {
  const BOTH = ["ledger", LEDGER];

  test("the longest term wins, and a word inside a masked phrase is not masked again", () => {
    expect(vocabularyRename(LEDGER, BOTH, KAI)).toEqual({
      terms: [LEDGER],
      renamed: UNFAMILIAR,
    });
  });

  test("the shorter term is still masked where it stands alone", () => {
    expect(vocabularyRename("Fulfilment ledger and ledger", BOTH, KAI)).toEqual({
      terms: [LEDGER, "ledger"],
      renamed: `${UNFAMILIAR} and ${UNFAMILIAR}`,
    });
    expect(vocabularyRename("ledger, then Fulfilment ledger", BOTH, KAI)).toEqual({
      terms: ["ledger", LEDGER],
      renamed: `${UNFAMILIAR}, then ${UNFAMILIAR}`,
    });
  });

  test("when the phrase is known, its unknown word is still masked", () => {
    expect(vocabularyRename(LEDGER, BOTH, ["fulfilment ledger"])).toEqual({
      terms: ["ledger"],
      renamed: `Fulfilment ${UNFAMILIAR}`,
    });
  });

  test("the marker's own words are never matched", () => {
    expect(vocabularyRename("ledger term", ["ledger", "term", "unfamiliar"], KAI)).toEqual({
      terms: ["ledger", "term"],
      renamed: `${UNFAMILIAR} ${UNFAMILIAR}`,
    });
    expect(vocabularyRename("ledger", ["ledger", "unfamiliar term"], KAI)?.renamed).toBe(
      UNFAMILIAR,
    );
  });

  test("a shorter term that overlaps a masked phrase only in part is not matched across it", () => {
    expect(vocabularyRename("Fulfilment ledger book", [LEDGER, "ledger book"], KAI)).toEqual({
      terms: [LEDGER],
      renamed: `${UNFAMILIAR} book`,
    });
  });

  test("at each place the longer term is tried first, but a term that starts earlier wins", () => {
    // The name is read left to right: "order ledger" starts first, so the longer "ledger book
    // entry" that overlaps it is not matched.
    const terms = ["order ledger", "ledger book entry"];
    expect(vocabularyRename("order ledger book entry", terms, [])).toEqual({
      terms: ["order ledger"],
      renamed: `${UNFAMILIAR} book entry`,
    });
  });

  test("where two terms start at the same place, the longer one wins", () => {
    // Listed shorter first, so only the length sort, not the list's order, can pick the longer.
    expect(vocabularyRename(LEDGER, ["Fulfilment", LEDGER], KAI)).toEqual({
      terms: [LEDGER],
      renamed: UNFAMILIAR,
    });
    expect(vocabularyRename("C++ code", ["C", "C++"], [])?.renamed).toBe(`${UNFAMILIAR} code`);
  });
});

describe("a blank term", () => {
  test("an empty or blank term in the list is ignored", () => {
    expect(vocabularyRename(LEDGER, ["", " ", LEDGER], KAI)).toEqual({
      terms: [LEDGER],
      renamed: UNFAMILIAR,
    });
    expect(vocabularyRename("x", [""], [])).toBeUndefined();
  });
});
