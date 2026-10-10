/**
 * The report screen in a real browser (`tasks/s3-08-report-screen.md`, box 3 and "Fit"): the web
 * app on its own Vite dev server, in Chromium at 1280 × 720, with io's `/api` answered by
 * `page.route` per path and a 404 for anything else, the run's screenshot, video and trace files
 * included.
 *
 * - Beat 5's click path: Kai's row, then the evidence link of his failed run, opens run detail at
 *   the step his finding cites.
 * - A finding backed by ten runs shows three evidence links and "Show 7 more", which shows the
 *   rest with focus on the first of them, and folds them again.
 * - "Analyse again" shows it running while io's `POST` is held, posts the report's own backend, and
 *   draws the new report once io answers; a refusal shows the fault, and Try again posts the same,
 *   also when the analysis that failed was started by a page since left.
 * - The meta line names the report's backend, and the page draws no source badge.
 * - With no report, "Analyse runs" posts no backend, so io reads the one the task's runs are on.
 * - Arriving with `?analyse=true`, as the race's "Analyse this race" does, starts the Analyst once
 *   and drops the flag, so a reload starts nothing. With a report stored it starts none. Arriving
 *   again within the app starts it once on a report already read as none, StrictMode's second
 *   effect included, and not again while it runs, which shows as running.
 * - Back on a goal whose analysis ended, while another goal's runs, the status region says nothing.
 * - A ten-seed report fits: the findings' headings end above 720 px, and nothing scrolls sideways.
 */
import { fileURLToPath } from "node:url";
import { type PersonaResult, Report, RunResult } from "@wayford/core";
import { reportFixture, runResultFixture, taskFixtures } from "@wayford/core/fixtures";
import { type Browser, chromium, type Page, type Request } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, expect, onTestFinished, test, vi } from "vitest";
import { ANALYST_LINES } from "../components/analyst-working.js";

// Starting Vite, its first transform of the app and launching Chromium take longer than vitest's
// 5 s hook default.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const WEB_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const TASK_ID = "task_past-order";
const REPORT_PATH = `/api/reports/${TASK_ID}`;

/** Kai's first seed on the hard goal: the run that gave up, which his A1 finding cites at step 1. */
const KAI_RUN = RunResult.parse({
  ...runResultFixture,
  id: "run_kai-past-order-1",
  profileId: "prof_kai",
  seed: 1,
  outcome: "gave_up",
});

/** The hard goal's report as read on the `llm` backend, so a hard-coded `jev` shows. */
const LLM_REPORT = Report.parse({ ...reportFixture(TASK_ID), backend: "llm" });

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  server = await createServer({
    root: WEB_ROOT,
    configFile: `${WEB_ROOT}vite.config.ts`,
    logLevel: "silent",
    // Port 0, so a developer's `pnpm dev` on 5173 does not fail the test. Vite never reads
    // `strictPort` for port 0.
    server: { port: 0 },
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (url === undefined) throw new Error("the web dev server reported no local URL");
  origin = url.replace(/\/$/, "");
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

/** What io answers one request with: a status, 200 unless given, and a JSON body. */
type Answer = { status?: number; json: unknown };

/** io as one test fakes it: an answer per request, or `undefined` for a 404. */
type Io = (request: Request, pathname: string) => Answer | Promise<Answer> | undefined;

/** A 1280 × 720 page whose `/api` calls `io` answers, closed when the test ends. */
async function servedPage(io: Io): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  onTestFinished(() => page.close());
  // By path prefix, as the dev server's proxy matches it: a glob like `**/api/**` would catch the
  // app's own modules under `src/api/` too.
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const request = route.request();
      const answer = await io(request, new URL(request.url()).pathname);
      if (answer === undefined) {
        return route.fulfill({ status: 404, json: { error: "not in this test" } });
      }
      return route.fulfill({ status: answer.status ?? 200, json: answer.json });
    },
  );
  return page;
}

/** A `GET` of `path` answered with `json`; anything else is left to the caller. */
function get(request: Request, pathname: string, path: string, json: unknown): Answer | undefined {
  return request.method() === "GET" && pathname === path ? { json } : undefined;
}

/** A `POST` the page made: its body as sent, and its content type. */
type Posted = { body: string | null; contentType: string | undefined };

function posted(request: Request): Posted {
  return { body: request.postData(), contentType: request.headers()["content-type"] };
}

