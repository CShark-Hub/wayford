/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/**
 * The in-page half of `collect`: the elements a sighted person can see on the page, with their
 * role, name, landmark path, box and the computed style of the text they draw, and for a control
 * what its markup says it opens. Only what needs the DOM happens here. Colours stay computed-style
 * strings, and `contrast.ts` does the arithmetic in Node, where it is tested without a browser.
 *
 * `measurePage` reaches the page as source, so it is one self-contained function: every helper and
 * constant lives inside it, since a module-level one or an import would not exist there. The
 * imports below are types only.
 *
 * Roles follow Playwright's implicit roles, and names are a subset of accname, so that
 * `getByRole(role, { name, exact: true })` finds what a key names
 * (`docs/specs/2026-09-29-s1-02-metrics-collector.md`, "measure-page.ts" and Decision log rows 1
 * to 4). One exception: a text block is named by its own text, outside the controls and text
 * blocks nested in it (row 34), so a heading that holds a link is not named as Playwright names
 * it. Text drawn by an element with no role of either kind, outside every control and text block,
 * is measured as a box of text, a text block with the role `text` that `getByRole` cannot find
 * (#219). Light DOM of the top document only, no shadow roots or iframes (row 13).
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
   * draws itself when its name is drawn nowhere (`nameOf`). A text block's are those of its own
   * text only (#124). On a control named by its own content, each run also carries `text`, what
   * its element draws itself, so `collect` can measure the control part by part (#124).
   */
  texts?: { color: string; fontPx: number; layers: BackgroundLayer[]; text?: string }[];
  /** Its `aria-haspopup` as written, on a control that has one. `collect` reads it as ARIA does. */
  hasPopup?: string;
  /** The role of the first element its `aria-controls` names that exists, on a control. */
  controls?: string;
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

  // What an element is measured as, by its role: a control, a text block, or neither.
  const kindOf = (role: string): ElementKind | undefined =>
    CONTROLS.has(role) ? "control" : TEXT_BLOCKS.has(role) ? "text" : undefined;

  // A control or text block by its role, that a sighted person can see, in the accessibility tree.
  const measuredByRole = (el: Element) => kindOf(roleOf(el) ?? "") !== undefined && measurable(el);

  // A control, text block or box of text (`textBox`, #219) a sighted person can see, so inside a
  // text block or a box its text is not theirs (#124). The text of an `a` with no `href` drawn in
  // the block's line, or of a link nobody sees, stays the block's. Outside every control and text
  // block, a measured control's label or `aria-labelledby` referent is nested too, so its text
  // stays the control's and no box reads it (#117), and so is fallback content, which is drawn
  // nowhere. Inside a text block both stay the block's, as before.
  const nested = (el: Element) =>
    measuredByRole(el) ||
    textBox(el) ||
    ((namesControl(el) || FALLBACK.has(el.tagName)) && !insideMeasured(el));

  // Each answer kept per element: `textBox` is asked again for every box its ancestors read.
  function memo<T>(answer: (el: Element) => T): (el: Element) => T {
    const answers = new Map<Element, T>();
    return (el) => {
      if (!answers.has(el)) answers.set(el, answer(el));
      return answers.get(el) as T;
    };
  }

  // Whether `el` sits inside a control or text block, whose text its own text then is: a control's
  // name, or a text block's own text.
  const insideMeasured: (el: Element) => boolean = memo((el) => {
    const parent = el.parentElement;
    return parent !== null && (measuredByRole(parent) || insideMeasured(parent));
  });

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
  // included, as accname and Playwright read it. `own` reads a text block's own text: a `nested`
  // control or text block gives a space, never its text or a marker (#124).
  function contentOf(el: Element, skip?: Element, own = false, whole = hiddenForAria(el)): string {
    let text = "";
    for (const node of el.childNodes) {
      if (node instanceof Text) text += node.data;
      if (!(node instanceof Element)) continue;
      const label = node.getAttribute("aria-label") ?? "";
      let part: string;
      if (node === skip || (!whole && hiddenForAria(node))) part = "";
      else if (own && nested(node)) part = " ";
      else if (label.trim() !== "") part = label;
      else if (node instanceof HTMLImageElement) part = node.alt;
      else if (node instanceof SVGSVGElement)
        part = node.querySelector(":scope > title")?.textContent ?? "";
      else part = contentOf(node, skip, own, whole);
      const block = node.tagName === "BR" || getComputedStyle(node).display !== "inline";
      text += block ? ` ${part} ` : part;
    }
    return text;
  }

  function referents(el: Element, attribute = "aria-labelledby"): HTMLElement[] {
    return (el.getAttribute(attribute) ?? "")
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

  // The role of the first element `aria-controls` names that exists, hidden or not: the nav a menu
  // toggle opens is `display: none` until it is opened.
  function controlledRole(el: Element): string | undefined {
    const target = referents(el, "aria-controls")[0];
    return target === undefined ? undefined : roleOf(target);
  }

  // Outermost first, each named from its label when it has one. A box of text that is a landmark
  // itself, as a `<footer>` holding its text directly is, ends its path with itself (`self`), so it
  // reads `contentinfo//text:…` as a paragraph in that footer reads `contentinfo//paragraph:…`.
  function pathOf(el: Element, self = false): Landmark[] {
    const path: Landmark[] = [];
    for (let node = self ? el : el.parentElement; node !== null; node = node.parentElement) {
      const role = roleOf(node);
      if (role === undefined || !LANDMARKS.has(role)) continue;
      const name = labelOf(node);
      path.unshift(name === "" ? { role } : { role, name });
    }
    return path;
  }

  // Text at `font-size: 0` is drawn nowhere, as in an icon whose label is kept for the name only.
  const drawsText = (el: Element) => Number.parseFloat(getComputedStyle(el).fontSize) > 0;

  // A character that draws something. Whitespace, a format character (a zero-width space, a soft
  // hyphen), a default-ignorable one (a Hangul filler) and the blank braille pattern draw nothing.
  const DRAWN = /[^\s\p{Cf}\p{Default_Ignorable_Code_Point}⠀]/u;

  // Elements whose content is fallback, drawn only where the element itself is not supported. A
  // `progress` or `meter` draws its bar, never its content (#219).
  const FALLBACK = new Set([
    "AUDIO",
    "CANVAS",
    "IFRAME",
    "METER",
    "NOSCRIPT",
    "OBJECT",
    "PROGRESS",
    "TEMPLATE",
    "VIDEO",
  ]);
  const IN_FALLBACK = [...FALLBACK].map((tag) => tag.toLowerCase()).join(", ");

  // The role the observation gives a box of text (#219). Not an ARIA role: `getByRole` finds none.
  const TEXT_ROLE = "text";

  // A box of text says something only when it holds a letter or a digit: a lone "|" or "·" between
  // links does not.
  const WORDS = /[\p{L}\p{N}]/u;

  // The elements a measured control names itself by through `aria-labelledby`. Their text is
  // measured on the control, as a label's is (#117).
  const controlNamers = [...document.querySelectorAll("[aria-labelledby]")]
    .filter((el) => kindOf(roleOf(el) ?? "") === "control" && measurable(el))
    .flatMap((el) => referents(el));

  // A label that names a measured control, or an `aria-labelledby` referent of one: its text is the
  // control's (#117), so neither it nor anything in it is a box of text. The label of a control
  // nobody sees, such as a custom checkbox's hidden input, names nothing measured, so its text is
  // read where it is drawn, as any other text.
  const namesControl = (el: Element) =>
    (el instanceof HTMLLabelElement && el.control !== null && measurable(el.control)) ||
    controlNamers.some((namer) => namer === el);
  const inControlName: (el: Element) => boolean = memo(
    (el) => namesControl(el) || (el.parentElement !== null && inControlName(el.parentElement)),
  );

  // A box of text (#219): an element with no role it is measured by, drawn as a box of its own,
  // not as a run in its parent's line (`display` is neither `inline` nor `contents`), that a
  // sighted person can see, in the accessibility tree. Outside every control and text block, whose
  // text it would otherwise take, every measured control's label and `aria-labelledby` referent,
  // whose text is the control's, and fallback content. Its own text is what it draws outside the
  // boxes, text blocks, controls, control names and fallback content inside it, as a text block's
  // is, so a run of text a box reads is read by nothing else.
  const textBox: (el: Element) => boolean = memo((el) => {
    if (!(el instanceof HTMLElement) || kindOf(roleOf(el) ?? "") !== undefined) return false;
    const display = getComputedStyle(el).display;
    if (display === "inline" || display === "contents") return false;
    if (el.closest(IN_FALLBACK) !== null || inControlName(el)) return false;
    return measurable(el) && !insideMeasured(el);
  });

  // The parents of the non-blank text nodes under `root` that a sighted person can see, outside
  // `skip`, each once, in document order. That passes over an sr-only span's text and a 0 px label's.
  // Text of nothing but characters that draw nothing (`DRAWN`) is blank, and a video's or canvas's
  // fallback content is passed over whole (`FALLBACK`).
  // Text hidden for aria is out of the name, and out of these, unless `root` is itself hidden and
  // so named whole, as `contentOf` reads it: an `aria-hidden` referent is still drawn (row 32).
  // `skip`, and with `own` every `nested` control and text block, is passed over whole.
  function textParents(root: Element, skip?: Element, own = false): Element[] {
    const whole = hiddenForAria(root);
    const parents: Element[] = [];
    // A walker never filters its root, and FILTER_REJECT passes over a whole subtree.
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      (node) =>
        node instanceof Text
          ? NodeFilter.FILTER_ACCEPT
          : node === skip ||
              (node instanceof Element && (FALLBACK.has(node.tagName) || (own && nested(node))))
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_SKIP,
    );
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (parent === null || parents.includes(parent) || !DRAWN.test(node.textContent ?? ""))
        continue;
      const named = whole || !hiddenForAria(parent);
      if (named && seen(parent) && drawsText(parent)) parents.push(parent);
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

  type Run = ReturnType<typeof textOf> & { text?: string };
  const runsOf = (drawers: Element[]): Run[] => drawers.map((drawer) => textOf(drawer));

  // Whether each of `drawers` draws its text under `root` in one stretch, with no other drawer's
  // text between two of its own: then its `drawnText` is one run of the name, in place (#124).
  function oneStretchEach(root: Element, drawers: Element[]): boolean {
    const done = new Set<Element>();
    let current: Element | undefined;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (parent === null || !drawers.includes(parent) || !DRAWN.test(node.textContent ?? "")) {
        continue;
      }
      if (parent === current) continue;
      if (done.has(parent)) return false;
      if (current !== undefined) done.add(current);
      current = parent;
    }
    return true;
  }

  // The text `drawer` draws itself: its own text nodes, an element inside it leaving a space, then
  // collapsed. A comment leaves nothing, so text a framework split around one stays whole (#124).
  const drawnText = (drawer: Element) =>
    collapse(
      [...drawer.childNodes]
        .map((node) => (node instanceof Text ? node.data : node instanceof Element ? " " : ""))
        .join(""),
    );

  // The name, from the first of accname's sources that gives one, and the runs of text that draw
  // it. Its text must not reach the Actor when perception cuts a run of it, so every run counts
  // (rows 30 to 32). A name read from text drawn elsewhere, in an `aria-labelledby` referent, a
  // label or a shown placeholder, is measured there. A name drawn nowhere, such as an `aria-label`,
  // an alt, a title or a hidden referent, leaves the element measured by the text it draws itself.
  // A text block reads only its own text, for its name and for its runs, and one that draws none
  // of it gets no name, so it is not measured, whatever names it (row 34). A control named by its
  // own content gets each run's `text` too, so it can be measured part by part (#124), but only
  // when those texts, joined by spaces, spell its name: each element's text in one stretch, in the
  // page's order, set apart from the next. Otherwise a shown name could read words out of order,
  // split a word in two or keep text nobody sees, so the control is measured whole. No other
  // source gives a `text`.
  function nameOf(el: Element, role: string): { name: string; texts: Run[] } {
    const own = TEXT_BLOCKS.has(role);
    const drawers = own ? textParents(el, undefined, true) : undefined;
    if (drawers?.length === 0) return { name: "", texts: [] };
    const refs = referents(el);
    const labels = labelable(el) && inputButtonText(el) === undefined ? [...(el.labels ?? [])] : [];
    const field = role === "textbox" || role === "searchbox";
    const sources: [name: () => string | null | undefined, drawn?: (name: string) => Run[]][] = [
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
      [
        () => (NAMED_BY_CONTENT.has(role) ? contentOf(el, undefined, own) : ""),
        // The runs a control draws itself, each with its element's own text when those texts
        // spell the name. None for a text block, whose runs are its own text's (`drawers`), and
        // none for a control that draws no text, which then reads its labels' (`textDrawers`).
        (name) => {
          if (own) return [];
          const parents = textParents(el);
          const runs = parents.map((drawer) => textOf(drawer));
          const texts = parents.map(drawnText);
          if (collapse(texts.join(" ")) !== name || !oneStretchEach(el, parents)) return runs;
          return runs.map((run, i) => ({ ...run, text: texts[i] }));
        },
      ],
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
      const texts = drawn?.(name) ?? [];
      return { name, texts: texts.length > 0 ? texts : runsOf(drawers ?? textDrawers(el)) };
    }
    return { name: "", texts: runsOf(drawers ?? textDrawers(el)) };
  }

  // A box of text as a text block (#219): named by its own text and measured by the runs that
  // draw it. One whose own text holds no word, or draws none of it, is not measured.
  function boxOfText(el: Element): RawElement | undefined {
    if (!textBox(el)) return undefined;
    const name = collapse(contentOf(el, undefined, true));
    if (!WORDS.test(name)) return undefined;
    const texts = runsOf(textParents(el, undefined, true));
    if (texts.length === 0) return undefined;
    const { x, y, width, height } = el.getBoundingClientRect();
    return {
      kind: "text",
      role: TEXT_ROLE,
      name,
      path: pathOf(el, true),
      bbox: { x, y, width, height },
      texts,
    };
  }

  const elements: RawElement[] = [];
  // A document with no `<body>`, such as an SVG file, has nothing to measure.
  for (const el of document.querySelectorAll("body *")) {
    const role = roleOf(el) ?? "";
    const kind = kindOf(role);
    if (kind === undefined) {
      const box = boxOfText(el);
      if (box !== undefined) elements.push(box);
      continue;
    }
    if (!measurable(el)) continue;
    const { name, texts } = nameOf(el, role);
    // A text block with no name, as one that draws none of its own text has (row 34), is skipped.
    if (kind === "text" && name === "") continue;
    const { x, y, width, height } = el.getBoundingClientRect();
    // A click on a label activates its control, so a visible label is part of the target (#117).
    const labels = labelable(el)
      ? [...(el.labels ?? [])].filter(seen).map((label) => {
          const box = label.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        })
      : [];
    // Read for stage 4's pattern detection, on controls only, and left raw: `collect` cleans them.
    const hasPopup =
      kind === "control" ? (el.getAttribute("aria-haspopup") ?? undefined) : undefined;
    const controls = kind === "control" ? controlledRole(el) : undefined;
    elements.push({
      kind,
      role,
      name,
      path: pathOf(el),
      bbox: { x, y, width, height },
      ...(labels.length === 0 ? {} : { labels }),
      ...(texts.length === 0 ? {} : { texts }),
      ...(hasPopup === undefined ? {} : { hasPopup }),
      ...(controls === undefined ? {} : { controls }),
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
