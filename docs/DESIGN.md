# Wayford — DESIGN

One page, decided once (`s3-07`). `s3-08`, `s3-09`, `s3-11` and `s3-12` follow it and add no tokens of their own. A screen that needs something this page does not give changes this page first, in its own PR.

## The direction

A ford at night. The chrome is dark, cool and monochrome: the water. The personas are the only colour in it: the people crossing. Colour therefore always means **who**, never decoration, status or brand.

It must read on a projector at 1280 × 720: no text under 14 px, contrast to spare.

## Two registers

| | Input: personas, preview controls, arena | Output: runs, run detail, report, sweep |
|---|---|---|
| Feel | playful, big, colour-led | sober, dense, evidence first |
| Type | bold names (30–36 px, 800 weight), 16 px body | 14–16 px; mono for seeds, measurements, ids and costs, with tabular figures |
| Colour | the persona colour as the card's accent | monochrome; the persona colour only as a 4 px stripe or dot beside the persona's name, and as its chart series |
| Shape | `rounded-2xl` cards, 24 px padding | `rounded-md`, tables and rows, 8–12 px padding |

The persona colour is the only thing that crosses both.

## Colour

Dark by default: `index.html` keeps `class="dark"`. The light `:root` values stay shadcn's, and there is no switch.

The `.dark` tokens in `packages/web/src/index.css` share one cool hue, 250, at low chroma:

| Token | Value |
|---|---|
| `background` | `oklch(0.16 0.012 250)` |
| `card`, `popover`, `sidebar` | `oklch(0.205 0.014 250)` |
| `foreground` and every `*-foreground` on a dark surface | `oklch(0.97 0.005 250)` |
| `muted-foreground` | `oklch(0.72 0.012 250)` |
| `secondary`, `muted`, `accent` | `oklch(0.27 0.016 250)` |
| `primary` | `oklch(0.93 0.008 250)`, near-white, no brand hue |
| `border`, `input` | the foreground at 10 % and 15 % |
| `ring` | `oklch(0.6 0.02 250)` |
| `chart-1` to `chart-5` | greys of the same hue, 0.87 down to 0.32 |

Worked once with the filter's own `contrastRatio` (`packages/filter/src/contrast.ts`):

- foreground: 17.8:1 on the background, 16.4:1 on the card;
- muted-foreground: 7.8:1 on the background, 7.2:1 on the card, against 6.9:1 before;
- foreground on `accent`, the active nav link: 13.8:1; muted-foreground on it: 6.1:1;
- the focus ring: 4.9:1 on the background, over WCAG 2.2's 3:1 for non-text contrast.

These are margins, not a guarantee: `check:self` guards the floor (below), not these figures.

`destructive` is the one hue that is not a persona's. It is kept for errors, never for a persona's failure: a failed run is a fact, not an alarm.

**The persona colour** is `personaColour(profile)`, `oklch(0.75 0.12 h)` from `avatar/parts.ts`. It is a JS value, not a token, since it depends on the profile. On the card it measures 7.6:1 to 8.5:1 across all 12 hues.

- It may colour a name or a stripe.
- On the input side it may also mark the control that belongs to a persona:
  - a slider's fill and a selected tile's border in the preview;
  - a checkbox's `accent-color` and a race tile's top border in the arena.
- It is never a background behind text.
- It is never a status: success and failure stay in words and in the monochrome tokens.
- Two personas' colours are never mixed, in a gradient or a blend.

## Type

Inter for text, JetBrains Mono for numbers that are evidence (`docs/STACK.md`). Tailwind's scale, with one change: `--text-xs` is raised to 14 px (`0.875rem`, line height `1.25rem`), so every old `text-xs` meets the floor through the token alone.

- Use `text-sm` for 14 px. `text-xs` draws the same size and exists only so old classes stay legal.
- Sizes in use: 14 for meta, badges and tables; 16 for body; 18 for leads; 20 and 24 for section titles; 30 and 36 for persona names and screen titles on the input side.
- Banned: arbitrary sizes (`text-[…]`) and chart ticks under 14 px. Two exist today and are follow-ups for the screens they sit on:
  - `text-[11px]` in `preview/perceived-page.tsx`, for `s3-11`;
  - the Recharts tick at `fontSize: 12` in `runs/task-results.tsx`, for `s3-12`.

## Spacing, radius, motion

- Spacing is Tailwind's 4 px grid. Input side: 24 between cards and as card padding. Output side: 8 and 12.
- The page column is `mx-auto max-w-7xl` with 24 px padding, the header's own column. Personas, arena, runs and run detail's loading state keep to it. The preview and the loaded run detail use `max-w-[1400px]`, so at 1440 px their headings start left of the wordmark; they move onto the column in `s3-11` and `s3-12`. Events, off the demo path, keeps its narrower `max-w-4xl`.
- Radius: `--radius` stays `0.625rem`. Input cards take `rounded-2xl`, output surfaces `rounded-md`.
- Motion: colour and opacity transitions only, 150 ms (Tailwind's `transition-colors` default). None under `prefers-reduced-motion`: `index.css` sets Tailwind's default duration to 0 s there. A `duration-*` class would override that, so none is used. No new animation.

## Charts

For Recharts, first in `s3-09`:

- series in persona colours; everything else in `foreground` or `muted-foreground`;
- grid lines in `border`; axis ticks 14 px mono;
- no gradients, no fills under lines, no 3D;
- a boundary value is a labelled vertical rule.

## A persona colour, per register

- **Input** (the personas screen sets the pattern): a `rounded-2xl` card with a 4 px top border in the persona colour, the avatar drawing its own disc in the persona's colours, the name in `text-3xl font-extrabold` in the foreground colour. No tinted panel behind the avatar or the text.
- **Output**: rows and headers stay monochrome. The persona shows as a 4 px stripe or a dot beside its name, and as its series in a chart. Nothing else on the screen takes its hue.

## Checked by

`pnpm --filter @wayford/web check:self` runs the filter's own `collect` on every listed screen at 1280 × 720, served its io from fixtures. It also runs inside `pnpm test`.

It covers only what the filter measures: headings, paragraphs, list items and controls. A control carries its own label's text, and a list item covers what sits inside it, which is how the personas cards are checked. Text in a table cell, a `div` or a `span` outside those is not measured, so a screen built from them is not checked. The output register's tables are the case to watch: build each row's text as a measured block, or check it by hand.

It fails on:

- measured text under 4.5:1 or 14 px;
- a control under 24 px;
- text whose contrast cannot be measured, such as text over a background image;
- an `/api` request the screen's list does not answer.

A design task adds its screens to the list, with their io responses.
