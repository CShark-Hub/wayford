/**
 * `settle` and `retryOnNavigation` against the settle constraint of `tasks/s2-03-actor-loop.md`
 * (`docs/specs/2026-10-01-s2-03-actor-loop.md`, "settle.ts"). Pages are given to
 * `page.setContent`, or served under `http://settle.test` through `page.route` where a request has
 * to fail, hang or navigate. One Chromium serves every test, each test opens its own context, and
 * no target app is needed.
 */
import { WayfordError } from "@wayford/core";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import {
  attemptTimeoutMs,
  LENIENT_SETTLE_TIMEOUT_MS,
  retryOnNavigation,
  SETTLE_TIMEOUT_MS,
  settle,
} from "./settle.js";

// Launching Chromium takes longer than vitest's 5 s hook default, and one test holds a page busy
// for two seconds.
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

/** A fresh context and page, closed whatever `use` does. */
async function withPage<T>(use: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext();
  try {
    return await use(await context.newPage());
  } finally {
    await context.close();
  }
}

/** The error `promise` rejects with, checked to be the boundary's typed one with `code`. */
async function rejection(promise: Promise<unknown>, code: string): Promise<WayfordError> {
  const error = await promise.catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(WayfordError);
  expect((error as WayfordError).code).toBe(code);
  return error as WayfordError;
}

/** What `run` gave and how many milliseconds it took, on Node's clock. */
async function timed<T>(run: () => Promise<T>): Promise<[T, number]> {
  const started = performance.now();
  const value = await run();
  return [value, performance.now() - started];
}

/** How many animations and transitions run on the page now. */
const runningOn = (page: Page) =>
  page.evaluate(
    () => document.getAnimations().filter((animation) => animation.playState === "running").length,
  );

test("a 400 ms CSS animation is waited out", async () => {
  await withPage(async (page) => {
    await page.setContent(`<style>
        @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
        .fading { animation: fade 400ms linear }
      </style>
      <p id="box" onanimationend="this.dataset.ended = 'yes'">Fading in</p>`);
    // Started only now, so it is surely still running when settle begins.
    const started = await page.evaluate(() => {
      document.getElementById("box")?.classList.add("fading");
      return document.getAnimations().map((animation) => animation.playState);
    });
    expect(started).toStrictEqual(["running"]);

    await settle(page);
    const ended = await page.evaluate(() => document.getElementById("box")?.dataset.ended);
    expect(ended).toBe("yes");
    expect(await runningOn(page)).toBe(0);
  });
});

test("a used font that cannot be fetched fails font_failed, naming its family", async () => {
  await withPage(async (page) => {
    await page.route("http://settle.test/**", (route) => route.abort());
    await page.setContent(`<style>
        @font-face {
          font-family: "Gone Sans";
          src: url("http://settle.test/gone.woff2") format("woff2");
        }
        p { font-family: "Gone Sans", sans-serif }
      </style>
      <p>Drawn in a font that never arrives</p>`);
    const error = await rejection(settle(page), "font_failed");
    expect(error.message).toContain('"Gone Sans"');
  });
});

test("a page with nothing moving settles at once, and the strict path skips nothing", async () => {
  await withPage(async (page) => {
    await page.setContent("<p>Nothing here moves</p>");
    const [skipped, ms] = await timed(() => settle(page));
    expect(ms).toBeLessThan(100);
    expect(skipped).toStrictEqual({ failedFonts: [], endlessAnimations: [] });
  });
});

test("at the deadline it names what still runs, a transition by its property", async () => {
  await withPage(async (page) => {
    await page.setContent(`<style>
        @keyframes slide { to { transform: translateX(100px) } }
        .sliding { animation: slide 10s linear }
        a { opacity: 1; transition: opacity 10s linear }
        a.faded { opacity: 0.2 }
      </style>
      <div>Sliding</div>
      <a href="#">Fading</a>`);
    await page.evaluate(() => {
      document.querySelector("div")?.classList.add("sliding");
      document.querySelector("a")?.classList.add("faded");
    });
    const error = await rejection(settle(page, { timeoutMs: 300 }), "page_not_settled");
    expect(error.message).toContain("within 300 ms");
    expect(error.message).toContain('animation "slide" on <div>');
    expect(error.message).toContain('transition of "opacity" on <a>');
  });
});

