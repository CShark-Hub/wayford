# s1-02 — DOM metrics collector and the seed test on the target app: spec

Task: `tasks/s1-02-metrics-collector.md` · Branch: `feature/s1-02-metrics-collector` · Date: 2026-09-29
Status: approved 2026-09-29

## Goal

`collect(page)` in `@wayford/filter` turns a Playwright page into its `PageMeasurement`. Collect-then-perceive twice on `/deliveries` of the running target app, with the same profile and run seed, gives identical Actor text: the week 2 exit criterion for stream 1.

## Constraints that bind

- "Zero LLM in this layer" and "measurement only: no thresholds, no profile, no decisions" (`AGENTS.md`, task). `collect` returns `PageMeasurement` and nothing else. No `Math.random`, and no clock in any value (`docs/CONVENTIONS.md`, "Determinism rules").
- Contrast: "the WCAG 2.2 relative-luminance ratio, in our own code", tested on 21:1, 4.54:1 and 4.48:1. "The background is the effective one: walk the ancestors, compositing alpha, until an opaque colour. A text colour with alpha is composited too." (task).
- "Font size is the computed CSS pixel size. Target size is the smaller side of a control's bounding box." (task). #122 later changed it to "the smaller side of the area a click activates", with a label that activates the control counted in (row 29).
- "Every control, and every text block (heading, paragraph, list item, label) with visible text", as RULES says. `display: none`, `visibility: hidden` and `aria-hidden="true"` are not measured. (task; `docs/RULES.md`, "What is measured"). #122 later took `label` out of that list: a label's text rides on the control it names (row 2).
- "For every element measured on the target app, `page.getByRole(role, { name, exact: true })` resolves to it. The key is `elementKey` from core, over the element's named landmark ancestors." The reviewer note says not to accept a weaker check.
- `@wayford/filter/perceive` stays browser-safe, so `collect` lives in the main entry only. Playwright is a dev dependency of `filter`, and `collect` takes the page from its caller.
- Tests start the target app themselves and put all three parameters on every URL (`packages/target-app/README.md`). Browser tests end in `.browser.test.ts`. `pnpm test:unit` already exists at the root and skips them.
- `.github/workflows/ci.yml` exists, so it installs Chromium for the browser tests.
- Out of scope: thresholds and decisions, CDP vision emulation and screenshots, axe-core, any change to `packages/target-app`, and a run harness (`s2-02`).
- `PageMeasurement`, `MeasuredElement`, `elementKey` and `AriaRole` exist in core (s1-01). This task changes no core schema.

## Design

### Data flow

```
Playwright Page ──page.evaluate(pageSource(measurePage))──▶ RawPage (plain JSON: roles, names, landmark path,
                                                boxes, computed colour strings, font px)
RawPage ──collect: parse colours, composite, WCAG ratio, elementKey, zod parse──▶ PageMeasurement
PageMeasurement ──perceive(measurement, profile, runSeed) (s1-01, unchanged)──▶ FullObservation
```

The browser does only what needs the DOM: which elements, their role and name, landmarks, boxes and computed styles. Node does the arithmetic, so the contrast code is pure and unit-tested without a browser.

### `packages/filter/src/contrast.ts` (new, pure, main entry)

```ts
export type Rgba = { r: number; g: number; b: number; alpha: number }; // r, g, b in [0, 1]
export type BackgroundLayer = { color: string; image: boolean };      // one element's background
export function parseColour(css: string): Rgba;                 // any CSS colour a computed style gives
export function composite(top: Rgba, bottom: Rgba): Rgba;       // source-over, in sRGB
export function relativeLuminance(colour: Rgba): number;        // WCAG 2.2, opaque colour
export function contrastRatio(a: Rgba, b: Rgba): number;        // (L1 + 0.05) / (L2 + 0.05), order-free
export function effectiveBackground(layers: readonly BackgroundLayer[]): Rgba | undefined;
export function textContrast(text: string, layers: readonly BackgroundLayer[]): number | undefined;
export function truncateRatio(ratio: number): number;         // 3 decimals, never rounded up
```

