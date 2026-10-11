/**
 * Slider moves make no request (`tasks/s3-05-live-preview.md`, box 2): the web app on its own Vite
 * dev server, in Chromium, with io's `/api/measure` and `/api/axe` answered by `page.route`. An
 * in-page spy wraps `fetch`, and a listener records every request the page makes. After the live
 * page and its axe-core card are drawn, keyboard moves on three sliders write the URL and redraw
 * the page, and neither the spy nor the listener sees anything: a slider move asks io for neither
 * the measurement nor the scan (s4-06). Then the page control opens `/account`, which fetches both:
 * the spy is seen to catch the screen's fetches, so its silence before means something.
 *
 * The illustration view (s3-06) is held to the same: its picture, answered from `/api/illustration`,
 * is fetched once, slider moves fetch nothing, and a persona switch fetches the next persona's.
 * Off `/deliveries` it fetches no picture, and a failed picture shows its stored banner while the
 * measurement beside it is live.
 *
 * The static tests in `lens.test.tsx` cannot show this: a static render runs no effect, so
 * nothing there would fetch either way.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { AxeScan, Bbox } from "@wayford/core";
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
 * on the same origin and at the same query.
 */
function axeScanOf(page: string): AxeScan {
  const stored = axeScanFixtures.find((scan) => new URL(scan.url).pathname === page);
  if (stored !== undefined) return stored;
  const { url, ...deliveries } = axeScanFixture("/deliveries");
  const at = new URL(url);
  at.pathname = page;
  return { ...deliveries, url: at.href, violations: [] };
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
      if (url.pathname === "/api/measure") {
        // A URL page is measured at its own URL, so its `Live:` line names it (#245).
        const at = url.searchParams.get("url");
        return route.fulfill({
          json: at === null ? measurementFixture : { ...measurementFixture, url: at },
        });
      }
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
  const caption = page.locator("figcaption p").first();
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

/** Whether the document fits the window, down and across, so nothing scrolls. */
function fitsOf(page: Page): Promise<{ down: boolean; across: boolean }> {
  return page.evaluate(() => ({
    down: document.documentElement.scrollHeight <= window.innerHeight,
    across: document.documentElement.scrollWidth <= window.innerWidth,
  }));
}

/** Whether box `inner` lies inside box `outer`, both as Playwright measures them. */
function inside(inner: Bbox | null, outer: Bbox | null): boolean {
  if (inner === null || outer === null) return false;
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

test("beat 2 reads at 1280 × 720: the page is drawn at half its size or more, Order archive in view, and nothing scrolls", async () => {
  // #224: the measured page is 1280 px wide, so a frame 640 px wide or more draws its 16 px text
  // at 8 px or more. Order archive is the link beat 2 watches go, at y 603 of the measured 720.
  const page = await spiedPage();
  expect(page.viewportSize()).toEqual({ width: 1280, height: 720 });
  const views = [
    // Drawn whole: at contrast 2 with no band its 2.005:1 passes.
    { query: "contrast=2&contrastSoftness=0", archive: "[data-state]" },
    // Cut at 4.5 and shown as evidence: its outline, which names it for screen readers.
    { query: "contrast=4.5&evidence=true", archive: "[data-removed]" },
  ];
  for (const { query, archive: selector } of views) {
    await page.goto(`${origin}/lens?persona=prof_vera&seed=1&${query}`);
    const archive = page.locator(selector, { hasText: "Order archive" });
    await archive.waitFor();
    await page.getByRole("region", { name: "axe-core" }).getByText("1 violation").waitFor();
    expect(await fitsOf(page), query).toEqual({ down: true, across: true });
    const frame = await page.locator("[data-lens-stage]").boundingBox();
    expect(frame?.width ?? 0, query).toBeGreaterThanOrEqual(640);
    const box = await archive.boundingBox();
    expect(inside(box, frame), query).toBe(true);
    expect(inside(box, { x: 0, y: 0, width: 1280, height: 720 }), query).toBe(true);
    const fontPx = await archive.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize),
    );
    expect(fontPx, query).toBeGreaterThanOrEqual(8);
  }
  await page.close();
});

