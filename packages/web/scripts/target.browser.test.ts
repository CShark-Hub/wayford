/**
 * The nav carries the target in a real browser (`tasks/s3-17-nav-carries-target.md`): the web app
 * on its own Vite dev server, as the self-check's `startWebApp` serves it, in Chromium at
 * 1280 × 720, with io's `/api` answered by `page.route` per path, as the self-check's target
 * entries answer it, and a 404 for anything else. Each test
 * opens its own page, in its own context, so each starts with an empty `sessionStorage`.
 *
 * - A goal view of a task io holds makes the bar's Target, Lens, Race and Report carry it, and
 *   Target name its host; a reload on another screen keeps them.
 * - "Clear target" brings back the links the bar had with no target, and the form.
 * - A race shown, then "New goal", which keeps the target and the race until the form's next goal
 *   is accepted; then that goal set, and the Race tab leads to it, not the race.
 * - A typed `/lens` opens the target app's `/deliveries`, whatever the target (D14).
 * - A long host keeps the story nav inside its column at 1280 px, in Daylight and Night.
 *
 * The static tests in `top-bar.test.tsx` and `target.test.tsx` cannot show this: a static render
 * runs no effect and has no storage, so the goal view never sets the target there.
 *
 * In `scripts/` because it starts the app with `startWebApp`, which sits beside the self-check.
 */
import { Task } from "@wayford/core";
import {
  axeScanFixture,
  groundTruthFixture,
  measurementFixture,
  taskFixture,
} from "@wayford/core/fixtures";
import { type Browser, chromium, type Page, type Route } from "playwright";
import { afterAll, beforeAll, expect, onTestFinished, test, vi } from "vitest";
import { demoRace } from "../src/arena/demo-race.js";
import { FOREIGN_TASK, LONG_HOST_TASK, startWebApp } from "./self-check.js";

// Starting Vite, its first transform of the app and launching Chromium take longer than vitest's
// 5 s hook default.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

let browser: Browser;
let app: Awaited<ReturnType<typeof startWebApp>>;

beforeAll(async () => {
  [browser, app] = await Promise.all([chromium.launch(), startWebApp()]);
});

afterAll(async () => {
  await browser?.close();
  await app?.close();
});

/** A second goal, on another site, under another id. */
const OTHER_TASK = Task.parse({
  ...taskFixture("task_past-order"),
  id: "task_01k70g9y3n5p7q9r1s3t5v7x2z",
  startUrl: "https://shop.example.org/",
});

/** io's answer to one request: JSON under a status, 200 unless given. */
type Answer = { status?: number; json: unknown };

/**
 * io's answers for the goal view of each of `tasks`, as the self-check's `target · report` entry
 * gives them: the stored goals, each goal's Scout with its ground truth, and no report on any.
 */
function goalAnswers(...tasks: Task[]): Record<string, Answer> {
  return {
    "GET /api/tasks": { json: tasks },
    ...Object.fromEntries(
      tasks.flatMap((task) => [
        [`GET /api/tasks/${task.id}/scout`, { json: groundTruthFixture }],
        [
          `GET /api/reports/${task.id}`,
          { status: 404, json: { error: `no report on ${task.id}` } },
        ],
      ]),
    ),
  };
}

/**
 * A 1280 × 720 page in `colorScheme` whose `/api` calls `answers` answers, by method and path,
 * such as `GET /api/tasks`, and a 404 for anything else. Every request asked is kept in `asked`,
 * with its query.
 */
async function servedPage(
  answers: Record<string, Answer>,
  colorScheme: "light" | "dark" = "light",
) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, colorScheme });
  onTestFinished(() => page.close());
  const asked: string[] = [];
  // By path prefix, as the dev server's proxy matches it: a glob like `**/api/**` would catch the
  // app's own modules under `src/api/` too.
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route: Route) => {
      const request = route.request();
      const url = new URL(request.url());
      asked.push(`${request.method()} ${url.pathname}${url.search}`);
      const answer = answers[`${request.method()} ${url.pathname}`];
      if (answer === undefined) return route.fulfill({ status: 404, json: { error: "not here" } });
      return route.fulfill({ status: answer.status ?? 200, json: answer.json });
    },
  );
  return { page, asked };
}

/** The story nav. */
function storyNav(page: Page) {
  return page.getByRole("navigation", { name: "Story" });
}

