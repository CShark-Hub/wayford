/**
 * A static render of the preview, read back for its tests. No DOM library is installed
 * (`docs/STACK.md`), so the tests render with `renderToStaticMarkup` and read the markup with
 * these: React's escaping undone, a start tag's attributes and inline style, and each drawn box,
 * by its `data-ref`, `data-state`, text and the measured px inside each `calc(N * var(--px))`.
 * A style is read one property at a time. No production module imports this file.
 */
import { type Bbox, type FullObservation, toActorObservation } from "@wayford/core";

/** Undo React's escaping of text and attribute values. `&amp;` last, so nothing decodes twice. */
export function decode(html: string): string {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");
}

/** The text a piece of markup shows, tags dropped and nothing else touched. */
export function textOf(html: string): string {
  return decode(html.replace(/<[^>]*>/g, ""));
}

/** A start tag's attributes, each name to its decoded value. A bare attribute reads "". */
export function attributesOf(tag: string): Record<string, string> {
  return Object.fromEntries(
    [...tag.matchAll(/([^\s=]+)="([^"]*)"/g)].map((m) => [m[1] ?? "", decode(m[2] ?? "")]),
  );
}

/** A `style` attribute, each property to its value. */
export function styleOf(attributes: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    (attributes.style ?? "")
      .split(";")
      .filter((declaration) => declaration.includes(":"))
      .map((declaration) => {
        const colon = declaration.indexOf(":");
        return [declaration.slice(0, colon), declaration.slice(colon + 1)];
      }),
  );
}

/** The measured CSS px inside `calc(N * var(--px))`. */
function measuredPx(value: string | undefined): number {
  const px = value?.match(/^calc\((-?[\d.]+(?:e[+-]?\d+)?) \* var\(--px\)\)$/)?.[1];
  if (px === undefined) throw new Error(`Not a measured length: ${value}`);
  return Number(px);
}

/** The text of the page's caption, or undefined when it has none. */
export function captionOf(html: string): string | undefined {
  const caption = html.match(/<figcaption[^>]*>(.*?)<\/figcaption>/s)?.[1];
  return caption === undefined ? undefined : textOf(caption);
}

/** A drawn box's or an outline's bbox, from its style. */
export function bboxOf(style: Record<string, string>): Bbox {
  return {
    x: measuredPx(style.left),
    y: measuredPx(style.top),
    width: measuredPx(style.width),
    height: measuredPx(style.height),
  };
}

/**
 * `inner`, the markup of a `<tag>` read up to its first `</tag>`, when it holds no `<tag>` of its
 * own. A nested one would end the read early and drop whatever follows it, so it throws instead.
 */
export function withoutNested(tag: string, inner: string): string {
  if (new RegExp(`<${tag}[\\s/>]`).test(inner)) {
    throw new Error(`A <${tag}> read to its first </${tag}> holds a <${tag}>: ${inner}`);
  }
  return inner;
}

/**
 * Every `<div>` carrying `attribute`, with its attributes and inner markup. Neither a drawn box nor
 * an outline holds a `<div>`, so the inner markup ends at the first `</div>`, and one that does
 * throws.
 */
export function divsWith(html: string, attribute: string) {
  const pattern = new RegExp(`<div((?:\\s[^>]*)?\\s${attribute}="[^"]*"[^>]*)>(.*?)</div>`, "gs");
  return [...html.matchAll(pattern)].map((m) => ({
    attributes: attributesOf(m[1] ?? ""),
    inner: withoutNested("div", m[2] ?? ""),
  }));
}

/** What a drawn box says about its element. */
export type Drawn = {
  ref: string | undefined;
  state: string | undefined;
  name: string;
  bbox: Bbox;
  fontPx: number;
};

/**
 * Every drawn box on the page, in order. A box is found by its `data-state`, which every drawn
 * element carries, and not by its `data-ref`, which a removed element lacks: a regression that drew
 * a removed element would otherwise go unseen by every test built on this reader.
 */
export function drawnBoxes(html: string): Drawn[] {
  return divsWith(html, "data-state").map(({ attributes, inner }) => {
    const style = styleOf(attributes);
    return {
      ref: attributes["data-ref"],
      state: attributes["data-state"],
      name: textOf(inner),
      bbox: bboxOf(style),
      fontPx: measuredPx(style["font-size"]),
    };
  });
}

/**
 * The shown elements of an observation as a box must draw them: ref, state, box and font size
 * from the `FullObservation`, 16 px when none was measured, and the name `toActorObservation`
 * gives the ref.
 */
export function shownElements(full: FullObservation): Drawn[] {
  const names = new Map(toActorObservation(full).elements.map((e) => [e.ref, e.name]));
  return full.elements
    .filter((e) => e.ref !== undefined)
    .map((e) => {
      const name = names.get(e.ref ?? "");
      if (name === undefined) throw new Error(`The Actor reads no ${e.ref}`);
      return { ref: e.ref, state: e.state, name, bbox: e.bbox, fontPx: e.metrics.fontPx ?? 16 };
    });
}