test("beat 2 at full size: Order archive is drawn at its 16 px in a stage that scrolls, and keeps its scroll through a view flip, a slider move and a persona switch while fitted", async () => {
  // #224, part 2: the whole page cannot be legible on the stage, so zoom=true draws it at its
  // measured size and the stage scrolls, while the document still scrolls nothing.
  const page = await spiedPage();
  const viewport = { x: 0, y: 0, width: 1280, height: 720 };
  const scroller = page.locator("[data-lens-scroller]");
  for (const { query, archive: selector } of [
    { query: "contrast=2&contrastSoftness=0", archive: "[data-state]" },
    { query: "contrast=4.5&evidence=true", archive: "[data-removed]" },
  ]) {
    await page.goto(`${origin}/lens?persona=prof_vera&seed=1&${query}&zoom=true`);
    const archive = page.locator(selector, { hasText: "Order archive" });
    await archive.waitFor();
    await page.getByRole("region", { name: "axe-core" }).getByText("1 violation").waitFor();
    expect(await page.getByRole("button", { name: "Full size" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    const fontPx = await archive.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize),
    );
    expect(fontPx, query).toBe(16);
    // Off the stage at first, since the page is taller than the stage; scrolled to, inside it.
    await archive.scrollIntoViewIfNeeded();
    const stage = await scroller.boundingBox();
    expect(inside(await archive.boundingBox(), stage), query).toBe(true);
    expect(inside(stage, viewport), query).toBe(true);
    expect(await fitsOf(page), query).toEqual({ down: true, across: true });
  }

  // The scroll survives the fresh page a view flip mounts, a slider move's redraw, and a persona
  // switch while fitted, which is how the demo sets beat 2 up before beat 1.
  await page.goto(
    `${origin}/lens?persona=prof_vera&seed=1&contrast=2&contrastSoftness=0&zoom=true`,
  );
  await page.locator("[data-state]", { hasText: "Order archive" }).waitFor();
  await scroller.evaluate((element) => element.scrollTo(40, 300));
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(300);
  await page.getByRole("radio", { name: "Evidence" }).click();
  await page.locator("[data-removed]").first().waitFor();
  const kept = () =>
    scroller.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop }));
  expect(await kept()).toEqual({ left: 40, top: 300 });
  await press(page, "preview-contrast", "ArrowRight", 1);
  await expect.poll(() => page.url()).toContain("contrast=2.1");
  expect(await kept()).toEqual({ left: 40, top: 300 });

  // Toggled off, the page fits the stage again and the stage scrolls nothing. A persona switch
  // then mounts the page fitted, and Full size brings the scroll back: the demo's setup.
  const fullSize = page.getByRole("button", { name: "Full size" });
  await fullSize.click();
  await expect.poll(() => page.url()).not.toContain("zoom=");
  const frame = await page.locator("[data-lens-stage]").boundingBox();
  expect(inside(frame, await scroller.boundingBox())).toBe(true);
  // Kai, like Vera, is measured on desktop, so his page is the same page.
  await page
    .getByRole("navigation", { name: "Persona" })
    .getByRole("link", { name: "Kai" })
    .click();
  await expect.poll(() => page.url()).toContain("persona=prof_kai");
  await page.locator("[data-lens-stage]").waitFor();
  await fullSize.click();
  await expect.poll(() => page.url()).toContain("zoom=true");
  await expect.poll(kept).toEqual({ left: 40, top: 300 });
  await page.close();
});

