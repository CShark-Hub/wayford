/**
 * Slider moves make no request (`tasks/s3-05-live-preview.md`, box 2): the web app on its own Vite
 * dev server, in Chromium, with io's `/api/measure` and `/api/axe` answered by `page.route`. An
 * in-page spy wraps `fetch`, and a listener records every request the page makes. After the live
 * page and its axe-core card are drawn, keyboard moves on three sliders write the URL and redraw
 * the page, and neither the spy nor the listener sees anything: a slider move asks io for neither
 * the measurement nor the scan (s4-06). Then the page control opens `/account`, which fetches both:
 * the spy is seen to catch the screen's fetches, so its silence before means something.
 *
 * The static tests in `preview.test.tsx` cannot show this: a static render runs no effect, so
 * nothing there would fetch either way.
 */
import { fileURLToPath } from "node:url";
import type { AxeScan } from "@wayford/core";
import { axeScanFixture, axeScanFixtures, measurementFixture } from "@wayford/core/fixtures";
import { type Browser, chromium, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

// Starting Vite, its first transform of the app and launching Chromium take longer than vitest's
// 5 s hook default.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const WEB_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** What the spy keeps on `window`: the URL of every `fetch` the page made. */
type Spied = { __fetches: string[] };

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

/**
 * io's axe-core scan of `page`: the stored one where there is one, else one that found nothing,
 * at the same query.
 */
function axeScanOf(page: string): AxeScan {
  if (axeScanFixtures.some((scan) => scan.url.startsWith(`${page}?`))) return axeScanFixture(page);
  const { url, ...deliveries } = axeScanFixture("/deliveries");
  return { ...deliveries, url: `${page}${url.slice(url.indexOf("?"))}`, violations: [] };
}

/**
 * A page whose `fetch` is spied on from its first script, and whose `/api` calls are answered
 * here: `/api/measure` with the stored measurement, `/api/axe` with the page's scan, anything else
 * with a 404.
 */
async function spiedPage(): Promise<Page> {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    const fetches: string[] = [];
    const real = window.fetch.bind(window);
    Object.assign(window, { __fetches: fetches });
    window.fetch = (input, init) => {
      fetches.push(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      return real(input, init);
    };
  });
  // By path prefix, as the dev server's proxy matches it: a glob like `**/api/**` would catch the
  // app's own modules under `src/api/` too.
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/measure") return route.fulfill({ json: measurementFixture });
      if (url.pathname === "/api/axe") {
        return route.fulfill({ json: axeScanOf(url.searchParams.get("page") ?? "") });
      }
      return route.fulfill({ status: 404, json: { error: "not in this test" } });
    },
  );
  return page;
}

/**
 * The screen's fetches of `pages`, sorted: each page's measurement on desktop and its axe-core
 * scan. Both queries start in one render. The scan goes first today, since the card's effect runs
 * before the screen's, but that order says where the card sits in the tree, not what the screen
 * asks, so fetches are compared sorted.
 */
function fetchesFor(...pages: string[]): string[] {
  return pages
    .flatMap((path) => {
      const page = encodeURIComponent(path);
      return [`/api/measure?device=desktop&page=${page}`, `/api/axe?page=${page}`];
    })
    .sort();
}

/** Every `fetch` the spy on `page` has seen, sorted, as `fetchesFor` sorts. */
async function fetchesOf(page: Page): Promise<string[]> {
  return (await page.evaluate(() => [...(window as unknown as Spied).__fetches])).sort();
}

/** Press `key` `times` times on the range input `#id`. */
async function press(page: Page, id: string, key: string, times: number): Promise<void> {
  await page.locator(`#${id}`).focus();
  for (let i = 0; i < times; i++) await page.keyboard.press(key);
}

test("slider moves redraw the page and make no request; a page link does", async () => {
  const page = await spiedPage();
  const requests: string[] = [];
  page.on("request", (request) => {
    requests.push(request.url());
  });

  await page.goto(`${origin}/lens?persona=prof_vera`);
  // The live page is drawn, with no banner, and the card shows its scan.
  await page.locator("[data-state]").first().waitFor();
  await page.getByText("Live: http://localhost:5174/deliveries on desktop").waitFor();
  const card = page.getByRole("region", { name: "axe-core" });
  await card.getByText("axe-core, WCAG 2.2 A and AA: 1 violation", { exact: true }).waitFor();
  expect(await card.getByRole("listitem").allTextContents()).toEqual(["color-contrast, 1 element"]);
  await page.waitForLoadState("networkidle");
  expect(await fetchesOf(page)).toEqual(fetchesFor("/deliveries"));
  const caption = page.locator("figcaption");
  expect(await caption.textContent()).toBe("The page as perceive returns it for Vera, seed 1.");

  requests.length = 0;
  await press(page, "preview-contrast", "ArrowRight", 5);
  await press(page, "preview-contrastSoftness", "ArrowRight", 2);
  await press(page, "preview-seed", "ArrowRight", 3);
  // Blurring the last slider writes what is still queued.
  await page.locator("h1").click();
  await page.waitForFunction(() => new URLSearchParams(location.search).get("seed") === "4");
  // Redrawn for the moved values, on the measurement the screen already had.
  await expect
    .poll(() => caption.textContent())
    .toBe("The page as perceive returns it for Vera, thresholds edited, seed 4.");
  const query = new URL(page.url()).searchParams;
  expect(query.has("contrast")).toBe(true);
  expect(query.has("contrastSoftness")).toBe(true);

  // Neither the measurement nor the scan was asked for again.
  expect(await fetchesOf(page)).toEqual(fetchesFor("/deliveries"));
  expect(requests).toEqual([]);

  // A page link asks io for the new page's measurement and scan, through the same spy.
  await page
    .getByRole("navigation", { name: "Page" })
    .getByRole("link", { name: "/account" })
    .click();
  await expect.poll(() => fetchesOf(page)).toEqual(fetchesFor("/deliveries", "/account"));
  expect(requests).toEqual(
    expect.arrayContaining([
      `${origin}/api/measure?device=desktop&page=%2Faccount`,
      `${origin}/api/axe?page=%2Faccount`,
    ]),
  );
  await card.getByText("axe-core, WCAG 2.2 A and AA: 0 violations", { exact: true }).waitFor();
  await page.close();
});
