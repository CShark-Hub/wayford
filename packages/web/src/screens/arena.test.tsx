import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { profileFixtures } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { attributesOf, lineOf } from "../preview/rendered-markup.js";
import { createAppRouter } from "../router.js";

/** `/race` through the app's own router. A static render runs no effect: no fetch, no stream. */
async function renderArena(): Promise<string> {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ["/race"] }) });
  await router.load();
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** The opening tag of the `<button>` whose text is `text`. */
function buttonTag(html: string, text: string): string | undefined {
  return [...html.matchAll(/(<button[^>]*>)(.*?)<\/button>/gs)].find(
    (m) => lineOf(m[2] ?? "") === text,
  )?.[1];
}

test("/race opens on the start strip, linked from the story nav, its titles for screen readers", async () => {
  const html = await renderArena();
  // The reference draws no title row: the page's one h1 and the strip's h2 are not drawn.
  expect(html).toMatch(/<h1 class="sr-only">Race<\/h1>/);
  expect(html).toMatch(/<a [^>]*href="\/race"[^>]*aria-current="page"[^>]*>.*?Race<\/a>/);
  expect(html).toMatch(/<h2 [^>]*class="sr-only"[^>]*>Start a race<\/h2>/);
  // No race yet, so nothing to leave.
  expect(buttonTag(html, "New race")).toBeUndefined();
});

test("the screen sits in the page column: content-max wide, centred, space-6 gutters", async () => {
  const html = await renderArena();
  const column = html.match(/<main[^>]*>(<div[^>]*>)/)?.[1] ?? "";
  expect((attributesOf(column).class ?? "").split(" ")).toEqual(
    expect.arrayContaining(["mx-auto", "max-w-(--content-max)", "px-(--space-6)"]),
  );
});

test("the strip opens on the hard goal, every persona offered, Start not yet possible", async () => {
  const html = await renderArena();
  const hard = attributesOf(buttonTag(html, "Hard goal") ?? "");
  expect(hard.role).toBe("radio");
  expect(hard["aria-checked"]).toBe("true");
  expect(attributesOf(buttonTag(html, "Easy goal") ?? "")["aria-checked"]).toBe("false");
  for (const profile of profileFixtures) {
    const toggle = html.match(new RegExp(`<button[^>]*\\sid="arena-persona-${profile.id}"[^>]*>`));
    expect(attributesOf(toggle?.[0] ?? "")["aria-pressed"], profile.label).toBe("false");
  }
  expect(buttonTag(html, "Start the race")).toMatch(/ disabled=""/);
});