- `layers` are the backgrounds of the element that draws the text and of each ancestor, outwards, up to the root. `effectiveBackground` cuts the chain at the first opaque `background-color`, inclusive, and composites what is left from the outside in. If none is opaque it composites over white, the canvas colour Chromium paints by default.
- A layer with a `background-image` (a picture or a gradient), up to and including the first opaque one, makes the background unknown: `effectiveBackground` returns `undefined` and the element gets no `contrast`. A number measured against a colour the text is not drawn on would be a claim we cannot defend (Decision log, row 6).
- `textContrast` composites the text colour over that background, takes the ratio and truncates it with `truncateRatio`.
- Linearisation uses the WCAG 2.2 constant `0.04045`.
- `parseColour` uses `culori` (`docs/STACK.md`, "Colour parsing"), because Chromium serialises computed colours in the space they were authored in. A site built on Tailwind 4 returns `oklch(…)`, not `rgb(…)`. Out-of-gamut values are clamped to sRGB. A string it cannot parse throws `WayfordError` with code `unparsable_colour`.

### `packages/filter/src/measure-page.ts` (new, runs in the page, main entry)

`measurePage(): RawPage` is one self-contained function, sent to the page as source. Every helper is nested inside it: only the function's source reaches the page, so a module-level helper or an import would be undefined there.

`tsx` compiles with `keepNames` (`tsx@4.23.13`), which wraps nested functions in `__name(...)`, a helper that does not exist in the page. So `collect` never passes the function itself. It evaluates `pageSource(measurePage.toString())`, which wraps the source as `(() => { const __name = (f) => f; return (<source>)(); })()`. Vitest does not add `__name`, so a rules test evaluates a source that calls `__name(` through the same wrapper, and the fixture script, which runs under `tsx`, exercises the real case.

- **Walk.** Document order, pre-order, over the light DOM of the top document (no shadow roots, no iframes: Decision log). An element is skipped when:
  - `checkVisibility({ visibilityProperty: true, opacityProperty: true })` is false, which covers `display: none`, `visibility: hidden` and `opacity: 0` on it or an ancestor; or
  - it has an `aria-hidden="true"` ancestor-or-self; or
  - its box is 1 px or less on either side, which is the "visually hidden" pattern (`sr-only`: 1 × 1 px, clipped). Its text is for screen readers, and no sighted person sees it.

  Its descendants are still visited, since CSS lets a child override `visibility: hidden`.
