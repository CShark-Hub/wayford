/**
 * The self-check: a screen of the web app measured with the filter's own `collect` in Daylight and
 * in Night, and every element under Vera's floors (`docs/DESIGN.md`, "Checked by"). A Node module,
 * never bundled: it is the one place in web that imports the filter's main entry (`docs/STACK.md`,
 * "Package import rules").
 *
 * The screens are served core's fixtures, `demoRace` and the Jev run. `check:self` runs this file
 * under plain `tsx`, not Vite, so nothing it imports may reach Vite's `import.meta.glob`: that is
 * why `demoRace` has a module of its own, apart from the arena's other test data.
 */
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type Bbox,
  METRIC_NAMES,
  type MetricName,
  type PageMeasurement,
  type RunEvent,
  type RunId,
  type RunResult,
  runResultFromEvents,
  WayfordError,
} from "@wayford/core";
import {
  axeScanFixture,
  measurementFixture,
  profileFixture,
  reportFixture,
  runResultFixture,
  taskFixture,
} from "@wayford/core/fixtures";
import { collect } from "@wayford/filter";
import type { Page } from "playwright";
import { createServer } from "vite";
import { demoRace } from "../src/arena/demo-race.js";
import { runView } from "../src/arena/race.js";
import { fixtureSweep } from "../src/boundary/fixture-sweeps.js";
import { fixtureJevRun } from "../src/runs/fixture-runs.js";
import { THEME_NAMES, type Theme } from "../src/theme.js";

/**
 * Wayford passes its own cast: WCAG 2.2 AA contrast for text, and Vera's fixture thresholds of
 * 16 px text and 32 px targets (`docs/DESIGN.md`, "Principles", 5).
 */
export const SELF_CHECK_FLOOR = {
  contrast: 4.5,
  fontPx: 16,
  targetPx: 32,
} as const satisfies Record<MetricName, number>;

/** Both themes. Every screen is checked in each. */
export const SELF_CHECK_THEMES: readonly Theme[] = ["light", "dark"];

/** The projector's size: every screen is measured at it. */
export const SELF_CHECK_VIEWPORT = { width: 1280, height: 720 } as const;

/**
 * An io answer that is not a 200 JSON body: a status of its own, an event stream, an image. A
 * screen lists it in `responses` like any body, and the check sends it as it is.
 */
export class SelfCheckAnswer {
  constructor(
    readonly status: number,
    readonly contentType: string,
    readonly body: string | Buffer,
  ) {}
}

/** `body` as JSON under `status`, such as the 201 io answers a checked goal with. */
function jsonAnswer(body: unknown, status: number): SelfCheckAnswer {
  return new SelfCheckAnswer(status, "application/json", JSON.stringify(body));
}

/**
 * `events` as io streams a run (`packages/io/src/routes/runs.ts`): each a message with its index as
 * `id:`, its type as `event:` and itself as JSON in `data:`. A one-hour `retry:` leads them, so a
 * stream with no terminal event is not replayed by a reconnect while the screen is measured.
 */
