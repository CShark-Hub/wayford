/**
 * The Cast in a real browser, for what a static render cannot show (`tasks/s3-14-cast-and-runs.md`,
 * "Matrix" and the Outcome's "Keyboard"): a persona's column is one link to the Lens, keyboard focus
 * on it opens its card as hovering the tile does, and a mouse press that only focuses the link, as a
 * middle click opening the Lens in a new tab does, leaves no card open over the matrix.
 *
 * In `scripts/` because it starts the app with `startWebApp`, which sits beside the self-check.
 */
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, onTestFinished, test, vi } from "vitest";
import { startWebApp } from "./self-check.js";

// Starting Vite, its first transform of the app and launching Chromium take longer than vitest's
// 5 s hook default.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

let browser: Browser;
let app: Awaited<ReturnType<typeof startWebApp>>;

beforeAll(async () => {
  [browser, app] = await Promise.all([chromium.launch(), startWebApp()]);
});

afterAll(async () => {
  await browser?.close();
  await app?.close();
});

/** The Cast at the projector's size, in a fresh context. */
async function openCast(): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  onTestFinished(() => context.close());
  const page = await context.newPage();
  await page.goto(`${app.origin}/cast`);
  await page.getByRole("heading", { level: 1, name: "01 · the cast", exact: true }).waitFor();
  return page;
}

/**
 * The middle of a persona's Patience cell: plain text in the matrix, which only the link stretched
 * over the column covers. Clicked by position, since Playwright refuses a click the link intercepts.
 */
async function patienceCell(page: Page, profileId: string): Promise<{ x: number; y: number }> {
  const box = await page
    .locator(`section[aria-labelledby="cast-${profileId}"] dl > div`)
    .filter({ has: page.locator("dt", { hasText: "Patience, B3" }) })
    .boundingBox();
  if (box === null) throw new Error(`no Patience cell for ${profileId}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The link that has focus, by its `href`. */
function focusedHref(page: Page): Promise<string | null | undefined> {
  return page.evaluate(() => document.activeElement?.getAttribute("href"));
}

/** The CastCards open on the page, by their heading's id. */
function openCards(page: Page): Promise<(string | null)[]> {
  return page
    .locator("article[aria-labelledby^='cast-card-']")
    .evaluateAll((cards) => cards.map((card) => card.getAttribute("aria-labelledby")));
}

test("a click anywhere in a persona's column opens the Lens on that persona", async () => {
  const page = await openCast();
  const { x, y } = await patienceCell(page, "prof_vera");
  await page.mouse.click(x, y);
  await page.waitForURL(/\/lens\?/, { timeout: 10_000 });
  expect(new URL(page.url()).search).toBe("?persona=prof_vera");
});

test("keyboard focus on a column opens its card, and Tab moves it to the next column", async () => {
  const page = await openCast();
  for (let presses = 0; (await focusedHref(page)) !== "/lens?persona=prof_ada"; presses++) {
    if (presses === 20) throw new Error("Tab never reached Ada's column");
    await page.keyboard.press("Tab");
  }
  await page.locator("#cast-card-prof_ada").waitFor();
  await page.keyboard.press("Tab");
  await page.locator("#cast-card-prof_kai").waitFor();
  expect(await openCards(page)).toEqual(["cast-card-prof_kai"]);
});

test("a middle click on a column focuses its link and leaves no card open", async () => {
  const page = await openCast();
  const { x, y } = await patienceCell(page, "prof_kai");
  await page.mouse.click(x, y, { button: "middle" });
  // The press focused Kai's link, as a mouse press on a link does in Chromium.
  await expect.poll(() => focusedHref(page)).toBe("/lens?persona=prof_kai");
  expect(await openCards(page)).toEqual([]);
});
