import { createMemoryHistory, RouterContextProvider } from "@tanstack/react-router";
import { type Finding, PROVENANCE_IDS, type RunId, type RunOutcome } from "@wayford/core";
import { reportFixture, reportFixtures } from "@wayford/core/fixtures";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { attributesOf, lineOf } from "../preview/rendered-markup.js";
import { outcomesOf } from "../report/findings.js";
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

/** How each run of `report` ended, read off its seeds, as the report screen reads it. */
/** The fixture report on `taskId`'s outcome lookup, the one the screen uses. */
function outcomesOfTask(taskId: string): (runId: RunId) => RunOutcome {
  return outcomesOf(reportFixture(taskId));
}

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

test("an evidence chip's arrow is drawn but hidden from its accessible name", () => {
  const html = render(<FindingCard finding={P1} outcomeOf={() => "gave_up"} />);
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
  const outcomeOf = outcomesOfTask("task_past-order");

  test("a soft finding is dotted, tagged soft, and shows its rule and its source", () => {
    const html = render(<FindingCard finding={A1} outcomeOf={outcomeOf} />);
    const card = cardOf(html);
    expect(card["data-line"]).toBe("soft");
    expect(card.class).toContain("border-dotted");
    expect(card.class).not.toContain("border-dashed");
    expect(tagsOf(html)).toEqual(["soft", "A1", "folk · no source"]);
    expect(lineOf(html)).toMatch(/^Kai /);
  });

  test("a sourced deterministic finding is a hairline, with no soft tag", () => {
    const html = render(<FindingCard finding={P1} outcomeOf={outcomeOf} />);
    const card = cardOf(html);
    expect(card["data-line"]).toBe("deterministic");
    expect(card.class).not.toMatch(/border-(dashed|dotted)/);
    expect(tagsOf(html)).toEqual(["P1", "wcag22"]);
  });

  test("a measurement names its axe rule and is a hairline", () => {
    const html = render(<FindingCard finding={AXE} outcomeOf={outcomeOf} />);
    const card = cardOf(html);
    expect(card["data-line"]).toBe("measured");
    expect(card.class).not.toMatch(/border-(dashed|dotted)/);
    expect(tagsOf(html)).toEqual(["axe · color-contrast"]);
  });

  test("a hypothesis is dashed, never drawn like a measurement", () => {
    const html = render(<FindingCard finding={GUESS} outcomeOf={outcomeOf} />);
    const card = cardOf(html);
    expect(card["data-line"]).toBe("hypothesis");
    expect(card.class).toContain("border-dashed");
    const measured = cardOf(render(<FindingCard finding={AXE} outcomeOf={outcomeOf} />));
    expect(card.class).not.toBe(measured.class);
  });

  test("the card reads tags, title, evidence, detail, then the change", () => {
    const html = render(<FindingCard finding={P1} outcomeOf={outcomeOf} />);
    expect(lineOf(html.match(/<h3(?:\s[^>]*)?>(.*?)<\/h3>/s)?.[1] ?? "")).toBe(P1.title);
    const text = lineOf(html);
    const order = [
      "Vera",
      "P1",
      P1.title,
      "run_vera-past-order-2 · step 1 · Gave up",
      P1.detail,
      `change → ${P1.recommendation}`,
    ].map((part) => text.indexOf(part));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test.each(
    reportFixtures.flatMap((report) =>
      report.findings.map((f) => [f.id, report.taskId, f] as const),
    ),
  )(
    "%s: each evidence chip opens its run at its step, named by how the run ended",
    (_, taskId, f) => {
      const links = linksOf(render(<FindingCard finding={f} outcomeOf={outcomesOfTask(taskId)} />));
      const words = {
        success: "Got through",
        gave_up: "Gave up",
        budget_exceeded: "Over budget",
        error: "Error",
      };
      expect(links).toEqual(
        f.evidence.map((ref) => {
          const outcome = outcomesOfTask(taskId)(ref.runId);
          return {
            href: `/runs/${ref.runId}?step=${ref.stepIndex}`,
            text: `${ref.runId} · step ${ref.stepIndex} · ${words[outcome]}`,
          };
        }),
      );
    },
  );
});
