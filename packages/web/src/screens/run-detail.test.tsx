import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { RunResult } from "@wayford/core";
import { runResultFixture, taskFixtures } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { runQuery, tasksQuery, traceUrl, videoUrl } from "../api/runs.js";
import { detailsOf, lineOf, sectionOf } from "../preview/rendered-markup.js";
import { createAppRouter } from "../router.js";
import { fixtureJevRun, fixtureRuns } from "../runs/fixture-runs.js";

const RUN_ID = runResultFixture.id;

/**
 * `path` through the app's own router, with the query client seeded so no fetch runs: `run` under
 * `id`'s key, `null` as io's answer for a run it does not have, and the tasks unless `tasks` is
 * false, which leaves that query pending.
 */
async function render(
  path: string,
  run: RunResult | null = runResultFixture,
  { id = RUN_ID, tasks = true }: { id?: string; tasks?: boolean } = {},
): Promise<string> {
  const client = new QueryClient();
  client.setQueryData(runQuery(id).queryKey, run);
  if (tasks) client.setQueryData(tasksQuery().queryKey, taskFixtures);
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

/** A client whose fetch of run `id` failed, as it does while io is down, after `before` if given. */
async function ioDown(id: string, before?: RunResult | null): Promise<QueryClient> {
  // `retryOnMount: false` keeps the failure: a static render puts a failed query back to pending.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false } },
  });
  if (before !== undefined) client.setQueryData(runQuery(id).queryKey, before);
  await client.prefetchQuery({
    ...runQuery(id),
    queryFn: () => Promise.reject(new Error("io answered 502")),
  });
  return client;
}

/** The text of the page's `<h1>`. */
function h1Of(html: string): string {
  return lineOf(html.match(/<h1(?:\s[^>]*)?>(.*?)<\/h1>/s)?.[1] ?? "");
}

/** The run's header: from its `<h1>` to the end of the `<header>` holding it. */
function headerOf(html: string): string {
  const start = html.indexOf("<h1");
  return html.slice(start, html.indexOf("</header>", start));
}

/** Each `<a>` whose text is `text`: its attributes, as written. */
function linksReading(html: string, text: string): string[] {
  return [...html.matchAll(/<a( [^>]*)?>(.*?)<\/a>/gs)]
    .filter((a) => lineOf(a[2] ?? "") === text)
    .map((a) => a[1] ?? "");
}

/** The step list's entries: each link's text and whether it is the current step. */
function stepEntries(html: string): { text: string; current: boolean }[] {
  const list = html.match(/<nav [^>]*aria-labelledby="run-steps"[^>]*>(.*?)<\/nav>/s)?.[1];
  if (list === undefined) throw new Error("no step list");
  const items = list.match(/<ol(?:\s[^>]*)?>(.*?)<\/ol>/s)?.[1] ?? "";
  return [...items.matchAll(/<a( [^>]*)>(.*?)<\/a>/gs)].map((a) => ({
    text: lineOf(a[2] ?? ""),
    current: / aria-current="step"/.test(a[1] ?? ""),
  }));
}

describe("the header", () => {
  test("reads persona | seed | run id in the <h1>", async () => {
    expect(h1Of(await render(`/runs/${RUN_ID}`))).toBe("Vera | 424242 | run_vera-hard-1");
  });

  test("then the outcome, duration, cost, task goal, Actor backend and model, and start URL", async () => {
    expect(detailsOf(headerOf(await render(`/runs/${RUN_ID}`)))).toEqual({
      Outcome: "gave_up",
      Duration: "15.5 s",
      Cost: "$0.0201, 8020 tokens in, 1180 out",
      Task: "you want to see what you ordered three months ago task_past-order",
      "Actor backend": "llm",
      "Actor model": "gpt-4o-mini",
      "Start URL": "http://localhost:5174/?contrast=2&fontPx=16&targetPx=36",
    });
  });

  test("names Jev as the backend of a run whose steps carry a decision", async () => {
    const html = await render(`/runs/${fixtureJevRun.id}`, fixtureJevRun, { id: fixtureJevRun.id });
    expect(detailsOf(headerOf(html))).toMatchObject({
      "Actor backend": "jev",
      "Actor model": "typesafe/jev-1.13",
    });
  });

  test("names a persona that is not bundled by its profile id", async () => {
    const guest = fixtureRuns.find((run) => run.id === "run_guest-hard-1");
    if (guest === undefined) throw new Error("the fixture runs have run_guest-hard-1");
    const html = await render(`/runs/${guest.id}`, guest, { id: guest.id });
    expect(h1Of(html)).toBe("prof_guest | 1 | run_guest-hard-1");
  });

  test("falls back to the task id while the tasks are not in", async () => {
    const html = await render(`/runs/${RUN_ID}`, runResultFixture, { tasks: false });
    expect(detailsOf(headerOf(html)).Task).toBe("task_past-order");
  });
});

