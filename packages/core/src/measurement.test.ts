import { describe, expect, test } from "vitest";
import {
  cardLinkElement as card,
  kebabElement as kebab,
  measurementFixture,
} from "./fixtures/index.js";
import { MeasuredElement, MeasuredPart, PageMeasurement } from "./measurement.js";
import { elementKey, type Landmark } from "./observation.js";

const banner: Landmark[] = [{ role: "banner" }];
const nav: Landmark[] = [{ role: "banner" }, { role: "navigation", name: "Main" }];
const main: Landmark[] = [{ role: "main" }];

/** `/deliveries` as the spec's table lists it: kind, role, name, landmark path. */
const DELIVERIES: [kind: "control" | "text", role: string, name: string, path: Landmark[]][] = [
  ["control", "link", "Quillmere", banner],
  ["control", "link", "Home", nav],
  ["control", "link", "Your account", nav],
  ["control", "link", "Deliveries", nav],
  ["control", "link", "Settings", nav],
  ["text", "heading", "Deliveries", main],
  ["text", "paragraph", "Parcels on the way and how you like to receive them.", main],
  ["text", "heading", "On the way", main],
  ["text", "listitem", "1 parcel in transit, expected Friday between 10:00 and 14:00.", main],
  ["control", "link", "Delivery address", main],
  ["text", "heading", "Delivery preferences", main],
  ["control", "checkbox", "Leave with a neighbour if I am out", main],
  ["control", "checkbox", "Text me on the day of delivery", main],
  ["control", "link", "Order archive", main],
];

/** The "Order archive" link, the element the calibration in `docs/RULES.md` is about. */
const archive = {
  key: "main//link:Order archive",
  kind: "control",
  role: "link",
  name: "Order archive",
  bbox: { x: 224, y: 603.0625, width: 102.875, height: 36 },
  metrics: { contrast: 2.005, fontPx: 16, targetPx: 36 },
} as const;

const heading = {
  key: "main//heading:Deliveries",
  kind: "text",
  role: "heading",
  name: "Deliveries",
  bbox: { x: 224, y: 103, width: 832, height: 42 },
  metrics: { contrast: 15.797, fontPx: 28 },
} as const;

describe("measurementFixture", () => {
  test("measurementFixture validates against PageMeasurement", () => {
    expect(PageMeasurement.safeParse(measurementFixture).success).toBe(true);
  });

  test("it is /deliveries at 1280 x 720, scrolled to the top", () => {
    expect(measurementFixture.url).toBe("http://localhost:5174/deliveries");
    expect(measurementFixture.title).toBe("Deliveries · Quillmere");
    expect(measurementFixture.viewport).toEqual({
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      isMobile: false,
    });
    expect(measurementFixture.scroll).toEqual({ x: 0, y: 0 });
  });

  test("the 14 elements come in measurement order, each keyed by elementKey", () => {
    const elements = measurementFixture.elements;
    expect(elements).toHaveLength(14);
    expect(elements.map((e) => e.key)).toEqual(
      DELIVERIES.map(([, role, name, path]) => elementKey({ role, name, path })),
    );
    expect(elements.map((e) => [e.kind, e.role, e.name])).toEqual(
      DELIVERIES.map(([kind, role, name]) => [kind, role, name]),
    );
  });

  test("Order archive is a control at 2.005 contrast, 16 px text and a 36 px target", () => {
    const found = measurementFixture.elements.find((e) => e.name === "Order archive");
    expect(found).toEqual(archive);
  });

  test("text blocks carry no targetPx, controls all do", () => {
    for (const element of measurementFixture.elements) {
      expect(element.metrics.targetPx !== undefined, element.key).toBe(element.kind === "control");
    }
  });

  test("a checkbox's targetPx is its wrapping label's 46 px, not its own 22 px box (#117)", () => {
    const checkboxes = measurementFixture.elements.filter((e) => e.role === "checkbox");
    expect(checkboxes).toHaveLength(2);
    for (const { key, bbox, metrics } of checkboxes) {
      expect([bbox.width, bbox.height], key).toEqual([22, 22]);
      expect(metrics.targetPx, key).toBe(46);
    }
  });

  test("no control on /deliveries says it opens or controls anything", () => {
    for (const element of measurementFixture.elements) {
      expect(element, element.key).not.toHaveProperty("hasPopup");
      expect(element, element.key).not.toHaveProperty("controls");
    }
  });

  test("every element sits inside the viewport, so nothing on it is below the fold", () => {
    const { width, height } = measurementFixture.viewport;
    for (const { key, bbox } of measurementFixture.elements) {
      expect(bbox.x, key).toBeGreaterThanOrEqual(0);
      expect(bbox.y, key).toBeGreaterThanOrEqual(0);
      expect(bbox.x + bbox.width, key).toBeLessThanOrEqual(width);
      expect(bbox.y + bbox.height, key).toBeLessThanOrEqual(height);
    }
  });
});

