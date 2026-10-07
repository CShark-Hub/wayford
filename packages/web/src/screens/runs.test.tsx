/**
 * The runs list through the app's own router, against "Screens" → "/runs" and "Acceptance mapping"
 * in `docs/specs/2026-10-02-s3-04-dashboard.md`. Each test loads a URL into a fresh memory history
 * and renders the page with `renderToStaticMarkup`, as `router.test.tsx` does, inside a query
 * client seeded with the fixture runs and tasks, so no fetch runs: what a reloaded link opens with,
 * read off the markup, with no DOM library.
 *
 * The expected numbers are the ones `stats.test.ts` checks on `fixture-runs.ts`. Recharts draws
 * the glance; the tests read the table and the lines under the charts, never the chart's SVG.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import type { RunResult, Task } from "@wayford/core";
import { profileFixtures, taskFixtures } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { runsQuery, tasksQuery } from "../api/runs.js";
import {
  attributesOf,
  elementOf,
  lineOf,
  rowsOf,
  textOf,
  withoutNested,
} from "../preview/rendered-markup.js";
import { createAppRouter } from "../router.js";
import { fixtureRuns } from "../runs/fixture-runs.js";

const HARD = "task_past-order";
const EASY = "task_next-parcel";
const HARD_GOAL = "you want to see what you ordered three months ago";
const EASY_GOAL = "you want to know where your next parcel is going";

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * What the query client holds before the render. A key left undefined is never seeded. `down`
 * then fails the runs fetch, as it fails while io is down.
 */
type Seeded = { runs?: RunResult[] | undefined; tasks?: Task[] | undefined; down?: boolean };

/** A fresh app router, loaded at `path`, as a reload of the page gets it. */
async function routerAt(path: string) {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  return router;
}

/**
 * The page at `path` from a fresh router, as a reload opens it, with `seeded` in the query cache:
 * the fixture runs and tasks unless a test says otherwise.
 */
