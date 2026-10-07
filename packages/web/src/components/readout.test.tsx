import { createMemoryHistory, RouterContextProvider } from "@tanstack/react-router";
import type { ReportSeed } from "@wayford/core";
import { reportFixture } from "@wayford/core/fixtures";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { attributesOf, lineOf } from "../preview/rendered-markup.js";
import { createAppRouter } from "../router.js";
import { GapBar, gapCounts, Readout } from "./readout.js";

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

/** A seed with `outcome` and `openRoutes`, numbered `seed`. */
function seed(
  n: number,
  outcome: ReportSeed["outcome"],
  openRoutes: ReportSeed["openRoutes"],
): ReportSeed {
  return { seed: n, runId: `run_probe-${n}`, outcome, openRoutes };
}

/** Each link in `html`: its attributes. */
function linksOf(html: string): Record<string, string>[] {
  return [...html.matchAll(/<a(\s[^>]*)?>/g)].map((m) => attributesOf(m[1] ?? ""));
}

const KAI = { taskId: "task_past-order", profileId: "prof_kai" } as const;
const OPENS = "Every stored run of Kai on this goal";

describe("Readout", () => {
  test("route open reads k/n in a <p>, linked to the persona's runs, with no underline", () => {
    const html = render(
      <Readout
        kind="routeOpen"
        value={{ k: 3, n: 3 }}
        to={{ to: "/runs", search: KAI }}
        opens={OPENS}
      />,
    );
    expect(html).toMatch(/^<p[^>]*data-kind="routeOpen"/);
    expect(lineOf(html).replace(/ /g, "")).toBe("3/3");
    expect(html).toMatch(/<span class="[^"]*readout[^"]*text-ink[^"]*">3<\/span>/);
    expect(linksOf(html).map((a) => a.href)).toEqual([
      "/runs?taskId=task_past-order&profileId=prof_kai",
    ]);
    // The runs screen can only select a superset of what the number counts, so the link says so.
    expect(linksOf(html).map((a) => a.title)).toEqual([OPENS]);
    expect(html).not.toContain("border-dashed");
  });

  test("got through reads k/n with a dashed underline, linked to the runs that got through", () => {
    const html = render(
      <Readout
        kind="gotThrough"
        value={{ k: 1, n: 3 }}
        to={{ to: "/runs", search: { ...KAI, outcome: "success" } }}
        opens={OPENS}
      />,
    );
    expect(lineOf(html).replace(/ /g, "")).toBe("1/3");
    expect(html).toContain("border-dashed");
    expect(linksOf(html).map((a) => a.href)).toEqual([
      "/runs?taskId=task_past-order&profileId=prof_kai&outcome=success",
    ]);
  });

  test("got through at 0 has no run to open, so it stays plain text", () => {
    const html = render(
      <Readout
        kind="gotThrough"
        value={{ k: 0, n: 3 }}
        to={{ to: "/runs", search: { ...KAI, outcome: "success" } }}
        opens={OPENS}
      />,
    );
    expect(lineOf(html).replace(/ /g, "")).toBe("0/3");
    expect(linksOf(html)).toEqual([]);
    expect(html).toContain("border-dashed");
  });

  test("route open at 0 still opens the persona's runs: they are the evidence behind the 0", () => {
    const html = render(
      <Readout
        kind="routeOpen"
        value={{ k: 0, n: 3 }}
        to={{ to: "/runs", search: KAI }}
        opens={OPENS}
      />,
    );
    expect(lineOf(html).replace(/ /g, "")).toBe("0/3");
    expect(linksOf(html).map((a) => a.href)).toEqual([
      "/runs?taskId=task_past-order&profileId=prof_kai",
    ]);
  });

  test.each([
    ["routeOpen", "no route table for this goal"],
    ["gotThrough", "every run errored"],
  ] as const)("%s with no value reads — with its reason, and opens nothing", (kind, reason) => {
    const html = render(
      <Readout kind={kind} value={null} to={{ to: "/runs", search: KAI }} opens={OPENS} />,
    );
    expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*>—<\/span>/);
    expect(attributesOf(html.match(/^<p(\s[^>]*)>/)?.[1] ?? "").title).toBe(reason);
    expect(html).toMatch(new RegExp(`<span class="sr-only">${reason}</span>`));
    expect(linksOf(html)).toEqual([]);
  });
});

describe("gapCounts", () => {
  test("counts each seed once: through, open but not through, closed", () => {
    expect(gapCounts(seedsOf("task_past-order", "prof_kai"))).toEqual({
      through: 1,
      gap: 2,
      closed: 0,
      total: 3,
      errors: 0,
    });
    expect(gapCounts(seedsOf("task_past-order", "prof_vera"))).toEqual({
      through: 0,
      gap: 1,
      closed: 2,
      total: 3,
      errors: 0,
    });
  });

  test("an errored seed is left out, even with a route open", () => {
    expect(
      gapCounts([
        seed(1, "gave_up", ["A"]),
        seed(2, "error", ["A"]),
        seed(3, "budget_exceeded", []),
      ]),
    ).toEqual({
      through: 0,
      gap: 1,
      closed: 1,
      total: 2,
      errors: 1,
    });
  });

  test("a success on a seed with every route closed counts as through", () => {
    expect(gapCounts([seed(1, "success", []), seed(2, "gave_up", [])])).toEqual({
      through: 1,
      gap: 0,
      closed: 1,
      total: 2,
      errors: 0,
    });
  });

  test("no route table, or every seed errored, has no gap to count", () => {
    expect(gapCounts(seedsOf("task_next-parcel", "prof_kai"))).toBeNull();
    expect(gapCounts([seed(1, "error", ["A"]), seed(2, "error", [])])).toBeNull();
  });
});

describe("GapBar", () => {
  test("draws through, the hatched gap and the closed rest, named for a screen reader", () => {
    const html = render(<GapBar seeds={seedsOf("task_past-order", "prof_vera")} />);
    const bar = attributesOf(html.match(/<div(\s[^>]*role="img"[^>]*)>/)?.[1] ?? "");
    expect(bar["aria-label"]).toBe("0 through, 1 open but not through, 2 closed");
    expect(html).toMatch(/data-part="through"[^>]*style="width:0%"/);
    expect(html).toMatch(/data-part="gap"[^>]*style="width:33.3/);
    expect(html).toMatch(/<p[^>]*text-ink-2[^>]*>1 open, not through<\/p>/);
  });

  test("names the errored seeds it leaves out", () => {
    const html = render(
      <GapBar
        seeds={[seed(1, "success", ["A"]), seed(2, "error", ["A"]), seed(3, "gave_up", ["A"])]}
      />,
    );
    const bar = attributesOf(html.match(/<div(\s[^>]*role="img"[^>]*)>/)?.[1] ?? "");
    expect(bar["aria-label"]).toBe(
      "1 through, 1 open but not through, 0 closed; 1 errored seed left out",
    );
    expect(html).toMatch(/data-part="through"[^>]*style="width:50%"/);
  });

  test.each([
    ["no route table", seedsOf("task_next-parcel", "prof_kai"), "no route table for this goal"],
    ["every seed errored", [seed(1, "error", ["A"])], "every run errored"],
  ])("with %s it reads — with its reason", (_, seeds, reason) => {
    const html = render(<GapBar seeds={seeds} />);
    expect(html).not.toContain('role="img"');
    expect(attributesOf(html.match(/^<p(\s[^>]*)>/)?.[1] ?? "").title).toBe(reason);
    expect(lineOf(html)).toBe(`— ${reason}`);
  });
});
