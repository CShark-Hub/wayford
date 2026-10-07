import { createMemoryHistory, RouterContextProvider } from "@tanstack/react-router";
import { type Finding, PROVENANCE_IDS } from "@wayford/core";
import { reportFixture } from "@wayford/core/fixtures";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { attributesOf, lineOf } from "../preview/rendered-markup.js";
import { runsOf } from "../report/findings.js";
import { createAppRouter } from "../router.js";
import type { CertaintyLine } from "./certainty.js";
import { FindingCard, findingLine } from "./finding.js";

/** `ui` inside the app's router, so its links build their hrefs. A static render runs no effect. */
function render(ui: ReactNode): string {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ["/"] }) });
  return renderToStaticMarkup(<RouterContextProvider router={router}>{ui}</RouterContextProvider>);
}

const HARD = reportFixture("task_past-order");

/** A finding of the hard goal's report, by id. */
function finding(id: string): Finding {
  const found = HARD.findings.find((f) => f.id === id);
  if (found === undefined) throw new Error(`No finding ${id}`);
  return found;
}

const A1 = finding("fnd_kai-order-archive-a1");
const P1 = finding("fnd_vera-order-archive-p1");
const AXE = finding("fnd_order-archive-contrast-ratio");
const GUESS = finding("fnd_vera-passes-over-masked-archive-link");

/** The card's start tag's attributes. */
function cardOf(html: string): Record<string, string> {
  const tag = html.match(/^<article(\s[^>]*)>/)?.[1];
  if (tag === undefined) throw new Error("the card is not an <article>");
  return attributesOf(tag);
}

/** Each link in `html`: its href and its name on one line, without what it hides from readers. */
function linksOf(html: string): { href: string | undefined; text: string }[] {
  return [...html.matchAll(/<a(\s[^>]*)?>(.*?)<\/a>/gs)].map((m) => ({
    href: attributesOf(m[1] ?? "").href,
    text: lineOf((m[2] ?? "").replace(/<span aria-hidden="true"[^>]*>.*?<\/span>/gs, "")),
  }));
}

/** Each button's text in `html`. */
function buttonsOf(html: string): string[] {
  return [...html.matchAll(/<button(?:\s[^>]*)?>(.*?)<\/button>/gs)].map((m) => lineOf(m[1] ?? ""));
}

test("an evidence link's arrow is drawn but hidden from its accessible name", () => {
  const html = render(
    <FindingCard
      finding={P1}
      runOf={() => ({ profileId: "prof_vera", seed: 2, outcome: "gave_up" })}
    />,
  );
  expect(html).toMatch(/<span aria-hidden="true"[^>]*>→<\/span><\/a>/);
});

/** The text of every tag the card's tag row shows, in order. */
function tagsOf(html: string): string[] {
  return [...html.matchAll(/<span class="[^"]*mono-label[^"]*">(.*?)<\/span>/gs)].map((m) =>
    lineOf(m[1] ?? ""),
  );
}

describe("findingLine", () => {
  test.each([
    ["a measurement", AXE, "measured"],
    ["a deterministic finding on a sourced rule", P1, "deterministic"],
    ["a deterministic finding on a folk threshold", A1, "soft"],
    ["a hypothesis on a sourced rule", GUESS, "hypothesis"],
    ["a hypothesis with no basis", { ...GUESS, basis: [] }, "hypothesis"],
    [
      "a hypothesis that rests on an llm threshold",
      { ...GUESS, basis: [{ rule: "P1", provenance: "llm" }] },
      "soft",
    ],
    [
      "a measurement on a folk threshold",
      { ...AXE, basis: [{ rule: "M1", provenance: "folk" }] },
      "soft",
    ],
  ] satisfies [string, Finding, CertaintyLine][])("%s is %s", (_, f, line) => {
    expect(findingLine(f)).toBe(line);
  });

  test.each(PROVENANCE_IDS)("a hypothesis resting on %s is never measured", (provenance) => {
    const line = findingLine({ ...GUESS, basis: [{ rule: "P1", provenance }] });
    expect(line).not.toBe("measured");
    expect(["hypothesis", "soft"]).toContain(line);
  });
});

