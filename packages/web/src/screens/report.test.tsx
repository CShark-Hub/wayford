import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { type FindingType, Report, Task } from "@wayford/core";
import { reportFixture } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { reportQuery } from "../api/reports.js";
import { storedTaskQuery } from "../api/runs.js";
import { attributesOf, lineOf, rowsOf } from "../preview/rendered-markup.js";
import { createAppRouter } from "../router.js";

const HARD = reportFixture("task_past-order");
const EASY = reportFixture("task_next-parcel");

/** A goal checked on the Target screen: stored in io, and in none of the bundled tasks. */
const CHECKED = Task.parse({
  id: "task_01m4fn3h6zeaek4sp5me256cyz",
  goal: "Find the names of the company's board members.",
  startUrl: "https://example.com/",
  success: { type: "urlMatches", pattern: "**/about/board" },
});

/**
 * `path` through the app's own router, with the query client seeded so no fetch runs: `report`
 * under its task's key, `null` as io's answer for a task with no report, and `task` under its id
 * as the Target screen's check caches it, `null` as io holding no task under the id. With no
 * `report`, or no `task`, that query is left pending.
 */
async function render(
  path: string,
  report?: Report | null,
  taskId = report?.taskId ?? HARD.taskId,
  task?: Task | null,
): Promise<string> {
  const client = new QueryClient();
  if (report !== undefined) client.setQueryData(reportQuery(taskId).queryKey, report);
  if (task !== undefined) client.setQueryData(storedTaskQuery(taskId).queryKey, task);
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

  test("the meta line: task id, backend, runs, Scout, and the cost of runs and Analyst in all", async () => {
    const header = lineOf(headerOf(await render("/report/task_past-order", HARD)));
    expect(header).toContain(
      "task_past-order · jev · 9 runs · Scout reached it in 2 steps · $0.0049 in all",
    );
  });

  test("the meta line takes the backend from the report, and the page draws no source badge", async () => {
    const html = await render("/report/task_past-order", Report.parse({ ...HARD, backend: "llm" }));
    expect(lineOf(headerOf(html))).toContain("task_past-order · llm · 9 runs");
    expect(html).not.toContain("data-source");
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
    expect(header).toContain("task_next-parcel · jev · 6 runs · no ground truth · $0.0019 in all");
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
      "median simulated time",
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
    // The simulated medians, not the wall-clock ones the report also keeps: 10.4 s and 31.6 s.
    ["prof_ada", "3/3", "3/3", "4.5 s"],
    ["prof_kai", "3/3", "1/3", "11.2 s"],
    ["prof_vera", "1/3", "0/3", "—no run got through"],
  ])("%s reads route open %s and got through %s, median %s", async (id, open, through, median) => {
    const cells = castRowOf(await render("/report/task_past-order", HARD), id);
    expect(figure(cells[2] ?? "")).toBe(open);
    expect(figure(cells[3] ?? "")).toBe(through);
    expect(figure(cells[5] ?? "")).toBe(median.replace(/ /g, ""));
  });

  test("a median the report has no simulated time for reads — and says why: no success, or runs stored before simulated time", async () => {
    // Ada's median absent, as a report stored before s2-09 has it; Kai's null, as io writes it when
    // none of his successes carries a time. Vera got through on no seed.
    const [ada, kai, vera] = HARD.personas;
    if (ada === undefined || kai === undefined || vera === undefined) {
      throw new Error("the hard goal's report holds three personas");
    }
    const { medianSimulatedMs: _, ...adaBefore } = ada;
    const report = Report.parse({
      ...HARD,
      personas: [adaBefore, { ...kai, medianSimulatedMs: null }, vera],
    });
    const html = await render("/report/task_past-order", report);
    for (const [id, reason] of [
      ["prof_ada", "not timed: runs stored before simulated time"],
      ["prof_kai", "not timed: runs stored before simulated time"],
      ["prof_vera", "no run got through"],
    ] as const) {
      const cell = castRowOf(html, id)[5] ?? "";
      expect(figure(cell), id).toBe(`—${reason.replace(/ /g, "")}`);
      expect(attributesOf(cell.match(/<p(\s[^>]*)>/)?.[1] ?? "").title, id).toBe(reason);
    }
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

/** The why line under `profileId`'s cast row (#238): its markup, or undefined when it has none. */
function whyOf(html: string, profileId: string): string | undefined {
  return html.match(new RegExp(`<tr [^>]*data-why="${profileId}"[^>]*>(.*?)</tr>`, "s"))?.[1];
}

/** The why line under `profileId`'s row, which must be there. */
function whyLineOf(html: string, profileId: string): string {
  const why = whyOf(html, profileId);
  if (why === undefined) throw new Error(`no why line under ${profileId}'s row`);
  return why;
}

describe("the why line under a cast row (#238)", () => {
  test("a persona who got through on every seed has none", async () => {
    const html = await render("/report/task_past-order", HARD);
    expect(whyOf(html, "prof_ada")).toBeUndefined();
    // The two who did not get through on every seed each have one, under their own row.
    const order = [...html.matchAll(/<tr [^>]*data-(persona|why)="([^"]+)"/g)].map(
      (m) => `${m[1]}:${m[2]}`,
    );
    expect(order).toEqual([
      "persona:prof_ada",
      "persona:prof_kai",
      "why:prof_kai",
      "persona:prof_vera",
      "why:prof_vera",
    ]);
  });

  test("Vera's: her seeds by how they ended, then her deterministic finding, linked to its card with her picked", async () => {
    const why = whyLineOf(await render("/report/task_past-order", HARD), "prof_vera");
    expect(lineOf(why)).toMatch(/^3 seeds: Gave up in 2 · Over budget in 1 deterministic /);
    // Each count opens the runs of its outcome, and says they can include runs the report leaves
    // out (the hard goal's report leaves out 2 older runs), as the readouts do.
    const counts = [...linksReading(why, "Gave up in 2"), ...linksReading(why, "Over budget in 1")];
    expect(counts.map((a) => a.href)).toEqual([
      "/runs?taskId=task_past-order&profileId=prof_vera&outcome=gave_up",
      "/runs?taskId=task_past-order&profileId=prof_vera&outcome=budget_exceeded",
    ]);
    expect(counts.map((a) => a.title)).toEqual([
      "Every stored run of Vera on this goal marked Gave up, which can include runs this report leaves out",
      "Every stored run of Vera on this goal marked Over budget, which can include runs this report leaves out",
    ]);
    const p1 = HARD.findings.find((finding) => finding.id === "fnd_vera-order-archive-p1");
    expect(linksReading(why, p1?.title ?? "").map((a) => a.href)).toEqual([
      "/report/task_past-order?persona=prof_vera#fnd_vera-order-archive-p1",
    ]);
    expect(why).toMatch(/<span aria-hidden="true" data-line="deterministic"/);
  });

  test("Kai's finding rests on a folk threshold, so it keeps its soft line and says so", async () => {
    const why = whyLineOf(await render("/report/task_past-order", HARD), "prof_kai");
    expect(lineOf(why)).toMatch(/^3 seeds: Gave up in 1 · Over budget in 1 soft /);
    expect(why).toMatch(/<span aria-hidden="true" data-line="soft"/);
    expect(linksOf(why).at(-1)?.href).toBe(
      "/report/task_past-order?persona=prof_kai#fnd_kai-order-archive-a1",
    );
  });

  test("a hypothesis keeps its dashed glyph", async () => {
    const why = whyLineOf(await render("/report/task_next-parcel", EASY), "prof_kai");
    expect(lineOf(why)).toMatch(/^2 seeds: Gave up in 1 hypothesis /);
    expect(why).toMatch(/<span aria-hidden="true" data-line="hypothesis"/);
    expect(linksOf(why).at(-1)?.href).toBe(
      "/report/task_next-parcel?persona=prof_kai#fnd_kai-passes-over-address-on-account",
    );
  });

  test("the deterministic finding leads, wherever the report lists it", async () => {
    // Vera's hypothesis moved ahead of her deterministic finding.
    const report = Report.parse({ ...HARD, findings: [...HARD.findings].reverse() });
    const why = whyLineOf(await render("/report/task_past-order", report), "prof_vera");
    expect(linksOf(why).at(-1)?.href).toBe(
      "/report/task_past-order?persona=prof_vera#fnd_vera-order-archive-p1",
    );
  });

  test("a persona no finding names says so, and opens its runs instead", async () => {
    const report = Report.parse({
      ...HARD,
      findings: HARD.findings.filter((finding) => !finding.personaIds.includes("prof_vera")),
    });
    const why = whyLineOf(await render("/report/task_past-order", report), "prof_vera");
    expect(lineOf(why)).toBe(
      "3 seeds: Gave up in 2 · Over budget in 1 No finding names Vera. Open Vera's runs",
    );
    expect(linksReading(why, "Open Vera's runs").map((a) => a.href)).toEqual([
      "/runs?taskId=task_past-order&profileId=prof_vera",
    ]);
    expect(why).not.toMatch(/data-line=/);
  });

  test("a persona whose only failed seed errored: the error is the tool's, and no finding is offered", async () => {
    // Every finding names Vera too, so a finding is there to offer, and is not.
    const report = Report.parse({
      ...EASY,
      findings: EASY.findings.map((finding) => ({
        ...finding,
        personaIds: [...finding.personaIds, "prof_vera"],
      })),
    });
    const why = whyLineOf(await render("/report/task_next-parcel", report), "prof_vera");
    expect(lineOf(why)).toBe(
      "2 seeds: Error in 1 An error is the tool's, not Vera's. Open Vera's runs",
    );
    expect(why).not.toMatch(/data-line=/);
    expect(linksOf(why).some((a) => a.href?.includes("#"))).toBe(false);
    expect(linksReading(why, "Error in 1").map((a) => a.href)).toEqual([
      "/runs?taskId=task_next-parcel&profileId=prof_vera&outcome=error",
    ]);
  });

  test("a crash among Vera's own failed seeds still offers her finding", async () => {
    const vera = HARD.personas.find((result) => result.profileId === "prof_vera");
    if (vera === undefined) throw new Error("the hard goal's report has no Vera");
    const seeds = vera.seeds.map((seed) =>
      seed.outcome === "budget_exceeded" ? { ...seed, outcome: "error" as const } : seed,
    );
    const report = Report.parse({
      ...HARD,
      personas: HARD.personas.map((result) =>
        result.profileId === "prof_vera" ? { ...vera, seeds, errors: 1 } : result,
      ),
    });
    const why = whyLineOf(await render("/report/task_past-order", report), "prof_vera");
    expect(lineOf(why)).toMatch(/^3 seeds: Gave up in 2 · Error in 1 deterministic /);
  });

  test("every finding a line links to is a card on the page, under that id", async () => {
    for (const report of [HARD, EASY]) {
      const html = await render(`/report/${report.taskId}`, report);
      const anchors = report.personas.flatMap((result) =>
        linksOf(whyOf(html, result.profileId) ?? "")
          .map((a) => a.href?.split("#")[1])
          .filter((hash) => hash !== undefined),
      );
      expect(anchors.length).toBeGreaterThan(0);
      for (const id of anchors) {
        const card = html.match(new RegExp(`<div [^>]*id="${id}"[^>]*>\\s*<article`));
        expect(card, id).not.toBeNull();
      }
    }
  });

  test("a picked persona's line shares its row's ground", async () => {
    const html = await render("/report/task_past-order?persona=prof_vera", HARD);
    const tag = html.match(/<tr [^>]*data-why="prof_vera"[^>]*>/)?.[0] ?? "";
    expect(attributesOf(tag).class?.split(/\s+/)).toContain("bg-paper-sunken");
    const kai = html.match(/<tr [^>]*data-why="prof_kai"[^>]*>/)?.[0] ?? "";
    expect(attributesOf(kai).class?.split(/\s+/)).not.toContain("bg-paper-sunken");
    // The finding's link, which picks Vera and lands on its card, is not current until followed.
    for (const link of linksOf(whyLineOf(html, "prof_vera"))) {
      expect(link["aria-current"], link.href).toBeUndefined();
    }
  });

  test("no line diagnoses the persona, claims a closed route, or restates got through", async () => {
    const empty = Report.parse({ ...HARD, findings: [] });
    for (const [taskId, report] of [
      ["task_past-order", HARD],
      ["task_past-order", empty],
      ["task_next-parcel", EASY],
    ] as const) {
      const html = await render(`/report/${taskId}`, report);
      for (const result of report.personas) {
        const text = lineOf(whyOf(html, result.profileId) ?? "");
        expect(text).not.toMatch(
          /can't|cannot|could not|unable|impaired|disabled|blind|confused|predict|unreachable|route closes|got through|because/i,
        );
      }
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
    [
      "the hard goal",
      HARD,
      // Column by column. The hypothesis cites its run at steps 1 and 4, and links it once.
      [
        ["/runs/run_ada-past-order-1?step=1", "Ada, seed 1 · Got through"],
        ["/runs/run_kai-past-order-1?step=1", "Kai, seed 1 · Gave up"],
        ["/runs/run_kai-past-order-3?step=1", "Kai, seed 3 · Over budget"],
        ["/runs/run_vera-past-order-2?step=1", "Vera, seed 2 · Gave up"],
        ["/runs/run_vera-past-order-3?step=1", "Vera, seed 3 · Over budget"],
        ["/runs/run_vera-past-order-1?step=1", "Vera, seed 1 · Gave up"],
      ],
    ],
    [
      "the easy goal",
      EASY,
      [
        ["/runs/run_kai-next-parcel-1?step=1", "Kai, seed 1 · Got through"],
        ["/runs/run_kai-next-parcel-2?step=1", "Kai, seed 2 · Gave up"],
      ],
    ],
  ])(
    "on %s, each finding links its runs by persona and seed, once each",
    async (_, report, links) => {
      const html = await render(`/report/${report.taskId}`, report);
      const evidence = [...html.matchAll(/<a(\s[^>]*)>(.*?)<\/a>/gs)]
        .map((a) => [
          attributesOf(a[1] ?? "").href ?? "",
          lineOf((a[2] ?? "").replace(/<span aria-hidden="true"[^>]*>.*?<\/span>/gs, "")),
        ])
        .filter(([href]) => href?.includes("?step="));
      expect(evidence).toEqual(links);
    },
  );
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

  test("puts Kai's runs first in the evidence of a measurement that cites every run", async () => {
    const runs = HARD.personas.flatMap((result) => result.seeds.map((seed) => seed.runId));
    const everyRun = Report.parse({
      ...HARD,
      findings: HARD.findings.map((f) =>
        f.type === "measurement"
          ? { ...f, evidence: runs.map((runId) => ({ runId, stepIndex: 1 })) }
          : f,
      ),
    });
    const measurement = groupOf(await render(PATH, everyRun), "measurement").body;
    const links = [...measurement.matchAll(/<a(\s[^>]*)>(.*?)<\/a>/gs)].map((a) =>
      lineOf((a[2] ?? "").replace(/<span aria-hidden="true"[^>]*>.*?<\/span>/gs, "")),
    );
    expect(links).toEqual([
      "Kai, seed 1 · Gave up",
      "Kai, seed 2 · Got through",
      "Kai, seed 3 · Over budget",
    ]);
    // The other six runs of the nine are still there, behind the toggle.
    expect(buttonsOf(measurement)).toEqual(["Show 6 more"]);
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

  test("a task the bundled goals lack is headed by its id while io's task is read", async () => {
    expect(h1Of(await render("/report/task_other", null, "task_other"))).toBe("task_other");
  });

  test("a goal checked on the Target screen: its sentence, as the check cached it, in the <h1>", async () => {
    const html = await render(`/report/${CHECKED.id}`, null, CHECKED.id, CHECKED);
    expect(h1Of(html)).toBe("“Find the names of the company's board members.”");
  });

  test("a task neither the bundled goals nor io hold is headed by its id", async () => {
    const html = await render("/report/task_other", null, "task_other", null);
    expect(h1Of(html)).toBe("task_other");
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

describe("while the Analyst runs (#237)", () => {
  /**
   * A client holding this goal's analysis, running and never answering, as `useMutation` leaves it
   * once its POST is sent; with `report`, that report stored, else io's answer of none.
   */
  function analysing(taskId: string, report: Report | null): QueryClient {
    const client = new QueryClient();
    client.setQueryData(reportQuery(taskId).queryKey, report);
    void client
      .getMutationCache()
      .build(client, { mutationKey: ["analyse", taskId], mutationFn: () => new Promise(() => {}) })
      .execute(undefined);
    return client;
  }

  /** The screen's own status region, not the skeleton's: what a screen reader hears of the Analyst. */
  function analystStatusOf(html: string): string[] {
    return [...html.matchAll(/<p role="status" class="sr-only">(.*?)<\/p>/gs)].map((m) =>
      lineOf(m[1] ?? ""),
    );
  }

  test("with no report stored, the posts and the Analyst's line stand in the empty state, in place of its button", async () => {
    const html = await renderWith("/report/task_past-order", analysing(HARD.taskId, null));
    const empty = html.match(/No report on this goal yet\.(.*)$/s)?.[1] ?? "";
    expect(empty).toContain('data-slot="working"');
    expect(empty).toContain('aria-live="off"');
    expect(lineOf(empty)).toContain("so far");
    expect(buttonsOf(html)).not.toContain("Analyse runs");
    expect(analystStatusOf(html)).toEqual([
      "Analysing the stored runs. This can take a few minutes.",
    ]);
  });

  test("with a report stored, the posts stand under the header and Analyse again says it runs", async () => {
    const html = await renderWith("/report/task_past-order", analysing(HARD.taskId, HARD));
    const posts = html.indexOf('data-slot="working"');
    expect(posts).toBeGreaterThan(html.indexOf("</header>"));
    expect(posts).toBeLessThan(html.indexOf("<table"));
    expect(buttonsOf(html)).toContain("Analysing…");
    expect(analystStatusOf(html)).toEqual([
      "Analysing the stored runs. This can take a few minutes.",
    ]);
  });

  test("the time counts from when the analysis was asked for, not from the render, as after a visit elsewhere", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
      const client = analysing(HARD.taskId, null);
      vi.setSystemTime(new Date("2026-10-09T12:01:30Z"));
      const html = await renderWith("/report/task_past-order", client);
      expect(lineOf(html)).toContain("· 1:30 so far");
    } finally {
      vi.useRealTimers();
    }
  });

  test("an analysis that ended before this render announces nothing: the end is said only after a start was", async () => {
    const client = new QueryClient();
    client.setQueryData(reportQuery(HARD.taskId).queryKey, HARD);
    await client
      .getMutationCache()
      .build(client, { mutationKey: ["analyse", HARD.taskId], mutationFn: async () => HARD })
      .execute(undefined);
    const html = await renderWith("/report/task_past-order", client);
    expect(analystStatusOf(html)).toEqual([""]);
  });

  test("an analysis another screen or visit started that failed shows the fault, over the stored report", async () => {
    const client = new QueryClient();
    client.setQueryData(reportQuery(HARD.taskId).queryKey, HARD);
    await client
      .getMutationCache()
      .build(client, {
        mutationKey: ["analyse", HARD.taskId],
        mutationFn: () => Promise.reject(new Error("io answered 502: llm_timeout")),
      })
      .execute(undefined)
      .catch(() => {});
    const html = await renderWith("/report/task_past-order", client);
    const alert = html.match(/<div role="alert"[^>]*>(.*?)<\/div><\/div>/s)?.[1] ?? "";
    expect(lineOf(alert)).toContain("The runs could not be analysed. io answered 502: llm_timeout");
    expect(buttonsOf(html)).toContain("Try again");
    expect(html).toMatch(/<table/);
    expect(analystStatusOf(html)).toEqual([""]);
  });
});
