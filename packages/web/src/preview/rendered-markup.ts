/**
 * A static render, read back for the web tests. No DOM library is installed (`docs/STACK.md`), so
 * the tests render with `renderToStaticMarkup` and read the markup with these: React's escaping
 * undone, a start tag's attributes and inline style, a section by its heading, a `<dl>` and a
 * table's rows, and the preview's drawn boxes, by their `data-ref`, `data-state`, text and the
 * measured px inside each `calc(N * var(--px))`. A style is read one property at a time. No
 * production module imports this file.
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

/**
 * The text a piece of markup reads as, on one line: tags become spaces, whitespace collapses. A
 * `hidden` span's text is dropped: it is shown nowhere, only named by an `aria-describedby`, as a
 * hint's words are (#240).
 */
export function lineOf(html: string): string {
  return decode(
    html.replace(/<span(?=[^>]*\shidden="")[^>]*>[^<]*<\/span>/g, " ").replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The inner markup of the `<section>` its `<h2>` or `<h3>` labels, found by the heading's text
 * through the section's `aria-labelledby`, so a section its heading does not label is not found.
 * Only for a section with no section inside it: the match ends at the first `</section>`.
 */
export function sectionOf(html: string, heading: string): string {
  const ids = [...html.matchAll(/<h([23]) [^>]*id="([^"]+)"[^>]*>(.*?)<\/h\1>/gs)];
  const id = ids.find((h) => lineOf(h[3] ?? "") === heading)?.[2];
  if (id === undefined) throw new Error(`no <h2> or <h3> reads ${heading}`);
  const body = html.match(
    new RegExp(`<section [^>]*aria-labelledby="${id}"[^>]*>(.*?)</section>`, "s"),
  );
  if (body?.[1] === undefined) throw new Error(`no section is labelled by ${heading}`);
  return body[1];
}

/** What every `<dl>` in `html` says, each term to its description. */
export function detailsOf(html: string): Record<string, string> {
  const pairs = html.matchAll(/<dt(?:\s[^>]*)?>(.*?)<\/dt>\s*<dd(?:\s[^>]*)?>(.*?)<\/dd>/gs);
  return Object.fromEntries([...pairs].map((p) => [lineOf(p[1] ?? ""), lineOf(p[2] ?? "")]));
}

/** Each table row's cell texts, header rows included. */
export function rowsOf(html: string): string[][] {
  return [...html.matchAll(/<tr(?:\s[^>]*)?>(.*?)<\/tr>/gs)].map((row) =>
    [...(row[1] ?? "").matchAll(/<t[hd](?:\s[^>]*)?>(.*?)<\/t[hd]>/gs)].map((cell) =>
      lineOf(cell[1] ?? ""),
    ),
  );
}

/** A start tag's attributes, each name to its decoded value. A bare attribute reads "". */
export function attributesOf(tag: string): Record<string, string> {
  return Object.fromEntries(
    [...tag.matchAll(/([^\s=]+)="([^"]*)"/g)].map((m) => [m[1] ?? "", decode(m[2] ?? "")]),
  );
}

/** A `class` attribute, as its list of classes. */
export function classesOf(attributes: Record<string, string>): string[] {
  return (attributes.class ?? "").split(/\s+/);
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

/** The markup inside the page's caption, or undefined when it has none. */
function captionMarkupOf(html: string): string | undefined {
  return html.match(/<figcaption[^>]*>(.*?)<\/figcaption>/s)?.[1];
}

/** Each paragraph of the page's caption, as it reads; empty when it has no caption. */
export function captionLinesOf(html: string): string[] {
  const caption = captionMarkupOf(html) ?? "";
  return [...caption.matchAll(/<p(?:\s[^>]*)?>(.*?)<\/p>/gs)].map((m) => textOf(m[1] ?? ""));
}

/** The text of the page's caption, its lines joined by a space, or undefined when it has none. */
export function captionOf(html: string): string | undefined {
  return captionMarkupOf(html) === undefined ? undefined : captionLinesOf(html).join(" ");
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
 * The content of the first `<tag>` whose start tag holds `attribute`, up to the first `</tag>`
 * after it. Every element read this way holds none of its own tag, and one that does throws.
 */
export function elementOf(html: string, tag: string, attribute: string): string {
  const pattern = new RegExp(`<${tag}(?=[^>]*\\s${attribute})[^>]*>(.*?)</${tag}>`, "s");
  const inner = html.match(pattern)?.[1];
  if (inner === undefined) throw new Error(`No <${tag} ${attribute}>`);
  return withoutNested(tag, inner);
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
