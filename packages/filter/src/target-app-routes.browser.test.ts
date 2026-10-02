/**
 * The target app's three routes to the hard goal, against the browser boxes of
 * `tasks/s1-04-target-app-routes.md` (`docs/specs/2026-10-02-s1-04-target-app-routes.md`,
 * "Acceptance mapping"). The setup follows `collect.browser.test.ts`: the app built and served on
 * a free port, every page in a fresh 1280 × 720 context, the bundled font checked. Every page is
 * collected once, at the app's defaults, for the `perceive` boxes.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Bbox, FullObservation, PageMeasurement, Profile } from "@wayford/core";
import { profileFixture } from "@wayford/core/fixtures";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import { collect } from "./collect.js";
import { perceive } from "./perceive.js";
import { serveTargetApp, TARGET_APP_PATHS, type TargetApp } from "./serve-target-app.js";

/** The app's defaults (`packages/target-app/README.md`, "Parameters"). */
const DEFAULTS = "?contrast=2&fontPx=16&targetPx=36";
const ARCHIVE = "/deliveries/archive";
const HARD_LINK = "main//link:Order archive";
/** Route B's entrance, on `/account`, and route C's, on `/settings`. */
const KEBAB = "main//button:More options";
const YOUR_DATA = "main//link:Your data";
const ENTRANCES = [
  ["/account", KEBAB],
  ["/settings", YOUR_DATA],
] as const;
const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);

let app: TargetApp;
let browser: Browser;
const measured = new Map<string, PageMeasurement>();

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

