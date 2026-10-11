import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { type RunOutcome, RunResult, Sweep } from "@wayford/core";
import { runResultFixture } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { runQuery } from "../api/runs.js";
import { sweepQuery, sweepsQuery } from "../api/sweeps.js";
import { BOUNDARY_PRESETS } from "../boundary/axis.js";
import { fixtureSweeps, stoppedSweep } from "../boundary/fixture-sweeps.js";
import { BOUNDARY_INTRO } from "../boundary/sweep-view.js";
import {
  attributesOf,
  decode,
  elementOf,
  lineOf,
  rowsOf,
  textOf,
} from "../preview/rendered-markup.js";
import { createAppRouter } from "../router.js";

const { vera, kai, noBoundary, stopped, incomplete, noRoutes, empty } = fixtureSweeps;

/** Vera's sweep, run for a profile that is not bundled. */
const guest = Sweep.parse({ ...vera, id: "swp_guest", profileId: "prof_guest" });

/** Kai's sweep on a task other than the hard goal, as the finals' pick stores one (#228). */
const elsewhere = Sweep.parse({ ...kai, id: "swp_kai-elsewhere", taskId: "task_elsewhere" });

/** `path` through the app's own router, with `client`'s cache as it stands. */
async function render(path: string, client: QueryClient = new QueryClient()): Promise<string> {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** A client holding each preset's stored sweeps, newest first, as io lists them. */
function presets(lists: { contrast?: Sweep[]; maxElements?: Sweep[] }): QueryClient {
  const client = new QueryClient();
  if (lists.contrast !== undefined) {
    client.setQueryData(sweepsQuery(BOUNDARY_PRESETS.contrast).queryKey, lists.contrast);
  }
  if (lists.maxElements !== undefined) {
    client.setQueryData(sweepsQuery(BOUNDARY_PRESETS.maxElements).queryKey, lists.maxElements);
  }
  return client;
}

/** Vera's preset, served `sweep` as the latest. */
function veraPreset(sweep: Sweep = vera): Promise<string> {
  return render("/boundary", presets({ contrast: [sweep] }));
}

/** The text of the page's `<h1>`, on one line. */
function h1Of(html: string): string {
  return said(html.match(/<h1(?:\s[^>]*)?>(.*?)<\/h1>/s)?.[1] ?? "");
}

/**
 * The text markup shows, tags dropped without a space, so a number set in its own span reads as
 * part of its sentence ("from 3:1."); whitespace collapsed.
 */
function said(html: string): string {
  return textOf(html).replace(/\s+/g, " ").trim();
}

/** The page's `<main>`: the screen without the top bar. */
function mainOf(html: string): string {
  const main = html.match(/<main(?:\s[^>]*)?>(.*)<\/main>/s)?.[1];
  if (main === undefined) throw new Error("no <main>");
  return main;
}

/**
 * The screen's text, on one line: what a person reads. The top bar is left out, and each block
 * ends in a space, so two paragraphs never run together; inline tags drop without one.
 */
function textLine(html: string): string {
  return said(mainOf(html).replace(/<\/(p|h1|h2|li|th|td|button|figure|section)>/g, " "));
}

/** The value table: from its `<table` to `</table>`. */
function tableOf(html: string): string {
  const start = html.indexOf("<table");
  if (start === -1) throw new Error("no <table>");
  return html.slice(start, html.indexOf("</table>", start) + "</table>".length);
}

/** The table's body rows, each as the attributes of its `<tr>` and of every `<a>` inside it. */
function bodyRows(html: string) {
  const body = tableOf(html).match(/<tbody(?:\s[^>]*)?>(.*?)<\/tbody>/s)?.[1] ?? "";
  return [...body.matchAll(/<tr(\s[^>]*)?>(.*?)<\/tr>/gs)].map((row) => ({
    attributes: attributesOf(row[1] ?? ""),
    links: [...(row[2] ?? "").matchAll(/<a(\s[^>]*)>/g)].map((a) => attributesOf(a[1] ?? "")),
  }));
}

/** Each `<a>` in `html`: its attributes and its inner markup. */
function anchors(html: string) {
  return [...html.matchAll(/<a(\s[^>]*)?>(.*?)<\/a>/gs)].map((a) => ({
    attributes: attributesOf(a[1] ?? ""),
    inner: a[2] ?? "",
  }));
}

/** The seed cells of the open value, in document order: links to a run's detail. */
function seedCells(html: string) {
  return anchors(html).filter((a) => a.attributes.href?.startsWith("/runs/"));
}

/** The axis switch's links: each one's text and whether it marks the preset shown. */
function switchItems(html: string) {
  return switchLinks(html).map(({ text, on }) => ({ text, on }));
}

/** The axis switch's links, with where each goes. */
function switchLinks(html: string) {
  const nav = elementOf(html, "nav", 'aria-label="Axis"');
  return [...nav.matchAll(/<a(\s[^>]*)>(.*?)<\/a>/gs)].map((link) => {
    const attributes = attributesOf(link[1] ?? "");
    return {
      text: lineOf(link[2] ?? ""),
      href: attributes.href,
      on: attributes["aria-current"] === "page",
    };
  });
}

/** `runResultFixture` as run `id`, with `outcome`, parsed as io would parse it. */
function storedRun(id: string, outcome: RunOutcome): RunResult {
  return RunResult.parse({ ...runResultFixture, id, outcome });
}

/**
 * The words `docs/DEMO.md` keeps off every screen, as this screen could say them. "get through
 * from" is the headline that claimed every value past the boundary (#184): it names the first only.
 */
const BANNED = ["route closes", "predicts", "can't see", "impaired", "get through from"];

describe("/boundary, Vera's preset", () => {
  test("opens her latest sweep with the headline naming the boundary", async () => {
    expect(h1Of(await veraPreset())).toBe("Under half get through, first at 3:1.");
  });

  test("the headline's number is the one display-xl figure, in signal ink", async () => {
    const h1 = (await veraPreset()).match(/<h1(?:\s[^>]*)?>(.*?)<\/h1>/s)?.[1] ?? "";
    expect(h1).toMatch(
      /<span class="[^"]*\bdisplay-xl\b[^"]*\btext-signal-ink\b[^"]*">3:1<\/span>/,
    );
  });

  test("the chart draws both series, the post and its flag", async () => {
    const html = await veraPreset();
    expect(html).toMatch(/<line [^>]*data-mark="post"/);
    expect(lineOf(elementOf(html, "text", 'data-mark="flag-text"'))).toBe("boundary 3.0:1 · 2/10");
    expect(html).toMatch(/data-series="route"/);
    expect(html).toMatch(/data-series="through"/);
  });

  test("the meta line names the persona, goal, backend, range, seeds and run count", async () => {
    expect(textLine(await veraPreset())).toContain(
      "Vera · task_past-order · jev · contrast 1.5–4.5:1 · seeds 1–10 · 70 runs",
    );
  });

  test("the lead gives got through and route open at the boundary, k/n in mono", async () => {
    const html = await veraPreset();
    expect(textLine(html)).toContain(
      "The first value, from the laxest, where under half got through: 2/10 at 3:1, while the filter left a route open in 3/10.",
    );
    expect(html).toMatch(/<b class="[^"]*\bfont-mono\b[^"]*">2\/10<\/b>/);
    expect(html).toMatch(/<b class="[^"]*\bfont-mono\b[^"]*">3\/10<\/b>/);
  });

  test("the note under the table says only the swept value moves", async () => {
    expect(textLine(await veraPreset())).toContain(
      "Only Vera's contrast threshold moves; the rest of the profile stays as stored.",
    );
  });

  test("the avatar heads the screen for a bundled persona", async () => {
    expect(await veraPreset()).toMatch(/data-part="body"/);
  });

  test("the switch holds both presets, contrast marked", async () => {
    expect(switchItems(await veraPreset())).toEqual([
      { text: "contrast · Vera", on: true },
      { text: "attention · Kai", on: false },
    ]);
  });

  test("each switch item is a link to its preset: one click, and an open value dropped", async () => {
    const html = await render("/boundary?axis=contrast&value=3", presets({ contrast: [vera] }));
    expect(switchLinks(html).map((link) => [link.href, link.on])).toEqual([
      ["/boundary?axis=contrast", true],
      ["/boundary?axis=maxElements", false],
    ]);
  });

  test("the table lists every stored value: route open, got through, runs", async () => {
    expect(rowsOf(tableOf(await veraPreset()))).toEqual([
      ["value", "route open", "got through", "runs"],
      ["1.5:1", "10/10", "9/10", "10"],
      ["2.0:1", "10/10", "8/10", "10"],
      ["2.5:1", "6/10", "5/10", "10"],
      ["3.0:1", "3/10", "2/10", "10"],
      ["3.5:1", "1/10", "1/10", "10"],
      ["4.0:1", "0/10", "0/10", "1 error 10"],
      ["4.5:1", "0/10", "0/10", "10"],
    ]);
  });

  test("the header text sits in paragraphs, so the self-check measures it", async () => {
    const head = tableOf(await veraPreset()).match(/<thead>(.*?)<\/thead>/s)?.[1] ?? "";
    const cells = [...head.matchAll(/<th(?:\s[^>]*)?>(.*?)<\/th>/gs)].map((th) => th[1] ?? "");
    expect(cells).toHaveLength(4);
    for (const cell of cells) expect(cell).toMatch(/^<p[\s>]/);
  });

  test("each cell of a row links to that value's runs on the preset", async () => {
    // `/boundary` with no axis is Vera's preset, so the link only adds the value.
    const rows = bodyRows(await veraPreset());
    expect(rows.map((row) => row.links.map((link) => decode(link.href ?? "")))).toEqual(
      vera.values.map((row) => Array.from({ length: 4 }, () => `/boundary?value=${row.value}`)),
    );
    // 3, not 3.0: the search param is the number.
    expect(rows[3]?.links[0]?.href).toBe("/boundary?value=3");
  });

  test("each link says what it opens, and the boundary row says it is the boundary", async () => {
    const boundary = bodyRows(await veraPreset())[3];
    expect(boundary?.links.map((link) => link["aria-label"])).toEqual([
      "boundary, 3.0:1: open its runs",
      "route open 3/10 at 3.0:1: open its runs",
      "got through 2/10 at 3.0:1: open its runs",
      "10 runs at 3.0:1: open them",
    ]);
    const errored = bodyRows(await veraPreset())[5];
    expect(errored?.links[3]?.["aria-label"]).toBe("10 runs at 4.0:1, 1 error: open them");
  });

  test("got through carries a dashed underline, as a hypothesis", async () => {
    const table = tableOf(await veraPreset());
    expect(table).toMatch(/<span class="[^"]*\bborder-dashed\b[^"]*">2\/10<\/span>/);
  });

  test("only the boundary row is drawn in signal ink, with its post", async () => {
    const table = tableOf(await veraPreset());
    const marked = [...table.matchAll(/<tr(\s[^>]*)?>(.*?)<\/tr>/gs)].filter((row) =>
      (row[2] ?? "").includes("text-signal-ink"),
    );
    expect(marked).toHaveLength(1);
    expect(lineOf(marked[0]?.[2] ?? "")).toMatch(/^3\.0:1 /);
    expect(marked[0]?.[2]).toMatch(/data-mark="boundary-post"/);
    expect(table.match(/data-mark="boundary-post"/g)).toHaveLength(1);
  });

  test("no row is selected and no runs are open without a value", async () => {
    const html = await veraPreset();
    expect(bodyRows(html).some((row) => row.attributes["aria-current"] !== undefined)).toBe(false);
    expect(seedCells(html)).toEqual([]);
  });
});

