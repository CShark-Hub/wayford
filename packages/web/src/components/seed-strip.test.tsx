import { createMemoryHistory, RouterContextProvider } from "@tanstack/react-router";
import type { ReportSeed } from "@wayford/core";
import { reportFixture } from "@wayford/core/fixtures";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { attributesOf } from "../preview/rendered-markup.js";
import { createAppRouter } from "../router.js";
import { SeedStrip } from "./seed-strip.js";

/** `ui` inside the app's router, so its links build their hrefs. A static render runs no effect. */
function render(ui: ReactNode): string {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ["/"] }) });
  return renderToStaticMarkup(<RouterContextProvider router={router}>{ui}</RouterContextProvider>);
}

/** A persona's seeds in a report fixture. */
function seedsOf(taskId: string, profileId: string): ReportSeed[] {
  const result = reportFixture(taskId).personas.find((p) => p.profileId === profileId);
  if (result === undefined) throw new Error(`No ${profileId} in ${taskId}`);
  return result.seeds;
}

/** Each seed cell: its attributes and its inner markup. */
function cellsOf(html: string): { attributes: Record<string, string>; inner: string }[] {
  return [...html.matchAll(/<a(\s[^>]*)?>(.*?)<\/a>/gs)].map((m) => ({
    attributes: attributesOf(m[1] ?? ""),
    inner: m[2] ?? "",
  }));
}

test("the strip is a group under its label, one link per seed to its run", () => {
  const html = render(
    <SeedStrip seeds={seedsOf("task_past-order", "prof_kai")} label="Kai, seeds 1 to 3" />,
  );
  // A fieldset's role is group.
  expect(attributesOf(html.match(/^<fieldset(\s[^>]*)>/)?.[1] ?? "")["aria-label"]).toBe(
    "Kai, seeds 1 to 3",
  );
  expect(cellsOf(html).map((cell) => cell.attributes.href)).toEqual([
    "/runs/run_kai-past-order-1",
    "/runs/run_kai-past-order-2",
    "/runs/run_kai-past-order-3",
  ]);
  expect(cellsOf(html).every((cell) => cell.attributes.class?.includes("size-8"))).toBe(true);
});

test("each cell says its seed, its outcome word, its open routes and the run it opens", () => {
  const kai = cellsOf(
    render(<SeedStrip seeds={seedsOf("task_past-order", "prof_kai")} label="Kai" />),
  );
  expect(kai.map((cell) => cell.attributes["aria-label"])).toEqual([
    "seed 1: Gave up, routes open: B, C. Opens run_kai-past-order-1",
    "seed 2: Got through, routes open: B, C. Opens run_kai-past-order-2",
    "seed 3: Over budget, routes open: B, C. Opens run_kai-past-order-3",
  ]);
  expect(kai.map((cell) => cell.attributes.title)).toEqual(
    kai.map((cell) => cell.attributes["aria-label"]),
  );

  const vera = cellsOf(
    render(<SeedStrip seeds={seedsOf("task_past-order", "prof_vera")} label="Vera" />),
  );
  expect(vera[1]?.attributes["aria-label"]).toBe(
    "seed 2: Gave up, routes open: none. Opens run_vera-past-order-2",
  );
  const easy = cellsOf(
    render(<SeedStrip seeds={seedsOf("task_next-parcel", "prof_vera")} label="Vera" />),
  );
  expect(easy.map((cell) => cell.attributes["aria-label"])).toEqual([
    "seed 1: Got through, no route table. Opens run_vera-next-parcel-1",
    "seed 2: Error, no route table. Opens run_vera-next-parcel-2",
  ]);
});

test("the border says the route: solid ink when open, dashed when closed, a hairline with no table", () => {
  const [open, closed] = cellsOf(
    render(<SeedStrip seeds={seedsOf("task_past-order", "prof_vera")} label="Vera" />),
  );
  expect(open?.attributes.class).toContain("border-solid");
  expect(open?.attributes.class).toContain("border-ink");
  expect(closed?.attributes.class).toContain("border-dashed");
  expect(closed?.attributes.class).toContain("border-line-strong");

  const [unknown] = cellsOf(
    render(<SeedStrip seeds={seedsOf("task_next-parcel", "prof_vera")} label="Vera" />),
  );
  // A 1 px line-strong border: seen at 3:1 on paper, yet thinner than an open seed's 2 px ink.
  expect(unknown?.attributes.class?.split(" ")).toEqual(
    expect.arrayContaining(["border", "border-solid", "border-line-strong"]),
  );
  expect(unknown?.attributes.class).not.toContain("border-2");
  // Dotted means soft (docs/DESIGN.md, Principle 3), so a seed with no route table is not dotted.
  expect(unknown?.attributes.class).not.toMatch(/border-(dashed|dotted|ink)/);
  expect([open, closed, unknown].map((cell) => cell?.attributes["data-route"])).toEqual([
    "open",
    "closed",
    "none",
  ]);
});

test("a seed that got through is filled with the persona; no other is", () => {
  const cells = cellsOf(
    render(<SeedStrip seeds={seedsOf("task_past-order", "prof_kai")} label="Kai" />),
  );
  expect(cells.map((cell) => cell.attributes.class?.includes("bg-(--p)"))).toEqual([
    false,
    true,
    false,
  ]);
});

test("a seed that errored is slashed in fault; no other is", () => {
  const cells = cellsOf(
    render(<SeedStrip seeds={seedsOf("task_next-parcel", "prof_vera")} label="Vera" />),
  );
  expect(cells.map((cell) => /<svg[^>]*text-fault/.test(cell.inner))).toEqual([false, true]);
  expect(cells[1]?.inner).toMatch(/<svg[^>]*aria-hidden="true"/);
});
