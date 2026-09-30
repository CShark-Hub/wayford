import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { createAppRouter } from "./router.js";

/**
 * The page at `path` through the app's own router: the shell and the matched screen, inside a
 * fresh query client. A static render runs no effect, so no query fetches and no stream opens.
 *
 * `/` is not rendered here: a load on the server records its redirect instead of following it, and
 * renders nothing, so the redirect is checked by hand in the browser.
 */
async function render(path: string): Promise<string> {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** The text of every `<h2>`, in document order. */
function h2Texts(html: string): string[] {
  return [...html.matchAll(/<h2(?:\s[^>]*)?>(.*?)<\/h2>/gs)].map((heading) => heading[1] ?? "");
}

test("/personas shows the four cards in order", async () => {
  const html = await render("/personas");
  expect(h2Texts(html)).toEqual(["Ada", "Milo", "Vera", "Zoya"]);
  expect(html.split("<article").length - 1).toBe(4);
});

test("the personas screen says none of the banned words", async () => {
  const html = await render("/personas");
  // What a person or a screen reader gets: the text between tags, which holds each avatar's
  // `<title>`, and the attributes read out. Class names are code, not copy: Tailwind's `disabled:`
  // variant is not a word on the screen.
  const texts = [...html.matchAll(/>([^<]+)</g)].map((match) => match[1] ?? "");
  const attributes = [...html.matchAll(/\s(?:aria-label|title|alt)="([^"]*)"/g)].map(
    (match) => match[1] ?? "",
  );
  // Neither half may pass by collecting nothing: the cards' names are text, and the nav's label is
  // an attribute.
  expect(texts.join(" ")).toContain("Vera");
  expect(attributes).toContain("Main");
  const collected = [...texts, ...attributes].join(" ").toLowerCase();
  for (const word of ["impaired", "disabled", "able-bodied"]) {
    expect(collected, word).not.toContain(word);
  }
});

test("/events renders the m0-07 screen", async () => {
  // The streaming itself needs a browser and io, so it is checked by hand.
  const html = await render("/events");
  expect(html).toMatch(/<h2[^>]*>Fixture run, replayed by io<\/h2>/);
  expect(html).toMatch(/<button[^>]*>Replay<\/button>/);
});
