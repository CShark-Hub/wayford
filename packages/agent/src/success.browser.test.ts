/**
 * `checkSuccessCondition` and `watchSuccess` against the success constraint of
 * `tasks/s2-03-actor-loop.md`, and url-glob's dialect against Playwright's own matcher
 * (`docs/specs/2026-10-01-s2-03-actor-loop.md`, "success.ts and url-glob.ts"). Pages are given to
 * `page.setContent`, or served through `context.route`: under `http://success.test` where a
 * request matters, and at the table's own URLs for the dialect. One Chromium serves every test,
 * each test opens its own context, and no target app is needed.
 */
import { type SuccessCondition, WayfordError } from "@wayford/core";
import { type Browser, type BrowserContext, chromium, errors, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { checkSuccessCondition, watchSuccess } from "./success.js";
import { globToRegExp } from "./url-glob.js";

// Launching Chromium takes longer than vitest's 5 s hook default.
vi.setConfig({ testTimeout: 15_000, hookTimeout: 60_000 });

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch().catch((error: unknown) => {
    throw new Error(
      "Chromium did not launch. If it is not installed, run " +
        "`pnpm --filter @wayford/agent exec playwright install --only-shell chromium`.",
      { cause: error },
    );
  });
});

afterAll(async () => {
  await browser?.close();
});

/** A fresh context and its page, closed whatever `use` does. */
async function withPage<T>(use: (page: Page, context: BrowserContext) => Promise<T>): Promise<T> {
  const context = await browser.newContext();
  try {
    return await use(await context.newPage(), context);
  } finally {
    await context.close();
  }
}

/** Answers every request the context sends, whatever its URL and method, with one small page. */
async function serveEverything(context: BrowserContext): Promise<void> {
  await context.route(
    () => true,
    (route) => route.fulfill({ contentType: "text/html", body: "<p>A page</p>" }),
  );
}

/** The condition most request tests watch for: a POST to the save endpoint. */
const SAVE_POSTED: SuccessCondition = {
  type: "requestObserved",
  method: "POST",
  urlPattern: "**/api/save",
};

/** Sends one request from the page, as a script of its own would, and waits for the answer. */
async function send(page: Page, path: string, method: "GET" | "POST"): Promise<void> {
  await page.evaluate(
    async (request) => {
      await fetch(request.path, { method: request.method });
    },
    { path, method },
  );
}

/** The error `checkSuccessCondition` throws for `condition`, checked to be the typed one. */
function refusal(condition: SuccessCondition): WayfordError {
  try {
    checkSuccessCondition(condition);
  } catch (error) {
    expect(error).toBeInstanceOf(WayfordError);
    expect((error as WayfordError).code).toBe("invalid_success_condition");
    return error as WayfordError;
  }
  throw new Error(`checkSuccessCondition accepted ${JSON.stringify(condition)}, which it refuses`);
}

/** The first line of an error's message: all a run's `error` keeps (`runFailed`). */
function firstLine(error: Error): string | undefined {
  return error.message.split("\n")[0];
}

// The two conditions that carry a URL pattern, each built around one.
const WITH_PATTERN = [
  ["urlMatches", (pattern: string): SuccessCondition => ({ type: "urlMatches", pattern })],
  [
    "requestObserved",
    (urlPattern: string): SuccessCondition => ({
      type: "requestObserved",
      method: "POST",
      urlPattern,
    }),
  ],
] as const;

describe.each(WITH_PATTERN)("checkSuccessCondition on %s", (_type, withPattern) => {
  // The first is relative. The second spells its scheme in capitals, where the browser reports a
  // scheme in lower case and url-glob compares as written.
  test.each(["/account/address", "HTTP://localhost:5174/account/address"])(
    "refuses %j, which no page's URL could match, saying to write it as **/…",
    (pattern) => {
      const line = firstLine(refusal(withPattern(pattern)));
      expect(line).toContain(JSON.stringify(pattern));
      expect(line).toContain('"**/');
    },
  );

  test("refuses a pattern that does not compile, with url-glob's error as its cause", () => {
    const error = refusal(withPattern("**/{a"));
    expect(error.cause).toBeInstanceOf(WayfordError);
    const cause = error.cause as WayfordError;
    expect(cause.code).toBe("invalid_url_glob");
    // Which brace does not pair, on the line a run's `error` keeps.
    expect(firstLine(error)).toContain(cause.message);
  });

  test.each([
    "**/account/address",
    "http://localhost:5174/account/address",
    "https://shop.example.test/**",
  ])("accepts %j", (pattern) => {
    expect(() => checkSuccessCondition(withPattern(pattern))).not.toThrow();
  });
});

