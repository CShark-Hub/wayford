/**
 * `collect` on the running target app, against the browser boxes of
 * `tasks/s1-02-metrics-collector.md` (`docs/specs/2026-09-29-s1-02-metrics-collector.md`,
 * "Acceptance mapping"). The app is built and served on a free port. Every page opens in a fresh
 * 1280 × 720 context, with all three parameters on its URL and the bundled font checked
 * (`packages/target-app/README.md`, "Parameters" and "Font").
 */
import {
  type Bbox,
  type MeasuredElement,
  type PageMeasurement,
  type Profile,
  renderObservationForModel,
  toActorObservation,
} from "@wayford/core";
import { measurementFixture, profileFixture } from "@wayford/core/fixtures";
import { type Browser, chromium, type Locator, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import { collect } from "./collect.js";
import { perceive } from "./perceive.js";
import { serveTargetApp, TARGET_APP_PATHS, type TargetApp } from "./serve-target-app.js";

const CONTRAST_2 = "?contrast=2&fontPx=16&targetPx=36";
const CONTRAST_7 = "?contrast=7&fontPx=16&targetPx=36";
const ARCHIVE = "main//link:Order archive";
const RUN_SEED = 7;

let app: TargetApp;
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch().catch((error: unknown) => {
    throw new Error(
      "Chromium did not launch. If it is not installed, run " +
        "`pnpm --filter @wayford/filter exec playwright install --only-shell chromium`.",
      { cause: error },
    );
  });
  app = await serveTargetApp();
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await app?.close();
}, 60_000);

async function withPage<T>(url: string, use: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
    await page.goto(app.origin + url);
    // A font that failed to load falls back to a system one, and the page would be measured in it.
    const inter = await page.evaluate(() => document.fonts.check('16px "Inter"'));
    expect(inter, `the bundled Inter font on ${url}`).toBe(true);
    return await use(page);
  } finally {
    await context.close();
  }
}

const measure = (url: string) => withPage(url, (page) => collect(page));

const actorText = (measurement: PageMeasurement, profile: Profile) =>
  renderObservationForModel(toActorObservation(perceive(measurement, profile, RUN_SEED)));

const SIDES = ["x", "y", "width", "height"] as const;

type Role = Parameters<Page["getByRole"]>[0];

/** Roles Playwright gives no name from content: matched by their rendered text (spec, row 1). */
const MATCHED_BY_TEXT = new Set(["paragraph", "listitem"]);

/** The role `collect` gives a box of text, which is no ARIA role (#219). */
const BOX_OF_TEXT = "text";

/**
 * Nothing when Playwright finds `element` by role, name and landmark chain at its measured box,
 * read at the scroll it was measured at; otherwise what it found instead. The chain is read back
 * from the key. An unnamed landmark must be unnamed for Playwright too: with no name option at
 * all, a collector that dropped a landmark's name would still pass.
 */
async function missedByRole(page: Page, element: MeasuredElement): Promise<string | undefined> {
  const chain = element.key.slice(0, -`//${element.role}:${element.name}`.length);
  const scope = (chain === "" ? [] : chain.split("/")).reduce<Page | Locator>((outer, part) => {
    const [role = "", ...name] = part.split(":");
    return outer.getByRole(role as Role, { name: name.join(":"), exact: true });
  }, page);
  // A box of text is matched by its rendered text too, so a landmark box found as its own scope
  // is held to its name, not only to its box.
  const byText = MATCHED_BY_TEXT.has(element.role) || element.role === BOX_OF_TEXT;
  // A box of text has no ARIA role to find it by (#219), so its own text finds it: inside its
  // landmark chain, or as the chain's last landmark when the box is that landmark itself.
  const matches =
    element.role === BOX_OF_TEXT
      ? [
          ...(scope === page ? [] : [scope as Locator]),
          ...(await scope.getByText(element.name, { exact: true }).all()),
        ]
      : await scope
          .getByRole(element.role as Role, byText ? undefined : { name: element.name, exact: true })
          .all();
  const found: { text?: string; box: Bbox | null }[] = await Promise.all(
    matches.map(async (match) => {
      const box = await match.boundingBox();
      return byText
        ? { text: (await match.innerText()).replace(/\s+/g, " ").trim(), box }
        : { box };
    }),
  );
  const hit = found.some(
    ({ text, box }) =>
      (text === undefined || text === element.name) &&
      box !== null &&
      SIDES.every((side) => Math.abs(box[side] - element.bbox[side]) <= 0.01),
  );
  return hit
    ? undefined
    : `${element.key}: measured at ${JSON.stringify(element.bbox)}, found ${JSON.stringify(found)}`;
}

