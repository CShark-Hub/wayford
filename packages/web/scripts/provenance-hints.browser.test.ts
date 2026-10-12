/**
 * The provenance tags' hints in a real browser (#243), for what a static render cannot show: a
 * tag opens its source's words on hover, on keyboard focus and on a tap, on the Cast's matrix and
 * spec sheet, on the Lens's gauges and on the Report's finding cards; its 32 px box costs its row
 * no height; and in the Cast's matrix it sits over the link stretched across the column, so a
 * click on it opens no Lens. The screens are served as the self-check serves them.
 *
 * In `scripts/` because it starts the app with `startWebApp`, which sits beside the self-check.
 */
import type { ProvenanceId } from "@wayford/core";
import { type Browser, type BrowserContextOptions, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, onTestFinished, test, vi } from "vitest";
import { provenanceHint } from "../src/components/provenance-words.js";
import { SELF_CHECK_SCREENS, startWebApp } from "./self-check.js";

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

/** The screens that draw provenance tags, by their self-check entry's name. */
type ScreenName = "cast" | "lens" | "report";

/**
 * The self-check's `name` screen in a fresh context at 1280 × 720, its io answered as the check
 * answers it, once it is ready.
 */
async function open(name: ScreenName, options: BrowserContextOptions = {}): Promise<Page> {
  const screen = SELF_CHECK_SCREENS.find((entry) => entry.name === name);
  if (screen === undefined) throw new Error(`no ${name} entry in the self-check`);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...options });
  onTestFinished(() => context.close());
  const page = await context.newPage();
  await page.route(/^https?:\/\/[^/]+\/api\//, (route) => {
    const path = new URL(route.request().url()).pathname.slice("/api".length);
    const answer = screen.responses[path];
    return answer === undefined
      ? route.fulfill({ status: 404, json: { error: "not in this test" } })
      : route.fulfill({ json: answer });
  });
  await page.goto(`${app.origin}${screen.path}`);
  await page.locator(screen.ready).first().waitFor();
  return page;
}

/** Vera's column on the Cast: her tile's link and the cells of her matrix. */
function veraColumn(page: Page) {
  return page.locator('section[aria-labelledby="cast-prof_vera"]');
}

/** The open hints' texts. */
function openHints(page: Page): Promise<string[]> {
  return page.getByRole("tooltip").allInnerTexts();
}

/** The name of the element that has focus, or its tag when it has none. */
function focused(page: Page): Promise<string | undefined> {
  return page.evaluate(
    () => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName,
  );
}

/** A spot in the page's left gutter, on nothing that takes the pointer. */
const AWAY = { x: 8, y: 700 };

/** Where each screen draws a tag the hover case opens, and the source it names. */
const PLACES: readonly [
  ScreenName,
  string,
  (page: Page) => ReturnType<Page["locator"]>,
  ProvenanceId,
][] = [
  [
    "cast",
    "Vera's contrast cell",
    (page) => veraColumn(page).getByRole("button", { name: "Explain wcag22", exact: true }),
    "wcag22",
  ],
  [
    "lens",
    "the contrast gauge",
    (page) => page.getByRole("button", { name: "Explain wcag22", exact: true }),
    "wcag22",
  ],
  [
    "report",
    "a finding card's basis",
    (page) => page.getByRole("button", { name: "Explain folk · no source", exact: true }).first(),
    "folk",
  ],
];

test.each(PLACES)(
  "on the %s screen, %s opens its source's words on hover, inside the viewport, and they stay while the pointer is on them",
  async (name, _where, tagOf, provenance) => {
    const page = await open(name);
    const tag = tagOf(page);
    await tag.scrollIntoViewIfNeeded();
    await page.mouse.move(AWAY.x, AWAY.y);
    await tag.hover();
    await expect.poll(() => openHints(page)).toEqual([provenanceHint(provenance)]);
    const bubble = await page.getByRole("tooltip").boundingBox();
    if (bubble === null) throw new Error("no bubble");
    expect(bubble.x).toBeGreaterThanOrEqual(0);
    expect(bubble.y).toBeGreaterThanOrEqual(0);
    expect(bubble.x + bubble.width).toBeLessThanOrEqual(1280);
    expect(bubble.y + bubble.height).toBeLessThanOrEqual(720);
    await page.mouse.move(bubble.x + bubble.width / 2, bubble.y + bubble.height / 2, { steps: 8 });
    await page.waitForTimeout(300);
    expect(await openHints(page)).toHaveLength(1);
    await page.mouse.move(AWAY.x, AWAY.y, { steps: 8 });
    await expect.poll(() => openHints(page)).toEqual([]);
  },
);

