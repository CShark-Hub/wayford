/**
 * Salience, the order A1 reads a page in. The formula, its anchors and why it keeps to arithmetic,
 * min and max are in `docs/RULES.md` stage 5, "Salience (A1)". When the profile sets
 * `maxElements`, `perceive` puts every element in `salienceOrder` and keeps the first
 * `maxElements` of those stages 1 to 3 left shown.
 *
 * The parameter types show that salience reads the element's box and metrics and the page's
 * viewport, never a perception state, a threshold, the profile or the seed. So what perception
 * removes never reorders the rest, and a smaller cap shows a prefix of the same order.
 * `salienceOrder` returns indices into the elements it is given, not the elements themselves.
 */
import { type MeasuredElement, smallerSide, type Viewport } from "@wayford/core";

/** WCAG 2.2, 1.4.3: text from 24 px is large-scale. */
const LARGE_TEXT_PX = 24;
/** WCAG 2.2, 1.4.12: a line is 1.5 times its font size. */
const LINE_HEIGHT = 1.5;
/** WCAG 2.2, 1.4.3: AA for text. Past it the filter cannot tell which of two elements stands out. */
const AA_CONTRAST = 4.5;

/** What salience reads of an element: its box and its metrics, never its state. */
type Measured = Pick<MeasuredElement, "bbox" | "metrics">;
/** What salience reads of the page: the viewport's size. */
type Page = Pick<Viewport, "width" | "height">;

/** The three terms, each from 0 to 1. `contrast` is absent when none was measured. */
export interface SalienceTerms {
  size: number;
  contrast?: number;
  position: number;
}

/** The terms `S`, `C` and `P` of one element. */
export function salienceTerms(element: Measured, viewport: Page): SalienceTerms {
  const { bbox, metrics } = element;
  const s = metrics.fontPx ?? smallerSide(bbox) / LINE_HEIGHT;
  const size = Math.min(1, s / LARGE_TEXT_PX);
  const x = share(bbox.x, viewport.width);
  const y = share(bbox.y, viewport.height);
  const position = 1 - (y * (1 + x)) / 2;
  if (metrics.contrast === undefined) return { size, position };
  const contrast = Math.min(1, (metrics.contrast - 1) / (AA_CONTRAST - 1));
  return { size, contrast, position };
}

/** One element's salience: `(S + C + P) / 3`, or `(S + P) / 2` when no contrast was measured. */
export function salience(element: Measured, viewport: Page): number {
  const { size, contrast, position } = salienceTerms(element, viewport);
  return contrast === undefined ? (size + position) / 2 : (size + contrast + position) / 3;
}

/**
 * The indices of `elements`, most salient first, equal salience in measurement order. Every
 * element is in it, those stages 1 to 3 removed too, and the cut skips them as it walks (the
 * header says why). The input is not reordered.
 */
export function salienceOrder(elements: readonly Measured[], viewport: Page): number[] {
  return elements
    .map((element, index) => ({ index, value: salience(element, viewport) }))
    .sort((a, b) => b.value - a.value || a.index - b.index)
    .map(({ index }) => index);
}

/** `value` as a share of `length`, clamped to 0..1: a box off the viewport counts as at its edge. */
function share(value: number, length: number): number {
  return Math.min(1, Math.max(0, value / length));
}
