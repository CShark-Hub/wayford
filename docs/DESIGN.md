# Wayford — DESIGN

One page, approved on 2026-10-06 (`docs/adr/0002-daylight-instrument-redesign.md`). It replaces the direction `s3-07` set. Every screen task follows it. If a screen needs something this page does not give, change this page first, in its own PR.

**The reference is drawn, not only described.** `docs/design/` holds the system as files:

- `tokens.css` is the source of every value: colours for Daylight and Night, type, spacing, radii, layout, strokes and shadows, as CSS variables. The app's token block is copied from it. This page names tokens and says what they are for; it does not repeat their values.
- `components.css` renders the components from those variables.
- `components.html` draws every component.
- `screens/*.html` draw the six screens at 1280 × 720 with the core fixtures:
  - the profiles;
  - the `task_past-order` report, extended from its three seeds to the ten that `seed:demo` runs;
  - the `swp_vera-contrast` sweep;
  - the decision record.

Open them in a browser. To see Night, set `data-theme="dark"` on `<html>`. The files are a picture to match, not code to import. The app builds the same look in its own stack (see "In code").

## The direction

A daylight measuring instrument with a cast:

- **The chrome:** a calm, warm paper instrument.
- **The cast:** the five personas, the only playful thing on it.
- **The orange line:** one orange marks every place Wayford measured something.

The name gives the metaphor. A ford has a depth gauge, the water is the same for everyone, and who gets across depends on who is crossing. So thresholds are gauges with a post, the boundary is a post on a chart, and the race ends at a goal post.

## Principles

1. **Show the filter.** A persona is a filter in code, so the screen draws the filter's decisions:
   - visible: as the page drew it;
   - degraded: hatched, with the masked name;
   - removed: gone, or in Evidence a dashed `signal` outline with its rule.

   A blur never stands in for a decision.
2. **Colour means who. Orange means the line.**
   - `persona-*` colours identify personas and nothing else.
   - `signal` marks only a measurement line: a threshold post, a softness band, a cut, the boundary, the Jev draw needle, a click point, and the focus ring.
   - Everything else is ink on paper. Primary buttons are ink, never orange.
3. **Line style means certainty.** The same rule holds in findings, readouts, charts and seed cells, and colour never carries certainty:
   - solid is measured;
   - solid with end ticks is deterministic;
   - dashed is a hypothesis;
   - dotted is soft, a basis with `folk` or `llm`.
4. **Every number opens its evidence.**
   - Numbers are k/n in `mono`, never a bare percentage.
   - Route open and got through are always two numbers, never one score, and no sentence turns one into the other. The boundary is a got-through number, so it is never "where the route closes".
   - A seed cell, a readout and an evidence link each link to the run behind them; an evidence link lands on the earliest step the finding cites in that run.
   - No evidence, no finding.
5. **Wayford passes its own cast.** The floors come from Vera's fixture thresholds:
   - no text under 16 px;
   - no target under 32 px;
   - text at 4.5:1 or more on its ground.

   Run through Vera's perception rules, Wayford's own screens lose nothing. They use none of the patterns she does not know: no hamburger, no kebab menu, no breadcrumb.
6. **Claim less.**
   - Where a screen's data can be live or stored, the screen says which, in the page beside that data, taken from it, never hard-coded:
     - the Race carries a source badge in its header, `live` while its streams are open, `stored` on a race read back from io;
     - the Lens says it in the stage: its `Live:` line under the drawn page when io answered, and when it did not, a stored banner on a target-app page or a fault banner on a page opened by URL.
   - A screen whose data can only be stored (Run detail, Runs, Report, Boundary) carries no source badge: a badge that never changes reads as a status of the whole app.
   - The backend a run, report or sweep was on is a word in its own meta line or facts, not a badge. A run that stopped before its first planned action names none: its record cannot tell Jev from the LLM.
   - Narration is marked as written after the fact. On run detail its heading reads `narration · after the fact`. In the Race's bubble there is no visible label: its outline is dashed (Principle 3), and a visually hidden "Narration, written after the action:" comes before the words (#236).
   - Jev's confidence is labelled as the model's.

