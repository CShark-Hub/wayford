/**
 * Run detail's copy button in a real browser (#200): the web app on its own Vite dev server, in
 * Chromium at 1280 × 720 (960 for a failed copy), with io's `GET /api/runs/<id>` answered by `page.route` and a 404 for
 * anything else. The header reads a minted run id as its short label, and "Copy the run id" leaves
 * the whole id on the clipboard and says so.
 *
 * The static tests in `run-detail.test.tsx` cannot show this: a static render runs no click.
 */
import { fileURLToPath } from "node:url";
import { RunResult } from "@wayford/core";
import { runResultFixture } from "@wayford/core/fixtures";
import { type Browser, chromium, type Route } from "playwright";
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
 * `/api` calls get the fixture run under the minted id for `GET /api/runs/<minted id>`, and a 404
 * for anything else.
 */
async function servedPage(width = 1280) {
  const context = await browser.newContext({ viewport: { width, height: 720 } });
  onTestFinished(() => context.close());
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  const page = await context.newPage();
  const run = RunResult.parse({ ...runResultFixture, id: MINTED });
  // By path prefix, as the dev server's proxy matches it: a glob like `**/api/**` would catch the
  // app's own modules under `src/api/` too.
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route: Route) => {
      const request = route.request();
      if (request.method() === "GET" && new URL(request.url()).pathname === `/api/runs/${MINTED}`) {
        return route.fulfill({ json: run });
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