async function render(
  path: string,
  seeded: Seeded = { runs: fixtureRuns, tasks: taskFixtures },
): Promise<string> {
  const router = await routerAt(path);
  // `retryOnMount: false` keeps a failed query failed: a static render puts it back to pending.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false } },
  });
  if (seeded.runs !== undefined) client.setQueryData(runsQuery().queryKey, seeded.runs);
  if (seeded.tasks !== undefined) client.setQueryData(tasksQuery().queryKey, seeded.tasks);
  if (seeded.down) {
    await client.prefetchQuery({
      ...runsQuery(),
      queryFn: () => Promise.reject(new Error("io answered 502")),
    });
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

// A static render that warns or errors is a render a test would pass while the console fills up,
// Recharts' above all: every test fails on any console warning or error.
const consoleCalls: unknown[][] = [];

beforeEach(() => {
  consoleCalls.length = 0;
  for (const level of ["warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      consoleCalls.push([level, ...args]);
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  expect(consoleCalls).toEqual([]);
});

// ---------------------------------------------------------------------------
// Reading the markup
// ---------------------------------------------------------------------------

/** The content of the first `<tag>` in `html`, read as `elementOf` reads it. */
function firstOf(html: string, tag: string): string {
  const inner = html.match(new RegExp(`<${tag}(?:\\s[^>]*)?>(.*?)</${tag}>`, "s"))?.[1];
  if (inner === undefined) throw new Error(`No <${tag}>`);
  return withoutNested(tag, inner);
}

/** Every `<tag>` in `html`, each with its start tag's attributes and its inner markup. */
function elementsOf(html: string, tag: string) {
  const pattern = new RegExp(`<${tag}(\\s[^>]*)?>(.*?)</${tag}>`, "gs");
  return [...html.matchAll(pattern)].map((m) => ({
    attributes: attributesOf(m[1] ?? ""),
    inner: withoutNested(tag, m[2] ?? ""),
  }));
}

/** A `<select>`'s options, each its value, its label and whether it is the selected one. */
function optionsOf(html: string, id: string) {
  return elementsOf(elementOf(html, "select", `id="${id}"`), "option").map((option) => ({
    value: option.attributes.value,
    label: textOf(option.inner),
    selected: "selected" in option.attributes,
  }));
}

/** The value of a `<select>`'s selected option. */
function selectedOf(html: string, id: string): string | undefined {
  const selected = optionsOf(html, id).filter((option) => option.selected);
  if (selected.length !== 1) throw new Error(`${id} has ${selected.length} selected options`);
  return selected[0]?.value;
}

/** The text of the `<label>` that names `id`. */
function labelFor(html: string, id: string): string {
  return textOf(elementOf(html, "label", `for="${id}"`));
}

/** Each body row of a `<table>`, as the text of its cells, header cells included. */
function bodyRows(table: string): string[][] {
  return rowsOf(firstOf(table, "tbody"));
}

/** The run list: the table labelled by its heading. */
function runList(html: string): string {
  return elementOf(html, "table", 'aria-labelledby="run-list"');
}

/** The run ids the run list shows, in order, read off the links to their detail. */
function listedIds(html: string): string[] {
  return elementsOf(runList(html), "a").map((link) => textOf(link.inner));
}

/** A task's section of the per-task results, found by its heading's id. */
function taskSection(html: string, taskId: string): string {
  return elementOf(html, "section", `aria-labelledby="task-results-${taskId}"`);
}

/** The task ids of every per-task section on the page, in order. */
function taskSectionIds(html: string): string[] {
  return [...html.matchAll(/<section[^>]*\saria-labelledby="task-results-(task_[^"]+)"/g)].map(
    (m) => m[1] ?? "",
  );
}

/** A task's results table, persona first, as the text of each row's cells. */
function resultRows(html: string, taskId: string): string[][] {
  return bodyRows(firstOf(taskSection(html, taskId), "table"));
}

/** A task's two charts, each its caption and the lines under it that name who it leaves off. */
function chartsOf(html: string, taskId: string) {
  return elementsOf(taskSection(html, taskId), "figure").map((figure) => ({
    caption: lineOf(firstOf(figure.inner, "figcaption")),
    lines: elementsOf(figure.inner, "p").map((line) => lineOf(line.inner)),
  }));
}

/** Every link in `html`: its href and its text. */
function linksOf(html: string): { href: string; text: string }[] {
  return elementsOf(html, "a").map((link) => ({
    href: link.attributes.href ?? "",
    text: lineOf(link.inner),
  }));
}

/** The query of a link's `href`, as a plain object, and its path. */
function target(href: string): { path: string; search: Record<string, string> } {
  const url = new URL(href, "http://wayford.test");
  return { path: url.pathname, search: Object.fromEntries(url.searchParams) };
}

// ---------------------------------------------------------------------------
// The run list and its filters
// ---------------------------------------------------------------------------

test("a reloaded filtered URL lists only its runs and the selects show its values", async () => {
  // A fresh router and a fresh query client, as a reload of the page gets them.
  const html = await render("/runs?profileId=prof_vera&outcome=gave_up");
  expect(listedIds(html)).toEqual(["run_vera-hard-1", "run_vera-hard-2", "run_vera-easy-2"]);
  expect(selectedOf(html, "runs-filter-task")).toBe("");
  expect(selectedOf(html, "runs-filter-persona")).toBe("prof_vera");
  expect(selectedOf(html, "runs-filter-outcome")).toBe("gave_up");
  expect(lineOf(html)).toContain("3 of 24 runs");
});

test("/runs lists every run, each id a link to its detail", async () => {
  const html = await render("/runs");
  expect(html).toMatch(/<h1[^>]*>Runs<\/h1>/);
  expect(listedIds(html)).toEqual(fixtureRuns.map((run) => run.id));
  for (const link of elementsOf(runList(html), "a")) {
    expect(link.attributes.href).toBe(`/runs/${textOf(link.inner)}`);
  }
  expect(lineOf(html)).toContain("24 of 24 runs");
});

test("a run's row reads persona, task, outcome, seed, duration, steps, cost and id", async () => {
  const rows = bodyRows(runList(await render("/runs")));
  expect(rows[0]).toEqual([
    "Vera",
    HARD_GOAL,
    "gave_up",
    "424242",
    "15.5 s",
    "5",
    "$0.0201",
    "run_vera-hard-1",
  ]);
  // A persona that is not bundled reads as its id.
  const guest = rows.find((row) => row.at(-1) === "run_guest-easy-1");
  expect(guest).toEqual([
    "prof_guest",
    EASY_GOAL,
    "gave_up",
    "1",
    "30 s",
    "5",
    "$0.0201",
    "run_guest-easy-1",
  ]);
});

test("each filter is a labelled select with All, then its options in order", async () => {
  const html = await render("/runs");
  expect(labelFor(html, "runs-filter-task")).toBe("Task");
  expect(labelFor(html, "runs-filter-persona")).toBe("Persona");
  expect(labelFor(html, "runs-filter-outcome")).toBe("Outcome");
  const pairs = (id: string) => optionsOf(html, id).map(({ value, label }) => [value, label]);
  expect(pairs("runs-filter-task")).toEqual([
    ["", "All"],
    [EASY, EASY_GOAL],
    [HARD, HARD_GOAL],
  ]);
  // Bundled personas in fixture order, then the ids the runs carry that are not bundled.
  expect(pairs("runs-filter-persona")).toEqual([
    ["", "All"],
    ...profileFixtures.map((profile) => [profile.id, profile.label]),
    ["prof_guest", "prof_guest"],
  ]);
  expect(pairs("runs-filter-outcome")).toEqual([
    ["", "All"],
    ["success", "success"],
    ["gave_up", "gave_up"],
    ["budget_exceeded", "budget_exceeded"],
    ["error", "error"],
  ]);
  for (const id of ["runs-filter-task", "runs-filter-persona", "runs-filter-outcome"]) {
    expect(selectedOf(html, id), id).toBe("");
  }
});

test("a value the URL names that no option holds is added, so the select shows it", async () => {
  const html = await render("/runs?taskId=task_gone&profileId=prof_gone");
  expect(optionsOf(html, "runs-filter-task").at(-1)).toEqual({
    value: "task_gone",
    label: "task_gone",
    selected: true,
  });
  expect(optionsOf(html, "runs-filter-persona").at(-1)).toEqual({
    value: "prof_gone",
    label: "prof_gone",
    selected: true,
  });
  expect(lineOf(html)).toContain("No run matches these filters");
});

test("a task the runs carry but io's task list lacks is an option under its id", async () => {
  const html = await render("/runs", { runs: fixtureRuns, tasks: [taskFixtures[0] as Task] });
  expect(optionsOf(html, "runs-filter-task").map(({ value, label }) => [value, label])).toEqual([
    ["", "All"],
    [EASY, EASY_GOAL],
    [HARD, HARD],
  ]);
});

// ---------------------------------------------------------------------------
// Per-task results
// ---------------------------------------------------------------------------

/** `task_past-order`'s table: persona, runs, success, median time to success, errors. */
const HARD_ROWS = [
  ["Ada", "5", "3/4, 75%", "20 s", "1"],
  ["Milo", "2", "all errored", "all errored", "2"],
  ["Vera", "3", "0/3, 0%", "no success", "0"],
  ["Zoya", "2", "0/1, 0%", "no success", "1"],
  ["prof_guest", "2", "2/2, 100%", "15 s", "0"],
];

test("each task's table holds its exact numbers, bundled personas first", async () => {
  const html = await render("/runs");
  expect(taskSectionIds(html)).toEqual([EASY, HARD]);
  expect(resultRows(html, HARD)).toEqual(HARD_ROWS);
  expect(resultRows(html, EASY)).toEqual([
    ["Ada", "3", "3/3, 100%", "6 s", "0"],
    ["Milo", "2", "1/1, 100%", "9 s", "1"],
    ["Vera", "3", "2/3, 67%", "12 s", "0"],
    ["Zoya", "1", "1/1, 100%", "11 s", "0"],
    ["prof_guest", "1", "0/1, 0%", "no success", "0"],
  ]);
  expect(textOf(elementOf(taskSection(html, HARD), "h3", `id="task-results-${HARD}"`))).toBe(
    HARD_GOAL,
  );
});

test("the task filter narrows the results; the persona and outcome filters leave them", async () => {
  const task = await render(`/runs?taskId=${HARD}`);
  expect(taskSectionIds(task)).toEqual([HARD]);
  expect(resultRows(task, HARD)).toEqual(HARD_ROWS);
  const narrowed = await render(`/runs?taskId=${HARD}&profileId=prof_ada&outcome=success`);
  expect(taskSectionIds(narrowed)).toEqual([HARD]);
  expect(resultRows(narrowed, HARD)).toEqual(HARD_ROWS);
  expect(listedIds(narrowed)).toEqual(["run_ada-hard-1", "run_ada-hard-2", "run_ada-hard-3"]);
});

test("a chart names, under it, each persona it leaves off and why", async () => {
  const html = await render("/runs");
  // Milo's runs all errored: no rate and no time, so he is off both charts. Vera and Zoya ran
  // without arriving: a rate of 0, drawn, and no time. Each persona is named once per chart.
  expect(chartsOf(html, HARD)).toEqual([
    { caption: "Success rate, %", lines: ["Every run errored: Milo"] },
    {
      caption: "Median time to success, s",
      lines: ["No success: Vera, Zoya", "Every run errored: Milo"],
    },
  ]);
  expect(chartsOf(html, EASY)).toEqual([
    { caption: "Success rate, %", lines: [] },
    { caption: "Median time to success, s", lines: ["No success: prof_guest"] },
  ]);
});

test("persona, success and error cells link to the runs behind them", async () => {
  const links = linksOf(taskSection(await render("/runs"), HARD));
  const ada = links.filter((link) => target(link.href).search.profileId === "prof_ada");
  expect(ada.map((link) => [link.text, target(link.href)])).toEqual([
    ["Ada", { path: "/runs", search: { taskId: HARD, profileId: "prof_ada" } }],
    [
      "3/4, 75%",
      { path: "/runs", search: { taskId: HARD, profileId: "prof_ada", outcome: "success" } },
    ],
    ["1", { path: "/runs", search: { taskId: HARD, profileId: "prof_ada", outcome: "error" } }],
  ]);
  // A count of none has no runs to show, so it is no link: Vera never arrived and never errored.
  const vera = links.filter((link) => target(link.href).search.profileId === "prof_vera");
  expect(vera.map((link) => link.text)).toEqual(["Vera"]);
});

test("each task's header links to that task's report", async () => {
  const html = await render("/runs");
  for (const taskId of [HARD, EASY]) {
    const header = firstOf(taskSection(html, taskId), "div");
    expect(linksOf(header), taskId).toEqual([{ href: `/report/${taskId}`, text: "Report" }]);
  }
});

test("the persona link opens exactly the runs the row counts", async () => {
  const html = await render(`/runs?taskId=${HARD}&profileId=prof_zoya`);
  expect(listedIds(html)).toEqual(["run_zoya-hard-1", "run_zoya-hard-2"]);
});

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

test("no stored run reads No runs stored yet, with no table", async () => {
  const html = await render("/runs", { runs: [], tasks: taskFixtures });
  expect(lineOf(html)).toContain("No runs stored yet");
  expect(html).not.toContain("<table");
});

test("filters that leave no run read No run matches these filters, results kept", async () => {
  // Milo never gave up; his results are still there, since the stats ignore persona and outcome.
  const html = await render("/runs?profileId=prof_milo&outcome=gave_up");
  expect(lineOf(html)).toContain("No run matches these filters");
  expect(lineOf(html)).toContain("0 of 24 runs");
  expect(html).not.toMatch(/<table[^>]*\saria-labelledby="run-list"/);
  expect(taskSectionIds(html)).toEqual([EASY, HARD]);
});

test("io down: the error and its message, with the runs it had kept", async () => {
  const none = lineOf(await render("/runs", { down: true }));
  expect(none).toContain("Could not load the runs: io answered 502");
  expect(none).not.toContain("Loading runs");
  const kept = await render("/runs", { runs: fixtureRuns, tasks: taskFixtures, down: true });
  expect(lineOf(kept)).toContain("Could not load the runs: io answered 502");
  expect(listedIds(kept)).toEqual(fixtureRuns.map((run) => run.id));
});

test("before io answers, the screen says it is loading", async () => {
  const html = await render("/runs", {});
  expect(lineOf(html)).toContain("Loading runs");
  expect(html).not.toContain("<table");
});

test("without io's task list, tasks read as their ids and the runs still show", async () => {
  const html = await render("/runs", { runs: fixtureRuns });
  expect(listedIds(html)).toEqual(fixtureRuns.map((run) => run.id));
  expect(textOf(elementOf(taskSection(html, HARD), "h3", `id="task-results-${HARD}"`))).toBe(HARD);
  expect(bodyRows(runList(html))[0]?.[1]).toBe(HARD);
});
