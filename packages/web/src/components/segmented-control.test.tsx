import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { attributesOf } from "../preview/rendered-markup.js";
import { pickedValue, SegmentedControl } from "./segmented-control.js";

const OPTIONS = [
  { value: "grid", label: "Grid" },
  { value: "list", label: "List" },
] as const;

function render(props: { value?: "grid" | "list"; mono?: true } = {}): string {
  return renderToStaticMarkup(
    <SegmentedControl
      label="Layout"
      options={OPTIONS}
      value={props.value ?? "grid"}
      onValueChange={() => {}}
      {...(props.mono ? { mono: true } : {})}
    />,
  );
}

// A single-choice Radix ToggleGroup is a radio group: its items are radios, and the pressed one
// reads `aria-checked`, not `aria-pressed`. `data-state` carries on/off for the styles.
test("the group carries the label and holds one item per option", () => {
  const html = render();
  expect(html).toMatch(/<div[^>]*role="radiogroup"[^>]*aria-label="Layout"/);
  expect(html.match(/<button/g)).toHaveLength(2);
  expect(html).toContain(">Grid<");
  expect(html).toContain(">List<");
});

test("only the picked segment is on", () => {
  const html = render({ value: "list" });
  const items = [...html.matchAll(/<button[^>]*>.*?<\/button>/gs)].map((match) => match[0]);
  expect(items).toHaveLength(2);
  const [grid, list] = items;
  expect(list).toContain('data-state="on"');
  expect(list).toContain('role="radio"');
  expect(list).toContain('aria-checked="true"');
  expect(grid).toContain('data-state="off"');
  expect(grid).toContain('aria-checked="false"');
  expect(html).not.toContain("aria-pressed");
});

// `label` and `mono-label` each set the family, so an item carries exactly one of them.
test("mono draws the items in the mono face, and only then", () => {
  const classesOf = (html: string) =>
    (attributesOf(html.match(/<button[^>]*>/)?.[0] ?? "").class ?? "").split(" ");
  const mono = classesOf(render({ mono: true }));
  expect(mono).toEqual(expect.arrayContaining(["mono-label", "font-normal"]));
  expect(mono).not.toContain("label");
  const plain = classesOf(render());
  expect(plain).toContain("label");
  expect(plain).not.toContain("mono-label");
});

test("pickedValue keeps the current value when the pressed item is clicked again", () => {
  expect(pickedValue("grid", "")).toBe("grid");
});

test("pickedValue takes a different item's value", () => {
  expect(pickedValue("grid", "list")).toBe("list");
});
