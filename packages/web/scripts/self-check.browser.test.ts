/**
 * The self-check (`docs/DESIGN.md`, "Checked by"). Pages built to fail, and one drawn only from
 * the answer it reads, are served by `page.route` on a fake origin, since `collect` needs an
 * http(s) URL. Then every listed screen runs in each theme against the web app on its own Vite dev
 * server, as `pnpm test` runs it in CI. The races there show `eventStreamAnswer` and `act` at work:
 * each lane is drawn from its event stream, after the clicks `act` makes. Run detail, as the list
 * opens it, is read for its source badge, and on Jev's step for the row of labels under the draw,
 * which ends inside the 720 px view. The race is read live, as race-live and again with a detail
 * line in every lane, for its badge and its fit in one 1280 × 720 view, and once every run has
 * ended, for no badge at all. Run detail's ← and → are pressed on the page itself, and its
 * screenshot crop is measured against the click point and the flag that names the action.
 */
import { RunEvent, RunResult } from "@wayford/core";
import { runEventFixtures, runResultFixture } from "@wayford/core/fixtures";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, onTestFinished, test, vi } from "vitest";
import type { StartedRun } from "../src/api/runs.js";
import { demoRace, eventsOf } from "../src/arena/demo-race.js";
import { stuckRun } from "../src/arena/fixture-race.js";
import { THEME_NAMES } from "../src/theme.js";
import {
  checkScreen,
  eventStreamAnswer,
  raceScreen,
  runDetailResponses,
  runHeading,
  SELF_CHECK_SCREENS,
  SELF_CHECK_THEMES,
  SELF_CHECK_VIEWPORT,
  SelfCheckAnswer,
  type SelfCheckScreen,
  shortfalls,
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

  test("a shortfall inside an exclude region is skipped, one outside it is not", async () => {
    // Both paragraphs are 3:1. The one in `#stage` is measured, as `shortfalls` without the
    // excluded regions shows, and only the exclusion keeps it out of the check.
    const page = await fakePage(`
      <h1 style="font-size: 32px">Self-check</h1>
      <div id="stage"><p style="color: #949494">Inside the stage</p></div>
      <p style="color: #949494">Outside the stage</p>`);
    const check = await checkScreen(page, FAKE_ORIGIN, { ...FAKE_SCREEN, exclude: "#stage" });
    const faint = { ...FAKE, role: "paragraph", metric: "contrast", floor: 4.5 };
    const outside = { ...faint, name: "Outside the stage", value: expect.closeTo(3.03, 2) };
    expect(check.shortfalls).toEqual([outside]);
    expect(shortfalls(FAKE_SCREEN.name, check.measurement)).toEqual([
      { ...faint, name: "Inside the stage", value: expect.closeTo(3.03, 2) },
      outside,
    ]);
  });

  test("an exclude that matches nothing fails, naming the selector", async () => {
    // A typo in the selector would check the screen whole, and hide that the entry is broken.
    const page = await fakePage(`<h1 style="font-size: 32px">Self-check</h1>`);
    await expect(
      checkScreen(page, FAKE_ORIGIN, { ...FAKE_SCREEN, exclude: "#stage" }),
    ).rejects.toMatchObject({
      code: "self_check_exclude",
      message: expect.stringContaining("#stage"),
    });
  });

  test("an act that waits on an unlisted /api path fails at once, naming the path", async () => {
    // The click asks io for `/api/sweeps`, and `act` then waits for what its answer would draw, as
    // race-live's waits for each lane's last event. Run outside the race against the first unlisted
    // request, `act` would instead wait out its own 10 s and throw a TimeoutError.
    const page = await fakePage(`
      <h1 style="font-size: 32px">Self-check</h1>
      <button style="padding: 16px"
        onclick="fetch('/api/sweeps').then((response) => response.ok && document.body.append('Swept'))">Sweep</button>`);
    const screen: SelfCheckScreen = {
      ...FAKE_SCREEN,
      act: async (opened) => {
        await opened.getByRole("button", { name: "Sweep" }).click();
        await opened.getByText("Swept").waitFor({ timeout: 10_000 });
      },
    };
    await expect(checkScreen(page, FAKE_ORIGIN, screen)).rejects.toMatchObject({
      code: "self_check_unanswered",
      message: expect.stringContaining("/api/sweeps"),
    });
  });
});

