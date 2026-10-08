/**
 * The Cast through the app's own router, against "Cast" and "Acceptance mapping" in
 * `docs/specs/2026-10-07-s3-14-cast-and-runs.md`. The page is loaded into a memory history and
 * rendered with `renderToStaticMarkup`, as `router.test.tsx` does, and read off the markup.
 *
 * A static render opens no hover card, so the markup holds the lineup and the matrix alone: each
 * persona's column is the `<section>` its `<h2>` labels, and each matrix cell a `<dt>` naming the
 * row and a `<dd>` holding the value.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { profileFixtures } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, expect, test } from "vitest";
import { attributesOf, classesOf, lineOf, sectionOf, textOf } from "../preview/rendered-markup.js";
import { createAppRouter } from "../router.js";

/** The Cast as `/cast` renders it, shell included. */
async function render(): Promise<string> {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ["/cast"] }) });
  await router.load();
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

let html = "";
beforeAll(async () => {
  html = await render();
});

/** The markup inside a persona's column. */
function columnOf(label: string): string {
  return sectionOf(html, label);
}

/** A column's matrix: each `<dt>`'s text, such as "Contrast, P1", to its `<dd>`'s markup. */
function cellsOf(column: string): Map<string, string> {
  const pairs = column.matchAll(/<dt(?:\s[^>]*)?>(.*?)<\/dt>\s*<dd(?:\s[^>]*)?>(.*?)<\/dd>/gs);
  return new Map([...pairs].map((pair) => [lineOf(pair[1] ?? ""), pair[2] ?? ""]));
}

/** One cell of a persona's column, by its row's label and rule. */
function cellOf(label: string, row: string): string {
  const cell = cellsOf(columnOf(label)).get(row);
  if (cell === undefined) throw new Error(`${label}'s column has no ${row} row`);
  return cell;
}

/** The tags in a piece of markup: each `<span>` in the Tag's mono label, with its classes. */
function tagsOf(markup: string): { text: string; classes: string[] }[] {
  return [
    ...markup.matchAll(/<span(\s[^>]*class="[^"]*\bmono-label\b[^"]*"[^>]*)>(.*?)<\/span>/gs),
  ].map((match) => ({
    text: textOf(match[2] ?? ""),
    classes: classesOf(attributesOf(match[1] ?? "")),
  }));
}

/** The pips a cell draws: each one's `data-pattern`, in order. */
function pipsOf(markup: string): string[] {
  return [...markup.matchAll(/data-pattern="([^"]*)"/g)].map((match) => match[1] ?? "");
}

/** The rows that are not perception thresholds: nothing in them is cited, so none carries a tag. */
const UNCITED_ROWS = [
  "Attention, A1",
  "Memory, M1",
  "Patience, B3",
  "Patterns, K1",
  "Vocabulary, K2",
];

test("the screen's one h1 reads 01 · the cast, and its lead says only a threshold cites a source", () => {
  const headings = [...html.matchAll(/<h1(?:\s[^>]*)?>(.*?)<\/h1>/gs)].map((h) =>
    lineOf(h[1] ?? ""),
  );
  expect(headings).toEqual(["01 · the cast"]);
  // `docs/RULES.md` calls every number other than a threshold folk, as the report's basis does.
  const lead = html.match(/<\/h1>((?:<p[^>]*>.*?<\/p>)+)/s)?.[1] ?? "";
  expect([...lead.matchAll(/<p[^>]*>(.*?)<\/p>/gs)].map((p) => lineOf(p[1] ?? ""))).toEqual([
    "Each persona is a set of limits on what the model sees and does, never a character it is told to play.",
    "A threshold cites its source; every other number is folk.",
  ]);
});