describe("/boundary?axis=maxElements, Kai's preset", () => {
  const kaiPreset = () => render("/boundary?axis=maxElements", presets({ maxElements: [kai] }));

  test("opens his latest sweep: under half get through, first at 10", async () => {
    expect(h1Of(await kaiPreset())).toBe("Under half get through, first at 10.");
  });

  test("the switch holds both presets, attention pressed", async () => {
    expect(switchItems(await kaiPreset())).toEqual([
      { text: "contrast · Vera", on: false },
      { text: "attention · Kai", on: true },
    ]);
  });

  test("the lead names the cap with its unit", async () => {
    expect(textLine(await kaiPreset())).toContain(
      "The first value, from the laxest, where under half got through: 4/10 at 10 elements, while the filter left a route open in 10/10.",
    );
  });

  test("the cells link to Kai's preset, the axis kept", async () => {
    const rows = bodyRows(await kaiPreset());
    expect(rows.map((row) => decode(row.links[2]?.href ?? ""))).toEqual(
      kai.values.map((row) => `/boundary?axis=maxElements&value=${row.value}`),
    );
  });

  test("the note names the attention cap", async () => {
    expect(textLine(await kaiPreset())).toContain(
      "Only Kai's attention cap moves; the rest of the profile stays as stored.",
    );
  });
});

