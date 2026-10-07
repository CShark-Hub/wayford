import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { type IncompleteRunStep, RunResult } from "@wayford/core";
import { runResultFixture } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { runQuery, traceUrl, videoUrl } from "../api/runs.js";
import {
  attributesOf,
  classesOf,
  detailsOf,
  elementOf,
  lineOf,
  sectionOf,
  textOf,
} from "../preview/rendered-markup.js";
import { createAppRouter } from "../router.js";
import { fixtureJevRun, fixtureRuns } from "../runs/fixture-runs.js";
import { backendOf } from "../runs/step-replay.js";

const RUN_ID = runResultFixture.id;

/**
 * `path` through the app's own router, with the query client seeded so no fetch runs: `run` under
 * `id`'s key, or `null` as io's answer for a run it does not have.
 */
async function render(
  path: string,
  run: RunResult | null = runResultFixture,
  { id = RUN_ID }: { id?: string } = {},
): Promise<string> {
  const client = new QueryClient();
  client.setQueryData(runQuery(id).queryKey, run);
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

/** HTML's void elements, which a static render writes with no end tag. */
const VOID = new Set(["area", "br", "col", "embed", "hr", "img", "input", "link", "meta", "wbr"]);

/** An element of the markup: its start tag, its inner markup and its children's start tags. */
type Enclosing = { start: string; inner: string; children: string[] };

/**
 * The element holding the first `<tag>`, read by depth: React escapes `<` and `>` inside attribute
 * values, so every `<` starts a tag, and SVG's empty elements end in `/>`.
 */
function parentOf(html: string, tag: string): Enclosing {
  const stack: { start: string; from: number; children: string[] }[] = [];
  let found: (typeof stack)[number] | undefined;
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)[^>]*?(\/?)>/g)) {
    const [whole, closing, name = "", empty] = m;
    const at = m.index;
    if (closing === "/") {
      const element = stack.pop();
      if (element !== undefined && element === found) {
        return { ...element, inner: html.slice(element.from, at) };
      }
      continue;
    }
    const parent = stack.at(-1);
    parent?.children.push(whole);
    if (name === tag && found === undefined) found = parent;
    if (empty !== "/" && !VOID.has(name)) {
      stack.push({ start: whole, from: at + whole.length, children: [] });
    }
  }
  throw new Error(`No element holds a <${tag}>`);
}

/** A start tag's element name: `div` for `<div class="grid">`. */
function nameOf(start: string): string {
  return start.match(/^<([a-zA-Z][\w-]*)/)?.[1] ?? "";
}

/** Each `<a>` whose text is `text`: its attributes, as written. */
function linksReading(html: string, text: string): string[] {
  return [...html.matchAll(/<a( [^>]*)?>(.*?)<\/a>/gs)]
    .filter((a) => lineOf(a[2] ?? "") === text)
    .map((a) => a[1] ?? "");
}

/** Whether each of the step timeline's links, in order, is the current step. */
function currentSteps(html: string): boolean[] {
  return [
    ...elementOf(html, "fieldset", 'aria-label="Steps"').matchAll(/<a(\s[^>]*)>.*?<\/a>/gs),
  ].map((a) => attributesOf(a[1] ?? "")["aria-current"] === "step");
}

/**
 * The caption of the step replayed, or undefined when none is. Read as its text runs, tags dropped
 * and nothing added, so a space the caption lacks is not supplied by the reading.
 */
function captionOf(html: string): string | undefined {
  const caption = html.match(/<p [^>]*data-step-caption=""[^>]*>(.*?)<\/p>/s)?.[1];
  return caption === undefined ? undefined : textOf(caption);
}

/**
 * The fixture run cut short in its give-up, as a run that ran out of budget is stored: with the
 * action planned but not landed, or with none planned.
 */
