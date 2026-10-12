/**
 * The Report's hints in a real browser (#240, #264), for what a static render cannot show: each of
 * the eight opens on hover and on keyboard focus, inside the viewport; a click and a tap open one
 * too. A seed cell shows its words on a hover that rests on it and on focus, and a tap follows its
 * link. A hint stays open while the pointer is on it or while its trigger has focus, and closes on
 * Esc (WCAG 2.2, 1.4.13) and when another opens; the findings headers hold their words whole. The
 * hard goal's report is served from core's fixtures, as the self-check serves it.
 *
 * In `scripts/` because it starts the app with `startWebApp`, which sits beside the self-check.
 */
import { type Browser, type BrowserContextOptions, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, onTestFinished, test, vi } from "vitest";
import { SELF_CHECK_SCREENS, startWebApp } from "./self-check.js";

// Starting Vite, its first transform of the app and launching Chromium take longer than vitest's
// 5 s hook default.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

/**
 * The hard goal's eight hints, by their button's name, in the order Tab reaches them: the two
 * number headers', Kai's why line's, the "—" of Vera's median, Vera's why line's (#264), then the
 * three findings headers'. Each is the only button of its name on the page.
 */
const LABELS = [
  "Explain route open",
  "Explain got through",
  "Explain Kai's counts",
  "Explain the missing number",
  "Explain Vera's counts",
  "Explain Measurement",
  "Explain Deterministic",
  "Explain Hypothesis",
] as const;

const REPORT = SELF_CHECK_SCREENS.find((screen) => screen.name === "report");

let browser: Browser;
let app: Awaited<ReturnType<typeof startWebApp>>;

beforeAll(async () => {
  [browser, app] = await Promise.all([chromium.launch(), startWebApp()]);
});

afterAll(async () => {
  await browser?.close();
  await app?.close();
});

/**
 * The hard goal's Report in a fresh context, 1280 × 720 unless `viewport` says otherwise, its
 * report answered as the self-check answers it.
 */
async function openReport({
  context: options = {},
  search = "",
  viewport = { width: 1280, height: 720 },
}: {
  context?: BrowserContextOptions;
  search?: string;
  viewport?: { width: number; height: number };
} = {}): Promise<Page> {
  if (REPORT === undefined) throw new Error("no report entry in the self-check");
  const context = await browser.newContext({ viewport, ...options });
  onTestFinished(() => context.close());
  const page = await context.newPage();
  await page.route(/^https?:\/\/[^/]+\/api\//, (route) => {
    const path = new URL(route.request().url()).pathname.slice("/api".length);
    const answer = REPORT.responses[path];
    return answer === undefined
      ? route.fulfill({ status: 404, json: { error: "not in this test" } })
      : route.fulfill({ json: answer });
  });
  await page.goto(`${app.origin}${REPORT.path}${search}`);
  await page.getByRole("heading", { name: /^Measurement/ }).waitFor();
  return page;
}

/** The hint button named `label`. */
function trigger(page: Page, label: string) {
  return page.getByRole("button", { name: label, exact: true });
}

/** The open hints' texts. */
function openHints(page: Page): Promise<string[]> {
  return page.getByRole("tooltip").allInnerTexts();
}

/** The words that describe `label`'s button, open or not: its hint. */
async function described(page: Page, label: string): Promise<string> {
  const id = await trigger(page, label).getAttribute("aria-describedby");
  if (id === null) throw new Error(`${label} is described by nothing`);
  return page.evaluate((id) => document.getElementById(id)?.textContent ?? "", id);
}

/** The name of the element that has focus, or its tag when it has none. */
function focused(page: Page): Promise<string | undefined> {
  return page.evaluate(
    () => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName,
  );
}