/** A promise and the function that settles it, for an answer the test holds back. */
function held<T>(): { promise: Promise<T>; release: (value: T) => void } {
  let release!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/**
 * The hard goal's report with each persona's seeds cloned to ten, as the demo stores them: seed
 * `n` copies the outcome and open routes of the persona's own seed `(n - 1) % 3 + 1`, under the run
 * id `run_<persona>-past-order-<n>`. The counts are taken again from the new seeds, so `Report`
 * accepts it, and the findings' evidence still names seeds 1 to 3, which keep their ids.
 */
function tenSeedReport(): Report {
  const report = reportFixture(TASK_ID);
  const personas = report.personas.map((result): PersonaResult => {
    const persona = result.profileId.replace(/^prof_/, "");
    const seeds = Array.from({ length: 10 }, (_, i) => {
      const source = result.seeds[i % result.seeds.length];
      if (source === undefined) throw new Error(`${result.profileId} has no seeds`);
      return { ...source, seed: i + 1, runId: `run_${persona}-past-order-${i + 1}` };
    });
    const ended = (outcome: string) => seeds.filter((seed) => seed.outcome === outcome).length;
    const successes = ended("success");
    return {
      ...result,
      runs: seeds.length,
      errors: ended("error"),
      successes,
      routeOpenSeeds: seeds.filter((seed) => (seed.openRoutes ?? []).length > 0).length,
      medianSuccessMs: successes === 0 ? null : result.medianSuccessMs,
      seeds,
    };
  });
  const runCount = personas.reduce((sum, result) => sum + result.runs, 0);
  return Report.parse({ ...report, personas, runCount });
}

test("Kai's row, then his failed run's evidence, opens run detail at that step", async () => {
  const page = await servedPage(
    (request, pathname) =>
      get(request, pathname, REPORT_PATH, reportFixture(TASK_ID)) ??
      get(request, pathname, `/api/runs/${KAI_RUN.id}`, KAI_RUN) ??
      get(request, pathname, "/api/tasks", taskFixtures),
  );
  await page.goto(`${origin}/report/${TASK_ID}`);
  await page.getByRole("heading", { name: /^Measurement/ }).waitFor();

  // The row pick: Kai's name in the cast table.
  await page
    .locator('[data-persona="prof_kai"]')
    .getByRole("link", { name: "Kai", exact: true })
    .click();
  await page.waitForFunction(
    () => new URLSearchParams(location.search).get("persona") === "prof_kai",
  );
  await page.getByText("Kai's findings and the page's measurements.").waitFor();

  // His run that gave up, at the step his finding cites.
  await page.getByRole("link", { name: "Kai, seed 1 · Gave up" }).click();
  await page.waitForURL(`${origin}/runs/run_kai-past-order-1?step=1`);
  await page.getByRole("heading", { name: "Step 1", exact: true }).waitFor();
});

test("a finding backed by ten runs shows three evidence links, and Show 7 more shows the rest", async () => {
  const report = tenSeedReport();
  const a1 = report.findings.find((finding) => finding.id === "fnd_kai-order-archive-a1");
  if (a1 === undefined) throw new Error("the hard goal's report has no A1 finding for Kai");
  const evidence = Array.from({ length: 10 }, (_, i) => ({
    runId: `run_kai-past-order-${i + 1}`,
    stepIndex: 1,
  }));
  const backed = Report.parse({
    ...report,
    findings: report.findings.map((finding) => (finding === a1 ? { ...a1, evidence } : finding)),
  });
  const page = await servedPage((request, pathname) => get(request, pathname, REPORT_PATH, backed));
  await page.goto(`${origin}/report/${TASK_ID}`);
  await page.getByRole("heading", { name: /^Measurement/ }).waitFor();

  const card = page.locator("article", { hasText: a1.title });
  const links = card.getByRole("link");
  expect(await links.count()).toBe(3);

  // By keyboard: the new links open before the toggle, so focus moves to the first of them.
  const more = card.getByRole("button", { name: "Show 7 more" });
  expect(await more.getAttribute("aria-expanded")).toBe("false");
  await more.focus();
  await page.keyboard.press("Enter");
  expect(await links.count()).toBe(10);
  expect(await links.first().getAttribute("href")).toBe("/runs/run_kai-past-order-1?step=1");
  expect(await links.last().getAttribute("href")).toBe("/runs/run_kai-past-order-10?step=1");
  expect(await page.evaluate(() => document.activeElement?.getAttribute("href"))).toBe(
    "/runs/run_kai-past-order-4?step=1",
  );
  const fewer = card.getByRole("button", { name: "Show fewer" });
  expect(await fewer.getAttribute("aria-expanded")).toBe("true");

  await fewer.click();
  expect(await links.count()).toBe(3);
  await more.waitFor();
});

test("Analyse again shows it running, posts the report's backend, then shows the new report; Try again posts the same body", async () => {
  const analysed = Report.parse({ ...LLM_REPORT, analysedAt: "2026-10-06T09:05:00.000Z" });
  const posts: Posted[] = [];
  const answers = [held<Answer>(), held<Answer>()];
  const page = await servedPage((request, pathname) => {
    if (request.method() === "POST" && pathname === REPORT_PATH) {
      const answer = answers[posts.length];
      posts.push(posted(request));
      return answer?.promise;
    }
    return get(request, pathname, REPORT_PATH, LLM_REPORT);
  });
  await page.goto(`${origin}/report/${TASK_ID}`);
  await page.getByText("Analysed 5 Oct 2026, 14:20 UTC by", { exact: false }).waitFor();

  await page.getByRole("button", { name: "Analyse again" }).click();
  // Held: the button says it runs and cannot be pressed again, and the status line shows.
  const running = page.getByRole("button", { name: "Analysing…" });
  await running.waitFor();
  expect(await running.isDisabled()).toBe(true);
  await page
    .getByRole("status")
    .getByText("Analysing the stored runs. This can take a few minutes.")
    .waitFor();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ body: '{"backend":"llm"}', contentType: "application/json" });

  // io refuses: the fault, with its status, and the stored report stays.
  answers[0]?.release({ status: 502, json: { error: "llm_timeout: the Analyst did not answer" } });
  await page.getByText("io answered 502: llm_timeout: the Analyst did not answer").waitFor();
  await page.getByRole("button", { name: "Analyse again" }).waitFor();
  await page.getByRole("heading", { name: /^Measurement/ }).waitFor();
  expect(await page.locator("table tbody tr").count()).toBe(3);

  await page.getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1]).toEqual(posts[0]);

  answers[1]?.release({ status: 201, json: analysed });
  await page.getByText("Analysed 6 Oct 2026, 09:05 UTC by", { exact: false }).waitFor();
  expect(await page.getByRole("button", { name: "Analyse again" }).isEnabled()).toBe(true);
  expect(await page.getByText("io answered 502", { exact: false }).count()).toBe(0);
});