describe("FindingCard", () => {
  // The hard goal's run lookup, the one the screen uses.
  const runOf = runsOf(HARD);

  test("a soft finding is dotted, tagged soft, and shows its rule and its source", () => {
    const html = render(<FindingCard finding={A1} runOf={runOf} />);
    const card = cardOf(html);
    expect(card["data-line"]).toBe("soft");
    expect(card.class).toContain("border-dotted");
    expect(card.class).not.toContain("border-dashed");
    expect(tagsOf(html)).toEqual(["soft", "A1", "folk · no source"]);
    expect(lineOf(html)).toMatch(/^Kai /);
  });

  test("a sourced deterministic finding is a hairline, with no soft tag", () => {
    const html = render(<FindingCard finding={P1} runOf={runOf} />);
    const card = cardOf(html);
    expect(card["data-line"]).toBe("deterministic");
    expect(card.class).not.toMatch(/border-(dashed|dotted)/);
    expect(tagsOf(html)).toEqual(["P1", "wcag22"]);
  });

  test("a measurement names its axe rule and is a hairline", () => {
    const html = render(<FindingCard finding={AXE} runOf={runOf} />);
    const card = cardOf(html);
    expect(card["data-line"]).toBe("measured");
    expect(card.class).not.toMatch(/border-(dashed|dotted)/);
    expect(tagsOf(html)).toEqual(["axe · color-contrast"]);
  });

  test("a hypothesis is dashed, never drawn like a measurement", () => {
    const html = render(<FindingCard finding={GUESS} runOf={runOf} />);
    const card = cardOf(html);
    expect(card["data-line"]).toBe("hypothesis");
    expect(card.class).toContain("border-dashed");
    const measured = cardOf(render(<FindingCard finding={AXE} runOf={runOf} />));
    expect(card.class).not.toBe(measured.class);
  });

  test("the card reads tags, title, detail, the change, then the evidence last", () => {
    const html = render(<FindingCard finding={P1} runOf={runOf} />);
    expect(lineOf(html.match(/<h3(?:\s[^>]*)?>(.*?)<\/h3>/s)?.[1] ?? "")).toBe(P1.title);
    const text = lineOf(html);
    const order = [
      "Vera",
      "P1",
      P1.title,
      P1.detail,
      `change → ${P1.recommendation}`,
      "evidence Vera, seed 2 · Gave up",
    ].map((part) => text.indexOf(part));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("several steps of one run are one link, at the earliest step cited, in whatever order", () => {
    // The hypothesis cites run_vera-past-order-1 at steps 1 and 4.
    const expected = [
      { href: "/runs/run_vera-past-order-1?step=1", text: "Vera, seed 1 · Gave up" },
    ];
    for (const evidence of [GUESS.evidence, [...GUESS.evidence].reverse()]) {
      const html = render(<FindingCard finding={{ ...GUESS, evidence }} runOf={runOf} />);
      expect(linksOf(html)).toEqual(expected);
    }
  });

  test.each([
    [3, []],
    [4, ["Show 1 more"]],
    [10, ["Show 7 more"]],
  ])("a finding backed by %i runs shows three links and the buttons %j", (runs, toggle) => {
    const evidence = Array.from({ length: runs }, (_, i) => ({
      runId: `run_kai-past-order-${i + 1}`,
      stepIndex: 1,
    }));
    const html = render(
      <FindingCard
        finding={{ ...A1, evidence }}
        runOf={() => ({ profileId: "prof_kai", seed: 1, outcome: "gave_up" })}
      />,
    );
    expect(linksOf(html)).toHaveLength(3);
    expect(buttonsOf(html)).toEqual(toggle);
    if (toggle.length > 0) expect(html).toMatch(/<button [^>]*aria-expanded="false"/);
  });
});
