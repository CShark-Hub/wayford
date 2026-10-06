# s3-11 — Lens: the preview redesigned: spec

Task: `tasks/s3-11-design-pass-preview.md` · Branch: `feature/s3-11-lens-redesign` · Date: 2026-10-06
Status: approved 2026-10-06 (auto)

## Goal

The Lens, Wayford's hero screen, matches `docs/design/screens/lens.html`, and beats 1 to 3 read clearly on a projector.

## Constraints that bind

- Task, "Look only": what the filter decides and how the Lens measures stay as they are (F2 AC3). Two views, Perceived and Evidence, `evidence` in the URL. No third view.
- Task, "Layout": a 300 px rail (persona switcher, name, one ThresholdGauge per perception rule, the seed); the stage on a measuring surface with the page picker and the view switch above it; a readout strip under it (counts, rules fired, axe card). Rail, stage and strip fit 1280 × 720 with no scroll.
- Task: the source badge reads `live page` or `stored page` from the screen's own fetch; no backend tag.
- Task: each gauge is a native range input over the drawn ruler; the post is `signal`, the softness band runs below it.
- Task: a removed element is a dashed `signal` outline with its flag, rule id first (`P1 · 2.0 < 4.5`); a degraded one is hatched with its masked name.
- Task: one animation, 240 ms, on an element that changes state as a gauge moves; none under `prefers-reduced-motion`.
- Task: the Lens joins `check:self` in both themes; `SelfCheckScreen` gains an optional `exclude` selector, set to the stage; everything else is checked.
- Task, Interface: tests change "only where a test reads a class name or a file path". Read with the layout rules above, which move the axe card and adopt SegmentedControl (see the decision log).
- Task, Out of scope: no illustration view (`s3-06`), no real-page view, no change to `perceive` or to what the Lens measures.
- `docs/DESIGN.md`: `signal` marks only measurement lines; text 16 px or more at 4.5:1; targets 32 px or more; no arbitrary text sizes; colours only from tokens; `shadow-raised` only on cast cards and a finished lane; under reduced motion every duration is 0.
- `AGENTS.md`: the persona is a filter, not a prompt; the screen draws what `perceive` returns and decides nothing.

## Design

### Screen: `packages/web/src/screens/lens.tsx` (renamed from `preview.tsx`)

`LensScreen` and `lensRoute` (were `PreviewScreen`, `previewRoute`). The URL contract (`src/preview/search.ts`), the slider write batching (`useSliderWrites`), the redraw timing, the live/stored measurement logic and the single `perceive` call per render stay as they are.

Layout, a grid filling `calc(100dvh - var(--header-h))`, at least 664 px tall, centred at `content-max`:

```
┌ rail 300 ─────────┬ stage ─────────────────────────────────────────────┐
│ persona links (5) │ [Page: /deliveries …]  h2 page title  [View]       │
│ Vera  (h1)        │ [stored banner, only on fallback]                  │
│ description ×2    │ ┌ measuring surface ────────────────────────────┐ │
│ Contrast  P1 4.5:1│ │ Live: <url> on desktop, at …   (source line)   │ │
│ ▕▔▔▔▔▔▔|▔▔▔▔▔▔▔▏ │ │ ┌ frame ───────────────────────────────────┐  │ │
│ [folk · no source]│ │ │ canvas [data-lens-stage], fit by height   │  │ │
│   was 3:1         │ │ └───────────────────────────────────────────┘  │ │
│ softness ─●─ 0.5  │ │ caption (figcaption)                           │ │
│ Font size …       │ └────────────────────────────────────────────────┘ │
│ Target size …     │ visible 12 · degraded 0 · removed 2 | rules | axe  │
│ [−] seed 1 [+]    │                                                    │
└───────────────────┴────────────────────────────────────────────────────┘
```

The old header goes: the `h1` "Lens" (the top bar's nav already marks the screen, and the persona's name becomes the `h1`), its lead line, and the seed note, which moves to the seed box's `title`.

