/**
 * The measuring rules of `collect` (`docs/specs/2026-09-29-s1-02-metrics-collector.md`, Design),
 * one per test or table row, on small pages served through `page.route`. The origin is
 * `http://collect.test` because `PageMeasurement.url` must be http(s). Every expected contrast is
 * worked out from WCAG 2.2's definitions, never read back from `collect`.
 */
import { type MeasuredElement, type Metrics, WayfordError } from "@wayford/core";
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
      // The paragraph is padded, so having no text keeps it out, not the 1 px rule.
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
    {
      claim: "a text block with no text of its own is not measured; what it holds is",
      html: `<header><nav aria-label="Main"><ul><li><a href="/">Home</a></li></ul></nav></header>
        <main>
          <ul><li><h2>Deliveries</h2><p>Parcels on the way.</p><a href="/deliveries">Go to deliveries</a></li></ul>
          <p><button type="button">Close my account</button></p>
          <h2><a href="/blog/1">Post title</a></h2>
        </main>`,
      keys: [
        "banner/navigation:Main//link:Home",
        "main//heading:Deliveries",
        "main//paragraph:Parcels on the way.",
        "main//link:Go to deliveries",
        "main//button:Close my account",
        "main//link:Post title",
      ],
    },
    {
      claim: "a text block is named by its own text, a nested control leaving a space",
      html: `<p>Read the <a href="/terms">terms</a> before you start</p>
        <p>Pay<a href="/now">now</a>later</p>
        <h2>Orders <a href="/all">see all</a></h2>`,
      keys: [
        "//paragraph:Read the before you start",
        "//link:terms",
        "//paragraph:Pay later",
        "//link:now",
        "//heading:Orders",
        "//link:see all",
      ],
    },
    {
      // An `a` with no href has no role, and an sr-only link is not seen: neither is measured.
      claim: "a link that is not measured is not nested: its text stays the block's",
      html: `${SR_ONLY}
        <p>Read <a>this</a> now</p>
        <p>Read more<a href="/more" class="sr-only"> about deliveries</a></p>`,
      keys: ["//paragraph:Read this now", "//paragraph:Read more about deliveries"],
    },
    {
      claim: "a text block nested in another takes its text out of the outer one",
      html: `<ul><li>Intro <p>Details</p></li></ul>`,
      keys: ["//listitem:Intro", "//paragraph:Details"],
    },
    {
      claim: "a text block whose own text is drawn nowhere is not measured, whatever names it",
      html: `${SR_ONLY}
        <ul>
          <li><span class="sr-only">Current page:</span><a href="/">Home</a></li>
          <li><span style="font-size: 0">Icon</span><a href="/next">Next</a></li>
          <li aria-label="Account item"><a href="/account">Account</a></li>
          <li title="Tip"><a href="/tips">Tips</a></li>
        </ul>
        <span id="note">Orders note</span>
        <p aria-labelledby="note"><a href="/orders">Orders</a></p>`,
      keys: ["//link:Home", "//link:Next", "//link:Account", "//link:Tips", "//link:Orders"],
    },
    {
      // An image is not text of the block's own, so a heading that holds only one is not measured.
      // Text hidden for aria is out of its own text too. A separator is its own text, so a
      // breadcrumb item is measured by it, before the link it holds.
      claim: "the edges of own text: an image-only heading, aria-hidden text, a separator",
      html: `<h1><img alt="Quillmere" style="display: inline-block; width: 120px; height: 40px"></h1>
        <ul>
          <li><span aria-hidden="true">★</span><a href="/rate">Rate</a></li>
          <li><a href="/">Home</a> /</li>
        </ul>`,
      keys: ["//link:Rate", "//listitem:/", "//link:Home"],
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
      // #ddd on white is 1.358:1. The paragraph is named and measured by its own text (#124), so
      // the faint link is decided on its own and its text is not in the paragraph's name.
      "a text block reads only its own text: a faint link inside it is measured on the link",
      `<main><p>Looking for older orders?
        <a href="/archive" style="display: inline-block; height: 20px; color: #ddd">Order archive</a>
      </p></main>`,
      [
        ["main//paragraph:Looking for older orders?", { contrast: 21, fontPx: 16 }],
        ["main//link:Order archive", { contrast: 1.358, fontPx: 16, targetPx: 20 }],
      ],
    ],
    [
      // Own text still counts whole: a faint word of the paragraph's own is its worst run.
      "a text block reads the worst of its own runs, a faint word included, a nested link not",
      `<p>Need <em style="color: #ddd">help</em>?
        <a href="/help" style="display: inline-block; height: 20px; color: #000; font-size: 12px">Contact us</a>
      </p>`,
      [
        ["//paragraph:Need help?", { contrast: 1.358, fontPx: 16 }],
        ["//link:Contact us", { contrast: 21, fontPx: 12, targetPx: 20 }],
      ],
    ],
    [
      // An aria-label is drawn nowhere, so the paragraph is measured by the text it draws itself.
      "a text block named by an aria-label is measured by its own text, not a nested link's",
      `<p aria-label="Note">Hello
        <a href="/faint" style="display: inline-block; height: 20px; color: #ddd">faint</a>
      </p>`,
      [
        ["//paragraph:Note", { contrast: 21, fontPx: 16 }],
        ["//link:faint", { contrast: 1.358, fontPx: 16, targetPx: 20 }],
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

describe("boxes of text (#219)", () => {
  test.each<{ claim: string; html: string; keys: string[] }>([
    {
      // filmweb.pl's cast list draws each character's name as a bare span, in a flex row.
      claim: "a bare span is its div's box, and a span its flex parent blockifies is a box itself",
      html: `<meta charset="utf-8"><div><span>Ignacy Rzecki</span></div>
        <div style="display: flex"><span>Stanisław Wokulski</span><span>Izabela Łęcka</span></div>`,
      keys: ["//text:Ignacy Rzecki", "//text:Stanisław Wokulski", "//text:Izabela Łęcka"],
    },
    {
      claim: "text run across inline elements is one box, read in the page's order",
      html: `<meta charset="utf-8"><div>Rate: <strong>125–145 PLN</strong> per hour</div>`,
      keys: ["//text:Rate: 125–145 PLN per hour"],
    },
    {
      claim: "a box's own text leaves out the boxes, text blocks and controls inside it",
      html: `<div>Order 1042 <div>Shipped</div><p>Arrives Friday</p><a href="/track">Track</a></div>`,
      keys: ["//text:Order 1042", "//text:Shipped", "//paragraph:Arrives Friday", "//link:Track"],
    },
    {
      claim: "text inside a text block or a control stays theirs, as before",
      html: `<p>Total <span style="display: inline-block">125 PLN</span></p>
        <a href="/offer"><div>Senior engineer</div><div>Remote</div></a>
        <ul><li><div>Card text</div></li></ul>`,
      keys: ["//paragraph:Total 125 PLN", "//link:Senior engineer Remote", "//listitem:Card text"],
    },
    {
      // The target app's delivery preferences: a wrapping label in a plain div (#117).
      claim: "a control's label and aria-labelledby referent stay the control's, in no box",
      html: `<div><label><input type="checkbox"> Leave with a neighbour</label></div>
        <div><span id="q">Search the shop</span> <input aria-labelledby="q"></div>`,
      keys: ["//checkbox:Leave with a neighbour", "//textbox:Search the shop"],
    },
    {
      claim: "a box that is a landmark ends its path with itself",
      html: `<main><div>Inside main</div></main><footer>A fictional shop.</footer>`,
      keys: ["main//text:Inside main", "contentinfo//text:A fictional shop."],
    },
    {
      claim: "table cells and a description list's terms and details are boxes",
      html: `<table><tr><td>Rate</td><td>125 PLN</td></tr></table>
        <dl><dt>Board</dt><dd>Jane Doe</dd></dl>`,
      keys: ["//text:Rate", "//text:125 PLN", "//text:Board", "//text:Jane Doe"],
    },
    {
      claim: "a box with no letter or digit, hidden text and content drawn nowhere make no box",
      html: `${SR_ONLY}
        <div><a href="/a">Terms</a> | <a href="/b">Privacy</a></div>
        <div style="display: none">Display none</div>
        <div class="sr-only">Screen readers only</div>
        <div aria-hidden="true">Decoration</div>
        <div><progress value="70" max="100">70 percent</progress></div>
        <div>Upload <meter value="0.7">70 percent</meter></div>`,
      keys: ["//link:Terms", "//link:Privacy", "//text:Upload"],
    },
    {
      // A custom checkbox: the input hidden, the label drawn, so the label names nothing measured.
      claim: "the label of a control nobody sees is read where it is drawn",
      html: `<div><label><input type="checkbox" style="position: absolute; opacity: 0">
        Accept cookies</label></div>
        <div><label for="hidden">Remember me</label><input id="hidden" style="display: none"></div>`,
      keys: ["//text:Accept cookies", "//text:Remember me"],
    },
  ])("$claim", async ({ html, keys }) => {
    const measurement = await measure(html);
    expect(measurement.elements.map((e) => e.key)).toStrictEqual(keys);
  });

  test("a box of text is a text block with the role text, measured by every run that draws it", async () => {
    // #767676 on white is 4.5422:1, truncated to 4.542; black on white is 21:1. Each run is the
    // worse on one axis, so the box reads both: the div's grey and the strong's 12 px.
    const measurement = await measure(
      `<div style="color: #767676; font-size: 14px">Rate: <strong
        style="color: #000; font-size: 12px">125 PLN</strong></div>`,
    );
    expect(measurement.elements).toHaveLength(1);
    const [box] = measurement.elements;
    expect(box?.key).toBe("//text:Rate: 125 PLN");
    expect(box?.kind).toBe("text");
    expect(box?.role).toBe("text");
    expect(box?.metrics).toStrictEqual({ contrast: 4.542, fontPx: 12 });
  });
});

describe("a control drawn in parts (#124)", () => {
  /** Each element's key, and its parts when it carries the field at all. */
  const partsOf = (measurement: { elements: MeasuredElement[] }) =>
    measurement.elements.map((e) => (Object.hasOwn(e, "parts") ? [e.key, e.parts] : [e.key]));

  test("a card link whose title and description are two runs is measured part by part", async () => {
    // The cshark.com mega-menu card link, cut down: a 20 px black title and a 14 px #767676
    // description (4.542:1 on white) in one link. The link keeps the worst of the two, as before.
    // Each part carries the text its own element draws, and that text's metrics. The paragraph
    // inside is a text block of its own, measured whole as before.
    const measurement = await measure(`<main>
      <a href="/careers/job-offers/"
        style="display: block; width: 300px; height: 80px; color: #000; font-size: 20px">Job Offers
        <p style="margin: 0; color: #767676; font-size: 14px">Dive into our job openings</p></a>
    </main>`);
    const parts = [
      { text: "Job Offers", metrics: { contrast: 21, fontPx: 20 } },
      { text: "Dive into our job openings", metrics: { contrast: 4.542, fontPx: 14 } },
    ];
    expect(measurement.elements.map((e) => [e.key, e.metrics])).toStrictEqual([
      [
        "main//link:Job Offers Dive into our job openings",
        { contrast: 4.542, fontPx: 14, targetPx: 80 },
      ],
      ["main//paragraph:Dive into our job openings", { contrast: 4.542, fontPx: 14 }],
    ]);
    expect(partsOf(measurement)).toStrictEqual([
      ["main//link:Job Offers Dive into our job openings", parts],
      ["main//paragraph:Dive into our job openings"],
    ]);
  });

  test("a part reads only the text its element draws itself, and a run on an unknown background has no contrast", async () => {
    // The button draws "Save" itself and the span "draft", so the button's part leaves the
    // span's word out. The span stands on a gradient: its part has no contrast, and the button's
    // contrast is the worst of the parts that have one.
    const measurement = await measure(`<button style="width: 200px; height: 40px; padding: 0;
      border: 0; background: #fff; color: #000; font-size: 16px">Save
      <span style="background-image: linear-gradient(#fff, #eee); font-size: 12px">draft</span>
      </button>`);
    expect(measurement.elements.map((e) => [e.key, e.metrics, e.parts])).toStrictEqual([
      [
        "//button:Save draft",
        { contrast: 21, fontPx: 12, targetPx: 40 },
        [
          { text: "Save", metrics: { contrast: 21, fontPx: 16 } },
          { text: "draft", metrics: { fontPx: 12 } },
        ],
      ],
    ]);
  });

  test("a control whose parts do not spell its name is measured whole, by the worst of its text", async () => {
    // Joined, these parts would read words out of order, split a word in two, or keep text
    // nobody sees: the Actor would read a name the page does not draw (PR #193's review).
    const measurement = await measure(`<style>a { display: block; font-size: 20px } small,
      .small { font-size: 10px }</style>
      <a href="/read">Read <b>more</b> about pricing <small>(PDF, 2 MB)</small></a>
      <a href="/role">Senior <em>Perf</em>ormance Test Engineer <span class="small">B2B</span></a>
      <a href="/split"><span class="small">Perf</span>ormance</a>
      <a href="/zero">&#8203;<span class="small">Order archive</span></a>
      <a href="/soft">&shy;<span class="small">Settings</span></a>
      <a href="/filler"><span>&#x3164;</span> <span class="small">Home</span></a>
      <a href="/braille"><span>&#x2800;</span> <span class="small">Help</span></a>
      <a href="/size">Size <b class="small">S</b> <i>M</i> S M</a>`);
    expect(measurement.elements.map((e) => [e.name, e.metrics.fontPx, e.parts])).toStrictEqual([
      ["Read more about pricing (PDF, 2 MB)", 10, undefined],
      ["Senior Performance Test Engineer B2B", 10, undefined],
      ["Performance", 10, undefined],
      ["​Order archive", 10, undefined],
      ["­Settings", 10, undefined],
      // A blank glyph that is neither whitespace nor a format character draws nothing either.
      ["ㅤ Home", 10, undefined],
      ["⠀ Help", 10, undefined],
      // Spelled by coincidence: the link's own text, "Size" and "S M", is two stretches.
      ["Size S M S M", 10, undefined],
    ]);
  });

  test("fallback content a supported element never renders draws nothing and is no part", async () => {
    // The video's fallback text is never on the screen, so it neither keeps the link nor names it
    // to a persona who cannot read the heading (found by the adversarial check of PR #193).
    const measurement = await measure(`<a href="/watch" style="display: block; width: 320px">
      <video width="320" height="180" muted>Your browser does not support the video tag.</video>
      <h3 style="margin: 0; font-size: 14px">How to return an order</h3></a>`);
    const link = measurement.elements.find((e) => e.role === "link");
    expect(link?.parts).toBeUndefined();
    expect(link?.metrics.fontPx).toBe(14);
  });

  test.each<[claim: string, html: string, keys: string[]]>([
    [
      // Drawn by one element, though not by the link itself: sr-only and 0 px text draw nothing.
      "a control drawn by one element has no parts",
      `${SR_ONLY}
      <a href="/one"><span>One run</span></a>
      <a href="/more">Read more<span class="sr-only"> about deliveries</span></a>
      <a href="/close"><span style="font-size: 0">Icon</span>Close</a>`,
      ["//link:One run", "//link:Read more about deliveries", "//link:IconClose"],
    ],
    [
      "a text block never has parts, whatever draws its own text",
      `<p>Read <em style="font-size: 12px">this</em> now</p>
      <ul><li>Intro <strong>bold</strong> end</li></ul>`,
      ["//paragraph:Read this now", "//listitem:Intro bold end"],
    ],
    [
      // Only a name taken from the control's own content is measured in parts. One read from a
      // label, an aria-labelledby referent or a placeholder is measured whole where it is drawn.
      "a control named by a label, a referent or a placeholder has no parts",
      `<style>input::placeholder { font-size: 12px }</style>
      <label for="sms" style="display: block; width: 200px; height: 30px">Text <b>me</b></label>
      <input id="sms" type="checkbox" style="display: block; width: 30px; height: 30px; margin: 0">
      <p id="hint">Order <em>archive</em></p>
      <button aria-labelledby="hint" style="width: 120px; height: 40px">Open <b>it</b></button>
      <input placeholder="Search" style="display: block; width: 200px; height: 40px">`,
      [
        "//checkbox:Text me",
        "//paragraph:Order archive",
        "//button:Order archive",
        "//textbox:Search",
      ],
    ],
  ])("%s", async (_claim, html, keys) => {
    expect(partsOf(await measure(html))).toStrictEqual(keys.map((key) => [key]));
  });
});

describe("what a control's markup says it opens, for stage 4", () => {
  // Whatever an element carries beyond its key, kind, role, name, box and metrics: `{}` when it
  // carries neither fact, so a field written as `undefined` fails too.
  const facts = ({ key, kind, role, name, bbox, metrics, ...rest }: MeasuredElement) => [key, rest];

  test.each<[claim: string, html: string, measured: [key: string, facts: object][]]>([
    [
      // ARIA 1.2: `true` is `menu`. An empty value, `false` or an unknown one opens nothing.
      "aria-haspopup is trimmed and lowercased, true is menu, anything else is left out",
      `<button aria-haspopup="true">True</button>
      <button aria-haspopup=" MENU ">Upper</button>
      <button aria-haspopup="dialog">Dialog</button>
      <button aria-haspopup="false">False</button>
      <button aria-haspopup="">Empty</button>
      <button aria-haspopup="bogus">Bogus</button>`,
      [
        ["//button:True", { hasPopup: "menu" }],
        ["//button:Upper", { hasPopup: "menu" }],
        ["//button:Dialog", { hasPopup: "dialog" }],
        ["//button:False", {}],
        ["//button:Empty", {}],
        ["//button:Bogus", {}],
      ],
    ],
    [
      // The phone toggle's shape: the nav it opens is display: none until it is opened.
      "aria-controls gives the role of the element it names, hidden or not",
      `<header>
        <button type="button" aria-controls="site-nav">Menu</button>
        <nav id="site-nav" aria-label="Main" style="display: none"><a href="/">Home</a></nav>
      </header>
      <button type="button" aria-controls="missing site-nav">Second</button>`,
      [
        ["banner//button:Menu", { controls: "navigation" }],
        ["//button:Second", { controls: "navigation" }],
      ],
    ],
    [
      // `doc-toc` is no one lowercase word, so it is left out rather than failing the measurement.
      "aria-controls naming no element, one with no role or one with a role not a word is left out",
      `<button type="button" aria-controls="nowhere">Missing</button>
      <button type="button" aria-controls="plain">Plain</button>
      <div id="plain">Plain panel</div>
      <button type="button" aria-controls="toc">Contents</button>
      <div id="toc" role="doc-toc">Table of contents</div>`,
      [
        ["//button:Missing", {}],
        ["//button:Plain", {}],
        // The panels' text is measured as boxes of text (#219), which never carry either.
        ["//text:Plain panel", {}],
        ["//button:Contents", {}],
        ["//text:Table of contents", {}],
      ],
    ],
    [
      // The kebab's shape on the target app's `/account`.
      "a menu button carries both",
      `<button type="button" aria-haspopup="menu" aria-controls="more-menu">More options</button>
      <ul id="more-menu" role="menu" hidden><li role="menuitem">Past orders</li></ul>`,
      [["//button:More options", { hasPopup: "menu", controls: "menu" }]],
    ],
    [
      "a text block never carries either",
      `<nav id="site-nav" aria-label="Main"><a href="/">Home</a></nav>
      <p aria-haspopup="menu" aria-controls="site-nav">Paragraph</p>
      <h2 aria-haspopup="true" aria-controls="site-nav">Heading</h2>`,
      [
        ["navigation:Main//link:Home", {}],
        ["//paragraph:Paragraph", {}],
        ["//heading:Heading", {}],
      ],
    ],
  ])("%s", async (_claim, html, expected) => {
    const measurement = await measure(html);
    expect(measurement.elements.map(facts)).toStrictEqual(expected);
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

describe("what the page paints over (#229)", () => {
  /** The keys of the measured elements a layer the page paints covers, in measurement order. */
  const coveredKeys = (measurement: { elements: MeasuredElement[] }) =>
    measurement.elements.filter((e) => e.covered).map((e) => e.key);

  /** Absolutely placed, 300 × 40 px, one row of 50 px per `row`. */
  const at = (row: number) =>
    `position: absolute; top: ${row * 50}px; left: 0; width: 300px; height: 40px; margin: 0`;

  test.each<{ claim: string; html: string; scroll?: number; keys: string[] }>([
    {
      // filmweb.pl's Didomi notice, cut down: a dimmed backdrop over the page, a dialog above it.
      claim: "a backdrop covers the page under it, never the dialog above it or a box off screen",
      html: `<main><a href="/films">Films</a><p>Behind the notice</p><div>Plain box text</div>
          <p style="margin-top: 2000px">Far below</p></main>
        <div style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5)"></div>
        <div role="dialog" aria-label="Cookies"
          style="position: fixed; top: 300px; left: 300px; width: 400px; background: #fff">
          <p>We use cookies</p><button>Accept</button></div>`,
      keys: ["main//link:Films", "main//paragraph:Behind the notice", "main//text:Plain box text"],
    },
    {
      // filmweb.pl's Didomi wall as measured on 2026-10-09: the backdrop is the `::before` of a
      // host of no height, a white wash at 0.8 over the whole viewport.
      claim: "a backdrop drawn as a pseudo-element of a box of no size covers the page",
      html: `<style>#host::before { content: ""; position: fixed; inset: 0;
          background: rgba(255, 255, 255, 0.8) }</style>
        <main><a href="/films">Films</a></main>
        <div id="host"><div role="dialog" aria-label="Cookies" style="position: fixed; top: 300px;
          left: 300px; width: 400px; background: #fff"><button>Accept</button></div></div>`,
      keys: ["main//link:Films"],
    },
    {
      claim: "a cookie bar covers only what lies under the point a click lands on",
      html: `<p>Above the bar</p>
        <p style="position: absolute; top: 680px; margin: 0">Under the bar</p>
        <div style="position: fixed; bottom: 0; left: 0; right: 0; height: 80px; background: #222">
          <button>OK</button></div>`,
      keys: ["//paragraph:Under the bar"],
    },
    {
      // Scrolled 60 px: First is under the header; Second's centre is below it, though its top is
      // not. One point is read, so a partial cover is not.
      claim: "a sticky header covers what is scrolled under it",
      html: `<body style="margin: 0"><header style="position: sticky; top: 0; height: 60px;
          background: #fff"><a href="/">Home</a></header>
        <main><p style="margin: 0; height: 50px">First</p><p style="margin: 0; height: 50px">Second</p>
          <div style="height: 2000px"></div></main></body>`,
      scroll: 60,
      keys: ["main//paragraph:First"],
    },
    {
      // What V3 overstates (RULES, "Covered (V3)"): the box's centre is under the header, its
      // text below it. Pinned, so a fix shows up here.
      claim: "a partial cover over the point read cuts the whole element, its clear text too",
      html: `<p style="position: absolute; top: 0; margin: 0; padding-top: 70px; height: 30px">Tall</p>
        <div style="position: fixed; top: 0; left: 0; right: 0; height: 60px; background: #fff"></div>`,
      keys: ["//paragraph:Tall"],
    },
    {
      claim: "an open menu covers the page under it, never its own entries",
      html: `<p style="${at(1)}">Under the menu</p>
        <div style="position: absolute; top: 40px; left: 0; width: 320px; height: 120px;
          background: #fff"><a href="/edit">Edit</a></div>`,
      keys: ["//paragraph:Under the menu"],
    },
    {
      // A floating label drawn over its field activates the field, so it is the field's own.
      claim: "a control's icon, and a label drawn over it, are the control's own",
      html: `<a href="/search" aria-label="Search" style="display: inline-block; width: 40px;
          height: 40px"><svg width="40" height="40"><rect width="40" height="40" /></svg></a>
        <input id="email" style="${at(2)}">
        <label for="email" style="${at(2)}; background: #fff">Email</label>`,
      keys: [],
    },
    {
      // A link that wraps: its box's centre falls between its two lines, on the tinted paragraph
      // around it, which is no cover.
      claim: "a layer around the element is its own, as a wrapped link's paragraph is",
      html: `<p style="width: 300px; background: #eef; font: 16px/20px monospace">${"a".repeat(25)}
        <a href="/x">bbbb cccc</a> ${"d".repeat(20)}</p>`,
      keys: [],
    },
    {
      // Bootstrap's stretched links, one a filled button, and the transparent layer a menu
      // spreads behind itself to close on a click outside: a click lands on them, but the eye
      // reads straight through. The button's fill is in its own box, not over the card's text, and
      // so is an icon dot drawn in the flow.
      claim: "a layer that paints nothing over the point covers nothing, though it takes the click",
      html: `<style>.stretched::after { content: ""; position: absolute; inset: 0 }
          .dotted::before { content: ""; display: inline-block; width: 8px; height: 8px;
          background: red }</style>
        <div style="position: relative; width: 300px"><h2>Card title</h2><p>Card text</p>
          <a class="stretched" href="/card">Open</a></div>
        <div style="position: relative; width: 300px"><h2>Offer</h2><p>Offer text</p>
          <a class="stretched" href="/offer" style="background: #0d6efd; color: #fff">Go</a></div>
        <div style="position: relative; width: 300px"><h2>News</h2><p>News text</p>
          <a class="stretched dotted" href="/news">Read</a></div>
        <div style="position: fixed; inset: 0"></div>`,
      keys: [],
    },
    {
      claim:
        "a layer paints by its background, its backdrop filter, what it is, or its open shadow root",
      html: `<p style="${at(0)}">Tinted</p><div style="${at(0)}; background: oklch(0.98 0 0 / 0.5)"></div>
        <p style="${at(1)}">Gradient</p>
        <div style="${at(1)}; background-image: linear-gradient(#fff0, #fff)"></div>
        <p style="${at(2)}">Frosted</p><div style="${at(2)}; backdrop-filter: blur(4px)"></div>
        <p style="${at(3)}">Canvas</p><canvas style="${at(3)}"></canvas>
        <p style="${at(4)}">Frame</p><iframe style="${at(4)}; border: 0"></iframe>
        <p style="${at(5)}">Shape</p><svg style="${at(5)}"><rect width="300" height="40" /></svg>
        <p style="${at(6)}">Shadow</p><div id="host" style="${at(6)}"></div>
        <script>document.getElementById("host").attachShadow({ mode: "open" }).innerHTML =
          '<div style="height: 40px; background: #fff"></div>';</script>
        <p style="${at(7)}">Faded out</p><div style="${at(7)}; background: #fff; opacity: 0"></div>
        <p style="${at(8)}">Clear</p><div style="${at(8)}; background: rgba(0, 0, 0, 0)"></div>
        <style>.pseudo::before { content: ""; position: absolute; inset: 0; background: #fff }</style>
        <p style="${at(9)}">Pseudo in its box</p><div class="pseudo" style="${at(9)}"></div>
        <p style="${at(10)}">Empty svg</p><svg style="${at(10)}"></svg>
        <p style="${at(11)}">Clear shape</p><svg style="${at(11)}"><rect width="300" height="40"
          fill="none" pointer-events="all" /></svg>
        <style>.bare { position: absolute; top: 600px; left: 0; width: 0; height: 0 }
          .bare::after { content: ""; position: absolute; width: 300px; height: 40px }
          .bare::before { position: absolute; width: 300px; height: 40px; background: #fff }</style>
        <p style="${at(12)}">No content</p><div class="bare"></div>`,
      keys: [
        "//paragraph:Tinted",
        "//paragraph:Gradient",
        "//paragraph:Frosted",
        "//paragraph:Canvas",
        "//paragraph:Frame",
        "//paragraph:Shape",
        "//paragraph:Shadow",
      ],
    },
    {
      // Its box's centre is past the fold, where nothing is hit. The centre of its part on
      // screen, where the Actor clicks (`actionPoint`), is under the strip.
      claim: "the point read is the centre of the box's part on screen, where the Actor clicks",
      html: `<p style="position: absolute; top: 640px; height: 200px; margin: 0">Straddling</p>
        <div style="position: fixed; top: 670px; left: 0; right: 0; height: 20px;
          background: #fff"></div>`,
      keys: ["//paragraph:Straddling"],
    },
    {
      claim: "an element that takes no clicks is not read as covered: nothing places it",
      html: `<p style="${at(0)}; pointer-events: none">No clicks</p>
        <div style="${at(0)}; background: #fff"></div>`,
      keys: [],
    },
  ])("$claim", async ({ html, scroll, keys }) => {
    const measurement = await withPage(async (page) => {
      await open(page, html);
      if (scroll !== undefined) await page.evaluate((y) => window.scrollTo(0, y), scroll);
      return collect(page);
    });
    expect(measurement.elements.length, "elements measured").toBeGreaterThan(0);
    expect(coveredKeys(measurement)).toStrictEqual(keys);
  });

  test.each([
    { backdrop: "", keys: ["main//link:Films"] },
    // The page behind a modal dialog is inert, but a clear backdrop hides none of it from sight.
    { backdrop: "dialog::backdrop { background: transparent }", keys: [] },
  ])(
    "a modal dialog covers the page by its backdrop's paint, never its own controls: $backdrop",
    async ({ backdrop, keys }) => {
      // At a point on the page, the browser hits the dialog, through its backdrop: the dialog's own
      // white box is not what is drawn there.
      const measurement = await withPage(async (page) => {
        await open(
          page,
          `<style>${backdrop}</style><main><a href="/films">Films</a></main>
        <dialog><p>Sign in to continue</p><button>Close</button></dialog>
        <script>document.querySelector("dialog").showModal();</script>`,
        );
        return collect(page);
      });
      expect(measurement.elements.map((e) => e.key)).toContain("//button:Close");
      expect(coveredKeys(measurement)).toStrictEqual(keys);
    },
  );
});