test("checkSuccessCondition passes a selectorPresent condition: only a page can parse it", () => {
  expect(() => checkSuccessCondition({ type: "selectorPresent", selector: "p[" })).not.toThrow();
});

describe("watchSuccess", () => {
  test("urlMatches decides on the URL it is given, the one the step stores", async () => {
    await withPage(async (page, context) => {
      await serveEverything(context);
      await page.goto("http://success.test/start");
      const watch = watchSuccess(context, { type: "urlMatches", pattern: "**/account/address" });
      // The page itself is still on the start page.
      expect(await watch.met(page, "http://success.test/account/address")).toBe(true);
      expect(await watch.met(page, "http://success.test/start")).toBe(false);
    });
  });

  test("selectorPresent asks the page each time", async () => {
    await withPage(async (page, context) => {
      await page.setContent('<p id="draft">Draft</p>');
      const watch = watchSuccess(context, { type: "selectorPresent", selector: "#saved" });
      expect(await watch.met(page, page.url())).toBe(false);
      await page.evaluate(() => document.getElementById("draft")?.setAttribute("id", "saved"));
      expect(await watch.met(page, page.url())).toBe(true);
    });
  });

  test("selectorPresent reads the top document only, as the collector does", async () => {
    await withPage(async (page, context) => {
      await page.setContent(`<div id="host"></div>
        <iframe srcdoc="<p id='framed'>In a frame</p>"></iframe>`);
      await page.evaluate(() => {
        const root = document.getElementById("host")?.attachShadow({ mode: "open" });
        if (root !== undefined) root.innerHTML = '<p id="shadowed">In a shadow root</p>';
      });
      // Both are there: a locator pierces the open shadow root, and the frame's own finds the other.
      expect(await page.locator("#shadowed").count()).toBe(1);
      expect(await page.locator("iframe").contentFrame().locator("#framed").count()).toBe(1);

      for (const selector of ["#shadowed", "#framed"]) {
        const watch = watchSuccess(context, { type: "selectorPresent", selector });
        expect(await watch.met(page, page.url())).toBe(false);
      }
    });
  });

  // Each is a selector Playwright's locators accept, `text=`, XPath and a `>>` chain among them,
  // and each would find the span. None is CSS.
  test.each(["p[", "text=Saved", "//p", "p >> span"])(
    "selectorPresent rejects for %j, which is not CSS",
    async (selector) => {
      await withPage(async (page, context) => {
        await page.setContent("<p><span>Saved</span></p>");
        const watch = watchSuccess(context, { type: "selectorPresent", selector });
        await expect(watch.met(page, page.url())).rejects.toThrow("is not a valid selector");
      });
    },
  );

  test("requestObserved counts no request sent before it was armed", async () => {
    await withPage(async (page, context) => {
      await serveEverything(context);
      // The start page's own request, as the loop arms the watch once the start page has loaded.
      await page.goto("http://success.test/start");
      const condition = { type: "requestObserved", method: "GET", urlPattern: "**/start" } as const;
      const watch = watchSuccess(context, condition);
      expect(await watch.met(page, page.url())).toBe(false);
      await send(page, "/start", "GET");
      expect(await watch.met(page, page.url())).toBe(true);
    });
  });

  test("requestObserved counts a request sent with the condition's method only", async () => {
    await withPage(async (page, context) => {
      await serveEverything(context);
      await page.goto("http://success.test/start");
      const watch = watchSuccess(context, SAVE_POSTED);
      await send(page, "/api/save", "GET");
      expect(await watch.met(page, page.url())).toBe(false);
      await send(page, "/api/save", "POST");
      expect(await watch.met(page, page.url())).toBe(true);
    });
  });

  test("requestObserved matches the whole URL, its query included", async () => {
    await withPage(async (page, context) => {
      await serveEverything(context);
      await page.goto("http://success.test/start");
      const watch = watchSuccess(context, SAVE_POSTED);
      await send(page, "/api/saved", "POST");
      await send(page, "/api/save?draft=1", "POST");
      expect(await watch.met(page, page.url())).toBe(false);
      await send(page, "/api/save", "POST");
      expect(await watch.met(page, page.url())).toBe(true);
    });
  });

  test("requestObserved counts nothing sent after stop", async () => {
    await withPage(async (page, context) => {
      await serveEverything(context);
      await page.goto("http://success.test/start");
      const watch = watchSuccess(context, SAVE_POSTED);
      watch.stop();
      await send(page, "/api/save", "POST");
      expect(await watch.met(page, page.url())).toBe(false);
    });
  });

  test("requestObserved counts a popup's request: the listener is the context's", async () => {
    await withPage(async (page, context) => {
      await serveEverything(context);
      await page.goto("http://success.test/start");
      const condition = { type: "requestObserved", method: "GET", urlPattern: "**/popup" } as const;
      const watch = watchSuccess(context, condition);
      // Measured during the build: the popup's first request is sent before its frame exists, so
      // its `request.frame()` throws.
      const opened = context.waitForEvent("page");
      await page.evaluate(() => {
        window.open("/popup");
      });
      await (await opened).waitForLoadState();
      expect(await watch.met(page, page.url())).toBe(true);
    });
  });
});

