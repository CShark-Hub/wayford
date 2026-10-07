import { Sweep } from "@wayford/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { attributesOf, lineOf, styleOf } from "../preview/rendered-markup.js";
import { fixtureSweeps, stoppedSweep } from "./fixture-sweeps.js";
import { readSweep } from "./reading.js";
import { SweepChart } from "./sweep-chart.js";

const { vera, kai, noBoundary, stopped, noRoutes, incomplete, empty } = fixtureSweeps;

/** Half or more through up to 4.0, then 2 of 10 at 4.5: the boundary is the last value. */
const lastBoundary = Sweep.parse({
  ...vera,
  values: vera.values.map((row) =>
    row.value === 4.5
      ? { ...row, successes: 2, errors: 0 }
      : { ...row, successes: Math.max(row.successes, 5), errors: 0 },
  ),
  boundary: 4.5,
});

/** The chart of `sweep`, read as its screen reads it. */
function chart(sweep: Sweep, persona = "Vera"): string {
  return renderToStaticMarkup(
    <SweepChart sweep={sweep} reading={readSweep(sweep)} persona={persona} />,
  );
}

/** The attributes of every `<name …>` start tag in `html`, in document order. */
function tags(html: string, name: string): Record<string, string>[] {
  return [...html.matchAll(new RegExp(`<${name}(?=[\\s>/])[^>]*>`, "g"))].map((m) =>
    attributesOf(m[0]),
  );
}

/** The elements of `html` carrying `data-<key>="<value>"`, any tag. */
function withData(html: string, key: string, value: string): Record<string, string>[] {
  return [...html.matchAll(/<[a-z]+(?=[\s>/])[^>]*>/g)]
    .map((m) => attributesOf(m[0]))
    .filter((attributes) => attributes[`data-${key}`] === value);
}

/** The one element carrying `data-<key>="<value>"`; throws for none or several. */
function only(html: string, key: string, value: string): Record<string, string> {
  const found = withData(html, key, value);
  if (found.length !== 1) throw new Error(`${found.length} elements carry data-${key}=${value}`);
  return found[0] as Record<string, string>;
}

/** The `x,y` pairs of a polyline's or polygon's `points`. */
function pointsOf(attributes: Record<string, string>): [number, number][] {
  return (attributes.points ?? "")
    .trim()
    .split(/\s+/)
    .filter((pair) => pair !== "")
    .map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return [x ?? Number.NaN, y ?? Number.NaN];
    });
}

/** Every `<text>` of the chart's SVG: its attributes and what it reads. */
function texts(html: string): { attributes: Record<string, string>; text: string }[] {
  return [...html.matchAll(/<text(?=[\s>])([^>]*)>(.*?)<\/text>/gs)].map((m) => ({
    attributes: attributesOf(m[1] ?? ""),
    text: lineOf(m[2] ?? ""),
  }));
}

/** The x-axis tick labels, left to right: each one's text and x. */
function tickLabels(
  html: string,
): { text: string; x: number; attributes: Record<string, string> }[] {
  return texts(html)
    .filter((t) => t.attributes["data-tick"] !== undefined)
    .map((t) => ({ text: t.text, x: Number(t.attributes.x), attributes: t.attributes }));
}

/** The x of the tick label that reads `label`. */
function tickX(html: string, label: string): number {
  const tick = tickLabels(html).find((t) => t.text === label);
  if (tick === undefined) throw new Error(`no tick label reads ${label}`);
  return tick.x;
}

/** The y title's attributes. */
function yTitle(html: string): Record<string, string> {
  const found = texts(html).find((t) => /^share of \d+ seeds$/.test(t.text));
  if (found === undefined) throw new Error("no y title");
  return found.attributes;
}

/** What the legend says, entry by entry. */
function legendEntries(html: string): string[] {
  return [...html.matchAll(/<li(?:\s[^>]*)?>(.*?)<\/li>/gs)].map((m) => lineOf(m[1] ?? ""));
}

/** The `<svg role="img">`'s attributes: the chart itself, not a legend glyph. */
function chartSvg(html: string): Record<string, string> {
  const found = tags(html, "svg").filter((attributes) => attributes.role === "img");
  if (found.length !== 1) throw new Error(`${found.length} charts`);
  return found[0] as Record<string, string>;
}

