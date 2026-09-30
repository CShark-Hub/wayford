/**
 * The measuring rules of `collect` (`docs/specs/2026-09-29-s1-02-metrics-collector.md`, Design),
 * one per test or table row, on small pages served through `page.route`. The origin is
 * `http://collect.test` because `PageMeasurement.url` must be http(s). Every expected contrast is
 * worked out from WCAG 2.2's definitions, never read back from `collect`.
 */
import { type Metrics, WayfordError } from "@wayford/core";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { collect } from "./collect.js";
import { pageSource } from "./measure-page.js";

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch().catch((error: unknown) => {
    throw new Error(
      "Chromium did not launch. If it is not installed, run " +
        "`pnpm --filter @wayford/filter exec playwright install --only-shell chromium`.",
      { cause: error },
    );
  });
}, 60_000);

afterAll(async () => {
  await browser?.close();
}, 60_000);

/** A fresh context and page, `width` × 720, closed whatever `use` does. */
async function withPage<T>(use: (page: Page) => Promise<T>, width = 1280): Promise<T> {
  const context = await browser.newContext({ viewport: { width, height: 720 } });
  try {
    return await use(await context.newPage());
  } finally {
    await context.close();
  }
}

async function open(page: Page, html: string): Promise<void> {
  await page.route("http://collect.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto("http://collect.test/");
}

const measure = (html: string, width?: number) =>
  withPage(async (page) => {
    await open(page, html);
    return collect(page);
  }, width);

/** The `sr-only` pattern: 1 × 1 px and clipped, read by screen readers, seen by nobody. */
const SR_ONLY = `<style>
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0 }
</style>`;

describe("which elements are measured, under which key", () => {
  test.each<{ claim: string; html: string; width?: number; keys: string[] }>([
    {
      claim:
        "nothing hidden from sight or from the accessibility tree; a visible child of a hidden parent is",
      html: `${SR_ONLY}
        <p>Ordinary</p>
        <p style="display: none">Display none</p>
        <p style="visibility: hidden">Visibility hidden</p>
        <div style="visibility: hidden"><p style="visibility: visible">Visible inside hidden</p></div>
        <div style="opacity: 0"><p>Under opacity 0</p></div>
        <p class="sr-only">Screen readers only</p>
        <div aria-hidden="true"><p>Under aria-hidden</p></div>`,
      keys: ["//paragraph:Ordinary", "//paragraph:Visible inside hidden"],
    },
    {
      // The paragraph is padded, so its empty name keeps it out, not the 1 px rule.
      claim: "no text block with an empty name, though a control with one",
      html: `<p style="padding: 8px"></p><button style="width: 40px; height: 40px"></button>`,
      keys: ["//button:"],
    },
    {
      claim:
        "a name reads a line break as a space, a child's aria-label for the child, sr-only text",
      html: `${SR_ONLY}
        <p>Sam Taylor<br>Email</p>
        <a href="/archive">Open <span aria-label="the order archive">📦</span></a>
        <a href="/more">Read more<span class="sr-only"> about deliveries</span></a>`,
      keys: [
        "//paragraph:Sam Taylor Email",
        "//link:Open the order archive",
        "//link:Read more about deliveries",
      ],
    },
    {
      claim: "the landmark path: a header in main is no banner, a section is a region when named",
      html: `
        <header><nav aria-label="Main"><a href="/">Home</a></nav></header>
        <main>
          <header><a href="/inside">Inside main</a></header>
          <section aria-label="Offers"><a href="/offer">Offer</a></section>
          <section><a href="/plain">Unnamed section</a></section>
        </main>
        <footer><p>Footer text</p></footer>`,
      keys: [
        "banner/navigation:Main//link:Home",
        "main//link:Inside main",
        "main/region:Offers//link:Offer",
        "main//link:Unnamed section",
        "contentinfo//paragraph:Footer text",
      ],
    },
    {
      claim: "an icon link is named by its svg's title",
      html: `<nav aria-label="Main">
        <a href="/"><svg width="24" height="24"><title>Home</title><rect width="24" height="24"/></svg></a>
      </nav>`,
      keys: ["navigation:Main//link:Home"],
    },
    {
      claim: "at 390 px, the menu button and not the collapsed nav",
      // A menu button shown and the nav hidden below 640 px, as the target app's header does.
      html: `<style>
        .menu { display: none }
        @media (max-width: 640px) { .menu { display: inline-block } nav { display: none } }
      </style>
      <header>
        <button class="menu" type="button">Menu</button>
        <nav aria-label="Main"><a href="/">Home</a></nav>
      </header>`,
      width: 390,
      keys: ["banner//button:Menu"],
    },
  ])("$claim", async ({ html, width, keys }) => {
    const measurement = await measure(html, width);
    expect(measurement.elements.map((e) => e.key)).toStrictEqual(keys);
  });
});

describe("what an element's text and box measure", () => {
  // A 120 × 40 button in black 16 px on white and a 200 × 40 field, neither padded nor bordered, so
  // the box is the target and no browser default colours the text.
  const BUTTON = `width: 120px; height: 40px; padding: 0; border: 0; background: #fff; color: #000;
    font-size: 16px`;
  const FIELD =
    "display: block; width: 200px; height: 40px; padding: 0; border: 0; font-size: 16px";

  // Black at half alpha over white is sRGB grey 0.5, of relative luminance 0.21404: black on it is
  // 5.2808:1, and it on white 3.9766:1. sRGB red has luminance 0.2126, 3.9984:1 on white, and
  // #767676 has 0.18116, 4.5422:1 on white. Each is truncated to 3 decimals.
  test.each<[claim: string, html: string, measured: [key: string, metrics: Metrics][]]>([
    [
      "an alpha background is composited over the white canvas",
      `<div style="background: rgba(0, 0, 0, 0.5)"><p>On half black</p></div>`,
      [["//paragraph:On half black", { contrast: 5.28, fontPx: 16 }]],
    ],
    [
      "a text colour with alpha is composited over its background",
      `<p style="color: rgba(0, 0, 0, 0.5)">Half black</p>`,
      [["//paragraph:Half black", { contrast: 3.976, fontPx: 16 }]],
    ],
    [
      "an oklch text colour is read as the sRGB colour it is",
      `<p style="color: oklch(0.627955 0.257683 29.2339)">Red</p>`,
      [["//paragraph:Red", { contrast: 3.998, fontPx: 16 }]],
    ],
    [
      "a background image leaves contrast out, and fontPx stays",
      `<div style="background-image: linear-gradient(#fff, #eee)">
        <p style="font-size: 20px">On a gradient</p>
      </div>`,
      [["//paragraph:On a gradient", { fontPx: 20 }]],
    ],
    [
      // Chromium paints a dark canvas the page cannot read, so no ratio is claimed against it.
      "under a dark colour scheme, text on the bare canvas gets no contrast",
      `<html style="color-scheme: dark"><body><p>On the dark canvas</p></body></html>`,
      [["//paragraph:On the dark canvas", { fontPx: 16 }]],
    ],
    [
      "under a dark colour scheme, text on an opaque background is still measured",
      `<html style="color-scheme: dark"><body style="background: #fff">
        <p style="color: #000">On white</p>
      </body></html>`,
      [["//paragraph:On white", { contrast: 21, fontPx: 16 }]],
    ],
    [
      // #ddd on white is 1.358:1. The paragraph's name holds the link's text, so it is measured by
      // its faintest run: a cut link must not reach the Actor through its paragraph.
      "a text block reads the worst of the text it draws, a nested link included",
      `<main><p>Looking for older orders?
        <a href="/archive" style="display: inline-block; height: 20px; color: #ddd">Order archive</a>
      </p></main>`,
      [
        [
          "main//paragraph:Looking for older orders? Order archive",
          { contrast: 1.358, fontPx: 16 },
        ],
        ["main//link:Order archive", { contrast: 1.358, fontPx: 16, targetPx: 20 }],
      ],
    ],
    [
      "a text block reads the smallest font it draws, a nested link's included",
      `<p style="font-size: 20px">Need help?
        <a href="/help" style="display: inline-block; height: 20px; color: #000; font-size: 12px">Contact us</a>
      </p>`,
      [
        ["//paragraph:Need help? Contact us", { contrast: 21, fontPx: 12 }],
        ["//link:Contact us", { contrast: 21, fontPx: 12, targetPx: 20 }],
      ],
    ],
    [
      // A card link: its name holds the muted subtitle, so a cut subtitle must not reach the Actor
      // through it (row 31). The heading inside is measured on its own and keeps its 21:1.
      "a link reads the worst of the text it draws, as a card link's muted subtitle",
      `<main><a href="/deliveries" style="display: block; width: 300px; height: 100px; color: #000">
        <h2 style="margin: 0; font-size: 24px">Deliveries</h2>
        <p style="margin: 0; color: #ddd">See older orders</p>
      </a></main>`,
      [
        ["main//link:Deliveries See older orders", { contrast: 1.358, fontPx: 16, targetPx: 100 }],
        ["main//heading:Deliveries", { contrast: 21, fontPx: 24 }],
        ["main//paragraph:See older orders", { contrast: 1.358, fontPx: 16 }],
      ],
    ],
    [
      "a button reads the worst of the text it draws, a faint small span included",
      `<button style="width: 120px; height: 40px; padding: 0; border: 0; background: #fff;
        color: #000; font-size: 16px">Save <span style="color: #ddd; font-size: 12px">draft</span></button>`,
      [["//button:Save draft", { contrast: 1.358, fontPx: 12, targetPx: 40 }]],
    ],
    [
      // Two labels 200 × 30 around a 30 × 30 checkbox: one 200 × 90 rectangle. The faint run is
      // the second label's second, so reading a first label or a first run gives 21.
      "a form control with no text of its own reads every run of all its labels",
      `<body style="margin: 0">
        <label for="sms" style="display: block; width: 200px; height: 30px">Text me</label>
        <input id="sms" type="checkbox" style="display: block; width: 30px; height: 30px; margin: 0">
        <label for="sms" style="display: block; width: 200px; height: 30px">at <span style="color: #ddd">night</span></label>
      </body>`,
      [["//checkbox:Text me at night", { contrast: 1.358, fontPx: 16, targetPx: 90 }]],
    ],
    [
      // The label names the button, not its own "Go", so the label's text is what is measured.
      "a control named by a label is measured by the label, though it has text of its own",
      `<label for="go" style="color: #ddd">Order archive</label>
      <button id="go" style="${BUTTON}">Go</button>`,
      [["//button:Order archive", { contrast: 1.358, fontPx: 16, targetPx: 40 }]],
    ],
    [
      "an element named by aria-labelledby is measured by its referent's text",
      `<p id="hint" style="color: #ddd">Order archive</p>
      <button aria-labelledby="hint" style="${BUTTON}">Open</button>`,
      [
        ["//paragraph:Order archive", { contrast: 1.358, fontPx: 16 }],
        ["//button:Order archive", { contrast: 1.358, fontPx: 16, targetPx: 40 }],
      ],
    ],
    [
      // A hidden referent names the button but is drawn nowhere, like an aria-label.
      "a name drawn nowhere leaves the element measured by the text it draws itself",
      `<span id="hidden" hidden>Order archive</span>
      <button aria-labelledby="hidden" style="${BUTTON}">Go</button>`,
      [["//button:Order archive", { contrast: 21, fontPx: 16, targetPx: 40 }]],
    ],
    [
      // Once a value is typed, the placeholder is gone and names the field from nowhere.
      "a field named by its placeholder is measured by the placeholder while it shows",
      `<style>input::placeholder { color: #ddd; font-size: 12px }</style>
      <input placeholder="Search your orders" style="${FIELD}">
      <input placeholder="Order number" value="A-1042" style="${FIELD}">`,
      [
        ["//textbox:Search your orders", { contrast: 1.358, fontPx: 12, targetPx: 40 }],
        ["//textbox:Order number", { targetPx: 40 }],
      ],
    ],
    [
      // Counted, a 0 px placeholder would give fontPx 0, which PageMeasurement rejects.
      "a placeholder at font-size 0 is drawn nowhere and gives no text metrics",
      `<style>input::placeholder { font-size: 0 }</style>
      <input placeholder="Search your orders" style="${FIELD}">`,
      [["//textbox:Search your orders", { targetPx: 40 }]],
    ],
    [
      // aria-hidden keeps an element out of the accessibility tree, not out of sight. A hidden source
      // is named whole, as Playwright names it, its hidden children included, so the faint one
      // counts. A click on the label still toggles the checkbox: its 200 × 30 box joins, 200 × 60.
      "an aria-hidden referent or label is named whole and still drawn, so it is measured there",
      `<span id="ref" aria-hidden="true"><b aria-hidden="true" style="color: #ddd">Order</b> archive</span>
      <button aria-labelledby="ref" style="${BUTTON}">Go</button>
      <label for="sms" aria-hidden="true"
        style="display: block; width: 200px; height: 30px; color: #ddd"><b>Text</b> me</label>
      <input id="sms" type="checkbox" style="display: block; width: 30px; height: 30px; margin: 0">`,
      [
        ["//button:Order archive", { contrast: 1.358, fontPx: 16, targetPx: 40 }],
        ["//checkbox:Text me", { contrast: 1.358, fontPx: 16, targetPx: 60 }],
      ],
    ],
    [
      "text aria-hidden inside an element is out of its name, and out of its metrics",
      `<a href="/next" style="display: inline-block; height: 40px; color: #000">Next
        <span aria-hidden="true" style="color: #ddd">→</span></a>`,
      [["//link:Next", { contrast: 21, fontPx: 16, targetPx: 40 }]],
    ],
    [
      // An aria-label is drawn nowhere, so the field is measured by the label a person reads.
      "a form control named by an aria-label is measured by its visible label",
      `<label for="email" style="display: block; width: 200px; height: 30px; color: #ddd">Email</label>
      <input id="email" aria-label="Email address" style="${FIELD}">`,
      [["//textbox:Email address", { contrast: 1.358, fontPx: 16, targetPx: 70 }]],
    ],
    [
      "text is measured in the colour it is painted: -webkit-text-fill-color over color",
      `<a href="/archive"
        style="display: inline-block; height: 40px; color: #000; -webkit-text-fill-color: #ddd">Order archive</a>`,
      [["//link:Order archive", { contrast: 1.358, fontPx: 16, targetPx: 40 }]],
    ],
    [
      // The icon's 0 px text still names the link, but draws nothing, so the label's text is read.
      "text at font-size 0 names an element but gives it no text metrics",
      `<a href="/close" style="display: inline-block; width: 120px; height: 40px; color: #000">
        <span style="display: inline-block; width: 20px; height: 20px; font-size: 0; color: #ccc">Icon</span>
        Visible label
      </a>`,
      [["//link:Icon Visible label", { contrast: 21, fontPx: 16, targetPx: 40 }]],
    ],
    [
      // The checkbox's own text style is 13.33 px black: a collector that read it would say so. A
      // click anywhere on the 300 × 50 label toggles the 40 × 36 checkbox (#117).
      "a label's text names its checkbox and gives its text metrics; its target is the label",
      `<label style="display: block; width: 300px; height: 50px; color: #767676; font-size: 20px">
        <input type="checkbox" style="width: 40px; height: 36px; margin: 0"> Leave with a neighbour
      </label>`,
      [["//checkbox:Leave with a neighbour", { contrast: 4.542, fontPx: 20, targetPx: 50 }]],
    ],
    [
      // A hidden label cannot be clicked. Counted, its empty box at the origin would make 340 px.
      "a hidden label for= does not widen its control's target",
      `<body style="margin: 0">
        <label for="opt" style="display: none">Hidden label</label>
        <input id="opt" type="checkbox" aria-label="Opt in"
          style="display: block; width: 40px; height: 40px; margin: 300px 0 0 300px">
      </body>`,
      [["//checkbox:Opt in", { targetPx: 40 }]],
    ],
    [
      // Label 200 × 30 at the top, checkbox 30 × 30 twenty px below it: one 200 × 80 rectangle.
      "a label for= apart from its control widens the target to one rectangle around both",
      `<body style="margin: 0">
        <label for="sms" style="display: block; width: 200px; height: 30px">Text me</label>
        <input id="sms" type="checkbox" style="display: block; width: 30px; height: 30px; margin: 20px 0 0">
      </body>`,
      [["//checkbox:Text me", { contrast: 21, fontPx: 16, targetPx: 80 }]],
    ],
  ])("%s", async (_claim, html, expected) => {
    const measurement = await measure(html);
    expect(measurement.elements.map((e) => [e.key, e.metrics])).toStrictEqual(expected);
  });
});

test("the page facts: title, url, viewport, the caller's isMobile, the scroll, viewport boxes", async () => {
  const html = `<title>Facts</title><body style="margin: 0">
    <p style="margin: 600px 0 2000px">Down the page</p>
  </body>`;
  const measurement = await withPage(async (page) => {
    await open(page, html);
    await page.evaluate(() => window.scrollTo(0, 500));
    return collect(page, { isMobile: true });
  });
  expect(measurement).toMatchObject({
    url: "http://collect.test/",
    title: "Facts",
    viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: true },
    scroll: { x: 0, y: 500 },
  });
  // 600 px down the page, with 500 px scrolled away: 100 px below the viewport's top.
  expect(measurement.elements.map((e) => [e.key, e.bbox.y])).toStrictEqual([
    ["//paragraph:Down the page", 100],
  ]);
});

test("pageSource runs a source that calls __name, as tsx's keepNames output does", async () => {
  const source = "function probe() { const f = __name(() => 7, 'f'); return f(); }";
  expect(await withPage((page) => page.evaluate(pageSource(source)))).toBe(7);
});

test("a document with no body, such as an SVG file, measures no elements", async () => {
  const measurement = await withPage(async (page) => {
    await page.route("http://collect.test/**", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: `<svg xmlns="http://www.w3.org/2000/svg"><text x="0" y="20">Order archive</text></svg>`,
      }),
    );
    await page.goto("http://collect.test/icon.svg");
    return collect(page);
  });
  expect(measurement.elements).toStrictEqual([]);
});

test("a page that is not on http(s) throws invalid_measurement", async () => {
  const error = await withPage((page) => collect(page)).catch((thrown: unknown) => thrown);
  expect(error).toBeInstanceOf(WayfordError);
  expect(error).toMatchObject({ code: "invalid_measurement" });
});