test("a long URL with no hyphens scrolls nothing at 1280 × 720 and draws the page as large as a short one does, in either view (#245)", async () => {
  // #245: a URL of `/`, `?` and letters has no break point, so its `Live:` line ran to x 1601.
  // Wrapped, it grew the caption and shrank the frame from 663 to 535 px wide, so it is cut short
  // on one line instead, whole in its text and its `title`.
  const long = `https://example.com/${"segment/".repeat(14)}?q=${"x".repeat(40)}`;
  const page = await spiedPage();
  expect(page.viewportSize()).toEqual({ width: 1280, height: 720 });
  const viewport = { x: 0, y: 0, width: 1280, height: 720 };
  const frames: Record<string, Bbox | null> = {};
  for (const url of [long, "https://example.com/"]) {
    for (const view of ["", "&evidence=true"]) {
      const at = `${url === long ? "long" : "short"}${view}`;
      await page.goto(
        `${origin}/lens?persona=prof_vera&seed=1&url=${encodeURIComponent(url)}${view}`,
      );
      const live = page.locator("figcaption p", { hasText: "Live:" });
      await live.waitFor();
      await page.getByRole("region", { name: "axe-core" }).getByText("0 violations").waitFor();
      // The URL's own span, the issue's culprit: the paragraph keeps its column's width however
      // far its content runs past it, so its box would pass on the broken layout too.
      const span = live.locator(".font-mono");
      expect(inside(await span.boundingBox(), viewport), at).toBe(true);
      expect(await fitsOf(page), at).toEqual({ down: true, across: true });
      expect(await live.textContent(), at).toBe(`Live: ${url} on desktop, opened as given.`);
      expect(await span.getAttribute("title"), at).toBe(url);
      frames[at] = await page.locator("[data-lens-stage]").boundingBox();
    }
  }
  expect(frames.short?.width ?? 0).toBeGreaterThanOrEqual(640);
  for (const at of ["short&evidence=true", "long", "long&evidence=true"]) {
    expect(frames[at], at).toEqual(frames.short);
  }
  await page.close();
});

/** An answer held back until `release` says whether it fails. */
function held(): { failed: Promise<boolean>; release: (fail: boolean) => void } {
  let release: (fail: boolean) => void = () => {};
  const failed = new Promise<boolean>((resolve) => {
    release = resolve;
  });
  return { failed, release };
}

test("a long URL scrolls nothing at 1280 × 720 while it is measured and scanned, or when either fails (#245)", async () => {
  // #245 review: the `Live:` line was not the only one to quote the URL. The measuring line, the
  // axe card's scanning and failure lines and the fault banner, with io's messages, which quote it
  // too, each ran the document up to 2064 px wide.
  const long = `https://example.com/${"segment/".repeat(14)}?q=${"x".repeat(40)}`;
  const failure = (code: string) =>
    `${code}: the page at ${long} did not load: page.goto: net::ERR_NAME_NOT_RESOLVED at ${long}`;
  const viewport = { x: 0, y: 0, width: 1280, height: 720 };
  const card = (page: Page) => page.getByRole("region", { name: "axe-core" });

  for (const measureFails of [false, true]) {
    const page = await spiedPage();
    const measure = held();
    const axe = held();
    // Registered after `spiedPage`'s, so these answer first.
    await page.route(
      (url) => url.pathname === "/api/measure",
      async (route) =>
        (await measure.failed)
          ? route.fulfill({ status: 502, json: { error: failure("page_unavailable") } })
          : route.fulfill({ json: { ...measurementFixture, url: long } }),
    );
    await page.route(
      (url) => url.pathname === "/api/axe",
      async (route) =>
        (await axe.failed)
          ? route.fulfill({ status: 502, json: { error: failure("axe_failed") } })
          : route.fulfill({ json: axeScanOf("/") }),
    );
    await page.goto(`${origin}/lens?persona=prof_vera&seed=1&url=${encodeURIComponent(long)}`);

    await page.getByRole("status").getByText(`Measuring ${long} on desktop…`).waitFor();
    const scanning = card(page).getByText(`axe-core is scanning ${long}…`);
    await scanning.waitFor();
    expect(await fitsOf(page), "measuring").toEqual({ down: true, across: true });

    measure.release(measureFails);
    const at = measureFails ? "measurement failed" : "page drawn, axe scanning";
    if (measureFails) {
      await page.getByRole("alert").getByText("The page could not be measured").waitFor();
    } else {
      await page.locator("figcaption p", { hasText: "Live:" }).waitFor();
    }
    expect(await fitsOf(page), at).toEqual({ down: true, across: true });
    expect(await scanning.getAttribute("title"), at).toBe(long);

    axe.release(true);
    const notRun = card(page).getByText(`axe did not run on ${long}`);
    await notRun.waitFor();
    const both = measureFails ? "both failed" : "axe failed";
    // With both failed, no page is drawn and the banner's and the card's messages each wrap onto
    // their next line, so the document may run a line or so down. It never runs across.
    const fits = await fitsOf(page);
    expect(fits.across, both).toBe(true);
    if (!measureFails) expect(fits.down, both).toBe(true);
    expect(await notRun.getAttribute("title"), both).toBe(long);
    if (measureFails) {
      const again = page.getByRole("button", { name: "Try again" });
      expect(inside(await again.boundingBox(), viewport), both).toBe(true);
    }
    await page.close();
  }
});

