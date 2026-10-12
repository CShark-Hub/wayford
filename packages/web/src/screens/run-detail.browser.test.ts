/**
 * Run detail in a real browser: the web app on its own Vite dev server, in Chromium at 1280 × 720
 * (960 for a failed copy), with io's `GET /api/runs/<id>` answered by `page.route` and a 404 for
 * anything else.
 *
 * - The copy button (#200): the header reads a minted run id as its short label, and "Copy the run
 *   id" leaves the whole id on the clipboard and says so.
 * - The narration list, "What Vera said" (#197): a fresh load of `#run-narration` scrolls its
 *   heading into view and focuses it, and so does a seed's link in the Report's "What they said".
 *   Enter on a line opens that step at the page's top with focus on the replayed step's heading, so
 *   the next Tab starts there, and so does → with a line focused, which moves from the step
 *   replayed. Back to `#run-narration` gives the list's heading focus again. The line of the step
 *   already replayed moves nothing, and focus outside the list stays put when the step changes.
 *
 * The static tests in `run-detail.test.tsx` cannot show this: a static render runs no click, no
 * key, no scroll and no effect.
 */
import { fileURLToPath } from "node:url";
import { Report, RunResult } from "@wayford/core";
import { reportFixture, runResultFixture } from "@wayford/core/fixtures";
import { type Browser, chromium, type Page, type Route } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, expect, onTestFinished, test, vi } from "vitest";

// Starting Vite, its first transform of the app and launching Chromium take longer than vitest's
// 5 s hook default.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const WEB_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** A run id as `newId("run")` mints it, and the label a person reads for it. */
const MINTED = "run_01m4bbcm8s1a0mcqac4v3fr6hk";
const MINTED_LABEL = "run …3fr6hk";

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  server = await createServer({
    root: WEB_ROOT,
    configFile: `${WEB_ROOT}vite.config.ts`,
    logLevel: "silent",
    // Port 0, so a developer's `pnpm dev` on 5173 does not fail the test.
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

/**
 * A `width` × 720 page allowed to read and write the clipboard on the dev server's origin, whose
 * `/api` calls get the fixture run under the minted id for `GET /api/runs/<minted id>`, each of
 * `answers` for a `GET` of its path, and a 404 for anything else.
 */
async function servedPage(width = 1280, answers: Readonly<Record<string, unknown>> = {}) {
  const context = await browser.newContext({ viewport: { width, height: 720 } });
  onTestFinished(() => context.close());
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  const page = await context.newPage();
  const answered: Readonly<Record<string, unknown>> = {
    ...answers,
    [`/api/runs/${MINTED}`]: RunResult.parse({ ...runResultFixture, id: MINTED }),
  };
  // By path prefix, as the dev server's proxy matches it: a glob like `**/api/**` would catch the
  // app's own modules under `src/api/` too.
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route: Route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() === "GET" && path in answered) {
        return route.fulfill({ json: answered[path] });
      }
      return route.fulfill({ status: 404, json: { error: "not in this test" } });
    },
  );
  return page;
}

test("Copy the run id leaves the whole id on the clipboard and says Copied; the header shows the label", async () => {
  const page = await servedPage();
  await page.goto(`${origin}/runs/${MINTED}`);
  await page.getByRole("heading", { level: 1 }).getByText(`| ${MINTED_LABEL}`).waitFor();

  const header = page.locator("main header");
  const status = header.getByRole("status");
  const copy = page.getByRole("button", { name: "Copy the run id", exact: true });
  const before = await copy.boundingBox();
  await copy.click();
  await status.getByText("Copied", { exact: true }).waitFor();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(MINTED);
  // The status names no id, so the whole id is still nowhere in the header's text.
  expect(await header.innerText()).not.toContain(MINTED);
  // "Copied" appearing leaves the button where the pointer is.
  expect(await copy.boundingBox()).toEqual(before);

  // A second press changes the live region again, so a screen reader announces it again.
  await status.evaluate((region) => {
    const changes = { count: 0 };
    new MutationObserver(() => changes.count++).observe(region, { childList: true, subtree: true });
    Object.assign(window, { statusChanges: changes });
  });
  await copy.click();
  await page.waitForFunction(
    () => (window as unknown as { statusChanges: { count: number } }).statusChanges.count > 0,
  );
  expect(await status.innerText()).toBe("Copied");
});

