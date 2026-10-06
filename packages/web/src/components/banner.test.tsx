import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Banner } from "./banner.js";

test("a stored banner is a status, dashed on the sunken paper, with the archive icon", () => {
  const html = renderToStaticMarkup(<Banner kind="stored">Showing a saved run.</Banner>);
  expect(html).toContain('role="status"');
  expect(html).not.toContain('role="alert"');
  expect(html).toContain("border-dashed");
  expect(html).toContain("bg-paper-sunken");
  expect(html).toContain("lucide-archive");
  expect(html).toContain("<p>Showing a saved run.</p>");
});

test("a fault banner is an alert, on the fault tint, with the octagon icon", () => {
  const html = renderToStaticMarkup(<Banner kind="fault">The run failed.</Banner>);
  expect(html).toContain('role="alert"');
  expect(html).not.toContain('role="status"');
  expect(html).toContain("border-fault");
  expect(html).toContain("bg-fault-soft");
  expect(html).toContain("text-fault");
  expect(html).toContain("lucide-octagon-alert");
  expect(html).toContain("<p>The run failed.</p>");
});

test("the icon is decorative", () => {
  expect(renderToStaticMarkup(<Banner kind="fault">x</Banner>)).toMatch(
    /<svg[^>]*aria-hidden="true"/,
  );
});

test("the action slot appears only when given", () => {
  const without = renderToStaticMarkup(<Banner kind="stored">x</Banner>);
  expect(without).not.toContain("<button");
  expect(without.match(/<div/g)).toHaveLength(1);
  const withAction = renderToStaticMarkup(
    <Banner kind="stored" action={<button type="button">Retry</button>}>
      x
    </Banner>,
  );
  expect(withAction).toContain("<button");
  expect(withAction).toContain(">Retry<");
  expect(withAction.match(/<div/g)).toHaveLength(2);
});