- **Rail** (`aside`, sets the persona slot's `--p`, `--p-ink`, `--p-soft` with `slotStyle`):
  - `nav aria-label="Persona"`: one link per bundled profile, a 48 px `PersonaAvatar` (aria-hidden) and the label as visually hidden text; `aria-current="page"` on the current one, drawn with a 2 px paper gap and a 2 px `--p` ring. Links, as today, so Back returns to the persona before.
  - `h1` the persona's label in `display-m`, the description under it in `body` `ink-2`, clamped to two lines.
  - `ThresholdGauge` for contrast (P1), font size (P3) and target size (P4), in `METRIC_NAMES` order. Each holds its softness slider (below). Its tags: the rule id (`Tag variant="rule"`) and `ProvenanceTag` of `state.profile.perception[metric]?.provenance`, the threshold `perceive` actually gets, so a moved threshold reads `folk · no source` (as `resolvePreview` sets it) and an off one shows no source. `was` is the persona's own threshold, passed only when the slider moved off it.
  - `SeedStepper` at the bottom: a `−` and a `+` button (`Button variant="outline" size="icon"`, 40 px, aria-labels "Previous seed" and "Next seed"), and between them a box reading `seed 1` over a native range input `#preview-seed` (label "Seed", lowercased by CSS; its `<output>` reads `format(seed)` as today). The buttons call the same `move("seed", …)` then `release()` as the slider, so a click is one replace write; `−` is disabled at 0 and `+` at `Seed`'s maximum. The box's `title` keeps the old note: "Stands in for a run seed. The profile seed only draws the avatar."
- **Stage** (`section aria-labelledby="preview-page-title"`):
  - Toolbar, one 40 px row: the page picker, `nav aria-label="Page"` with one link per page, drawn as a mono segmented control (links, as today, so Back works); `h2#preview-page-title`, the page's title as today, in `label` `ink-2`, truncated with its full text in `title`; the view switch, `SegmentedControl` labelled "View" with Perceived and Evidence.
  - Stored banner (`Banner kind="stored"`, the same sentence and "Try again" as today) above the surface, only on the fallback.
  - Measuring surface (the `measure` utility: `paper-sunken`, 16 px dot grid, four corner ticks), a size container. Inside, in order: the source line (`Live: <url> on <device>, at the target app's default parameters.` as today, URL in mono); the frame; the `figcaption` (text unchanged).
  - Frame: the canvas `[data-lens-stage]`, hairline border, `radius-md`, no shadow. The canvas is cropped at the bottom to the lowest measured element inside the viewport plus 24 px (never taller than the viewport), from the measurement's elements whatever their state, so it never moves as a slider does. Its width is `min(100cqw, 100cqh × viewport width / cropped height)`, so it fits the surface's height; the existing `max-width: <viewport width>px` wrapper stays. Element positions are unchanged, so the boxes keep their measured px.
  - Scale at 1280 × 720 on the stored `/deliveries` (elements down to y 639): estimated here at about 0.6; measured in the build at 0.46 (see the build row "The canvas's real scale"). The flags and the strip are drawn at full size; the outline and the hatch sit on the scaled box.
  - While measuring: the `role="status"` line (text unchanged) and a `Skeleton` in the frame's shape.
- **Strip**: three counts (`visible`, `degraded`, `removed`, each a `StateSwatch` and a number in `readout`), a "rules fired" cell (one `Tag variant="rule"` per rule that fired: `P1 contrast`, `P3 font size`, `P4 target`, `V2 viewport`, `A1 attention`, `A3 options`, `K1 pattern`, `K2 jargon`, `K4 pattern`; "none" when none did), and the axe card on the right.
- **Axe card** (`section aria-label="axe-core"`, the same queries and the same three states): head `axe-core, WCAG 2.2 A and AA: N violations` with the count in `ink`, the rules as a list of tags (`color-contrast, 1 element`), and `Scanned once per page on desktop, at the target app's default parameters.` in `ink-3`. Failed and scanning texts unchanged.
- **Top bar**: `<TopBarSlot><SourceBadge source="live">live page</SourceBadge></TopBarSlot>` once io answered, `source="stored"` and `stored page` on the fallback, nothing while measuring.

Counts and rules fired are read from the one `FullObservation` the screen already has: `removed` is an element with no `ref`; `degraded` and `visible` split the rest by the state `toActorObservation` gives its ref. No second `perceive` call.

### `packages/web/src/components/threshold-gauge.tsx` (new)

```ts
export function ThresholdGauge(props: {
  id: string;                 // the range input's id, e.g. "preview-contrast"
  label: string;              // "Contrast": the <label>'s text
  value: number;              // the threshold as the URL resolves it
  min: number; max: number; step: number;
  ticks: number;              // ruler intervals
  off: boolean;               // draws no fill, post or band; value reads "off"
  softness: number;           // the band runs from value × (1 − softness) to value
  format: (value: number) => string; // readout and aria-valuetext
  was?: number;               // the persona's own threshold, drawn as a dashed ghost and "was …" when the value moved off it
  tags: ReactNode;            // rule and provenance tags
  onMove: (next: number) => void;
  onRelease: () => void;
  children?: ReactNode;       // the softness row
}): JSX.Element;
```

The head row holds the `<label htmlFor={id}>` and, right-aligned, `<output htmlFor={id} aria-live="off">` holding exactly `format(value)`, the same string as the input's `aria-valuetext`; "was …" sits outside the output, in the tags row. The ruler is drawn (`paper-sunken` track, `line-strong` ticks, `--p` fill to the value, a `signal` post with its round cap, the `signal-soft` hatched band below the post). A native `<input type="range">` lies over the whole 32 px track with a transparent track and thumb, so pointer, keyboard and screen reader use the real slider; the track shows the focus ring when the input has `:focus-visible`. A value past `max` puts the post at the end and the readout shows the value. The held-value logic `SearchSlider` has today (`moving`, dropped once the URL has it or on blur) moves into a small hook both use: `useHeldValue` in `threshold-gauge.tsx`, exported.

Gauge ranges, from `lens.html`, in a `GAUGES` table in `lens.tsx`: contrast 1–7 (step 0.1, 6 ticks), font size 0–32 (step 1, 8 ticks), target size 0–56 (step 1, 7 ticks). The low end is each metric's `off` from `CUT_SLIDERS`, which keeps validating the URL up to 21, 48 and 96.

### Softness rows: `packages/web/src/preview/search-slider.tsx` (restyled)

`SearchSlider` becomes one 32 px row: `<label>` (visually "softness", with "Contrast " visually hidden, so it reads "Contrast softness"), the range input (`accent-(--p)`), the `<output>`. Ids, labels, outputs, `aria-valuetext` and the disabled rule are unchanged.

### `packages/web/src/components/filter-states.tsx` (new)

```ts
/** How the Lens draws one element: the filter's decision, never a new one. */
export type FilterState = "visible" | "degraded" | "renamed" | "removed" | "cut";
export const FILTER_STATE_CLASS: Record<FilterState, string>;   // Tailwind classes per state
export function CutFlag(props: { quiet?: boolean; side: "left" | "right"; children: ReactNode }): JSX.Element;
export function StateSwatch(props: { state: "visible" | "degraded" | "removed" }): JSX.Element;
```

- `degraded`: `ink-3` text, the `hatch` background, a hairline `line-strong` outline.
- `renamed`: mono, `ink-2`, a dotted underline.
- `removed`: a 2 px dashed `signal` outline, with a `CutFlag` in `signal` / `on-signal`.
- `cut` (removed by attention or the viewport, no perception rule): a 2 px dashed `line-strong` outline and a quiet flag (`surface`, `ink-2`).
- A flag sits beside its element, never over it: right of it, or left when the element's centre is in the right half of the page, with a 10 px leader line.

`index.css` gains, after the token block: the `hatch` utility (the degraded pattern from `components.css`, in `var(--line)`), the `measure` utility (the measuring surface from `components.css`'s `.wf-measure`, in `var(--line)` and `var(--ink-3)`), and four 240 ms keyframes as `--animate-*` theme values, each set to `none` under `prefers-reduced-motion` next to the shimmer's.

### `packages/web/src/preview/perceived-page.tsx` (restyled, plus the animation)

Props gain `scene: string`: the screen passes `persona|page|live-or-stored|view`.

- `ShownBox` takes `FILTER_STATE_CLASS` for degraded (by the Actor's state, as today) or renamed (a `knowledge` decision on the element), `visible` otherwise. Data attributes and names unchanged.
- `RemovedOutline` (Evidence only) is `removed` when any removing decision is a perception rule, else `cut`. Its flag lists every removing decision, one per line: `P1 · 2.005 < 4.5` (the value as `perceive` recorded it, never rounded), `V2 · below`, `A1 · attention`.
- **The one animation.** Per element index the page keeps its look (`visible`, `degraded`, `removed`), its drawn name and a change counter, in state, adjusted during render (React's "storing information from previous renders"). The step is a pure, exported function:

  ```ts
  export type Look = "visible" | "degraded" | "removed";
  export type Track = { scene: string; looks: Look[]; names: string[]; changes: number[]; was: ({ look: Look; name: string } | undefined)[] };
  /** The track after a render: reset on a new scene or element count, a counter up where the look changed, else `prev` itself. */
  export function nextTrack(prev: Track | undefined, scene: string, looks: Look[], names: string[]): Track;
  ```

  It returns `prev` itself when nothing changed, so the state is set only on a change and the render settles. When an element's look differs from the previous render's, its counter goes up and its key (`shown:<i>:<n>`, `removed:<i>:<n>`, `leaving:<i>:<n>`) changes, so React mounts a fresh node, whose CSS animation plays once:
  - visible → degraded: the hatch fades in;
  - → removed in Evidence: the outline draws in from the hatch while the flag drops in;
  - → removed in Perceived: a `data-leaving` ghost, `aria-hidden`, with no `data-ref` and no `data-state` (so `drawnBoxes`, the browser test and the self-check's `ready` never count it), drawn as the element was (name and look from `was`), fades out; its resting style is `opacity: 0`, so with animation `none` it is simply gone.

  An element with counter 0 carries no animation class. A static render has every counter at 0, so the markup the tests read has no ghost and no animation class. Persona, page, view and source changes never animate; threshold, softness and seed moves do.

### `packages/web/src/components/segmented-control.tsx` (small change)

Export the group and item class strings (`SEGMENT_GROUP`, `segmentItem(mono)`) so the page picker's links take the exact look of `SegmentedControl` without a second copy. The item style also matches `aria-[current=page]`.

### Self-check: `packages/web/scripts/self-check.ts`, `check-self.ts`

```ts
export interface SelfCheckScreen {
  // …as today
  /** A CSS selector whose elements the check skips: an element whose box centre lies inside one is not held to the floors. */
  exclude?: string;
}
export function shortfalls(screen: string, measurement: PageMeasurement, excluded?: readonly Bbox[]): Shortfall[];
```

`checkScreen` reads the excluded regions' `getBoundingClientRect()` right after `collect`, in the same viewport coordinates as `bbox`, and passes them to `shortfalls`. `check-self.ts` prints one line per screen that excludes: `lens: skips [data-lens-stage]`.

The Lens entry: `{ name: "lens", path: "/lens", ready: 'main:has([data-state]):has(section[aria-label="axe-core"] li)', responses: { "/measure": measurementFixture, "/axe": axeScanFixture("/deliveries") }, exclude: "[data-lens-stage]" }`.

## Files

| File | Why |
|---|---|
| `packages/web/src/screens/lens.tsx` | Renamed from `preview.tsx` (s4-06 has merged); the new layout. |
| `packages/web/src/screens/lens.test.tsx` | Renamed from `preview.test.tsx`; three helpers follow the layout (decision log). |
| `packages/web/src/screens/lens.browser.test.ts` | Renamed from `preview.browser.test.ts`; unchanged otherwise. |
| `packages/web/src/router.tsx` | Outside the list: one import follows the rename (`lensRoute`). |
| `packages/web/src/preview/perceived-page.tsx` | Filter states, flags, the animation. |
| `packages/web/src/preview/perceived-page.test.tsx` | Flag text and states; only where it reads a tag's text. |
| `packages/web/src/preview/search-slider.tsx` | The softness row look; `useHeldValue`. |
| `packages/web/src/components/threshold-gauge.tsx` (+ `.test.tsx`) | New component. |
| `packages/web/src/components/filter-states.tsx` (+ `.test.tsx`) | New component. |
| `packages/web/src/components/segmented-control.tsx` | Export the class strings for the link variant. |
| `packages/web/src/index.css` | `hatch` and `measure` utilities and the four 240 ms animations, reduced-motion `none`. Outside the list (`components/**` names the components, not the stylesheet); `docs/DESIGN.md`, "In code", puts every style value there. |
| `packages/web/scripts/self-check.ts`, `check-self.ts`, `self-check.browser.test.ts` | `exclude`, the Lens entry, the exclusion test. |
| `tasks/s3-11-design-pass-preview.md` | Ticked boxes, Outcome. |

## Acceptance mapping

| Acceptance box | Proven by |
|---|---|
| `pnpm --filter @wayford/web test` passes, the preview's browser test included | The command; `lens.browser.test.ts` runs in it. New tests: `threshold-gauge.test.tsx` (ruler positions, off, band, was, output equals `aria-valuetext`), `filter-states.test.tsx` (classes, flag side), `perceived-page.test.tsx` (flag text `P1 · 2.005 < 3`, removed vs cut look, renamed look, the bottom crop; `nextTrack`: a change within a scene raises its counter and keeps `was`, a scene change resets, no change returns `prev`), `lens.test.tsx` (counts and rules fired match the observation; Vera at `contrast=4.5` shows `folk · no source` and "was", at her own values `wcag22` and no "was"). `lens.browser.test.ts`, new test: Vera at `contrast=2&contrastSoftness=0`, one ArrowRight on contrast removes Order archive, and its `[data-leaving]` ghost runs one animation that finishes at opacity 0; under `emulateMedia({ reducedMotion: "reduce" })` the ghost's `animation-name` is `none` and it is not visible. |
| `check:self` passes with the Lens listed, in both themes; a test shows a shortfall inside an `exclude` region is skipped and one outside is not | `pnpm --filter @wayford/web check:self` output (`2 screens checked in Daylight and Night: 0 shortfalls`); `self-check.browser.test.ts`: "a shortfall inside an exclude region is skipped, one outside it is not", plus the listed-screens loop now covering `lens`. |
| The PR shows beats 1 to 3 at 1280 × 720 beside `lens.html`, and the reviewer approves the look | Screenshots in the browser pane at 1280 × 720, both themes: beat 1 Ada `/deliveries`; beat 2 Vera seed with Order archive degraded, then contrast at 4.5, then Evidence; beat 3 Kai `/settings/data`; `lens.html` beside them. Posted in the PR. Reviewer's approval is the human box. |
| `pnpm lint`, `pnpm typecheck`, `pnpm test` at the root | The commands. |

## Decision log

| Question | Taken | Why |
|---|---|---|
| Rename `preview.tsx` now? | Yes, to `lens.tsx`, with `LensScreen`/`lensRoute`, the two screen tests renamed with it, and one import in `router.tsx`. | The task renames it once `s4-06` merged, which it has (PR #173). The import is forced by the rename. |
| Softness sliders: `lens.html` draws none | Keep them, one 32 px row per gauge under its tags. | They are the URL's `*Softness` params; the tests pin seven sliders and the browser test drives `#preview-contrastSoftness`. Dropping them would change behaviour, not look. |
| Fitting 720 with the softness rows | The gauge drops `lens.html`'s scale row of landmark numbers; the ruler keeps its ticks and the head keeps the value. | Rail budget: 632 px inside its padding; with a scale row the three gauges need ~78 px more than there is. The landmarks are the least read part on a projector. |
| Gauge ranges | `lens.html`'s: contrast 1–7, font 0–32, target 0–56; the URL still validates to 21, 48, 96 (`CUT_SLIDERS` untouched). A value past the end puts the post at the end and reads as itself. | Beat 2 drags 3.0 to 4.5: on 1–21 that is 20 px of a 260 px track; on 1–7 it is 65 px. No persona sets more than 7:1, 24 px or 48 px. |
| Seed control: `lens.html` draws a stepper | A stepper whose middle box is the native range `#preview-seed`, with − and + buttons. | The tests pin a range input labelled "Seed"; the browser test presses arrows on it. Buttons give the stepper's click. |
| Persona switcher: buttons in `lens.html` | Links with avatars and visually hidden names, `aria-current`. | A persona switch is a place: Back returns to it (s3-01), and the tests read the links. |
| Page picker | Links styled with `SegmentedControl`'s exported classes. | Same reason; one look, no second copy of the classes. |
| View switch | `SegmentedControl` (a Radix radio group). The test helper `viewOf` reads `role="radiogroup"` and `aria-checked` instead of a `fieldset` and `aria-pressed`. | The task says the screen adopts `SegmentedControl`; its items are radios. The assertions keep their meaning. |
| Axe card position | In the strip, after the drawing; the s4-06 test's order assertion becomes "after the page's drawing". | The task puts it in the readout strip. |
| Copy the tests pin (Live line, caption, banner, status, axe sentences) | Kept word for word, restyled. | Behaviour stays; the tests read it. The source badge adds `live page`/`stored page` in the top bar. |
| Where the page title goes | In the toolbar, between the page picker and the view switch. | The stage section is labelled by it, and a title bar on the frame would cost the canvas 32 px of height. |
| The canvas's scale | Fit by height, cropped at the bottom to the measured elements; estimated at about 0.6 on `/deliveries` at 1280 × 720 (the old screen drew about 0.67, `lens.html`'s stylised redraw 0.625). Measured at 0.46 in the build. | The strip and the rail's copy are fixed by the tests and the 16 px floor; cropping the empty bottom wins about 10 %. |
| Rail name size | `display-m`, as `lens.html` draws it, not `display-l` as `docs/DESIGN.md`'s type table lists. | 48 px would cost 12 px the rail does not have; the picture is the closer guide for one screen. |
| The old header and seed note | The "Lens" `h1` and its lead go; the persona's name is the `h1`. The seed note moves to the seed box's `title`. | The top bar marks the screen; the rail has no room for the note. |
| Gauge provenance | `ProvenanceTag` of the threshold `perceive` gets: `folk · no source` once moved. | A slider value cites nothing (`search.ts`); showing `wcag22` beside 4.5 would cite a source for a value it does not hold. |
| Flag numbers | As `perceive` recorded them: `P1 · 2.005 < 4.5`. | Rounding can print `4.5 < 4.5` for 4.496. `docs/DESIGN.md`: values in mono exactly as the code spells them. |
| Attention and viewport cuts | Dashed `line-strong` outline with a quiet flag (`A1 · attention`, `V2 · below`). | `docs/DESIGN.md` FilterStates: "cut by attention (quiet flag)"; `signal` is for measurement lines, which these are not. |
| Count deltas (`0 −1`, `2 +1` in `lens.html`) | Not drawn. | They need a second `perceive` against the persona's own thresholds; the tests pin every call to the URL's profile, and the screen should not grow a second filter run. |
| Which changes animate | Threshold, softness and seed moves; not persona, page, view or source switches. | `docs/DESIGN.md`, "Motion": "When a threshold moves". A scene key resets the counters. |
| How the animation is triggered | Keyed remount per change counter, CSS keyframes whose resting state is the final look. | Plays exactly once per change, works with `animation: none` under reduced motion, and a static render carries none. |
| Frame shadow | None, hairline only. | `docs/DESIGN.md` allows `shadow-raised` only on cast cards and a finished lane; `lens.html`'s shadow on the frame is the picture straying. |
| Count numbers' size | `readout` (44 px mono). | `lens.html`'s 32 px mono has no type style; `docs/DESIGN.md` bans arbitrary sizes. |
| Exclusion test | By box centre inside an excluded region's rect, read with `getBoundingClientRect` right after `collect`. | `collect` is the filter's and stays untouched; its `bbox` is the same viewport rect. Centre, not containment, so a box clipped at the canvas edge is still skipped. |
| An `exclude` that matches nothing (build) | `checkScreen` throws `self_check_exclude`, naming the selector. | A broken entry would otherwise pass silently; with the stage drawn, a typo is the only way to match nothing. |
| What the Lens's `exclude` skips today (build) | Nothing: the drawn boxes are divs, which `collect` does not measure. Kept as the guard the task and `docs/DESIGN.md` ask for. | A box drawn as a heading, paragraph or control would be held to the floors at half size and fail. |
| The canvas's real scale (build) | Measured at 1280 × 720: the frame is 589 × 306 on `/deliveries` (scale 0.46) and 596 × 336 on `/settings/data`, the same in both views. Kept. | The strip is 132 px: the axe card's three pinned texts need four rows in the ~400 px the counts and rules fired leave it. Dropping or shortening the pinned "Scanned once per page…" sentence would win about 100 px of width, and is the reviewer's call, not this task's. The flags, outlines, hatch and strip tags are drawn at full size, and carry beats 2 and 3. |
| The caption's height (build) | Two lines in both views. | The evidence caption wraps to two lines; without the reserve, flipping the view in beat 2 resized the page under the jury's eyes. |
| "was" on a moved gauge (build) | On the head row, before the readout. | In the tags row it wrapped beside `folk · no source`; with three thresholds moved the rail overflowed by 36 px. |
| Strip and caption blocks (build) | Counts, rules fired and the caption are `<p>` and `<li>` blocks; the Live line and the caption sit on their own `paper-sunken` ground. | `collect` measures headings, paragraphs and list items only, and text over the dot grid has no contrast to read. Now every text outside the stage is checked. |
| Flags past the frame (build) | The canvas clips top and bottom only; a flag may run past the frame's side onto the measuring surface. Flags close together may still overlap. | On a phone's 164 px frame both of Milo's flags lost their thresholds to the clip. An outline below the fold stays clipped. Laying flags out around each other needs measuring them in the browser, more than this task's look pass. |
| The renamed underline (build) | 1 px dotted, not `components.css`'s 2 px. | At about half size the 2 px dots ran into `[unfamiliar term]`'s letters. |
| A wide element's flag (build) | Inside its outline, at the start, with no leader, when the element is half the viewport wide or wider. | Beside an 832 px paragraph neither side has room, and the frame clipped the flag. A removed element is not drawn, so its outline covers nothing. |
| The skeleton's border (build) | A `line-strong` hairline on the loading frame. | Sunken paper on the sunken surface was invisible. |
| One held range (build) | `useHeldRange` holds a moved value and returns the input's props, for the gauge, the softness row and the seed box; `RANGE_HOST` is the box a transparent range lies over, which draws its focus ring. `SearchSlider` is the softness row alone: its bounds and format are inside, and it takes the metric's label. | The three inputs repeated the hold, the handlers, the readout and the focus-ring classes. |
| A gauge's off (build) | The gauge has no `off` prop: the value it draws at its `min`, `CUT_SLIDERS[metric].off`, is off. | The prop read the URL's value and the drawing the held one, so mid-drag the post and the readout could disagree. |
| Looks and rule words (build) | `looksOf` in `perceived-page.tsx` gives each element its look once, for the drawing, the animation and `lensCounts`, which returns `Record<Look, number>`. `Look` and `RULE_WORDS` live in `filter-states.tsx`; the strip's rules and the flags' attention lines both read `RULE_WORDS`. | The screen and the page each derived "degraded", and the strip and the flags each kept their own words. |
| The animation's scene (build) | The screen keys `PerceivedPage` by the scene (persona, page, source, view); `nextTrack` starts over only on a new element count. | A remount starts the track fresh, so one mechanism resets it, not a prop compared on every render as well. |
| Text off the dot grid (build) | The measuring surface is the frame's cell in `PerceivedPage`, padded and clipped; the Live line, the status line and the caption sit on paper, and the loading skeleton on a surface of its own. The phone's width cap moves from a wrapper in the screen to the frame's `max-width`. Replaces the sunken ground in "Strip and caption blocks". | Text on paper has its contrast to measure with no patch, and the clip keeps flags and off-page outlines on the surface. A wrapper would narrow the surface itself on a phone and clip the flags beside its 164 px frame. The frame stays 589 × 306 on `/deliveries`. |
| A flag's side (build) | The side with more room between the element and the page's edge, right on a tie; inside the outline, at its top with no leader, only when that side has under a quarter of the viewport. Replaces "A wide element's flag". | By centre and width, a 640 px element at x 224 put its flag inside with 416 px free on its right. The 832 px paragraph still takes it inside. |
| The crop (build) | Set by the elements with no `viewport` decision, V2's own, not by geometry. | The page draws decisions; working out "in the viewport" again was a second copy of V2. |

## Risks

- `collect` may measure the visually hidden persona names or the transparent range inputs in an unexpected way in `check:self`. Check early in the build; fix in the markup, not in the check.
- The fit at 1280 × 720 is tight: the axe card's sentence wraps to two lines. If the strip grows past ~120 px, the canvas falls under ~620 px wide. Tune spacing first, then the description clamp.
- The animation relies on state adjusted during render; a mistake there loops. `nextTrack` returns `prev` when nothing changed, its unit tests pin that, and the browser tests' slider moves exercise the real loop.

## Review note

Round 1 (spec-reviewer): ready after fixes, no blocking finding.

- should, canvas scale unrecorded: the title moved from a frame bar to the toolbar, the canvas is cropped at the bottom, and the scale and its numbers are a decision row.
- should, provenance of a moved threshold: the tag reads the provenance `perceive` gets, `folk · no source` once moved; a `lens.test.tsx` case pins it.
- should, the animation untested: the tracking is the pure `nextTrack`, unit tested; a browser test checks one animation and `none` under reduced motion.
- nits fixed: the gauge's `<output>` contract, the ghost's attributes, the seed stepper's buttons, the rail name size logged, a `measure` utility, the old header and seed note accounted for.
