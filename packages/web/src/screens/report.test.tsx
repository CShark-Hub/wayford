import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { type FindingType, Report } from "@wayford/core";
import { reportFixture } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { reportQuery } from "../api/reports.js";
import { attributesOf, lineOf, rowsOf } from "../preview/rendered-markup.js";
import { createAppRouter } from "../router.js";

const HARD = reportFixture("task_past-order");
const EASY = reportFixture("task_next-parcel");

/**
 * `path` through the app's own router, with the query client seeded so no fetch runs: `report`
 * under its task's key, `null` as io's answer for a task with no report. With no `report` the
 * query is left pending.
 */
async function render(
  path: string,
  report?: Report | null,
  taskId = report?.taskId ?? HARD.taskId,
): Promise<string> {
  const client = new QueryClient();
  if (report !== undefined) client.setQueryData(reportQuery(taskId).queryKey, report);
  return renderWith(path, client);
}

/** `path` through the app's own router, with `client`'s cache as it stands. */
async function renderWith(path: string, client: QueryClient): Promise<string> {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** A client whose fetch of `taskId`'s report failed, as it does while io is down. */
async function ioDown(taskId: string): Promise<QueryClient> {
  // `retryOnMount: false` keeps the failure: a static render puts a failed query back to pending.
  const client = new QueryClient({ defaultOptions: { queries: { retryOnMount: false } } });
  await client.prefetchQuery({
    ...reportQuery(taskId),
    queryFn: () => Promise.reject(new Error("io answered 502")),
  });
  return client;
}

/** The text of the page's `<h1>`. */
function h1Of(html: string): string {
  return lineOf(html.match(/<h1(?:\s[^>]*)?>(.*?)<\/h1>/s)?.[1] ?? "");
}

/** The report's header: from its `<h1>` to the end of the `<header>` holding it. */
function headerOf(html: string): string {
  const start = html.indexOf("<h1");
  return html.slice(start, html.indexOf("</header>", start));
}

/** The heading word of each finding type's group. */
const GROUP: Record<FindingType, string> = {
  measurement: "Measurement",
  deterministic: "Deterministic",
  hypothesis: "Hypothesis",
};

/** A group of findings: its `<h2>`'s markup, and the markup of the section it heads. */
function groupOf(html: string, type: FindingType): { heading: string; body: string } {
  const sections = [...html.matchAll(/<section(\s[^>]*)>(.*?)<\/section>/gs)];
  for (const section of sections) {
    const heading = section[2]?.match(/<h2(?:\s[^>]*)?>(.*?)<\/h2>/s)?.[1];
    if (heading !== undefined && lineOf(heading).startsWith(GROUP[type])) {
      return { heading, body: section[2] ?? "" };
    }
  }
  throw new Error(`no group headed ${GROUP[type]}`);
}

/** Each finding card in `html`: its attributes and its text on one line. */
function cardsOf(html: string): { attributes: Record<string, string>; text: string }[] {
  return [...html.matchAll(/<article(\s[^>]*)>(.*?)<\/article>/gs)].map((m) => ({
    attributes: attributesOf(m[1] ?? ""),
    text: lineOf(m[2] ?? ""),
  }));
}

/** The cast table's row of `profileId`: each cell's markup. */
function castRowOf(html: string, profileId: string): string[] {
  const row = html.match(new RegExp(`<tr [^>]*data-persona="${profileId}"[^>]*>(.*?)</tr>`, "s"));
  if (row?.[1] === undefined) throw new Error(`no cast row for ${profileId}`);
  return [...row[1].matchAll(/<t[hd](?:\s[^>]*)?>(.*?)<\/t[hd]>/gs)].map((cell) => cell[1] ?? "");
}

/** Each link in `html`: its attributes. */
function linksOf(html: string): Record<string, string>[] {
  return [...html.matchAll(/<a(\s[^>]*)?>/g)].map((m) => attributesOf(m[1] ?? ""));
}

/** Each `<a>` whose text is `text`: its attributes. */
function linksReading(html: string, text: string): Record<string, string>[] {
  return [...html.matchAll(/<a(\s[^>]*)?>(.*?)<\/a>/gs)]
    .filter((a) => lineOf(a[2] ?? "") === text)
    .map((a) => attributesOf(a[1] ?? ""));
}

/** Each `<button>`'s text. */
function buttonsOf(html: string): string[] {
  return [...html.matchAll(/<button(?:\s[^>]*)?>(.*?)<\/button>/gs)].map((m) => lineOf(m[1] ?? ""));
}

/** The page's `<footer>` inside the report, as lines: each `<p>` and `<li>`. */
function footerLines(html: string): string[] {
  const footer = html.match(/<footer(?:\s[^>]*)?>(.*?)<\/footer>/s)?.[1] ?? "";
  return [...footer.matchAll(/<(p|li)(?:\s[^>]*)?>(.*?)<\/\1>/gs)].map((m) => lineOf(m[2] ?? ""));
}

/** A readout's figure with its spaces gone: "3/3", or "—" and its reason. */
function figure(cell: string): string {
  return lineOf(cell).replace(/ /g, "");
}

describe("the header", () => {
  test("the goal sentence from the bundled tasks, in the <h1>", async () => {
    expect(h1Of(await render("/report/task_past-order", HARD))).toBe(
      "“you want to see what you ordered three months ago”",
    );
  });

  test("the meta line: task id, runs, Scout, and the cost of runs and Analyst in all", async () => {
    const header = lineOf(headerOf(await render("/report/task_past-order", HARD)));
    expect(header).toContain(
      "task_past-order · 9 runs · Scout reached it in 2 steps · $0.0049 in all",
    );
  });

  test("Scout's line when it did not reach the goal", async () => {
    const report = Report.parse({
      ...HARD,
      scout: {
        status: "notReached",
        attempts: 3,
        modelId: "openai/gpt-6-luna",
        recordedAt: "2026-10-03T12:00:00.000Z",
      },
    });
    const header = lineOf(headerOf(await render("/report/task_past-order", report)));
    expect(header).toContain("· Scout did not reach it in 3 attempts ·");
  });

  test("Scout's line on a goal with no ground truth", async () => {
    const header = lineOf(headerOf(await render("/report/task_next-parcel", EASY)));
    expect(header).toContain("task_next-parcel · 6 runs · no ground truth · $0.0019 in all");
  });

  test("an Analyse again button", async () => {
    expect(buttonsOf(await render("/report/task_past-order", HARD))).toContain("Analyse again");
  });
});

describe("the cast table", () => {
  test("a legend of the seed cell above it", async () => {
    const html = await render("/report/task_past-order", HARD);
    const legend = html.match(/<ul [^>]*aria-label="Seed cell legend"[^>]*>(.*?)<\/ul>/s)?.[1];
    expect(legend).toBeDefined();
    expect(
      [...(legend ?? "").matchAll(/<li(?:\s[^>]*)?>(.*?)<\/li>/gs)].map((m) => lineOf(m[1] ?? "")),
    ).toEqual(["route open", "got through", "every route closed", "error"]);
    expect(html.indexOf("Seed cell legend")).toBeLessThan(html.indexOf("<table"));
  });

  test("on a goal with no route table, the legend names that border instead of open and closed", async () => {
    const html = await render("/report/task_next-parcel", EASY);
    const legend = html.match(/<ul [^>]*aria-label="Seed cell legend"[^>]*>(.*?)<\/ul>/s)?.[1];
    expect(
      [...(legend ?? "").matchAll(/<li(?:\s[^>]*)?>(.*?)<\/li>/gs)].map((m) => lineOf(m[1] ?? "")),
    ).toEqual(["no route table", "got through", "error"]);
  });

  test("one row per persona, in report order, under the six columns", async () => {
    const html = await render("/report/task_past-order", HARD);
    expect(rowsOf(html)[0]).toEqual([
      "persona",
      "seeds 1–3",
      "route open",
      "got through",
      "gap",
      "median time",
    ]);
    const rows = [...html.matchAll(/<tr [^>]*data-persona="([^"]+)"/g)].map((m) => m[1] ?? "");
    expect(rows).toEqual(["prof_ada", "prof_kai", "prof_vera"]);
    // The avatar's own title stays its own: the name is the pick link's text.
    const names = rows.map((id) => {
      const anchor = castRowOf(html, id)[0]?.match(/<a(?:\s[^>]*)?>(.*?)<\/a>/s)?.[1] ?? "";
      return lineOf(anchor);
    });
    expect(names).toEqual(["Ada", "Kai", "Vera"]);
  });

  test("each row sets its persona's slot", async () => {
    const html = await render("/report/task_past-order", HARD);
    expect(html).toMatch(
      /<tr [^>]*data-persona="prof_kai"[^>]*style="--p:var\(--persona-raspberry\)/,
    );
  });

  test.each([
    ["prof_ada", "3/3", "3/3", "10.4 s"],
    ["prof_kai", "3/3", "1/3", "31.6 s"],
    ["prof_vera", "1/3", "0/3", "—no run got through"],
  ])("%s reads route open %s and got through %s, median %s", async (id, open, through, median) => {
    const cells = castRowOf(await render("/report/task_past-order", HARD), id);
    expect(figure(cells[2] ?? "")).toBe(open);
    expect(figure(cells[3] ?? "")).toBe(through);
    expect(figure(cells[5] ?? "")).toBe(median.replace(/ /g, ""));
  });

  test("route open opens the persona's runs on the goal; got through the ones that got through", async () => {
    const cells = castRowOf(await render("/report/task_past-order", HARD), "prof_kai");
    expect(linksOf(cells[2] ?? "").map((a) => a.href)).toEqual([
      "/runs?taskId=task_past-order&profileId=prof_kai",
    ]);
    expect(linksOf(cells[3] ?? "").map((a) => a.href)).toEqual([
      "/runs?taskId=task_past-order&profileId=prof_kai&outcome=success",
    ]);
  });

  test("on the easy goal, route open reads — with its reason", async () => {
    const html = await render("/report/task_next-parcel", EASY);
    for (const persona of EASY.personas) {
      const cell = castRowOf(html, persona.profileId)[2] ?? "";
      expect(figure(cell)).toBe("—noroutetableforthisgoal");
      expect(cell).toMatch(/title="no route table for this goal"/);
      expect(linksOf(cell)).toEqual([]);
    }
  });

  test("on the easy goal, Vera's got through leaves her errored run out and says so", async () => {
    const cells = castRowOf(await render("/report/task_next-parcel", EASY), "prof_vera");
    expect(lineOf(cells[3] ?? "")).toBe("1 /1 1 error");
    expect(cells[3]).toMatch(/<p class="[^"]*text-ink-2[^"]*">1 error<\/p>/);
  });

  test("every text cell holds its text in a <p>, so check:self measures it", async () => {
    const html = await render("/report/task_past-order", HARD);
    const table = html.match(/<table(?:\s[^>]*)?>(.*?)<\/table>/s)?.[1] ?? "";
    for (const cell of table.matchAll(/<t[hd](?:\s[^>]*)?>(.*?)<\/t[hd]>/gs)) {
      const inner = cell[1] ?? "";
      if (lineOf(inner) === "") continue;
      expect(inner).toMatch(/<p[\s>]/);
    }
  });
});

describe("the findings", () => {
  test("on the hard goal's report, each finding is in its own group", async () => {
    const html = await render("/report/task_past-order", HARD);
    for (const finding of HARD.findings) {
      for (const type of ["measurement", "deterministic", "hypothesis"] as const) {
        const titles = cardsOf(groupOf(html, type).body).map((card) => card.text);
        expect(titles.some((text) => text.includes(finding.title))).toBe(type === finding.type);
      }
    }
  });

  test("each group is headed by its glyph, its name, its count and what it is", async () => {
    const html = await render("/report/task_past-order", HARD);
    expect(lineOf(groupOf(html, "measurement").heading)).toBe("Measurement 1 the page, by axe");
    expect(lineOf(groupOf(html, "deterministic").heading)).toBe(
      "Deterministic 2 the filter, in code",
    );
    expect(lineOf(groupOf(html, "hypothesis").heading)).toBe("Hypothesis 1 read from the runs");
    expect(groupOf(html, "measurement").heading).toMatch(/data-line="measured"/);
    expect(groupOf(html, "deterministic").heading).toMatch(/data-line="deterministic"/);
    expect(groupOf(html, "hypothesis").heading).toMatch(/data-line="hypothesis"/);
  });

  test("an empty group says so", async () => {
    const html = await render("/report/task_next-parcel", EASY);
    expect(lineOf(groupOf(html, "measurement").body)).toContain("None in this group.");
    expect(lineOf(groupOf(html, "deterministic").body)).toContain("None in this group.");
  });

  test.each([
    ["the hard goal", HARD],
    ["the easy goal", EASY],
  ])("on %s, every evidence chip links to /runs/<runId>?step=<n>", async (_, report) => {
    const html = await render(`/report/${report.taskId}`, report);
    const expected = report.findings
      .flatMap((f) => f.evidence.map((ref) => `/runs/${ref.runId}?step=${ref.stepIndex}`))
      .sort();
    const chips = linksOf(html)
      .map((a) => a.href ?? "")
      .filter((href) => href.includes("?step="))
      .sort();
    expect(chips).toEqual(expected);
  });
});

describe("a persona picked", () => {
  const PATH = "/report/task_past-order?persona=prof_kai";

  test("narrows the findings to Kai's and keeps the measurement", async () => {
    const titles = cardsOf(await render(PATH, HARD)).map((card) => card.text);
    expect(titles.some((t) => t.includes("cut by A1 for Kai"))).toBe(true);
    expect(titles.some((t) => t.includes("measures 2.005:1"))).toBe(true);
    expect(titles.some((t) => t.includes("for Vera"))).toBe(false);
    expect(titles.some((t) => t.includes("masked name"))).toBe(false);
  });

  test("says so above the findings, with Show all", async () => {
    const html = await render(PATH, HARD);
    expect(lineOf(html)).toContain("Kai's findings and the page's measurements. Show all");
    expect(linksReading(html, "Show all").map((a) => a.href)).toEqual(["/report/task_past-order"]);
    expect(html.indexOf("Show all")).toBeLessThan(html.indexOf("<h2"));
  });

  test("counts N of M, and an emptied group names Kai", async () => {
    const html = await render(PATH, HARD);
    expect(lineOf(groupOf(html, "measurement").heading)).toBe(
      "Measurement 1 of 1 the page, by axe",
    );
    expect(lineOf(groupOf(html, "deterministic").heading)).toBe(
      "Deterministic 1 of 2 the filter, in code",
    );
    expect(lineOf(groupOf(html, "hypothesis").heading)).toBe(
      "Hypothesis 0 of 1 read from the runs",
    );
    expect(lineOf(groupOf(html, "hypothesis").body)).toContain("None of Kai's in this group.");
  });

  test("marks Kai's row current, and no other", async () => {
    const html = await render(PATH, HARD);
    const current = linksOf(html).filter((a) => a["aria-current"] === "true");
    expect(current.map((a) => a.href)).toEqual(["/report/task_past-order"]);
    expect(linksOf(castRowOf(html, "prof_kai")[0] ?? "")).toEqual([current[0]]);
  });

  test("with no persona picked, each name picks its own", async () => {
    const html = await render("/report/task_past-order", HARD);
    expect(linksOf(castRowOf(html, "prof_vera")[0] ?? "").map((a) => a.href)).toEqual([
      "/report/task_past-order?persona=prof_vera",
    ]);
    expect(linksOf(html).some((a) => a["aria-current"] === "true")).toBe(false);
    expect(linksReading(html, "Show all")).toEqual([]);
  });
});

describe("the footer", () => {
  test("when, in UTC, and by which model", async () => {
    expect(footerLines(await render("/report/task_past-order", HARD))[0]).toBe(
      "Analysed 5 Oct 2026, 14:20 UTC by openai/gpt-6-luna.",
    );
  });

  test("the runs left out, zero terms dropped, then the closures with their lead-in", async () => {
    expect(footerLines(await render("/report/task_past-order", HARD)).slice(1)).toEqual([
      "Left out: 2 older runs, 3 runs on the llm backend.",
      "Closed with no evidence step:",
      "Vera · route B · /account · button “More options” · P4 · 3 seeds",
      "Vera · route C · /settings · link “Your data” · P4 · 3 seeds",
    ]);
  });

  test("on a report of the llm backend, the runs left out are on jev", async () => {
    const report = Report.parse({ ...HARD, backend: "llm" });
    expect(footerLines(await render("/report/task_past-order", report))[1]).toBe(
      "Left out: 2 older runs, 3 runs on the jev backend.",
    );
  });

  test("with nothing left out and no closure, the time alone", async () => {
    expect(footerLines(await render("/report/task_next-parcel", EASY))).toEqual([
      "Analysed 5 Oct 2026, 14:22 UTC by openai/gpt-6-luna.",
    ]);
  });
});

describe("the states before a report is shown", () => {
  test("pending: the goal sentence, then a skeleton per cast row and per findings column", async () => {
    const html = await render("/report/task_past-order");
    expect(h1Of(html)).toBe("“you want to see what you ordered three months ago”");
    expect(html.match(/data-slot="skeleton"/g)).toHaveLength(6);
    expect(html).not.toMatch(/<table/);
  });

  test("a task the bundled goals lack is headed by its id", async () => {
    expect(h1Of(await render("/report/task_other", null, "task_other"))).toBe("task_other");
  });

  test("no report: the empty state, offering to analyse the runs", async () => {
    const html = await render("/report/task_past-order", null);
    const text = lineOf(html);
    expect(text).toContain("no report");
    expect(text).toContain("No report on this goal yet.");
    expect(text).toContain(
      "The Analyst reads the latest run of each persona and seed on this goal, all personas at once.",
    );
    expect(buttonsOf(html)).toContain("Analyse runs");
    expect(html).not.toMatch(/<table/);
  });

  test("io down: a fault banner with the message, and Try again", async () => {
    const html = await renderWith("/report/task_past-order", await ioDown("task_past-order"));
    const alert = html.match(/<div role="alert"[^>]*>(.*?)<\/div><\/div>/s)?.[1] ?? "";
    expect(lineOf(alert)).toContain("io answered 502");
    expect(alert).toMatch(/<span class="[^"]*mono[^"]*">io answered 502<\/span>/);
    expect(buttonsOf(html)).toContain("Try again");
    expect(html).not.toMatch(/data-slot="skeleton"/);
  });

  test("io down after a report was read: the stored report stays, with no fault banner", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retryOnMount: false } } });
    client.setQueryData(reportQuery("task_past-order").queryKey, HARD);
    await client.prefetchQuery({
      ...reportQuery("task_past-order"),
      queryFn: () => Promise.reject(new Error("io answered 502")),
    });
    const html = await renderWith("/report/task_past-order", client);
    expect(html).toMatch(/<table/);
    expect(html).not.toContain('role="alert"');
  });
});
