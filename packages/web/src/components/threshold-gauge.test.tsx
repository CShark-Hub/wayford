import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { attributesOf, elementOf, styleOf, textOf } from "../preview/rendered-markup.js";
import { Tag } from "./tag.js";
import { ThresholdGauge } from "./threshold-gauge.js";

type Props = ComponentProps<typeof ThresholdGauge>;

/** Vera's contrast gauge on lens.html's 1–7 ruler, moved to 4.5 from her own 3. */
function render(props: Partial<Props> = {}): string {
  return renderToStaticMarkup(
    <ThresholdGauge
      id="preview-contrast"
      label="Contrast"
      value={4.5}
      min={1}
      max={7}
      step={0.1}
      ticks={6}
      softness={0.5}
      format={(value) => `${value}:1`}
      tags={<Tag variant="rule">P1</Tag>}
      onMove={() => {}}
      onRelease={() => {}}
      {...props}
    />,
  );
}

/** A start tag's attributes, found by its `data-slot`, or undefined when nothing carries it. */
function slot(html: string, name: string): Record<string, string> | undefined {
  const tag = html.match(new RegExp(`<[a-z]+(?=[^>]*\\sdata-slot="${name}")[^>]*>`))?.[0];
  return tag === undefined ? undefined : attributesOf(tag);
}

function inputOf(html: string): Record<string, string> {
  return attributesOf(html.match(/<input[^>]*>/)?.[0] ?? "");
}

test("the value, the range and the softness are custom properties on the gauge", () => {
  const style = styleOf(slot(render(), "threshold-gauge") ?? {});
  expect(style["--v"]).toBe("4.5");
  expect(style["--min"]).toBe("1");
  expect(style["--max"]).toBe("7");
  expect(style["--soft"]).toBe("0.5");
});

test("a value past max reads as itself", () => {
  const html = render({ value: 10 });
  expect(styleOf(slot(html, "threshold-gauge") ?? {})["--v"]).toBe("10");
  expect(textOf(elementOf(html, "output", 'for="preview-contrast"'))).toBe("10:1");
});

test("a hard cut draws no band", () => {
  const html = render({ softness: 0 });
  expect(slot(html, "gauge-band")).toBeUndefined();
  expect(slot(html, "gauge-post")).toBeDefined();
});

test("off, at the ruler's start, draws no fill, post or band, and the readout turns ink-3", () => {
  const html = render({ value: 1, format: () => "off" });
  expect(slot(html, "gauge-fill")).toBeUndefined();
  expect(slot(html, "gauge-post")).toBeUndefined();
  expect(slot(html, "gauge-band")).toBeUndefined();
  const output = attributesOf(html.match(/<output[^>]*>/)?.[0] ?? "");
  expect(output.class).toContain("text-ink-3");
  expect(textOf(elementOf(html, "output", 'for="preview-contrast"'))).toBe("off");
});

test("the persona's own threshold is a ghost and a was line only when given", () => {
  const without = render();
  expect(slot(without, "gauge-was")).toBeUndefined();
  expect(styleOf(slot(without, "threshold-gauge") ?? {})["--was"]).toBeUndefined();
  expect(textOf(without)).not.toContain("was");

  const html = render({ was: 3 });
  expect(styleOf(slot(html, "threshold-gauge") ?? {})["--was"]).toBe("3");
  expect(html).toMatch(/<span[^>]*>was 3:1<\/span>/);
  // "was" sits on the head row before the readout, never inside it.
  expect(html.indexOf("was 3:1")).toBeLessThan(html.indexOf("<output"));
  expect(textOf(elementOf(html, "output", 'for="preview-contrast"'))).toBe("4.5:1");
});

test("an off gauge still draws the ghost of the persona's own threshold", () => {
  const html = render({ value: 1, format: () => "off", was: 3 });
  expect(slot(html, "gauge-was")).toBeDefined();
  expect(slot(html, "gauge-post")).toBeUndefined();
});

test("the readout holds exactly the input's aria-valuetext", () => {
  const html = render();
  const readout = textOf(elementOf(html, "output", 'for="preview-contrast"'));
  expect(readout).toBe("4.5:1");
  expect(inputOf(html)["aria-valuetext"]).toBe(readout);
  expect(attributesOf(html.match(/<output[^>]*>/)?.[0] ?? "")["aria-live"]).toBe("off");
});

test("a native range input with the gauge's id and range lies over the track", () => {
  const html = render();
  expect(inputOf(html)).toMatchObject({
    type: "range",
    id: "preview-contrast",
    min: "1",
    max: "7",
    step: "0.1",
    value: "4.5",
  });
  expect(html).toMatch(/<label[^>]*for="preview-contrast"[^>]*>Contrast<\/label>/);
  // The input is the track's last child, so it takes every pointer event over the drawing.
  expect(html).toMatch(/<div[^>]*data-slot="gauge-track"[^>]*>.*<input[^>]*><\/div>/s);
});

test("the tags and the softness row follow the track", () => {
  const html = renderToStaticMarkup(
    <ThresholdGauge
      id="preview-contrast"
      label="Contrast"
      value={4.5}
      min={1}
      max={7}
      step={0.1}
      ticks={6}
      softness={0.5}
      format={String}
      tags={<Tag variant="rule">P1</Tag>}
      onMove={() => {}}
      onRelease={() => {}}
    >
      <p>softness row</p>
    </ThresholdGauge>,
  );
  const track = html.indexOf('data-slot="gauge-track"');
  expect(html.indexOf(">P1<")).toBeGreaterThan(track);
  expect(html.indexOf("softness row")).toBeGreaterThan(html.indexOf(">P1<"));
});

test("the ruler draws one tick more than its intervals", () => {
  const ticks = (html: string) => html.match(/data-slot="gauge-tick"/g)?.length;
  expect(ticks(render())).toBe(7);
  expect(ticks(render({ ticks: 8 }))).toBe(9);
});