- **Role.** An explicit `role` attribute is used when its first token is a role we know. `presentation` and `none` remove the implicit role. Otherwise the implicit role:
  - `a[href]` → `link` (an `area` has no box, so it is never measured: row 23)
  - `button` and `input[type=button|submit|reset|image]` → `button`
  - `input[type=checkbox]` → `checkbox`, `input[type=radio]` → `radio`
  - text-like `input` and `textarea` → `textbox`, `input[type=search]` → `searchbox`
  - `select` → `combobox`, or `listbox` with `multiple` or `size > 1`
  - `input[type=range]` → `slider`, `input[type=number]` → `spinbutton`
  - `h1`–`h6` → `heading`, `p` → `paragraph`, `li` → `listitem`

  Controls are `link`, `button`, `checkbox`, `radio`, `switch`, `textbox`, `searchbox`, `combobox`, `listbox`, `option`, `slider`, `spinbutton`, `tab`, `menuitem`, `menuitemcheckbox` and `menuitemradio`. Text blocks are `heading`, `paragraph` and `listitem`. Labels: see Decision log (#117).
- **Landmarks.** Each ancestor with a landmark role, outermost first:
  - `header` → `banner` and `footer` → `contentinfo`, unless inside `article`, `aside`, `main`, `nav` or `section`
  - `main` → `main`, `nav` → `navigation`, `aside` → `complementary`, `search` → `search`
  - `section` → `region` and `form` → `form`, when named
  - or an explicit landmark role

  A landmark's name comes from `aria-labelledby` or `aria-label`, as in `banner/navigation:Main`.
- **Name.** A subset of accname, the part the target app and ordinary pages use, in this order:
  1. `aria-labelledby`, the referenced elements' text joined by a space
  2. `aria-label`
  3. the native source: associated `<label>`s for form controls, `alt` for `input[type=image]`, `value` for input buttons (with the browser defaults "Submit" and "Reset")
  4. content, for roles that take their name from it and for text blocks: the text of visible descendants, a child's `aria-label` or `alt` standing in for its subtree, and a space around block-level children and `<br>`
  5. `title`
  6. `placeholder`, for a textbox or searchbox

  Whitespace is collapsed and trimmed. A text block with an empty name is not measured. The same content function names links, headings, paragraphs and list items, so one rule decides every name.
- **Text style.** An element is measured by every run of text that draws its name, and `collect` takes the worst contrast and the smallest font over them (rows 30 to 32). A run is the parent of a visible, non-whitespace text node. The runs come from the source the name was read from: the referents' for `aria-labelledby`, the labels' (outside the control) for `<label>`s, the element's own for content, and the `::placeholder` style for a placeholder while it shows. A name drawn nowhere (`aria-label`, `alt`, `title`, a hidden referent, a placeholder under a typed value or at 0 px) leaves the element measured by the text it draws itself: its own runs, or a form control's labels' when it has none. A source hidden itself (an `aria-hidden` or `display: none` referent or label) is read whole, hidden children included, as Playwright names it, and an `aria-hidden` one is still drawn, so its runs count. In a source that is not hidden, hidden text is out of the name and out of the runs. From each run: the colour Chromium paints it in (`-webkit-text-fill-color`, which is `color` unless set, row 33), `font-size` in CSS px, and the background layers (`background-color`, and whether a `background-image` is set) of it and each ancestor up to `<html>`. An element with no run gets no `contrast` and no `fontPx`.
- **Box.** `getBoundingClientRect()`, unrounded, in viewport coordinates (`measurement.ts`). Page facts: `innerWidth`, `innerHeight`, `devicePixelRatio`, `scrollX`, `scrollY`, `document.title`.

### `packages/filter/src/collect.ts` (new, main entry)

```ts
export type CollectOptions = { isMobile?: boolean };
export async function collect(page: Page, options: CollectOptions = {}): Promise<PageMeasurement>;
```

It evaluates `pageSource(measurePage.toString())` (above), then per element:

- `contrast` is `textContrast(...)`, already truncated to 3 decimals and never rounded up: `truncateRatio` is `Math.floor(ratio × 1000 + 1e-9) / 1000`. Three decimals is the precision of the s1-01 fixture and of RULES' 2.006. Rounding could lift 2.9996 to 3.000 and pass a `>= 3` cut, and WCAG never rounds a ratio up to meet a threshold (4.499:1 fails 4.5:1). The `1e-9` only absorbs float noise, so a ratio that is exactly 3 by arithmetic does not come out as 2.999.
- `targetPx` is the smaller side of one rectangle around the control's box and its visible labels' boxes, for controls only (row 29).
- `key` is `elementKey({ role, name, path })`.

`viewport.isMobile` comes from `options`, default `false`: a page cannot tell whether its context emulates a phone, and Playwright has no public getter. `url` is `page.url()`. The result goes through `PageMeasurement.parse`. A page whose measurement does not parse throws `WayfordError` with code `invalid_measurement`, the zod error as `cause`.

`index.ts` gets one export line, `collect`. `contrast`, `measure-page` and `serve-target-app` stay internal, like `band` and `mask`: nothing outside the package uses them yet (row 18).

### Serving the target app: `packages/filter/src/serve-target-app.ts` (new, not exported)

`serveTargetApp({ port }): Promise<{ origin: string; close(): Promise<void> }>` builds the target app with Vite's `build` into a temp directory, then serves it with `preview`. The browser tests pass port 0, so they never collide with a running `pnpm dev`. The fixture script passes 5174 with `strictPort`, so the fixture keeps its `http://localhost:5174` URL. Using a build rather than the dev server follows `docs/STACK.md`, "Target app": seeded runs use a build. The target app is loaded from its own `vite.config.ts` by path, with no import of the package.

### Fixture: `packages/filter/scripts/measure-fixture.ts` (new)

`pnpm --filter @wayford/filter fixture:measurement` serves the build on 5174 and opens `/deliveries?contrast=2&fontPx=16&targetPx=36` at 1280 × 720. It checks `document.fonts.check('16px "Inter"')`, collects, and writes `packages/core/src/fixtures/measurement.json` in the existing layout: one element per block, `bbox` and `metrics` inline.

### Tests

- `contrast.test.ts`, unit:
  - the published values;
  - order-free ratio;
  - composite and alpha layers, text alpha, no opaque layer;
  - a `background-image` layer gives no contrast;
  - `truncateRatio`: 2.9996 → 2.999, never 3.000; 3 exactly stays 3; 21 stays 21;
  - `rgb`, `rgba`, the space syntax with `/ alpha`, `oklch` and `color(srgb …)`;
  - an unparsable colour throws.
- `collect.browser.test.ts`: it serves the target app and launches Chromium once. Every page gets a fresh 1280 × 720 context and a URL with all three parameters, and the test asserts the font check before collecting. If Chromium is missing it fails with the install command.
- `collect-rules.browser.test.ts`: small synthetic pages served through `page.route` on an `http://` origin, since `PageMeasurement.url` must be `http(s)`. They cover:
  - `display: none`, `visibility: hidden`, a visible child of a hidden parent;
  - `opacity: 0` and a 1 × 1 px clipped `sr-only` element, both not measured;
  - `aria-hidden`;
  - an alpha background stack and an alpha text colour;
  - a `background-image` behind text: no `contrast`, `fontPx` kept;
  - an `oklch` colour;
  - label text on a checkbox;
  - the landmark path;
  - an empty text block skipped;
  - a source that calls `__name(`, evaluated through `pageSource`;
  - a Menu button measured at 390 px width while the collapsed nav is not.

## Files

| File | Why |
|---|---|
| `packages/filter/src/contrast.ts`, `contrast.test.ts` | WCAG ratio and compositing, pure |
| `packages/filter/src/measure-page.ts` | the in-page walk and `pageSource` |
| `packages/filter/src/collect.ts` | `collect` |
| `packages/filter/src/serve-target-app.ts` | build and preview the target app for tests and the fixture script |
| `packages/filter/src/collect.browser.test.ts`, `collect-rules.browser.test.ts` | the browser boxes and the measuring rules |
| `packages/filter/src/index.ts` | one export line, `collect` |
| `packages/filter/package.json` | dev deps `playwright`, `vite`; dep `culori`, dev dep `@types/culori`; script `fixture:measurement` |
| `pnpm-lock.yaml` | the new dependencies |
| `packages/core/src/fixtures/measurement.json` | regenerated from `collect` |
| `.github/workflows/ci.yml` | a step before Test, with the guard the other steps use (`if: ${{ !cancelled() && steps.install.outcome == 'success' }}`): `pnpm --filter @wayford/filter exec playwright install --with-deps --only-shell chromium`. The headless shell is what `chromium.launch()` runs headless. |
| **Outside the list:** `packages/filter/scripts/measure-fixture.ts` | the task asks for the fixture to be "regenerated from its output". A script makes that repeatable, and `scripts/` is where the filter's bench already lives. |
| **Outside the list:** `packages/filter/tsconfig.json` | adds the `DOM` lib for `measure-page.ts`, which runs in the page. `tsconfig.perceive.json` stays without it, so `./perceive` is still checked browser-free. |
| **Outside the list:** `packages/core/src/measurement.test.ts` | it pins the hand-measured boxes of "Order archive" and the h1. The regenerated fixture moves `x` by 7.5 px (Decision log), so the pins follow the fixture. The keys, kinds, names and metrics it pins stay the same. |
| **Outside the list:** `packages/core/src/fixtures/index.ts` | its doc comment says the fixture was measured by hand and hands the open choices to `s1-02`. It now says how the fixture is generated and what was decided. |
| **Outside the list:** `docs/STACK.md` | the `culori` row gains "types from `@types/culori`", since every dependency needs its line (`docs/CONVENTIONS.md`, Definition of Done). One clause, no decision changed. (build, PR recheck) One more sentence: the DOM lib reference in `measure-page.ts` reaches every program that imports `collect`, so their typecheck stops catching browser globals in Node code. |
| `tasks/s1-02-metrics-collector.md` | ticked boxes with evidence, Outcome |

## Acceptance mapping

| Acceptance box | Proven by |
|---|---|
| filter test passes and includes `contrast.test.ts` and `collect.browser.test.ts` | `pnpm --filter @wayford/filter test` output lists both |
| `collect` on `/deliveries` at defaults matches the regenerated fixture in keys, roles, names, kinds, contrast and font size | "collect on /deliveries matches measurementFixture": maps both to `[key, kind, role, name, contrast, fontPx]` and compares, count included, boxes excluded |
| "Order archive" within 0.01 of 2.006:1 at `contrast=2` and of 7.005:1 at `contrast=7` | "Order archive measures within 0.01 of 2.006 and of 7.005" |
| on each of the six pages, `getByRole` finds every element `collect` returns | "getByRole finds every measured element on <page>", one test per page. The locator is scoped by the element's landmark chain, and one match must have the measured box, within 0.01 px, read at the same scroll. See Decision log row 1 for text blocks. |
| collect-then-perceive twice on `/deliveries`, Vera, seed 7: string-equal Actor text | "collect then perceive twice gives the same Actor text": two fresh contexts, two page loads, two collects |
| hard contrast cut 3.0: "Order archive" absent at `contrast=2`, present at `contrast=7` | "a hard cut of 3.0 removes Order archive at contrast 2 and keeps it at 7". The profile is built as s1-01's test builds it: Ada's, with `perception.contrast` set to `{ threshold: 3, provenance: "wcag22" }`, no softness. Ada's other cuts leave the link alone. |
| `pnpm test:unit` launches no browser; `pnpm test` runs the browser tests | `PLAYWRIGHT_BROWSERS_PATH=/nonexistent pnpm test:unit` passes; `pnpm test` output lists both browser files |
| `pnpm lint`, `pnpm typecheck`, `pnpm test` pass | the three commands at the root |

## Decision log

| Question | Taken | Why |
|---|---|---|
| 1. `getByRole(role, { name, exact: true })` finds no `paragraph` or `listitem`: Playwright gives them no accessible name from content (checked on `/deliveries`: `getByRole("listitem", { name: "Home", exact: true })` counts 0). **Box 4 cannot be met as written.** Settled at gate 1: the user chose this check. | For roles that take a name (`heading`, `link`, `button`, `checkbox`, …) the check is exactly the box: `getByRole(role, { name, exact: true })`, scoped by the element's landmark chain (`getByRole("banner").getByRole("navigation", { name: "Main", exact: true })…`). For `paragraph` and `listitem`, same scope: among `getByRole(role)`'s matches, one has the measured box and a `innerText()` that, whitespace collapsed and trimmed, equals the measured name exactly. | This checks what the reviewer note protects: role, name and landmark path all agree with the browser's reading of the page. The scope and the box make it stronger than the box as written, and the name check stays exact. The name comes from our own content function, and `innerText` is the browser's own rendering of the same text, with a line break at `<br>` and at block edges. So the two are independent, and they agree on the target app, which has no `text-transform`. Alternatives rejected: Playwright's `hasText` reads `textContent`, which puts no space at a `<br>` (`Sam TaylorEmail`), so it would need a relaxed pattern; measuring only named text blocks breaks RULES (frozen); naming text blocks with their empty accessible name makes their keys collide. |
| 2. Labels (#117, open) | A label is not measured on its own. Its text rides on the form control it names: the checkbox's name is the label text, and its `contrast` and `fontPx` are the label text's. This is #117 option 1 and the s1-01 fixture's choice. Settled at gate 1: the user chose it. | Needs no core change, keeps the fixture's 19 elements, and a label has no role for `AriaRole` or `getByRole`. RULES is not changed here (frozen); #117 stays open for the RULES line. |
| 3. Which text's style a text block or control carries | The parent element of its first visible, non-whitespace text node | The text a person reads first. It reproduces the s1-01 fixture (a nav `li` carries its link's style, the `p` around "Delivery address" the big link's). Minimum-over-all-text was rejected: on the home page's card `li` it would report the muted paragraph instead of the heading a person scans. **Superseded by row 30 for text blocks and row 31 for controls: this choice let text perception had cut reach the Actor through the element around it.** |
| 4. Names | One accname subset for every kind, verified by the `getByRole` box on all six pages | Chromium's CDP accessibility tree was rejected: its node ids map back to the DOM through a round trip per element, and it names paragraphs no better. Playwright's own name code is not public API. |
| 5. Colour parsing | `culori`, in Node, with `@types/culori` | Already the STACK pick. Real sites return `oklch` from computed styles. Parsing in Node keeps the in-page function small and the arithmetic unit-testable. |
| 6. What counts as background | `background-color` of the ancestors, composited. A `background-image` or gradient on any layer up to the first opaque colour leaves `contrast` out, and `fontPx` stays. A partial `opacity`, `text-shadow` and pseudo-elements are ignored. With no opaque layer the base is white. Among several runs, one over an image is left out of the minimum (row 30). | Composited colours are what the task describes. Leaving the number out when an image sits behind the text claims less than a number against white would: without the metric, P1 records nothing. The target app uses none of these, and the rest is a known limit for real sites (Risks). |
| 7. Contrast precision | Truncated to 3 decimals, never rounded up, with a `1e-9` guard against float noise | Three decimals is the precision of the fixture and of RULES' 2.006, and keeps the fixture byte-stable; the hard link's true 2.0056:1 reads 2.005. Rounding up could pass a cut the element fails (2.9996 → 3.000), and WCAG never rounds a ratio up to meet a threshold. |
| 8. `isMobile` | `collect(page, { isMobile })`, default `false` | The page cannot know it. The callers set the context and pass the same value: `s2-03` on every step and `s3-05` for `/measure`. `collect(page)` still matches the task's signature. (build) Kept although no caller passes it yet: Milo's profile is `device: mobile`, so leaving the option out would record his phone runs as `isMobile: false`. |
| 9. Viewport size | `innerWidth` × `innerHeight` | The frame `getBoundingClientRect` is in, the same as `page.viewportSize()` on desktop |
| 10. How tests reach the target app | A Vite build previewed on port 0, from `vite.config.ts` by path, with `vite` as a filter dev dependency | Seeded runs use a build (STACK). Port 0 never collides with `pnpm dev`. A child process was rejected: harder port discovery and cleanup. |
| 11. Determinism box | Two fresh browser contexts and two page loads, not one page collected twice | Stronger: it also proves the page renders the same across loads |
| 12. Fixture machine | Regenerated on macOS (Chromium headless shell 153). Boxes differ from the hand measurement, taken on Windows with a 15 px scrollbar shown, so the centred `main` sat 7.5 px further left (`x` 224 here, 216.5 there). `y`, sizes and metrics agree. (build, PR review) The cause is the scrollbar, not the operating system: headless Playwright hides scrollbars, and Windows headless regenerates the committed values. | The task excludes boxes from the comparison anyway. The Outcome records the machine. |
| 13. Shadow DOM, iframes | Not walked | The target app has neither. It can be added when a real site needs it. |
| 14. A card `li` holding a heading, a paragraph and a link | Measured as one list item named by all its text, alongside its children | RULES lists list items without exception, and s1-01 measured the nav `li` whose only text is its link. Changing that is a RULES question, not this task's. |
| 15. Where the target-app server lives | `src/serve-target-app.ts`, not exported from `index.ts` | One feature per file. The browser tests and the fixture script share it, and `scripts/` is not a place tests import from. |
| 16. Hidden beyond the task's three cases | `opacity: 0` on the element or an ancestor, and a box of 1 px or less on either side, are not measured either | The task measures text "with visible text". Both are standard ways to hide text from sighted people (the second is the `sr-only` pattern), and reaching the Actor with them would give the persona text nobody sees. |
| 17. `keepNames` in `tsx` | `collect` evaluates the function's source inside a wrapper that defines a no-op `__name` | `tsx@4.23.13` sets `keepNames`, and the fixture script and io, where `s2-03`'s loop runs, both run under `tsx`. Vitest does not, so a rules test pins the wrapper with a source that calls `__name(`. |
| 18. Public surface | `collect` exported; `contrast`, `measure-page` and `serve-target-app` internal | Nothing outside the package needs the arithmetic, the in-page function or its raw shape, and the server is test support. (build, CI review) `contrast` was exported too, until the PR's review found no caller outside the package: it is added back when one needs it. |
| 19. (build) Tests cut to the review standard that landed in #121 (`.claude/skills/pr-review/references/lenses.md`) | No test of `serve-target-app` and no `collect.test.ts`. Truncation lives in `contrast.ts` as `truncateRatio`, tested in `contrast.test.ts`, and the `__name` wrapper is proven by the rules test that evaluates a source calling `__name(` | The standard counts a test of test support, and a test that restates the implementation (the wrapper's text), as bloat. Every browser test runs through the server, so a broken server fails them all. |
| 20. (build) Where the background chain is cut | The page returns every layer up to `<html>`, and `effectiveBackground` cuts at the first opaque colour | Telling an opaque colour from a translucent one needs the colour parser, and `culori` runs in Node, not in the page. An opaque ancestor hides what is behind it, images included. |
| 21. (build) An explicit `role` | Its first token decides. A token that is not a role we measure leaves the element unmeasured | Playwright falls back to the first valid ARIA token, or to the implicit role (`<button role="foo">` is still a button to `getByRole`). Ours errs towards measuring less and never gives a wrong key. The target app sets no `role`. A follow-up for real sites. |
| 22. (build) Input buttons | Named by their `value`, then "Submit" or "Reset", before any label, and they draw their own text | That is how Playwright names them: it never reads their labels. The spec's step 3 listed labels first. |
| 23. (build) `area[href]` and hidden inputs | No mapping for either | Chromium gives an `area` no box, and a hidden input is `display: none !important` in the browser's own stylesheet, so neither can ever be measured |
| 24. (build) Found in the browser, left for real sites | `display: contents` children read as hidden, so `<a><span style="display: contents">Home</span></a>` is named `""`; `input[type=file]` is a textbox, not Playwright's "Choose File" button; a `li` in a `role="none"` list is still measured as a listitem; an icon drawn in an `aria-hidden` span gives its button no text metrics | The target app has none of these (checked). Each is one condition in `measure-page.ts`, filed as #127. The last errs towards measuring less. |
| 25. (build, branch review) An icon link drawn as `<svg><title>` | Named by the svg's `<title>`, the way an `img` is named by its `alt` | The most common icon pattern on real sites. Before, two such links shared the key `…//link:` and one roll, where Playwright names them. |
| 26. (build, branch review) A dark colour scheme | When the page's used `color-scheme` is dark (the root's `color-scheme`, else its `<meta name="color-scheme">`, "light dark" following the context's preference) and no opaque layer is behind the text, `contrast` is left out. Among several runs, such a run is left out of the minimum (row 30). | Chromium paints that canvas a dark grey no style exposes. Compositing over white gave white text a ratio of 1, so P1 would cut plainly readable text: a wrong number, worse than none. |
| 27. (build, simplify) Text at `font-size: 0` | It is never the element that draws the text: the drawer is the next visible text, and an input button or a placeholder at 0 px draws none | Such text is kept for the name only, an icon's label. Before, it supplied a contrast nobody sees and `collect` dropped its `fontPx` to pass the schema, a symptom patched at the boundary. |
| 28. (build, simplify) The fixture's layout | The script writes plain JSON and `fixture:measurement` runs `biome format` on it | Biome already owns the layout, since `pnpm lint` checks the file. A hand-written layout would drop a new schema field silently, and could disagree with Biome. The committed fixture is byte-identical either way. |
| 29. (build, after #122) A labelled control's target | The smaller side of one rectangle around the control's box and those of its visible labels (`el.labels`), the gap included. `bbox` stays the control's own box, and a hidden label does not count. (build, cold review) An `aria-hidden` label counts: it is still seen, and a click on it still activates the control. | #122 made this the P4 rule and rewrote this task's constraint while the branch was open. The user chose at the PR step to merge after #122 and adopt it. The page reports the label boxes and `collect` takes the rectangle, so the geometry stays out of the page like the rest of the arithmetic. |
| 30. (build, PR review) A text block's metrics | The worst over every run of text it draws: the lowest contrast and the smallest font, a nested link's text included. A run over a background image or the bare dark canvas gives no contrast and is left out of the minimum, so a text block can measure higher than its faintest run, and it has no `contrast` only when no run is measurable (#125). A control keeps its first run: **superseded by row 31.** | A text block is named by all its text, the links inside it included. Measured by its first run only, a paragraph kept the text of a link perception had cut: the reviewer's repro gave `paragraph "Looking for older orders? Order archive"` at 21:1 beside the link at 1.358:1, so the link's text reached the Actor, against "elements below threshold never reach the model". The cost is over-cutting: a paragraph with one faint link now disappears whole. The better fix, naming and measuring a text block over its own text only, changes `docs/RULES.md` and `measurement.ts` and is #124. The `/deliveries` fixture does not change: each of its text blocks has one run or starts with its link. Leaving the contrast out whenever any run is unknown was rejected: it would reopen the leak for a paragraph that also holds a known faint link. |
| 31. (build, PR recheck) A control's metrics | Row 30's rule: the worst over every run of text it draws. A form control with no text of its own reads every run of all its labels, as its name does. **Refined by row 32: a name read from a label, a referent or a placeholder is measured there.** | A link or button is named by all its text, and a form control by all its labels, so the first-run rule leaked as row 30's did. The reviewer's card link, `<a><h2>Deliveries</h2><p style="color:#ddd">See older orders</p></a>`, measured 9.397:1 beside its paragraph's 1.358:1, and Vera's Actor saw `link "Deliveries See older orders"`. A heading and a muted subtitle inside one `<a>` is common on real sites. The cost is row 30's over-cutting: such a card link is cut whole, although a person could still read and click its heading (#124). Keeping the first run and recording the leak was rejected: it breaks "elements below threshold never reach the model", and over-cutting does not. The target app has no such control, so `/deliveries` regenerates byte-identical. |
| 32. (build, cold review) Which runs a name is measured by | The runs that draw the name, from the source `nameOf` read it from: `aria-labelledby` referents, labels, a shown placeholder (the computed `::placeholder` colour and size, over the field's backgrounds), or the element's own text for content. A name drawn nowhere (`aria-label`, `alt`, `title`, a hidden referent, a placeholder under a typed value) is measured by the text the element draws itself. `nameOf` returns the name with its runs, so one source order decides both. A referent or label that is itself hidden is read whole, hidden children included, as accname and Playwright read it; an `aria-hidden` one is still drawn, so its runs count. In a source that is not hidden, hidden text stays out of the name and of its runs. Before, `contentOf` dropped a hidden source's element children, so `<span id="r" aria-hidden="true"><b>Order</b> archive</span>` named its button `archive`, which `getByRole` does not find; landmark names read through `labelOf` had the same gap. | Row 31 measured a control by its own text whenever it had any, while its name came from its labels first, and it never read referents or placeholders. So `<label for="b" style="color:#ddd">Order archive</label><button id="b">Go</button>` measured 18.263 while the Actor saw `button "Order archive"`. A button labelled by a cut paragraph through `aria-labelledby` carried that paragraph's text, and a `#999` placeholder (2.85:1, inside Vera's soft band) reached her whole, since it gave no metrics at all. Measuring the union of every source was rejected: it would cut a button named by a readable label because of its own text, which the Actor never sees. RULES "What is measured" already says a control carries its label's text, so RULES does not change. The target app has none of these patterns, and `/deliveries` regenerates byte-identical. |
| 33. (build, cold review) Which colour text is measured in | The computed `-webkit-text-fill-color`, on an element and on `::placeholder` alike | Chromium paints text in it when it is set, and it equals `color` when it is not, so every page that leaves it alone measures as before. With `color: #000; -webkit-text-fill-color: #ddd` the text is painted `#ddd`, and reading `color` gave 21:1 to text at 1.358:1. Gradient text, which sets the fill transparent over a `background-clip: text` image, gets no contrast by row 6 rather than a ratio of 1. |

## Risks

- **The accname subset may name something differently from Playwright on a real site** (A5), for example CSS `::before` content, `aria-describedby`, or nested `aria-labelledby`. The `getByRole` box guards the target app only. A miss shows up as a key that fails the `getByRole` check, and fixing it is local to `measure-page.ts`.
- **Backgrounds on real sites.** A partial `opacity`, `text-shadow`, a pseudo-element painting behind the text, or text over an image with no `background-image` in its own ancestry (an absolutely positioned picture underneath) all change the contrast a person sees, and `collect` does not see them. On such a page the number is a measurement of the colours, not of the pixels. Screenshot-based contrast is the fix. No task owns it yet: `s2-02` rules out measuring the page, so it is part of #125.
- **Custom form controls.** A native checkbox hidden visually (`opacity: 0` or `sr-only`) behind a drawn replacement is not measured, and neither is the label text that rides on it, so the persona cannot see the control at all. The target app draws native checkboxes. On a real site this shows as a finding Scout contradicts, which is how it would be caught.
- **CI time.** The Chromium headless shell download (about 95 MB) and the Vite build add about a minute to CI. `timeout-minutes: 10` holds.
- **Headed runs.** A headed browser on a system with classic scrollbars moves centred boxes by 7.5 px. Headless runs hide scrollbars. No test compares boxes across machines, only within one run.

## Review note

Spec review, round 1: "ready after fixes", no blocking finding. Every finding was taken.

- `keepNames` in `tsx` is a certainty, not a risk (`tsx@4.23.13` sets it). `collect` now always evaluates through a wrapper with a no-op `__name`, pinned by a rules test (Decision log, row 17).
- Contrast is truncated, not rounded, so no value is lifted across a cut (row 7).
- The text-block check compares `innerText` exactly instead of a pattern that let spaces match nothing (row 1).
- `opacity: 0` and the 1 px `sr-only` pattern are not measured (row 16), with a rules test.
- A `background-image` behind text leaves `contrast` out, and the background limits are listed in Risks (row 6).
- `scripts/measure-fixture.ts` and `tsconfig.json` are marked outside the task's list.
- Only `collect` is exported (row 18; `contrast` left the public surface after the PR's review).
- The hard-cut profile is named (Ada with a hard 3.0 cut, as in s1-01), and the CI command is written out.
- Boxes are compared within 0.01 px, at the same scroll.
