import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { forgetRace, showRace } from "../arena/shown-race.js";
import { attributesOf, classesOf, elementOf, textOf } from "../preview/rendered-markup.js";
import { createAppRouter } from "../router.js";
import { clearCurrentTarget, setCurrentTarget } from "../target/current-target.js";
import { stubSessionStorage } from "../target/test-support.js";
import { STORY_NAV } from "./top-bar.js";

/** The page at `path` through the app's own router, shell included. A static render runs no effect. */
async function render(path: string): Promise<string> {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** The page's one `<header>`: the top bar. */
function topBarOf(html: string): string {
  const bar = html.match(/<header(?:\s[^>]*)?>(.*?)<\/header>/s)?.[1];
  if (bar === undefined) throw new Error("no <header>");
  return bar;
}

/** Each link in `html`: its attributes, and its name with `aria-hidden` parts left out. */
function linksOf(html: string) {
  return [...html.matchAll(/<a(\s[^>]*)?>(.*?)<\/a>/gs)].map((m) => ({
    attributes: attributesOf(m[1] ?? ""),
    name: textOf((m[2] ?? "").replace(/<span aria-hidden="true"[^>]*>.*?<\/span>/gs, "")),
    numbers: [...(m[2] ?? "").matchAll(/<span aria-hidden="true"[^>]*>(\d\d)<\/span>/g)].map(
      (n) => n[1],
    ),
  }));
}

/** The path a story entry opens: its `to`, each `$param` in it replaced by the entry's value. */
function pathOf(entry: (typeof STORY_NAV)[number]): string {
  const params: Readonly<Record<string, string>> = "params" in entry ? entry.params : {};
  return entry.to.replace(/\$(\w+)/g, (_, name: string) => params[name] ?? "");
}

/** A goal of one's own, under an id as io mints one, on a site of its own. */
const GOAL = { taskId: "task_01jq7r8m2x4k5n6p7q8r9s0t1v", startUrl: "https://example.com/" };

/** The story nav in `html`: each link's name and where it leads, in the nav's order. */
function hrefsOf(html: string): [string, string | undefined][] {
  const nav = linksOf(elementOf(html, "nav", 'aria-label="Story"'));
  return nav.map(({ name, attributes }) => [name, attributes.href]);
}

/** The story nav on `path`, as `hrefsOf` reads it. */
async function hrefsOn(path: string): Promise<[string, string | undefined][]> {
  return hrefsOf(await render(path));
}

afterEach(() => {
  clearCurrentTarget();
  vi.unstubAllGlobals();
  forgetRace();
});

test("the nav numbers Target, Cast, Lens, Race, Report and Boundary, 00 to 05, and the right of the bar holds no Target button", async () => {
  const bar = topBarOf(await render("/cast"));
  const nav = linksOf(elementOf(bar, "nav", 'aria-label="Story"'));
  expect(nav.map(({ name, numbers }) => [numbers[0], name])).toEqual([
    ["00", "Target"],
    ["01", "Cast"],
    ["02", "Lens"],
    ["03", "Race"],
    ["04", "Report"],
    ["05", "Boundary"],
  ]);
  const apart = linksOf(bar.slice(bar.indexOf("</nav>")));
  expect(apart.map((link) => link.name)).toEqual(["Runs"]);
});

test("with no target, every link is today's", async () => {
  stubSessionStorage();
  expect(await hrefsOn("/cast")).toEqual([
    ["Target", "/target"],
    ["Cast", "/cast"],
    ["Lens", "/lens"],
    ["Race", "/race"],
    // The hard goal's report, the one the demo walks.
    ["Report", "/report/task_past-order"],
    ["Boundary", "/boundary"],
  ]);
});

test("with a target, Target, Lens, Race and Report carry it, and Cast and Boundary do not", async () => {
  stubSessionStorage();
  setCurrentTarget(GOAL);
  const html = await render("/cast");
  expect(hrefsOf(html)).toEqual([
    // The host is part of the link's name, so a screen reader hears which site the nav carries.
    ["Target example.com", `/target?task=${GOAL.taskId}`],
    ["Cast", "/cast"],
    ["Lens", `/lens?url=${encodeURIComponent(GOAL.startUrl)}`],
    ["Race", `/race?task=${GOAL.taskId}`],
    ["Report", `/report/${GOAL.taskId}`],
    ["Boundary", "/boundary"],
  ]);
  // A long host is cut, and its title still holds the whole of it.
  const nav = elementOf(html, "nav", 'aria-label="Story"');
  const host = nav.match(/<span([^>]*\stitle="example\.com"[^>]*)>(.*?)<\/span>/s);
  expect(host?.[2]).toBe("example.com");
  expect(classesOf(attributesOf(host?.[1] ?? ""))).toContain("truncate");
});

test("a shown race still wins the Race tab", async () => {
  stubSessionStorage();
  setCurrentTarget(GOAL);
  showRace("race_shown");
  const race = (await hrefsOn("/cast")).find(([name]) => name === "Race");
  expect(race?.[1]).toBe("/race/race_shown");
});

test.each(STORY_NAV.map((entry) => [pathOf(entry), entry.label] as const))(
  "on %s, only %s is the current page",
  async (path, label) => {
    const nav = linksOf(elementOf(await render(path), "nav", 'aria-label="Story"'));
    const current = nav.filter((link) => link.attributes["aria-current"] === "page");
    expect(current.map((link) => link.name)).toEqual([label]);
  },
);

// With a target, Target links to its goal view and Lens to its start URL, and each is still
// current on its screen without them: Target on another goal's view, Lens on a Lens with no `url=`.
test.each([
  ["/target?task=task_another-goal", "Target example.com"],
  ["/lens", "Lens"],
])("with a target, on %s, only %s is the current page", async (path, name) => {
  stubSessionStorage();
  setCurrentTarget(GOAL);
  const nav = linksOf(elementOf(await render(path), "nav", 'aria-label="Story"'));
  const current = nav.filter((link) => link.attributes["aria-current"] === "page");
  expect(current.map((link) => link.name)).toEqual([name]);
});

// A preset, a stored sweep by id: every Boundary URL keeps its entry current.
test.each(["/boundary", "/boundary?axis=maxElements", "/boundary/swp_vera-contrast"])(
  "on %s, Boundary is the current page",
  async (path) => {
    const nav = linksOf(elementOf(await render(path), "nav", 'aria-label="Story"'));
    const current = nav.filter((link) => link.attributes["aria-current"] === "page");
    expect(current.map((link) => link.name)).toEqual(["Boundary"]);
  },
);

test("once a race was opened, Race leads back to it from any screen, and is current on it", async () => {
  showRace("race_shown");
  try {
    const race = (html: string) =>
      linksOf(elementOf(html, "nav", 'aria-label="Story"')).find((link) => link.name === "Race");
    expect(race(await render("/cast"))?.attributes).toStrictEqual({
      href: "/race/race_shown",
      class: expect.any(String),
    });
    expect(race(await render("/race/race_shown"))?.attributes["aria-current"]).toBe("page");
  } finally {
    forgetRace();
  }
  // Forgotten, as the start panel forgets it: Race leads to the panel again.
  const nav = linksOf(elementOf(await render("/cast"), "nav", 'aria-label="Story"'));
  expect(nav.find((link) => link.name === "Race")?.attributes.href).toBe("/race");
});

// A race by id keeps the Race current, as a stored sweep keeps Boundary.
test("on /race/race_x, Race is the current page", async () => {
  const nav = linksOf(elementOf(await render("/race/race_x"), "nav", 'aria-label="Story"'));
  const current = nav.filter((link) => link.attributes["aria-current"] === "page");
  expect(current.map((link) => link.name)).toEqual(["Race"]);
});

test("on another task's report, no story entry is the current page", async () => {
  const nav = linksOf(
    elementOf(await render("/report/task_next-parcel"), "nav", 'aria-label="Story"'),
  );
  expect(nav.filter((link) => link.attributes["aria-current"] === "page")).toEqual([]);
});

test("Runs sits outside the story nav, and Events has no link", async () => {
  const bar = topBarOf(await render("/runs"));
  const nav = elementOf(bar, "nav", 'aria-label="Story"');
  expect(linksOf(nav).map((link) => link.name)).not.toContain("Runs");
  const links = linksOf(bar);
  expect(links.find((link) => link.name === "Runs")?.attributes).toMatchObject({
    href: "/runs",
    "aria-current": "page",
  });
  expect(links.map((link) => link.attributes.href)).not.toContain("/events");
});

test("the wordmark reads Wayford and opens the Cast", async () => {
  const wordmark = linksOf(topBarOf(await render("/race")))[0];
  expect(wordmark).toMatchObject({ name: "Wayford", attributes: { href: "/cast" } });
});

test("the bar draws no source badge and no backend word", async () => {
  const bar = topBarOf(await render("/cast"));
  expect(bar).not.toContain("data-source");
  expect(bar).not.toMatch(/>(jev|llm)</);
});
