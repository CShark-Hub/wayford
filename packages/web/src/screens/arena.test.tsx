import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { runResultFromEvents, type Task } from "@wayford/core";
import { profileFixtures, runEventFixtures } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { type Race, raceQuery } from "../api/races.js";
import { runQuery, tasksQuery } from "../api/runs.js";
import { foreignTask, hardTask, tileOf } from "../arena/fixture-race.js";
import { successText } from "../arena/start-panel.js";
import { attributesOf, lineOf } from "../preview/rendered-markup.js";
import { createAppRouter } from "../router.js";
import { storedTasksQuery } from "./arena.js";

/**
 * `path` through the app's own router, with `seed` filling `client`'s query cache first. A static
 * render runs no effect: no fetch, no stream.
 */
async function renderPath(
  path: string,
  seed: (client: QueryClient) => void = () => {},
  client = new QueryClient(),
) {
  seed(client);
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** `/race`, the start panel and the History. */
function renderArena(): Promise<string> {
  return renderPath("/race");
}

/** The opening tag of the `<button>` whose text is `text`. */
function buttonTag(html: string, text: string): string | undefined {
  return [...html.matchAll(/(<button[^>]*>)(.*?)<\/button>/gs)].find(
    (m) => lineOf(m[2] ?? "") === text,
  )?.[1];
}

test("/race opens on the start strip, linked from the story nav, its titles for screen readers", async () => {
  const html = await renderArena();
  // The reference draws no title row: the page's one h1 and the strip's h2 are not drawn.
  expect(html).toMatch(/<h1 class="sr-only">Race<\/h1>/);
  expect(html).toMatch(/<a [^>]*href="\/race"[^>]*aria-current="page"[^>]*>.*?Race<\/a>/);
  expect(html).toMatch(/<h2 [^>]*class="sr-only"[^>]*>Start a race<\/h2>/);
  // No race yet, so nothing to leave.
  expect(buttonTag(html, "New race")).toBeUndefined();
});

test("the screen sits in the page column: content-max wide, centred, space-6 gutters", async () => {
  const html = await renderArena();
  const column = html.match(/<main[^>]*>(<div[^>]*>)/)?.[1] ?? "";
  expect((attributesOf(column).class ?? "").split(" ")).toEqual(
    expect.arrayContaining(["mx-auto", "max-w-(--content-max)", "px-(--space-6)"]),
  );
});

test("the strip opens on the hard goal, every persona offered, Start not yet possible", async () => {
  const html = await renderArena();
  const hard = attributesOf(buttonTag(html, "Hard goal") ?? "");
  expect(hard.role).toBe("radio");
  expect(hard["aria-checked"]).toBe("true");
  expect(attributesOf(buttonTag(html, "Easy goal") ?? "")["aria-checked"]).toBe("false");
  for (const profile of profileFixtures) {
    const toggle = html.match(new RegExp(`<button[^>]*\\sid="arena-persona-${profile.id}"[^>]*>`));
    expect(attributesOf(toggle?.[0] ?? "")["aria-pressed"], profile.label).toBe("false");
  }
  expect(buttonTag(html, "Start the race")).toMatch(/ disabled=""/);
});

// Static renders: these see `OpeningGoal`'s first paint only. The effect that hands its goal to the
// layout's reducer runs in a browser, where check:self's `race · stored goal` is its guard.
describe("/race?task=: the goal a link opens the panel on", () => {
  /**
   * A client whose cache holds `tasks` as io's list. `fresh` keeps it from going stale, as a list
   * fetched since the screen mounted is; otherwise it is stale, so the screen refetches it on
   * mount. `retryOnMount: false` keeps a failed query failed: a static render puts it back to
   * pending.
   */
  function clientWith(tasks: Task[] | undefined, fresh: boolean): QueryClient {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, retryOnMount: false, staleTime: fresh ? Infinity : 0 },
      },
    });
    if (tasks !== undefined) client.setQueryData(tasksQuery().queryKey, tasks);
    return client;
  }

  /** `path` with `client`'s cache. */
  function renderLink(path: string, client = new QueryClient()): Promise<string> {
    return renderPath(path, () => {}, client);
  }

  /** The value of the stored-goal select's selected option. */
  function selectedStoredGoal(html: string): string | undefined {
    const select = html.match(/<select[^>]*\sid="arena-stored-goal"[^>]*>(.*?)<\/select>/s)?.[1];
    const option = [...(select ?? "").matchAll(/<option([^>]*)>/g)]
      .map(([, tag]) => attributesOf(tag ?? ""))
      .find((attributes) => "selected" in attributes);
    return option?.value;
  }

  /** The text of every status line on the page, in order. */
  function statusLines(html: string): string[] {
    return [...html.matchAll(/<p [^>]*role="status"[^>]*>(.*?)<\/p>/gs)].map((m) =>
      lineOf(m[1] ?? ""),
    );
  }

  /** The History is drawn under what stands in the panel's place, whatever the link's goal. */
  function expectHistoryUnder(html: string, above: string) {
    const history = html.indexOf('<h2 id="race-history"');
    expect(history).toBeGreaterThan(-1);
    expect(html.indexOf(above)).toBeGreaterThan(-1);
    expect(html.indexOf(above)).toBeLessThan(history);
  }

  test("/race?task= opens on the stored goal, checked, with its start and success shown", async () => {
    // A stale list that holds the task names it already: there is no need to wait for the refetch.
    const html = await renderLink(
      `/race?task=${foreignTask.id}`,
      clientWith([hardTask, foreignTask], false),
    );
    expect(selectedStoredGoal(html)).toBe(foreignTask.id);
    expect(attributesOf(buttonTag(html, "Hard goal") ?? "")["aria-checked"]).toBe("false");
    expect(attributesOf(buttonTag(html, "Easy goal") ?? "")["aria-checked"]).toBe("false");
    expect(html).toMatch(/<p class="[^"]*\bmono text-ink-3">start · https:\/\/example\.com\/<\/p>/);
    expect(attributesOf(html.match(/<input[^>]*\sid="arena-success"[^>]*>/)?.[0] ?? "").value).toBe(
      "**/orders/history",
    );
    // Checked as io stored it: Start waits on the personas alone, with no new check.
    const text = lineOf(html);
    expect(text).toContain(`The personas get: ${foreignTask.goal}`);
    expect(text).toContain(`success · ${successText(foreignTask.success)}`);
    expect(text).toContain("Choose 3 more personas");
    expect(text).not.toContain("Check the goal first");
    expect(text).not.toContain("No stored goal");
    expectHistoryUnder(html, "Start a race");
  });

  test("/race?task= naming a preset opens that preset, unchecked, without waiting for the list", async () => {
    const html = await renderLink("/race?task=task_next-parcel");
    expect(attributesOf(buttonTag(html, "Easy goal") ?? "")["aria-checked"]).toBe("true");
    expect(lineOf(html)).toContain("Check the goal first");
    expectHistoryUnder(html, "Start a race");
  });

  test("/race?task= while the list loads shows a status and no panel", async () => {
    const html = await renderLink(`/race?task=${foreignTask.id}`);
    expect(statusLines(html)).toContain(`Loading the goal ${foreignTask.id}…`);
    expect(html).toContain('data-slot="skeleton"');
    expect(html).not.toContain("Start a race");
    expect(buttonTag(html, "Start the race")).toBeUndefined();
    // The page keeps its one h1.
    expect(html).toMatch(/<h1 class="sr-only">Race<\/h1>/);
    expectHistoryUnder(html, `Loading the goal ${foreignTask.id}…`);
  });

  test("/race?task= of no stored task opens the demo goal under a line naming the id", async () => {
    const html = await renderLink(`/race?task=${foreignTask.id}`, clientWith([hardTask], true));
    expect(statusLines(html)).toContain(`No stored goal ${foreignTask.id}: io holds none`);
    expect(attributesOf(buttonTag(html, "Hard goal") ?? "")["aria-checked"]).toBe("true");
    // io holds the hard goal's task alone, which the preset offers already.
    expect(selectedStoredGoal(html)).toBeUndefined();
    expect(lineOf(html)).toContain("No stored goals yet");
    expect(lineOf(html)).toContain("Check the goal first");
    expectHistoryUnder(html, "Start a race");
  });

  test("/race?task= with a stale cached list waits for the refetch before choosing", async () => {
    // Fetched before the task was created, the list may miss it: the screen waits for its refetch.
    const html = await renderLink(`/race?task=${foreignTask.id}`, clientWith([hardTask], false));
    expect(statusLines(html)).toContain(`Loading the goal ${foreignTask.id}…`);
    expect(html).not.toContain("No stored goal");
    expect(buttonTag(html, "Start the race")).toBeUndefined();
    expectHistoryUnder(html, `Loading the goal ${foreignTask.id}…`);
  });

  test("a failed list opens the demo goal at once, and the screen's query never retries", async () => {
    // A failure shows at once: the screen's query never retries, so a slow io holds nothing up.
    // `clientWith` retries nothing either, so only these two lines prove the query the screen
    // reads; the render proves what a failed list opens on.
    expect(storedTasksQuery().retry).toBe(false);
    expect(storedTasksQuery().queryKey).toStrictEqual(tasksQuery().queryKey);
    const client = clientWith(undefined, false);
    await client.prefetchQuery({
      ...tasksQuery(),
      queryFn: () => Promise.reject(new Error("io answered 502")),
    });
    const html = await renderLink(`/race?task=${foreignTask.id}`, client);
    expect(statusLines(html)).toContain(`No stored goal ${foreignTask.id}: io answered 502`);
    expect(attributesOf(buttonTag(html, "Hard goal") ?? "")["aria-checked"]).toBe("true");
    expect(lineOf(html)).toContain(
      "Stored goals are unavailable: io answered 502. The two target-app goals still work.",
    );
    expectHistoryUnder(html, "Start a race");
  });
});

