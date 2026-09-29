/**
 * What the collector measured on one page, before the filter decided anything.
 *
 * This is the filter's input and the collector's output. No threshold, state,
 * ref or roll appears in it: those are the filter's decisions and live on
 * `FullObservation`. Keeping them out means one measurement can be run through
 * any profile and any seed, and gives the same answer each time.
 *
 * Elements are listed in measurement order. The filter numbers the shown ones
 * `e1..eN` in that order, so the refs follow it.
 *
 * Controls and text blocks (headings, paragraphs, list items) are measured
 * (`docs/RULES.md`, "What is measured", issues #49 and #117). The cues that
 * tell a person where to go are mostly text, so P1 and P3 read text blocks
 * too. P4 reads `targetPx` on controls only. A label is not a text block: the
 * control it names carries the contrast and font size of the label's text.
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
import { AriaRole, Metrics } from "./observation.js";
import { Bbox, HttpUrl, Viewport } from "./primitives.js";

/** A control is something a person operates (link, button, checkbox); a text block is read. */
export const ElementKind = z.enum(["control", "text"]);
export type ElementKind = z.infer<typeof ElementKind>;

/**
 * One element as measured. `key` is `elementKey` over the landmark ancestors,
 * the same key the filter hashes for the element's roll. `name` is a control's
 * accessible name, a text block's visible text. `metrics` are measured values,
 * never a threshold, and each is optional: an icon has no font size.
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
  })
  .strict()
  .refine((e) => e.kind === "control" || e.metrics.targetPx === undefined, {
    path: ["metrics", "targetPx"],
    message:
      'a text block carries no targetPx: P4 is for controls only (docs/RULES.md, "What is measured")',
  })
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
