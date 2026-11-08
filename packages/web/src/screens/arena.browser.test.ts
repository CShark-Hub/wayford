/**
 * The Race in a real browser (issue #194): the web app on its own Vite dev server, in Chromium at
 * 1280 × 720, with io's `/api` answered by `page.route` per path and a 404 for anything else. Each
 * run's events are served as io streams them, from the first, so a race reopened midway shows its
 * lanes as they stand.
 *
 * - A race started, left for the Cast and reached again by the Race tab is the same race, on its
 *   own URL.
 * - A reload on a race's URL brings it back.
 * - Two races running at once are both in the History, and each opens.
 * - A finished race stays in the History, links to its report, and opens from its runs' records,
 *   with no stream.
 * - A race with a run still waiting for a slot offers Stop race (#6). Its confirmation opens on
 *   "Keep running", and Esc and "Keep running" close it with nothing sent. Confirmed on a race
 *   opened by its URL, it posts one stop for the URL's race, and the trigger reads "Stopping…"
 *   until the dropped run's end comes down its stream.
 */
import { fileURLToPath } from "node:url";
import { type RunEvent, runResultFromEvents, type StartedRun } from "@wayford/core";
import { runEventFixtures, taskFixture } from "@wayford/core/fixtures";
import { type Browser, chromium, type Page, type Route } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, expect, onTestFinished, test, vi } from "vitest";
import type { Race } from "../api/races.js";
import { demoRace, eventsOf, waitingRace } from "../arena/demo-race.js";

