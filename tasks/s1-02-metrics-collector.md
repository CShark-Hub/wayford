# s1-02 — DOM metrics collector and the seed test on the target app

Stream: s1
Milestone: week 2
Size: L
Depends on: s1-01

## Context

Read first, in this order:

- `docs/RULES.md` stages 1 to 3: what P1 to P4 measure
- `docs/PLAN.md` section "Filter internals"
- `packages/core/src/measurement.ts` after s1-01, and `observation.ts` (`elementKey`)
- `packages/target-app/README.md` — pages, parameters, and how parameters persist in a tab
- `docs/STACK.md` sections "Core and filter" and "Target app"

## Goal

Given a Playwright page, the filter produces its `PageMeasurement`, and collect-then-perceive twice on one page of the running target app, with the same profile and seed, gives identical observations: the week 2 exit criterion for stream 1.

## Interface

- In: a Playwright `Page` showing any web page
- Out: `collect(page): Promise<PageMeasurement>` from `@wayford/filter` (not from `./perceive`); `measurementFixture` in core regenerated from its output
- Files expected to change: `packages/filter/src/**`, `packages/filter/package.json`, `pnpm-lock.yaml`, root `package.json` (`test:unit`, if missing), `packages/core/src/fixtures/measurement.json`, `.github/workflows/ci.yml` only if it exists

## Constraints

