import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Skeleton } from "./skeleton.js";

test("the skeleton is a hidden block with the shimmer", () => {
  const html = renderToStaticMarkup(<Skeleton />);
  expect(html).toMatch(/^<div[^>]*aria-hidden="true"/);
  expect(html).toContain('data-slot="skeleton"');
  expect(html).toContain("bg-paper-sunken");
  expect(html).toContain("after:animate-shimmer");
});