## Screens

| Route | Name | Was | Job | Reference | Task |
|---|---|---|---|---|---|
| `/cast` | Cast | Personas | Who crosses: a lineup over a capability matrix | `screens/cast.html` | `s3-14` (optional) |
| `/lens` | Lens | Preview | The hero: the page as the persona's filter leaves it. Demo beats 1–3 | `screens/lens.html` | `s3-11` |
| `/race` | Race | Arena | Three to five personas live on one goal. Beat 4. Each race keeps its URL, `/race/$raceId`, and the History under the start panel lists them all (issue #194) | `screens/race.html` | `s3-12` |
| `/report/$taskId` | Report | — | Ten seeds, two numbers, findings by certainty. Beat 5 | `screens/report.html` | `s3-08` |
| `/runs/$runId` | Run detail | Run detail | One run step by step: screenshot beside what the model read | `screens/run-detail.html` | `s3-12` |
| `/boundary` | Boundary | Sweep | The first threshold where fewer than half of a persona's runs get through. Beat 6 | `screens/boundary.html` | `s3-09` |
| `/runs` | Runs | Runs | The archive table, off the story path | — | `s3-14` (optional) |
| `/target` | Target | — | A site and a goal of your own in, every story screen on it out (`docs/adr/0003-any-target.md`, D6). Leads the nav as `00` and sets the current target (D11, D12) | — | `s3-15`, `s3-17` |

`/` redirects to `/cast`. `/events`, the m0-07 debug screen, keeps its route and leaves the nav.

The main moment of each story screen fits 1280 × 720 with no scroll:

- the Lens stage with its gauges;
- three race lanes;
- the report's cast table with the findings' headers;
- the boundary chart with its headline.

## Colour

Two themes from one token set:

- **Daylight** (`light`) is the default. A projector lifts blacks and flattens dark greys, while ink on paper holds in a lit room.
- **Night** (`dark`) is a full theme, not an inversion.

The app follows the system preference until someone flips the one Daylight/Night toggle in the top bar. After that, the choice is stored per browser. There is no theme menu.

| Token | Use |
|---|---|
| `paper` | Page ground. |
| `paper-sunken` | Wells: the Lens stage, table header rows, the gauge track, skeletons. |
| `surface` | Anything raised: cast cards, findings, race lanes, popovers. |
| `ink` | Primary text, headings, readouts, the primary button's fill, narration in its bubble, on the Race and run detail. |
| `ink-2` | Secondary text: descriptions, table cells that are not the key value. |
| `ink-3` | Meta text: captions, units, axis titles. Never a number that is evidence. |
| `line` | Hairlines that only decorate: panel edges, table rules, chart grid. |
| `line-strong` | Anything that must be seen to be used: control borders, seed cells, gauge ticks, a removed element's outline. |
| `signal` | The measurement line, as a mark (see Principle 2). Never a paragraph's ground. |
| `signal-ink` | Signal as text, and the focus ring: rule ids that fired, the boundary value. |
| `on-signal` | Text on a `signal` fill, such as the boundary flag. |
| `signal-soft` | The softness band behind a threshold post. |
| `focus-ring` | Keyboard focus: a 2 px paper gap, then a solid 2 px ring. |
| `fault`, `fault-soft` | System failures only: a crashed run, io down, a refused request. A persona that gave up is a result, not a fault. |
| `avatar-line`, `avatar-head`, `avatar-tile` | Inside an avatar. The same in both themes, so the avatar reads like a sticker in Night. |

Contrast, checked for every pair in both themes:

- `ink`, `ink-2`, `ink-3`, `signal-ink`, `fault` and each `persona-*-ink` hold 4.5:1 or more on `paper`, `paper-sunken` and `surface`;
- `line-strong`, `signal` and each `persona-*` fill hold 3:1 or more there.

Text is set only in those text tokens.

**Persona slots.** A persona owns a slot, not a hex. It has three tokens:

- `persona-<slot>`, the fill: series, dots, the lane track, the avatar body, a slider fill, the outline and tail of a narration bubble, on a race lane and on run detail.
- `persona-<slot>-ink`, its name set in colour.
- `persona-<slot>-soft`, the tint behind its avatar.

| Slot | Persona | Why |
|---|---|---|
| `graphite` | Ada | The control: a neutral grey says so without a word. |
| `cobalt` | Vera | Opposite the orange, so her threshold post reads on her own gauge. |
| `raspberry` | Kai | |
| `jade` | Milo | |
| `violet` | Zoya | |

The hackathon's personas are the five fixtures. Any other profile takes one neutral fallback: `ink-3` for the fill, `ink-2` for the text and `paper-sunken` for the tint.

A persona colour is never behind body text, never a status, and never blended with another persona's. The persona's name is always beside it.

## Type

There are three families, each with one job:

- **Bricolage Grotesque** (`display`) for persona names, screen titles and the one big number on a screen.
- **Geist** (`sans`) for interface text.
- **Geist Mono** (`mono`) for everything that reproduces: seeds, run ids, rule ids, thresholds, URLs, costs, the model's observation text and the readouts.

Mono figures are tabular with a slashed zero. The scale, whose values are in `tokens.css`:

| Style | Family | Use |
|---|---|---|
| `display-xl` | display | One per screen at most: the boundary value, the goal sentence on the report. |
| `display-l` | display | Persona names on the Cast and the Lens rail; screen titles. |
| `display-m` | display | Section titles, persona names in race lanes. |
| `title` | sans | Panel and card titles. |
| `lead` | sans | Goal sentences, persona descriptions, the one-line lead under a screen title. |
| `body` | sans | Everything else, at 16 px: the floor. |
| `label` | sans | Buttons, tabs, form labels, table headers. |
| `readout` | mono | The two numbers per persona, elapsed time in the race, the run header id. |
| `mono` | mono | Anything that reproduces. |
| `mono-label` | mono | Instrument labels, lowercase, with a middle dot between the measure and its source: `contrast · wcag22`. |

Rules:

- No text under 16 px, chart ticks included. There is no caption size.
- No arbitrary sizes (`text-[…]`).
- Paragraphs stop at 68 characters. Headings use `text-wrap: balance`, paragraphs `text-wrap: pretty`.

## Space, shape and layout

The spacing steps (`space-1` to `space-9`, a 4 px grid), radii, layout sizes (`header-h`, `rail-w`, `content-max`, `control-h`, `target-min`), strokes, z-index and shadows are all in `tokens.css`.

- **One top bar:** `header-h`, with a hairline under it.
  - Wordmark left.
  - The story nav in the middle, numbered in mono: `00 Target`, `01 Cast`, `02 Lens`, `03 Race`, `04 Report`, `05 Boundary`. With a current target set, `00 Target` names its host, and Target, Lens, Race and Report lead to it (`docs/adr/0003-any-target.md`, D11–D13).
  - `Runs` apart on the right, then the settings gear, then the theme toggle. The bar is the same on every screen: nothing in it comes from a screen's data.
  - The gear opens Settings, a dialog: the Actor backend the Race screen's races run on, LLM or Jev, stored per browser. The OpenRouter key and each role's model are drawn too, read-only, each naming its variable: io reads them from `.env` until after the demo (`tasks/s3-19-settings-dialog.md`).
  - No sidebar, no command palette.
- **One page column:** `content-max`, centred, with `space-6` gutters. Rails are `rail-w`.
- **Radii by role:**
  - `radius-xs` for flags and seed cells;
  - `radius-sm` for controls;
  - `radius-md` for panels;
  - `radius-lg` for the cast only (cards and avatar tiles).
- **Hairlines, not shadows.** `shadow-raised` only on cast cards and a finished race lane, `shadow-pop` only on popovers.
- **Measuring surfaces** go only where something is measured: the Lens stage and the sweep chart. They sit on `paper-sunken` with a 16 px dot grid and four corner ticks.

## Components

Each is built once under `packages/web/src/components/` and reused. The ones several screen tasks need at once come with the foundation (`s3-13`); a component only one screen uses is built by that screen's task. `components.html` draws them all; its class names (`wf-*`) are the reference's, not a naming rule for the app.

| Component | What it is | Built in |
|---|---|---|
| TopBar | Wordmark, story nav, Target and Runs, theme toggle | `s3-13` |
| SettingsDialog | The gear in the top bar and its dialog: the Actor backend switch, the key and models read-only | `s3-19` |
| Button | Ink primary (one per view), outlined default, ghost; 40 px, never under 32 px | `s3-13` |
| PersonaAvatar, PersonaChip | The existing avatar in slot colours on a squircle tile; 12 px square and name | `s3-13` |
| SegmentedControl | Two to five sibling views; mono variant for paths and ids | `s3-13` |
| Tag | Square mono flag: provenance, rule id. `folk`/`llm` dotted with "no source" | `s3-13` |
| SourceBadge | `live` or `stored`, from the screen's own data; dashed when stored. Only in the page, beside data that can be either: the Race header | `s3-13` |
| Banner | Stored-page notice (dashed) or fault (`fault-soft`), one action | `s3-13` |
| Skeleton | Loading in the shape of the content | `s3-13` |
| Working | A job under way: the wordmark's three posts in a water line, sinking and rising in turn, beside the line that says what runs | Target |
| ThresholdGauge | A ruler: persona fill to the value, signal post at the threshold, softness band below it, provenance tag. A native range input over the drawing | `s3-11` |
| FilterStates | Visible, degraded (hatch), removed (dashed signal outline and cut flag `P1 · 2.0 < 4.5`), renamed (`[unfamiliar term]`), cut by attention (quiet flag) | `s3-11` |
| Outcome | Glyph and word: Got through, Gave up, Out of time, Hit the step cap, Over budget, Error. The three budget endings share one hourglass | `s3-12` |
| RaceLane | Avatar and name, step pips, goal post, latest screenshot, outcome, clock, narration; once the run is stored, a link to its run detail. A run too long for its track narrows every done pip alike, so all of them stay between the start and the post. The narration sits in a bubble on `paper`, under the avatar, with a tail pointing at the avatar. Its outline is dashed, a hypothesis, in the persona's fill; the tail is a caret too short to dash, in the same fill. The bubble shows the persona's words alone, with no visible label (#236); with no narration there is no bubble. The bubble costs the lane no height (#195) | `s3-12` |
| StepTimeline | 40 px step buttons, ← → moves; wasted hatched, last ringed | `s3-12` |
| JevDraw | Options laid end to end on 0–1, the rolled needle in signal, the drawn segment filled | `s3-10` |
| SeedStrip | One 32 px cell per seed: border = route open (solid) or closed (dashed), fill = got through, slash = error | `s3-08` |
| Readout | The two numbers, k/n in `readout`; got through with a dashed underline; the gap bar | `s3-08` |
| Finding | Persona chips and basis tags, title, detail, `change →`, then the evidence, lighter: one link per run, `Kai, seed 1 · Gave up`, the picked persona's first, three before "Show N more"; dashed for hypothesis, dotted for soft | `s3-08` |
| EmptyState | A label, a sentence, a line, an action | `s3-08` |
| SweepChart | Plain SVG, see "Charts" | `s3-09` |
| CastCard | One persona's spec sheet, where a persona is shown alone | `s3-14` |

## States

Every data screen has three states besides its data:

- **Loading:** a skeleton in the shape of its content. Never a spinner, never "Loading…" alone.
- **Working:** a job io runs for a while, such as a goal check, Scout, a run set or the report, draws the working posts beside the line that says what runs. The line is what a screen reader hears; the posts are hidden from it. Never a spinner. The Analyst's wait, which takes minutes, adds a line that changes every 4 s and the time so far (`AnalystWorking`, #237). Those lines are flavour, never progress: io reports none, so no line claims a stage done, a count or a share of the work. They sit outside the announcement, which says once that the Analyst runs and once that it ended; under reduced motion the first line stays.
- **Empty:** a mono label, one sentence in `display-m`, one line of body, and one action.
- **Fault:** a fault banner with the HTTP status in mono and "Try again".

The Lens's stored-page fallback is the dashed stored banner, and the page still renders.

## Motion

- Colour and opacity transitions, 160 ms ease-out, on interactive elements. A pressed button moves 1 px.
- **One choreographed moment.** When a threshold moves, each Lens element that changes state animates once, 240 ms: hatched in, or hatched to a dashed outline while its cut flag drops in. This is beat 2.
- Nothing else animates on its own except the skeleton shimmer and the working posts. Race pips append without easing. The avatars do not move.
- Under `prefers-reduced-motion`, every duration is 0.

## Charts

The sweep is the one chart in scope, drawn as plain SVG from the tokens:

- **Axes:** y is the share of seeds, fixed at 0–1, with a dotted line at 0.5. x is the sweep's values.
- **Route open:** a solid `ink` line with square points.
- **Got through:** a dashed line in the persona colour with open circles.
- **The gap:** the area between the two lines is hatched. It is the agent's own wayfinding, a hypothesis.
- **The boundary:** a `signal` post with a flag naming the value: the first value, from the laxest, where fewer than half the runs got through (`boundaryOf`).
  - The headline says that in those words, e.g. "Under half get through, first at 3:1." It names the first value only: the rate is not monotone, so a value past the boundary can climb back over half, and "from 3:1 on" would claim what the sweep did not measure.
  - With no boundary in range: no post, and "no boundary up to" the last value.
  - Where `boundaryOf` stopped at a value with an errored run: no post, and the headline names that value and the error. Nothing is claimed past it.
- **The intro:** one line before any chart or command says what a sweep is and what the boundary means (#242). It shares the top row with the axis switch, on a loaded sweep and an empty one alike. The meta line has the row under it to itself, so a minted task id fits on one line. It must stay one line at 1280 × 720: a loaded sweep has no height to give, and the Boundary's frame is already tighter than other screens' to make room for it.
- **Ticks:** 16 px mono.
- **Never:** smoothing, a fill under a line, or a gradient.

The gap bar and the seed strip are HTML, not charts.

## Icons, wordmark, avatars

- **Icons:** `lucide-react`, already installed with shadcn, at 20 px with a 1.75 stroke and `currentColor`. Every icon-only control gets an `aria-label`.
  - Wayford's own glyphs are drawn to the same stroke: outcome marks, certainty bars, step pips and the goal post.
  - No emoji anywhere.
- **Wordmark:** "Wayford" in Bricolage Grotesque 700, led by a short stack of posts: one `signal` post and two ink steps. It is drawn in CSS. There is no logo.
- **Avatars:** the procedural avatars stay as they are: seeded, with parts that follow dimensions and no face that suggests a mood or diagnosis. They are redrawn with CSS variables:
  - `--p` for the body;
  - `--p-ink` for the pattern, the tuft and the hourglass caps;
  - `avatar-line` for strokes and `avatar-head` for the face.

  They sit on a squircle tile: `persona-*-soft` in Daylight, the fixed `avatar-tile` in Night.

  In Night the tile also sets `--p-ink` to `avatar-line`. The Night inks are light: the tuft and caps would fall to about 1.4:1 on the light tile, and the pattern to about 1.4:1 on the body, so all three would fade. In `avatar-line` the tuft and caps hold about 15:1 on the tile, and the pattern about 7:1 on the body. The body keeps its persona fill, so the slot still reads.

  In Daylight the pattern stays tone on tone on the body, about 1.6:1. That is a texture, not a mark: the outline carries the shape, and the tuft and caps hold about 6:1 on the slot's tint.

## Copy

- Plain, specific English in sentence case. Buttons start with a verb: "Start the race", "Try again", "Download trace".
- No exclamation marks, no "Oops".
- Errors say what happened and what still works.
- Outcomes are fixed words: **Got through**, **Gave up**, **Out of time** (`budget_exceeded` on the clock), **Hit the step cap** (`budget_exceeded` on the step cap), **Over budget**, **Error**.
  - **Over budget** is `budget_exceeded` where the limit is not at hand: a run recorded before the limit was, and a view that holds only the outcome, such as the Report's seeds or a count of outcomes.
  - A screen that holds a run's record or its `runFinished` names the limit: run detail, the Race, the Boundary's runs. The Report's seeds hold only the outcome, so a run read there as Over budget opens as Out of time or Hit the step cap.
- The two numbers are **route open** (the filter) and **got through** (the agent).
- Rule ids, seeds, run ids, thresholds, URLs and costs are set in `mono` exactly as the code spells them. One exception: a minted run id (`run_` and a ULID, about 30 characters) reads as `run …` and its last six characters (`runLabel`, #200). The whole id is in the URL, on hover in run detail, and on run detail's copy button.
- The list under "Words we do not use" in `docs/DEMO.md` stays off every screen.

## In code

- **Tokens:** they become CSS variables in `packages/web/src/index.css`, copied from `docs/design/tokens.css`.
  - `:root, [data-theme="light"]` holds Daylight, `[data-theme="dark"]` holds Night.
  - Tailwind 4's `@theme inline` maps them to utilities.
  - shadcn's default palette goes. No colour, size, radius or shadow is written outside the token block.
- **Theme:** CSS keys on `data-theme` only, never on a media query, so no rule has two ways to turn Night on. A boot script inline in `index.html` sets `data-theme` on `<html>` before first paint:
  - the stored choice if there is one, else `prefers-color-scheme`;
  - storage access wrapped in `try`, falling back to the system preference.

  The toggle writes `data-theme` and the stored choice.
- **Fonts:** self-hosted from Fontsource, with no font CDN, so the demo works offline:
  - `@fontsource-variable/bricolage-grotesque/opsz.css` (weight and optical size);
  - `@fontsource-variable/geist`;
  - `@fontsource-variable/geist-mono`.

  They register "Bricolage Grotesque Variable", "Geist Variable" and "Geist Mono Variable", the names the `--font-*` stacks in `tokens.css` lead with.
- **Components:** shadcn and Radix stay underneath for keyboard and screen-reader behaviour, restyled from the tokens.
- **Persona slots:** a profile maps to a slot in `packages/web/src/avatar/`, the five fixtures pinned by id, anything else the fallback. The 12-hue wheel, `paletteOf` and `personaColour` go.

## Checked by

`pnpm --filter @wayford/web check:self` runs the filter's own `collect` on every listed screen at 1280 × 720, served its io from fixtures. It runs in both themes from `s3-13` on.

It fails on:

- measured text under 4.5:1 or under 16 px;
- a control under 32 px;
- text whose contrast cannot be measured;
- an `/api` request the screen's list does not answer.

Each screen task adds its screen to the list. Text in a table cell is measured only if the row is built as a measured block, so build rows that way.

**One region is excluded:** the Lens stage. It redraws the target app scaled down, and keeps the page's weak contrast on purpose, since that is what the filter measures. `s3-11` gives a listed screen an optional `exclude` selector and sets it to the stage. Everything around the stage is checked: the rail, the controls and the readout strip.