- Measurement only: no thresholds, no profile, no decisions. Those are `perceive` (s1-01).
- Contrast is the WCAG 2.2 relative-luminance ratio, in our own code, tested against published values: black on white 21:1, `#767676` on white 4.54:1, `#777777` on white 4.48:1. The background is the effective one: walk the ancestors, compositing alpha, until an opaque colour. A text colour with alpha is composited too.
- Font size is the computed CSS pixel size. Target size is the smaller side of the area a click activates: a control's own box, or, when a label activates it (a wrapping `<label>`, or `label for=`), one rectangle around the control's box and its label's box, gap included, as `docs/RULES.md` P4 says (#117). `bbox` stays the control's own box.
- Measured: every control, and every text block (heading, paragraph, list item) with visible text, as `docs/RULES.md` says. A label is not measured as a text block of its own: the control it names carries the contrast and font size of its label's text (#117). Elements with `display: none`, `visibility: hidden` or `aria-hidden="true"` are not measured.
- Role and accessible name: for every element measured on the target app, `page.getByRole(role, { name, exact: true })` resolves to it. The key is `elementKey` from core, over the element's named landmark ancestors.
- `@wayford/filter/perceive` stays browser-safe, so `collect` lives outside it. Playwright is a dev dependency of `filter`: `collect` takes the page from its caller.
- Tests start the target app themselves, with no manual `pnpm dev`, and load pages with all three parameters on the URL, as `packages/target-app/README.md` requires.
- Browser tests live in files ending `.browser.test.ts`. If the root `package.json` has no `test:unit` yet, add `"test:unit": "vitest run --exclude \"**/*.browser.test.ts\""`; s2-02 adds the same line, so whichever lands second keeps it as it is. `pnpm test` still runs everything.
- If `.github/workflows/ci.yml` exists by then (issue #28), install Chromium there for the browser tests.

## Acceptance

- [x] `pnpm --filter @wayford/filter test` passes and includes `contrast.test.ts` and `collect.browser.test.ts`. 7 files and 120 tests pass. The verbose listing shows `contrast.test.ts` (22 tests) and `collect.browser.test.ts` (10), beside `collect-rules.browser.test.ts` (34) and s1-01's four files.
- [x] `collect` on `/deliveries` at default parameters matches the regenerated `measurementFixture` in keys, roles, names, kinds, contrast and font size. Boxes are not compared: the target app bundles its one font (issue #32), but glyph positioning can still differ between operating systems.
  - Covered by "collect on /deliveries matches measurementFixture". It compares key, kind, role, name, contrast, font size and target size of all 19 elements, in order, and leaves boxes out.
  - Changing one contrast in the fixture by 0.001 turns it red.
  - The fixture comes from `pnpm --filter @wayford/filter fixture:measurement`, and a second run is byte-identical. The comparison with s1-01's hand measurement is in the Outcome.
- [x] The "Order archive" link measures within 0.01 of 2.006:1 at `?contrast=2&fontPx=16&targetPx=36` and within 0.01 of 7.005:1 at `?contrast=7&fontPx=16&targetPx=36`. Covered by "Order archive measures within 0.01 of 2.006 and of 7.005". It measures 2.005 and 7.004: the default grey's true ratio is 2.0056:1, and `collect` truncates to 3 decimals, never rounding up (spec, Decision log row 7).
- [x] For every element `collect` returns on each of the six target-app pages, `getByRole(role, { name, exact: true })` finds it.
  - Covered by "getByRole finds every measured element on <path>", one test per page, over 23, 21, 15, 19, 17 and 20 elements.
  - Controls and headings are found by `getByRole(role, { name, exact: true })`.
  - Paragraphs and list items are ones Playwright names nothing, so a list item cannot be found by name. They are found by `getByRole(role)`, matched on their exact collapsed `innerText()`. This was decided at gate 1 (spec, row 1; Outcome).
  - Both kinds are scoped by the element's landmark chain. An unnamed landmark is matched with `name: ""`, so a dropped landmark name fails.
  - One match must sit at the measured box within 0.01 px.
  - Making the collector ignore `aria-label` turns all six red.
- [x] Collect-then-perceive twice on `/deliveries` with Vera and seed 7 gives string-equal `renderObservationForModel(toActorObservation(...))`. Covered by "collect then perceive twice gives the same Actor text": two fresh browser contexts, two page loads and two collects give the same text. It also contains `link "Delivery address"`, so the comparison is not vacuous.
- [x] With a hard contrast cut of 3.0, the "Order archive" link is absent from the Actor-facing text at `?contrast=2` and present at `?contrast=7`. Covered by "a hard cut of 3.0 removes Order archive at contrast 2 and keeps it at 7", on Ada's profile with a hard 3.0 contrast cut, as s1-01's test builds it. With the cut at 1.5 it goes red.
- [x] `pnpm test:unit` runs without launching a browser, and `pnpm test` runs the browser tests. `PLAYWRIGHT_BROWSERS_PATH=/nonexistent pnpm test:unit` passes 32 files and 555 tests, so nothing launched Chromium. `pnpm test` runs 34 files and 599 tests: the same, plus `collect-rules.browser.test.ts` and `collect.browser.test.ts`.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root. Biome checked 115 files with no fixes. `pnpm typecheck` exits 0 in every package, filter as two programs. `pnpm test` passes 34 files and 599 tests.

## Out of scope

- Thresholds and decisions (s1-01), CDP vision-deficiency emulation and screenshots (s2-02), axe-core (week 4).
- Changes to `packages/target-app`. If the app needs one, stop and report.
- A harness that runs a whole task: browser context per persona, video, trace, fake cursor. That is s2-02.

## Notes for the reviewer

- Compare the regenerated fixture with the hand-measured one from s1-01. A large difference is either a collector bug or a measuring mistake in s1-01; find out which before merging.
- The accessible-name check against `getByRole` is what keeps the element key stable. Do not accept a weaker version.

## Outcome

What shipped, for the next reader. The design and every decision, including those taken during the build, are in `docs/specs/2026-09-29-s1-02-metrics-collector.md`.

- **`collect(page, { isMobile })`** from `@wayford/filter`, the main entry only.
  - `measure-page.ts` runs inside the page as one self-contained function. It reads role, name, landmark path, box and the computed style of the text each element draws.
  - `collect` does the arithmetic in Node and parses the result once, at the boundary.
  - The page cannot tell whether its context emulates a phone, so the caller passes `isMobile`, false by default. `s2-03` passes it on every step and `s3-05` for `/measure` (Milo is `device: mobile`).
  - `tsx` compiles with `keepNames`, which adds a `__name` helper the page does not have. So the source is sent through `pageSource`, which defines a no-op one.
- **What is measured.**
  - Controls, and headings, paragraphs and list items with visible text.
  - A text block or a control is measured by the worst of the text it draws: the lowest contrast and the smallest font over its runs, a link inside a paragraph and a subtitle inside a card link included. Its name holds that text, so text perception cuts must not reach the Actor through the element around it. The cost is over-cutting: a paragraph with one faint link, or a card link with a faint subtitle, disappears whole (#124). A name is measured where it is drawn: over a label's, an `aria-labelledby` referent's or a shown placeholder's text when it comes from there. A name drawn nowhere, such as an `aria-label`, leaves the element measured by the text it draws itself. An `aria-hidden` referent or label is read whole, as Playwright names it, and is still drawn, so its text counts.
  - Not measured: `display: none`, `visibility: hidden`, `opacity: 0`, `aria-hidden="true"`, and boxes of 1 px or less (the `sr-only` pattern). A document with no `<body>`, such as an SVG file, measures no elements.
  - Text drawn at `font-size: 0`, such as an icon's hidden label, still counts towards a name but gives no text metrics: the text a person reads is the next visible text. A placeholder at 0 px gives none either.
  - Text is measured in the colour Chromium paints it: `-webkit-text-fill-color`, which is `color` unless a page sets it.
  - **Labels ride on the control they name**, as in s1-01's fixture: a checkbox is named by its label and carries the label text's contrast and font size. This was decided at gate 1 (#117 option 1), and #122 wrote the same decision into `docs/RULES.md`.
  - **A labelled control's target** is the smaller side of one rectangle around its own box and the boxes of the visible labels that activate it, the gap included: #122's P4 rule, which changed this task's constraint while the branch was open. On `/deliveries` each checkbox measures 46 px, its label's height, and its `bbox` stays its own 22 × 22 box. A hidden label cannot be clicked, so it does not count.
- **Box 4, as built.** Playwright gives a paragraph or list item no accessible name, so the literal `getByRole(role, { name, exact: true })` finds none of them.
  - They are found by role and matched on their exact rendered text instead. The user chose this at gate 1, over rewording the box or asking the team first.
  - Everything that takes a name is checked exactly as the box says.
- **Contrast** is our own WCAG 2.2 code (`contrast.ts`), with `culori` reading computed colours, `oklch` included.
  - The background chain runs to `<html>` and is cut at the first opaque colour. A `background-image` behind the text leaves the contrast out rather than measure it against white. So does the bare canvas under a dark colour scheme, which Chromium paints a grey no style exposes.
  - Ratios are truncated to 3 decimals, never rounded up. So the hard link's 2.0056:1 reads **2.005**, where `docs/RULES.md` says 2.006 (#128).
- **The fixture** was regenerated on macOS in Playwright's Chromium headless shell 153. Against s1-01's hand measurement, taken on Windows with the scrollbar shown, the reviewer note's question has a clear answer: neither a collector bug nor a measuring mistake.
  - Unchanged: the 19 keys and their order, every kind, role, name, font size and target size (the checkboxes at #122's 46 px), the URL, title, viewport and scroll.
  - Boxes: x moves by +15 px on the right-aligned nav and +7.5 px on the centred main column. The cause is the scrollbar, not the operating system. Headless Playwright hides scrollbars (`--hide-scrollbars`), and the PR review found that regenerating on Windows headless gives the committed values. A browser that shows a classic 15 px scrollbar, as a headed one does on Windows, gives s1-01's. With overlay scrollbars, the macOS default, the flag changes nothing (checked on macOS). The "Delivery address" link is 1/64 px wider, from glyph positioning.
  - Contrast is 0.001 lower on 10 elements, where s1-01 rounded up and `collect` truncates, e.g. 15.798 → 15.797 and 2.006 → 2.005.
- **Files beyond the list above:**
  - `packages/filter/scripts/measure-fixture.ts`, which regenerates the fixture as plain JSON, laid out by Biome in the package script;
  - `packages/filter/tsconfig.json`, which adds the DOM lib for the in-page code (`tsconfig.perceive.json` stays browser-free);
  - `packages/core/src/measurement.test.ts`, whose two pinned boxes and contrasts follow the regenerated fixture;
  - `packages/core/src/fixtures/index.ts`, whose doc comment now says how the fixture is made;
  - `docs/STACK.md`, one clause: `culori`'s types come from `@types/culori`; and one sentence: `measure-page.ts`'s DOM lib reference reaches every program that imports `collect`;
  - `docs/KICKOFF.md`, one setup line: the browser tests need Playwright's Chromium headless shell once per machine, and a missing one fails either browser test file with the install command in its message;
  - the spec and the plan.
- **Tests.** The server has no test of its own, since the review standard that landed in #121 counts a test of test support as bloat, and every browser test runs through it. The `__name` wrapper is tested by what it does, not by its text: a rules row evaluates a source that calls `__name(`.

## Follow-ups

None block this task. Each is filed as an issue.

- **Elements named by the text inside them: #124.** A text block's name holds the text of the links and headings inside it, and a link's or button's all of its text, so this task measures each by the worst of that text. A paragraph with one faint link, or a card link with a faint subtitle, disappears whole. For a text block the real fix is naming and measuring it over its own text only. For a control it is measuring each run on its own, so perception drops the faint run's text rather than the whole control. Either changes `docs/RULES.md` and `measurement.ts`, so two approvals.
- **An unmeasured contrast passes P1: #125.** Over a background image or a dark canvas `collect` leaves `contrast` out, and `perceive` treats a missing metric as a pass, with nothing in the evidence to say so.
- **Elements nobody can see are measured: #126.** Examples: collapsed containers (`height: 0; overflow: hidden`), sr-only and `clip-path` wrappers, and links under a fixed overlay. The mirror case is there too: text drawn outside a box of 1 px or less that does not clip (`line-height: 0`, a `height: 0` flex item) is left out of the runs but kept in the name.
- **Roles and names on real sites: #127.** Examples:
  - an unknown `role` token;
  - `display: contents` children;
  - `input[type=file]`;
  - a list item in `role="none"`;
  - `aria-hidden` icons;
  - shadow DOM and iframes;
  - native checkboxes behind drawn replacements;
  - `role="none"` on a focusable control;
  - pseudo-element content in names;
  - untested mapping lines.
  Contrast reads colours, not pixels: partial `opacity`, `text-shadow` and pictures under text are not seen (spec, Risks).
- **RULES' 2.006: #128.** RULES says the hard link measures 2.006:1, which is 2.0056 rounded, and `collect` reports 2.005 because it truncates. RULES should say so, and it is frozen, so two approvals.
- **Box 4 and landmark completeness.** The `getByRole` check proves every listed landmark contains the element, not that the list is complete. A dropped landmark is caught by `collect-rules.browser.test.ts` instead. Nothing more is needed.