describe("MeasuredElement (the filter's input, before any decision)", () => {
  test("a control and a text block parse", () => {
    expect(MeasuredElement.safeParse(archive).success).toBe(true);
    expect(MeasuredElement.safeParse(heading).success).toBe(true);
  });

  test("a control with no metrics at all parses: not every element has every metric", () => {
    expect(MeasuredElement.safeParse({ ...archive, metrics: {} }).success).toBe(true);
  });

  test("a decision field is an unknown key: state, ref, rolled, threshold", () => {
    for (const [field, value] of [
      ["state", "visible"],
      ["ref", "e1"],
      ["rolled", 0.37],
      ["threshold", 3],
    ] as const) {
      const result = MeasuredElement.safeParse({ ...archive, [field]: value });
      expect(result.success, field).toBe(false);
      expect(result.error?.issues).toEqual([
        expect.objectContaining({ code: "unrecognized_keys", keys: [field] }),
      ]);
    }
  });

  test("a text block with a targetPx is rejected: P4 is for controls only", () => {
    const result = MeasuredElement.safeParse({
      ...heading,
      metrics: { ...heading.metrics, targetPx: 42 },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ["metrics", "targetPx"],
        message: expect.stringContaining("P4"),
      }),
    ]);
  });

  test("a key that does not end in //role:name is rejected, so role and name cannot drift", () => {
    for (const drift of [
      { role: "button" },
      { name: "Order history" },
      { key: "main//link:Order archive/" },
    ]) {
      const result = MeasuredElement.safeParse({ ...archive, ...drift });
      expect(result.success, JSON.stringify(drift)).toBe(false);
      expect(result.error?.issues).toEqual([
        expect.objectContaining({ path: ["key"], message: expect.stringContaining("//") }),
      ]);
    }
  });

  test("a text block carries neither hasPopup nor controls: they are for controls only", () => {
    for (const fact of [{ hasPopup: "menu" }, { controls: "navigation" }]) {
      const result = MeasuredElement.safeParse({ ...heading, ...fact });
      expect(result.success, JSON.stringify(fact)).toBe(false);
      expect(result.error?.issues).toEqual([
        expect.objectContaining({ path: ["kind"], message: expect.stringContaining("stage 4") }),
      ]);
    }
  });

  test("hasPopup is a popup kind as ARIA reads it, and controls one role word", () => {
    // The collector normalises: "true" is already "menu", "false" or an unknown value left out.
    for (const fact of [
      { hasPopup: "true" },
      { hasPopup: "bogus" },
      { hasPopup: "Menu" },
      { controls: "doc-toc" },
      { controls: "" },
    ]) {
      expect(MeasuredElement.safeParse({ ...kebab, ...fact }).success, JSON.stringify(fact)).toBe(
        false,
      );
    }
  });

  test("the key suffix check reads the whole role, not a tail of it", () => {
    // `main//link:x` ends in `k:x` too; only the full `//link:x` counts.
    const result = MeasuredElement.safeParse({
      ...archive,
      key: "main//link:x",
      role: "k",
      name: "x",
    });
    expect(result.success).toBe(false);
  });
});

describe("MeasuredElement parts (a control drawn in parts, #124)", () => {
  const [title, description] = card.parts ?? [];
  if (title === undefined || description === undefined) {
    throw new Error("the card link fixture is drawn in two parts");
  }

  /** The issues a parse of `input` gives, each as its path and message. */
  const issuesOf = (input: unknown) =>
    (MeasuredElement.safeParse(input).error?.issues ?? []).map((i) => [i.path, i.message]);

  test("a text block is measured whole: it has no parts", () => {
    const block = { ...heading, metrics: { contrast: 4.542, fontPx: 14 }, parts: card.parts };
    expect(issuesOf(block)).toEqual([[["parts"], expect.stringContaining("text block")]]);
  });

  test("the control's contrast and font size are the worst of its parts, so they cannot drift", () => {
    for (const metrics of [
      { ...card.metrics, fontPx: 20 },
      { ...card.metrics, contrast: 21 },
      { fontPx: 14, targetPx: 80 },
      { contrast: 4.542, targetPx: 80 },
    ]) {
      expect(issuesOf({ ...card, metrics }), JSON.stringify(metrics)).toEqual([
        [["metrics"], expect.stringContaining("worst")],
      ]);
    }
    // A part over an unknown background has no contrast, and the worst is of the parts that do.
    const unknown = { ...description, metrics: { fontPx: 14 } };
    const partly = { ...card, metrics: { contrast: 21, fontPx: 14, targetPx: 80 } };
    expect(MeasuredElement.safeParse({ ...partly, parts: [title, unknown] }).success).toBe(true);
    // With none, the control has none either.
    const none = [{ ...title, metrics: { fontPx: 20 } }, unknown];
    const bare = { ...card, metrics: { fontPx: 14, targetPx: 80 }, parts: none };
    expect(MeasuredElement.safeParse(bare).success).toBe(true);
    expect(MeasuredElement.safeParse({ ...bare, metrics: card.metrics }).success).toBe(false);
  });

  test("a part's text is collapsed and never empty", () => {
    expect(MeasuredPart.safeParse(title).success).toBe(true);
    for (const part of [
      { ...title, text: "" },
      { ...title, text: " " },
      { ...title, text: " Job Offers" },
      { ...title, text: "Job  Offers" },
      { ...title, text: "Job\nOffers" },
    ]) {
      expect(MeasuredPart.safeParse(part).success, JSON.stringify(part)).toBe(false);
    }
  });
});

describe("PageMeasurement", () => {
  test("a count the filter decides is an unknown key: belowFoldCount, hiddenCount", () => {
    for (const field of ["belowFoldCount", "hiddenCount"]) {
      const result = PageMeasurement.safeParse({ ...measurementFixture, [field]: 0 });
      expect(result.success, field).toBe(false);
      expect(result.error?.issues).toEqual([
        expect.objectContaining({ code: "unrecognized_keys", keys: [field] }),
      ]);
    }
  });

  test("the scroll offset is required and holds x and y only", () => {
    const { scroll: _scroll, ...unscrolled } = measurementFixture;
    expect(PageMeasurement.safeParse(unscrolled).success).toBe(false);
    expect(
      PageMeasurement.safeParse({ ...measurementFixture, scroll: { x: 0, y: 0, z: 0 } }).success,
    ).toBe(false);
  });
});