test("at the deadline it says the fonts are still loading", async () => {
  await withPage(async (page) => {
    // The font's request is never answered.
    await page.route("http://settle.test/**", () => undefined);
    await page.setContent(`<style>
        @font-face {
          font-family: "Slow Sans";
          src: url("http://settle.test/slow.woff2") format("woff2");
        }
        .slow { font-family: "Slow Sans", sans-serif }
      </style>
      <p>Waiting for its font</p>`);
    // Used only after the load event, which a font still on its way would hold back. Laying the
    // page out starts the font's request.
    const status = await page.evaluate(() => {
      document.querySelector("p")?.classList.add("slow");
      document.body.getBoundingClientRect();
      return document.fonts.status;
    });
    expect(status).toBe("loading");

    const error = await rejection(settle(page, { timeoutMs: 300 }), "page_not_settled");
    expect(error.message).toContain("within 300 ms");
    expect(error.message).toContain("fonts are still loading");
  });
});

/**
 * A page off the target app as many real ones are: a spinner that turns forever and a used font
 * that cannot be fetched. The font's request fails at once, so only the face's status is left.
 */
async function spinnerWithGoneFont(page: Page): Promise<void> {
  await page.route("http://settle.test/**", (route) => route.abort());
  await page.setContent(`<style>
      @keyframes spin { to { transform: rotate(360deg) } }
      .spinner { animation: spin 1s linear infinite }
      @font-face {
        font-family: "Gone Sans";
        src: url("http://settle.test/gone.woff2") format("woff2");
      }
      p { font-family: "Gone Sans", sans-serif }
    </style>
    <div class="spinner">Loading</div>
    <p>Drawn in a font that never arrives</p>`);
  expect(await runningOn(page)).toBe(1);
}

test("lenient: an endless animation and a failed font are skipped at once, and named", async () => {
  await withPage(async (page) => {
    await spinnerWithGoneFont(page);
    const [skipped, ms] = await timed(() => settle(page, { lenient: true }));
    expect(ms).toBeLessThan(500);
    expect(skipped).toStrictEqual({
      failedFonts: ['"Gone Sans"'],
      endlessAnimations: ['animation "spin" on <div>'],
    });
    // Skipped, not stopped: the spinner still turns.
    expect(await runningOn(page)).toBe(1);
  });
});

test("strict: the same page is not settled at the deadline, the spinner named", async () => {
  await withPage(async (page) => {
    await spinnerWithGoneFont(page);
    // Animations come before fonts, so the spinner holds it to the deadline; the failed font alone
    // is `font_failed`, as the test above with "Gone Sans" shows.
    const error = await rejection(settle(page, { timeoutMs: 300 }), "page_not_settled");
    expect(error.message).toContain('animation "spin" on <div>');
  });
});

test("lenient: a finite animation beside an endless one is still waited out", async () => {
  await withPage(async (page) => {
    await page.setContent(`<style>
        @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes spin { to { transform: rotate(360deg) } }
        .fading { animation: fade 400ms linear }
        .spinner { animation: spin 1s linear infinite }
      </style>
      <div class="spinner">Loading</div>
      <p id="box" onanimationend="this.dataset.ended = 'yes'">Fading in</p>`);
    await page.evaluate(() => document.getElementById("box")?.classList.add("fading"));

    const [skipped, ms] = await timed(() => settle(page, { lenient: true }));
    expect(await page.evaluate(() => document.getElementById("box")?.dataset.ended)).toBe("yes");
    expect(ms).toBeLessThan(SETTLE_TIMEOUT_MS);
    expect(skipped).toStrictEqual({
      failedFonts: [],
      endlessAnimations: ['animation "spin" on <div>'],
    });
  });
});

/**
 * A reading-progress bar: one iteration, driven by the scroll position, not the clock. It runs
 * until the page is scrolled to its end, so waiting cannot end it.
 */
async function progressBar(page: Page): Promise<void> {
  await page.setContent(`<style>
      @keyframes grow { from { transform: scaleX(0) } to { transform: scaleX(1) } }
      .progress { height: 4px; background: #000000; animation: grow linear both; animation-timeline: scroll(); }
      .long { height: 3000px }
    </style>
    <div class="progress"></div>
    <p class="long">A long read</p>`);
  expect(await runningOn(page)).toBe(1);
}

test("lenient: a scroll-driven animation is skipped at once, and named", async () => {
  await withPage(async (page) => {
    await progressBar(page);
    const [skipped, ms] = await timed(() => settle(page, { lenient: true }));
    expect(ms).toBeLessThan(500);
    expect(skipped).toStrictEqual({
      failedFonts: [],
      endlessAnimations: ['animation "grow" on <div>'],
    });
  });
});