/** A glob, a URL, and whether the glob accepts the URL. */
type Case = readonly [glob: string, url: string, matches: boolean];

// The glob dialect, pinned: every verdict is the one Playwright 1.63's `page.waitForURL` gave when
// the table was written, and url-glob must give it too. Every URL is spelled as Chromium reports
// it, and each test checks that it still is, so both matchers read the row as written. Backslashes
// are doubled, as in a task's JSON.
const DIALECT: readonly Case[] = [
  // The two fixture goals.
  ["**/account/address", "http://localhost:5174/account/address", true],
  ["**/account/address", "http://localhost:5174/account/address?x=1", false],
  ["**/account/address", "http://localhost:5174/account/address#top", false],
  ["**/account/address", "http://localhost:5174/account/address/", false],
  ["**/account/address", "http://localhost:5174/account/address.html", false],
  ["**/account/address", "http://localhost:5174/deliveries/archive", false],
  ["**/account/address", "http://localhost:5174/deliveries", false],
  ["**/deliveries/archive", "http://localhost:5174/deliveries/archive", true],
  ["**/deliveries/archive", "http://localhost:5174/deliveries/archive?x=1", false],
  ["**/deliveries/archive", "http://localhost:5174/deliveries/archive#top", false],
  ["**/deliveries/archive", "http://localhost:5174/deliveries/archive/", false],
  ["**/deliveries/archive", "http://localhost:5174/deliveries/archive.html", false],
  ["**/deliveries/archive", "http://localhost:5174/account/address", false],
  ["**/deliveries/archive", "http://localhost:5174/deliveries", false],
  // A leading `**/`, and case.
  ["**/account/address", "http://localhost:5174/shop/account/address", true],
  ["**/account/address", "http://localhost:5174/myaccount/address", false],
  ["**/account/address", "http://localhost:5174/Account/address", false],
  // `*` inside one segment.
  ["**/a/*/c", "http://localhost:5174/a/b/c", true],
  ["**/a/*/c", "http://localhost:5174/x/a/b/c", true],
  ["**/a/*/c", "http://localhost:5174/a//c", true],
  ["**/a/*/c", "http://localhost:5174/a/b/b/c", false],
  ["**/a/*/c", "http://localhost:5174/a/c", false],
  // `**` across segments, and `/**/`.
  ["http://localhost:5174/**", "http://localhost:5174/deliveries/archive?x=1#top", true],
  ["http://localhost:5174/**", "http://localhost:5173/", false],
  ["http://localhost:5174/**/archive", "http://localhost:5174/archive", true],
  ["http://localhost:5174/**/archive", "http://localhost:5174/deliveries/archive", true],
  ["http://localhost:5174/**/archive", "http://localhost:5174/myarchive", false],
  ["**/a/**/c", "http://localhost:5174/a/b/b/c", true],
  ["**/a/**/c", "http://localhost:5174/a//c", false],
  // `**/` after anything but a slash.
  ["**/acc**/address", "http://localhost:5174/acc/address", true],
  // Braces.
  ["**/{account,settings}", "http://localhost:5174/account", true],
  ["**/{account,settings}", "http://localhost:5174/settings", true],
  ["**/{account,settings}", "http://localhost:5174/accounts", false],
  ["**/{account,settings}", "http://localhost:5174/account/address", false],
  ["**/account{,/address}", "http://localhost:5174/account", true],
  ["**/account{,/address}", "http://localhost:5174/account/address", true],
  ["**/account{,/address}", "http://localhost:5174/account/", false],
  ["**/*.{png,jpg}", "http://localhost:5174/img/logo.png", true],
  ["**/*.{png,jpg}", "http://localhost:5174/img/logo.gif", false],
  // Characters a regular expression gives a meaning to.
  ["**/search?q=1", "http://localhost:5174/search?q=1", true],
  ["**/search?q=1", "http://localhost:5174/searchXq=1", false],
  ["**/list[x]", "http://localhost:5174/list[x]", true],
  ["**/list[x]", "http://localhost:5174/listx", false],
  ["**/address.html", "http://localhost:5174/account/address.html", true],
  ["**/address.html", "http://localhost:5174/account/addressXhtml", false],
  ["**/search?q=(a|b)+", "http://localhost:5174/search?q=(a|b)+", true],
  ["**/search?q=(a|b)+", "http://localhost:5174/search?q=ab", false],
  ["**/search?q=^a$", "http://localhost:5174/search?q=^a$", true],
  // A comma outside braces.
  ["**/a,b", "http://localhost:5174/a,b", true],
  ["**/a,b", "http://localhost:5174/a", false],
  // Backslashes.
  ["**/a\\*b", "http://localhost:5174/a*b", true],
  ["**/a\\*b", "http://localhost:5174/axb", false],
  ["**/search?q=\\{a,b\\}", "http://localhost:5174/search?q={a,b}", true],
  ["**/search?q=\\{a,b\\}", "http://localhost:5174/search?q=a", false],
  ["**/search?q=\\{a", "http://localhost:5174/search?q={a", true],
  ["**/{a\\,b,c}", "http://localhost:5174/a,b", true],
  ["**/{a\\,b,c}", "http://localhost:5174/c", true],
  ["**/{a\\,b,c}", "http://localhost:5174/a", false],
  ["**/search?q=a\\\\b", "http://localhost:5174/search?q=a\\b", true],
  ["**/search?q=a\\", "http://localhost:5174/search?q=a\\", true],
  // Where the glob starts.
  ["account/address", "http://localhost:5174/account/address", false],
  ["http://localhost:5174/account/address", "http://localhost:5174/account/address", true],
  ["http://localhost:5174/account/address", "http://localhost:5174/account/address?x=1", false],
];

