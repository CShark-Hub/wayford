/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/**
 * The in-page half of `collect`: the elements a sighted person can see on the page, with their
 * role, name, landmark path, box and the computed style of the text they draw. Only what needs the
 * DOM happens here. Colours stay computed-style strings, and `contrast.ts` does the arithmetic in
 * Node, where it is tested without a browser.
 *
 * `measurePage` reaches the page as source, so it is one self-contained function: every helper and
 * constant lives inside it, since a module-level one or an import would not exist there. The
 * imports below are types only.
 *
 * Roles follow Playwright's implicit roles, and names are a subset of accname, so that
 * `getByRole(role, { name, exact: true })` finds what a key names
 * (`docs/specs/2026-09-29-s1-02-metrics-collector.md`, "measure-page.ts" and Decision log rows 1
 * to 4). Light DOM of the top document only, no shadow roots or iframes (row 13).
 */
import type { Bbox, ElementKind, Landmark, ScrollOffset, Viewport } from "@wayford/core";
import type { BackgroundLayer } from "./contrast.js";

/** One element as the page reports it: role and name resolved, colours still strings. */
export interface RawElement {
  kind: ElementKind;
  role: string;
  name: string;
  path: Landmark[];
  bbox: Bbox;
  /** The boxes of the visible labels that activate it, when it is a form control that has any. */
  labels?: Bbox[];
  /**
   * The text it draws, one entry per element that draws a run of it: colour, CSS px size, and the
   * backgrounds from that element out to the canvas. Under a dark colour scheme the canvas is one
   * more layer, of unknown paint (`darkCanvas`). These are the runs that draw its name, or those it
   * draws itself when its name is drawn nowhere (`nameOf`).
   */
  texts?: { color: string; fontPx: number; layers: BackgroundLayer[] }[];
}

/** The page as it reports itself. `isMobile` is not the page's to know (spec, row 8). */
export interface RawPage {
  title: string;
  viewport: Omit<Viewport, "isMobile">;
  scroll: ScrollOffset;
  elements: RawElement[];
}

/**
 * A function's source, wrapped to run in the page. `tsx` compiles with `keepNames`, which wraps
 * nested functions in `__name(…)`, a helper its module defines and the page does not (row 17).
 */
export function pageSource(source: string): string {
  return `(() => { const __name = (f) => f; return (${source})(); })()`;
}