test("strict: a scroll-driven animation is not settled at the deadline", async () => {
  await withPage(async (page) => {
    await progressBar(page);
    const error = await rejection(settle(page, { timeoutMs: 300 }), "page_not_settled");
    expect(error.message).toContain('animation "grow" on <div>');
  });
});

test("lenient: a finite animation still running at the deadline is not settled", async () => {
  await withPage(async (page) => {
    await page.setContent(`<style>
        @keyframes slide { to { transform: translateX(100px) } }
        .sliding { animation: slide 10s linear }
      </style>
      <div>Sliding</div>`);
    await page.evaluate(() => document.querySelector("div")?.classList.add("sliding"));
    const error = await rejection(
      settle(page, { lenient: true, timeoutMs: 300 }),
      "page_not_settled",
    );
    expect(error.message).toContain('animation "slide" on <div>');
  });
});

/**
 * A page that slides one box in over four seconds, longer than the strict deadline and well inside
 * the lenient one: an on-load fade on a heavy real page, slowed down by runs beside it (#190).
 */
async function slowSlide(page: Page): Promise<void> {
  await page.setContent(`<style>
      @keyframes slide { from { transform: translateX(-100px) } to { transform: none } }
      .sliding { animation: slide 4s linear }
    </style>
    <div id="box" onanimationend="this.dataset.ended = 'yes'">Sliding in</div>`);
  await page.evaluate(() => document.getElementById("box")?.classList.add("sliding"));
}

test("lenient: a finite animation longer than the strict deadline is waited out (#190)", async () => {
  await withPage(async (page) => {
    await slowSlide(page);
    const [skipped, ms] = await timed(() => settle(page, { lenient: true }));
    expect(await page.evaluate(() => document.getElementById("box")?.dataset.ended)).toBe("yes");
    expect(ms).toBeGreaterThan(SETTLE_TIMEOUT_MS);
    expect(ms).toBeLessThan(LENIENT_SETTLE_TIMEOUT_MS);
    expect(skipped).toStrictEqual({ failedFonts: [], endlessAnimations: [] });
  });
});

test("strict: the same animation is not settled at the strict deadline", async () => {
  await withPage(async (page) => {
    await slowSlide(page);
    const error = await rejection(settle(page), "page_not_settled");
    expect(error.message).toContain(`did not settle within ${SETTLE_TIMEOUT_MS} ms`);
    expect(error.message).toContain('animation "slide" on <div>');
  });
});

test("the strict bounds stay the target app's, and the lenient ones are longer (#190)", () => {
  // The calibration depends on the strict pair (`docs/adr/0003-any-target.md`, D4).
  expect(SETTLE_TIMEOUT_MS).toBe(3000);
  expect(attemptTimeoutMs(false)).toBe(8000);
  expect(LENIENT_SETTLE_TIMEOUT_MS).toBeGreaterThan(SETTLE_TIMEOUT_MS);
  expect(attemptTimeoutMs(true)).toBeGreaterThan(attemptTimeoutMs(false));
  // Each attempt outlasts its own settle, so Node's race never cuts a settle within its deadline.
  expect(attemptTimeoutMs(true)).toBeGreaterThan(LENIENT_SETTLE_TIMEOUT_MS);
});

test("retryOnNavigation fails page_not_settled from Node when the page's main thread is blocked", async () => {
  await withPage(async (page) => {
    await page.setContent("<p>Busy</p>");
    // Not awaited: the page spins for two seconds and runs nothing else meanwhile. The context
    // closes before it is done, and the rejection that cuts it off is dropped.
    const busy = page.evaluate(() => {
      const end = performance.now() + 2000;
      while (performance.now() < end) {
        // Spin.
      }
    });
    busy.catch(() => undefined);
    // The loop's own call. Its first note of the document waits on the page too, so the bound
    // has to hold around the whole attempt, not only the settle.
    const [error, ms] = await timed(() =>
      rejection(
        retryOnNavigation(page, () => settle(page, { timeoutMs: 100 }), 500),
        "page_not_settled",
      ),
    );
    // The message says the Node deadline fired. No lower bound on `ms`: Node's timers run on a
    // millisecond clock and can fire a fraction of one early by `performance.now()`.
    expect(error.message).toContain("did not answer within 500 ms");
    expect(ms).toBeLessThan(1500);
  });
});