/** The story nav's link to `name`. */
function navLink(page: Page, name: string) {
  return storyNav(page).getByRole("link", { name, exact: true });
}

/** A nav link's href as a path and its decoded search, so the test does not depend on encoding. */
type Leads = { path: string; search: Record<string, string> };

/** Where each story nav link leads, in the nav's order, 00 Target to 05 Boundary. */
async function navLeads(page: Page): Promise<Leads[]> {
  const hrefs = await storyNav(page)
    .getByRole("link")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  return hrefs.map((href) => {
    const url = new URL(href, app.origin);
    return { path: url.pathname, search: Object.fromEntries(url.searchParams) };
  });
}

/** Where the nav leads with no target: today's links, the Report on the hard goal. */
const NO_TARGET_LEADS: Leads[] = [
  { path: "/target", search: {} },
  { path: "/cast", search: {} },
  { path: "/lens", search: {} },
  { path: "/race", search: {} },
  { path: "/report/task_past-order", search: {} },
  { path: "/boundary", search: {} },
];

/** Where the nav leads with `task` the current target: four carry it, Cast and Boundary do not. */
function leadsOf(task: Task): Leads[] {
  return [
    { path: "/target", search: { task: task.id } },
    { path: "/cast", search: {} },
    { path: "/lens", search: { url: task.startUrl } },
    { path: "/race", search: { task: task.id } },
    { path: `/report/${task.id}`, search: {} },
    { path: "/boundary", search: {} },
  ];
}

/** The goal view, drawn once Scout's line has replaced its skeleton, as the self-check waits. */
async function goalViewDrawn(page: Page) {
  await page.locator('main:has(section:has-text("Scout reached it in"))').waitFor();
}

/** The bar once `task` is the current target: its Target link named for the task's host. */
async function targetCarried(page: Page, task: Task) {
  await navLink(page, `Target ${new URL(task.startUrl).host}`).waitFor();
}

test("a goal view sets the target: Target, Lens, Race and Report carry it, Target names the host, and a reload elsewhere keeps them", async () => {
  const { page } = await servedPage(goalAnswers(FOREIGN_TASK));
  await page.goto(`${app.origin}/target`);
  // With no target, the bar is today's.
  await page.getByRole("button", { name: "Check the goal", exact: true }).waitFor();
  expect(await navLeads(page)).toEqual(NO_TARGET_LEADS);

  await page.goto(`${app.origin}/target?task=${FOREIGN_TASK.id}`);
  await goalViewDrawn(page);
  await targetCarried(page, FOREIGN_TASK);
  expect(await navLeads(page)).toEqual(leadsOf(FOREIGN_TASK));
  const host = storyNav(page).locator("[title]");
  expect(await host.textContent()).toBe("example.com");
  expect(await host.getAttribute("title")).toBe("example.com");
  expect(await navLink(page, "Target example.com").getAttribute("aria-current")).toBe("page");

  // A reload on another screen reads the target back from the tab's storage.
  await navLink(page, "Cast").click();
  await page.waitForURL(`${app.origin}/cast`);
  await page.reload();
  await targetCarried(page, FOREIGN_TASK);
  expect(await navLeads(page)).toEqual(leadsOf(FOREIGN_TASK));
  expect(await navLink(page, "Cast").getAttribute("aria-current")).toBe("page");
});

test("Clear target brings back today's links and the form", async () => {
  const { page } = await servedPage(goalAnswers(FOREIGN_TASK));
  await page.goto(`${app.origin}/target?task=${FOREIGN_TASK.id}`);
  await goalViewDrawn(page);
  await targetCarried(page, FOREIGN_TASK);

  await page.getByRole("button", { name: "Clear target", exact: true }).click();
  await page.waitForURL(`${app.origin}/target`);
  await page.getByRole("button", { name: "Check the goal", exact: true }).waitFor();
  expect(await navLeads(page)).toEqual(NO_TARGET_LEADS);
  expect(await navLink(page, "Target").getAttribute("aria-current")).toBe("page");
});

