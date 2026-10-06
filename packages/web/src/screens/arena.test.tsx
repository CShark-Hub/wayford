import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { profileFixtures, taskFixture } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
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
  return [...html.matchAll(/(<button[^>]*>)(.*?)<\/button>/gs)].find((m) => m[2] === text)?.[1];
}

test("/race opens on the start panel, linked from the story nav", async () => {
  const html = await renderArena();
  expect(html).toMatch(/<h1[^>]*>Race<\/h1>/);
  expect(html).toMatch(/<a [^>]*href="\/race"[^>]*aria-current="page"[^>]*>.*?Race<\/a>/);
  expect(html).toMatch(/<h2[^>]*>Start a race<\/h2>/);
  // No race yet, so nothing to leave.
  expect(buttonTag(html, "New race")).toBeUndefined();
});

test("the panel opens on the hard goal, every persona offered, Start not yet possible", async () => {
  const html = await renderArena();
  const hard = taskFixture("task_past-order");
  expect(html).toMatch(new RegExp(`<input[^>]*id="arena-goal-${hard.id}"[^>]*checked=""`));
  for (const profile of profileFixtures) {
    expect(html).toContain(`id="arena-persona-${profile.id}"`);
  }
  expect(buttonTag(html, "Start the race")).toMatch(/ disabled=""/);
});
