import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { SourceBadge } from "./source-badge.js";

test("the label defaults to the source word", () => {
  expect(renderToStaticMarkup(<SourceBadge source="live" />)).toContain(">live<");
  expect(renderToStaticMarkup(<SourceBadge source="stored" />)).toContain(">stored<");
});

test("children replace the default label", () => {
  const html = renderToStaticMarkup(<SourceBadge source="stored">Saved run</SourceBadge>);
  expect(html).toContain(">Saved run<");
  expect(html).not.toContain(">stored<");
});

test.each([
  ["live", "a signal dot on a solid border", "bg-signal", "border-dashed"],
  ["stored", "a hollow dot on a dashed border", "border-dashed", "bg-signal"],
] as const)("%s draws %s", (source, _look, has, lacks) => {
  const html = renderToStaticMarkup(<SourceBadge source={source} />);
  expect(html).toContain(`data-source="${source}"`);
  expect(html).toContain(has);
  expect(html).not.toContain(lacks);
});

test("the dot is hidden from assistive technology", () => {
  expect(renderToStaticMarkup(<SourceBadge source="live" />)).toMatch(
    /<span[^>]*aria-hidden="true"[^>]*><\/span>/,
  );
});
