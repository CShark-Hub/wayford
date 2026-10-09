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
  Task,
  WayfordError,
} from "@wayford/core";
import {
  axeScanFixture,
  groundTruthFixture,
  measurementFixture,
  profileFixture,
  reportFixture,
  runResultFixture,
  taskFixture,
  taskFixtures,
} from "@wayford/core/fixtures";
import { collect } from "@wayford/filter";
import type { Page } from "playwright";
import { createServer } from "vite";
import { demoRace } from "../src/arena/demo-race.js";
import { runView } from "../src/arena/race.js";
import { fixtureSweep } from "../src/boundary/fixture-sweeps.js";
import { fixtureJevRun, fixtureRuns } from "../src/runs/fixture-runs.js";
import { runLabel } from "../src/runs/run-label.js";
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
   * Each keyed by its path under `/api`, such as `/runs`, which answers any method, or by a method
   * and that path, such as `POST /tasks`, which answers that method alone and comes first. A plain
   * value is a 200 JSON body, and a `SelfCheckAnswer` is sent as it says, such as the bytes of a
   * PNG, as io's `/illustration` answers.
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

/**
 * A task io has stored off the target app: the hard goal moved to https://example.com/, under a
 * ULID id as io's `newId` gives one. The Race lists it as a stored goal, already checked.
 */
export const FOREIGN_TASK: Task = Task.parse({
  ...taskFixture("task_past-order"),
  id: "task_01k70f8x2m4n6p8q0r2s4t6v8w",
  startUrl: "https://example.com/",
});

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
 * panel's History empty, its stored goals with `FOREIGN_TASK`, the goal accepted as it stands
 * (201), the three runs started as one race (202), the race running when the screen opens it by
 * its id, the hard goal's stored report, each run's events as its stream, and every screenshot up
 * to the latest of each, read off `runView`. A lane shows only the latest once its stream has
 * delivered, but a stream that arrived in two chunks would draw an earlier one first, and an
 * unlisted request fails the check.
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
      "/tasks": [FOREIGN_TASK],
      "POST /tasks": jsonAnswer({ task: taskFixture("task_past-order"), rewritten: false }, 201),
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
  return `role=heading[level=1][name="${persona} | ${run.seed} | ${runLabel(run.id)}"s]`;
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
 * The Target screen's form, filled as a person would, a start URL, the goal sentence and a URL
 * pattern, and then checked. Found by id: the pattern's input shares its name, "URL pattern", with
 * the kind's radio.
 */
async function checkTarget(page: Page): Promise<void> {
  await page.locator("#target-start-url").fill("https://example.com/");
  await page.locator("#target-goal").fill("you want to see what you ordered three months ago");
  await page.locator("#target-success").fill("**/deliveries/archive");
  await page.getByRole("button", { name: "Check the goal", exact: true }).click();
}

/** The goal the Target screen's goal view entries open: the hard goal, stored, with its Scout. */
const TARGET_TASK = taskFixture("task_past-order");

/**
 * The hard goal on a long host, under its own ULID id. The top bar's `00 Target` names the host,
 * so this is the longest name the bar carries.
 */
export const LONG_HOST_TASK: Task = Task.parse({
  ...taskFixture("task_past-order"),
  id: "task_01k70g3c5e7g9j1k3m5p7r9t1v",
  startUrl: "https://checkout-and-order-history.a-rather-long-subdomain.example-shop.co.uk/",
});

/**
 * io's answers for the goal view of the goal under `taskId`: its Scout, the hard goal's ground
 * truth, and its stored report, which the goal view reads for its link: none.
 */
function goalResponses(taskId: Task["id"]) {
  return {
    [`/tasks/${taskId}/scout`]: groundTruthFixture,
    [`GET /reports/${taskId}`]: jsonAnswer({ error: `no report on ${taskId}` }, 404),
  };
}

/** The goal view, drawn once Scout's line has replaced its skeleton. */
const TARGET_GOAL_READY = 'main:has(section:has-text("Scout reached it in"))';

