import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Working } from "./working.js";

test("the working posts are hidden, three, animated, and the line is the only text", () => {
  const html = renderToStaticMarkup(<Working>Scout is walking the goal…</Working>);
  expect(html).toMatch(/^<p[^>]*>/);
  expect(html).toMatch(/<span aria-hidden="true" data-slot="working"/);
  expect(html.match(/animate-working/g)).toHaveLength(3);
  expect(html.replace(/<[^>]+>/g, "")).toBe("Scout is walking the goal…");
});

test("the posts start a third of a turn apart, so the dip runs left to right", () => {
  const html = renderToStaticMarkup(<Working>Checking…</Working>);
  const delays = [...html.matchAll(/animation-delay:([^;"]+)/g)].map((m) => m[1]);
  expect(delays).toStrictEqual(["0s", "-0.8s", "-0.4s"]);
});