describe("/race/$raceId: one race, by the id io gave it", () => {
  /** Vera's fixture run, which gives up, as a race of one. */
  const vera = { id: "run_vera-hard-1", profileId: "prof_vera", seed: 424242 };
  /** A second run io never stored: io stopped while it ran. */
  const ada = { id: "run_ada-unstored", profileId: "prof_ada", seed: 424242 };

  function raceOf(status: Race["status"]): Race {
    return {
      id: "race_vera-ada",
      task: hardTask,
      startedAt: "2026-10-07T09:00:00.000Z",
      runs: [ada, vera],
      status,
    };
  }

  test("a race io still runs: its goal strip, a lane per run, live, and New race open", async () => {
    const html = await renderPath("/race/race_vera-ada", (client) =>
      client.setQueryData(raceQuery("race_vera-ada").queryKey, raceOf("running")),
    );
    expect(html).toMatch(/<h1 class="sr-only">Race<\/h1>/);
    // The Race stays the current story entry on a race's URL.
    expect(html).toMatch(/<a [^>]*href="\/race"[^>]*aria-current="page"[^>]*>.*?Race<\/a>/);
    expect(html).toMatch(
      /<h2 [^>]*id="race-goal"[^>]*><q>you want to see what you ordered three months ago<\/q><\/h2>/,
    );
    expect(lineOf(html)).toContain("Hard goal task_past-order");
    // No stream has opened in a static render: both lanes wait, in the race's order.
    expect(lineOf(tileOf(html, ada))).toContain("Waiting");
    expect(lineOf(tileOf(html, vera))).toContain("Waiting");
    expect(html.indexOf("race-run_ada-unstored")).toBeLessThan(
      html.indexOf("race-run_vera-hard-1"),
    );
    expect(buttonTag(html, "New race")).not.toMatch(/ disabled=""/);
    // No start panel on a race's URL.
    expect(buttonTag(html, "Start the race")).toBeUndefined();
  });

  test("a finished race: each lane from its run's record, and a run io never stored as such", async () => {
    const html = await renderPath("/race/race_vera-ada", (client) => {
      client.setQueryData(raceQuery("race_vera-ada").queryKey, raceOf("finished"));
      client.setQueryData(runQuery(vera.id).queryKey, runResultFromEvents(runEventFixtures));
      client.setQueryData(runQuery(ada.id).queryKey, null);
    });
    expect(lineOf(tileOf(html, vera))).toMatch(/Gave up 0:15\.5 5 steps/);
    expect(lineOf(tileOf(html, ada))).toContain(
      "Stream lost — no steps stored No record: the run never started, or io stopped or failed to store it",
    );
    expect(buttonTag(html, "New race")).not.toMatch(/ disabled=""/);
  });

  test("a finished race whose records are on their way: skeletons, said to be loading", async () => {
    const html = await renderPath("/race/race_vera-ada", (client) =>
      client.setQueryData(raceQuery("race_vera-ada").queryKey, raceOf("finished")),
    );
    expect(html).toMatch(/<p role="status" class="sr-only">Loading race<\/p>/);
    expect(html).not.toContain("race-goal");
  });

  test("a running race of more runs than the browser can follow is not followed live", async () => {
    // Six runs, each on its own seed, as only io's API can start: the panel takes at most five.
    const six = ["ada", "kai", "milo", "vera", "zoya", "ada"].map((name, i) => ({
      id: `run_${name}-${i}`,
      profileId: `prof_${name}`,
      seed: i + 1,
    }));
    const race: Race = { ...raceOf("running"), runs: six };
    const html = await renderPath("/race/race_vera-ada", (client) =>
      client.setQueryData(raceQuery("race_vera-ada").queryKey, race),
    );
    expect(lineOf(html)).toContain(
      "This race has 6 runs, more than the 5 a browser can follow live at once. Open it again once it has finished to see it drawn from its runs' records, and each run is under Runs once it is stored.",
    );
    expect(html).not.toContain("<article");
    expect(buttonTag(html, "New race")).not.toMatch(/ disabled=""/);
  });

  test("an id io keeps no race under: says so, and leads back to the races", async () => {
    const html = await renderPath("/race/race_missing", (client) =>
      client.setQueryData(raceQuery("race_missing").queryKey, null),
    );
    expect(lineOf(html)).toContain("io keeps no race race_missing.");
    expect(html).toMatch(/<a [^>]*href="\/race"[^>]*>Open the races<\/a>/);
  });
});
