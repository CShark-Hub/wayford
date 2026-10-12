import { isUnsourced, PROVENANCE_IDS } from "@wayford/core";
import { describe, expect, test } from "vitest";
import { NO_CITATION, PROVENANCE_WORDS, provenanceHint } from "./provenance-words.js";

/** `docs/DEMO.md`'s "Words we do not use", as a hint could hold them, and the persona names. */
const DEMO_WORDS =
  /\b(Ada|Kai|Milo|Vera|Zoya)\b|can't|cannot|predict|real (user|people)|impaired|disabled|blind|confused|route closes/i;

describe("PROVENANCE_WORDS", () => {
  test("holds exactly core's ids, so a new source cannot ship unexplained", () => {
    expect(Object.keys(PROVENANCE_WORDS).sort()).toEqual([...PROVENANCE_IDS].sort());
  });

  test.each(PROVENANCE_IDS)("%s has a name and what it anchors, each a phrase", (id) => {
    const { name, anchors } = PROVENANCE_WORDS[id];
    for (const phrase of [name, anchors]) {
      expect(phrase.trim(), id).not.toBe("");
      expect(phrase, id).not.toMatch(/\.$/);
    }
  });

  test.each(PROVENANCE_IDS)("%s has a citation exactly when core counts it sourced", (id) => {
    const { citation } = PROVENANCE_WORDS[id];
    if (isUnsourced(id)) {
      expect(citation, id).toBeNull();
    } else {
      expect(citation?.trim(), id).toBeTruthy();
      expect(citation, id).not.toMatch(/\.$/);
    }
  });
});

describe("provenanceHint", () => {
  test("names the source, says what it anchors in Wayford, then cites it", () => {
    expect(provenanceHint("wcag22")).toBe(
      "WCAG 2.2, the W3C's web accessibility standard. In Wayford: contrast 4.5:1, 3:1 and 7:1, and targets of 24 and 44 px. W3C, success criteria 1.4.3, 1.4.6, 2.5.5 and 2.5.8.",
    );
  });

  test("an unsourced id says there is nothing to cite, and that what rests on it is soft", () => {
    expect(provenanceHint("folk")).toBe(
      `No published source. In Wayford: anything set without a source, such as a team's number or list, or a threshold moved on the Lens. ${NO_CITATION}.`,
    );
    expect(provenanceHint("llm")).toContain(NO_CITATION);
    expect(NO_CITATION).toMatch(/soft, drawn dotted$/);
  });

  test.each(PROVENANCE_IDS)("%s's hint names no persona and speaks for no one", (id) => {
    expect(provenanceHint(id)).not.toMatch(DEMO_WORDS);
  });
});