describe("a preset opens the hard goal's sweep, whatever else is stored (#228)", () => {
  test("Kai's skips a newer sweep on another task, and of two on the hard goal opens io's first", async () => {
    const later = Sweep.parse({ ...kai, id: "swp_kai-later", backend: "llm" });
    const html = await render(
      "/boundary?axis=maxElements",
      presets({ maxElements: [elsewhere, later, kai] }),
    );
    expect(textLine(html)).toContain("Kai · task_past-order · llm · maxElements");
    expect(html).not.toContain("task_elsewhere");
  });

  test("with only another task's sweep stored, the preset is empty", async () => {
    const html = await render("/boundary?axis=maxElements", presets({ maxElements: [elsewhere] }));
    expect(h1Of(html)).toBe("No attention sweep on Kai on the hard goal yet.");
    expect(html).not.toContain("task_elsewhere");
  });
});

describe("the runs behind a value", () => {
  /** Vera's preset with 3 open, and the runs at 3 as `outcomes` says, by seed. */
  function openAt3(outcomes: Record<number, RunOutcome | null>): Promise<string> {
    const client = presets({ contrast: [vera] });
    const row = vera.values.find((value) => value.value === 3);
    if (row === undefined) throw new Error("Vera's fixture has no value 3");
    for (const [seed, outcome] of Object.entries(outcomes)) {
      const id = row.runIds[vera.seeds.indexOf(Number(seed))];
      if (id === undefined) throw new Error(`no run for seed ${seed}`);
      client.setQueryData(runQuery(id).queryKey, outcome === null ? null : storedRun(id, outcome));
    }
    return render("/boundary?axis=contrast&value=3", client);
  }

  test("?value=3 lists the ten runs at 3.0:1, in seed order, each linking to its detail", async () => {
    const cells = seedCells(await openAt3({}));
    expect(cells.map((cell) => cell.attributes.href)).toEqual(
      vera.seeds.map((seed) => `/runs/run_swp-vera-30-s${seed}`),
    );
  });

  test("the cells hold no text: their labels say it", async () => {
    for (const cell of seedCells(await openAt3({}))) expect(lineOf(cell.inner)).toBe("");
  });

  test("the panel says which value it holds, its legend, and a close link that drops the value", async () => {
    const html = await openAt3({});
    expect(textLine(html)).toContain("runs at 3.0:1");
    const legend = elementOf(html, "ul", 'aria-label="Seed cell legend"');
    expect([...legend.matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map((li) => lineOf(li[1] ?? ""))).toEqual(
      ["route open", "got through", "every route closed", "error"],
    );
    const close = anchors(html).filter((a) => lineOf(a.inner) === "Close");
    expect(close.map((a) => a.attributes.href)).toEqual(["/boundary?axis=contrast"]);
  });

  test("the row of the open value is marked current", async () => {
    const rows = bodyRows(await openAt3({}));
    expect(rows.map((row) => row.attributes["aria-current"])).toEqual([
      undefined,
      undefined,
      undefined,
      "true",
      undefined,
      undefined,
      undefined,
    ]);
  });

  test("a value no row holds opens nothing", async () => {
    const html = await render("/boundary?axis=contrast&value=3.25", presets({ contrast: [vera] }));
    expect(seedCells(html)).toEqual([]);
    expect(h1Of(html)).toBe("Under half get through, first at 3:1.");
  });

  test("each cell draws route open by its border alone, the outcome by its fill or slash", async () => {
    // Seeds 2, 5 and 9 had a route open at 3.0; every other seed's was closed.
    const cells = seedCells(
      await openAt3({
        1: "success",
        2: "success",
        3: "error",
        4: null,
        5: "budget_exceeded",
        7: "gave_up",
        9: "error",
      }),
    );
    const classes = (seed: number) => (cells[seed - 1]?.attributes.class ?? "").split(" ");
    const slashed = (seed: number) => /<svg[^>]*\btext-fault\b/.test(cells[seed - 1]?.inner ?? "");
    const open = ["border-solid", "border-ink"];
    const closed = ["border-dashed", "border-line-strong"];

    // The border is the filter's, whatever the run did: open seeds solid, closed seeds dashed.
    for (const seed of [2, 5, 9])
      expect(classes(seed), `seed ${seed}`).toEqual(expect.arrayContaining(open));
    for (const seed of [1, 3, 4, 7]) {
      expect(classes(seed), `seed ${seed}`).toEqual(expect.arrayContaining(closed));
      expect(classes(seed), `seed ${seed}`).not.toContain("border-solid");
    }
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(classes(seed), `seed ${seed}`).not.toContain("border-fault");
    }
    // Got through fills the cell, on an open route and on a closed one alike.
    for (const seed of [1, 2]) expect(classes(seed), `seed ${seed}`).toContain("bg-(--p)");
    for (const seed of [3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(classes(seed), `seed ${seed}`).not.toContain("bg-(--p)");
    }
    // An error and a run never stored are slashed; nothing else is.
    for (const seed of [3, 4, 9]) expect(slashed(seed), `seed ${seed}`).toBe(true);
    for (const seed of [1, 2, 5, 6, 7, 8, 10]) expect(slashed(seed), `seed ${seed}`).toBe(false);
    // A run still loading (6, 8, 10) is a skeleton with no border, so it reads as no outcome.
    for (const seed of [6, 8, 10]) {
      expect(cells[seed - 1]?.inner, `seed ${seed}`).toMatch(/data-slot="skeleton"/);
      expect(
        classes(seed).filter((c) => c.startsWith("border")),
        `seed ${seed}`,
      ).toEqual([]);
    }
    for (const seed of [1, 2, 3, 4, 5, 7, 9]) {
      expect(cells[seed - 1]?.inner, `seed ${seed}`).not.toMatch(/data-slot="skeleton"/);
    }
  });

  test("a run io fails to send is drawn as no outcome, under a fault banner with Try again", async () => {
    // `retryOnMount: false` keeps the failure: a static render puts a failed query back to pending.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, retryOnMount: false } },
    });
    client.setQueryData(sweepsQuery(BOUNDARY_PRESETS.contrast).queryKey, [vera]);
    const row = vera.values.find((value) => value.value === 3);
    const [first, second] = row?.runIds ?? [];
    if (first === undefined || second === undefined) throw new Error("no runs at 3");
    client.setQueryData(runQuery(first).queryKey, storedRun(first, "gave_up"));
    await client.prefetchQuery({
      ...runQuery(second),
      queryFn: () => Promise.reject(new Error("io answered 500")),
    });
    const html = await render("/boundary?axis=contrast&value=3", client);

    const failed = seedCells(html)[1];
    expect(failed?.attributes["aria-label"]).toBe(
      "seed 2: outcome not read, route open. Opens run_swp-vera-30-s2",
    );
    // No border, no fill, no slash and no shimmer: nothing a read run is drawn with.
    const classes = (failed?.attributes.class ?? "").split(" ");
    expect(classes.filter((c) => c.startsWith("border"))).toEqual([]);
    expect(classes).toContain("bg-paper-sunken");
    expect(classes).not.toContain("bg-(--p)");
    expect(failed?.inner).toBe("");

    const banner = html.slice(html.indexOf('role="alert"'));
    expect(banner).not.toBe(html);
    expect(lineOf(banner)).toContain("1 run of 10 could not be read from io. io answered 500");
    expect(banner).toMatch(/<span class="[^"]*\bfont-mono\b[^"]*">io answered 500<\/span>/);
    expect(banner).toMatch(/<button[^>]*>Try again<\/button>/);
  });

  test("with every run read or loading, no fault banner shows", async () => {
    expect(await openAt3({ 1: "gave_up" })).not.toMatch(/role="alert"/);
  });

  test("each cell's label says the seed, the outcome, the route and the run", async () => {
    const cells = seedCells(await openAt3({ 1: "gave_up", 2: "success", 3: "error", 4: null }));
    expect(cells.slice(0, 4).map((cell) => cell.attributes["aria-label"])).toEqual([
      "seed 1: gave up, every route closed. Opens run_swp-vera-30-s1",
      "seed 2: got through, route open. Opens run_swp-vera-30-s2",
      "seed 3: error, every route closed. Opens run_swp-vera-30-s3",
      "seed 4: not stored, every route closed. Opens run_swp-vera-30-s4",
    ]);
  });

  test("a budget run out's label names the limit that cut it off, or over budget when none is recorded", async () => {
    const client = presets({ contrast: [vera] });
    const [first, second, third] = vera.values.find((value) => value.value === 3)?.runIds ?? [];
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error("no three runs at 3");
    }
    /** Run `id` cut off by what `limit` records: the step cap, the clock, or nothing, as before #196. */
    const ranOut = (id: string, limit: Partial<RunResult>) =>
      RunResult.parse({ ...storedRun(id, "budget_exceeded"), ...limit });
    client.setQueryData(runQuery(first).queryKey, ranOut(first, { limit: "steps", maxSteps: 5 }));
    client.setQueryData(runQuery(second).queryKey, ranOut(second, { limit: "clock" }));
    client.setQueryData(runQuery(third).queryKey, ranOut(third, {}));
    const cells = seedCells(await render("/boundary?axis=contrast&value=3", client));
    expect(cells.slice(0, 3).map((cell) => cell.attributes["aria-label"])).toEqual([
      "seed 1: hit the step cap, every route closed. Opens run_swp-vera-30-s1",
      "seed 2: out of time, route open. Opens run_swp-vera-30-s2",
      "seed 3: over budget, every route closed. Opens run_swp-vera-30-s3",
    ]);
  });

  test("a cell whose run id was minted says it opens the run's label, and links to the whole id", async () => {
    // A run id as `newId("run")` mints it (#200), in place of seed 1's fixture id at 3.
    const id = "run_01m4bbcm8s1a0mcqac4v3fr6hk";
    const sweep = Sweep.parse({
      ...vera,
      values: vera.values.map((row) =>
        row.value === 3 ? { ...row, runIds: [id, ...row.runIds.slice(1)] } : row,
      ),
    });
    const client = presets({ contrast: [sweep] });
    client.setQueryData(runQuery(id).queryKey, storedRun(id, "gave_up"));
    const [first] = seedCells(await render("/boundary?axis=contrast&value=3", client));
    expect(first?.attributes["aria-label"]).toBe(
      "seed 1: gave up, every route closed. Opens run …3fr6hk",
    );
    expect(first?.attributes.href).toBe(`/runs/${id}`);
  });

  test("without a route table, a cell has the Report's one border and its label says so", async () => {
    const client = presets({ contrast: [noRoutes] });
    const id = noRoutes.values.find((value) => value.value === 3)?.runIds[0];
    if (id === undefined) throw new Error("no run at 3");
    client.setQueryData(runQuery(id).queryKey, storedRun(id, "gave_up"));
    const html = await render("/boundary?axis=contrast&value=3", client);
    const cells = seedCells(html);
    expect(cells).toHaveLength(10);
    const first = cells[0];
    expect((first?.attributes.class ?? "").split(" ")).toEqual(
      expect.arrayContaining(["border", "border-solid", "border-line-strong"]),
    );
    expect(first?.attributes["aria-label"]).toBe(`seed 1: gave up, no route table. Opens ${id}`);
  });
});