test("a failure this page did not start shows the fault, and Try again posts the backend that analysis asked for", async () => {
  const EASY = "task_next-parcel";
  const posts: Posted[] = [];
  const answers = [held<Answer>(), held<Answer>()];
  const page = await servedPage((request, pathname) => {
    if (request.method() === "POST" && pathname === REPORT_PATH) {
      const answer = answers[posts.length];
      posts.push(posted(request));
      return answer?.promise;
    }
    return (
      get(request, pathname, REPORT_PATH, LLM_REPORT) ??
      get(request, pathname, `/api/reports/${EASY}`, reportFixture(EASY))
    );
  });
  await page.goto(`${origin}/report/${EASY}`);
  await page.getByRole("heading", { name: /^Measurement/ }).waitFor();
  await page
    .getByRole("navigation", { name: "Story" })
    .getByRole("link", { name: /Report/ })
    .click();
  await page.waitForURL(`${origin}/report/${TASK_ID}`);
  await page.getByRole("button", { name: "Analyse again" }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]?.body).toBe('{"backend":"llm"}');

  // Away and back while it is held: the page that started it is gone, and this mount reads it.
  await page.goBack();
  await page.waitForURL(`${origin}/report/${EASY}`);
  await page.goForward();
  await page.waitForURL(`${origin}/report/${TASK_ID}`);
  await page.getByRole("button", { name: "Analysing…" }).waitFor();

  answers[0]?.release({ status: 502, json: { error: "llm_timeout: the Analyst did not answer" } });
  await page.getByRole("alert").getByText("io answered 502", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1]).toEqual(posts[0]);
  answers[1]?.release({ status: 201, json: LLM_REPORT });
});