// Boxes are left out, since glyph positioning differs between operating systems (the task's box
// 2). Target sizes are compared: they came out the same on every machine measured. `parts` too,
// so a control the target app draws in parts (#124), which it has none of, would show here, and
// `covered`, which it has none of either (#229).
const comparable = ({ elements }: PageMeasurement) =>
  elements.map(({ key, kind, role, name, metrics, parts, hasPopup, controls, covered }) => ({
    key,
    kind,
    role,
    name,
    contrast: metrics.contrast,
    fontPx: metrics.fontPx,
    targetPx: metrics.targetPx,
    parts,
    hasPopup,
    controls,
    covered,
  }));

test("collect on /deliveries matches measurementFixture", async () => {
  const measured = await measure(`/deliveries${CONTRAST_2}`);
  expect(comparable(measured)).toStrictEqual(comparable(measurementFixture));
});

test("Order archive measures within 0.01 of 2.006 and of 7.005", async () => {
  for (const [query, expected] of [
    [CONTRAST_2, 2.006],
    [CONTRAST_7, 7.005],
  ] as const) {
    const archive = (await measure(`/deliveries${query}`)).elements.find((e) => e.key === ARCHIVE);
    expect(archive, `${ARCHIVE} at ${query}`).toBeDefined();
    const contrast = archive?.metrics.contrast ?? Number.NaN;
    expect(Math.abs(contrast - expected), `${contrast} at ${query}`).toBeLessThanOrEqual(0.01);
  }
});

test.each(TARGET_APP_PATHS)("getByRole finds every measured element on %s", async (path) => {
  await withPage(`${path}${CONTRAST_2}`, async (page) => {
    const { elements } = await collect(page);
    expect(elements.length, "elements measured").toBeGreaterThan(0);
    const misses = (
      await Promise.all(elements.map((element) => missedByRole(page, element)))
    ).filter((miss) => miss !== undefined);
    expect(misses, `${misses.length} of ${elements.length} not found`).toStrictEqual([]);
  });
});

// The target app paints nothing over its own content: its menus open in the flow (`style.css`), so
// V3 cuts nothing there, and neither the route table nor `seed:demo` moves with it (#229).
test.each(TARGET_APP_PATHS)("nothing the page paints covers an element on %s", async (path) => {
  const { elements } = await measure(`${path}${CONTRAST_2}`);
  expect(elements.length, "elements measured").toBeGreaterThan(0);
  expect(elements.filter((e) => e.covered).map((e) => e.key)).toStrictEqual([]);
});

test("collect then perceive twice gives the same Actor text", async () => {
  const vera = profileFixture("prof_vera");
  // Two contexts, two page loads, two collects.
  const first = actorText(await measure(`/deliveries${CONTRAST_2}`), vera);
  const second = actorText(await measure(`/deliveries${CONTRAST_2}`), vera);
  expect(second).toBe(first);
  // Not vacuous: the text lists what Vera sees.
  expect(first).toContain('link "Delivery address"');
});

test("a hard cut of 3.0 removes Order archive at contrast 2 and keeps it at 7", async () => {
  const ada = profileFixture("prof_ada");
  const strict: Profile = {
    ...ada,
    perception: { ...ada.perception, contrast: { threshold: 3, provenance: "wcag22" } },
  };
  expect(actorText(await measure(`/deliveries${CONTRAST_2}`), strict)).not.toContain(
    'link "Order archive"',
  );
  expect(actorText(await measure(`/deliveries${CONTRAST_7}`), strict)).toContain(
    'link "Order archive"',
  );
});
