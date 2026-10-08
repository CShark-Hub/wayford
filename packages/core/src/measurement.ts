/**
 * What the collector measured on one page, before the filter decided anything.
 *
 * This is the filter's input and the collector's output. No threshold, state,
 * ref or roll appears in it: those are the filter's decisions and live on
 * `FullObservation`. Keeping them out means one measurement can be run through
 * any profile and any seed, and gives the same answer each time.
 *
 * Elements are listed in measurement order. The filter numbers the shown ones
 * `e1..eN` in that order, or, when the profile sets `maxElements`, in salience
 * order (A1, `docs/RULES.md` stage 5), so the refs follow one of the two.
 *
 * Controls and text blocks (headings, paragraphs, list items) are measured
 * (`docs/RULES.md`, "What is measured", issues #49, #117 and #124). The cues
 * that tell a person where to go are mostly text, so P1 and P3 read text
 * blocks too. P4 reads `targetPx` on controls only. A text block's own text
 * is the text outside the controls and text blocks nested in it: only that
 * counts against it, and one that draws none is not measured. A control named
 * by its own content, whose name more than one element draws, is measured part
 * by part (`parts`), so perception can cut a part and keep the rest (#124). A
 * label is not a text block: the control it names carries the contrast and font
 * size of the label's text.
 * When the label activates the control (a wrapping `<label>`, or `label for=`),
 * `targetPx` is the smaller side of the area a click activates, taken as one
 * rectangle around the control's box and its label's box (for a label apart
 * from its control, the gap between them too). So `targetPx` need not be the
 * smaller side of `bbox`, which is where the control itself is.
 *
 * Coordinate space: every `bbox` is in CSS px, in viewport coordinates, as
 * `getBoundingClientRect()` and Playwright's `boundingBox()` give them. The
 * origin is the viewport's top-left, and the viewport is
 * `[0, width) × [0, height)`. A box's position on the page is `bbox + scroll`.
 * So V2 is decided from `bbox` and `viewport` alone, and `scroll` records
 * where on the page the step was. Only the measurement holds it, and the
 * measurement is not stored: `FullObservation` has no scroll offset, so a
 * stored step keeps viewport positions and no page position (#119).
 */
import { z } from "zod";
import { AriaRole, Metrics, PartMetrics, PartText } from "./observation.js";
import { Bbox, HttpUrl, Viewport } from "./primitives.js";

/** A control is something a person operates (link, button, checkbox); a text block is read. */
export const ElementKind = z.enum(["control", "text"]);
export type ElementKind = z.infer<typeof ElementKind>;

/** What `aria-haspopup` says a control opens, as ARIA 1.2 reads it: `true` is `menu`. */
export const PopupKind = z.enum(["menu", "listbox", "tree", "grid", "dialog"]);
export type PopupKind = z.infer<typeof PopupKind>;

/**
 * One part of a control drawn in parts: the text one element draws itself of the control's name,
 * and that text's contrast and font size, measured as a run of an element's text is (#124).
 */
export const MeasuredPart = z.object({ text: PartText, metrics: PartMetrics }).strict();
export type MeasuredPart = z.infer<typeof MeasuredPart>;

/** The worst of a metric over the parts: the lowest value, `undefined` when no part has one. */
function worstOf(parts: readonly MeasuredPart[], metric: keyof PartMetrics): number | undefined {
  const values = parts.flatMap((part) => part.metrics[metric] ?? []);
  return values.length === 0 ? undefined : Math.min(...values);
}

/**
 * One element as measured. `key` is `elementKey` over the landmark ancestors,
 * the same key the filter hashes for the element's roll. `name` is a control's
 * accessible name, and a text block's too, read from its own text when it is
 * named by its content: the text outside the controls and text blocks nested
 * in it, each of which leaves a space (#124). `metrics` are
 * measured values, never a threshold, and each is optional: an icon has no
 * font size, and stage 4 reads a control with none as icon-only.
 *
 * `parts` is there only on a control whose name comes from its own content and
 * is drawn by two elements or more (`docs/RULES.md`, "What is measured",
 * #124): one part per element that draws a run of the name, in document order,
 * each with the text that element draws itself, and only when those texts,
 * joined by spaces, spell the name. Words out of order, a word split across two
 * elements, or text no element draws (a child's `aria-label`, an `alt`,
 * sr-only text) leave the control with no parts, measured whole.
 * `metrics.contrast` and `metrics.fontPx` stay the worst over the
 * parts, so a reader that does not know `parts` decides as before; that is
 * enforced below, so the two cannot drift. A text block has none, and neither
 * has a control named from a label, an `aria-labelledby` referent or a
 * placeholder: each is measured whole.
 *
 * `hasPopup` and `controls` are what a control's markup says it opens and
 * operates, read for stage 4's pattern detection only (`docs/RULES.md`,
 * "What is measured"): `aria-haspopup`, and the role of the first element its
 * `aria-controls` names, hidden or not. Each is present only when the markup
 * says so, never on a text block, and neither is in the key, so no roll moves.
 *
 * The key ends in `//role:name`, the shape `elementKey` builds, and that is
 * enforced below. Otherwise a fixture or collector edit could change the name
 * and leave the key, and with it the roll, pointing at the old one.
 */
export const MeasuredElement = z
  .object({
    key: z.string().min(1),
    kind: ElementKind,
    role: AriaRole,
    name: z.string(),
    bbox: Bbox,
    metrics: Metrics,
    parts: z
      .array(MeasuredPart)
      .min(2, { message: "a control drawn by one element has no parts" })
      .optional(),
    hasPopup: PopupKind.optional(),
    controls: AriaRole.optional(),
  })
  .strict()
  .refine((e) => e.kind === "control" || e.metrics.targetPx === undefined, {
    path: ["metrics", "targetPx"],
    message:
      'a text block carries no targetPx: P4 is for controls only (docs/RULES.md, "What is measured")',
  })
  .refine((e) => e.kind === "control" || (e.hasPopup === undefined && e.controls === undefined), {
    path: ["kind"],
    message: "a text block carries no hasPopup or controls: stage 4 reads them on controls only",
  })
  .refine((e) => e.kind === "control" || e.parts === undefined, {
    path: ["parts"],
    message: "a text block is measured whole: only a control named by its content has parts",
  })
  .refine(
    (e) =>
      e.parts === undefined ||
      (e.metrics.contrast === worstOf(e.parts, "contrast") &&
        e.metrics.fontPx === worstOf(e.parts, "fontPx")),
    {
      path: ["metrics"],
      message:
        "a control in parts carries the worst contrast and font size of its parts, so they cannot drift",
    },
  )
  .refine((e) => e.key.endsWith(`//${e.role}:${e.name}`), {
    path: ["key"],
    message: "the key ends in //role:name (elementKey), so role and name cannot drift from it",
  });
export type MeasuredElement = z.infer<typeof MeasuredElement>;

/** Where the viewport sits on the page: `window.scrollX`, `window.scrollY`, in CSS px. */
export const ScrollOffset = z.object({ x: z.number(), y: z.number() }).strict();
export type ScrollOffset = z.infer<typeof ScrollOffset>;

/** One page at one step, as measured. */
export const PageMeasurement = z
  .object({
    url: HttpUrl,
    title: z.string(),
    viewport: Viewport,
    scroll: ScrollOffset,
    elements: z.array(MeasuredElement),
  })
  .strict();
export type PageMeasurement = z.infer<typeof PageMeasurement>;