test("with a race shown, New goal keeps the target and the race, and the next goal accepted leads the Race tab to it, not the race", async () => {
  const { page } = await servedPage({
    ...goalAnswers(FOREIGN_TASK, OTHER_TASK),
    "POST /api/tasks": { status: 201, json: { task: OTHER_TASK, rewritten: false } },
    "GET /api/races/race_demo": {
      json: {
        id: "race_demo",
        task: taskFixture("task_past-order"),
        startedAt: "2026-10-07T09:00:00.000Z",
        runs: demoRace.runs,
        status: "running",
      },
    },
  });
  await page.goto(`${app.origin}/target?task=${FOREIGN_TASK.id}`);
  await targetCarried(page, FOREIGN_TASK);

  // A race opened by its URL wins the Race tab over the target. The Race screen shows it as soon as
  // it opens, so no run's events are needed.
  const raceShown: Leads = { path: "/race/race_demo", search: {} };
  await page.goto(`${app.origin}/race/race_demo`);
  await storyNav(page).locator('a[href="/race/race_demo"]').waitFor();

  // Back on the goal view, New goal opens the form, and the target and the race stay until the
  // form's next goal is accepted.
  await navLink(page, "Target example.com").click();
  await page.waitForURL(`${app.origin}/target?task=${FOREIGN_TASK.id}`);
  await goalViewDrawn(page);
  await page.getByRole("link", { name: "New goal", exact: true }).click();
  await page.waitForURL(`${app.origin}/target`);
  await page.locator("#target-start-url").waitFor();
  expect(await navLeads(page)).toEqual(
    leadsOf(FOREIGN_TASK).map((leads, index) => (index === 3 ? raceShown : leads)),
  );

  // That goal, checked on the form, becomes the target, and the race is forgotten.
  await page.locator("#target-start-url").fill(OTHER_TASK.startUrl);
  await page.locator("#target-goal").fill(OTHER_TASK.goal);
  await page.locator("#target-success").fill("**/deliveries/archive");
  await page.getByRole("button", { name: "Check the goal", exact: true }).click();
  await page.waitForURL(`${app.origin}/target?task=${OTHER_TASK.id}`);
  await goalViewDrawn(page);
  await targetCarried(page, OTHER_TASK);
  expect(await navLeads(page)).toEqual(leadsOf(OTHER_TASK));

  await navLink(page, "Race").click();
  await page.waitForURL(`${app.origin}/race?task=${OTHER_TASK.id}`);
});

test("with a target remembered, a typed /lens opens the target app's /deliveries (D14)", async () => {
  const { page, asked } = await servedPage({
    ...goalAnswers(FOREIGN_TASK),
    "GET /api/measure": { json: measurementFixture },
    "GET /api/axe": { json: axeScanFixture("/deliveries") },
  });
  await page.goto(`${app.origin}/target?task=${FOREIGN_TASK.id}`);
  await targetCarried(page, FOREIGN_TASK);

  // Typed into the address bar: a whole page load, with no `url=`.
  await page.goto(`${app.origin}/lens`);
  await page.getByText("Live: http://localhost:5174/deliveries on desktop").waitFor();
  expect(new URL(page.url()).search).toBe("");
  // The URL row, once shown, is empty, as on any target-app page, and io was asked for
  // /deliveries alone.
  await page.getByRole("button", { name: "Open a URL" }).click();
  expect(await page.locator("#lens-url").inputValue()).toBe("");
  expect(asked.filter((request) => request.startsWith("GET /api/measure"))).toEqual([
    "GET /api/measure?device=desktop&page=%2Fdeliveries",
  ]);
  // The nav still carries the target, and the Lens tab is current without it.
  expect(await navLeads(page)).toEqual(leadsOf(FOREIGN_TASK));
  expect(await navLink(page, "Lens").getAttribute("aria-current")).toBe("page");
});

test.each(["light", "dark"] as const)(
  "a long host keeps the story nav inside its column at 1280 px (%s)",
  async (colorScheme) => {
    const { page } = await servedPage(goalAnswers(LONG_HOST_TASK), colorScheme);
    await page.goto(`${app.origin}/target?task=${LONG_HOST_TASK.id}`);
    await goalViewDrawn(page);
    await targetCarried(page, LONG_HOST_TASK);
    expect(await page.locator("html").getAttribute("data-theme")).toBe(colorScheme);
    // The nav is the header's `minmax(0,1fr)` column and scrolls on its own, so a long host can
    // only overflow inside it: the header and the page keep the window's width whatever it holds.
    // Since s3-18 the bar is the same on every screen, so the Target screen measures it for all.
    const nav = await storyNav(page).evaluate((nav) => ({
      scroll: nav.scrollWidth,
      client: nav.clientWidth,
    }));
    expect(nav.scroll, JSON.stringify(nav)).toBeLessThanOrEqual(nav.client);
  },
);
