import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import type { Report, Task } from "@wayford/core";
import { reportFixture } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { type Race, racesQuery } from "../api/races.js";
import { reportQuery } from "../api/reports.js";
import { attributesOf, lineOf, sectionOf } from "../preview/rendered-markup.js";
import { createAppRouter } from "../router.js";
import { hardTask } from "./fixture-race.js";

/** The hard goal as the check hands it back for a race: the same goal, on a task minted for it. */
const raceTask: Task = { ...hardTask, id: "task_minted-for-race" };

/** A race of Ada, Kai and Vera on the hard goal, seed 1, started at `startedAt`. */
function raceOf(id: string, status: Race["status"], startedAt: string, task = raceTask): Race {
  return {
    id,
    task,
    startedAt,
    runs: ["ada", "kai", "vera"].map((name) => ({
      id: `run_${name}-${id.slice("race_".length)}`,
      profileId: `prof_${name}`,
      seed: 1,
    })),
    status,
  };
}

/** Newest first, as io lists them: one running, one finished before it, one running before that. */
const RACES: Race[] = [
  raceOf("race_third", "running", "2026-10-07T09:20:00.000Z"),
  raceOf("race_second", "finished", "2026-10-07T09:10:00.000Z"),
  raceOf("race_first", "running", "2026-10-07T09:00:00.000Z"),
];

/**
 * `/race` through the app's own router, io's races answered with `races`, or not yet, and the hard
 * goal's stored report with `report`, `null` when io holds none, or not yet.
 */
async function renderStart(races?: Race[], report?: Report | null): Promise<string> {
  const client = new QueryClient();
  if (races !== undefined) client.setQueryData(racesQuery().queryKey, races);
  if (report !== undefined) client.setQueryData(reportQuery(hardTask.id).queryKey, report);
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ["/race"] }) });
  await router.load();
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** Each row of the group under `label`: its race id, and its text on one line. */
function rowsOf(html: string, label: string) {
  const group = sectionOf(html, label);
  return [
    ...group.matchAll(/<li data-race="([^"]+)"[^>]*>(.*?)<\/li>(?=<li data-race|<\/ul>$)/gs),
  ].map(([, id, row]) => ({ id, text: lineOf(row ?? ""), html: row ?? "" }));
}

/** The `href` of every link in `html`, in order. */
function hrefsOf(html: string): string[] {
  return [...html.matchAll(/<a\s[^>]*>/g)].map((m) => attributesOf(m[0]).href ?? "");
}

test("the History sits under the start panel, titled for sight and for screen readers", async () => {
  const html = await renderStart(RACES);
  expect(html).toMatch(/<h2 id="race-history" class="title text-ink">History<\/h2>/);
  expect(html.indexOf("Start the race")).toBeLessThan(html.indexOf('id="race-history"'));
});

test("the running races come first, then the finished, each group newest first as io lists them", async () => {
  const html = await renderStart(RACES);
  expect(html.indexOf("running · 2")).toBeLessThan(html.indexOf("finished · 1"));
  expect(rowsOf(html, "running · 2").map(({ id }) => id)).toStrictEqual([
    "race_third",
    "race_first",
  ]);
  expect(rowsOf(html, "finished · 1").map(({ id }) => id)).toStrictEqual(["race_second"]);
});

test("a row: the goal's label and sentence, its personas, its seed and when it started, in UTC", async () => {
  const [row] = rowsOf(await renderStart(RACES), "running · 2");
  expect(row?.text).toBe(
    "Hard goal you want to see what you ordered three months ago Ada Kai Vera seed 1 started 7 Oct, 09:20:00 UTC",
  );
  // The sentence in quotes, as the personas got it.
  expect(row?.html).toMatch(/<q[^>]*>you want to see what you ordered three months ago<\/q>/);
});

test("every race opens on its own URL; only a finished one links its goal's report, the stored one the race leads to", async () => {
  const html = await renderStart(RACES, reportFixture(hardTask.id));
  const [third, first] = rowsOf(html, "running · 2");
  const [second] = rowsOf(html, "finished · 1");
  expect(hrefsOf(third?.html ?? "")).toStrictEqual(["/race/race_third"]);
  expect(hrefsOf(first?.html ?? "")).toStrictEqual(["/race/race_first"]);
  // The hard goal's stored report, not the race's own task's, which has none until analysed.
  expect(hrefsOf(second?.html ?? "")).toStrictEqual([
    "/race/race_second",
    "/report/task_past-order",
  ]);
});

test("with no report stored on its goal, or a goal of its own, a finished race links its own report", async () => {
  const unreported = await renderStart(RACES, null);
  const [second] = rowsOf(unreported, "finished · 1");
  expect(hrefsOf(second?.html ?? "")).toContain(`/report/${raceTask.id}`);

  // The preset's sentence with a success of the person's own: the stored report is on another goal.
  const own: Task = { ...raceTask, success: { type: "urlMatches", pattern: "**/account/address" } };
  const html = await renderStart(
    [raceOf("race_own", "finished", "2026-10-07T09:30:00.000Z", own)],
    reportFixture(hardTask.id),
  );
  const [row] = rowsOf(html, "finished · 1");
  expect(hrefsOf(row?.html ?? "")).toStrictEqual(["/race/race_own", `/report/${raceTask.id}`]);
});

test("a group with no race is left out, and no race at all says so in a line", async () => {
  const onlyFinished = await renderStart([RACES[1] as Race]);
  expect(onlyFinished).not.toContain("running ·");
  const none = await renderStart([]);
  expect(lineOf(sectionOf(none, "History"))).toBe(
    "History No race yet: the races you start are listed here.",
  );
});

test("while io's answer is on its way, the History is a skeleton and says it is loading", async () => {
  const html = sectionOf(await renderStart(), "History");
  expect(html).toContain('data-slot="skeleton"');
  expect(html).toMatch(/<p role="status" class="sr-only">Loading races<\/p>/);
});