/** Ada and Vera on seeds 1 to 3, as io's `POST /runs` starts them, seed-major. */
const TARGET_RUNS = [1, 2, 3].flatMap((seed) =>
  ["ada", "vera"].map((persona) => ({
    id: `run_target-${persona}-${seed}`,
    profileId: `prof_${persona}`,
    seed,
  })),
);

/** The Boundary is drawn once its headline shows. */
const BOUNDARY_READY = 'main h1:has-text("Under half get through")';

/** The screens that must pass. The shell is measured around each of them. */
export const SELF_CHECK_SCREENS: readonly SelfCheckScreen[] = [
  {
    name: "cast",
    path: "/cast",
    ready: 'role=heading[level=1][name="01 · the cast"s]',
    // The personas come bundled with the app, so the screen asks io for nothing.
    responses: {},
  },
  {
    name: "cast-card",
    path: "/cast",
    // Vera's spec sheet, which opens only while her tile is hovered. It renders in a portal under
    // `<body>`, outside her column, so it is measured here, in both themes, with its own slot.
    ready: "#cast-card-prof_vera",
    responses: {},
    act: async (page) => {
      await page.locator("#cast-prof_vera").hover();
    },
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
    name: "lens · url",
    // A page off the target app, by its whole URL: the URL row shown and filled, the live line
    // naming it. Ready on the URL page's own copy, so a refused url= that fell back to /deliveries
    // would not pass as this entry. The row shows only once its button is pressed (#224).
    path: "/lens?url=https://example.com/",
    ready:
      'main:has([data-state]):has(section[aria-label="axe-core"] li):has-text("https://example.com/ on desktop, opened as given")',
    act: async (page) => {
      await page.getByRole("button", { name: "Open a URL", exact: true }).click();
      await page.locator("#lens-url").waitFor();
    },
    // The lens entry's measurement and scan, the measurement at the URL asked for, asked for with
    // url= rather than page=; responses are keyed by path, so the query is not. The drawn page is
    // skipped as the lens entry skips it.
    responses: {
      "/measure": { ...measurementFixture, url: "https://example.com/" },
      "/axe": axeScanFixture("/deliveries"),
    },
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
    // Ready once io's stored goals are listed and the History is drawn, so the select is measured,
    // not its skeleton, and so are the History's rows.
    ready: 'main:has(#arena-stored-goal) >> role=heading[name="finished · 2"s]',
    // The setup strip: the presets and the personas come bundled with the app, and io lists one
    // stored goal beside them. The History under it, whose finished rows link the hard goal's
    // stored report.
    responses: {
      "/tasks": [FOREIGN_TASK],
      "/races": DEMO_HISTORY,
      "/reports/task_past-order": reportFixture("task_past-order"),
    },
  },
  {
    name: "race · stored goal",
    // A link from the Target screen: the panel opens on the stored goal, checked, its start shown.
    // The History under it lists no race.
    path: `/race?task=${FOREIGN_TASK.id}`,
    ready: "text=/^start · /",
    responses: { "/tasks": [FOREIGN_TASK], "/races": [] },
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
    name: "runs",
    path: "/runs",
    // Ready once the table has its rows.
    ready: "main:has(table tbody tr)",
    // Every fixture run, with a persona that is not bundled and both limits among them, and the
    // tasks that label their goals.
    responses: { "/runs": fixtureRuns, "/tasks": taskFixtures },
  },
  {
    name: "target",
    path: "/target",
    ready: 'role=button[name="Check the goal"s]',
    // The empty form asks io for nothing.
    responses: {},
  },
  {
    name: "target · refused",
    path: "/target",
    ready: 'text="The goal still names the way after a repair round"',
    // The form filled and checked, and the goal refused with what still names the way.
    responses: {
      "POST /tasks": jsonAnswer(
        {
          error: "the goal still names a screen: Order archive",
          goal: "you want to open the order archive",
          survived: ["Order archive"],
        },
        422,
      ),
    },
    act: checkTarget,
  },
  {
    name: "target · accepted",
    // The form filled and checked, the goal accepted, and the goal view drawn from the task the
    // check cached under its id. Only `POST /tasks` is listed, so a goal view that read the goal
    // back with `GET /tasks` would make an unlisted request and fail the entry at once.
    path: "/target",
    ready: TARGET_GOAL_READY,
    responses: {
      "POST /tasks": jsonAnswer({ task: TARGET_TASK, rewritten: false }, 201),
      ...goalResponses(TARGET_TASK.id),
    },
    act: async (page) => {
      await checkTarget(page);
      await page.waitForURL(`**/target?task=${TARGET_TASK.id}`);
      // The goal's heading takes focus, so a screen reader reads the accepted goal out.
      await page.locator("main h1:focus").waitFor();
    },
  },
  {
    name: "target · report",
    // A reload of an accepted goal, the task read back from io, then a set run to its report.
    path: `/target?task=${TARGET_TASK.id}`,
    // The set has ended and the report is written: its link, the progress gone, the button back.
    ready: 'role=link[name="Open the report"s]',
    // Ada and Vera on three seeds: six runs, each stored at the first poll, then the report, which
    // io holds none of until the Analyst's POST answers.
    responses: {
      "/tasks": [TARGET_TASK],
      ...goalResponses(TARGET_TASK.id),
      "POST /runs": jsonAnswer({ raceId: "race_target", runs: TARGET_RUNS }, 202),
      ...Object.fromEntries(TARGET_RUNS.map((run) => [`/runs/${run.id}`, runResultFixture])),
      [`POST /reports/${TARGET_TASK.id}`]: jsonAnswer(reportFixture(TARGET_TASK.id), 201),
    },
    act: async (page) => {
      await page.locator(TARGET_GOAL_READY).waitFor();
      for (const persona of ["Ada", "Vera"]) {
        await page.getByRole("button", { name: persona, exact: true }).click();
      }
      await page.getByRole("button", { name: "Start 6 runs on the LLM", exact: true }).click();
    },
  },
  {
    name: "target · nav",
    // The bar with a target, on a long host. Only the Target screen sets the target (D12), so the
    // entry opens the goal view, and is ready once the bar's `00 Target` link names the host.
    path: `/target?task=${LONG_HOST_TASK.id}`,
    ready: `body:has(${TARGET_GOAL_READY}):has(header nav a:has-text("checkout-and-order-history"))`,
    responses: {
      "/tasks": [LONG_HOST_TASK],
      ...goalResponses(LONG_HOST_TASK.id),
    },
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
 *
 * The page prefers reduced motion, which sets every duration to 0 (`docs/DESIGN.md`, "Motion"), so
 * what is measured is the state a screen settles in, never a colour halfway through its 160 ms
 * transition: a button `act` just enabled would otherwise be measured on its way from the disabled
 * look, and a browser that draws no animation frames would leave it there.
 */
export async function checkScreen(
  page: Page,
  origin: string,
  screen: SelfCheckScreen,
  theme?: Theme,
): Promise<ScreenCheck> {
  await page.setViewportSize(SELF_CHECK_VIEWPORT);
  await page.emulateMedia({ reducedMotion: "reduce", ...(theme && { colorScheme: theme }) });
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
    const request = route.request();
    const path = new URL(request.url()).pathname.slice("/api".length);
    // The method's own answer first, then the path's, which answers any method.
    const key = [`${request.method()} ${path}`, path].find((k) =>
      Object.hasOwn(screen.responses, k),
    );
    if (key !== undefined) {
      const answer = screen.responses[key];
      if (answer instanceof SelfCheckAnswer) {
        const { status, contentType, body } = answer;
        return route.fulfill({ status, contentType, body });
      }
      return route.fulfill({ json: answer });
    }
    unlisted ??= notListed(screen, `${request.method()} /api${path}`);
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

/** The failure for `request`, a method and a path such as `GET /api/tasks`, which no answer of `screen` takes. */
function notListed(screen: SelfCheckScreen, request: string): WayfordError {
  return new WayfordError(
    "self_check_unanswered",
    `the ${screen.name} screen requested ${request}, which its responses do not list`,
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
