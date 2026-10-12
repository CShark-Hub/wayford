import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { Report } from "@wayford/core";
import { reportFixture } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { reportQuery } from "../api/reports.js";
import { attributesOf, elementOf, lineOf, sectionOf } from "../preview/rendered-markup.js";
import { createAppRouter } from "../router.js";

/** The hard goal's report, as stored: read by Jev. */
const HARD = reportFixture("task_past-order");
/** The same report, read from runs on the LLM, which write narration. */
const LLM = Report.parse({ ...HARD, backend: "llm" });

/**
 * `path` through the app's own router, with `client` seeded with `report` under its task's key, so
 * no fetch runs. The client is the caller's, so a test can read what the page left in it.
 */
async function render(path: string, report: Report, client = new QueryClient()): Promise<string> {
  client.setQueryData(reportQuery(report.taskId).queryKey, report);
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** The markup of the section headed "What they said". */
function said(html: string): string {
  return sectionOf(html, "What they said");
}

/**
 * Each link in `html`: its `href`, the text it shows, its arrow dropped, and its accessible name,
 * its `aria-label` when it has one and the text it shows when not.
 */
function linksOf(html: string): { href: string; shown: string; name: string }[] {
  return [...html.matchAll(/<a(\s[^>]*)>(.*?)<\/a>/gs)].map((a) => {
    const attributes = attributesOf(a[1] ?? "");
    const shown = lineOf((a[2] ?? "").replace(/<span aria-hidden="true"[^>]*>.*?<\/span>/gs, ""));
    return { href: attributes.href ?? "", shown, name: attributes["aria-label"] ?? shown };
  });
}

/** Each persona row's `data-said`, in order. */
function saidRowsOf(html: string): string[] {
  return [...html.matchAll(/<li(\s[^>]*)>/g)]
    .map((m) => attributesOf(m[1] ?? "")["data-said"])
    .filter((said) => said !== undefined);
}

describe("What they said (#197)", () => {
  test("the section is described by the label, so a screen reader hears it with the name", async () => {
    const html = await render("/report/task_past-order", HARD);
    const start = html.match(/<section [^>]*aria-labelledby="report-narration"[^>]*>/)?.[0] ?? "";
    const described = attributesOf(start)["aria-describedby"];
    expect(described).toBe("report-narration-label");
    expect(lineOf(elementOf(html, "p", `id="${described}"`))).toBe("narration · after the fact");
  });

  test("on a Jev report, one line says why there is no narration, and nothing links", async () => {
    const section = said(await render("/report/task_past-order", HARD));
    expect(lineOf(section)).toBe(
      "What they said narration · after the fact Every run in this report ran on Jev, and Jev writes no narration.",
    );
    expect(section).not.toContain("<a");
  });

  describe.each([
    ["every persona's findings", ""],
    ["Kai's findings picked", "?persona=prof_kai"],
  ])("on an LLM report, with %s", (_, search) => {
    const path = `/report/task_past-order${search}`;

    test("says what each link opens, then one row per persona, in report order", async () => {
      const section = said(await render(path, LLM));
      expect(lineOf(section)).toMatch(
        /^What they said narration · after the fact Each link opens the run at its narration, one line per step it stored\. /,
      );
      expect(saidRowsOf(section)).toEqual(["prof_ada", "prof_kai", "prof_vera"]);
    });

    test("one link per seed, to its run at the narration", async () => {
      const hrefs = linksOf(said(await render(path, LLM))).map((link) => link.href);
      expect(hrefs).toEqual(
        ["ada", "kai", "vera"].flatMap((persona) =>
          [1, 2, 3].map((seed) => `/runs/run_${persona}-past-order-${seed}#run-narration`),
        ),
      );
    });

    test("a link shows its seed and outcome, and is named for whose words it opens", async () => {
      const kai = linksOf(said(await render(path, LLM))).filter((link) =>
        link.href.startsWith("/runs/run_kai-"),
      );
      expect(kai.map((link) => link.shown)).toEqual([
        "seed 1 · Gave up",
        "seed 2 · Got through",
        "seed 3 · Over budget",
      ]);
      expect(kai.map((link) => link.name)).toEqual([
        "seed 1 · Gave up, what Kai said",
        "seed 2 · Got through, what Kai said",
        "seed 3 · Over budget, what Kai said",
      ]);
    });

    test("no link is named as an evidence link is", async () => {
      const html = await render(path, LLM);
      const evidence = linksOf(html)
        .filter((link) => link.href.includes("?step="))
        .map((link) => link.name);
      expect(evidence.length).toBeGreaterThan(0);
      // Some links to check, or the loop below would pass on a section with none.
      const own = linksOf(said(html));
      expect(own.length).toBeGreaterThan(0);
      for (const { name } of own) expect(evidence).not.toContain(name);
    });
  });

  test("sits under the findings and above the footer, and the findings keep their three groups", async () => {
    const html = await render("/report/task_past-order", LLM);
    const at = html.indexOf('aria-labelledby="report-narration"');
    expect(html.indexOf('id="findings-hypothesis"')).toBeGreaterThan(0);
    expect(html.indexOf('id="findings-hypothesis"')).toBeLessThan(at);
    expect(at).toBeLessThan(html.indexOf("<footer"));
    const headed = [...html.matchAll(/<section(?:\s[^>]*)?>(.*?)<\/section>/gs)].filter((s) =>
      /<header(?:\s[^>]*)?>.*?<h2[\s>]/s.test(s[1] ?? ""),
    );
    expect(headed).toHaveLength(3);
  });

  test("reads no run: the page leaves no query under runs", async () => {
    const client = new QueryClient();
    await render("/report/task_past-order", LLM, client);
    expect(client.getQueryCache().findAll({ queryKey: ["runs"] })).toEqual([]);
  });
});