export function measurePage(): RawPage {
  // The controls accname names from their content, and those it names from a label or a value.
  const CONTENT_NAMED = [
    "link",
    "button",
    "checkbox",
    "radio",
    "switch",
    "tab",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
  ];
  const FIELDS = ["textbox", "searchbox", "combobox", "listbox", "slider", "spinbutton"];
  const CONTROLS = new Set([...CONTENT_NAMED, ...FIELDS]);
  const TEXT_BLOCKS = new Set(["heading", "paragraph", "listitem"]);
  // Text blocks read their names from their content too.
  const NAMED_BY_CONTENT = new Set([...CONTENT_NAMED, ...TEXT_BLOCKS]);
  const LANDMARKS = new Set([
    "banner",
    "complementary",
    "contentinfo",
    "form",
    "main",
    "navigation",
    "region",
    "search",
  ]);
  const TAG_ROLES: Record<string, string> = {
    ASIDE: "complementary",
    BUTTON: "button",
    H1: "heading",
    H2: "heading",
    H3: "heading",
    H4: "heading",
    H5: "heading",
    H6: "heading",
    LI: "listitem",
    MAIN: "main",
    NAV: "navigation",
    P: "paragraph",
    SEARCH: "search",
    TEXTAREA: "textbox",
  };
  // Any other type is a textbox. A hidden input is `display: none !important`, never measured.
  const INPUT_ROLES: Record<string, string> = {
    button: "button",
    checkbox: "checkbox",
    image: "button",
    number: "spinbutton",
    radio: "radio",
    range: "slider",
    reset: "button",
    search: "searchbox",
    submit: "button",
  };
  // What an input button draws when its value is empty.
  const INPUT_BUTTON_DEFAULTS = new Map([
    ["button", ""],
    ["reset", "Reset"],
    ["submit", "Submit"],
  ]);
  // Sectioning content, in which a header is no banner and a footer no contentinfo. Playwright's
  // own selector.
  const SECTIONING =
    "article:not([role]), aside:not([role]), main:not([role]), nav:not([role]), " +
    "section:not([role]), [role=article], [role=complementary], [role=main], " +
    "[role=navigation], [role=region]";

  const collapse = (text: string | null) => (text ?? "").replace(/\s+/g, " ").trim();

  // Under a dark colour scheme Chromium paints the canvas dark grey, the `Canvas` system colour.
  // Resolving that colour means adding an element to the page being measured, so it is not read:
  // text with no opaque layer behind it stands on an unknown background, as over an image (row 26).
  const darkCanvas = (() => {
    const declared = getComputedStyle(document.documentElement).colorScheme;
    const meta = document.querySelector('meta[name="color-scheme"]')?.getAttribute("content");
    const scheme = declared === "normal" ? (meta ?? "normal") : declared;
    const dark = /\bdark\b/.test(scheme);
    return (
      dark && (!/\blight\b/.test(scheme) || matchMedia("(prefers-color-scheme: dark)").matches)
    );
  })();

  const hiddenForAria = (el: Element) =>
    el.closest('[aria-hidden="true" i]') !== null ||
    !el.checkVisibility({ visibilityProperty: true });

  // Seen by a sighted person: not hidden, not transparent, and larger than the 1 × 1 px `sr-only`
  // box. `aria-hidden` hides nothing from sight.
  function seen(el: Element): boolean {
    if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
    const box = el.getBoundingClientRect();
    return box.width > 1 && box.height > 1;
  }

  // Seen, and in the accessibility tree, so that `getByRole` finds it.
  const measurable = (el: Element) => !hiddenForAria(el) && seen(el);

  // An explicit role wins, by its first token, so an unknown token leaves the element unmeasured.
  function roleOf(el: Element): string | undefined {
    const explicit = el.getAttribute("role")?.trim().split(/\s+/)[0];
    if (explicit) return explicit;
    // `area[href]` is a link too, but an area has no box, so it is never measured.
    if (el instanceof HTMLAnchorElement) return el.hasAttribute("href") ? "link" : undefined;
    if (el instanceof HTMLInputElement) return INPUT_ROLES[el.type] ?? "textbox";
    if (el instanceof HTMLSelectElement) return el.multiple || el.size > 1 ? "listbox" : "combobox";
    switch (el.tagName) {
      case "HEADER":
        return el.parentElement?.closest(SECTIONING) ? undefined : "banner";
      case "FOOTER":
        return el.parentElement?.closest(SECTIONING) ? undefined : "contentinfo";
      case "SECTION":
        return labelOf(el) ? "region" : undefined;
      case "FORM":
        return labelOf(el) ? "form" : undefined;
      default:
        return TAG_ROLES[el.tagName];
    }
  }

  const labelable = (
    el: Element,
  ): el is HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement =>
    el instanceof HTMLInputElement ||
    el instanceof HTMLButtonElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement;

  // The text an input button draws, which is also its name. `undefined` for anything else.
  function inputButtonText(el: Element): string | undefined {
    if (!(el instanceof HTMLInputElement)) return undefined;
    const fallback = INPUT_BUTTON_DEFAULTS.get(el.type);
    return fallback === undefined ? undefined : el.value.trim() || fallback;
  }

  // The text of `el`'s child nodes, as accname reads content. A child hidden for aria gives
  // nothing, though sr-only text counts; a child's aria-label or an img's alt stands for it; a
  // block child or a `<br>` is set off by spaces. `skip` is the control a label names. A source
  // hidden itself, such as an `aria-hidden` referent or label, is read `whole`, hidden children
  // included, as accname and Playwright read it.
  function contentOf(el: Element, skip?: Element, whole = hiddenForAria(el)): string {
    let text = "";
    for (const node of el.childNodes) {
      if (node instanceof Text) text += node.data;
      if (!(node instanceof Element)) continue;
      const label = node.getAttribute("aria-label") ?? "";
      let part: string;
      if (node === skip || (!whole && hiddenForAria(node))) part = "";
      else if (label.trim() !== "") part = label;
      else if (node instanceof HTMLImageElement) part = node.alt;
      else if (node instanceof SVGSVGElement)
        part = node.querySelector(":scope > title")?.textContent ?? "";
      else part = contentOf(node, skip, whole);
      const block = node.tagName === "BR" || getComputedStyle(node).display !== "inline";
      text += block ? ` ${part} ` : part;
    }
    return text;
  }

  function referents(el: Element): HTMLElement[] {
    return (el.getAttribute("aria-labelledby") ?? "")
      .split(/\s+/)
      .map((id) => document.getElementById(id))
      .filter((ref) => ref !== null);
  }

  // `aria-labelledby`, then `aria-label`: the name a landmark can have.
  function labelOf(el: Element): string {
    const refs = referents(el);
    return (
      collapse(refs.map((ref) => contentOf(ref)).join(" ")) ||
      collapse(el.getAttribute("aria-label"))
    );
  }

  // Outermost first, each named from its label when it has one.
  function pathOf(el: Element): Landmark[] {
    const path: Landmark[] = [];
    for (let node = el.parentElement; node !== null; node = node.parentElement) {
      const role = roleOf(node);
      if (role === undefined || !LANDMARKS.has(role)) continue;
      const name = labelOf(node);
      path.unshift(name === "" ? { role } : { role, name });
    }
    return path;
  }

  // Text at `font-size: 0` is drawn nowhere, as in an icon whose label is kept for the name only.
  const drawsText = (el: Element) => Number.parseFloat(getComputedStyle(el).fontSize) > 0;

  // The parents of the non-blank text nodes under `root` that a sighted person can see, outside
  // `skip`, each once, in document order. That passes over an sr-only span's text and a 0 px label's.
  // Text hidden for aria is out of the name, and out of these, unless `root` is itself hidden and
  // so named whole, as `contentOf` reads it: an `aria-hidden` referent is still drawn (row 32).
  function textParents(root: Element, skip?: Element): Element[] {
    const whole = hiddenForAria(root);
    const parents: Element[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (parent === null || parents.includes(parent) || !/\S/.test(node.textContent ?? ""))
        continue;
      const named = whole || !hiddenForAria(parent);
      if (!skip?.contains(parent) && named && seen(parent) && drawsText(parent))
        parents.push(parent);
    }
    return parents;
  }

  // The elements that draw the text `el` shows itself, every run of it. An input button draws its
  // own text, and a form control with none draws its labels', outside itself.
  function textDrawers(el: Element): Element[] {
    const drawn = inputButtonText(el);
    if (drawn !== undefined) return drawn !== "" && drawsText(el) ? [el] : [];
    const own = textParents(el);
    if (own.length > 0 || !labelable(el)) return own;
    return [...(el.labels ?? [])].flatMap((label) => textParents(label, el));
  }

  // `pseudo` is `::placeholder` for a field's placeholder, drawn over the field's own backgrounds.
  function textOf(drawer: Element, pseudo?: string) {
    const layers: BackgroundLayer[] = [];
    for (let node: Element | null = drawer; node !== null; node = node.parentElement) {
      const style = getComputedStyle(node);
      layers.push({ color: style.backgroundColor, image: style.backgroundImage !== "none" });
    }
    if (darkCanvas) layers.push({ color: "rgba(0, 0, 0, 0)", image: true });
    const style = getComputedStyle(drawer, pseudo);
    // Chromium paints text in `-webkit-text-fill-color`, which is `color` unless a page sets it.
    const color = style.getPropertyValue("-webkit-text-fill-color");
    return { color, fontPx: Number.parseFloat(style.fontSize), layers };
  }

  type Run = ReturnType<typeof textOf>;
  const runsOf = (drawers: Element[]): Run[] => drawers.map((drawer) => textOf(drawer));

  // The name, from the first of accname's sources that gives one, and the runs of text that draw
  // it. Its text must not reach the Actor when perception cuts a run of it, so every run counts
  // (rows 30 to 32). A name read from text drawn elsewhere, in an `aria-labelledby` referent, a
  // label or a shown placeholder, is measured there. A name drawn nowhere, such as an `aria-label`,
  // an alt, a title or a hidden referent, leaves the element measured by the text it draws itself.
  function nameOf(el: Element, role: string): { name: string; texts: Run[] } {
    const refs = referents(el);
    const labels = labelable(el) && inputButtonText(el) === undefined ? [...(el.labels ?? [])] : [];
    const field = role === "textbox" || role === "searchbox";
    const sources: [name: () => string | null | undefined, drawn?: () => Run[]][] = [
      [
        () => refs.map((ref) => contentOf(ref)).join(" "),
        () => runsOf(refs.flatMap((ref) => textParents(ref))),
      ],
      [() => el.getAttribute("aria-label")],
      [() => inputButtonText(el)],
      [
        () => labels.map((label) => contentOf(label, el)).join(" "),
        () => runsOf(labels.flatMap((label) => textParents(label, el))),
      ],
      [() => (el instanceof HTMLInputElement && el.type === "image" ? el.alt : "")],
      [() => (NAMED_BY_CONTENT.has(role) ? contentOf(el) : "")],
      [() => el.getAttribute("title")],
      [
        () => (field ? el.getAttribute("placeholder") : ""),
        // A placeholder at 0 px is drawn nowhere, as text at `font-size: 0` is (row 27).
        () =>
          el.matches(":placeholder-shown")
            ? [textOf(el, "::placeholder")].filter((run) => run.fontPx > 0)
            : [],
      ],
    ];
    for (const [source, drawn] of sources) {
      const name = collapse(source() ?? "");
      if (name === "") continue;
      const texts = drawn?.() ?? [];
      return { name, texts: texts.length > 0 ? texts : runsOf(textDrawers(el)) };
    }
    return { name: "", texts: runsOf(textDrawers(el)) };
  }

  const elements: RawElement[] = [];
  for (const el of document.body.querySelectorAll("*")) {
    const role = roleOf(el) ?? "";
    const kind = CONTROLS.has(role) ? "control" : TEXT_BLOCKS.has(role) ? "text" : undefined;
    if (kind === undefined || !measurable(el)) continue;
    const { name, texts } = nameOf(el, role);
    if (kind === "text" && name === "") continue;
    const { x, y, width, height } = el.getBoundingClientRect();
    // A click on a label activates its control, so a visible label is part of the target (#117).
    const labels = labelable(el)
      ? [...(el.labels ?? [])].filter(seen).map((label) => {
          const box = label.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        })
      : [];
    elements.push({
      kind,
      role,
      name,
      path: pathOf(el),
      bbox: { x, y, width, height },
      ...(labels.length === 0 ? {} : { labels }),
      ...(texts.length === 0 ? {} : { texts }),
    });
  }
  return {
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      deviceScaleFactor: window.devicePixelRatio,
    },
    scroll: { x: window.scrollX, y: window.scrollY },
    elements,
  };
}
