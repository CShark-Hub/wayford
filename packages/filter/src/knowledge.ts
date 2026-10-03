/**
 * Stage 4, knowledge: which interface pattern an element is, and what a persona that does not know
 * that pattern reads instead (`docs/RULES.md`, stage 4, K1 and K4).
 *
 * Deterministic, no dice: the persona either knows a pattern or does not. A pattern is unknown only
 * when the profile lists it in `unknownPatterns`. `knownPatterns` documents the bundle and is never
 * read here.
 *
 * Detection reads the element's role, its name, its outermost landmark (where it sits on the page)
 * and the two facts `collect` measures for this stage, `hasPopup` and `controls`. Each detector is a
 * pure function, and an element matches at most one pattern. Two of the twelve pattern ids have a
 * detector, hamburger and kebab, the only element patterns on the target app and so the only ones
 * a test can watch fire. The other ten never fire.
 *
 * Browser-safe: `@wayford/core` types only, reached from `./perceive`.
 */
import type { KnowledgeDecision, MeasuredElement, UiPattern } from "@wayford/core";

/** Where a hamburger toggle sits: the page header, a navigation, or no landmark at all. */
const HAMBURGER_LANDMARKS: ReadonlySet<string> = new Set(["", "banner", "navigation"]);

/** A kebab's name: More, Options or Actions as its first word, or after "Show". */
const KEBAB_NAME = /^(show )?(more|options|actions)\b/i;

/**
 * The role of the element's outermost landmark, or "" when it has none. The key is
 * `landmark/landmark//role:name` and a role is lowercase letters only, so the outermost role is
 * the key's leading run of them; a key with no landmark starts with `//`.
 */
export function outermostLandmark(key: string): string {
  return /^[a-z]*/.exec(key)?.[0] ?? "";
}

/** A control that draws no text: `collect` measures a font size exactly when an element draws text. */
export function isIconOnly(element: MeasuredElement): boolean {
  return element.kind === "control" && element.metrics.fontPx === undefined;
}

/**
 * Hamburger, the WAI-ARIA APG disclosure navigation: a button in the header, a navigation or no
 * landmark that opens and closes a navigation. The landmark keeps out a table-of-contents toggle
 * in `main`. It may draw text ("Menu"); then it is read by that word, and stage 4 renames nothing.
 */
export function isHamburger(element: MeasuredElement): boolean {
  return (
    element.role === "button" &&
    HAMBURGER_LANDMARKS.has(outermostLandmark(element.key)) &&
    element.controls === "navigation"
  );
}

/**
 * Kebab, the WAI-ARIA APG menu button: an icon-only button that opens a menu and is named More,
 * Options or Actions. The name keeps out an avatar menu.
 */
export function isKebab(element: MeasuredElement): boolean {
  return (
    element.role === "button" &&
    isIconOnly(element) &&
    element.hasPopup === "menu" &&
    KEBAB_NAME.test(element.name)
  );
}

/** The detectors, in the order `detectPattern` tries them. */
const DETECTORS: readonly { pattern: UiPattern; fires: (element: MeasuredElement) => boolean }[] = [
  { pattern: "hamburger", fires: isHamburger },
  { pattern: "kebab", fires: isKebab },
];

/** The pattern of the first detector that fires on the element, or nothing. */
export function detectPattern(element: MeasuredElement): UiPattern | undefined {
  return DETECTORS.find((detector) => detector.fires(element))?.pattern;
}

/**
 * K1 and K4 for one element: nothing unless its pattern is in `unknownPatterns` and it draws no
 * text, then both, each naming the pattern. A control that draws a word is read by that word, so
 * the two rules share one input (`docs/RULES.md`, stage 4). The caller renames the element to its
 * bare role and leaves its state alone.
 */
export function knowledgeDecisions(
  element: MeasuredElement,
  unknownPatterns: readonly UiPattern[],
): KnowledgeDecision[] {
  const pattern = detectPattern(element);
  if (pattern === undefined || !unknownPatterns.includes(pattern) || !isIconOnly(element)) {
    return [];
  }
  return [
    { stage: "knowledge", rule: "K1", pattern },
    { stage: "knowledge", rule: "K4", pattern },
  ];
}