// Starting Vite, its first transform of the app and launching Chromium take longer than vitest's
// 5 s hook default.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const WEB_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const hardTask = taskFixture("task_past-order");

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  server = await createServer({
    root: WEB_ROOT,
    configFile: `${WEB_ROOT}vite.config.ts`,
    logLevel: "silent",
    // Port 0, so a developer's `pnpm dev` on 5173 does not fail the test.
    server: { port: 0 },
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (url === undefined) throw new Error("the web dev server reported no local URL");
  origin = url.replace(/\/$/, "");
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

/** `demoRace`'s runs: Ada gets through, Kai is under way, Vera gives up. */
const [ada, kai, vera] = demoRace.runs as [StartedRun, StartedRun, StartedRun];

/** `demoRace` as io keeps it under `id`, with `status`, and no run waiting for a slot. */
function raceOf(id: string, status: Race["status"], runs: StartedRun[] = demoRace.runs): Race {
  return { id, task: hardTask, startedAt: "2026-10-07T09:00:00.000Z", runs, status, waiting: [] };
}

/**
 * `events` as io streams a run: each with its index as `id:`, its type as `event:` and itself as
 * `data:`. A one-hour `retry:` leads them, so a stream with no terminal event is not replayed by a
 * reconnect during the test.
 */
function eventStream(events: readonly RunEvent[]): string {
  const messages = events.map(
    (event, index) => `id: ${index}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
  );
  return `retry: 3600000\n\n${messages.join("")}`;
}

/**
 * io's answer to one request: JSON under a status, 200 unless given, or an event stream, at once
 * or once `held` brings its events, as io holds a waiting run's stream open with nothing on it.
 */
type Answer =
  | { status?: number; json: unknown }
  | { stream: readonly RunEvent[] }
  | { held: Promise<readonly RunEvent[]> };

/**
 * A 1280 × 720 page whose `/api` calls `answers` answers, by method and path, such as
 * `GET /api/races`, and a 404 for anything else. Every path asked is kept in `asked`.
 */
async function servedPage(answers: Record<string, Answer>) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  onTestFinished(() => page.close());
  const asked: string[] = [];
  // By path prefix, as the dev server's proxy matches it: a glob like `**/api/**` would catch the
  // app's own modules under `src/api/` too.
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route: Route) => {
      const request = route.request();
      const key = `${request.method()} ${new URL(request.url()).pathname}`;
      asked.push(key);
      const answer = answers[key];
      if (answer === undefined) return route.fulfill({ status: 404, json: { error: "not here" } });
      if ("stream" in answer) {
        return route.fulfill({
          contentType: "text/event-stream",
          body: eventStream(answer.stream),
        });
      }
      if ("held" in answer) {
        return answer.held.then((events) =>
          route.fulfill({ contentType: "text/event-stream", body: eventStream(events) }),
        );
      }
      return route.fulfill({ status: answer.status ?? 200, json: answer.json });
    },
  );
  return { page, asked };
}

/**
 * A stream io holds open with nothing on it, as it holds a run's while the run waits for a slot,
 * and `release`, after which it brings `events`.
 */
function heldStream(events: readonly RunEvent[]): { answer: Answer; release: () => void } {
  let release: () => void = () => {};
  const held = new Promise<readonly RunEvent[]>((resolve) => {
    release = () => resolve(events);
  });
  return { answer: { held }, release };
}

/** Two frames: whatever a commit just drawn, or an answer just landed, set off has run. */
async function settled(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
}

/** Each run of `demoRace` streaming its events. */
const DEMO_STREAMS: Record<string, Answer> = Object.fromEntries(
  demoRace.runs.map((run) => [
    `GET /api/runs/${run.id}/events`,
    { stream: demoRace.events.get(run.id) ?? [] },
  ]),
);

/** The race lane of the persona called `name`. */
function laneOf(page: Page, name: string) {
  return page.getByRole("article", { name, exact: true });
}

/** `demoRace` as its streams leave it: Ada 1st, Kai under way, Vera gave up. */
async function demoLanesDrawn(page: Page) {
  await laneOf(page, "Ada").getByText("1st", { exact: true }).waitFor();
  await laneOf(page, "Kai").getByText("5 steps so far", { exact: true }).waitFor();
  await laneOf(page, "Vera").getByText("Gave up", { exact: true }).waitFor();
}

/** The story nav's link to `name`. */
function navLink(page: Page, name: string) {
  return page.getByRole("navigation", { name: "Story" }).getByRole("link", { name, exact: true });
}

/** `waitingRace` as io keeps it under `id`: running, with Vera's run still waiting for a slot. */
function waitingRaceOf(id: string): Race {
  return { ...raceOf(id, "running", waitingRace.runs), waiting: waitingRace.waiting };
}

/** Each run of `waitingRace` streaming its events: Vera's, open, brings none. */
const WAITING_STREAMS: Record<string, Answer> = Object.fromEntries(
  waitingRace.runs.map((run) => [
    `GET /api/runs/${run.id}/events`,
    { stream: waitingRace.events.get(run.id) ?? [] },
  ]),
);

/** `waitingRace` as its streams leave it: Ada 1st, Kai under way, Vera waiting for a slot. */
async function waitingLanesDrawn(page: Page) {
  await laneOf(page, "Ada").getByText("1st", { exact: true }).waitFor();
  await laneOf(page, "Kai").getByText("5 steps so far", { exact: true }).waitFor();
  await laneOf(page, "Vera").getByText("Waiting", { exact: true }).waitFor();
}

/** Stop race's confirmation, open. */
function stopDialog(page: Page) {
  return page.getByRole("alertdialog", { name: "Stop this race?", exact: true });
}

test("a race left for the Cast is the same race when the Race tab is clicked again", async () => {
  const { page } = await servedPage({
    // io's list as it stands once the race has started: the History holds it from then on.
    "GET /api/races": { json: [raceOf("race_demo", "running")] },
    "POST /api/tasks": { status: 201, json: { task: hardTask, rewritten: false } },
    "POST /api/runs": { status: 202, json: { raceId: "race_demo", runs: demoRace.runs } },
    "GET /api/races/race_demo": { json: raceOf("race_demo", "running") },
    ...DEMO_STREAMS,
  });
  await page.goto(`${origin}/race`);
  await page.getByRole("button", { name: "Check the goal", exact: true }).click();
  for (const persona of ["Ada", "Kai", "Vera"]) {
    await page.getByRole("button", { name: persona, exact: true }).click();
  }
  await page.getByRole("button", { name: "Start the race", exact: true }).click();
  await page.waitForURL(`${origin}/race/race_demo`);
  await demoLanesDrawn(page);

  // New race opens the panel with the last race's choices, and the History, while the race runs.
  await page.getByRole("button", { name: "New race", exact: true }).click();
  await page.waitForURL(`${origin}/race`);
  expect(
    await page.getByRole("button", { name: "Vera", exact: true }).getAttribute("aria-pressed"),
  ).toBe("true");
  expect(await navLink(page, "Race").getAttribute("href")).toBe("/race");
  await page.getByRole("region", { name: "running · 1" }).getByRole("link").click();
  await page.waitForURL(`${origin}/race/race_demo`);
  await demoLanesDrawn(page);

  await navLink(page, "Cast").click();
  await page.waitForURL(`${origin}/cast`);
  expect(await page.locator("#race-goal").count()).toBe(0);
  // The Race tab leads back to the race, not to the panel.
  expect(await navLink(page, "Race").getAttribute("href")).toBe("/race/race_demo");
  await navLink(page, "Race").click();
  await page.waitForURL(`${origin}/race/race_demo`);
  await demoLanesDrawn(page);
  expect(await navLink(page, "Race").getAttribute("aria-current")).toBe("page");
});

test("a race that finished while the screen was left opens from its records on the way back", async () => {
  const ended = new Map([...demoRace.events, [kai.id, eventsOf(kai, runEventFixtures)]]);
  const answers: Record<string, Answer> = {
    "GET /api/races/race_demo": { json: raceOf("race_demo", "running") },
    ...DEMO_STREAMS,
  };
  const { page } = await servedPage(answers);
  await page.goto(`${origin}/race/race_demo`);
  await demoLanesDrawn(page);
  await navLink(page, "Cast").click();
  await page.waitForURL(`${origin}/cast`);

  // Meanwhile every run ends, and io restarts: it streams none of them any more.
  answers["GET /api/races/race_demo"] = { json: raceOf("race_demo", "finished") };
  for (const run of demoRace.runs) {
    delete answers[`GET /api/runs/${run.id}/events`];
    answers[`GET /api/runs/${run.id}`] = { json: runResultFromEvents(ended.get(run.id) ?? []) };
  }

  await navLink(page, "Race").click();
  await page.waitForURL(`${origin}/race/race_demo`);
  await laneOf(page, "Kai").getByText("Gave up", { exact: true }).waitFor();
  await laneOf(page, "Ada").getByText("1st", { exact: true }).waitFor();
  await page.locator('[data-source="stored"]').waitFor();
  // Kai's stream never ended, so his Gave up comes from his record, and no lane is lost.
  expect(await page.getByText("Stream lost", { exact: true }).count()).toBe(0);
});

test("a reload on a race's URL brings the race back", async () => {
  const { page } = await servedPage({
    "GET /api/races/race_demo": { json: raceOf("race_demo", "running") },
    ...DEMO_STREAMS,
  });
  await page.goto(`${origin}/race/race_demo`);
  await demoLanesDrawn(page);
  await page.reload();
  await demoLanesDrawn(page);
});

test("two races running at once are both in the History, and each opens", async () => {
  const first = raceOf("race_first", "running");
  // Vera alone, on her own run, started after the first race.
  const veraAgain: StartedRun = { ...vera, id: "run_vera-again" };
  const second = {
    ...raceOf("race_second", "running", [veraAgain]),
    startedAt: "2026-10-07T09:05:00.000Z",
  };
  const { page } = await servedPage({
    "GET /api/races": { json: [second, first] },
    "GET /api/races/race_first": { json: first },
    "GET /api/races/race_second": { json: second },
    ...DEMO_STREAMS,
    [`GET /api/runs/${veraAgain.id}/events`]: {
      stream: eventsOf(veraAgain, runEventFixtures.slice(0, 8)),
    },
  });
  await page.goto(`${origin}/race`);
  const running = page.getByRole("region", { name: "running · 2" });
  await running.waitFor();
  const links = running.getByRole("link");
  expect(await links.count()).toBe(2);

  await links.nth(1).click();
  await page.waitForURL(`${origin}/race/race_first`);
  await demoLanesDrawn(page);

  await page.getByRole("button", { name: "New race", exact: true }).click();
  await page.waitForURL(`${origin}/race`);
  await page.getByRole("region", { name: "running · 2" }).getByRole("link").first().click();
  await page.waitForURL(`${origin}/race/race_second`);
  await laneOf(page, "Vera").getByText("2 steps so far", { exact: true }).waitFor();
  expect(await page.getByRole("article").count()).toBe(1);
});

test("a finished race stays in the History, links to its report, and opens from its runs' records", async () => {
  const ended = new Map([...demoRace.events, [kai.id, eventsOf(kai, runEventFixtures)]]);
  const records = Object.fromEntries(
    demoRace.runs.map((run) => [
      `GET /api/runs/${run.id}`,
      { json: runResultFromEvents(ended.get(run.id) ?? []) },
    ]),
  );
  const done = raceOf("race_done", "finished");
  const { page, asked } = await servedPage({
    "GET /api/races": { json: [done] },
    "GET /api/races/race_done": { json: done },
    ...records,
  });
  await page.goto(`${origin}/race`);
  const finished = page.getByRole("region", { name: "finished · 1" });
  await finished.waitFor();
  expect(
    await finished.getByRole("link", { name: "Report", exact: true }).getAttribute("href"),
  ).toBe("/report/task_past-order");

  await finished.getByRole("link").first().click();
  await page.waitForURL(`${origin}/race/race_done`);
  await laneOf(page, "Ada").getByText("1st", { exact: true }).waitFor();
  await laneOf(page, "Kai").getByText("Gave up", { exact: true }).waitFor();
  await laneOf(page, "Vera").getByText("Gave up", { exact: true }).waitFor();
  // Drawn from records: the race header says stored, and no run was streamed.
  expect(await page.locator('[data-source="stored"]').count()).toBe(1);
  expect(asked.filter((key) => key.endsWith("/events"))).toStrictEqual([]);
  expect(asked).toContain(`GET /api/runs/${ada.id}`);
});

test("the dialog opens on Keep running; Esc and Keep running close it and send nothing", async () => {
  const { page, asked } = await servedPage({
    "GET /api/races/race_waiting": { json: waitingRaceOf("race_waiting") },
    ...WAITING_STREAMS,
  });
  await page.goto(`${origin}/race/race_waiting`);
  await waitingLanesDrawn(page);
  // Found only while the dialog is closed: while it is open, the page behind it is hidden, and the
  // dialog's own "Stop race" is the one a role finds.
  const trigger = page.getByRole("button", { name: "Stop race", exact: true });
  const dialog = stopDialog(page);
  const keep = dialog.getByRole("button", { name: "Keep running", exact: true });
  /** Every POST the page has sent, a stop among them were one sent. */
  const posts = () => asked.filter((key) => key.startsWith("POST "));

  await trigger.click();
  await dialog.waitFor();
  await expect
    .poll(() => keep.evaluate((element) => element === document.activeElement))
    .toBe(true);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await settled(page);
  expect(posts()).toStrictEqual([]);

  await trigger.click();
  await keep.click();
  await dialog.waitFor({ state: "hidden" });
  await settled(page);
  expect(posts()).toStrictEqual([]);
});

test("a race opened by its URL stops: the dialog's Stop race posts /api/races/<id>/cancel once, and the trigger reads Stopping… until the waiting lane ends", async () => {
  const cancel = "POST /api/races/race_waiting/cancel";
  const veraStream = heldStream(waitingRace.dropped);
  const { page, asked } = await servedPage({
    "GET /api/races/race_waiting": { json: waitingRaceOf("race_waiting") },
    [cancel]: { status: 202, json: { stopped: 0, dequeued: 1 } },
    ...WAITING_STREAMS,
    // Vera's, open and empty until io drops her waiting run.
    [`GET /api/runs/${vera.id}/events`]: veraStream.answer,
  });
  // A page of its own, opened on the race's URL: nothing is held from before, as after a reload,
  // so the stop can only be keyed on the race id the URL names.
  await page.goto(`${origin}/race/race_waiting`);
  await waitingLanesDrawn(page);
  await page.getByRole("button", { name: "Stop race", exact: true }).click();
  const answered = page.waitForResponse((response) => {
    const request = response.request();
    return `${request.method()} ${new URL(request.url()).pathname}` === cancel;
  });
  await stopDialog(page).getByRole("button", { name: "Stop race", exact: true }).click();
  const posted = (await answered).request();
  expect({
    contentType: await posted.headerValue("content-type"),
    body: posted.postDataJSON(),
  }).toStrictEqual({ contentType: "application/json", body: {} });

  // io has answered, and Vera's stream has brought nothing yet: the stop stays pending.
  await settled(page);
  const stopping = page.getByRole("button", { name: "Stopping…", exact: true });
  expect(await stopping.isDisabled()).toBe(true);
  expect(await stopDialog(page).count()).toBe(0);

  veraStream.release();
  await laneOf(page, "Vera").getByText("Stopped", { exact: true }).waitFor();
  // Nothing waits any more, so nothing is left to stop, though Kai's run is still under way.
  expect(await page.getByRole("button", { name: /^Stop(ping…| race)$/ }).count()).toBe(0);
  expect(await page.locator('[data-source="live"]').count()).toBe(1);
  expect(asked.filter((key) => key.startsWith("POST "))).toStrictEqual([cancel]);
});