test("a slider move that fires one rule more keeps the drawn page's size", async () => {
  // #224 review: with two rules fired, the strip was shorter than with three, so a move that fired
  // P4 grew the strip and shrank the page mid-drag. Ada at contrast 2.1 and 18 px fires P1 and P3;
  // her target size at its end fires P4 too.
  const page = await spiedPage();
  await page.goto(`${origin}/lens?persona=prof_ada&seed=1&contrast=2.1&fontPx=18`);
  await page.locator("[data-state]").first().waitFor();
  const card = page.getByRole("region", { name: "axe-core" });
  await card.getByText("1 violation").waitFor();
  const rules = page
    .getByText("rules fired")
    .locator("xpath=ancestor::div[1]")
    .getByRole("listitem");
  await expect.poll(() => rules.allTextContents()).toEqual(["P1 contrast", "P3 font size"]);
  const frame = page.locator("[data-lens-stage]");
  const before = await frame.boundingBox();
  await press(page, "preview-targetPx", "End", 1);
  await expect.poll(() => rules.count()).toBe(3);
  expect(await frame.boundingBox()).toEqual(before);
  await page.close();
});

test("the URL button shows the row with its field focused; Escape hides it, and a URL opened from it hides it too", async () => {
  const page = await spiedPage();
  await page.goto(`${origin}/lens?persona=prof_vera`);
  await page.locator("[data-state]").first().waitFor();
  const toggle = page.getByRole("button", { name: "Open a URL" });
  const field = page.locator("#lens-url");
  expect(await toggle.getAttribute("aria-expanded")).toBe("false");
  expect(await field.count()).toBe(0);

  // Shown: the field is focused and empty on a target-app page, and the button controls its row.
  await toggle.click();
  await expect
    .poll(() => field.evaluate((element) => element === document.activeElement))
    .toBe(true);
  expect(await field.inputValue()).toBe("");
  expect(await toggle.getAttribute("aria-expanded")).toBe("true");
  expect(await toggle.getAttribute("aria-controls")).toBe("lens-url-row");
  // Escape hides it and gives the focus back to the button.
  await page.keyboard.press("Escape");
  await field.waitFor({ state: "detached" });
  expect(await toggle.evaluate((element) => element === document.activeElement)).toBe(true);
  expect(await toggle.getAttribute("aria-expanded")).toBe("false");

  // Shown, then a page link and Back: the row stays hidden, since a navigation forgot it.
  await toggle.click();
  await field.waitFor();
  await page
    .getByRole("navigation", { name: "Page" })
    .getByRole("link", { name: "/account" })
    .click();
  await page.waitForFunction(() => new URLSearchParams(location.search).get("page") === "/account");
  await field.waitFor({ state: "detached" });
  await page.goBack();
  await page.waitForFunction(() => !new URLSearchParams(location.search).has("page"));
  await page.locator("[data-state]").first().waitFor();
  expect(await field.count()).toBe(0);
  expect(await toggle.getAttribute("aria-expanded")).toBe("false");

  // A refused value keeps the row and shows the alert; a whole URL opens and hides the row.
  await toggle.click();
  await field.fill("example.com");
  await page.keyboard.press("Enter");
  await page.getByRole("alert").getByText("Enter a whole http(s) URL").waitFor();
  await field.fill("https://example.com/");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => new URLSearchParams(location.search).get("url"));
  await field.waitFor({ state: "detached" });
  expect(await toggle.getAttribute("aria-expanded")).toBe("false");
  // The focus goes back to the button, as after Escape, not to the body.
  expect(await toggle.evaluate((element) => element === document.activeElement)).toBe(true);
  // On a URL page the field shows its URL.
  await toggle.click();
  expect(await field.inputValue()).toBe("https://example.com/");
  await page.close();
});

/** The screen's fetch of the picture for `emulation` on desktop (`src/api/illustration.ts`). */
function pictureFetch(emulation: string): string {
  return `/api/illustration?device=desktop&emulation=${emulation}`;
}

