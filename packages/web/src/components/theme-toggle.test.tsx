import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { attributesOf } from "../preview/rendered-markup.js";
import { ThemeToggle } from "./theme-toggle.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The toggle as the page draws it while `<html>` carries `theme`. */
function renderOn(theme: string): string {
  vi.stubGlobal("document", {
    documentElement: { getAttribute: (name: string) => (name === "data-theme" ? theme : null) },
  });
  return renderToStaticMarkup(<ThemeToggle />);
}

test("in Daylight it shows the sun and offers Night", () => {
  const html = renderOn("light");
  expect(html).toMatch(/<button[^>]* aria-label="Switch to Night"/);
  expect(html).toContain("lucide-sun");
  expect(html).not.toContain("lucide-moon");
});

test("in Night it shows the moon and offers Daylight", () => {
  const html = renderOn("dark");
  expect(html).toMatch(/<button[^>]* aria-label="Switch to Daylight"/);
  expect(html).toContain("lucide-moon");
});

test("it is a 40 px ghost button whose icon is hidden from assistive technology", () => {
  const html = renderOn("light");
  const button = attributesOf(html.match(/<button[^>]*>/)?.[0] ?? "");
  expect(button).toMatchObject({ "data-variant": "ghost", "data-size": "icon" });
  expect(html).toMatch(/<svg[^>]* aria-hidden="true"/);
});
