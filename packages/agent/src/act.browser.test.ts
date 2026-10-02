/**
 * `performAction` and its `Arrival` on pages that never answer: a page too busy to take the input,
 * a navigation that never commits, a new page that never loads, a back to one. Each ends in
 * `page_not_settled` at the deadline, never in a hang. The loop waits 30 s for any of them, so
 * these take a shorter deadline than its own tests on served pages could
 * (`actor-loop.browser.test.ts`). Pages are served under `http://act.test` through `page.route`,
 * and a request the route never answers hangs.
 */
import { type Action, toActorObservation, WayfordError } from "@wayford/core";
import { observationFixture } from "@wayford/core/fixtures";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { performAction } from "./act.js";

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

// What the persona was shown: the fixture's page, whose `e1` is a link at 24,16, 64 x 36 px.
const shown = toActorObservation(observationFixture);
const CLICK: Action = { type: "click", ref: "e1" };

/**
 * A fresh page on a start page whose one link, where the fixture's `e1` is, goes to `href`, and
 * `/loading`, a page whose image never arrives. Closed whatever `use` does.
 */
async function onStartPage(href: string, use: (page: Page) => Promise<void>): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.route("http://act.test/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      const body = {
        "/start": `<a href="${href}" style="position: absolute; left: 24px; top: 16px; width: 64px; height: 36px">Home</a>`,
        "/loading": '<p>Almost there</p><img src="/never.png">',
      }[path];
      // Anything else is never answered.
      return body === undefined ? undefined : route.fulfill({ contentType: "text/html", body });
    });
    await page.goto("http://act.test/start");
    await use(page);
  } finally {
    await context.close();
  }
}

/** The error `action` and its arrival reject with on a 300 ms deadline, and how long it took. */
async function failure(page: Page, action: Action): Promise<[WayfordError, number]> {
  const run = { page, moveCursor: async () => undefined };
  const started = performance.now();
  const error = await performAction(run, action, shown, 300)
    .then((arrival) => arrival.wait())
    .catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(WayfordError);
  expect((error as WayfordError).code).toBe("page_not_settled");
  return [error as WayfordError, performance.now() - started];
}

test("a page too busy to take the input fails page_not_settled at the deadline", async () => {
  await onStartPage("/never", async (page) => {
    // Not awaited: the page spins for two seconds and runs nothing else meanwhile.
    const busy = page.evaluate(() => {
      const end = performance.now() + 2000;
      while (performance.now() < end) {
        // Spin.
      }
    });
    busy.catch(() => undefined);
    const [error, ms] = await failure(page, { type: "scroll", direction: "down" });
    expect(error.message).toBe(
      "the page at http://act.test/start did not take the action's input within 300 ms",
    );
    expect(ms).toBeLessThan(1500);
  });
});

test("a navigation that never commits fails page_not_settled at the deadline", async () => {
  await onStartPage("/never", async (page) => {
    const [error, ms] = await failure(page, CLICK);
    expect(error.message).toBe(
      "the page at http://act.test/start started a navigation that did not commit within 300 ms",
    );
    expect(ms).toBeLessThan(1500);
  });
});

test("a new page that never finishes loading fails page_not_settled at the deadline", async () => {
  await onStartPage("/loading", async (page) => {
    const [error, ms] = await failure(page, CLICK);
    expect(error.message).toBe(
      "the page at http://act.test/loading did not finish loading within 300 ms",
    );
    expect(ms).toBeLessThan(1500);
  });
});

test("a back to a page that never finishes loading fails page_not_settled at the deadline", async () => {
  await onStartPage("/loading", async (page) => {
    // So the page behind the start page is one whose image never arrives.
    await page.goto("http://act.test/loading", { waitUntil: "commit" });
    await page.goto("http://act.test/start");
    const [error, ms] = await failure(page, { type: "back" });
    expect(error.message).toBe(
      "the page at http://act.test/loading did not finish loading within 300 ms",
    );
    expect(ms).toBeLessThan(1500);
  });
});
