/**
 * The runs archive through the app's own router, against "Runs" in
 * `docs/specs/2026-10-07-s3-14-cast-and-runs.md`. Each test loads a URL into a fresh memory history
 * and renders the page with `renderToStaticMarkup`, as `router.test.tsx` does, inside a query
 * client seeded with the fixture runs and tasks, so no fetch runs: what a reloaded link opens with,
 * read off the markup, with no DOM library.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import type { RunResult, Task } from "@wayford/core";
import { profileFixtures, taskFixtures } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { runsQuery, tasksQuery } from "../api/runs.js";
import {
  attributesOf,
  classesOf,
  lineOf,
  mainOf,
  rowsOf,
  withoutNested,
} from "../preview/rendered-markup.js";
import { createAppRouter } from "../router.js";
import { fixtureRuns } from "../runs/fixture-runs.js";

const HARD = "task_past-order";
const EASY = "task_next-parcel";
const HARD_GOAL = "you want to see what you ordered three months ago";
const EASY_GOAL = "you want to know where your next parcel is going";

/** `taskFixtures`' task with `id`. */
function task(id: string): Task {
  const found = taskFixtures.find((t) => t.id === id);
  if (found === undefined) throw new Error(`no task fixture ${id}`);
  return found;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * What the query client holds before the render. A key left undefined is never seeded. `down`
 * then fails the runs fetch, as it fails while io is down.
 */
type Seeded = { runs?: RunResult[] | undefined; tasks?: Task[] | undefined; down?: boolean };

/**
 * The page at `path` from a fresh router, as a reload opens it, with `seeded` in the query cache:
 * the fixture runs and tasks unless a test says otherwise.
 */
async function render(
  path: string,
  seeded: Seeded = { runs: fixtureRuns, tasks: taskFixtures },
): Promise<string> {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
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

// A static render that warns or errors is a render a test would pass while the console fills up:
// every test fails on any console warning or error.
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

/** Every link in `html`: its attributes, its href and its text. */
function linksOf(html: string) {
  return [...html.matchAll(/<a(\s[^>]*)?>(.*?)<\/a>/gs)].map((a) => {
    const attributes = attributesOf(a[1] ?? "");
    return { attributes, href: attributes.href ?? "", text: lineOf(a[2] ?? "") };
  });
}

/** Where a link's `href` goes: its path and its query, as a plain object. */
function target(href: string): { path: string; search: Record<string, string> } {
  const url = new URL(href, "http://wayford.test");
  return { path: url.pathname, search: Object.fromEntries(url.searchParams) };
}

/** The run table on the screen. */
function runTable(html: string): string {
  return firstOf(mainOf(html), "table");
}

/** Each body row of the run table, as the text of its cells. */
function bodyRows(html: string): string[][] {
  return rowsOf(firstOf(runTable(html), "tbody"));
}

/** The run table's header row, as the text of its cells. */
function headRow(html: string): string[] {
  return rowsOf(firstOf(runTable(html), "thead"))[0] ?? [];
}

/** Each body row of the run table, as the inner markup of its cells. */
function bodyCells(html: string): string[][] {
  return [...firstOf(runTable(html), "tbody").matchAll(/<tr(?:\s[^>]*)?>(.*?)<\/tr>/gs)].map(
    (row) => [...(row[1] ?? "").matchAll(/<td(?:\s[^>]*)?>(.*?)<\/td>/gs)].map((c) => c[1] ?? ""),
  );
}

/** The run ids the table lists, in order, read off the links to their detail. */
function listedIds(html: string): string[] {
  return linksOf(runTable(html))
    .filter((link) => link.href.startsWith("/runs/"))
    .map((link) => link.text);
}

/**
 * A filter's chips, found by its visible label: the `<p>` reading `label`, whose id names the
 * `<fieldset>`, a group, holding the chips. Each chip is its text, where it goes, whether it is
 * picked, and whether it is set in mono.
 */
function chipsOf(html: string, label: string) {
  const screen = mainOf(html);
  const labels = [...screen.matchAll(/<p(\s[^>]*)>(.*?)<\/p>/gs)].filter(
    (p) => lineOf(p[2] ?? "") === label,
  );
  const id = labels.map((p) => attributesOf(p[1] ?? "").id).find((v) => v !== undefined);
  if (id === undefined) throw new Error(`no labelled filter reads ${label}`);
  const group = screen.match(
    new RegExp(`<fieldset(?=[^>]*\\saria-labelledby="${id}")[^>]*>(.*?)</fieldset>`, "s"),
  )?.[1];
  if (group === undefined) throw new Error(`no group is labelled by ${label}`);
  return linksOf(group).map((link) => ({
    text: link.text,
    to: target(link.href),
    picked: link.attributes["aria-current"] === "page",
    mono: classesOf(link.attributes).includes("mono-label"),
  }));
}

/** The text of each chip of a filter, in order. */
function chipTexts(html: string, label: string): string[] {
  return chipsOf(html, label).map((chip) => chip.text);
}

/** The text of the one picked chip of a filter; throws unless exactly one is picked. */
function pickedChip(html: string, label: string): string {
  const picked = chipsOf(html, label).filter((chip) => chip.picked);
  if (picked.length !== 1) throw new Error(`${label} has ${picked.length} picked chips`);
  return picked[0]?.text ?? "";
}

/** The fault banner: from its `role="alert"` to the end of the screen, since it nests a `<div>`. */
function bannerOf(html: string): string | undefined {
  const screen = mainOf(html);
  const start = screen.indexOf('role="alert"');
  return start === -1 ? undefined : screen.slice(start);
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

describe("the run table", () => {
  test("each row's run id links to its run detail", async () => {
    const html = await render("/runs");
    expect(listedIds(html)).toEqual(fixtureRuns.map((run) => run.id));
    for (const link of linksOf(runTable(html)).filter((l) => l.href.startsWith("/runs/"))) {
      expect(link.href).toBe(`/runs/${link.text}`);
    }
  });

  test("a row reads persona, goal, outcome, seed, simulated time, steps, cost and run id", async () => {
    const html = await render("/runs");
    expect(html).toMatch(/<h1[^>]*>Runs<\/h1>/);
    expect(headRow(html)).toEqual([
      "Persona",
      "Goal",
      "Outcome",
      "Seed",
      "Simulated",
      "Steps",
      "Cost",
      "Run",
    ]);
    const rows = bodyRows(html);
    // The run's simulated time, 16.5 s, not its 15.5 s on the wall clock.
    expect(rows[0]).toEqual([
      "Vera",
      HARD_GOAL,
      "Gave up",
      "424242",
      "16.5 s",
      "5",
      "$0.0201",
      "run_vera-hard-1",
    ]);
    // A persona that is not bundled reads as its id. 30 s on the wall clock, the fixture's 16.5 s
    // simulated.
    expect(rows.find((row) => row.at(-1) === "run_guest-easy-1")).toEqual([
      "prof_guest",
      EASY_GOAL,
      "Gave up",
      "1",
      "16.5 s",
      "5",
      "$0.0201",
      "run_guest-easy-1",
    ]);
  });

  test("a run stored before simulated time reads — in its time cell", async () => {
    const rows = bodyRows(await render("/runs"));
    const simulated = (id: string) => rows.find((row) => row.at(-1) === id)?.[4];
    const before = fixtureRuns.find((run) => run.id === "run_vera-hard-3");
    // Untimed through and through, the one shape the fold gives no total for.
    expect(before).not.toHaveProperty("simulatedMs");
    for (const step of before?.steps ?? []) expect(step).not.toHaveProperty("simulatedMs");
    expect(simulated("run_vera-hard-3")).toBe("—");
    expect(simulated("run_zoya-hard-1")).toBe("16.5 s");
  });

  test("a budget run names the limit that cut it off", async () => {
    const rows = bodyRows(await render("/runs"));
    const outcome = (id: string) => rows.find((row) => row.at(-1) === id)?.[2];
    expect(outcome("run_vera-hard-3")).toBe("Out of time");
    expect(outcome("run_zoya-hard-1")).toBe("Hit the step cap");
  });

  test("every number and the run id are set in mono, each cell's text in a <p>", async () => {
    for (const cells of bodyCells(await render("/runs"))) {
      expect(cells).toHaveLength(8);
      for (const cell of cells) expect(cell).toMatch(/^<p[\s>]/);
      for (const cell of cells.slice(3)) expect(cell).toMatch(/^<p class="[^"]*\bmono\b/);
    }
  });

  test("the goal links to its task's report", async () => {
    const links = linksOf(runTable(await render("/runs"))).filter((link) =>
      link.href.startsWith("/report/"),
    );
    expect(links.map((link) => link.href)).toEqual(
      fixtureRuns.map((run) => `/report/${run.taskId}`),
    );
    expect(links[0]?.text).toBe(HARD_GOAL);
  });

  test("a minted run id reads as its label, the whole id in the link's href alone", async () => {
    // A run id as `newId("run")` mints it (#200): fixture ids such as run_vera-hard-1 read whole.
    const id = "run_01m4bbcm8s1a0mcqac4v3fr6hk";
    const [first, ...rest] = fixtureRuns;
    if (first === undefined) throw new Error("no fixture runs");
    const html = await render("/runs", { runs: [{ ...first, id }, ...rest], tasks: taskFixtures });
    expect(bodyRows(html)[0]?.at(-1)).toBe("run …3fr6hk");
    const link = linksOf(runTable(html)).find((l) => l.text === "run …3fr6hk");
    expect(link?.href).toBe(`/runs/${id}`);
    // Nowhere else in the row's markup: a title or an aria-label would have a screen reader read
    // the whole id out on every row.
    expect(bodyCells(html)[0]?.join("").replace(`href="/runs/${id}"`, "")).not.toContain(id);
  });
});

// ---------------------------------------------------------------------------
// The filters
// ---------------------------------------------------------------------------

describe("the filters", () => {
  test("each is a group named by its visible label, All first and picked on /runs", async () => {
    const html = await render("/runs");
    for (const label of ["Task", "Persona", "Outcome"]) {
      expect(chipTexts(html, label)[0], label).toBe("All");
      expect(pickedChip(html, label), label).toBe("All");
    }
    expect(lineOf(mainOf(html))).toContain("24 of 24 runs");
  });

  test("a reloaded filtered URL lists only its runs, its chips picked", async () => {
    // A fresh router and a fresh query client, as a reload of the page gets them.
    const html = await render("/runs?profileId=prof_vera&outcome=gave_up");
    expect(listedIds(html)).toEqual(["run_vera-hard-1", "run_vera-hard-2", "run_vera-easy-2"]);
    expect(pickedChip(html, "Task")).toBe("All");
    expect(pickedChip(html, "Persona")).toBe("Vera");
    expect(pickedChip(html, "Outcome")).toBe("Gave up");
    expect(lineOf(mainOf(html))).toContain("3 of 24 runs");
  });

  test("each chip's link sets its key and keeps the others; All drops the key", async () => {
    const html = await render(`/runs?taskId=${HARD}&profileId=prof_vera`);
    const to = (label: string, text: string) =>
      chipsOf(html, label).find((chip) => chip.text === text)?.to;
    expect(to("Outcome", "Got through")).toEqual({
      path: "/runs",
      search: { taskId: HARD, profileId: "prof_vera", outcome: "success" },
    });
    expect(to("Persona", "Ada")).toEqual({
      path: "/runs",
      search: { taskId: HARD, profileId: "prof_ada" },
    });
    expect(to("Task", EASY_GOAL)).toEqual({
      path: "/runs",
      search: { taskId: EASY, profileId: "prof_vera" },
    });
    expect(to("Persona", "All")).toEqual({ path: "/runs", search: { taskId: HARD } });
    expect(to("Task", "All")).toEqual({ path: "/runs", search: { profileId: "prof_vera" } });
    expect(to("Outcome", "All")).toEqual({
      path: "/runs",
      search: { taskId: HARD, profileId: "prof_vera" },
    });
  });

  test("a URL value no option holds is added as a chip, picked", async () => {
    const html = await render("/runs?taskId=task_gone&profileId=prof_gone");
    expect(chipsOf(html, "Task").at(-1)).toMatchObject({ text: "task_gone", picked: true });
    expect(chipsOf(html, "Persona").at(-1)).toMatchObject({ text: "prof_gone", picked: true });
    expect(lineOf(mainOf(html))).toContain("No run matches these filters.");
  });

  test("task chips list only the tasks the runs carry, by goal, in io's order", async () => {
    const hardOnly = fixtureRuns.filter((run) => run.taskId === HARD);
    // EASY is stored but no run carries it, so its chip would open an empty table.
    expect(
      chipTexts(await render("/runs", { runs: hardOnly, tasks: taskFixtures }), "Task"),
    ).toEqual(["All", HARD_GOAL]);
    // io's order, not the ids' order.
    const reversed = [task(HARD), task(EASY)];
    expect(
      chipTexts(await render("/runs", { runs: fixtureRuns, tasks: reversed }), "Task"),
    ).toEqual(["All", HARD_GOAL, EASY_GOAL]);
  });

  test("a task the runs carry that io does not list reads as its id, in mono", async () => {
    const html = await render("/runs", { runs: fixtureRuns, tasks: [task(EASY)] });
    const chips = chipsOf(html, "Task");
    expect(chips.map((chip) => chip.text)).toEqual(["All", EASY_GOAL, HARD]);
    expect(chips.map((chip) => chip.mono)).toEqual([false, false, true]);
  });

  test("persona chips: the bundled personas, then other ids the runs carry", async () => {
    expect(chipTexts(await render("/runs"), "Persona")).toEqual([
      "All",
      ...profileFixtures.map((profile) => profile.label),
      "prof_guest",
    ]);
  });

  test("outcome chips read the fixed words, Over budget for either limit", async () => {
    const chips = chipsOf(await render("/runs"), "Outcome");
    expect(chips.map((chip) => [chip.text, chip.to.search.outcome])).toEqual([
      ["All", undefined],
      ["Got through", "success"],
      ["Gave up", "gave_up"],
      ["Over budget", "budget_exceeded"],
      ["Error", "error"],
    ]);
    // The filter holds only the outcome; the table holds each run's record and names its limit.
    const html = await render("/runs?outcome=budget_exceeded");
    expect(pickedChip(html, "Outcome")).toBe("Over budget");
    expect(bodyRows(html).map((row) => row[2])).toEqual(["Out of time", "Hit the step cap"]);
  });
});

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

describe("states", () => {
  test("no stored run reads No runs stored yet, with Start a race and no table", async () => {
    const html = await render("/runs", { runs: [], tasks: taskFixtures });
    const screen = mainOf(html);
    expect(lineOf(screen)).toContain(
      "no runs stored No runs stored yet. A run is stored when it ends. Start a race, or seed the demo data with pnpm seed:demo.",
    );
    expect(linksOf(screen).map(({ href, text }) => ({ href, text }))).toEqual([
      { href: "/race", text: "Start a race" },
    ]);
    expect(screen).not.toContain("<table");
    expect(screen).not.toContain("<fieldset");
  });

  test("filters that keep no run read No run matches these filters, the filters kept", async () => {
    // Milo never gave up.
    const html = await render("/runs?profileId=prof_milo&outcome=gave_up");
    const screen = mainOf(html);
    expect(lineOf(screen)).toContain("No run matches these filters.");
    expect(lineOf(screen)).toContain("0 of 24 runs");
    expect(screen).not.toContain("<table");
    expect(pickedChip(html, "Persona")).toBe("Milo");
    const every = linksOf(screen).find((link) => link.text === "Show every run");
    expect(every?.href).toBe("/runs");
    // It opens another view than the one shown, so it is not the current page.
    expect(every?.attributes["aria-current"]).toBeUndefined();
  });

  test("io down with no run held: the fault banner, io's message in mono, Try again", async () => {
    const html = await render("/runs", { down: true });
    const banner = bannerOf(html);
    expect(banner).toBeDefined();
    expect(lineOf(banner ?? "")).toContain("The runs could not be read from io. io answered 502");
    expect(banner).toMatch(/<span class="mono">io answered 502<\/span>/);
    expect(banner).toMatch(/<button[^>]*>Try again<\/button>/);
    expect(mainOf(html)).not.toContain("<table");
    expect(mainOf(html)).not.toContain('role="status"');
  });

  test("io down with runs held: the banner above the table, the runs still shown", async () => {
    const html = await render("/runs", { runs: fixtureRuns, tasks: taskFixtures, down: true });
    const screen = mainOf(html);
    expect(lineOf(bannerOf(html) ?? "")).toContain("The runs could not be read from io.");
    expect(screen.indexOf('role="alert"')).toBeLessThan(screen.indexOf("<table"));
    expect(listedIds(html)).toEqual(fixtureRuns.map((run) => run.id));
  });

  test("before io answers, a status line says it is loading and no table shows", async () => {
    const html = await render("/runs", {});
    const screen = mainOf(html);
    expect(screen).toMatch(/<p role="status"[^>]*>Loading the runs\.<\/p>/);
    expect(screen.match(/data-slot="skeleton"/g)?.length).toBeGreaterThanOrEqual(11);
    expect(screen).not.toContain("<table");
    expect(lineOf(screen)).not.toMatch(/ of \d+ runs/);
  });

  test("without io's task list, goals read as ids and the runs still show", async () => {
    const html = await render("/runs", { runs: fixtureRuns });
    expect(listedIds(html)).toEqual(fixtureRuns.map((run) => run.id));
    expect(bodyRows(html)[0]?.[1]).toBe(HARD);
    expect(bodyCells(html)[0]?.[1]).toMatch(/^<p class="[^"]*\bmono\b/);
    expect(chipTexts(html, "Task")).toEqual(["All", EASY, HARD]);
  });

  test("the screen draws no source badge: every listed run is stored", async () => {
    expect(await render("/runs")).not.toContain("data-source");
  });
});
