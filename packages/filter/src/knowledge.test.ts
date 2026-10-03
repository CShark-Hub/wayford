/**
 * Stage 4's detectors and decisions against the spec ("Stage 4: knowledge (K1, K4)") and
 * `docs/RULES.md` stage 4. No browser: every element but core's kebab fixture is written inline,
 * shaped like what `collect` measures, and parsed as a `MeasuredElement` so a case cannot drift
 * from the contract. Each detector has its positive case and the near misses it must not fire on.
 * The real pages, where each one fires and where it must not, are in the browser tests.
 */
import {
  elementKey,
  type Landmark,
  MeasuredElement,
  type PopupKind,
  UI_PATTERNS,
} from "@wayford/core";
import { kebabElement as KEBAB, measurementFixture } from "@wayford/core/fixtures";
import { describe, expect, test } from "vitest";
import {
  detectPattern,
  isHamburger,
  isIconOnly,
  isKebab,
  knowledgeDecisions,
  outermostLandmark,
} from "./knowledge.js";

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

const BANNER: Landmark[] = [{ role: "banner" }];
const MAIN: Landmark[] = [{ role: "main" }];
const NAV: Landmark[] = [{ role: "navigation", name: "Main" }];

/**
 * A control as `collect` measures it. `fontPx` is set exactly when it draws text, and a contrast
 * with it: `collect` measures contrast only from text.
 */
function control(input: {
  path: Landmark[];
  role?: string;
  name: string;
  fontPx?: number;
  hasPopup?: PopupKind;
  controls?: string;
}): MeasuredElement {
  const role = input.role ?? "button";
  return MeasuredElement.parse({
    key: elementKey({ role, name: input.name, path: input.path }),
    kind: "control",
    role,
    name: input.name,
    bbox: { x: 224, y: 164, width: 28, height: 28 },
    metrics: {
      ...(input.fontPx === undefined ? {} : { contrast: 7, fontPx: input.fontPx }),
      targetPx: 28,
    },
    ...(input.hasPopup === undefined ? {} : { hasPopup: input.hasPopup }),
    ...(input.controls === undefined ? {} : { controls: input.controls }),
  });
}

/** The target app's phone toggle: draws "Menu", opens the nav it names. */
const TOGGLE = control({ path: BANNER, name: "Menu", fontPx: 16, controls: "navigation" });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe("outermostLandmark", () => {
  test.each([
    ["//button:Menu", ""],
    ["banner//button:Menu", "banner"],
    ["banner/navigation:Main//link:Home", "banner"],
    ["navigation:Main//link:Home", "navigation"],
    ["main:Account/region:Recent//button:a/b", "main"],
  ])("%s leads with %j", (key, landmark) => {
    expect(outermostLandmark(key)).toBe(landmark);
  });
});

