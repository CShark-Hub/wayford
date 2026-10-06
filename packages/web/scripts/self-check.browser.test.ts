/**
 * The self-check (`docs/DESIGN.md`, "Checked by"). Pages built to fail are served by `page.route`
 * on a fake origin, since `collect` needs an http(s) URL. Then every listed screen runs in each
 * theme against the web app on its own Vite dev server, as `pnpm test` runs it in CI.
 */
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, onTestFinished, test, vi } from "vitest";
import { THEME_NAMES } from "../src/theme.js";
import {
  checkScreen,
  SELF_CHECK_SCREENS,
  SELF_CHECK_THEMES,
  type SelfCheckScreen,
  startWebApp,
} from "./self-check.js";

// Starting Vite, its first transform of the app and launching Chromium take longer than vitest's
// 5 s hook default.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const FAKE_ORIGIN = "http://self-check.test";

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

/** A page closed when the test ends. `checkScreen` sets its size. */
async function newPage(): Promise<Page> {
  const page = await browser.newPage();
  onTestFinished(() => page.close());
  return page;
}

/** A page that gets `body` as its whole document from the fake origin, white and 16 px. */
async function fakePage(body: string): Promise<Page> {
  const page = await newPage();
  await page.route(`${FAKE_ORIGIN}/**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="en"><head><title>Self-check</title></head>
        <body style="margin: 24px; background: #fff; color: #000; font: 16px sans-serif">${body}</body></html>`,
    }),
  );
  return page;
}

/** A screen on the fake origin, ready once its one heading shows. */
const FAKE_SCREEN: SelfCheckScreen = {
  name: "fake",
  path: "/",
  ready: 'role=heading[name="Self-check"s]',
  responses: {},
};

/** What every shortfall on the fake screen shares. */
const FAKE = { screen: "fake", key: expect.any(String) };