test("every screen is checked in both themes", () => {
  // Dropping Night from the list would leave every test below green, with Night's floors checked
  // only when someone reads `check:self`'s summary line.
  expect(SELF_CHECK_THEMES).toEqual(["light", "dark"]);
});

/** The listed screen called `name`. One the list lacks fails the test that asks for it. */
function listedScreen(name: string): SelfCheckScreen {
  const screen = SELF_CHECK_SCREENS.find((listed) => listed.name === name);
  if (screen === undefined) throw new Error(`SELF_CHECK_SCREENS lists no ${name} screen`);
  return screen;
}

/** What ends Vera's run in the detail race: the tool failing, not the persona. */
const ACTOR_ERROR = "Actor model answered 500: the upstream provider timed out after 30 s";

/**
 * `eventsOf`'s `changes` for the detail race: each narration said twice over, so it runs past the
 * one line a lane gives it under a detail line, and a second line would make the lane taller.
 */
function saidTwice(event: RunEvent): object {
  return event.type === "narration" ? { text: `${event.text} ${event.text}` } : {};
}

/** `events` as io streams them, then a `stepObserved` message core rejects, which ends the stream. */
function streamBrokenAfter(events: readonly RunEvent[]): SelfCheckAnswer {
  const { status, contentType, body } = eventStreamAnswer(events);
  const broken = `id: ${events.length}\nevent: stepObserved\ndata: {"type":"stepObserved"}\n\n`;
  return new SelfCheckAnswer(status, contentType, `${body.toString()}${broken}`);
}

/** `demoRace`'s three runs, Ada's, Kai's and Vera's, in the order the panel starts them. */
function demoRuns(): [StartedRun, StartedRun, StartedRun] {
  const [ada, kai, vera] = demoRace.runs;
  if (ada === undefined || kai === undefined || vera === undefined) {
    throw new Error("demoRace has no 3 runs");
  }
  return [ada, kai, vera];
}

/**
 * The Race opened as race-live is, with a detail line in every lane: Ada stuck, Kai's stream lost
 * to a message core rejects, and Vera's run ended by an error. Ada has not ended, so the race is
 * still live, and its header keeps the line that says why New race waits.
 */
function raceDetailScreen(): SelfCheckScreen {
  const [ada, kai, vera] = demoRuns();
  const finished = runEventFixtures.at(-1);
  if (finished?.type !== "runFinished") throw new Error("the fixture stream ends in runFinished");
  const { outcome: _outcome, ...end } = finished;
  const failed = RunEvent.parse({ ...end, type: "runFailed", error: ACTOR_ERROR });
  const kaiEvents = eventsOf(kai, runEventFixtures.slice(0, 16), saidTwice);
  const screen = raceScreen({
    name: "race-detail",
    events: new Map([
      // Up to step 5's observation: steps 3 and 4 both left /settings as it was.
      [ada.id, eventsOf(ada, stuckRun.slice(0, 18), saidTwice)],
      [kai.id, kaiEvents],
      [vera.id, eventsOf(vera, [...runEventFixtures.slice(0, -1), failed], saidTwice)],
    ]),
    waits: { Ada: /Stuck: the last 2 steps/, Kai: /Stream lost: last seen/, Vera: ACTOR_ERROR },
    ready: 'role=article[name="Vera"s] >> text="Error"',
  });
  return {
    ...screen,
    responses: { ...screen.responses, [`/runs/${kai.id}/events`]: streamBrokenAfter(kaiEvents) },
  };
}

/**
 * The Race once every run has ended: `demoRace` with Kai's run played to its end, as Vera's whole
 * fixture run made his own. Ada gets through, as in `demoRace`, and Kai and Vera both give up.
 */
function raceEndedScreen(): SelfCheckScreen {
  const [, kai] = demoRuns();
  return raceScreen({
    name: "race-ended",
    // A Map keeps a key where it was first set, so Kai's new events keep his lane second.
    events: new Map([...demoRace.events, [kai.id, eventsOf(kai, runEventFixtures)]]),
    waits: { Ada: "Got through", Kai: "Gave up", Vera: "Gave up" },
    ready: 'role=article[name="Kai"s] >> text="Gave up"',
  });
}

