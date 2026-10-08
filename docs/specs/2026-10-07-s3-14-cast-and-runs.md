# s3-14 — Cast and Runs redesigned, Recharts out: spec

Task: `tasks/s3-14-cast-and-runs.md` · Branch: `feature/s3-14-cast-and-runs` · Date: 2026-10-07
Status: approved 2026-10-07 (auto)

## Goal

Cast shows the five personas as a lineup over a capability matrix, Runs is one archive table, and Recharts leaves the app with the per-task bar charts.

## Constraints that bind

- `AGENTS.md`: a persona is a filter, not a prompt; a profile carries a bare name and a one-line description; provenance on every threshold, and `folk`/`llm` said out loud. No job title, no diagnosis, none of `docs/DEMO.md`'s banned words.
- `docs/DESIGN.md`: `persona-*` colours mean who, `signal` marks only a measurement line (the gauge post); line style means certainty (dotted is soft, `folk`/`llm`); `mono` for everything that reproduces; no text under 16 px, no target under 32 px, text at 4.5:1; `radius-lg` and `shadow-raised` for the cast only; loading is a skeleton, empty is the EmptyState shape, fault is a fault banner with the message in mono and "Try again"; text in a table cell sits in a measured block (`<p>`) so `check:self` measures it. Outcomes in the fixed words (`outcome-words.ts`); a screen that holds a run's record names the limit.
- `docs/design/screens/cast.html` is the picture to match.
- `docs/RULES.md`, "Persona composition" and K1: a pattern in neither list is known, so patterns known is 12 − `unknownPatterns.length`.
- Task constraints: lineup (name in `display-l`, description clamped to 3 lines with the full text on hover and in the CastCard, device, Ada's `control` tag); matrix rows P1, P3, P4, A1, M1, B3, K1 (12 pips), K2, values in mono, tag and mini gauge on the three thresholds only, `—` for what a persona does not set, a column click opens the Lens; Runs as one table with persona chip, goal, outcome, seed, duration, steps, cost, run id, mono numbers, filters as segmented chips held in the URL as today; the per-task summary and its bar charts go; Recharts leaves `package.json`; both screens in `check:self`, both themes.
- Out of scope: the profile builder; any chart on Runs.
- `docs/STACK.md`: no new dependency. Radix `HoverCard` comes with `radix-ui`, already a dependency.

## Design

### The dimension model: `packages/web/src/cast/dimensions.ts`

One pure function shared by the matrix and the CastCard, so both read a profile the same way.

```ts
import { constraintCount, type Profile, type ProvenanceId, type RuleId, UI_PATTERNS } from "@wayford/core";

export type DimensionKey =
  | "contrast" | "fontPx" | "targetPx"   // P1, P3, P4: perception thresholds
  | "attention" | "memory" | "patience"  // A1, M1, B3
  | "patterns" | "vocabulary";           // K1, K2

export type Dimension = {
  key: DimensionKey;
  label: string;           // "Contrast", "Font size", "Target size", "Attention", "Memory", "Patience", "Patterns", "Vocabulary"
  rule: RuleId;            // "P1" | "P3" | "P4" | "A1" | "M1" | "B3" | "K1" | "K2"
  /** The value as the screen sets it, in mono; undefined when the persona does not set it. */
  value: string | undefined;
  /** The threshold's source: on P1, P3 and P4 alone, and only when set. */
  provenance?: ProvenanceId;
  /** Where the threshold sits on its ruler, 0 to 1: on P1, P3 and P4 alone, when set. */
  gauge?: number;
  /** The threshold's softness, when above 0: on P1, P3 and P4 alone. The CastCard shows it. */
  softness?: number;
  /** K1 alone: how many of the 12 patterns the persona knows. */
  known?: number;
};

export const PATTERN_COUNT = UI_PATTERNS.length; // 12
export function castDimensions(profile: Profile): Dimension[];
/** The control persona: nothing switched on, dice and vocabulary included. */
export function isControl(profile: Profile): boolean;
```

Readings, in matrix order:

| Key | Rule | Read from | Value | Unset |
|---|---|---|---|---|
| contrast | P1 | `perception.contrast` | `3.0:1` (one decimal) | `—` |
| fontPx | P3 | `perception.fontPx` | `16 px` | `—` |
| targetPx | P4 | `perception.targetPx` | `44 px` | `—` |
| attention | A1 | `behaviour.maxElements` | `11 items` (`count`) | `—` |
| memory | M1 | `behaviour.memorySteps` | `2 steps` (`count`) | `—` |
| patience | B3 | `behaviour.budgetSeconds` | `120 s` | never: required |
| patterns | K1 | `knowledge.unknownPatterns`, counted as a set (the schema allows a repeat) | `9`, `known: 9` | never: both lists are required |
| vocabulary | K2 | `knowledge.domainVocabulary` | `15 words` (`count`) | `—` |

The gauge rulers are the reference's: contrast 1 to 7, font 8 to 24 px, target 16 to 48 px, a value clamped to the ruler.

`isControl` marks the control persona (Ada), read from the profile, not its id. It holds when every one of these is off:

- `constraintCount(profile) === 0`: no threshold, no cap, no unknown pattern;
- `knowledge.domainVocabulary` absent: no K2;
- `behaviour.doubleClick` and `scrollWhenStuck` absent: no B1 or B2 dice.

### The CastCard: `packages/web/src/components/cast-card.tsx`

- `DimensionValue({ dimension })`: one cell's content, used by the matrix and the card alike.
  - Unset: `<p class="mono text-ink-3"><span aria-hidden>—</span><span class="sr-only">not set</span></p>`.
  - Set: `<p class="mono text-ink">value</p>`, then for a threshold its provenance tag in a `<p>` of its own, so `check:self` measures it (`collect` measures headings, paragraphs and list items only), and its mini gauge; for K1 its 12 pips.
  - Every cell keeps `space-3` of inline-end padding, so a tag pushed right and a full-width gauge stop short of the next column, as the reference's `column-gap` does.
  - The matrix tag reads the bare id: `wcag22` solid, `folk`/`llm` dotted (`Tag variant="soft"`). The footer legend says what dotted means, as the reference draws it. The card has room and uses `ProvenanceTag`, which adds "· no source".
  - Mini gauge: a 4 px track on `paper-sunken`, the persona's fill (`--p`) to the value, a 3 × 10 px `signal` post at it, `aria-hidden` (the value beside it says the number).
  - Pips: 12 marks of 6 × 16 px, the first `known` filled with `--p`, the rest hollow on `line-strong`, `aria-hidden`.
- `CastCard({ profile })`: the persona's spec sheet, `docs/design/components.html` "CastCard".
  - An `<article>` on `surface` with a `line` hairline, `radius-lg`, `shadow-raised`, 448 px wide.
  - Its root sets the persona's slot style itself, `slotStyle(slotOf(profile.id))`: the hover card renders in a portal under `<body>`, outside the column that sets `--p`, and its gauges and pips fill from `--p`.
  - Its head holds the avatar (96 px tile), the name in `display-l` (an `<h2 id="cast-card-<id>">`, apart from the column's `cast-<id>`), the `control` tag for the control persona, the full description unclamped, and the device.
  - Its plate is a `<dl>` of every `castDimensions` row: label and rule as `<dt>`, each text in a `<p>`; `DimensionValue` as `<dd>`, with the softness after a soft threshold (`soft 0.5`, mono, ink-3), as today's card shows it; patterns with `/12` after the count, as drawn.

### Cast: `packages/web/src/screens/personas.tsx` (route `/cast`, file kept)

A column-major grid, so a persona's column is one element and one click target:

```
<div grid; columns 168px + repeat(n, minmax(0,1fr)); rows auto + repeat(8, minmax(40px, auto))>
  <div row-span-full subgrid>        lead column: h1 "01 · the cast", one line of body; then 8 row labels, each a <p> "Contrast" and a <p> "P1"
  <section × n row-span-full subgrid, slot style, aria-labelledby="cast-<id>">
    <Link to="/lens" search={{ persona: id }}>  wraps the tile; after:absolute after:inset-0 stretches it over the column
      <HoverCard.Trigger asChild><div relative z-1>  avatar 84, name (h2 id="cast-<id>", display-l) + control tag, description (<p> body, line-clamp-3), device (<p> mono-label ink-3)
    <dl class="contents"> 8 × <div cell><dt sr-only>Contrast, P1</dt><dd><DimensionValue/></dd></div>
  </section>
</div>
<footer legend> each item a <p>: solid "sourced threshold", dotted "folk · no source", "— not set", signal post "threshold"; right: "5 personas · fixtures · core/src/fixtures/profiles" in mono
```

- **The column is one link.** The tile is a `<Link>` whose `::after` covers its whole column. The column itself is `relative`. So a click anywhere in the column opens `/lens?persona=<id>`.
  - The link is named by the persona's `<h2>` and a visually hidden "open in the Lens" (`aria-labelledby`), and described by the description (`aria-describedby`). A screen reader hears "Vera, open in the Lens", not the whole tile.
  - The column takes `surface` on hover (`has-[a:hover]`), and the focus ring on `has-[a:focus-visible]`, `radius-lg`.
- **The hover card.** Radix `HoverCard` (open delay 500 ms) shows the CastCard beside the tile: `side="right"`, `align="start"`, flipped by collision for the last columns.
  - Its trigger is the tile's content box, a `<div>` through `asChild` (Radix's default trigger is an `<a>`, which would nest a link in a link), raised above the link's `::after` (`relative z-1`). Hovering the matrix cells, which only the `::after` covers, does not open it.
  - The full description also stays in the DOM under the clamp, so a screen reader reads it whole. Keyboard focus on the link opens the card too (changed in the build, see the decision log).
- **Row lines.** Each cell and row label draws its own bottom hairline (`line`), the first row's top `line-strong`. The columns have no gap, so the lines run unbroken as drawn; each cell's inline-end padding keeps the reference's gap for its content.
- **No data states.** The personas are bundled, so the screen fetches nothing and has no loading, empty or fault state.

### Runs: `packages/web/src/screens/runs.tsx` (route `/runs`, `RunsSearch` unchanged)

```
<header> h1 "Runs" (display-l) · "<shown> of <total> runs" (mono, ink-2)
<TopBarSlot><SourceBadge source="stored"/></TopBarSlot>   once io answered: every listed run is stored
<filters> three labelled rows of segment links: Task · Persona · Outcome
<table> Persona | Goal | Outcome | Seed | Duration | Steps | Cost | Run
```

- **Filters as links**, each `SEGMENT_GROUP` (with `flex-wrap`) of `<Link to="/runs" search={...}>` in `segmentItem()`. Links keep a filter a place: a click pushes a history entry, as today.
  - "All" first, which drops the key. The picked chip carries `aria-current="page"` through `activeOptions={{ exact: true }}`, search included, as the report's `EXACT` does.
  - Each group is `role="group"`, labelled by its visible label (`<p>`).
  - Options keep today's `filterOptions` rule: listed first, then ids the runs carry that nothing lists, sorted, then the URL's own value when nothing holds it. That value is still shown picked.
  - **Task:** the tasks the runs carry, labelled by their goal from `GET /tasks` in io's order; a task io does not list reads as its id in mono. A stored task with no run is left out: its chip would open an empty table. Today's select lists it.
  - **Persona:** the five bundled personas as `PersonaChip`s, then any other id in mono.
  - **Outcome:** `RUN_OUTCOMES` in core's order, in `OUTCOME_WORDS`: Got through, Gave up, Over budget, Error. A filter holds only the outcome, so the clock and the step cap stay "Over budget".
- **The table** keeps every cell's text in a `<p>`, headers included.
  - Persona: `PersonaName`.
  - Goal: a link to `/report/$taskId`, the goal or the id in mono. This is s3-08's link from each task to its report, kept now that the per-task sections go.
  - Outcome: `<Outcome kind={outcomeKind(run.outcome, run.limit)}/>`. The row holds the run's record, so a budget run names its limit.
  - Seed, duration (`formatSeconds`), steps and cost (`usd`) right-aligned in mono.
  - Run id: a mono link to `/runs/$runId`.
  - Links are `inline-flex min-h-(--target-min)`. The table sits in `overflow-x-auto`.
- **States:**
  - Loading: a skeleton of the filters and eight rows, with an sr-only status line.
  - io down and no runs held: a fault banner, "The runs could not be read from io." plus the message in mono, and "Try again" (refetch). With runs held, the banner sits above the table.
  - No run stored: `EmptyState`, label `no runs stored`, sentence "No runs stored yet.", line "A run is stored when it ends. Start a race, or seed the demo data with pnpm seed:demo.", action a link to `/race`, "Start a race", in the outline button look.
  - Filters keep no run: the filters stay, and in place of the table "No run matches these filters." with a link "Show every run" to `/runs`.
  - Goals are labels only: without `GET /tasks`, a task reads as its id, as today.

### What goes, what moves

- `runs/task-results.tsx` is deleted with `TaskResults`, its charts and its table.
  - `PersonaName` and `personaLabel` move to `components/persona-avatar.tsx`, beside `PersonaChip`, which `PersonaName` wraps. s3-08 listed this move as a follow-up.
  - `formatSeconds` moves to `runs/step-replay.tsx`, beside `usd`.
  - The nine files that import any of them change one import line each.
- `runs/stats.ts` and `stats.test.ts` are deleted: `TaskResults` was their only user.
- Recharts leaves `packages/web/package.json` and `pnpm-lock.yaml` (`pnpm --filter @wayford/web remove recharts`).

### check:self (`packages/web/scripts/self-check.ts`)

- `cast`: `ready` becomes the new `<h1>` and the matrix, `role=heading[level=1][name="01 · the cast"]`; `responses: {}`.
- `cast-card`, new: the Cast with Vera's hover card open. `act` hovers her tile, `ready` is the card's heading (`#cast-card-prof_vera`), so the card is measured in both themes, portal and all.
- `runs`, new:
  - `path: "/runs"`;
  - `ready`: the stored badge in the top bar, and a body row in `main`'s table, as `BOUNDARY_READY` is built;
  - `responses: { "/runs": fixtureRuns, "/tasks": taskFixtures }`.
- Both themes come from `SELF_CHECK_THEMES`, as for every listed screen.

## Files

| File | Why |
|---|---|
| `packages/web/src/cast/dimensions.ts`, `dimensions.test.ts` | New. The dimension model the matrix and the CastCard share. A folder of its own, as `report/` and `boundary/` hold their screen's logic; not in the task's list because the task names no home for it |
| `packages/web/src/components/cast-card.tsx`, `cast-card.test.tsx` | New. CastCard and `DimensionValue` |
| `packages/web/src/components/persona-avatar.tsx`, its test | Gains `PersonaName` and `personaLabel` |
| `packages/web/src/screens/personas.tsx`, `personas.test.tsx` | The Cast rebuilt; tests rewritten |
| `packages/web/src/screens/runs.tsx`, `runs.test.tsx` | The Runs table rebuilt; tests rewritten |
| `packages/web/src/runs/task-results.tsx` | Deleted |
| `packages/web/src/runs/stats.ts`, `stats.test.ts` | Deleted, no user left |
| `packages/web/src/runs/step-replay.tsx` | Gains `formatSeconds`; its own import of `personaLabel` changes |
| `packages/web/src/runs/filter.ts`, `fixture-runs.ts` | Doc comments that name the per-task stats |
| `packages/web/package.json`, `pnpm-lock.yaml` | Recharts out |
| `packages/web/scripts/self-check.ts` | Cast's `ready`, the hover-card entry, the Runs entry. Outside the list: the task asks for both screens in `check:self` |
| `docs/PLAN.md` (F7 AC2) | One clause: per task, success and median time per persona now live on the Report's cast table, which each goal on Runs links to |
| `packages/web/src/router.test.tsx` | Its `/cast` test counts the old cards. Outside the list, a test of the screen |
| `packages/web/src/boundary/sweep-view.tsx`, `screens/boundary.tsx`, `screens/report.tsx`, `screens/run-detail.tsx`, `components/finding.tsx`, `report/findings.tsx`, `report/cast-table.tsx`, `arena/history.tsx` | One import line each, for the moved helpers. Outside the list, since the file they came from goes. No open task owns any of them |
| `docs/STACK.md` (Charts row), `docs/DESIGN.md` ("Charts", last paragraph) | The sentence saying Recharts stays until s3-14. DESIGN's "Until `s3-14` is taken…" sentence under "Screens" goes too, unless PR #208, which inserts a row right above it, is still open at the PR step; then it is a follow-up named in the PR |
| `tasks/s3-14-cast-and-runs.md`, `tasks/BOARD.md` | Boxes with evidence, the Outcome; the row to `review` in the PR |

## Acceptance mapping

| Acceptance box | Proven by |
|---|---|
| web tests: the matrix shows `—` for a dimension a persona does not set | `dimensions.test.ts` "a dimension the persona does not set has no value"; `personas.test.tsx` "the matrix reads — where a persona sets nothing" (Ada P1, Milo P1, Vera K2) |
| web tests: a `folk` threshold shows the soft tag, and no non-threshold row has a tag | `dimensions.test.ts` "only the three thresholds carry a provenance"; `personas.test.tsx` "Vera's target size carries the dotted folk tag, and no other row carries a tag" |
| web tests: Vera's patterns read 9 | `dimensions.test.ts` "patterns known is 12 less the unknown"; `personas.test.tsx` "Vera's patterns read 9, with 9 of 12 pips on" |
| web tests: a runs row links to its run detail | `runs.test.tsx` "each row's run id links to its run detail" |
| `check:self` passes with Cast and Runs listed, in both themes | `pnpm --filter @wayford/web check:self` output; `self-check.browser.test.ts` runs every listed screen in both themes under `pnpm test` |
| `rg -n "recharts" packages/web` prints nothing | the command |
| The PR shows Cast and Runs at 1280 × 720 beside `cast.html` | screenshots from the browser pane against `pnpm dev`, on an assets branch linked from the PR |
| `pnpm lint`, `pnpm typecheck`, `pnpm test` pass | the commands |

Further tests:

- the lineup clamps the description and the CastCard holds it whole;
- Ada alone carries `control`;
- each column links to `/lens?persona=<id>`;
- filter chips: hrefs, "All" drops the key, the picked chip is `aria-current`, a URL value no option holds is added and picked;
- outcome words name the limit in the table and stay "Over budget" in the filter;
- the goal links to its report;
- the empty, filtered-empty, loading and fault states.

## Decision log

| Question | Taken | Why |
|---|---|---|
| Rename `personas.tsx` to `cast.tsx`? | Keep the file and `personasRoute` | The route is already `/cast`; a rename touches `router.tsx`, which open PR #208 also edits |
| Gauge ruler per threshold | The reference's: contrast 1–7, font 8–24 px, target 16–48 px | `cast.html` is the picture to match and its gauges are drawn on these; the Lens's rulers (font to 32, target to 56) would leave Zoya, the far end, short of the end |
| Tag text in the matrix | Bare id, dotted for `folk`/`llm`; the legend says "folk · no source" | As drawn: "folk · no source" does not fit a 190 px cell beside the value. The CastCard has room and says it in full |
| Which persona is the control | `isControl`: `constraintCount` 0, no vocabulary, no B1 or B2 dice | Read from the profile, not from an id. `constraintCount` alone counts thresholds, caps and unknown patterns, not K2 or the dice |
| Softness | Shown on the CastCard (`soft 0.5`), not in the matrix | The reference's matrix has no room for it; the card is the full spec sheet, and today's card shows it |
| Where F7 AC2 lives once the per-task results go | The Report's cast table: got through k/n and median time per persona, reached from each goal on Runs; PLAN's AC2 says so | The task removes the per-task summary and points to s3-08's report link. The report counts the latest run per persona and seed, not every run, which the clause says |
| Where the CastCard appears | A hover card on the lineup tile (Radix HoverCard) | DESIGN builds it here "where a persona is shown alone", and the task puts the full description in it. On the Cast that place is hovering one persona. It is no new dependency |
| `title` on the clamped description too? | No | The hover card is the hover; a native tooltip on top would show the same text twice |
| How a whole column is one click | The tile link's `::after` stretched over a column-major subgrid | One link per persona, named by its tile; the cells stay plain text a screen reader reads. 40 cell links would be 40 tab stops |
| Matrix semantics | Each persona a `<section>` with a `<dl>` of sr-only `<dt>` and `<dd>` | Column-major DOM rules out a real `<table>`; a definition list per persona reads as "Contrast, P1: 3.0:1, wcag22" |
| Filters: SegmentedControl buttons or links? | Links in the segment look (`SEGMENT_GROUP`, `segmentItem`) | A filter is a place: a link pushes history without a handler, and a static render shows each href. `segment-control.tsx` exports the look for exactly this |
| Task chips: every stored task or only those with runs? | Those the runs carry, plus the URL's | A stored task with no run would open an empty table; any-target tasks multiply the stored ones |
| Outcome words in the filter | `OUTCOME_WORDS`, "Over budget" for `budget_exceeded` | DESIGN, "Copy": a view that holds only the outcome says Over budget; the table names the limit |
| The report link per task | The goal cell links to `/report/$taskId` | s3-08 gave each task on the runs screen a link to its report; the per-task headers that held it go |
| Moved helpers | `PersonaName`, `personaLabel` to `components/persona-avatar.tsx`; `formatSeconds` beside `usd` in `runs/step-replay.tsx` | `task-results.tsx` would otherwise survive with no task results in it; s3-08 flagged the `PersonaName` move |
| Source badge on Runs | `stored`, once io answered | DESIGN, Principle 6: every run io lists is stored. No backend tag: the archive spans backends |
| Description style | `body` (16/24), not `lead` (18/28) | The reference draws 16 px, and three lines of `lead` would push the legend past 720 px |
| Runs' `<h1>` | "Runs" in `display-l` | DESIGN: screen titles take `display-l` |
| Cast's `<h1>` | "01 · the cast", in `mono-label` | The reference draws no title, only this label; making it the heading keeps one heading without a new title |
| Keyboard focus and the card (build) | Focus on a column's link opens its card, blur closes it (`open` held in the column) | The branch review found a sighted keyboard user could never read the clamped description. Six lines in a tool about accessibility |
| Stale comments (build) | io's `analyst-runs.ts` and `analyst-text.ts`, and the report's `cast-table.tsx`, stop citing the deleted `stats.ts` and the runs screen's counts | Comment-only edits outside the list, so no comment points at code this branch deletes |
| Which persona is the control (review) | `constraintCount(profile) === 0` in `ControlTag`; `isControl` went | `isControl` said "nothing switched on" but read neither the device (V1) nor the emulation (P6). Core documents the count as enough to tell the control, and the builder that could make another profile is cut |
| Focus that opens the card (review) | Keyboard focus only (`:focus-visible`) | A mouse press focuses the link too, so a middle click, which opens the Lens in a new tab, left the card open over the matrix. `scripts/cast.browser.test.ts` checks it with the column click and Tab |
| A contrast threshold's value (review) | A whole ratio in one decimal, `3.0:1`; any other as written | `toFixed(1)` would read 4.45 as 4.5:1, rounding a threshold up |
| The rows' order (review) | One list of key, label and rule; `READINGS` stays a record keyed by `DimensionKey` | Fewer names than four structures. Folding each row's reading into the list too would have been longer, since a row with its function wraps over six lines |
| F7 AC2 wording (review) | PLAN and the Runs comment say the cast table exists once the task has a report, an Analyst run | The table is drawn from a stored report, which only an Analyst run stores, over the latest run per persona and seed |
| Legend and lead line (review) | The legend's dotted line reads "folk / llm · no source"; the lead adds "A threshold cites its source; every other number is folk." | `llm` draws the dotted tag as `folk` does. Only a threshold carries a source in the profile, but `docs/RULES.md` calls every other number folk, and the report's basis does too (io's `provenanceOf`), so the Cast says it once rather than let an untagged cell imply a source. Both fit 1280 × 720 in both themes |

## Risks

- **Height.** The lineup plus eight rows plus the legend is about 710 px of 720. A description or a tag that wraps one more line pushes the legend off. Checked at 1280 × 720 in both themes before the screenshots.
- **Subgrid and `display: contents` on `<dl>`.** Chromium supports both. A `dl` under `display: contents` has had accessibility bugs in older browsers; the check runs in current Chromium.
- **The hover card in Night.** The portal renders under `<body>`, and `data-theme` sits on `<html>`, so the tokens hold.
- **Merge with PR #208.** Both edit `self-check.ts`'s screen list; a conflict there is two appended entries.

## Review note

Round 1 (`spec-reviewer`): ready after fixes, no blocking finding. Every should finding is fixed:

- the CastCard sets its own slot style, since the hover card renders in a portal;
- cells keep inline-end padding, so tags and gauges stop short of the next column;
- every text on the Cast sits in a `<p>`, so `check:self` measures it;
- a `cast-card` entry measures the open card in both themes;
- PLAN's F7 AC2 points at the Report's cast table;
- the column link is named "<name>, open in the Lens" and described by the description.

The nits are fixed as well:

- the trigger is a `<div>` through `asChild`;
- `count()` sets items and words;
- unknown patterns are counted as a set;
- softness shows on the CastCard;
- `isControl` says exactly what it counts;
- the card's heading id is apart from the column's;
- DESIGN's stale sentence is handled at the PR step.