describe("checkScreen on a page built to fail", () => {
  test("a page with 3:1 text and a 20 px button fails on exactly those two", async () => {
    // #949494 on white is 3.03:1 by the filter's own `contrastRatio`. Everything else is black on
    // white and at least 16 px.
    const page = await fakePage(`
      <h1 style="font-size: 32px">Self-check</h1>
      <p style="color: #949494">Faint text</p>
      <button aria-label="Go" style="width: 20px; height: 20px; padding: 0; border: 0; background: #000"></button>`);
    const check = await checkScreen(page, FAKE_ORIGIN, FAKE_SCREEN);
    expect(check.shortfalls).toEqual([
      {
        ...FAKE,
        role: "paragraph",
        name: "Faint text",
        metric: "contrast",
        value: expect.closeTo(3.03, 2),
        floor: 4.5,
      },
      { ...FAKE, role: "button", name: "Go", metric: "targetPx", value: 20, floor: 32 },
    ]);
  });

  test("a link's own text is checked too: 3:1 at 12 px fails on contrast and on size", async () => {
    // A control carries the contrast and font size of its label's text (core's `measurement.ts`),
    // so nav links and buttons are held to the same floor as paragraphs. The padding keeps the
    // link's target over 32 px, so only its text falls short.
    const page = await fakePage(`
      <h1 style="font-size: 32px">Self-check</h1>
      <a href="/next" style="display: inline-block; padding: 16px; color: #949494; font-size: 12px">Next</a>`);
    const check = await checkScreen(page, FAKE_ORIGIN, FAKE_SCREEN);
    const link = { ...FAKE, role: "link", name: "Next" };
    expect(check.shortfalls).toEqual([
      { ...link, metric: "contrast", value: expect.closeTo(3.03, 2), floor: 4.5 },
      { ...link, metric: "fontPx", value: 12, floor: 16 },
    ]);
  });

  test("a request to an /api path the screen does not list rejects, naming the path", async () => {
    // The heading shows only once io answers, which it never does here.
    const page = await fakePage(`
      <script>
        fetch("/api/runs").then((response) => {
          if (response.ok) document.body.innerHTML = "<h1>Self-check</h1>";
        });
      </script>`);
    await expect(checkScreen(page, FAKE_ORIGIN, FAKE_SCREEN)).rejects.toMatchObject({
      name: "WayfordError",
      code: "self_check_unanswered",
      message: expect.stringContaining("/api/runs"),
    });
  });

  test("a screen that reads io is measured once its listed data has drawn it", async () => {
    // The heading and the faint line come only from the listed response, and 300 ms after it, so
    // the check must answer `/api/runs` from `responses` and wait for `ready` before it measures.
    const page = await fakePage(`
      <script>
        fetch("/api/runs")
          .then((response) => response.json())
          .then(({ title }) => setTimeout(() => {
            document.body.innerHTML = "<h1>" + title + "</h1><p style='color: #949494'>Late</p>";
          }, 300));
      </script>`);
    const screen = { ...FAKE_SCREEN, responses: { "/runs": { title: "Self-check" } } };
    const check = await checkScreen(page, FAKE_ORIGIN, screen);
    expect(check.shortfalls).toEqual([
      {
        ...FAKE,
        role: "paragraph",
        name: "Late",
        metric: "contrast",
        value: expect.closeTo(3.03, 2),
        floor: 4.5,
      },
    ]);
  });

  test("a request the page makes after it is ready still fails, naming the path", async () => {
    // A screen whose heading is static can ask io after it is drawn: its data, unanswered, would be
    // missing from what is measured. The page asks the moment the check reads `document.fonts`,
    // which `checkScreen` does only once `ready` has shown, so the request is late every time.
    const page = await fakePage(`
      <h1 style="font-size: 32px">Self-check</h1>
      <script>
        const fonts = document.fonts;
        Object.defineProperty(document, "fonts", {
          get() {
            fetch("/api/sweeps");
            return fonts;
          },
        });
      </script>`);
    await expect(checkScreen(page, FAKE_ORIGIN, FAKE_SCREEN)).rejects.toMatchObject({
      code: "self_check_unanswered",
      message: expect.stringContaining("/api/sweeps"),
    });
  });

  test("a screen that does not open in the theme it is checked in fails, naming the theme", async () => {
    // The fake page has no boot script, so nothing sets `data-theme`: the check must not measure
    // it as if it were Night.
    const page = await fakePage(`<h1 style="font-size: 32px">Self-check</h1>`);
    await expect(checkScreen(page, FAKE_ORIGIN, FAKE_SCREEN, "dark")).rejects.toMatchObject({
      code: "self_check_theme",
      message: expect.stringContaining("Night"),
    });
  });

  test("text over a background image is unmeasured, not passed", async () => {
    // A gradient is a background image, and needs no request.
    const page = await fakePage(`
      <h1 style="font-size: 32px">Self-check</h1>
      <p style="background-image: linear-gradient(#fff, #fff)">Over a picture</p>`);
    const check = await checkScreen(page, FAKE_ORIGIN, FAKE_SCREEN);
    expect(check.shortfalls).toEqual([
      { ...FAKE, role: "paragraph", name: "Over a picture", metric: "unmeasured" },
    ]);
  });
});

test("every screen is checked in both themes", () => {
  // Dropping Night from the list would leave every test below green, with Night's floors checked
  // only when someone reads `check:self`'s summary line.
  expect(SELF_CHECK_THEMES).toEqual(["light", "dark"]);
});

describe("every listed screen passes", () => {
  // Only these tests need the web app, so only they start it.
  let app: Awaited<ReturnType<typeof startWebApp>>;

  beforeAll(async () => {
    app = await startWebApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  test.each(
    SELF_CHECK_SCREENS.flatMap((screen) =>
      SELF_CHECK_THEMES.map((theme) => [screen.name, THEME_NAMES[theme], screen, theme] as const),
    ),
  )(
    "%s in %s: text and controls measured, nothing under the floor",
    async (_name, _theme, screen, theme) => {
      const check = await checkScreen(await newPage(), app.origin, screen, theme);
      // So an empty page cannot pass. That the check waits for a screen's data is shown on the
      // fake page above.
      const kinds = new Set(check.measurement.elements.map((element) => element.kind));
      expect(kinds).toEqual(new Set(["text", "control"]));
      expect(check.shortfalls).toEqual([]);
    },
  );
});