test("each persona is a section its <h2> labels, in fixture order", () => {
  const labelled = [...html.matchAll(/<section [^>]*aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
  expect(labelled).toEqual(profileFixtures.map((profile) => `cast-${profile.id}`));
  for (const profile of profileFixtures) {
    expect(html).toMatch(
      new RegExp(`<h2 id="cast-${profile.id}" class="[^"]*display-l[^"]*">${profile.label}</h2>`),
    );
  }
});

test("each column links to the Lens on its persona, named by its name and open in the Lens", () => {
  for (const profile of profileFixtures) {
    const column = columnOf(profile.label);
    const links = [...column.matchAll(/<a(\s[^>]*)>/g)].map((m) => attributesOf(m[1] ?? ""));
    expect(links, profile.label).toHaveLength(1);
    const [link] = links;
    expect(link?.href).toBe(`/lens?persona=${profile.id}`);
    // The name, read through `aria-labelledby`, is the heading's text and the hidden words.
    const names = (link?.["aria-labelledby"] ?? "").split(" ").map((id) => {
      const named = column.match(new RegExp(`<(h2|span) [^>]*id="${id}"[^>]*>(.*?)</\\1>`, "s"));
      return lineOf(named?.[2] ?? "");
    });
    expect(names, profile.label).toEqual([profile.label, "open in the Lens"]);
    // The description, through `aria-describedby`.
    const described = column.match(
      new RegExp(`<p [^>]*id="${link?.["aria-describedby"]}"[^>]*>(.*?)</p>`, "s"),
    );
    expect(textOf(described?.[1] ?? ""), profile.label).toBe(profile.description);
  }
});

test("each column sets its persona's slot", () => {
  const tag = html.match(/<section(\s[^>]*aria-labelledby="cast-prof_vera"[^>]*)>/)?.[1] ?? "";
  expect(attributesOf(tag).style).toContain("--p:var(--persona-cobalt)");
});

test("the description is clamped to three lines and holds the profile's full text", () => {
  for (const profile of profileFixtures) {
    const description = columnOf(profile.label).match(
      new RegExp(`<p (id="cast-${profile.id}-description"[^>]*)>(.*?)</p>`, "s"),
    );
    expect(classesOf(attributesOf(description?.[1] ?? "")), profile.label).toEqual(
      expect.arrayContaining(["body", "line-clamp-3"]),
    );
    expect(textOf(description?.[2] ?? ""), profile.label).toBe(profile.description);
  }
  // No native tooltip: the hover card is the hover.
  expect(columnOf("Kai")).not.toContain("title=");
});

test("Ada alone carries the control tag", () => {
  for (const profile of profileFixtures) {
    const control = tagsOf(columnOf(profile.label)).some((tag) => tag.text === "control");
    expect(control, profile.label).toBe(profile.label === "Ada");
  }
});

test("the matrix reads — and not set where a persona sets nothing", () => {
  for (const [label, row] of [
    ["Ada", "Contrast, P1"],
    ["Milo", "Contrast, P1"],
    ["Vera", "Vocabulary, K2"],
  ] as const) {
    const cell = cellOf(label, row);
    expect(lineOf(cell), `${label} ${row}`).toBe("— not set");
    expect(cell).toMatch(/<span aria-hidden="true">—<\/span><span class="sr-only">not set<\/span>/);
  }
  expect(lineOf(cellOf("Kai", "Vocabulary, K2"))).toBe("15 words");
});

test("every column holds the eight rows in matrix order", () => {
  for (const profile of profileFixtures) {
    expect([...cellsOf(columnOf(profile.label)).keys()], profile.label).toEqual([
      "Contrast, P1",
      "Font size, P3",
      "Target size, P4",
      ...UNCITED_ROWS,
    ]);
  }
});

test("Vera's target size carries the dotted folk tag, and no uncited row carries a tag", () => {
  const target = cellOf("Vera", "Target size, P4");
  expect(lineOf(target)).toBe("32 px folk");
  expect(tagsOf(target)).toEqual([
    { text: "folk", classes: expect.arrayContaining(["border-dotted"]) },
  ]);
  // A sourced threshold's tag is solid.
  const [contrast] = tagsOf(cellOf("Vera", "Contrast, P1"));
  expect(contrast?.text).toBe("wcag22");
  expect(contrast?.classes).not.toContain("border-dotted");
  for (const profile of profileFixtures) {
    for (const row of UNCITED_ROWS) {
      expect(tagsOf(cellOf(profile.label, row)), `${profile.label} ${row}`).toEqual([]);
    }
  }
});

test("Vera's patterns read 9, with 9 of 12 pips known", () => {
  const patterns = cellOf("Vera", "Patterns, K1");
  expect(lineOf(patterns)).toBe("9");
  const pips = pipsOf(patterns);
  expect(pips).toHaveLength(12);
  expect(pips.filter((pip) => pip === "known")).toHaveLength(9);
  expect(pips.slice(0, 9).every((pip) => pip === "known")).toBe(true);
});

test("the legend says what each mark means, and counts the bundled personas", () => {
  const foot = html.match(/<footer(?:\s[^>]*)?>(.*?)<\/footer>/s)?.[1] ?? "";
  const items = [...foot.matchAll(/<p(?:\s[^>]*)?>(.*?)<\/p>/gs)].map((m) => lineOf(m[1] ?? ""));
  expect(items).toEqual([
    "sourced threshold",
    "folk / llm · no source",
    "— not set",
    "threshold",
    `${profileFixtures.length} personas · fixtures · core/src/fixtures/profiles`,
  ]);
  expect(foot).toContain('data-line="measured"');
  expect(foot).toContain('data-line="soft"');
});
