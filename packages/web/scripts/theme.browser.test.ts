/**
 * Daylight and Night in a real browser (`tasks/s3-13-redesign-foundation.md`, box 5): the web app
 * on its own Vite dev server, in Chromium, with the system preference emulated per context. The
 * boot script in `index.html` picks the theme before the app loads, the toggle flips it, and the
 * stored choice outlives a reload. `src/theme.test.ts` covers the script's branches without a
 * browser; this checks the page actually wears the theme it says.
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

/** The Cast in a fresh context, so nothing is stored, with the system set to `colorScheme`. */
async function openCast(colorScheme: "light" | "dark"): Promise<Page> {
  const context = await browser.newContext({ colorScheme });
  onTestFinished(() => context.close());
  const page = await context.newPage();
  await page.goto(`${app.origin}/cast`);
  await page.getByRole("heading", { level: 1, name: "01 · the cast", exact: true }).waitFor();
  return page;
}

/**
 * The theme on `<html>`, and what the browser paints: the page's ground, the first avatar tile's,
 * Ada's, and her tuft. The tile and the tuft are where `dark:` utilities paint, so they show the
 * Night variant matches `data-theme`, not only that the tokens switch.
 */
function shownOf(page: Page) {
  return page.evaluate(() => {
    const avatar = document.querySelector('[aria-labelledby="cast-prof_ada"] svg[role="img"]');
    const tuft = avatar?.querySelector('[data-part="tuft"] path');
    return {
      theme: document.documentElement.getAttribute("data-theme"),
      ground: getComputedStyle(document.body).backgroundColor,
      tile: getComputedStyle(avatar?.parentElement ?? document.body).backgroundColor,
      tuft: tuft ? getComputedStyle(tuft).stroke : "none",
    };
  });
}

// The tokens from `index.css`, as the browser reports them: `paper` in each theme; Ada's tile,
// `persona-graphite-soft` in Daylight and `avatar-tile` in Night; and her tuft, drawn in
// `--p-ink`, which is `persona-graphite-ink` in Daylight and `avatar-line` in Night, so it stays
// dark on the light tile (`docs/DESIGN.md`, "Icons, wordmark, avatars").
const DAYLIGHT = {
  theme: "light",
  ground: "rgb(245, 243, 239)",
  tile: "rgb(225, 229, 234)",
  tuft: "rgb(79, 83, 88)",
};
const NIGHT = {
  theme: "dark",
  ground: "rgb(20, 18, 16)",
  tile: "rgb(235, 232, 227)",
  tuft: "rgb(26, 21, 16)",
};

test("with the system in dark mode and nothing stored, the app opens in Night", async () => {
  const page = await openCast("dark");
  expect(await shownOf(page)).toEqual(NIGHT);
});

test("with the system in light mode and nothing stored, the app opens in Daylight", async () => {
  const page = await openCast("light");
  expect(await shownOf(page)).toEqual(DAYLIGHT);
});

test("flipping the toggle to Daylight on a dark system survives a reload", async () => {
  const page = await openCast("dark");
  await page.getByRole("button", { name: "Switch to Daylight" }).click();
  expect(await shownOf(page)).toEqual(DAYLIGHT);
  await page.reload();
  await page.getByRole("button", { name: "Switch to Night" }).waitFor();
  expect(await shownOf(page)).toEqual(DAYLIGHT);
});
