import { profileFixture } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { castDimensions, type Dimension, type DimensionKey } from "../cast/dimensions.js";
import { attributesOf, detailsOf, lineOf, styleOf, textOf } from "../preview/rendered-markup.js";
import { CastCard, DimensionValue } from "./cast-card.js";

/** A fixture's card, rendered. */
function card(profileId: string): string {
  return renderToStaticMarkup(<CastCard profile={profileFixture(profileId)} />);
}

/** One row of a fixture's dimensions, by key. */
function row(profileId: string, key: DimensionKey): Dimension {
  const found = castDimensions(profileFixture(profileId)).find((d) => d.key === key);
  if (found === undefined) throw new Error(`No ${key} row for ${profileId}`);
  return found;
}

/**
 * The `<dd>` of the plate row whose `<dt>` reads `term`. The plate's rows hold no `<dd>` of their
 * own, so the first `</dd>` ends it.
 */
function cellOf(html: string, term: string): string {
  const rows = html.matchAll(/<dt(?:\s[^>]*)?>(.*?)<\/dt>\s*<dd(?:\s[^>]*)?>(.*?)<\/dd>/gs);
  const found = [...rows].find((r) => lineOf(r[1] ?? "") === term)?.[2];
  if (found === undefined) throw new Error(`No plate row reads ${term}`);
  return found;
}

/** The attributes of the `<span>` whose `data-slot` is `slot`. */
function slotSpan(html: string, slot: string): Record<string, string> {
  const tag = html.match(new RegExp(`<span(\\s[^>]*data-slot="${slot}"[^>]*)>`))?.[1];
  if (tag === undefined) throw new Error(`No span ${slot}`);
  return attributesOf(tag);
}

/** The pips a cell draws: each one's `data-pattern`, in order. */
function pipsOf(html: string): string[] {
  return [...html.matchAll(/data-pattern="([^"]*)"/g)].map((m) => m[1] ?? "");
}

describe("CastCard", () => {
  test("holds the persona's full description, unclamped", () => {
    const kai = profileFixture("prof_kai");
    const html = card("prof_kai");
    expect(textOf(html)).toContain(kai.description);
    expect(html).not.toContain("line-clamp");
    expect(html).toMatch(/<p class="[^"]*body[^"]*text-ink-2[^"]*">Sees the page clearly/);
  });

  test("is an article labelled by its heading, cast-card-<id>, the name in display-l", () => {
    const html = card("prof_kai");
    const root = attributesOf(html.match(/^<article(\s[^>]*)>/)?.[1] ?? "");
    expect(root["aria-labelledby"]).toBe("cast-card-prof_kai");
    expect(html).toMatch(/<h2 id="cast-card-prof_kai" class="[^"]*display-l[^"]*">Kai<\/h2>/);
  });

  test("sets the persona's slot on its root, since a hover card renders outside the column", () => {
    const root = attributesOf(card("prof_vera").match(/^<article(\s[^>]*)>/)?.[1] ?? "");
    expect(styleOf(root)["--p"]).toBe("var(--persona-cobalt)");
    expect(styleOf(root)["--p-soft"]).toBe("var(--persona-cobalt-soft)");
  });

  test("names the device, and carries the control tag on Ada's card alone", () => {
    const ada = card("prof_ada");
    expect(ada).toMatch(/<p class="[^"]*mono-label[^"]*text-ink-3[^"]*">desktop<\/p>/);
    expect(ada).toMatch(/<p[^>]*><span class="[^"]*bg-paper-sunken[^"]*">control<\/span><\/p>/);
    expect(card("prof_milo")).toMatch(/>mobile<\/p>/);
    for (const id of ["prof_vera", "prof_kai", "prof_milo", "prof_zoya"]) {
      expect(card(id), id).not.toContain(">control<");
    }
  });

  test("its plate holds every dimension, each term its label and rule", () => {
    expect(detailsOf(card("prof_vera"))).toEqual({
      "Contrast P1": "3.0:1 soft 0.5 wcag22",
      "Font size P3": "16 px legge2011",
      "Target size P4": "32 px folk · no source",
      "Attention A1": "20 items",
      "Memory M1": "3 steps",
      "Patience B3": "120 s",
      "Patterns K1": "9/12",
      "Vocabulary K2": "— not set",
    });
  });

  test("Vera's target size reads 32 px with the dotted tag saying folk has no source", () => {
    const cell = cellOf(card("prof_vera"), "Target size P4");
    expect(cell).toMatch(/<p class="[^"]*mono[^"]*text-ink[^"]*">32 px<\/p>/);
    expect(cell).toMatch(/<span class="[^"]*border-dotted[^"]*">folk · no source<\/span>/);
  });

  test("Vera's contrast shows its softness", () => {
    const cell = cellOf(card("prof_vera"), "Contrast P1");
    expect(cell).toMatch(/<p class="[^"]*mono[^"]*text-ink-3[^"]*">soft 0.5<\/p>/);
    expect(cellOf(card("prof_vera"), "Font size P3")).not.toContain("soft");
  });

  test("patterns read 9/12, with the first 9 of 12 pips filled", () => {
    const cell = cellOf(card("prof_vera"), "Patterns K1");
    expect(cell).toMatch(/>9\/12<\/p>/);
    expect(pipsOf(cell)).toEqual([...Array(9).fill("known"), ...Array(3).fill("unknown")]);
  });
});

describe("DimensionValue", () => {
  test("without card, an llm threshold takes the dotted soft tag, as folk does", () => {
    const llm: Dimension = { ...row("prof_vera", "targetPx"), provenance: "llm" };
    const html = renderToStaticMarkup(<DimensionValue dimension={llm} />);
    expect(html).toMatch(
      /<button[^>]*><span class="[^"]*border-dotted[^"]*">llm<\/span><\/button>/,
    );
  });

  test("without card, a sourced threshold takes the solid tag, and no softness", () => {
    const html = renderToStaticMarkup(<DimensionValue dimension={row("prof_vera", "contrast")} />);
    expect(html).toMatch(/<button[^>]*><span class="[^"]*">wcag22<\/span><\/button>/);
    expect(html).not.toContain("border-dotted");
    expect(html).not.toContain("soft 0.5");
    expect(lineOf(html)).toBe("3.0:1 wcag22");
  });

  test("a threshold draws its mini gauge, hidden, filled in the slot to its share, post in signal", () => {
    const html = renderToStaticMarkup(<DimensionValue dimension={row("prof_vera", "fontPx")} />);
    const gauge = slotSpan(html, "mini-gauge");
    expect(gauge["aria-hidden"]).toBe("true");
    expect(gauge.class).toContain("bg-paper-sunken");
    const fill = slotSpan(html, "mini-gauge-fill");
    expect(fill.class).toContain("bg-(--p)");
    expect(styleOf(fill).width).toBe("50%");
    const post = slotSpan(html, "mini-gauge-post");
    expect(post.class).toContain("bg-signal");
    expect(styleOf(post).left).toBe("50%");
  });
});
