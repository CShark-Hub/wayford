/**
 * The collector: a Playwright page in, its `PageMeasurement` out. Measurement only, with no
 * threshold, profile or decision: those are `perceive`'s.
 *
 * Playwright is a dev dependency of this package: `collect` takes the page from its caller and
 * imports its type only (`docs/specs/2026-09-29-s1-02-metrics-collector.md`, "collect.ts").
 */
import {
  AriaRole,
  type Bbox,
  elementKey,
  type MeasuredElement,
  type MeasuredPart,
  PageMeasurement,
  PopupKind,
  smallerSide,
  WayfordError,
} from "@wayford/core";
import type { Page } from "playwright";
import { textContrast } from "./contrast.js";
import { measurePage, pageSource, type RawElement, type RawPage } from "./measure-page.js";

export interface CollectOptions {
  /** Whether the caller's context emulates a phone. A page cannot tell, so the caller says. */
  isMobile?: boolean;
}

/**
 * Measure what the page shows now. A page whose measurement does not parse, such as one that is
 * not on http(s), throws a `WayfordError` with code `invalid_measurement`.
 */
export async function collect(page: Page, options: CollectOptions = {}): Promise<PageMeasurement> {
  const raw = await page.evaluate<RawPage>(pageSource(measurePage.toString()));
  const url = page.url();
  const result = PageMeasurement.safeParse({
    url,
    title: raw.title,
    viewport: { ...raw.viewport, isMobile: options.isMobile ?? false },
    scroll: raw.scroll,
    elements: raw.elements.map(measured),
  });
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new WayfordError(
      "invalid_measurement",
      `the page at ${url} gives no valid measurement: ${issues.join("; ")}`,
      { cause: result.error },
    );
  }
  return result.data;
}

/**
 * A raw element's key and metrics. Over several runs of text, the worst contrast and the smallest
 * font count; a run whose background is unknown gives no contrast. A metric the element has no
 * source for is left out, and so are `hasPopup` and `controls` when its markup says nothing. A
 * control drawn in parts carries them too (`partsOf`), and its own contrast and font size are the
 * worst of the same numbers, so the two cannot drift.
 */
function measured(raw: RawElement): MeasuredElement {
  const runs = (raw.texts ?? []).map((run) => ({
    text: run.text,
    contrast: textContrast(run.color, run.layers),
    fontPx: run.fontPx,
  }));
  const contrasts = runs.flatMap((run) => run.contrast ?? []);
  const parts = partsOf(runs);
  const hasPopup = popupOf(raw.hasPopup);
  // A role that is not one lowercase word, such as `doc-toc`, is left out, so it cannot fail the
  // measurement.
  const controls = AriaRole.safeParse(raw.controls);
  return {
    key: elementKey(raw),
    kind: raw.kind,
    role: raw.role,
    name: raw.name,
    bbox: raw.bbox,
    metrics: {
      ...(contrasts.length === 0 ? {} : { contrast: Math.min(...contrasts) }),
      ...(runs.length === 0 ? {} : { fontPx: Math.min(...runs.map((run) => run.fontPx)) }),
      ...(raw.kind === "control"
        ? { targetPx: smallerSide(around([raw.bbox, ...(raw.labels ?? [])])) }
        : {}),
    },
    ...(parts === undefined ? {} : { parts }),
    ...(hasPopup === undefined ? {} : { hasPopup }),
    ...(controls.success ? { controls: controls.data } : {}),
  };
}

/**
 * A control's parts (`docs/RULES.md`, "What is measured", #124): one per run, in the page's order,
 * when it has two runs or more and the page said what each run's element draws itself, which it
 * does only for a control named by its own content. A part's contrast and font size are its run's,
 * read as the element's are. `undefined` for anything else, which is measured whole.
 */
function partsOf(
  runs: readonly { text: string | undefined; contrast: number | undefined; fontPx: number }[],
): MeasuredPart[] | undefined {
  if (runs.length < 2) return undefined;
  const parts: MeasuredPart[] = [];
  for (const { text, contrast, fontPx } of runs) {
    if (text === undefined) return undefined;
    parts.push({ text, metrics: contrast === undefined ? { fontPx } : { contrast, fontPx } });
  }
  return parts;
}

/**
 * `aria-haspopup`, trimmed and lowercased, as ARIA 1.2 reads it: `true` is `menu`. `false`, an
 * empty value or an unknown one opens nothing.
 */
function popupOf(value: string | undefined): PopupKind | undefined {
  const read = value?.trim().toLowerCase();
  const popup = PopupKind.safeParse(read === "true" ? "menu" : read);
  return popup.success ? popup.data : undefined;
}

/**
 * One rectangle around `boxes`. A control's target is its own box and those of the labels that
 * activate it, the gap between them included (`docs/RULES.md`, P4, #117). `bbox` stays its own.
 */
function around(boxes: readonly Bbox[]): Bbox {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