describe("on the web app", () => {
  // Only these tests need the web app, so only they start it.
  let app: Awaited<ReturnType<typeof startWebApp>>;

  beforeAll(async () => {
    app = await startWebApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("every listed screen passes", () => {
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

  describe("the Race and run detail, as the self-check opens them", () => {
    // `collect` measures text blocks and controls, and a badge is neither, so these read the page
    // itself once `checkScreen` has measured it. The badge's source comes from the screen's data.

    /** The top bar's slot, where a screen puts its source badge. */
    const topBarSlot = (page: Page) => page.locator('[data-slot="top-bar-slot"]');

    test.each([
      ["run-detail", "llm"],
      ["run-detail-jev", "jev"],
    ])("%s: the top bar says stored, and names the %s backend", async (name, backend) => {
      const page = await newPage();
      await checkScreen(page, app.origin, listedScreen(name), "light");
      const slot = topBarSlot(page);
      expect(await slot.locator('[data-source="stored"]').count()).toBe(1);
      expect(await slot.locator('[data-source="live"]').count()).toBe(0);
      expect(await slot.getByText(backend, { exact: true }).count()).toBe(1);
    });

    test("run-detail-jev in Daylight: the row of labels under Jev's draw ends inside 720 px", async () => {
      // Demo beat 5 reads Jev's options with their probabilities without a scroll. The full list
      // falls below the fold, so the row under the bar is what the room reads, and it must show.
      const page = await newPage();
      await checkScreen(page, app.origin, listedScreen("run-detail-jev"), "light");
      const row = await page.locator("[data-labels]").boundingBox();
      if (row === null) throw new Error("Jev's step lays out no [data-labels]");
      expect(row.y + row.height).toBeLessThanOrEqual(SELF_CHECK_VIEWPORT.height);
    });

    test.each(
      (
        [
          // No detail line, so each narration is given two lines, and shows whole in them.
          [listedScreen("race-live"), { detail: false, cut: false }],
          // A detail line in every lane, which takes the narration's second line. Each narration
          // is said twice, so it runs past the one line left: were it given two, the lane would
          // be 24 px taller, and the page 30 px over 720.
          [raceDetailScreen(), { detail: true, cut: true }],
        ] as const
      ).flatMap(([screen, lane]) =>
        SELF_CHECK_THEMES.map(
          (theme) => [screen.name, THEME_NAMES[theme], screen, lane, theme] as const,
        ),
      ),
    )(
      "%s in %s: the top bar says live, and three lanes fit 1280 × 720 with no scroll",
      async (_name, _theme, screen, lane, theme) => {
        // Either race can be the taller, so the fit is measured on both: padding a lane with no
        // detail line would push race-live over 720 and leave race-detail as it was.
        const page = await newPage();
        await checkScreen(page, app.origin, screen, theme);
        const slot = topBarSlot(page);
        expect(await slot.locator('[data-source="live"]').count()).toBe(1);
        expect(await slot.locator('[data-source="stored"]').count()).toBe(0);
        // Whether each lane draws a detail line, and whether its clamp cuts its narration short.
        const lanes = await page.locator("article").evaluateAll((articles) =>
          articles.map((article) => {
            const narration = article.querySelector("p:not([data-detail])");
            return {
              detail: article.querySelector("[data-detail]") !== null,
              cut: narration !== null && narration.scrollHeight > narration.clientHeight,
            };
          }),
        );
        expect(lanes).toEqual([1, 2, 3].map(() => lane));
        const height = await page.evaluate(() => document.scrollingElement?.scrollHeight);
        expect(height).toBeLessThanOrEqual(SELF_CHECK_VIEWPORT.height);
      },
    );

    test("the race once every run has ended: the top bar holds no badge", async () => {
      const page = await newPage();
      await checkScreen(page, app.origin, raceEndedScreen(), "light");
      // The race holds nothing stored, and no stream is left to bring an event. The slot is there,
      // so a count of 0 inside it is the badge gone, not a slot that was never drawn.
      const slot = topBarSlot(page);
      expect(await slot.count()).toBe(1);
      expect(await slot.locator("[data-source]").count()).toBe(0);
    });
  });

  /**
   * run-detail opened on `shown`, the fixture run unless named, at `?step=<step>`. Served as the
   * listed screen is, under `shown`'s own id: the run, an empty recording, and the screenshot of
   * every step, since the keys visit them all. Ready once the `<h1>` names `shown`.
   */
  async function runDetailAt(step: number, shown: RunResult = runResultFixture): Promise<Page> {
    const page = await newPage();
    await checkScreen(
      page,
      app.origin,
      {
        ...listedScreen("run-detail"),
        path: `/runs/${shown.id}?step=${step}`,
        ready: runHeading(shown),
        // Every step's screenshot, since a key press opens the steps beside this one.
        responses: runDetailResponses(
          shown,
          shown.steps.map(({ stepIndex }) => stepIndex),
        ),
      },
      "light",
    );
    return page;
  }

  describe("run detail's screenshot crop, measured", () => {
    // The replay's own tests read the click point's place in the frame from the markup. These lay
    // the page out in Chromium, so they show the frame moving the point into the 180 px crop, and
    // the flag naming the action turning to stay inside it.

    /**
     * The fixture run under `id`, its step 0's click target, e3, moved down the page to `y`, with
     * its 36 px height.
     */
    function runWithTargetAt(id: string, y: number): RunResult {
      return RunResult.parse({
        ...runResultFixture,
        id,
        steps: runResultFixture.steps.map((step) =>
          step.stepIndex !== 0
            ? step
            : {
                ...step,
                fullObservation: {
                  ...step.fullObservation,
                  elements: step.fullObservation.elements.map((element) =>
                    element.ref === "e3" ? { ...element, bbox: { ...element.bbox, y } } : element,
                  ),
                },
              },
        ),
      });
    }

    /** e3 at 382 to 418 of the 800 px viewport: its centre is the page's middle. */
    const midRun = runWithTargetAt("run_vera-hard-mid", 382);

    /**
     * e3 at 740 to 776 of the 800 px viewport, which only a frame moved up brings into the crop.
     * There the page ends 24 viewport px under the box, about 12 px at the frame's drawn scale,
     * the flag's own gap, so a flag hung below the box would fall wholly outside the crop.
     */
    const lowRun = runWithTargetAt("run_vera-hard-low", 740);

    /** A box as Chromium lays it out, in the page's pixels. */
    type Box = { x: number; y: number; width: number; height: number };

    /** The box of the element `selector` finds in the Observed figure. */
    async function observedBox(page: Page, selector: string): Promise<Box> {
      const box = await page.locator(`figure[data-shot="observed"] ${selector}`).boundingBox();
      if (box === null) throw new Error(`the Observed figure lays out no ${selector}`);
      return box;
    }

    /** How far `box` runs past each side of `crop`, in px: 0 on a side it stays inside. */
    function overrun(box: Box, crop: Box) {
      return {
        left: Math.max(0, crop.x - box.x),
        top: Math.max(0, crop.y - box.y),
        right: Math.max(0, box.x + box.width - (crop.x + crop.width)),
        bottom: Math.max(0, box.y + box.height - (crop.y + crop.height)),
      };
    }

    /** A box's vertical centre. */
    const middle = (box: Box) => box.y + box.height / 2;

    // Near the top, the frame stops at the page's top; low on the page, at its bottom. Mid-page
    // neither edge stops it, so it centres the click point in the crop.
    test.each([
      ["near the top", runResultFixture, "top"],
      ["mid-page", midRun, "middle"],
      ["low on the page", lowRun, "bottom"],
    ] as const)(
      "step 0's click point %s and its flag lie inside the crop",
      async (_where, shown, stop) => {
        const page = await runDetailAt(0, shown);
        const crop = await observedBox(page, "[data-crop]");
        const frame = await observedBox(page, "[data-frame]");
        const click = await observedBox(page, "[data-click]");
        // The flag naming the action, the click point's last child: under the box, or over it low
        // on the page.
        const flag = await observedBox(page, "[data-click] > span:last-child");
        // The crop is as tall as `run-detail.html`'s `.shot`, and the frame keeps the viewport's
        // shape.
        expect(crop.height).toBe(180);
        expect(frame.width / frame.height).toBeCloseTo(1280 / 800, 2);
        const none = { left: 0, top: 0, right: 0, bottom: 0 };
        expect(overrun(click, crop)).toEqual(none);
        expect(overrun(flag, crop)).toEqual(none);
        // The frame covers the crop inside its 1 px border, so no band of the crop is left blank,
        // and it moves no further than that: the page's edge nearest the click meets the border.
        const inside = { top: crop.y + 1, bottom: crop.y + crop.height - 1 };
        const framed = { top: frame.y, bottom: frame.y + frame.height };
        expect(framed.top).toBeLessThanOrEqual(inside.top);
        expect(framed.bottom).toBeGreaterThanOrEqual(inside.bottom);
        if (stop === "middle") {
          expect(Math.abs(middle(click) - middle(crop))).toBeLessThanOrEqual(1);
        } else {
          expect(framed[stop]).toBeCloseTo(inside[stop], 1);
        }
      },
    );
  });

  describe("run detail's ← and →, pressed on the page", () => {
    // `stepKeyDelta` and `neighbourStep` are tested alone. These press the keys in Chromium, so
    // they show the window's listener moving `?step`, a Radix tab handling its own arrows before
    // the window sees them, and a focused video keeping them.
    const indexes = runResultFixture.steps.map((step) => step.stepIndex).toSorted((a, b) => a - b);

    /**
     * The `?step` of the page's URL, read in the page. The listener navigates as it handles the
     * key, so by the time a press has returned, a move has changed the URL.
     */
    function stepIn(page: Page): Promise<string | null> {
      return page.evaluate(() => new URL(window.location.href).searchParams.get("step"));
    }

    /** Waits until the replay shows the step `index`, by its heading. */
    async function shown(page: Page, index: number): Promise<void> {
      await page.getByRole("heading", { name: `Step ${index}`, exact: true }).waitFor();
    }

    /** Takes focus off whatever holds it, so the next key goes to the page. */
    async function blur(page: Page): Promise<void> {
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      });
    }

    test("→ opens the next step and ← the one before, each as its ?step", async () => {
      const page = await runDetailAt(1);
      await page.keyboard.press("ArrowRight");
      await shown(page, 2);
      expect(await stepIn(page)).toBe("2");
      await page.keyboard.press("ArrowLeft");
      await shown(page, 1);
      expect(await stepIn(page)).toBe("1");
    });

    test("→ at the last step moves nothing", async () => {
      const [before, last] = indexes.slice(-2);
      if (before === undefined || last === undefined) throw new Error("the run has no 2 steps");
      const page = await runDetailAt(last);
      await page.keyboard.press("ArrowRight");
      expect(await stepIn(page)).toBe(String(last));
      // Past the end, the URL would name a step the run does not hold, and ← would open the first.
      await page.keyboard.press("ArrowLeft");
      await shown(page, before);
      expect(await stepIn(page)).toBe(String(before));
    });

    test("→ on a Step evidence tab moves to the next tab and leaves ?step as it was", async () => {
      const page = await runDetailAt(1);
      await page.getByRole("tab", { name: /^Filtered out/ }).focus();
      await page.keyboard.press("ArrowRight");
      await page.getByRole("tab", { name: /^Dice/, selected: true }).waitFor();
      expect(await stepIn(page)).toBe("1");
      // Back on the page, ← moves from step 1, so → on the tab left the step where it was.
      await blur(page);
      await page.keyboard.press("ArrowLeft");
      await shown(page, 0);
      expect(await stepIn(page)).toBe("0");
    });

    test("← and → on the focused video leave ?step as it was", async () => {
      const page = await runDetailAt(1);
      await page.locator("video").focus();
      expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("VIDEO");
      for (const key of ["ArrowRight", "ArrowLeft"]) {
        await page.keyboard.press(key);
        expect(await stepIn(page)).toBe("1");
      }
      // Back on the page, → moves from step 1, so neither key on the video moved it.
      await blur(page);
      await page.keyboard.press("ArrowRight");
      await shown(page, 2);
      expect(await stepIn(page)).toBe("2");
    });
  });
});