describe("Vera's fixture", () => {
  const html = chart(vera);

  test("draws route open and got through, seven points each, and the gap between them", () => {
    expect(pointsOf(only(html, "series", "route"))).toHaveLength(7);
    expect(pointsOf(only(html, "series", "through"))).toHaveLength(7);
    // Route forward, then through back.
    expect(pointsOf(only(html, "series", "gap"))).toHaveLength(14);
    expect(withData(html, "point", "route")).toHaveLength(7);
    expect(withData(html, "point", "through")).toHaveLength(7);
  });

  test("places each point at its band's centre and its share of the seeds", () => {
    // 3.0 is the fourth of seven bands; 3 of 10 had a route open there, 2 of 10 got through.
    const x = 60 + (3 + 0.5) * (736 / 7);
    expect(pointsOf(only(html, "series", "route"))[3]).toStrictEqual([
      Math.round(x * 10) / 10,
      Math.round((330 - 0.3 * 278) * 10) / 10,
    ]);
    expect(pointsOf(only(html, "series", "through"))[3]).toStrictEqual([
      Math.round(x * 10) / 10,
      Math.round((330 - 0.2 * 278) * 10) / 10,
    ]);
  });

  test("ticks the grid 1.5 to 4.5, laxest left, the boundary's label in signal ink", () => {
    const ticks = tickLabels(html);
    expect(ticks.map((t) => t.text)).toStrictEqual([
      "1.5",
      "2.0",
      "2.5",
      "3.0",
      "3.5",
      "4.0",
      "4.5",
    ]);
    expect(ticks.map((t) => t.x)).toStrictEqual([...ticks.map((t) => t.x)].sort((a, b) => a - b));
    const boundary = ticks.find((t) => t.text === "3.0");
    expect(boundary?.attributes.class).toContain("fill-signal-ink");
    for (const tick of ticks.filter((t) => t.text !== "3.0")) {
      expect(tick.attributes.class).not.toContain("signal");
    }
  });

  test("raises exactly one post, at the 3.0 tick, flagged boundary 3.0:1 · 2/10", () => {
    const post = only(html, "mark", "post");
    expect(Number(post.x1)).toBe(tickX(html, "3.0"));
    expect(Number(post.x2)).toBe(tickX(html, "3.0"));
    expect(post.class).toContain("stroke-signal");
    const flag = only(html, "mark", "flag");
    expect(flag.class).toContain("fill-signal");
    // The flag sits right of the post when it fits.
    expect(Number(flag.x)).toBe(Number(post.x1));
    const flagText = texts(html).find((t) => t.attributes["data-mark"] === "flag-text");
    expect(flagText?.text).toBe("boundary 3.0:1 · 2/10");
    expect(flagText?.attributes.class).toContain("fill-on-signal");
  });

  test("titles y as the share of the sweep's 10 seeds, and x as Vera's contrast threshold", () => {
    const words = texts(html).map((t) => t.text);
    expect(words).toContain("share of 10 seeds");
    // Top left, where the flag at 3.0 leaves it room.
    expect(yTitle(html).x).toBe("0");
    expect(words).toContain("half the seeds");
    expect(words).toContain("Vera's contrast threshold, x:1");
    expect(words).toContain("stricter →");
    expect(words).toEqual(expect.arrayContaining(["0", "0.5", "1"]));
  });

  test("states the reading in words for assistive technology", () => {
    expect(chartSvg(html)["aria-label"]).toBe(
      "Contrast sweep on Vera: route open and got through across 1.5 to 4.5; under half get through, first at 3.0:1",
    );
  });

  test("keys the three series in the legend, each with its glyph", () => {
    expect(legendEntries(html)).toStrictEqual([
      "route open · the filter · deterministic",
      "got through · the agent · hypothesis",
      "lost on an open route",
    ]);
    const legend = html.match(/<ul(?:\s[^>]*)?>(.*?)<\/ul>/s)?.[1] ?? "";
    expect(tags(legend, "svg").every((glyph) => glyph["aria-hidden"] === "true")).toBe(true);
    expect(tags(legend, "svg")).toHaveLength(3);
  });

  test("paints got through in Vera's slot, through --p on the figure", () => {
    const figure = tags(html, "figure")[0] ?? {};
    expect(styleOf(figure)["--p"]).toBe("var(--persona-cobalt)");
    expect(only(html, "series", "through").class).toContain("stroke-(--p)");
  });

  test("hatches the gap with its own pattern", () => {
    const pattern = tags(html, "pattern").map((p) => p.id);
    const fill = only(html, "series", "gap").fill;
    expect(pattern).toContain(fill?.match(/^url\(#(.+)\)$/)?.[1]);
  });

  test("sets every text in 16 px mono, through the type utilities alone", () => {
    expect(html).not.toMatch(/text-\[/);
    for (const { attributes, text } of texts(html)) {
      expect(attributes.class, text).toMatch(/\bmono\b/);
    }
  });
});

describe("Kai's fixture", () => {
  const html = chart(kai, "Kai");

  test("runs x from 16 down to 4, laxest left", () => {
    expect(tickLabels(html).map((t) => t.text)).toStrictEqual([
      "16",
      "14",
      "12",
      "10",
      "8",
      "6",
      "4",
    ]);
  });

  test("raises the post at 10, flagged boundary 10 · 4/10", () => {
    expect(Number(only(html, "mark", "post").x1)).toBe(tickX(html, "10"));
    const flagText = texts(html).find((t) => t.attributes["data-mark"] === "flag-text");
    expect(flagText?.text).toBe("boundary 10 · 4/10");
  });

  test("titles x as Kai's attention cap", () => {
    expect(texts(html).map((t) => t.text)).toContain("Kai's attention cap, elements");
    expect(chartSvg(html)["aria-label"]).toBe(
      "Attention sweep on Kai: route open and got through across 16 to 4; under half get through, first at 10",
    );
  });

  test("paints got through in Kai's slot", () => {
    expect(styleOf(tags(html, "figure")[0] ?? {})["--p"]).toBe("var(--persona-raspberry)");
  });
});

describe("a sweep with no boundary in range", () => {
  const html = chart(noBoundary);

  test("says no boundary up to 4.5:1, and raises no post", () => {
    const note = only(html, "mark", "note");
    expect(texts(html).find((t) => t.attributes["data-mark"] === "note")?.text).toBe(
      "no boundary up to 4.5:1",
    );
    expect(note.class).toContain("fill-ink-2");
    expect(withData(html, "mark", "post")).toHaveLength(0);
    expect(withData(html, "mark", "flag")).toHaveLength(0);
    expect(chartSvg(html)["aria-label"]).toContain("no boundary up to 4.5:1");
  });

  test("keeps every tick label in ink-3", () => {
    for (const tick of tickLabels(html)) expect(tick.attributes.class).not.toContain("signal");
  });
});

describe("a sweep stopped at an errored 2.5", () => {
  const html = chart(stopped);

  test("draws a solid fault stop line at 2.5, labelled with its error", () => {
    const stop = only(html, "mark", "stop");
    expect(Number(stop.x1)).toBe(tickX(html, "2.5"));
    expect(stop.class).toContain("stroke-fault");
    expect(stop["stroke-dasharray"]).toBeUndefined();
    const label = texts(html).find((t) => t.attributes["data-mark"] === "stop-label");
    expect(label?.text).toBe("stops at 2.5:1 · 1 run errored");
    expect(label?.attributes.class).toContain("fill-fault");
  });

  test("raises no post, and never says no boundary", () => {
    expect(withData(html, "mark", "post")).toHaveLength(0);
    expect(withData(html, "mark", "flag")).toHaveLength(0);
    expect(html).not.toContain("no boundary");
    expect(chartSvg(html)["aria-label"]).toBe(
      "Contrast sweep on Vera: route open and got through across 1.5 to 2.5; the sweep stops at 2.5:1, where 1 run errored, and claims nothing past it",
    );
  });

  test("draws nothing past the stop", () => {
    const stopX = tickX(html, "2.5");
    const through = pointsOf(only(html, "series", "through"));
    expect(through).toHaveLength(3);
    expect(pointsOf(only(html, "series", "route"))).toHaveLength(3);
    expect(withData(html, "point", "through")).toHaveLength(3);
    for (const [x] of [...through, ...pointsOf(only(html, "series", "gap"))]) {
      expect(x).toBeLessThanOrEqual(stopX);
    }
  });

  test("names two errored runs in the plural", () => {
    const twice = stoppedSweep(2);
    const label = texts(chart(twice)).find((t) => t.attributes["data-mark"] === "stop-label");
    expect(label?.text).toBe("stops at 2.5:1 · 2 runs errored");
  });
});

describe("a goal with no route table", () => {
  const html = chart(noRoutes);

  test("draws no route line and no gap, only got through", () => {
    expect(withData(html, "series", "route")).toHaveLength(0);
    expect(withData(html, "series", "gap")).toHaveLength(0);
    expect(withData(html, "point", "route")).toHaveLength(0);
    expect(pointsOf(only(html, "series", "through"))).toHaveLength(7);
  });

  test("says so in the legend, and keys no gap", () => {
    expect(legendEntries(html)).toStrictEqual([
      "route open · — for this goal",
      "got through · the agent · hypothesis",
    ]);
    expect(chartSvg(html)["aria-label"]).toBe(
      "Contrast sweep on Vera: got through across 1.5 to 4.5; under half get through, first at 3.0:1",
    );
  });
});

test("the flag flips to the post's left when the boundary is the last value", () => {
  const html = chart(lastBoundary);
  const post = only(html, "mark", "post");
  const flag = only(html, "mark", "flag");
  expect(Number(post.x1)).toBe(tickX(html, "4.5"));
  expect(Number(flag.x)).toBeLessThan(Number(post.x1));
  expect(Number(flag.x) + Number(flag.width)).toBeLessThanOrEqual(Number(post.x1));
  const flagText = texts(html).find((t) => t.attributes["data-mark"] === "flag-text");
  expect(Number(flagText?.attributes.x)).toBeGreaterThan(Number(flag.x));
  expect(Number(flagText?.attributes.x)).toBeLessThan(Number(post.x1));
});

test("the y title moves to the top right when the flag would cover it", () => {
  // 2 of 10 at the laxest value: the boundary is 1.5, and its flag runs over the top left.
  const first = Sweep.parse({
    ...vera,
    values: vera.values.map((row) => (row.value === 1.5 ? { ...row, successes: 2 } : row)),
    boundary: 1.5,
  });
  const html = chart(first);
  const post = only(html, "mark", "post");
  expect(Number(post.x1)).toBe(tickX(html, "1.5"));
  expect(Number(only(html, "mark", "flag").x)).toBe(Number(post.x1));
  expect(yTitle(html)).toMatchObject({ x: "796", "text-anchor": "end" });
});

test("an incomplete sweep ticks the whole grid and draws points for its stored values only", () => {
  const html = chart(incomplete);
  const ticks = tickLabels(html);
  expect(ticks.map((t) => t.text)).toStrictEqual(["1.5", "2.0", "2.5", "3.0", "3.5", "4.0", "4.5"]);
  const through = pointsOf(only(html, "series", "through"));
  expect(through.map(([x]) => x)).toStrictEqual(ticks.slice(0, 3).map((t) => t.x));
  expect(withData(html, "point", "through")).toHaveLength(3);
  expect(withData(html, "point", "route")).toHaveLength(3);
});

test("an empty sweep draws the axes and the grid alone, saying nothing measured yet", () => {
  const html = chart(empty);
  expect(texts(html).find((t) => t.attributes["data-mark"] === "note")?.text).toBe(
    "nothing measured yet",
  );
  expect(tickLabels(html)).toHaveLength(7);
  for (const series of ["route", "through", "gap"]) {
    expect(withData(html, "series", series)).toHaveLength(0);
  }
  expect(withData(html, "mark", "post")).toHaveLength(0);
  expect(chartSvg(html)["aria-label"]).toBe("Contrast sweep on Vera: nothing measured yet");
});

test("tick labels thin out where they would collide, the boundary's always kept", () => {
  // 1.5 to 6.4 by 0.1 is fifty values; 1.8 is the boundary.
  const runIds = vera.values[0]?.runIds ?? [];
  const dense = Sweep.parse({
    ...vera,
    status: "incomplete",
    to: 6.4,
    step: 0.1,
    values: [1.5, 1.6, 1.7, 1.8].map((value, i) => ({
      value,
      runIds,
      successes: i < 3 ? 9 : 2,
      errors: 0,
      routeOpenSeeds: null,
    })),
    boundary: 1.8,
  });
  const html = chart(dense);
  const ticks = tickLabels(html);
  expect(ticks.length).toBeLessThan(50);
  expect(ticks.length).toBeGreaterThan(1);
  expect(ticks.find((t) => t.text === "1.8")?.attributes.class).toContain("fill-signal-ink");
  // About 9.6 px per mono character, plus a gap.
  ticks.slice(1).forEach((tick, i) => {
    const before = ticks[i];
    if (before === undefined) return;
    const room = ((tick.text.length + before.text.length) / 2) * 9.6;
    expect(tick.x - before.x).toBeGreaterThan(room);
  });
  // Every value still has its tick mark.
  expect(withData(html, "mark", "tick")).toHaveLength(50);
  // The flag at 1.8 runs over the top left, so the y title takes the top right.
  expect(yTitle(html)).toMatchObject({ x: "796", "text-anchor": "end" });
});