test.each([
  ["a refused write", "navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));"],
  // A page served over plain http on another host has no clipboard at all.
  ["no clipboard", "Object.defineProperty(navigator, 'clipboard', { value: undefined });"],
])("%s says Could not copy, and nothing throws or moves at 960", async (_, script) => {
  // 960 wide, where the header row is tight: a status without its room squeezes the heading
  // onto another line, and the button with it.
  const page = await servedPage(960);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(script);
  await page.goto(`${origin}/runs/${MINTED}`);
  await page.getByRole("heading", { level: 1 }).getByText(`| ${MINTED_LABEL}`).waitFor();
  const copy = page.getByRole("button", { name: "Copy the run id", exact: true });
  const before = await copy.boundingBox();
  await copy.click();
  await page.locator("main header").getByRole("status").getByText("Could not copy").waitFor();
  expect(errors).toEqual([]);
  // The longest message fits the status's room: a retry lands on the button, not the text.
  expect(await copy.boundingBox()).toEqual(before);
});

/**
 * The narration list's line named `name`, found in its region: each line's link shares its name
 * with the strip's link to the same step, so a page-wide locator would find two.
 */
function line(page: Page, name: string) {
  return page
    .getByRole("region", { name: "What Vera said", exact: true })
    .getByRole("link", { name, exact: true });
}

/** Waits until the element with id `id` holds focus, however long the run and the fonts take. */
async function focusLands(page: Page, id: string): Promise<void> {
  await page.waitForFunction((target) => document.activeElement?.id === target, id);
}

/** The list's heading lies inside the 720 px window. */
async function expectNarrationInView(page: Page): Promise<void> {
  const { top } = await page
    .locator("#run-narration")
    .evaluate((heading) => heading.getBoundingClientRect());
  expect(top).toBeGreaterThanOrEqual(0);
  expect(top).toBeLessThan(720);
}

/** Two frames: whatever a commit just drawn set off in its effects has run. */
async function settled(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
}

/** The id of the element holding focus, read in the page. */
function focusedId(page: Page): Promise<string | undefined> {
  return page.evaluate(() => document.activeElement?.id);
}

/** How far the window is scrolled down, in px. */
function scrollY(page: Page): Promise<number> {
  return page.evaluate(() => window.scrollY);
}

/**
 * Waits until the replay shows step `index`, by its visually hidden heading, and the URL names it.
 */
async function replayed(page: Page, index: number): Promise<void> {
  await page.getByRole("heading", { name: `Step ${index}`, exact: true }).waitFor();
  expect(new URL(page.url()).searchParams.get("step")).toBe(String(index));
}

test("a fresh load of #run-narration scrolls What Vera said into view and focuses its heading", async () => {
  // The router scrolls to a hash on its first render, the loading skeleton, before the list is
  // drawn: the list scrolls to itself once it is.
  const page = await servedPage();
  await page.goto(`${origin}/runs/${MINTED}#run-narration`);
  // Once the run is read and drawn, and the fonts have loaded.
  await focusLands(page, "run-narration");
  // Below the replay, so reaching it takes a scroll.
  expect(await scrollY(page)).toBeGreaterThan(0);
  await expectNarrationInView(page);
});

test("Enter on a line opens its step at the page's top, focus on the replayed step's heading", async () => {
  const page = await servedPage();
  await page.goto(`${origin}/runs/${MINTED}`);
  // Focusing the line scrolls the window down to it, far below the replay.
  await line(page, "step 2: /deliveries · doubleClick e2").focus();
  expect(await scrollY(page)).toBeGreaterThan(0);
  await page.keyboard.press("Enter");
  await replayed(page, 2);
  await focusLands(page, "run-step");
  // The replay is at the top, and focus there scrolled nothing back down.
  expect(await scrollY(page)).toBe(0);
});