describe("the recording", () => {
  test("a player on the video, and download links for the video and the trace", async () => {
    const html = await render(`/runs/${RUN_ID}`);
    expect(html).toMatch(new RegExp(`<video [^>]*src="${videoUrl(RUN_ID)}"`));
    expect(html).toMatch(/<video [^>]*controls=""/);
    expect(linksReading(html, "Download video")).toEqual([
      expect.stringMatching(new RegExp(`href="${videoUrl(RUN_ID)}"`)),
    ]);
    expect(linksReading(html, "Download trace")).toEqual([
      expect.stringMatching(new RegExp(`href="${traceUrl(RUN_ID)}"`)),
    ]);
    for (const attributes of [
      ...linksReading(html, "Download video"),
      ...linksReading(html, "Download trace"),
    ]) {
      expect(attributes).toMatch(/ download=""/);
    }
  });

  test("says not recorded for a run with neither file", async () => {
    const { videoPath: _, tracePath: __, ...rest } = runResultFixture;
    const html = await render(`/runs/${RUN_ID}`, RunResult.parse(rest));
    expect(html).not.toMatch(/<video/);
    expect(linksReading(html, "Download video")).toEqual([]);
    expect(linksReading(html, "Download trace")).toEqual([]);
    expect(detailsOf(sectionOf(html, "Recording"))).toEqual({
      Video: "not recorded",
      Trace: "not recorded",
    });
  });
});

describe("the steps", () => {
  test("one link per step, its index and the action performed, and wasted in place of one", async () => {
    expect(stepEntries(await render(`/runs/${RUN_ID}?step=2`))).toEqual([
      { text: "0 click e3", current: false },
      { text: "1 scroll down", current: false },
      { text: "2 doubleClick e2", current: true },
      { text: "3 wasted", current: false },
      { text: "4 giveUp", current: false },
    ]);
  });

  test("with no step in the URL, step 0 is replayed and marked current", async () => {
    const html = await render(`/runs/${RUN_ID}`);
    expect(stepEntries(html).map((entry) => entry.current)).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(lineOf(sectionOf(html, "Narration"))).toContain(runResultFixture.steps[0]?.narration);
  });

  test("each step links to its own ?step, and previous and next link to the steps beside it", async () => {
    const html = await render(`/runs/${RUN_ID}?step=2`);
    expect(html).toMatch(new RegExp(`href="/runs/${RUN_ID}\\?step=3"`));
    expect(linksReading(html, "Previous step")).toEqual([
      expect.stringMatching(new RegExp(`href="/runs/${RUN_ID}\\?step=1"`)),
    ]);
    expect(linksReading(html, "Next step")).toEqual([
      expect.stringMatching(new RegExp(`href="/runs/${RUN_ID}\\?step=3"`)),
    ]);
  });

  test("?step=4 replays the give-up and its narration", async () => {
    const html = await render(`/runs/${RUN_ID}?step=4`);
    expect(detailsOf(sectionOf(html, "Action"))).toMatchObject({
      Proposed: "giveUp",
      Performed: "giveUp",
    });
    expect(lineOf(sectionOf(html, "Narration"))).toContain(
      "Nothing here about past orders either. I've looked everywhere I can read. I give up.",
    );
    expect(linksReading(html, "Next step")).toEqual([]);
  });

  test("?step=9 says the run has no such step, above the list, and replays none", async () => {
    const html = await render(`/runs/${RUN_ID}?step=9`);
    const notice = html.indexOf("This run has no step 9");
    expect(notice).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(html.indexOf("<ol"));
    expect(html).not.toMatch(/<h3[^>]*>Narration<\/h3>/);
    expect(stepEntries(html).some((entry) => entry.current)).toBe(false);
  });
});

describe("the states before a run is shown", () => {
  test("a run io does not have", async () => {
    const html = await render("/runs/run_missing", null, { id: "run_missing" });
    expect(lineOf(html)).toContain("No run run_missing is stored. A run is stored when it ends");
  });

  test("a run still loading", async () => {
    const html = await render("/runs/run_loading", null, { id: "run_other" });
    expect(lineOf(html)).toContain("Loading run");
    expect(h1Of(html)).toBe("run_loading");
  });

  test("io down: the error, with its message", async () => {
    const html = lineOf(await renderWith("/runs/run_x", await ioDown("run_x")));
    expect(html).toContain("This run could not be read from io. io answered 502");
    expect(html).not.toContain("Loading run");
  });

  test("io down after it had no such run: the error, not the not-found", async () => {
    const html = lineOf(await renderWith("/runs/run_x", await ioDown("run_x", null)));
    expect(html).toContain("This run could not be read from io. io answered 502");
    expect(html).not.toContain("No run run_x is stored");
  });

  test("io down while a run is shown: the run stays", async () => {
    const html = await renderWith(`/runs/${RUN_ID}`, await ioDown(RUN_ID, runResultFixture));
    expect(h1Of(html)).toBe("Vera | 424242 | run_vera-hard-1");
    expect(lineOf(html)).not.toContain("could not be read from io");
  });
});