/** The centre of `label`'s button. */
async function centreOf(page: Page, label: string): Promise<{ x: number; y: number }> {
  const box = await trigger(page, label).boundingBox();
  if (box === null) throw new Error(`no box for ${label}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Whether the open hint lies wholly inside the viewport. */
async function hintInView(page: Page): Promise<boolean> {
  const box = await page.getByRole("tooltip").boundingBox();
  const viewport = page.viewportSize();
  if (box === null || viewport === null) return false;
  return (
    box.x >= 0 &&
    box.y >= 0 &&
    box.x + box.width <= viewport.width &&
    box.y + box.height <= viewport.height
  );
}

/** A spot in the page's left gutter, on nothing that takes the pointer. */
const AWAY = { x: 8, y: 400 };

test("each hint opens on hover, inside the viewport, stays while the pointer is on it, and closes when it leaves", async () => {
  const page = await openReport();
  for (const label of LABELS) {
    await trigger(page, label).scrollIntoViewIfNeeded();
    await page.mouse.move(AWAY.x, AWAY.y);
    const { x, y } = await centreOf(page, label);
    await page.mouse.move(x, y, { steps: 8 });
    await expect
      .poll(() => openHints(page), { message: label })
      .toEqual([await described(page, label)]);
    expect(await hintInView(page), label).toBe(true);
    // Onto the bubble, across the gap: it stays.
    const box = await page.getByRole("tooltip").boundingBox();
    if (box === null) throw new Error(`no bubble for ${label}`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
    await page.waitForTimeout(300);
    expect(await openHints(page), label).toHaveLength(1);
    await page.mouse.move(AWAY.x, AWAY.y, { steps: 8 });
    await expect.poll(() => openHints(page), { message: label }).toEqual([]);
  }
});

test("Esc closes a hovered hint without moving the pointer or focus, and a small move does not reopen it", async () => {
  const page = await openReport();
  const { x, y } = await centreOf(page, "Explain Measurement");
  await page.mouse.move(AWAY.x, AWAY.y);
  await page.mouse.move(x, y, { steps: 8 });
  await expect.poll(() => openHints(page)).toHaveLength(1);
  expect(await focused(page)).toBe("BODY");
  await page.keyboard.press("Escape");
  await expect.poll(() => openHints(page)).toEqual([]);
  await page.mouse.move(x + 4, y, { steps: 2 });
  await page.waitForTimeout(300);
  expect(await openHints(page)).toEqual([]);
});

test("Tab opens each hint in turn; Enter and Space keep it; Esc closes it with focus kept; Tab away closes it", async () => {
  const page = await openReport();
  for (const label of LABELS) {
    for (let presses = 0; (await focused(page)) !== label; presses++) {
      if (presses === 60) throw new Error(`Tab never reached ${label}`);
      await page.keyboard.press("Tab");
    }
    await expect
      .poll(() => openHints(page), { message: label })
      .toEqual([await described(page, label)]);
  }
  // Back on the first: Enter and Space are clicks on a hint focus already opened, and keep it.
  await trigger(page, LABELS[0]).focus();
  await expect.poll(() => openHints(page)).toHaveLength(1);
  for (const key of ["Enter", "Space"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(200);
    expect(await openHints(page), key).toEqual([await described(page, LABELS[0])]);
  }
  await page.keyboard.press("Escape");
  await expect.poll(() => openHints(page)).toEqual([]);
  expect(await focused(page)).toBe(LABELS[0]);
  // Enter opens it again after Esc, and Tab to the next hint moves it there.
  await page.keyboard.press("Enter");
  await expect.poll(() => openHints(page)).toHaveLength(1);
  await page.keyboard.press("Tab");
  expect(await focused(page)).toBe(LABELS[1]);
  await expect.poll(() => openHints(page)).toEqual([await described(page, LABELS[1])]);
  // Tab past the header's last hint, to a link with none: its hint closes.
  await page.keyboard.press("Tab");
  await expect.poll(() => openHints(page)).toEqual([]);
});

test("a hint focus opened stays open through the scroll its Tab makes, and through a wheel scroll", async () => {
  // At 400 px high the findings start below the fold, so the Tab that reaches the hint scrolls.
  const page = await openReport({ viewport: { width: 1280, height: 400 } });
  await page.evaluate((label) => {
    const focusable = [
      ...document.querySelectorAll<HTMLElement>("a[href], button, [tabindex]:not([tabindex='-1'])"),
    ];
    const at = focusable.findIndex((element) => element.getAttribute("aria-label") === label);
    focusable[at - 1]?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, "Explain Measurement");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.keyboard.press("Tab");
  expect(await focused(page)).toBe("Explain Measurement");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  expect(await openHints(page)).toEqual([await described(page, "Explain Measurement")]);
  await page.mouse.move(AWAY.x, AWAY.y);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(300);
  expect(await openHints(page)).toHaveLength(1);
  await page.keyboard.press("Escape");
  await expect.poll(() => openHints(page)).toEqual([]);
  expect(await focused(page)).toBe("Explain Measurement");
});

/**
 * Taps on the Measurement hint: one opens it and it stays after the lift, a tap elsewhere closes
 * it, a second tap on it closes it and a third opens it, and a tap on another hint leaves only
 * that one open.
 */
async function tapThrough(page: Page) {
  const measurement = trigger(page, "Explain Measurement");
  await measurement.tap();
  await expect.poll(() => openHints(page)).toEqual([await described(page, "Explain Measurement")]);
  await page.waitForTimeout(800);
  expect(await openHints(page)).toHaveLength(1);
  await page.getByText("the page, by axe", { exact: true }).tap();
  await expect.poll(() => openHints(page)).toEqual([]);
  await measurement.tap();
  await expect.poll(() => openHints(page)).toHaveLength(1);
  await measurement.tap();
  await expect.poll(() => openHints(page)).toEqual([]);
  await measurement.tap();
  await expect.poll(() => openHints(page)).toHaveLength(1);
  await trigger(page, "Explain Hypothesis").tap();
  await expect.poll(() => openHints(page)).toEqual([await described(page, "Explain Hypothesis")]);
}

test("a tap opens a hint and a second closes it, where a tap focuses the button, as in Chromium", async () => {
  await tapThrough(await openReport({ context: { hasTouch: true } }));
});

test("the same taps where a tap leaves focus where it was, as in WebKit", async () => {
  const page = await openReport({ context: { hasTouch: true } });
  // A touch press whose default is prevented sends no mouse events, so the button takes no focus.
  await page.evaluate(() => {
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (event.pointerType === "touch") event.preventDefault();
      },
      { capture: true },
    );
  });
  await tapThrough(page);
  expect(await focused(page)).toBe("BODY");
});

test.each([
  ["no persona picked", 1280, ""],
  ["Kai picked", 1280, "?persona=prof_kai"],
  ["Kai picked, at 1024 px", 1024, "?persona=prof_kai"],
])(
  "with %s, no name, count or words in a findings header break, and at 1280 px it holds one line",
  async (_, width, search) => {
    const page = await openReport({ search, viewport: { width, height: 720 } });
    const headings = await page.locator("section > header > h2").evaluateAll((elements) =>
      elements.map((heading) => {
        const linesOf = (element: Element, line: number) =>
          element.getBoundingClientRect().height / line;
        const lineOf = (element: Element) =>
          Number.parseFloat(getComputedStyle(element).lineHeight);
        const name = heading.querySelector("span.lead");
        return {
          lines: name === null ? 0 : linesOf(heading, lineOf(name)),
          parts: [...heading.querySelectorAll("span:not([aria-hidden])")].map((span) => ({
            text: span.textContent ?? "",
            lines: linesOf(span, lineOf(span)),
          })),
        };
      }),
    );
    expect(headings).toHaveLength(3);
    for (const { lines, parts } of headings) {
      expect(parts).toHaveLength(3);
      for (const part of parts) expect(part.lines, part.text).toBeLessThan(1.5);
      if (width === 1280) expect(lines).toBeLessThan(1.5);
    }
  },
);

/** A mouse or a pen on `page`, driven through CDP, which can set the pointer's type. */
async function pointerOf(page: Page, pointerType: "mouse" | "pen") {
  const cdp = await page.context().newCDPSession(page);
  const at = { ...AWAY };
  const send = (type: "mouseMoved" | "mousePressed" | "mouseReleased") =>
    cdp.send("Input.dispatchMouseEvent", {
      type,
      ...at,
      button: type === "mouseMoved" ? "none" : "left",
      clickCount: type === "mouseMoved" ? 0 : 1,
      pointerType,
    });
  return {
    /** Moves to `x`, `y` in eight steps. */
    async move(x: number, y: number) {
      const from = { ...at };
      for (let step = 1; step <= 8; step++) {
        at.x = from.x + ((x - from.x) * step) / 8;
        at.y = from.y + ((y - from.y) * step) / 8;
        await send("mouseMoved");
      }
    },
    click: async () => {
      await send("mousePressed");
      await send("mouseReleased");
    },
    down: () => send("mousePressed"),
    up: () => send("mouseReleased"),
  };
}

test.each(["mouse", "pen"] as const)(
  "a %s click keeps the hint hover opened, through the press and a second click",
  async (pointerType) => {
    const page = await openReport();
    const pointer = await pointerOf(page, pointerType);
    const { x, y } = await centreOf(page, "Explain Measurement");
    await pointer.move(x, y);
    await expect.poll(() => openHints(page)).toHaveLength(1);
    await page.waitForTimeout(100);
    await pointer.down();
    await page.waitForTimeout(100);
    expect(await openHints(page)).toHaveLength(1);
    await pointer.up();
    await page.waitForTimeout(100);
    expect(await openHints(page)).toHaveLength(1);
    await pointer.click();
    await page.waitForTimeout(100);
    expect(await openHints(page)).toEqual([await described(page, "Explain Measurement")]);
    // The click focused the button, which holds the hint once the pointer leaves; a click elsewhere
    // moves focus, and closes it.
    await pointer.move(AWAY.x, AWAY.y);
    await page.waitForTimeout(200);
    expect(await openHints(page)).toHaveLength(1);
    await pointer.click();
    await expect.poll(() => openHints(page)).toEqual([]);
  },
);

test.each([
  ["a press the browser cancels", 0, "pointercancel"],
  ["a right press whose release never comes", 2, null],
] as const)("after %s, the hint closes when the pointer leaves", async (_, button, end) => {
  const page = await openReport();
  const { x, y } = await centreOf(page, "Explain Measurement");
  await page.mouse.move(AWAY.x, AWAY.y);
  await page.mouse.move(x, y, { steps: 8 });
  await expect.poll(() => openHints(page)).toHaveLength(1);
  // Dispatched, as no input Playwright sends ends a press without its pointerup: a pen that starts
  // to pan sends pointercancel, and a context menu can swallow the release.
  await trigger(page, "Explain Measurement").evaluate(
    (element, [button, end]) => {
      const options = { bubbles: true, pointerType: "mouse", isPrimary: true };
      element.dispatchEvent(new PointerEvent("pointerdown", { ...options, button }));
      if (end !== null) element.dispatchEvent(new PointerEvent(end, options));
    },
    [button, end] as const,
  );
  await page.mouse.move(AWAY.x, AWAY.y, { steps: 8 });
  await expect.poll(() => openHints(page)).toEqual([]);
});

test("one hint at a time: hover closes the one focus holds, and Enter on it closes the hovered one", async () => {
  const page = await openReport();
  await trigger(page, "Explain route open").focus();
  await expect.poll(() => openHints(page)).toEqual([await described(page, "Explain route open")]);
  const { x, y } = await centreOf(page, "Explain got through");
  await page.mouse.move(AWAY.x, AWAY.y);
  await page.mouse.move(x, y, { steps: 8 });
  await expect.poll(() => openHints(page)).toEqual([await described(page, "Explain got through")]);
  // An open from a click, here Enter on the focused button, goes past Radix, and still closes the
  // hovered hint.
  await page.keyboard.press("Enter");
  await expect.poll(() => openHints(page)).toEqual([await described(page, "Explain route open")]);
});

test("on a 320 px screen, an open hint stays inside the viewport", async () => {
  const page = await openReport({ viewport: { width: 320, height: 720 } });
  await trigger(page, "Explain Measurement").scrollIntoViewIfNeeded();
  const { x, y } = await centreOf(page, "Explain Measurement");
  await page.mouse.move(x, y, { steps: 4 });
  await expect.poll(() => openHints(page)).toHaveLength(1);
  expect(await hintInView(page)).toBe(true);
});

test("the two number headers are named by their labels alone", async () => {
  const page = await openReport();
  for (const name of ["route open", "got through"]) {
    expect(await page.getByRole("columnheader", { name, exact: true }).count(), name).toBe(1);
  }
});

// ---------------------------------------------------------------------------
// The "—", the why lines and the seed cells (#264)
// ---------------------------------------------------------------------------
//
// A "—" and each why line carry a Hint, which `LABELS` holds, so the cases above cover them. A seed
// cell is its own trigger (`LinkHint`): it shows its words after a 300 ms rest or on focus, and a
// tap, a click or Enter follows its link. The cases below cover those, and what Chromium exposes.

/** The seed cell in `persona`'s row that opens `runId`. */
function seedCell(persona: string, runId: string): string {
  return `tr[data-persona="${persona}"] a[href="/runs/${runId}"]`;
}

const ADA_1 = seedCell("prof_ada", "run_ada-past-order-1");
const KAI_1 = seedCell("prof_kai", "run_kai-past-order-1");
const KAI_2 = seedCell("prof_kai", "run_kai-past-order-2");
const VERA_1 = seedCell("prof_vera", "run_vera-past-order-1");

/** The name link in `persona`'s row, which picks the persona. */
function nameLink(persona: string): string {
  return `tr[data-persona="${persona}"] td:first-child a`;
}

/** A seed cell's words: its name, which its bubble shows. */
async function wordsOf(page: Page, selector: string): Promise<string> {
  const words = await page.locator(selector).getAttribute("aria-label");
  if (words === null) throw new Error(`${selector} has no name`);
  return words;
}

/** The centre of the element `selector` finds. */
async function middleOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).boundingBox();
  if (box === null) throw new Error(`no box for ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The path the page shows, without its origin or search. */
function pathOf(page: Page): string {
  return new URL(page.url()).pathname;
}

/**
 * A reader of what Chromium's accessibility tree gives the element a selector finds: its name and
 * its description, through CDP, as a screen reader would get them from the browser.
 */
async function treeOf(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  return async (selector: string): Promise<{ name: string; description: string }> => {
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    if (nodeId === 0) throw new Error(`nothing matches ${selector}`);
    const { nodes } = await cdp.send("Accessibility.getPartialAXTree", {
      nodeId,
      fetchRelatives: false,
    });
    return {
      name: String(nodes[0]?.name?.value ?? ""),
      description: String(nodes[0]?.description?.value ?? ""),
    };
  };
}

test("a seed cell's words open on a hover that rests on it, inside the viewport, with its seed and run in mono, and stay while the pointer is on them", async () => {
  const page = await openReport();
  const words = await wordsOf(page, KAI_1);
  const { x, y } = await middleOf(page, KAI_1);
  await page.mouse.move(AWAY.x, AWAY.y);
  await page.mouse.move(x, y, { steps: 8 });
  await expect.poll(() => openHints(page)).toEqual([words]);
  expect(await hintInView(page)).toBe(true);
  // DESIGN's Copy sets seeds and run ids in `mono`.
  expect(await page.getByRole("tooltip").locator(".mono").allInnerTexts()).toEqual([
    "1",
    "run_kai-past-order-1",
  ]);
  // Onto the bubble, across the gap: it stays.
  const box = await page.getByRole("tooltip").boundingBox();
  if (box === null) throw new Error("no bubble");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await page.waitForTimeout(300);
  expect(await openHints(page)).toEqual([words]);
  await page.mouse.move(AWAY.x, AWAY.y, { steps: 8 });
  await expect.poll(() => openHints(page)).toEqual([]);
});

test("Tab to a seed cell opens its words at once; Esc closes them with focus kept; Tab moves them to the next cell; Enter follows its link", async () => {
  const page = await openReport();
  await page.locator(nameLink("prof_kai")).focus();
  await page.keyboard.press("Tab");
  expect(await focused(page)).toBe(await wordsOf(page, KAI_1));
  await expect.poll(() => openHints(page)).toEqual([await wordsOf(page, KAI_1)]);
  await page.keyboard.press("Escape");
  await expect.poll(() => openHints(page)).toEqual([]);
  expect(await focused(page)).toBe(await wordsOf(page, KAI_1));
  await page.keyboard.press("Tab");
  expect(await focused(page)).toBe(await wordsOf(page, KAI_2));
  await expect.poll(() => openHints(page)).toEqual([await wordsOf(page, KAI_2)]);
  await page.keyboard.press("Enter");
  await expect.poll(() => pathOf(page)).toBe("/runs/run_kai-past-order-2");
});

test("a seed cell's words focus opened stay through the scroll its Tab makes, and through a wheel scroll", async () => {
  // At 400 px high Vera's row starts below the fold, so the Tab that reaches her seed 1 scrolls.
  const page = await openReport({ viewport: { width: 1280, height: 400 } });
  const words = await wordsOf(page, VERA_1);
  await page.evaluate((selector) => {
    document.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, nameLink("prof_vera"));
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.keyboard.press("Tab");
  expect(await focused(page)).toBe(words);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  expect(await openHints(page)).toEqual([words]);
  await page.mouse.move(AWAY.x, AWAY.y);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(300);
  expect(await openHints(page)).toEqual([words]);
  await page.keyboard.press("Escape");
  await expect.poll(() => openHints(page)).toEqual([]);
  expect(await focused(page)).toBe(words);
});

test("a tap opens each new hint and a second closes it, and a tap on a seed cell follows its link", async () => {
  const page = await openReport({ context: { hasTouch: true } });
  for (const label of [
    "Explain Kai's counts",
    "Explain the missing number",
    "Explain Vera's counts",
  ]) {
    await trigger(page, label).tap();
    await expect
      .poll(() => openHints(page), { message: label })
      .toEqual([await described(page, label)]);
    await page.waitForTimeout(800);
    expect(await openHints(page), label).toHaveLength(1);
    await trigger(page, label).tap();
    await expect.poll(() => openHints(page), { message: label }).toEqual([]);
  }
  await page.locator(KAI_1).tap();
  await expect.poll(() => pathOf(page)).toBe("/runs/run_kai-past-order-1");
});

test("one hint at a time across both kinds: a hover on a hint closes the seed cell focus holds, and a seed cell's words close the hint focus holds", async () => {
  const page = await openReport();
  await page.locator(KAI_2).focus();
  await expect.poll(() => openHints(page)).toEqual([await wordsOf(page, KAI_2)]);
  const header = await centreOf(page, "Explain route open");
  await page.mouse.move(AWAY.x, AWAY.y);
  await page.mouse.move(header.x, header.y, { steps: 8 });
  // Focus holds the cell's words against Radix's own close, so only `useHintOpen`'s listener for
  // another hint opening closes them.
  await expect.poll(() => openHints(page)).toEqual([await described(page, "Explain route open")]);
  await trigger(page, "Explain the missing number").focus();
  await expect
    .poll(() => openHints(page))
    .toEqual([await described(page, "Explain the missing number")]);
  const cell = await middleOf(page, KAI_1);
  await page.mouse.move(AWAY.x, AWAY.y);
  await page.mouse.move(cell.x, cell.y, { steps: 8 });
  await expect.poll(() => openHints(page)).toEqual([await wordsOf(page, KAI_1)]);
});

test('Chromium names a seed cell by its words and describes it by nothing, open or not; each number link, count link and "—" is described by its words; nothing in main has a title', async () => {
  const page = await openReport();
  const tree = await treeOf(page);
  const seed = {
    name: "seed 1: Gave up, routes open: B, C. Opens run_kai-past-order-1",
    description: "",
  };
  expect(await tree(KAI_1)).toEqual(seed);
  expect(await page.locator("main [title]").count()).toBe(0);
  expect((await tree('tr[data-persona="prof_kai"] p[data-kind="routeOpen"] a')).description).toBe(
    "Every stored run of Kai on this goal, counted in this report or not, except sweep runs",
  );
  expect((await tree('tr[data-persona="prof_kai"] p[data-kind="gotThrough"] a')).description).toBe(
    "Every stored run of Kai on this goal that got through, counted in this report or not, except sweep runs",
  );
  expect((await tree('tr[data-why="prof_vera"] a[href*="outcome=gave_up"]')).description).toBe(
    "Every stored run of Vera on this goal marked Gave up, counted in this report or not, except sweep runs",
  );
  expect(
    await tree('tr[data-persona="prof_vera"] button[aria-label="Explain the missing number"]'),
  ).toEqual({ name: "Explain the missing number", description: "No run got through." });
  // Open by focus, Radix points the link's description at the bubble unless told not to.
  await page.locator(KAI_1).focus();
  await expect.poll(() => openHints(page)).toEqual([seed.name]);
  expect(await tree(KAI_1)).toEqual(seed);
  expect(await page.locator("main [title]").count()).toBe(0);
});

test("a pointer that passes over a seed cell, even just after its words closed, opens nothing, so a click on the cell above follows its link", async () => {
  const page = await openReport();
  const kai = await middleOf(page, KAI_1);
  const ada = await middleOf(page, ADA_1);
  await page.mouse.move(AWAY.x, AWAY.y);
  await page.mouse.move(kai.x, kai.y, { steps: 8 });
  await expect.poll(() => openHints(page)).toHaveLength(1);
  await page.mouse.move(AWAY.x, AWAY.y, { steps: 8 });
  await expect.poll(() => openHints(page)).toEqual([]);
  // Short of the 300 ms rest, and Radix's default skip delay would reopen the cell at once for 300
  // ms after it closed. Opened, Kai's bubble would cover Ada's cells, and as it is hoverable, it
  // would hold the pointer and catch the click.
  await page.mouse.move(kai.x, kai.y, { steps: 8 });
  await page.waitForTimeout(100);
  await page.mouse.move(ada.x, ada.y, { steps: 8 });
  expect(await openHints(page)).toEqual([]);
  await page.mouse.click(ada.x, ada.y);
  await expect.poll(() => pathOf(page)).toBe("/runs/run_ada-past-order-1");
});

test("a pointer that passes over a why line's hint opens nothing, so a click on the number above it follows its link", async () => {
  const page = await openReport();
  const link = 'tr[data-persona="prof_vera"] p[data-kind="routeOpen"] a';
  const number = await middleOf(page, link);
  const box = await trigger(page, "Explain Vera's counts").boundingBox();
  const linkBox = await page.locator(link).boundingBox();
  if (box === null || linkBox === null) throw new Error("no box for Vera's route open or counts");
  // The why line's button sits under the route open number, where the font puts it, so a pointer
  // going up to the number can cross it. This one goes up through the button's middle.
  expect(box.x).toBeLessThan(linkBox.x + linkBox.width);
  expect(box.x + box.width).toBeGreaterThan(linkBox.x);
  const across = box.x + box.width / 2;
  await page.mouse.move(across, box.y + box.height + 40);
  await page.mouse.move(across, box.y - 2, { steps: 6 });
  await page.mouse.move(number.x, number.y, { steps: 4 });
  expect(await openHints(page)).toEqual([]);
  await page.mouse.click(number.x, number.y);
  await expect.poll(() => pathOf(page)).toBe("/runs");
});

test("the focus a right click leaves on a seed cell holds nothing: its words close as the pointer leaves", async () => {
  const page = await openReport();
  const words = await wordsOf(page, KAI_2);
  const cell = await middleOf(page, KAI_2);
  await page.mouse.click(cell.x, cell.y, { button: "right" });
  expect(await focused(page)).toBe(words);
  await page.mouse.move(AWAY.x, AWAY.y, { steps: 8 });
  await page.mouse.move(cell.x, cell.y, { steps: 8 });
  await expect.poll(() => openHints(page)).toEqual([words]);
  await page.mouse.move(AWAY.x, AWAY.y, { steps: 8 });
  await expect.poll(() => openHints(page)).toEqual([]);
  expect(await focused(page)).toBe(words);
});