test("→ with a line focused opens the next step, focus on the replayed step's heading", async () => {
  const page = await servedPage();
  await page.goto(`${origin}/runs/${MINTED}?step=1`);
  await line(page, "step 1: /deliveries · scroll down").focus();
  await page.keyboard.press("ArrowRight");
  await replayed(page, 2);
  await focusLands(page, "run-step");
});

test("a seed's link in the Report's What they said opens the run at its list, its heading focused", async () => {
  // The way a person comes: within the app, from an LLM report. The link's hash spares the page the
  // router's reset to the top, and the run is not read yet, so the list scrolls to itself once drawn.
  const VERA_1 = "run_vera-past-order-1";
  const page = await servedPage(1280, {
    "/api/reports/task_past-order": Report.parse({
      ...reportFixture("task_past-order"),
      backend: "llm",
    }),
    [`/api/runs/${VERA_1}`]: RunResult.parse({ ...runResultFixture, id: VERA_1 }),
  });
  await page.goto(`${origin}/report/task_past-order`);
  await page.getByRole("link", { name: "seed 1 · Gave up, what Vera said", exact: true }).click();
  await focusLands(page, "run-narration");
  expect(new URL(page.url()).pathname).toBe(`/runs/${VERA_1}`);
  await expectNarrationInView(page);
});

test("following the line of the step already replayed moves nothing", async () => {
  // The step does not change, so focus would stay on the line while the router scrolled to the top.
  const page = await servedPage();
  await page.goto(`${origin}/runs/${MINTED}?step=2`);
  const current = line(page, "step 2: /deliveries · doubleClick e2");
  await current.focus();
  const before = await scrollY(page);
  expect(before).toBeGreaterThan(0);
  await current.click();
  // Nothing on the page says the router is done, so wait long enough for it to have scrolled to
  // the top, as it does for any other line: without `resetScroll={false}` this fails.
  await page.waitForTimeout(500);
  expect(new URL(page.url()).searchParams.get("step")).toBe("2");
  expect(await scrollY(page)).toBe(before);
  expect(await page.evaluate(() => document.activeElement?.textContent)).toBe(
    "step 2: /deliveries · doubleClick e2",
  );
});

test("→ with the strip's step focused leaves focus there: only a line's focus moves", async () => {
  const page = await servedPage();
  await page.goto(`${origin}/runs/${MINTED}?step=1`);
  const strip = page.getByRole("group", { name: "Steps", exact: true });
  await strip.getByRole("link", { name: "step 1: /deliveries · scroll down", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await replayed(page, 2);
  // A second step drawn: React runs a commit's effects before it draws the next, so the list's
  // focus move for step 2 has had its chance.
  await page.keyboard.press("ArrowRight");
  await replayed(page, 3);
  expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe(
    "step 1: /deliveries · scroll down",
  );
});

test("Back to #run-narration after following a line gives the list's heading focus again", async () => {
  // The hash reaches the list a render before the step does: the focus move must not take it.
  const page = await servedPage();
  await page.goto(`${origin}/runs/${MINTED}#run-narration`);
  await focusLands(page, "run-narration");
  // The first Back of a page often came out right even with the race, so go round three times.
  for (const name of [
    "step 2: /deliveries · doubleClick e2",
    "step 1: /deliveries · scroll down",
    "step 3: /settings · wasted",
  ]) {
    await line(page, name).focus();
    await page.keyboard.press("Enter");
    await focusLands(page, "run-step");
    await page.goBack();
    await focusLands(page, "run-narration");
    // Once the step is drawn too, after the hash, as in the race, and its effects have run.
    await page.getByRole("heading", { name: "Step 0", exact: true }).waitFor();
    await settled(page);
    expect(await focusedId(page)).toBe("run-narration");
    await expectNarrationInView(page);
  }
});