describe("/boundary/$sweepId", () => {
  test("opens a stored sweep, the switch pressing neither, so each item opens its preset", async () => {
    // A stored sweep need not be its preset's latest: a pressed item could not be clicked to reach it.
    const client = new QueryClient();
    client.setQueryData(sweepQuery(vera.id).queryKey, vera);
    const html = await render(`/boundary/${vera.id}`, client);
    expect(h1Of(html)).toBe("Under half get through, first at 3:1.");
    expect(switchItems(html)).toEqual([
      { text: "contrast · Vera", on: false },
      { text: "attention · Kai", on: false },
    ]);
  });

  test("its cells link to the same sweep with the value set", async () => {
    const client = new QueryClient();
    client.setQueryData(sweepQuery(vera.id).queryKey, vera);
    const rows = bodyRows(await render(`/boundary/${vera.id}`, client));
    expect(rows[3]?.links.map((link) => link.href)).toEqual(
      Array.from({ length: 4 }, () => `/boundary/${vera.id}?value=3`),
    );
  });

  test("with a value open, Close drops it and keeps the sweep", async () => {
    const client = new QueryClient();
    client.setQueryData(sweepQuery(vera.id).queryKey, vera);
    const html = await render(`/boundary/${vera.id}?value=3`, client);
    expect(seedCells(html)).toHaveLength(10);
    const close = anchors(html).filter((a) => lineOf(a.inner) === "Close");
    expect(close.map((a) => a.attributes.href)).toEqual([`/boundary/${vera.id}`]);
  });

  test("a profile not bundled reads as its id, with no avatar", async () => {
    const client = new QueryClient();
    client.setQueryData(sweepQuery(guest.id).queryKey, guest);
    const html = await render(`/boundary/${guest.id}`, client);
    expect(textLine(html)).toContain("prof_guest · task_past-order · jev · contrast 1.5–4.5:1");
    expect(html).not.toMatch(/data-part="body"/);
  });

  test("a sweep io does not have is the not-found state, with a way back", async () => {
    const client = new QueryClient();
    client.setQueryData(sweepQuery("swp_none").queryKey, null);
    const html = await render("/boundary/swp_none", client);
    expect(h1Of(html)).toBe("No stored sweep swp_none.");
    // In the screen, not the top bar's own Boundary link.
    const back = anchors(mainOf(html)).filter((a) => a.attributes.href === "/boundary");
    expect(back.map((a) => lineOf(a.inner))).toEqual(["Open the latest sweep"]);
  });
});