// What Playwright and Chromium say when a navigation replaced the document an attempt ran in.
test.each([
  "page.evaluate: Execution context was destroyed, most likely because of a navigation",
  "Protocol error (Runtime.callFunctionOn): Cannot find context with specified id",
  "page.evaluate: Frame was detached",
])("retryOnNavigation tries again after %j and returns the second result", async (message) => {
  await withPage(async (page) => {
    await page.setContent("<p>Here</p>");
    let calls = 0;
    const result = await retryOnNavigation(page, async () => {
      calls += 1;
      if (calls === 1) throw new Error(message);
      return "second";
    });
    expect(result).toBe("second");
    expect(calls).toBe(2);
  });
});

test("retryOnNavigation rethrows the third destroyed context", async () => {
  await withPage(async (page) => {
    await page.setContent("<p>Here</p>");
    const failures: Error[] = [];
    const error = await retryOnNavigation(page, async () => {
      const failure = new Error(
        `page.evaluate: Execution context was destroyed (${failures.length})`,
      );
      failures.push(failure);
      throw failure;
    }).catch((reason: unknown) => reason);
    expect(failures).toHaveLength(3);
    expect(error).toBe(failures[2]);
  });
});

test("retryOnNavigation rethrows any other error at once", async () => {
  await withPage(async (page) => {
    await page.setContent("<p>Here</p>");
    const boom = new Error("boom");
    let calls = 0;
    const error = await retryOnNavigation(page, async () => {
      calls += 1;
      throw boom;
    }).catch((reason: unknown) => reason);
    expect(error).toBe(boom);
    expect(calls).toBe(1);
  });
});

test("retryOnNavigation tries again when a new document came in mid-attempt, though nothing threw", async () => {
  await withPage(async (page) => {
    await page.route("http://settle.test/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<p>A page</p>" }),
    );
    await page.goto("http://settle.test/first");

    let calls = 0;
    const seen = await retryOnNavigation(page, async () => {
      calls += 1;
      // The first attempt reads, then the page moves on before it returns, as a late commit
      // between `settle` and `collect` would: its read belongs to a document that is gone.
      const read = await page.evaluate(() => location.pathname);
      if (calls === 1) await page.goto("http://settle.test/second");
      return read;
    });

    expect(seen).toBe("/second");
    expect(calls).toBe(2);
  });
});

test("retryOnNavigation fails page_not_settled when every attempt sees a new document", async () => {
  await withPage(async (page) => {
    await page.route("http://settle.test/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<p>A page</p>" }),
    );
    await page.goto("http://settle.test/0");

    let calls = 0;
    const error = await rejection(
      retryOnNavigation(page, async () => {
        calls += 1;
        await page.goto(`http://settle.test/${calls}`);
      }),
      "page_not_settled",
    );

    expect(calls).toBe(3);
    expect(error.message).toContain("kept navigating");
  });
});

test("retryOnNavigation tries again only once the new page has loaded", async () => {
  await withPage(async (page) => {
    // The second page holds its image for 500 ms, so it is still loading when it first answers.
    await page.route("http://settle.test/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/slow.png") {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return route.fulfill({ contentType: "image/png", body: "" });
      }
      const body = path === "/second" ? '<p>Two</p><img src="/slow.png">' : "<p>One</p>";
      return route.fulfill({ contentType: "text/html", body });
    });
    await page.goto("http://settle.test/first");

    let calls = 0;
    const seen = await retryOnNavigation(page, () => {
      calls += 1;
      return page.evaluate((first) => {
        if (first) {
          location.assign("/second");
          return new Promise<string>(() => undefined);
        }
        return `${location.pathname} ${document.readyState}`;
      }, calls === 1);
    });
    expect(seen).toBe("/second complete");
    expect(calls).toBe(2);
  });
});

test("settle waits for a document that is still loading", async () => {
  await withPage(async (page) => {
    await page.route("http://settle.test/**", async (route) => {
      if (route.request().url().endsWith("/slow.png")) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        return route.fulfill({ contentType: "image/png", body: "" });
      }
      return route.fulfill({ contentType: "text/html", body: '<p>Here</p><img src="/slow.png">' });
    });
    await page.goto("http://settle.test/page", { waitUntil: "domcontentloaded" });
    expect(await page.evaluate(() => document.readyState)).not.toBe("complete");

    await settle(page);

    expect(await page.evaluate(() => document.readyState)).toBe("complete");
  });
});