test("moving to another goal's report while one is analysed: that page is not running, and the result lands on its own goal", async () => {
  const EASY = "task_next-parcel";
  const EASY_PATH = `/api/reports/${EASY}`;
  const reanalysed = Report.parse({
    ...reportFixture(EASY),
    analysedAt: "2026-10-06T10:10:00.000Z",
  });
  const answer = held<Answer>();
  // As io does, a report a POST stores is what the next GET of its goal reads.
  let easyStored: Report = reportFixture(EASY);
  const page = await servedPage((request, pathname) => {
    if (request.method() === "POST" && pathname === EASY_PATH) return answer.promise;
    return (
      get(request, pathname, REPORT_PATH, reportFixture(TASK_ID)) ??
      get(request, pathname, EASY_PATH, easyStored)
    );
  });
  await page.goto(`${origin}/report/${EASY}`);
  await page.getByRole("heading", { name: /^Measurement/ }).waitFor();
  await page.getByRole("button", { name: "Analyse again" }).click();
  await page.getByRole("button", { name: "Analysing…" }).waitFor();

  // To the hard goal while the easy goal's POST is held: nothing runs there.
  await page
    .getByRole("navigation", { name: "Story" })
    .getByRole("link", { name: /Report/ })
    .click();
  await page.waitForURL(`${origin}/report/${TASK_ID}`);
  await page.getByText(`${TASK_ID} · jev · 9 runs`, { exact: false }).waitFor();
  expect(await page.getByRole("button", { name: "Analyse again" }).isEnabled()).toBe(true);
  expect(await page.getByRole("button", { name: "Analysing…" }).count()).toBe(0);

  // The easy goal's report arrives: the hard goal's page keeps its own, and the easy goal has it.
  easyStored = reanalysed;
  answer.release({ status: 201, json: reanalysed });
  // Waited for where it lands, so the check on the hard goal follows the answer, not a timer.
  await page.goBack();
  await page.waitForURL(`${origin}/report/${EASY}`);
  await page.getByText("Analysed 6 Oct 2026, 10:10 UTC", { exact: false }).waitFor();
  await page.goForward();
  await page.waitForURL(`${origin}/report/${TASK_ID}`);
  await page.getByText(`${TASK_ID} · jev · 9 runs`, { exact: false }).waitFor();
  await page.getByText("Analysed 5 Oct 2026, 14:20 UTC", { exact: false }).waitFor();
  expect(await page.getByText("Analysed 6 Oct 2026, 10:10 UTC", { exact: false }).count()).toBe(0);
});

test("the meta line names the report's backend, and no source badge is drawn", async () => {
  const page = await servedPage((request, pathname) =>
    get(request, pathname, REPORT_PATH, LLM_REPORT),
  );
  await page.goto(`${origin}/report/${TASK_ID}`);
  await page.getByText(`${TASK_ID} · llm · 9 runs`, { exact: false }).waitFor();
  expect(await page.locator("[data-source]").count()).toBe(0);
});

test("with no report, Analyse runs posts no backend", async () => {
  const posts: Posted[] = [];
  const page = await servedPage((request, pathname) => {
    if (pathname !== REPORT_PATH) return undefined;
    if (request.method() === "POST") {
      posts.push(posted(request));
      return { status: 201, json: reportFixture(TASK_ID) };
    }
    return { status: 404, json: { error: `no report on ${TASK_ID}` } };
  });
  await page.goto(`${origin}/report/${TASK_ID}`);
  await page.getByText("No report on this goal yet.").waitFor();

  await page.getByRole("button", { name: "Analyse runs" }).click();
  await page.getByRole("heading", { name: /^Measurement/ }).waitFor();
  expect(posts).toEqual([{ body: "{}", contentType: "application/json" }]);
});

test("while the Analyst runs, its line changes every 4 s and the time counts, while the status region says only the start and the end (#237)", async () => {
  const answer = held<Answer>();
  const page = await servedPage((request, pathname) => {
    if (pathname !== REPORT_PATH) return undefined;
    if (request.method() === "POST") return answer.promise;
    return { status: 404, json: { error: `no report on ${TASK_ID}` } };
  });
  await page.clock.install();
  await page.goto(`${origin}/report/${TASK_ID}`);
  await page.getByRole("button", { name: "Analyse runs" }).click();

  const posts = page.locator('[data-slot="working"]');
  await posts.waitFor();
  const line = page.locator('[aria-live="off"]');
  const status = page.locator('p[role="status"].sr-only');
  const start = "Analysing the stored runs. This can take a few minutes.";
  await expect.poll(() => line.textContent()).toBe(`${ANALYST_LINES[0]} · 0:00 so far`);
  expect(await status.textContent()).toBe(start);

  await page.clock.runFor(4000);
  await expect.poll(() => line.textContent()).toBe(`${ANALYST_LINES[1]} · 0:04 so far`);
  await page.clock.runFor(81_000);
  // 85 s: the 22nd slot, line 21 mod 8 = 5, and the time.
  await expect.poll(() => line.textContent()).toBe(`${ANALYST_LINES[5]} · 1:25 so far`);
  // The line changed, and the region a screen reader hears did not.
  expect(await status.textContent()).toBe(start);
  // The posts are hidden from it, and the changing line sits outside any announcement.
  expect(await posts.getAttribute("aria-hidden")).toBe("true");

  answer.release({ status: 201, json: reportFixture(TASK_ID) });
  await page.getByRole("heading", { name: /^Measurement/ }).waitFor();
  await expect.poll(() => status.textContent()).toBe("The report is ready.");
  expect(await posts.count()).toBe(0);
});