describe("what a sweep says, beyond a boundary", () => {
  test("no boundary in range: the headline says so up to the last value", async () => {
    const html = await veraPreset(noBoundary);
    expect(h1Of(html)).toBe("No boundary up to 4.5:1.");
    expect(textLine(html)).toContain(
      "Half or more got through at every value from 1.5:1 to 4.5:1.",
    );
  });

  test("stopped at an error: the headline names the value and the error, never no boundary", async () => {
    const html = await veraPreset(stopped);
    expect(h1Of(html)).toBe("Stops at 2.5:1: a run errored.");
    expect(textLine(html)).toContain(
      "1 run at 2.5:1 errored, so the sweep claims nothing from there on.",
    );
    expect(textLine(html).toLowerCase()).not.toContain("no boundary");
  });

  test.each([
    ["no boundary", noBoundary, "text-ink"],
    ["a stop", stopped, "text-fault"],
  ])(
    "%s sets the headline's number off signal: orange is the boundary's alone",
    async (_, sweep, tone) => {
      const h1 = (await veraPreset(sweep)).match(/<h1(?:\s[^>]*)?>(.*?)<\/h1>/s)?.[1] ?? "";
      const figure = h1.match(/<span class="([^"]*\bdisplay-xl\b[^"]*)">/)?.[1] ?? "";
      expect(figure.split(" ")).toContain(tone);
      expect(figure).not.toContain("signal");
    },
  );

  test("stopped by two errored runs says runs", async () => {
    const twice = stoppedSweep(2);
    const html = await veraPreset(twice);
    expect(h1Of(html)).toBe("Stops at 2.5:1: 2 runs errored.");
    expect(textLine(html)).toContain("2 runs at 2.5:1 errored");
  });

  test("the table still lists the values past a stop", async () => {
    expect(bodyRows(await veraPreset(stopped))).toHaveLength(vera.values.length);
  });

  test("an incomplete sweep says how far it got", async () => {
    const html = await veraPreset(incomplete);
    expect(textLine(html)).toContain(
      "Vera · task_past-order · jev · contrast 1.5–4.5:1 · seeds 1–10 · 30 runs · incomplete, 3 of 7 values",
    );
    expect(h1Of(html)).toBe("No boundary up to 2.5:1.");
  });

  test("a sweep with nothing stored yet says nothing is measured", async () => {
    const html = await veraPreset(empty);
    expect(h1Of(html)).toBe("Nothing measured yet.");
    expect(textLine(html)).toContain("The sweep is stored, but no value has finished yet.");
  });

  test("without a route table, the lead says route open reads —", async () => {
    expect(textLine(await veraPreset(noRoutes))).toContain(
      "The first value, from the laxest, where under half got through: 2/10 at 3:1. This goal has no route table, so route open reads —.",
    );
    expect(rowsOf(tableOf(await veraPreset(noRoutes)))[4]).toEqual(["3.0:1", "—", "2/10", "10"]);
  });

  // The chart's words are on the screen too, so this covers them.
  test.each([
    ["a boundary", vera],
    ["no boundary", noBoundary],
    ["stopped", stopped],
    ["no route table", noRoutes],
  ])("%s says none of the words the demo keeps off the screen", async (_, sweep) => {
    const said = textLine(await veraPreset(sweep)).toLowerCase();
    for (const word of BANNED) expect(said, word).not.toContain(word);
  });
});