test("in the illustration view the picture is fetched once, slider moves fetch nothing, and a persona switch does", async () => {
  // The picture follows the persona, never the sliders (s3-06, task Constraints).
  const page = await spiedPage();
  // io's answer is the stored picture for the pair, full size, so the fit below is a real one.
  await page.route(
    (url) => url.pathname === "/api/illustration",
    async (route) => {
      const url = new URL(route.request().url());
      const name = `${url.searchParams.get("device")}-${url.searchParams.get("emulation")}.png`;
      const body = await readFile(`${WEB_ROOT}public/illustration/${name}`);
      return route.fulfill({ body, contentType: "image/png" });
    },
  );
  const requests: string[] = [];
  page.on("request", (request) => {
    requests.push(request.url());
  });

  await page.goto(`${origin}/lens?persona=prof_vera`);
  await page.getByText("Live: http://localhost:5174/deliveries on desktop").waitFor();
  await page.waitForLoadState("networkidle");
  // The perceived view asks for no picture.
  expect(await fetchesOf(page)).toEqual(fetchesFor("/deliveries"));

  // The View control opens the illustration view, replacing the history entry with the key.
  await page.getByRole("radio", { name: "Illustration" }).click();
  await page.waitForFunction(() => new URLSearchParams(location.search).get("illustration"));
  const picture = page.getByRole("img", {
    name: "/deliveries on desktop under Chrome's blurredVision emulation",
  });
  await picture.waitFor();
  await page.waitForLoadState("networkidle");
  const once = [...fetchesFor("/deliveries"), pictureFetch("blurredVision")].sort();
  expect(await fetchesOf(page)).toEqual(once);
  // It fits the projector with no scroll, as the other views do (s3-11): the 1280 × 720 picture
  // is scaled down into the stage, above its caption.
  expect(page.viewportSize()).toEqual({ width: 1280, height: 720 });
  expect(await fitsOf(page)).toEqual({ down: true, across: true });
  const box = await picture.boundingBox();
  const caption = await page.locator("figcaption").boundingBox();
  expect(box !== null && caption !== null && box.y + box.height <= caption.y).toBe(true);
  expect(box !== null && box.width < 1280).toBe(true);
  const src = await picture.getAttribute("src");

  requests.length = 0;
  await press(page, "preview-contrast", "ArrowRight", 5);
  await press(page, "preview-contrastSoftness", "ArrowRight", 2);
  await press(page, "preview-seed", "ArrowRight", 3);
  await page.locator("h1").click();
  await page.waitForFunction(() => new URLSearchParams(location.search).get("seed") === "4");
  // The sliders moved and the URL holds them, and the picture is the one it was.
  const query = new URL(page.url()).searchParams;
  expect(query.has("contrast")).toBe(true);
  expect(query.get("illustration")).toBe("true");
  expect(await picture.getAttribute("src")).toBe(src);
  // No fetch and no request: neither the picture, nor the measurement, nor the scan.
  expect(await fetchesOf(page)).toEqual(once);
  expect(requests).toEqual([]);

  // A persona link keeps the view and asks io for Zoya's picture, through the same spy.
  await page
    .getByRole("navigation", { name: "Persona" })
    .getByRole("link", { name: "Zoya" })
    .click();
  await expect
    .poll(() => fetchesOf(page))
    .toEqual([...once, pictureFetch("reducedContrast")].sort());
  await page
    .getByRole("img", { name: "/deliveries on desktop under Chrome's reducedContrast emulation" })
    .waitFor();
  await page.close();
});