export function eventStreamAnswer(events: readonly RunEvent[]): SelfCheckAnswer {
  const messages = events.map(
    (event, index) => `id: ${index}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
  );
  return new SelfCheckAnswer(200, "text/event-stream", `retry: 3600000\n\n${messages.join("")}`);
}

/**
 * A transparent 1 × 1 PNG, for a screenshot route. The check measures text and controls, never
 * pictures, so any image does.
 */
export const PNG_ANSWER = new SelfCheckAnswer(
  200,
  "image/png",
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=",
    "base64",
  ),
);

/** A screen that must pass, and the io responses it is served, keyed by path under /api. */
export interface SelfCheckScreen {
  name: string;
  /** Where the screen is, such as `/cast`. */
  path: string;
  /** Shown once the screen has its data; the check measures after it is visible. */
  ready: string;
  /**
   * Each keyed by its path under `/api`, such as `/runs`: a plain value is a 200 JSON body, and a
   * `SelfCheckAnswer` is sent as it says, such as the bytes of a PNG, as io's `/illustration`
   * answers.
   */
  responses: Record<string, unknown>;
  /**
   * A CSS selector whose elements the check skips: an element whose box centre lies inside one is
   * not held to the floors.
   */
  exclude?: string;
  /** Clicks that bring the screen to the state measured, run after it opens and before `ready`. */
  act?: (page: Page) => Promise<void>;
}

/** The race lane of the persona called `name`: an `<article>` its heading names. */
function laneOf(page: Page, name: string) {
  return page.getByRole("article", { name, exact: true });
}

/** The id io gives `demoRace` when the self-check starts it. */
const DEMO_RACE_ID = "race_demo";

/**
 * `demoRace` as io keeps it: on the hard goal, started at the fixture's first timestamp, with
 * `status`.
 */
function demoRaceRecord(status: "running" | "finished") {
  return {
    id: DEMO_RACE_ID,
    task: taskFixture("task_past-order"),
    startedAt: "2026-09-22T10:00:00.000Z",
    runs: demoRace.runs,
    status,
  };
}

/**
 * The History the start panel lists: `demoRace` running, and two earlier races of it finished,
 * newest first, as io lists them. Its rows are measured with the panel.
 */
const DEMO_HISTORY = [
  demoRaceRecord("running"),
  { ...demoRaceRecord("finished"), id: "race_demo-2", startedAt: "2026-09-22T09:50:00.000Z" },
  { ...demoRaceRecord("finished"), id: "race_demo-1", startedAt: "2026-09-22T09:40:00.000Z" },
];

/**
 * The Race with `demoRace`'s three runs started, each streaming its `events`. `act` checks the hard
 * goal, picks Ada, Kai and Vera, starts the race and waits for each lane's `waits`. io answers the
 * panel's History empty, the goal accepted as it stands (201), the three runs started as one race
 * (202), the race running when the screen opens it by its id, the hard goal's stored report, each
 * run's events as its stream, and every screenshot up to the latest of each, read off `runView`. A
 * lane shows only the latest once its stream has delivered, but a stream that arrived in two chunks
 * would draw an earlier one first, and an unlisted request fails the check.
 */
export function raceScreen({
  name,
  events,
  waits,
  ready,
}: {
  name: string;
  /** Each of `demoRace`'s runs' events, by run id. */
  events: ReadonlyMap<RunId, readonly RunEvent[]>;
  /**
   * What each lane shows once its stream has delivered, by persona: a string is an element's whole
   * text, a RegExp a pattern its text matches. One `ready` locator cannot prove that three streams
   * have.
   */
  waits: Readonly<Record<string, string | RegExp>>;
  ready: string;
}): SelfCheckScreen {
  const streams = [...events];
  return {
    name,
    path: "/race",
    ready,
    responses: {
      "/races": [],
      "/tasks": jsonAnswer({ task: taskFixture("task_past-order"), rewritten: false }, 201),
      "/runs": jsonAnswer({ raceId: DEMO_RACE_ID, runs: demoRace.runs }, 202),
      [`/races/${DEMO_RACE_ID}`]: demoRaceRecord("running"),
      // The hard goal's stored report, which the race reads as it opens, to lead to once over.
      "/reports/task_past-order": reportFixture("task_past-order"),
      ...Object.fromEntries(
        streams.map(([runId, runEvents]) => [
          `/runs/${runId}/events`,
          eventStreamAnswer(runEvents),
        ]),
      ),
      ...Object.fromEntries(
        streams.flatMap(([runId, runEvents]) =>
          Array.from({ length: (runView(runEvents).screenshotStep ?? -1) + 1 }, (_, step) => [
            `/runs/${runId}/steps/${step}/screenshot`,
            PNG_ANSWER,
          ]),
        ),
      ),
    },
    act: async (page) => {
      await page.getByRole("button", { name: "Check the goal", exact: true }).click();
      for (const persona of ["Ada", "Kai", "Vera"]) {
        await page.getByRole("button", { name: persona, exact: true }).click();
      }
      await page.getByRole("button", { name: "Start the race", exact: true }).click();
      for (const [persona, text] of Object.entries(waits)) {
        await laneOf(page, persona).getByText(text, { exact: true }).waitFor();
      }
    },
  };
}

/**
 * A finished race reopened from the History: `demoRace` drawn from its runs' records, Ada through
 * and Vera given up, and Kai's run, which io never stored, as a lost lane with its note in fault.
 * No stream is opened, so none is listed; the hard goal's stored report is, for the way on.
 */
function raceStoredScreen(): SelfCheckScreen {
  const [ada, kai, vera] = demoRace.runs;
  if (ada === undefined || kai === undefined || vera === undefined) {
    throw new Error("demoRace has no 3 runs");
  }
  const recorded = [ada, vera].map((run) => runResultFromEvents(demoRace.events.get(run.id) ?? []));
  const race = { ...demoRaceRecord("finished"), id: "race_demo-2" };
  return {
    name: "race-stored",
    path: `/race/${race.id}`,
    ready: 'role=article[name="Kai"s] >> text="Stream lost"',
    responses: {
      [`/races/${race.id}`]: race,
      "/reports/task_past-order": reportFixture("task_past-order"),
      [`/runs/${kai.id}`]: jsonAnswer({ error: `no stored run ${kai.id}` }, 404),
      ...Object.fromEntries(recorded.map((run) => [`/runs/${run.id}`, run])),
      ...Object.fromEntries(
        recorded.flatMap((run) => {
          const shot = run.steps.findLast((step) => step.screenshotPath !== undefined);
          return shot === undefined
            ? []
            : [[`/runs/${run.id}/steps/${shot.stepIndex}/screenshot`, PNG_ANSWER]];
        }),
      ),
    },
  };
}

/**
 * Run detail's `<h1>` once `run` has drawn, such as `Vera | 424242 | run_vera-hard-1`. The loading
 * screen's `<h1>` names the run id alone, so it does not stand for the run.
 */
export function runHeading(run: RunResult): string {
  const persona = profileFixture(run.profileId).label;
  return `role=heading[level=1][name="${persona} | ${run.seed} | ${run.id}"s]`;
}

/**
 * The answers a stored run's detail asks for at one step: the run, the screenshots of `steps`,
 * which are the step's own (After) and the one its page was observed in (Observed), and an empty
 * recording. The player asks for its video as it loads, and an empty one leaves it on its error
 * frame, which `collect` never measures: a `<video>` has no role it knows.
 */
export function runDetailResponses(
  run: RunResult,
  steps: readonly number[],
): Record<string, unknown> {
  return {
    [`/runs/${run.id}`]: run,
    ...Object.fromEntries(
      steps.map((step) => [`/runs/${run.id}/steps/${step}/screenshot`, PNG_ANSWER]),
    ),
    [`/runs/${run.id}/video`]: new SelfCheckAnswer(200, "video/webm", ""),
  };
}

/**
 * The Boundary is drawn once its headline shows and the top bar carries the sweep's stored badge.
 * The badge is a portal into the bar, which only a mounted shell draws, so this is where a screen
 * that drops it fails.
 */
const BOUNDARY_READY = [
  'body:has([data-slot="top-bar-slot"] [data-source="stored"])',
  'main h1:has-text("Under half get through")',
].join(" ");

/** The screens that must pass. The shell is measured around each of them. */
export const SELF_CHECK_SCREENS: readonly SelfCheckScreen[] = [
  {
    name: "cast",
    path: "/cast",
    ready: 'role=heading[name="Cast"s]',
    // The personas come bundled with the app, so the screen asks io for nothing.
    responses: {},
  },
  {
    name: "lens",
    path: "/lens",
    // Ready once the page is drawn and the axe-core card lists its scan.
    ready: 'main:has([data-state]):has(section[aria-label="axe-core"] li)',
    // Vera on the stored /deliveries, measured live, and its scan.
    responses: { "/measure": measurementFixture, "/axe": axeScanFixture("/deliveries") },
    // The drawn page keeps the target app's sizes, scaled down, on purpose: it is what the filter
    // measures (docs/DESIGN.md, "Checked by"). Its boxes are divs, which `collect` does not
    // measure today, so this is a guard: a box drawn as a heading, a paragraph or a control would
    // be skipped, not failed. The rail, the controls, the strip and the caption are checked.
    exclude: "[data-lens-stage]",
  },
  {
    name: "lens-illustration",
    path: "/lens?illustration=true",
    // Ready once io's picture is on the stage, the strip has its counts and the axe-core card
    // lists its scan. A blob, so the stored picture the Lens falls back to cannot stand in for
    // io's.
    ready: 'main:has(figure img[src^="blob:"]):has(dl dd p):has(section[aria-label="axe-core"] li)',
    // Vera, the default persona, on /deliveries: the strip's measurement and scan as the lens
    // entry has them, and her picture, desktop under blurredVision. Nothing is skipped: the view
    // draws no page, so its caption is held to the floors; the picture, an image, is not
    // measured. The loading line and the stored-picture banner show only before io's picture or
    // without it, and this entry does not reach them.
    responses: {
      "/measure": measurementFixture,
      "/axe": axeScanFixture("/deliveries"),
      "/illustration": new SelfCheckAnswer(
        200,
        "image/png",
        readFileSync(new URL("../public/illustration/desktop-blurredVision.png", import.meta.url)),
      ),
    },
  },
  {
    name: "race",
    path: "/race",
    ready: 'role=heading[name="finished · 2"s]',
    // The setup strip: the goals and the personas come bundled with the app. The History under it,
    // whose finished rows link the hard goal's stored report.
    responses: {
      "/races": DEMO_HISTORY,
      "/reports/task_past-order": reportFixture("task_past-order"),
    },
  },
  raceScreen({
    name: "race-live",
    events: demoRace.events,
    // Each lane's last event: Ada's place, Kai's step under way and Vera's last step.
    waits: { Ada: "1st", Kai: "5 steps so far", Vera: "5 steps" },
    ready: 'role=article[name="Vera"s] >> text="Gave up"',
  }),
  raceStoredScreen(),
  {
    name: "report",
    path: "/report/task_past-order",
    ready: "role=heading[name=/^Measurement/]",
    // The hard goal's report, which holds a finding of each certainty. The screen asks for no more.
    responses: { "/reports/task_past-order": reportFixture("task_past-order") },
  },
  {
    name: "boundary",
    path: "/boundary",
    ready: BOUNDARY_READY,
    // Vera's preset asks for her contrast sweeps; responses are keyed by path, so the query is not.
    responses: { "/sweeps": [fixtureSweep("swp_vera-contrast")] },
  },
  {
    name: "boundary · maxElements",
    path: "/boundary/swp_kai-max-elements",
    ready: BOUNDARY_READY,
    responses: { "/sweeps/swp_kai-max-elements": fixtureSweep("swp_kai-max-elements") },
  },
  {
    name: "run-detail",
    // Step 1 was observed on the page step 0's action left, so both screenshots are drawn.
    path: `/runs/${runResultFixture.id}?step=1`,
    ready: runHeading(runResultFixture),
    responses: runDetailResponses(runResultFixture, [0, 1]),
  },
  {
    name: "run-detail-jev",
    // Step 0, the one Jev drew: the start page has no screenshot, so only its own is asked for.
    path: `/runs/${fixtureJevRun.id}`,
    ready: runHeading(fixtureJevRun),
    responses: runDetailResponses(fixtureJevRun, [0]),
  },
];

export type Shortfall = { screen: string; key: string; role: string; name: string } & (
  | { metric: MetricName; value: number; floor: number }
  /** Text whose background `collect` could not resolve, so it has no contrast to compare. */
  | { metric: "unmeasured" }
);

/**
 * Every element under the floor, from a measurement. Pure. Each comparison is strict, as the
 * filter's `>=` passes a value at the floor. Text with a font size but no contrast stands on a
 * background `collect` could not read, which the filter's own AA check fails (`docs/RULES.md`, #125).
 *
 * An element whose box centre lies inside one of the `excluded` regions is skipped. The centre, not
 * the whole box, so an element clipped at a region's edge is skipped too.
 */
export function shortfalls(
  screen: string,
  measurement: PageMeasurement,
  excluded: readonly Bbox[] = [],
): Shortfall[] {
  const checked = measurement.elements.filter(
    ({ bbox }) => !excluded.some((region) => centreInside(bbox, region)),
  );
  // Every element gets every check: a control carries its label's contrast and font size, and the
  // schema keeps `targetPx` off text blocks.
  return checked.flatMap(({ key, role, name, metrics }): Shortfall[] => {
    const element = { screen, key, role, name };
    const unmeasured = metrics.fontPx !== undefined && metrics.contrast === undefined;
    return [
      ...(unmeasured ? [{ ...element, metric: "unmeasured" as const }] : []),
      ...METRIC_NAMES.flatMap((metric) => {
        const value = metrics[metric];
        const floor = SELF_CHECK_FLOOR[metric];
        return value !== undefined && value < floor ? [{ ...element, metric, value, floor }] : [];
      }),
    ];
  });
}

/** Whether `box`'s centre lies inside `region`, its edges included. */
function centreInside(box: Bbox, region: Bbox): boolean {
  const x = box.x + box.width / 2 - region.x;
  const y = box.y + box.height / 2 - region.y;
  return x >= 0 && x <= region.width && y >= 0 && y <= region.height;
}

/** The measurement, kept so a caller can see what was measured, and its shortfalls. */
export interface ScreenCheck {
  measurement: PageMeasurement;
  shortfalls: Shortfall[];
}

/**
 * Open `screen` on `origin` in `page` at the projector's size, with its io requests answered from
 * `responses`, run its `act`, and measure it once it is ready. A request to an `/api` path the
 * screen does not list throws a `WayfordError` with code `self_check_unanswered`, so a screen is
 * never measured empty.
 *
 * Given a theme, the page's system preference is set to it before the screen loads, so the boot
 * script in `index.html` opens the screen in it. A screen that opens in any other theme throws a
 * `WayfordError` with code `self_check_theme`, so a broken boot script cannot pass as Daylight
 * twice.
 *
 * Given `exclude`, the boxes of the elements it matches are read right after the measurement, in
 * the same viewport coordinates as each `bbox`, and what lies inside them is skipped. An `exclude`
 * that matches nothing throws a `WayfordError` with code `self_check_exclude`: the entry is broken,
 * and the screen would be checked whole without anyone seeing why.
 */
export async function checkScreen(
  page: Page,
  origin: string,
  screen: SelfCheckScreen,
  theme?: Theme,
): Promise<ScreenCheck> {
  await page.setViewportSize(SELF_CHECK_VIEWPORT);
  if (theme !== undefined) await page.emulateMedia({ colorScheme: theme });
  let unlisted: WayfordError | undefined;
  let reject: (error: WayfordError) => void = () => {};
  const firstUnlisted = new Promise<never>((_, onUnlisted) => {
    reject = onUnlisted;
  });
  // Handled here too, so a request the race no longer waits on is not an unhandled rejection.
  firstUnlisted.catch(() => {});

  // Anchored on the path: the glob `**/api/**` would catch Vite's modules under `src/api/` too.
  // A RegExp, unlike a function, lets Playwright pass every other request without asking Node.
  await page.route(/^https?:\/\/[^/]+\/api\//, (route) => {
    const path = new URL(route.request().url()).pathname.slice("/api".length);
    if (Object.hasOwn(screen.responses, path)) {
      const answer = screen.responses[path];
      if (answer instanceof SelfCheckAnswer) {
        const { status, contentType, body } = answer;
        return route.fulfill({ status, contentType, body });
      }
      return route.fulfill({ json: answer });
    }
    unlisted ??= notListed(screen, path);
    reject(unlisted);
    return route.fulfill({ status: 404, json: { error: "not listed for the self-check" } });
  });
  await page.goto(`${origin}${screen.path}`);
  // `act` races the first unlisted request too: a click can start a request the screen does not
  // list, and the check fails on it at once rather than waiting out `ready`.
  const opened = async () => {
    await screen.act?.(page);
    await page.locator(screen.ready).waitFor();
  };
  await Promise.race([opened(), firstUnlisted]);
  // So Geist is measured, not the fallback the page drew while it loaded.
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  if (theme !== undefined) {
    const shown = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    if (shown !== theme) {
      throw new WayfordError(
        "self_check_theme",
        `the ${screen.name} screen opened with data-theme ${JSON.stringify(shown)}, not in ${THEME_NAMES[theme]}`,
      );
    }
  }
  const measurement = await collect(page);
  const excluded = screen.exclude === undefined ? [] : await regions(page, screen.exclude);
  // A request made after the screen was ready may have changed what was measured.
  if (unlisted !== undefined) throw unlisted;
  if (screen.exclude !== undefined && excluded.length === 0) {
    throw new WayfordError(
      "self_check_exclude",
      `the ${screen.name} screen's exclude ${JSON.stringify(screen.exclude)} matches nothing`,
    );
  }
  return { measurement, shortfalls: shortfalls(screen.name, measurement, excluded) };
}

/** The box of every element `selector` matches, as `getBoundingClientRect` gives it. */
function regions(page: Page, selector: string): Promise<Bbox[]> {
  return page.locator(selector).evaluateAll((elements) =>
    elements.map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    }),
  );
}

function notListed(screen: SelfCheckScreen, path: string): WayfordError {
  return new WayfordError(
    "self_check_unanswered",
    `the ${screen.name} screen requested /api${path}, which its responses do not list`,
  );
}

const WEB_ROOT = fileURLToPath(new URL("../", import.meta.url));

/**
 * The web app on its own Vite dev server, for `check:self` and its test. Port 0, so a developer's
 * `pnpm dev` on 5173 does not stop either.
 */
export async function startWebApp(): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = await createServer({
    root: WEB_ROOT,
    configFile: `${WEB_ROOT}vite.config.ts`,
    logLevel: "silent",
    server: { port: 0 },
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (url === undefined) {
    await server.close();
    throw new Error("the web dev server reported no local URL");
  }
  return { origin: url.replace(/\/$/, ""), close: () => server.close() };
}