function cutShort(planned: boolean): RunResult {
  const last = runResultFixture.steps.at(-1);
  if (last === undefined || "wasted" in last || "incomplete" in last) {
    throw new Error("the fixture run ends on a complete step");
  }
  const {
    urlAfter: _,
    screenshotPath: __,
    proposedAction,
    performedAction,
    dice,
    cost,
    ...base
  } = last;
  const step: IncompleteRunStep = planned
    ? { ...base, incomplete: true, proposedAction, performedAction, dice, cost }
    : { ...base, incomplete: true };
  return RunResult.parse({
    ...runResultFixture,
    outcome: "budget_exceeded",
    steps: [...runResultFixture.steps.slice(0, -1), step],
  });
}

describe("the header", () => {
  test("reads persona | seed | run id in the <h1>", async () => {
    expect(h1Of(await render(`/runs/${RUN_ID}`))).toBe("Vera | 424242 | run_vera-hard-1");
  });

  test("then the facts: outcome, duration, steps, cost, actor, task and start", async () => {
    expect(detailsOf(headerOf(await render(`/runs/${RUN_ID}`)))).toEqual({
      outcome: "Gave up",
      duration: "15.5 s",
      steps: "5",
      cost: "$0.0201, 8020 tokens in, 1180 out",
      actor: "gpt-4o-mini",
      task: "task_past-order",
      start: "http://localhost:5174/?contrast=2&fontPx=16&targetPx=36",
    });
  });

  test.each<[string, string, Partial<RunResult>, string]>([
    ["the step cap", "Hit the step cap", { limit: "steps", maxSteps: 5 }, "stepCap"],
    ["the clock", "Out of time", { limit: "clock" }, "outOfTime"],
    ["a limit not recorded, as before #196,", "Over budget", {}, "overBudget"],
  ])(
    "a budget run out by %s reads %s, and its last step is marked the same",
    async (_by, word, limit, kind) => {
      const html = await render(
        `/runs/${RUN_ID}`,
        RunResult.parse({ ...cutShort(true), ...limit }),
      );
      expect(detailsOf(headerOf(html)).outcome).toBe(word);
      const steps = elementOf(html, "fieldset", 'aria-label="Steps"');
      expect([...steps.matchAll(/data-outcome="([^"]*)"/g)].map((m) => m[1])).toEqual([kind]);
    },
  );

  test("names the Jev model as the actor of a Jev run", async () => {
    const html = await render(`/runs/${fixtureJevRun.id}`, fixtureJevRun, { id: fixtureJevRun.id });
    expect(detailsOf(headerOf(html)).actor).toBe("typesafe/jev-1.13");
  });

  test("the persona's avatar beside the <h1>, and the page in the persona's slot", async () => {
    const html = await render(`/runs/${RUN_ID}`);
    expect(html.slice(html.indexOf("<main>"), html.indexOf("<h1"))).toMatch(
      /<svg[^>]*viewBox="0 0 160 160"/,
    );
    const root = html.slice(html.indexOf("<main>") + "<main>".length).match(/^<div([^>]*)>/)?.[1];
    expect(attributesOf(root ?? "").style).toContain("--p:var(--persona-cobalt)");
  });

  test("a ULID run id: the avatar and the <h1> alone in a row that does not wrap, the downloads after the facts", async () => {
    const id = "run_01m47w76p695vy4dhemjpne0ak";
    const html = await render(`/runs/${id}`, RunResult.parse({ ...runResultFixture, id }), { id });
    expect(h1Of(html)).toBe(`Vera | 424242 | ${id}`);
    // Row 1: the avatar's tile and the <h1>, which wraps the id inside itself.
    const row = parentOf(html, "h1");
    expect(row.children.map(nameOf)).toEqual(["div", "h1"]);
    expect(row.inner.slice(0, row.inner.indexOf("<h1"))).toMatch(/<svg[^>]*viewBox="0 0 160 160"/);
    expect(classesOf(attributesOf(row.start))).toContain("flex");
    expect(classesOf(attributesOf(row.start))).not.toContain("flex-wrap");
    expect(classesOf(attributesOf(row.children[1] ?? ""))).toEqual(
      expect.arrayContaining(["min-w-0", "flex-1", "wrap-anywhere"]),
    );
    // Row 2: the facts, then the downloads beside them.
    const facts = parentOf(html, "dl");
    expect(facts.children.map(nameOf)).toEqual(["dl", "div"]);
    const downloads = facts.inner.slice(facts.inner.indexOf("</dl>"));
    expect(linksReading(downloads, "Download video")).toHaveLength(1);
    expect(linksReading(downloads, "Download trace")).toHaveLength(1);
  });

  test("names a persona that is not bundled by its profile id, with no avatar", async () => {
    const guest = fixtureRuns.find((run) => run.id === "run_guest-hard-1");
    if (guest === undefined) throw new Error("the fixture runs have run_guest-hard-1");
    const html = await render(`/runs/${guest.id}`, guest, { id: guest.id });
    expect(h1Of(html)).toBe("prof_guest | 1 | run_guest-hard-1");
    expect(html.slice(html.indexOf("<main>"), html.indexOf("<h1"))).not.toMatch(/<svg/);
  });

  test("asks io for no task: the task's id is enough", async () => {
    // A static render fetches nothing, but each query the screen makes is still added to the
    // client's cache: after the render, the cache holds the run's query alone, no ["tasks"].
    const client = new QueryClient();
    client.setQueryData(runQuery(RUN_ID).queryKey, runResultFixture);
    const html = await renderWith(`/runs/${RUN_ID}`, client);
    expect(h1Of(html)).toBe("Vera | 424242 | run_vera-hard-1");
    const asked = client.getQueryCache().getAll();
    expect(asked.map((query) => query.queryKey)).toEqual([runQuery(RUN_ID).queryKey]);
    // Nor is the goal sentence in the header.
    expect(lineOf(headerOf(html))).not.toContain("you want to see what you ordered");
  });
});

describe("the backend the top bar names", () => {
  // The top bar's slot draws nothing in a static render, so the rule is read where it is made.
  test("llm for a run whose steps carry no decision", () => {
    expect(backendOf(runResultFixture)).toBe("llm");
  });

  test("jev for a run whose steps carry one", () => {
    expect(backendOf(fixtureJevRun)).toBe("jev");
  });
});

describe("the downloads and the recording", () => {
  test("two download links in the header, each to its file", async () => {
    const header = headerOf(await render(`/runs/${RUN_ID}`));
    expect(linksReading(header, "Download video")).toEqual([
      expect.stringMatching(new RegExp(`href="${videoUrl(RUN_ID)}"`)),
    ]);
    expect(linksReading(header, "Download trace")).toEqual([
      expect.stringMatching(new RegExp(`href="${traceUrl(RUN_ID)}"`)),
    ]);
    for (const attributes of [
      ...linksReading(header, "Download video"),
      ...linksReading(header, "Download trace"),
    ]) {
      expect(attributes).toMatch(/ download=""/);
    }
  });

  test("a muted player on the video under Recording, and where each file is stored", async () => {
    const recording = sectionOf(await render(`/runs/${RUN_ID}`), "Recording");
    const video = recording.match(/<video( [^>]*)>/)?.[1];
    if (video === undefined) throw new Error("no <video> under Recording");
    expect(attributesOf(video)).toMatchObject({
      src: videoUrl(RUN_ID),
      controls: "",
      preload: "metadata",
    });
    expect(video).toMatch(/ muted=""/);
    expect(detailsOf(recording)).toEqual({
      Video: "runs/run_vera-hard-1/video.webm",
      Trace: "runs/run_vera-hard-1/trace.zip",
    });
  });

  test("says not recorded for a run with neither file, and offers no download", async () => {
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
  // The timeline's own labels and links are step-timeline.test.tsx's; the screen picks the step.
  test("?step=2 makes step 2 the timeline's current step", async () => {
    expect(currentSteps(await render(`/runs/${RUN_ID}?step=2`))).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
  });

  test("with no step in the URL, step 0 is replayed and marked current", async () => {
    const html = await render(`/runs/${RUN_ID}`);
    expect(currentSteps(html)).toEqual([true, false, false, false, false]);
    expect(lineOf(sectionOf(html, "narration · after the fact"))).toContain(
      runResultFixture.steps[0]?.narration,
    );
  });

  test("the caption says where the step was and what it did, naming the target by its real name", async () => {
    const captions = await Promise.all(
      [0, 1, 2, 3, 4].map(async (step) => captionOf(await render(`/runs/${RUN_ID}?step=${step}`))),
    );
    expect(captions).toEqual([
      'step 0 on / · click e3 link "Deliveries" → /deliveries',
      "step 1 on /deliveries · scroll down → /deliveries",
      'step 2 on /deliveries · doubleClick e2 link "Settings" → /settings',
      "step 3 on /settings · wasted: no action ran",
      "step 4 on /settings · giveUp → /settings",
    ]);
  });

  test("the caption of a step whose action never landed says so", async () => {
    const path = `/runs/${RUN_ID}?step=4`;
    expect(captionOf(await render(path, cutShort(true)))).toBe(
      "step 4 on /settings · giveUp, never landed",
    );
    expect(captionOf(await render(path, cutShort(false)))).toBe(
      "step 4 on /settings · stopped before an action was planned",
    );
  });

  test("?step=4 replays the give-up and its narration, the last step", async () => {
    const html = await render(`/runs/${RUN_ID}?step=4`);
    expect(detailsOf(sectionOf(html, "Dice"))).toMatchObject({
      Proposed: "giveUp",
      Performed: "giveUp",
    });
    expect(lineOf(sectionOf(html, "narration · after the fact"))).toContain(
      "Nothing here about past orders either. I've looked everywhere I can read. I give up.",
    );
    expect(currentSteps(html).at(-1)).toBe(true);
  });

  test("?step=9 says the run has no such step, in the steps strip, and replays none", async () => {
    const html = await render(`/runs/${RUN_ID}?step=9`);
    const notice = html.match(/<p [^>]*role="status"[^>]*>(.*?)<\/p>/s)?.[1];
    expect(lineOf(notice ?? "")).toBe("This run has no step 9");
    const strip = html.indexOf('aria-label="Steps"');
    expect(strip).toBeGreaterThan(-1);
    expect(html.indexOf("This run has no step 9")).toBeGreaterThan(strip);
    expect(html.indexOf("This run has no step 9")).toBeLessThan(html.indexOf(">Recording<"));
    expect(h3Of(html)).toEqual([]);
    expect(captionOf(html)).toBeUndefined();
    expect(currentSteps(html)).not.toContain(true);
  });
});

/** The text of every `<h3>`: the replay's, which a page with no step replayed has none of. */
function h3Of(html: string): string[] {
  return [...html.matchAll(/<h3(?:\s[^>]*)?>(.*?)<\/h3>/gs)].map((h) => lineOf(h[1] ?? ""));
}

describe("the states before a run is shown", () => {
  test("a run io does not have", async () => {
    const html = await render("/runs/run_missing", null, { id: "run_missing" });
    expect(lineOf(html)).toContain("No run run_missing is stored. A run is stored when it ends");
    expect(h1Of(html)).toBe("run_missing");
  });

  test("a run still loading: a skeleton in the page's shape, under the run id", async () => {
    const html = await render("/runs/run_loading", null, { id: "run_other" });
    expect(lineOf(html)).toContain("Loading run");
    expect(h1Of(html)).toBe("run_loading");
    expect(html.match(/data-slot="skeleton"/g)?.length).toBeGreaterThan(2);
  });

  test("io down: a fault banner with the error, its message and Try again", async () => {
    const html = await renderWith("/runs/run_x", await ioDown("run_x"));
    const banner = html.match(/<div [^>]*role="alert"[^>]*>(.*)/s)?.[1] ?? "";
    expect(lineOf(banner)).toContain("This run could not be read from io. io answered 502");
    expect(banner).toMatch(/<button[^>]*>Try again<\/button>/);
    expect(lineOf(html)).not.toContain("Loading run");
    expect(h1Of(html)).toBe("run_x");
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