test("off /deliveries no picture is asked for; a failed picture reads stored though the page is live, and Try again brings io's back", async () => {
  // The stage claims only the picture's source in the illustration view (s3-06), and only where a
  // picture is asked for.
  const page = await spiedPage();
  // io's picture fails until the test brings it back, for Try again.
  let pictureUp = false;
  await page.route(
    (url) => url.pathname === "/api/illustration",
    async (route) =>
      pictureUp
        ? route.fulfill({
            body: await readFile(`${WEB_ROOT}public/illustration/desktop-blurredVision.png`),
            contentType: "image/png",
          })
        : route.fulfill({ status: 502, json: { error: "the picture browser did not start" } }),
  );

  // On /account the view asks io for no picture, and no banner is drawn.
  await page.goto(`${origin}/lens?persona=prof_vera&page=/account&illustration=true`);
  await page.getByText("The illustration is taken of /deliveries only.").waitFor();
  await page.waitForLoadState("networkidle");
  expect(await fetchesOf(page)).toEqual(fetchesFor("/account"));
  expect(await page.getByText("The live picture is unavailable").count()).toBe(0);

  // On /deliveries io's picture fails while its measurement is live: the stored picture shows
  // under its banner.
  await page.getByRole("link", { name: "Open /deliveries" }).click();
  await page
    .getByText("The live picture is unavailable: the picture browser did not start.")
    .waitFor();
  await page.waitForLoadState("networkidle");
  // The measurement is live: io answered it, and its stored banner is not drawn. Nor is a
  // "Live:" line, since the stage holds the stored picture.
  expect(await page.getByText("The live page is unavailable").count()).toBe(0);
  expect(await page.getByText("Live: ").count()).toBe(0);
  const picture = page.getByRole("img", {
    name: "/deliveries on desktop under Chrome's blurredVision emulation",
  });
  expect(await picture.getAttribute("src")).toBe("/illustration/desktop-blurredVision.png");
  const failed = [...fetchesFor("/account", "/deliveries"), pictureFetch("blurredVision")].sort();
  expect(await fetchesOf(page)).toEqual(failed);

  // Back on /account the failed picture claims nothing and is not asked for again.
  await page
    .getByRole("navigation", { name: "Page" })
    .getByRole("link", { name: "/account" })
    .click();
  await page.getByText("The illustration is taken of /deliveries only.").waitFor();
  await page.waitForLoadState("networkidle");
  expect(await page.getByText("The live picture is unavailable").count()).toBe(0);
  expect(await fetchesOf(page)).toEqual(failed);

  // Back on /deliveries with io's picture up, Try again asks for it, and it replaces the stored one.
  await page
    .getByRole("navigation", { name: "Page" })
    .getByRole("link", { name: "/deliveries" })
    .click();
  pictureUp = true;
  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByText("The live picture is unavailable").waitFor({ state: "detached" });
  expect(await picture.getAttribute("src")).toMatch(/^blob:/);
  expect(await page.getByText("The live picture is unavailable").count()).toBe(0);
  await page.close();
});

/** What the computed style says of an element's animation. */
function animationOf(element: Element) {
  const style = getComputedStyle(element);
  return {
    name: style.animationName,
    iterations: style.animationIterationCount,
    duration: style.animationDuration,
  };
}

test("an element a threshold move removes fades out once, and under reduced motion is simply gone", async () => {
  // Order archive's contrast is 2.005:1, so at 2 with no band it is drawn and at 2.1 it is cut.
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    const page = await spiedPage();
    await page.emulateMedia({ reducedMotion });
    await page.goto(`${origin}/lens?persona=prof_vera&seed=1&contrast=2&contrastSoftness=0`);
    const archive = page.locator("[data-state]", { hasText: "Order archive" });
    await archive.waitFor();
    await press(page, "preview-contrast", "ArrowRight", 1);
    // Drawn no more: a ghost of it, hidden from assistive technology, takes its place.
    const ghost = page.locator("[data-leaving]");
    await ghost.waitFor({ state: "attached" });
    await expect.poll(() => archive.count()).toBe(0);
    expect(await ghost.getAttribute("aria-hidden"), reducedMotion).toBe("true");
    if (reducedMotion === "reduce") {
      expect((await ghost.evaluate(animationOf)).name).toBe("none");
    } else {
      expect(await ghost.evaluate(animationOf)).toEqual({
        name: "lens-out",
        iterations: "1",
        duration: "0.24s",
      });
    }
    // Either way it rests unseen, and a further move that changes nothing replays nothing: the
    // ghost stays the same node, with no animation running.
    await expect.poll(() => ghost.evaluate((element) => element.getAnimations().length)).toBe(0);
    expect(await ghost.evaluate((element) => getComputedStyle(element).opacity)).toBe("0");
    await ghost.evaluate((element) => element.setAttribute("data-seen", ""));
    await press(page, "preview-contrast", "ArrowRight", 1);
    await page.waitForFunction(
      () => new URLSearchParams(location.search).get("contrast") === "2.2",
    );
    expect(await ghost.getAttribute("data-seen")).toBe("");
    expect(await ghost.evaluate((element) => element.getAnimations().length)).toBe(0);
    await page.close();
  }
});