// Its own hook and timeout, so seven page loads do not share the build's budget.
beforeAll(async () => {
  for (const path of TARGET_APP_PATHS) {
    measured.set(path, await withPage(`${path}${DEFAULTS}`, (page) => collect(page)));
  }
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

function measurement(path: string): PageMeasurement {
  const found = measured.get(path);
  if (!found) throw new Error(`${path} was not collected`);
  return found;
}

function element(path: string, key: string) {
  const found = measurement(path).elements.find((e) => e.key === key);
  if (!found) throw new Error(`No measured element ${key} on ${path}`);
  return found;
}

function decisions(full: FullObservation, key: string) {
  const found = full.elements.find((e) => e.key === key);
  if (!found) throw new Error(`No observed element ${key}`);
  return found.decisions;
}

/** True when the element carries `rule` with the state `invisible`. */
const removedBy = (full: FullObservation, key: string, rule: "P1" | "P4") =>
  decisions(full, key).some(
    (d) => d.stage === "perception" && d.rule === rule && d.state === "invisible",
  );

test("TARGET_APP_PATHS equals the paths in target-app's PAGES", () => {
  // Read as text: filter may not import target-app (`biome.json`).
  const file = fileURLToPath(new URL("../../target-app/src/pages.ts", import.meta.url));
  const source = readFileSync(file, "utf8");
  const start = source.indexOf("export const PAGES");
  expect(start, "PAGES in pages.ts").toBeGreaterThanOrEqual(0);
  const list = source.slice(start, source.indexOf("];", start));
  const paths = [...list.matchAll(/path: "([^"]+)"/g)].map((match) => match[1]);
  expect(paths).toStrictEqual([...TARGET_APP_PATHS]);
});

test("route B: the kebab opens its menu, and Past orders reaches the archive", async () => {
  await withPage(`/account${DEFAULTS}`, async (page) => {
    const kebab = page.getByRole("button", { name: "More options" });
    const pastOrders = page.getByRole("menuitem", { name: "Past orders" });
    await expect.poll(() => kebab.getAttribute("aria-expanded")).toBe("false");
    expect(await pastOrders.isVisible(), "Past orders before the click").toBe(false);
    await kebab.click();
    await expect.poll(() => kebab.getAttribute("aria-expanded")).toBe("true");
    expect(await pastOrders.isVisible(), "Past orders after the click").toBe(true);
    await pastOrders.click();
    await page.waitForURL(`**${ARCHIVE}`);
    expect(new URL(page.url()).pathname).toBe(ARCHIVE);
  });
});

test("the closed menu's entries are not measured", () => {
  const { elements } = measurement("/account");
  expect(element("/account", KEBAB).key).toBe(KEBAB);
  expect(elements.filter((e) => e.role === "menuitem").map((e) => e.key)).toStrictEqual([]);
});

/** True when two boxes share more than an edge. Boxes that only touch do not overlap. */
function overlaps(a: Bbox, b: Bbox, epsilon = 0.5): boolean {
  return (
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > epsilon &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > epsilon
  );
}

test("the open kebab menu covers nothing the filter measures", async () => {
  await withPage(`/account${DEFAULTS}`, async (page) => {
    await page.getByRole("button", { name: "More options" }).click();
    const { elements, viewport } = await collect(page);
    const items = elements.filter((e) => e.role === "menuitem");
    const others = elements.filter((e) => e.role !== "menuitem");
    // Not vacuous: the open menu's entries are measured, Past orders among them.
    expect(items.map((e) => e.key)).toContain("main//menuitem:Past orders");
    for (const item of items) {
      for (const other of others) {
        expect(overlaps(item.bbox, other.bbox), `${other.key} under ${item.key}`).toBe(false);
      }
    }
    // A click at an element's centre, the way the Actor clicks, lands on the element itself.
    // `bbox` is in viewport coordinates and nothing scrolled since `collect`, so the centre is
    // the point `elementFromPoint` takes. Centres outside the viewport have nothing to hit.
    const centres = elements
      .map(({ key, bbox }) => ({
        key,
        bbox,
        x: bbox.x + bbox.width / 2,
        y: bbox.y + bbox.height / 2,
      }))
      .filter(({ x, y }) => x >= 0 && y >= 0 && x < viewport.width && y < viewport.height);
    expect(centres.length, "centres in the viewport").toBeGreaterThan(items.length);
    const hits = await page.evaluate((points) => {
      // The hit, or one of its ancestors, must be the element: the one whose box is `bbox`.
      const same = (r: DOMRect, b: (typeof points)[number]["bbox"]) =>
        Math.abs(r.x - b.x) < 0.5 &&
        Math.abs(r.y - b.y) < 0.5 &&
        Math.abs(r.width - b.width) < 0.5 &&
        Math.abs(r.height - b.height) < 0.5;
      return points.map(({ key, bbox, x, y }) => {
        let hit = document.elementFromPoint(x, y);
        const landed = hit?.outerHTML.slice(0, 80) ?? "nothing";
        while (hit && !same(hit.getBoundingClientRect(), bbox)) hit = hit.parentElement;
        return { key, found: hit !== null, landed };
      });
    }, centres);
    for (const { key, found, landed } of hits) {
      expect(found, `the centre of ${key} lands on ${landed}`).toBe(true);
    }
  });
});

test("route C: Your data, then Fulfilment ledger, reaches the archive", async () => {
  await withPage(`/settings${DEFAULTS}`, async (page) => {
    await page.getByRole("link", { name: "Your data" }).click();
    await page.waitForURL("**/settings/data");
    await page.getByRole("link", { name: "Fulfilment ledger" }).click();
    await page.waitForURL(`**${ARCHIVE}`);
    expect(new URL(page.url()).pathname).toBe(ARCHIVE);
  });
});

test("the entrances measure a target from 24 to 31 px", () => {
  for (const [path, key] of ENTRANCES) {
    const targetPx = element(path, key).metrics.targetPx ?? Number.NaN;
    expect(targetPx, `${key} on ${path}`).toBeGreaterThanOrEqual(24);
    expect(targetPx, `${key} on ${path}`).toBeLessThanOrEqual(31);
  }
});

test("/settings/data passes AA on every measured metric", () => {
  const { elements } = measurement("/settings/data");
  const controls = elements.filter((e) => e.kind === "control");
  // Not vacuous: the page has controls and text blocks, the ledger among them.
  expect(controls.length, "controls").toBeGreaterThan(0);
  expect(elements.length - controls.length, "text blocks").toBeGreaterThan(0);
  expect(elements.map((e) => e.key)).toContain("main//link:Fulfilment ledger");
  for (const { key, kind, metrics } of elements) {
    if (metrics.fontPx !== undefined) expect(metrics.contrast, `${key} contrast`).toBeDefined();
    if (metrics.contrast !== undefined) {
      expect(metrics.contrast, `${key} contrast`).toBeGreaterThanOrEqual(4.5);
    }
    if (kind === "control") {
      expect(metrics.targetPx ?? 0, `${key} target`).toBeGreaterThanOrEqual(24);
    }
  }
});

test("Kai: no perception decision on any page, seeds 1 to 100", () => {
  const kai = profileFixture("prof_kai");
  for (const path of TARGET_APP_PATHS) {
    expect(measurement(path).elements.length, `elements on ${path}`).toBeGreaterThan(0);
    for (const seed of SEEDS) {
      const cut = perceive(measurement(path), kai, seed)
        .elements.filter((e) => e.decisions.some((d) => d.stage === "perception"))
        .map((e) => e.key);
      expect(cut, `${path}, seed ${seed}`).toStrictEqual([]);
    }
  }
});

test("Vera: P4 on both entrances, invisible, seeds 1 to 100", () => {
  const vera = profileFixture("prof_vera");
  for (const seed of SEEDS) {
    for (const [path, key] of ENTRANCES) {
      expect(
        removedBy(perceive(measurement(path), vera, seed), key, "P4"),
        `${key}, seed ${seed}`,
      ).toBe(true);
    }
  }
});

test("Vera with a hard contrast cut of 3.0 loses all three routes, seeds 1 to 100", () => {
  const vera = profileFixture("prof_vera");
  const hard: Profile = {
    ...vera,
    perception: {
      ...vera.perception,
      contrast: { threshold: 3, provenance: vera.perception.contrast?.provenance ?? "wcag22" },
    },
  };
  for (const seed of SEEDS) {
    const deliveries = perceive(measurement("/deliveries"), hard, seed);
    expect(removedBy(deliveries, HARD_LINK, "P1"), `${HARD_LINK}, seed ${seed}`).toBe(true);
    for (const [path, key] of ENTRANCES) {
      expect(
        removedBy(perceive(measurement(path), hard, seed), key, "P4"),
        `${key}, seed ${seed}`,
      ).toBe(true);
    }
  }
});