describe("isIconOnly", () => {
  test("is a control that draws no text", () => {
    expect(isIconOnly(KEBAB)).toBe(true);
    expect(isIconOnly(TOGGLE)).toBe(false);
  });

  test("is never a text block", () => {
    const text = MeasuredElement.parse({
      key: "main//paragraph:Hello",
      kind: "text",
      role: "paragraph",
      name: "Hello",
      bbox: { x: 0, y: 0, width: 100, height: 20 },
      metrics: {},
    });
    expect(isIconOnly(text)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

describe("hamburger", () => {
  // The page header is the target app's toggle, the next test.
  test.each([
    ["a navigation", NAV],
    ["no landmark", []],
  ])("fires on a button in %s that controls a navigation", (_where, path) => {
    const toggle = control({ path, name: "Menu", fontPx: 16, controls: "navigation" });
    expect(isHamburger(toggle)).toBe(true);
    expect(detectPattern(toggle)).toBe("hamburger");
  });

  test("fires on the target app's toggle, which draws text", () => {
    expect(detectPattern(TOGGLE)).toBe("hamburger");
  });

  test.each([
    [
      "a table-of-contents toggle in main",
      control({ path: MAIN, name: "Contents", fontPx: 16, controls: "navigation" }),
    ],
    [
      "a footer button that controls a navigation",
      control({
        path: [{ role: "contentinfo" }],
        name: "Menu",
        fontPx: 16,
        controls: "navigation",
      }),
    ],
    [
      'a "Menu" link',
      control({ path: BANNER, role: "link", name: "Menu", fontPx: 16, controls: "navigation" }),
    ],
    ["a header button with no controls", control({ path: BANNER, name: "Menu", fontPx: 16 })],
    [
      "a header button that controls a menu",
      control({ path: BANNER, name: "Menu", fontPx: 16, hasPopup: "menu", controls: "menu" }),
    ],
  ])("does not fire on %s", (_case, element) => {
    expect(isHamburger(element)).toBe(false);
    expect(detectPattern(element)).toBeUndefined();
  });
});

describe("kebab", () => {
  test("fires on the target app's kebab", () => {
    expect(isKebab(KEBAB)).toBe(true);
    expect(detectPattern(KEBAB)).toBe("kebab");
  });

  test.each(["More", "more actions", "Options", "Actions", "Show more", "Show More options"])(
    'fires on an icon-only menu button named "%s"',
    (name) => {
      expect(detectPattern(control({ path: MAIN, name, hasPopup: "menu" }))).toBe("kebab");
    },
  );

  test.each([
    [
      'an avatar menu named "Account"',
      control({ path: BANNER, name: "Account", hasPopup: "menu", controls: "menu" }),
    ],
    [
      'a "More" button that draws text',
      control({ path: MAIN, name: "More", fontPx: 16, hasPopup: "menu", controls: "menu" }),
    ],
    ["a kebab without hasPopup", control({ path: MAIN, name: "More options", controls: "menu" })],
    [
      "a kebab that opens a listbox",
      control({ path: MAIN, name: "More options", hasPopup: "listbox" }),
    ],
    [
      'a name that only starts with "More"',
      control({ path: MAIN, name: "Moreover", hasPopup: "menu" }),
    ],
    [
      'a name with "more" later on',
      control({ path: MAIN, name: "Show me more", hasPopup: "menu" }),
    ],
    [
      'a "More options" link',
      control({ path: MAIN, role: "link", name: "More options", hasPopup: "menu" }),
    ],
  ])("does not fire on %s", (_case, element) => {
    expect(isKebab(element)).toBe(false);
    expect(detectPattern(element)).toBeUndefined();
  });
});

describe("detectPattern", () => {
  test("tries hamburger before kebab", () => {
    const both = control({
      path: BANNER,
      name: "More",
      hasPopup: "menu",
      controls: "navigation",
    });
    expect(isHamburger(both)).toBe(true);
    expect(isKebab(both)).toBe(true);
    expect(detectPattern(both)).toBe("hamburger");
  });
});

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

describe("knowledgeDecisions", () => {
  test("gives nothing to a toggle that draws its word: it is read by that word", () => {
    expect(detectPattern(TOGGLE)).toBe("hamburger");
    expect(knowledgeDecisions(TOGGLE, ["hamburger"])).toEqual([]);
  });

  test("gives K1 and K4 for an icon-only hamburger", () => {
    const icon = control({ path: BANNER, name: "Menu", controls: "navigation" });
    expect(knowledgeDecisions(icon, ["hamburger"])).toEqual([
      { stage: "knowledge", rule: "K1", pattern: "hamburger" },
      { stage: "knowledge", rule: "K4", pattern: "hamburger" },
    ]);
  });

  test("gives K1 and K4 for an icon-only kebab", () => {
    expect(knowledgeDecisions(KEBAB, ["kebab"])).toEqual([
      { stage: "knowledge", rule: "K1", pattern: "kebab" },
      { stage: "knowledge", rule: "K4", pattern: "kebab" },
    ]);
  });

  test("gives nothing when the pattern is not in unknownPatterns", () => {
    expect(knowledgeDecisions(KEBAB, [])).toEqual([]);
    expect(knowledgeDecisions(KEBAB, ["hamburger", "breadcrumb"])).toEqual([]);
    expect(knowledgeDecisions(TOGGLE, ["kebab"])).toEqual([]);
  });

  test("gives nothing to an element that matches no pattern, whatever is unknown", () => {
    // No detector fires on the measurement fixture (`/deliveries`).
    for (const element of measurementFixture.elements) {
      expect(knowledgeDecisions(element, UI_PATTERNS), element.key).toEqual([]);
    }
  });
});