test("back on a goal whose analysis ended, while another goal's runs, the status region announces nothing (#237)", async () => {
  const EASY = "task_next-parcel";
  const EASY_PATH = `/api/reports/${EASY}`;
  const easyAnswer = held<Answer>();
  onTestFinished(() => easyAnswer.release({ status: 201, json: reportFixture(EASY) }));
  const page = await servedPage((request, pathname) => {
    if (request.method() === "POST" && pathname === REPORT_PATH) {
      return { status: 201, json: reportFixture(TASK_ID) };
    }
    if (request.method() === "POST" && pathname === EASY_PATH) return easyAnswer.promise;
    return (
      get(request, pathname, REPORT_PATH, reportFixture(TASK_ID)) ??
      get(request, pathname, EASY_PATH, reportFixture(EASY))
    );
  });
  // Every text the status region takes, in order, as a screen reader would be handed it.
  await page.addInitScript(() => {
    const said: string[] = [];
    Object.assign(window, { said });
    new MutationObserver(() => {
      const text = document.querySelector('p[role="status"].sr-only')?.textContent ?? "";
      if (text !== said.at(-1)) said.push(text);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  const said = () => page.evaluate(() => (window as unknown as { said: string[] }).said);

  await page.goto(`${origin}/report/${EASY}`);
  await page.getByRole("heading", { name: /^Measurement/ }).waitFor();
  await page
    .getByRole("navigation", { name: "Story" })
    .getByRole("link", { name: /Report/ })
    .click();
  await page.waitForURL(`${origin}/report/${TASK_ID}`);
  await page.getByText(`${TASK_ID} · jev · 9 runs`, { exact: false }).waitFor();

  // The hard goal's analysis ends while watched: its end is announced once.
  await page.getByRole("button", { name: "Analyse again" }).click();
  await page.getByRole("status").getByText("The report is ready.").waitFor();

  // The easy goal's analysis starts and is held.
  await page.goBack();
  await page.waitForURL(`${origin}/report/${EASY}`);
  await page.getByRole("button", { name: "Analyse again" }).click();
  await page.getByRole("button", { name: "Analysing…" }).waitFor();

  // Back on the hard goal: nothing ended there in sight, and the easy goal's run is not its own.
  const before = (await said()).length;
  await page.goForward();
  await page.waitForURL(`${origin}/report/${TASK_ID}`);
  await page.getByText(`${TASK_ID} · jev · 9 runs`, { exact: false }).waitFor();
  await page.getByRole("button", { name: "Analyse again" }).waitFor();
  expect((await said()).slice(before).filter((text) => text !== "")).toEqual([]);
  expect(await page.locator('p[role="status"].sr-only').textContent()).toBe("");
});

test("under reduced motion the Analyst's line stays the first, and the time still counts (#237)", async () => {
  const answer = held<Answer>();
  const page = await servedPage((request, pathname) => {
    if (pathname !== REPORT_PATH) return undefined;
    if (request.method() === "POST") return answer.promise;
    return { status: 404, json: { error: `no report on ${TASK_ID}` } };
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await page.goto(`${origin}/report/${TASK_ID}`);
  await page.getByRole("button", { name: "Analyse runs" }).click();
  const line = page.locator('[aria-live="off"]');
  await line.waitFor();
  await page.clock.runFor(12_000);
  await expect.poll(() => line.textContent()).toBe(`${ANALYST_LINES[0]} · 0:12 so far`);
  // The posts stand still: their animation is off under reduced motion.
  const bars = page.locator('[data-slot="working"] > span');
  expect(await bars.first().evaluate((bar) => getComputedStyle(bar).animationName)).toBe("none");
  answer.release({ status: 201, json: reportFixture(TASK_ID) });
  await page.getByRole("heading", { name: /^Measurement/ }).waitFor();
});

test("arriving with ?analyse=true starts the Analyst once, posts no backend, and drops the flag, so a reload starts nothing", async () => {
  const posts: Posted[] = [];
  const answer = held<Answer>();
  const page = await servedPage((request, pathname) => {
    if (pathname !== REPORT_PATH) return undefined;
    if (request.method() === "POST") {
      posts.push(posted(request));
      return answer.promise;
    }
    return { status: 404, json: { error: `no report on ${TASK_ID}` } };
  });
  await page.goto(`${origin}/report/${TASK_ID}?analyse=true`);

  await page.getByText("Analysing the stored runs.", { exact: false }).waitFor();
  await page.waitForURL(`${origin}/report/${TASK_ID}`);
  answer.release({ status: 201, json: reportFixture(TASK_ID) });
  await page.getByRole("heading", { name: /^Measurement/ }).waitFor();
  expect(posts).toEqual([{ body: "{}", contentType: "application/json" }]);

  // io in this test stores nothing, so the reload reads no report, and asks for none.
  await page.reload();
  await page.getByText("No report on this goal yet.").waitFor();
  expect(posts).toHaveLength(1);
});

test("arriving with ?analyse=true on a goal with a stored report shows it and posts nothing", async () => {
  const posts: Posted[] = [];
  const page = await servedPage((request, pathname) => {
    if (request.method() === "POST") posts.push(posted(request));
    return get(request, pathname, REPORT_PATH, reportFixture(TASK_ID));
  });
  await page.goto(`${origin}/report/${TASK_ID}?analyse=true`);

  await page.getByRole("heading", { name: /^Measurement/ }).waitFor();
  await page.waitForURL(`${origin}/report/${TASK_ID}`);
  expect(posts).toEqual([]);
});

test("arriving again within the app starts the Analyst once: on a report already read as none, and not again while it runs, which shows as running", async () => {
  const posts: Posted[] = [];
  const answer = held<Answer>();
  const page = await servedPage((request, pathname) => {
    if (pathname !== REPORT_PATH) return undefined;
    if (request.method() === "POST") {
      posts.push(posted(request));
      return answer.promise;
    }
    return { status: 404, json: { error: `no report on ${TASK_ID}` } };
  });
  // Read first, so the arrival finds "no report" at once and StrictMode's second effect sees it
  // too. An arrival on a page loaded cold reads the report only after both effects ran.
  await page.goto(`${origin}/report/${TASK_ID}`);
  await page.getByText("No report on this goal yet.").waitFor();
  // Away and back with the flag, twice, as a second click on "Analyse this race" would come. Each
  // move is within the app, which unmounts the screen and keeps the analysis.
  for (const _arrival of ["first", "while it runs"]) {
    await page.getByRole("link", { name: "Runs", exact: true }).click();
    await page.waitForURL(`${origin}/runs`);
    await page.evaluate((path) => {
      history.pushState({}, "", path);
      dispatchEvent(new PopStateEvent("popstate"));
    }, `/report/${TASK_ID}?analyse=true`);
    await page.waitForURL(`${origin}/report/${TASK_ID}`);
    await page.getByText("Analysing the stored runs.", { exact: false }).waitFor();
    // With no report stored, the Analyst at work stands in the empty state, in place of its button.
    await page.locator('[data-slot="working"]').waitFor();
    expect(await page.getByRole("button", { name: "Analyse runs" }).count()).toBe(0);
  }

  answer.release({ status: 201, json: reportFixture(TASK_ID) });
  await page.getByRole("heading", { name: /^Measurement/ }).waitFor();
  expect(posts).toEqual([{ body: "{}", contentType: "application/json" }]);
});

test("a ten-seed report fits 1280 × 720", async () => {
  const report = tenSeedReport();
  expect(report.personas.map((result) => result.seeds.length)).toEqual([10, 10, 10]);
  const page = await servedPage((request, pathname) => get(request, pathname, REPORT_PATH, report));
  await page.goto(`${origin}/report/${TASK_ID}`);
  await page.getByRole("heading", { name: /^Measurement/ }).waitFor();

  const headings = page.locator("section > h2");
  expect(await headings.count()).toBe(3);
  const bottoms = await headings.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().bottom),
  );
  for (const bottom of bottoms) expect(bottom).toBeLessThanOrEqual(720);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(1280);
});
