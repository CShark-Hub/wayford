import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { attributesOf, elementOf, textOf } from "../preview/rendered-markup.js";
import { createAppRouter } from "../router.js";
import { STORY_NAV, TopBarSlot } from "./top-bar.js";

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

test("the story nav numbers Cast, Lens, Race and Report, and nothing else", async () => {
  const nav = linksOf(elementOf(await render("/cast"), "nav", 'aria-label="Story"'));
  expect(nav.map(({ name, attributes, numbers }) => [numbers[0], name, attributes.href])).toEqual([
    ["01", "Cast", "/cast"],
    ["02", "Lens", "/lens"],
    ["03", "Race", "/race"],
    // The hard goal's report, the one the demo walks.
    ["04", "Report", "/report/task_past-order"],
  ]);
});

test.each(STORY_NAV.map((entry) => [pathOf(entry), entry.label] as const))(
  "on %s, only %s is the current page",
  async (path, label) => {
    const nav = linksOf(elementOf(await render(path), "nav", 'aria-label="Story"'));
    const current = nav.filter((link) => link.attributes["aria-current"] === "page");
    expect(current.map((link) => link.name)).toEqual([label]);
  },
);

test("on another task's report, no story entry is the current page", async () => {
  const nav = linksOf(
    elementOf(await render("/report/task_next-parcel"), "nav", 'aria-label="Story"'),
  );
  expect(nav.filter((link) => link.attributes["aria-current"] === "page")).toEqual([]);
});

test("Runs sits outside the story nav, Events has no link, and the slot is empty", async () => {
  const bar = topBarOf(await render("/runs"));
  const nav = elementOf(bar, "nav", 'aria-label="Story"');
  expect(linksOf(nav).map((link) => link.name)).not.toContain("Runs");
  const links = linksOf(bar);
  expect(links.find((link) => link.name === "Runs")?.attributes).toMatchObject({
    href: "/runs",
    "aria-current": "page",
  });
  expect(links.map((link) => link.attributes.href)).not.toContain("/events");
  // The bar fills nothing itself: a screen's badge and tag come from that screen's data.
  expect(bar).toMatch(/<div data-slot="top-bar-slot"[^>]*><\/div>/);
});

test("the wordmark reads Wayford and opens the Cast", async () => {
  const wordmark = linksOf(topBarOf(await render("/race")))[0];
  expect(wordmark).toMatchObject({ name: "Wayford", attributes: { href: "/cast" } });
});

test("the theme toggle is in the bar, after the slot", async () => {
  const bar = topBarOf(await render("/cast"));
  expect(bar.indexOf('aria-label="Switch to Night"')).toBeGreaterThan(
    bar.indexOf('data-slot="top-bar-slot"'),
  );
});

test("a screen's slot content draws nothing in a static render, and needs no bar", () => {
  expect(renderToStaticMarkup(<TopBarSlot>live</TopBarSlot>)).toBe("");
});