describe("the states before a sweep is shown", () => {
  test("a preset with no stored sweep says how to store one", async () => {
    const html = await render("/boundary?axis=maxElements", presets({ maxElements: [] }));
    expect(h1Of(html)).toBe("No attention sweep on Kai on the hard goal yet.");
    expect(textLine(html)).toContain("no sweep found");
    expect(textLine(html)).toContain(
      "pnpm seed:demo stores both demo sweeps in an empty database. pnpm --filter @wayford/io sweep prints how to run one alone.",
    );
    expect(html).toMatch(/<code[^>]*>pnpm seed:demo<\/code>/);
    expect(html).toMatch(/<button[^>]*>Check again<\/button>/);
  });

  test("Vera's empty preset names her and contrast, and the switch still reaches Kai", async () => {
    const html = await render("/boundary", presets({ contrast: [] }));
    expect(h1Of(html)).toBe("No contrast sweep on Vera on the hard goal yet.");
    expect(switchItems(html).map((item) => item.text)).toEqual([
      "contrast · Vera",
      "attention · Kai",
    ]);
  });

  test("io down: the fault banner with io's words and Try again", async () => {
    // `retryOnMount: false` keeps the failure: a static render puts a failed query back to pending.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, retryOnMount: false } },
    });
    await client.prefetchQuery({
      ...sweepsQuery(BOUNDARY_PRESETS.contrast),
      queryFn: () => Promise.reject(new Error("io answered 502")),
    });
    const html = mainOf(await render("/boundary", client));
    // The banner holds its action in a `<div>` of its own, so it is read to the end of the screen.
    const banner = html.slice(html.indexOf('role="alert"'));
    expect(banner).not.toBe(html);
    expect(lineOf(banner)).toContain(
      "The stored sweeps could not be read from io. io answered 502",
    );
    expect(banner).toMatch(/<span class="[^"]*\bfont-mono\b[^"]*">io answered 502<\/span>/);
    expect(banner).toMatch(/<button[^>]*>Try again<\/button>/);
  });

  test("loading: the skeleton in the content's shape, and no Loading… alone", async () => {
    const html = await render("/boundary");
    expect(html.match(/data-slot="skeleton"/g)?.length).toBeGreaterThan(3);
    expect(textLine(html)).not.toMatch(/loading/i);
  });

  test("loading a stored sweep by id: the skeleton too", async () => {
    const html = await render(`/boundary/${vera.id}`);
    expect(html).toMatch(/data-slot="skeleton"/);
  });
});