/**
 * Whether Playwright's own matcher accepts the page's URL: `waitForURL` resolves at once when it
 * does, and otherwise waits for a navigation that never comes, until its 1 ms runs out. Any other
 * error is Playwright refusing the glob, and fails the test.
 */
async function playwrightMatches(page: Page, glob: string): Promise<boolean> {
  return page.waitForURL(glob, { timeout: 1 }).then(
    () => true,
    (error: unknown) => {
      if (error instanceof errors.TimeoutError) return false;
      throw error;
    },
  );
}

// What guards the dialect against a Playwright upgrade: if Playwright starts to read a glob
// otherwise, its half fails here.
describe("url-glob agrees with Playwright's page.waitForURL", () => {
  // One page for every row, since each only loads its URL and reads it back: a fresh context per
  // row cost 38 ms, the shared page 3.4 ms (measured in the branch review).
  let context: BrowserContext;
  let page: Page;

  beforeAll(async () => {
    context = await browser.newContext();
    await serveEverything(context);
    page = await context.newPage();
  });

  afterAll(async () => {
    await context?.close();
  });

  test.each(DIALECT)("%s against %s is %s", async (glob, url, matches) => {
    await page.goto(url);
    expect(page.url()).toBe(url);
    expect(await playwrightMatches(page, glob)).toBe(matches);
    expect(globToRegExp(glob).test(page.url())).toBe(matches);
  });
});
