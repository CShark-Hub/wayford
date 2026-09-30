import type { Profile } from "@wayford/core";
import { profileFixture, profileFixtures } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { PersonaCard } from "./personas.js";

/** One card's markup, rendered on its own so no other card's rows can match. */
function cardOf(profile: Profile): string {
  return renderToStaticMarkup(<PersonaCard profile={profile} />);
}

/** The text a piece of markup shows: tags become spaces, and whitespace is collapsed. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The text of each row in a card's threshold list, or none when the card has no list. */
function thresholdRows(card: string): string[] {
  const list = card.match(/<ul(?:\s[^>]*)?>(.*?)<\/ul>/s)?.[1];
  if (list === undefined) return [];
  return [...list.matchAll(/<li(?:\s[^>]*)?>(.*?)<\/li>/gs)].map((row) => textOf(row[1] ?? ""));
}

/** What a card's `<dl>` says, each term to its description. */
function detailsOf(card: string): Record<string, string> {
  const pairs = card.matchAll(/<dt(?:\s[^>]*)?>(.*?)<\/dt>\s*<dd(?:\s[^>]*)?>(.*?)<\/dd>/gs);
  return Object.fromEntries(
    [...pairs].map((pair) => [textOf(pair[1] ?? ""), textOf(pair[2] ?? "")]),
  );
}

test("each card lists its switched-on thresholds with their sources, and folk as no source", () => {
  const rows: Record<string, string[]> = {
    prof_milo: ["Target size 44 px hig"],
    prof_vera: [
      "Contrast 3:1 soft 0.5 wcag22",
      "Font size 16 px legge2011",
      "Target size 32 px folk · no source",
    ],
    prof_zoya: [
      "Contrast 7:1 soft 0.3 wcag22",
      "Font size 24 px legge2011",
      "Target size 48 px material",
    ],
  };
  for (const [id, expected] of Object.entries(rows)) {
    expect(thresholdRows(cardOf(profileFixture(id))), id).toEqual(expected);
  }
});

test("a threshold with llm provenance reads no source too", () => {
  const vera = profileFixture("prof_vera");
  const { contrast } = vera.perception;
  if (!contrast) throw new Error("Vera sets a contrast threshold");
  const llmVera: Profile = {
    ...vera,
    perception: { ...vera.perception, contrast: { ...contrast, provenance: "llm" } },
  };
  expect(thresholdRows(cardOf(llmVera))).toEqual([
    "Contrast 3:1 soft 0.5 llm · no source",
    "Font size 16 px legge2011",
    "Target size 32 px folk · no source",
  ]);
});

test("Ada's card reads No perception threshold, in place of a list", () => {
  const ada = cardOf(profileFixture("prof_ada"));
  expect(thresholdRows(ada)).toEqual([]);
  expect(textOf(ada)).toContain("No perception threshold");
  expect(textOf(cardOf(profileFixture("prof_vera")))).not.toContain("No perception threshold");
});

test("every card shows its description, its device and its budget", () => {
  for (const profile of profileFixtures) {
    const card = cardOf(profile);
    expect(textOf(card), profile.label).toContain(profile.description);
    expect(detailsOf(card), profile.label).toEqual({
      Device: profile.device,
      Budget: `${profile.behaviour.budgetSeconds} s`,
    });
  }
  expect(detailsOf(cardOf(profileFixture("prof_milo")))).toEqual({
    Device: "mobile",
    Budget: "90 s",
  });
});

test("a card is labelled by its <h2>, whose id comes from the profile", () => {
  const vera = cardOf(profileFixture("prof_vera"));
  expect(vera).toMatch(/<h2 [^>]*id="persona-prof_vera"[^>]*>Vera<\/h2>/);
  expect(vera).toMatch(/^<article [^>]*aria-labelledby="persona-prof_vera"/);
});