test.each<ScreenName>(["cast", "lens", "report"])(
  "on the %s screen, every provenance tag is a target of 32 px or more that costs its row no height",
  async (name) => {
    const page = await open(name);
    const tags = await page
      .locator('button[aria-label^="Explain "]:has(> span.mono-label)')
      .evaluateAll((buttons) =>
        buttons.map((button) => {
          // The row the tag sits in: its nearest ancestor that draws a box.
          let row = button.parentElement;
          while (row !== null && getComputedStyle(row).display === "contents") {
            row = row.parentElement;
          }
          const face = button.firstElementChild?.getBoundingClientRect();
          const box = button.getBoundingClientRect();
          return {
            name: button.getAttribute("aria-label"),
            width: box.width,
            height: box.height,
            face: face?.height,
            row: row?.getBoundingClientRect().height,
          };
        }),
      );
    expect(tags.length, name).toBeGreaterThan(0);
    for (const tag of tags) {
      expect(Math.min(tag.width, tag.height), tag.name ?? "").toBeGreaterThanOrEqual(32);
      expect(tag.row, tag.name ?? "").toBe(tag.face);
    }
  },
);

test("Tab reaches a tag of Vera's matrix after her column's link, opens its words, and Esc closes them with focus kept", async () => {
  const page = await open("cast");
  await veraColumn(page).getByRole("link").focus();
  await page.keyboard.press("Tab");
  expect(await focused(page)).toBe("Explain wcag22");
  await expect.poll(() => openHints(page)).toEqual([provenanceHint("wcag22")]);
  await page.keyboard.press("Escape");
  await expect.poll(() => openHints(page)).toEqual([]);
  expect(await focused(page)).toBe("Explain wcag22");
  await page.keyboard.press("Tab");
  expect(await focused(page)).toBe("Explain legge2011");
  await expect.poll(() => openHints(page)).toEqual([provenanceHint("legge2011")]);
});

test("a click on a tag in the matrix opens its words and opens no Lens", async () => {
  const page = await open("cast");
  await veraColumn(page).getByRole("button", { name: "Explain folk", exact: true }).click();
  await expect.poll(() => openHints(page)).toEqual([provenanceHint("folk")]);
  await page.waitForTimeout(300);
  expect(new URL(page.url()).pathname).toBe("/cast");
});

test("a tap opens a tag's words and a second tap closes them", async () => {
  const page = await open("cast", { hasTouch: true });
  const tag = veraColumn(page).getByRole("button", { name: "Explain legge2011", exact: true });
  await tag.tap();
  await expect.poll(() => openHints(page)).toEqual([provenanceHint("legge2011")]);
  await page.waitForTimeout(800);
  expect(await openHints(page)).toHaveLength(1);
  await tag.tap();
  await expect.poll(() => openHints(page)).toEqual([]);
  expect(new URL(page.url()).pathname).toBe("/cast");
});

test("in Vera's spec sheet, a tag opens its words, and both stay while the pointer moves onto them", async () => {
  const page = await open("cast");
  await page.locator("#cast-prof_vera").hover();
  const card = page.locator("article[aria-labelledby='cast-card-prof_vera']");
  await card.waitFor();
  await card.getByRole("button", { name: "Explain folk · no source", exact: true }).hover();
  await expect.poll(() => openHints(page)).toEqual([provenanceHint("folk")]);
  const bubble = await page.getByRole("tooltip").boundingBox();
  if (bubble === null) throw new Error("no bubble");
  await page.mouse.move(bubble.x + bubble.width / 2, bubble.y + bubble.height / 2, { steps: 8 });
  await page.waitForTimeout(800);
  expect(await openHints(page)).toHaveLength(1);
  expect(await card.isVisible()).toBe(true);
});