describe("the intro says what the page is for (#242)", () => {
  /** A missing sweep id, as io answers it. */
  function missing(): Promise<string> {
    const client = new QueryClient();
    client.setQueryData(sweepQuery("swp_none").queryKey, null);
    return render("/boundary/swp_none", client);
  }

  /** The empty preset: Kai's, with nothing stored. */
  function emptyPreset(): Promise<string> {
    return render("/boundary?axis=maxElements", presets({ maxElements: [] }));
  }

  // The reading changes the headline and the lead, never the head's rows the intro sits in.
  test.each([
    ["a preset", () => veraPreset()],
    ["a sweep by id", () => render(`/boundary/${kai.id}`, sweepById(kai))],
  ])("%s: the intro comes before the headline and the chart", async (_, open) => {
    const main = mainOf(await open());
    const intro = main.indexOf(BOUNDARY_INTRO);
    expect(intro).toBeGreaterThan(-1);
    expect(intro).toBeLessThan(main.indexOf("<h1"));
    expect(intro).toBeLessThan(main.indexOf("<figure"));
  });

  test.each([
    ["the empty preset", emptyPreset],
    ["a missing id", missing],
  ])("%s: the intro, then what is missing, then how to store one", async (_, open) => {
    const main = mainOf(await open());
    const intro = main.indexOf(BOUNDARY_INTRO);
    expect(intro).toBeGreaterThan(-1);
    expect(intro).toBeLessThan(main.indexOf("<h1"));
    const how = main.indexOf("How to store one:");
    expect(how).toBeGreaterThan(main.indexOf("</h1>"));
    expect(how).toBeLessThan(main.indexOf("<code"));
  });

  test("the commands are one secondary line, in ink-3, the commands with no ink of their own", async () => {
    const html = await emptyPreset();
    const line = html.match(/<p class="([^"]*)">How to store one:(.*?)<\/p>/s);
    expect(line?.[1]?.split(" ")).toContain("text-ink-3");
    const commands = [...(line?.[2] ?? "").matchAll(/<code class="([^"]*)"/g)];
    expect(commands).toHaveLength(2);
    for (const [, classes] of commands) expect(classes).not.toMatch(/\btext-ink/);
  });

  test.each([
    ["the empty preset", emptyPreset],
    ["a missing id", missing],
  ])("%s says none of the words the demo keeps off the screen", async (_, open) => {
    const said = textLine(await open()).toLowerCase();
    for (const word of BANNED) expect(said, word).not.toContain(word);
  });
});

/** A client holding `sweep` under its id. */
function sweepById(sweep: Sweep): QueryClient {
  const client = new QueryClient();
  client.setQueryData(sweepQuery(sweep.id).queryKey, sweep);
  return client;
}

test("the meta line takes the backend from the data, and the page draws no source badge", async () => {
  const html = await render("/boundary", presets({ contrast: [{ ...vera, backend: "llm" }] }));
  expect(textLine(html)).toContain("Vera · task_past-order · llm · contrast");
  expect(html).not.toContain("data-source");
});
