# s3-09 — Boundary screen: spec

Task: `tasks/s3-09-sweep-screen.md` · Branch: `feature/s3-09-boundary-screen` · Date: 2026-10-06
Status: approved 2026-10-06 (auto)

## Goal

The Boundary screen shows one stored sweep. It has:

- a headline naming the boundary value;
- the two curves, route open and got through, per value;
- the boundary marker;
- the value table beside the chart, each cell opening its runs;
- a one-click switch between the two demo presets, Vera on `contrast` and Kai on `maxElements`.

## Constraints that bind

- **Two presets** (task): Vera on contrast, Kai on `maxElements`. Each opens the latest stored sweep for its persona and axis. Nothing on this screen starts a sweep.
- **Two curves, one chart** (task, `docs/DESIGN.md` "Charts"):
  - "Got through" is the success rate, the agent's: a dashed line in the persona colour, with open circles.
  - "Route open" is the route-open share, the filter's: a solid `ink` line with square points.
  - The area between them is hatched. y is fixed at 0 to 1, with a dotted line at 0.5.
  - No smoothing, no fill under a line, no gradient. Ticks are 16 px mono.
- **The boundary is a got-through number** (`boundaryOf`), never "where the route closes".
  - One `signal` post, with a flag naming its value and rate.
  - The headline is a sentence with the number in `display-xl`: "Under half get through, first at 3:1." It names the first value only, since the rate can climb back over half past it (#184).
  - With no boundary in range: no post, and the chart says "no boundary up to <last value>".
  - Where `boundaryOf` stopped at an errored value: no post. The chart and the headline name that value and the error, and claim nothing past it. Never "no boundary" there.
- **Source badge** `stored`, with `sweep.backend` as the backend tag, taken from the data (`docs/DESIGN.md` Principle 6).
- **Plain SVG** from the tokens. No chart library: `rg -n recharts packages/web/src -g '!**/runs/**'` stays empty.
- **Every number opens its evidence** (`docs/DESIGN.md` Principle 4, task): each table cell opens the runs behind it. Numbers are k/n in mono, never a bare percentage.
- **Fit:** the headline, chart and table fit 1280 × 720 with no scroll.
- **Floors:** the screen joins `check:self` and passes it in both themes: text 4.5:1 and 16 px, targets 32 px. Table text is measured only inside a measured block.
- **States** (`docs/DESIGN.md` "States"):
  - loading is a skeleton in the content's shape;
  - empty is a mono label, a `display-m` sentence, one body line and one action;
  - a fault is the fault banner with the status and "Try again".
- **Words** (`docs/DEMO.md`, "Words we do not use"): not "route closes at", not "predicts", not "can't see".
- **Ownership:** `s3-08` owns `components/**` for SeedStrip, Readout, Finding and EmptyState. This task builds nothing new in `components/`. Once `s3-08` merged, the PR review pulled `SeedCell` out of `SeedStrip` so both screens draw one cell.
- **Out of scope:**
  - starting a sweep, editing its range, or following one while it runs;
  - two sweeps on one chart;
  - any axis beyond the two.

## Design

### Data: `packages/web/src/api/sweeps.ts`

```ts
/** `GET /api/sweeps?profileId=…&axis=…`: the stored sweeps of one persona on one axis, newest first. */
export function fetchSweeps(filter: { profileId: ProfileId; axis: SweepAxis }): Promise<Sweep[]>;
/** `GET /api/sweeps/:id`, the id through `encodeURIComponent` as `runPath` does, or `null` on 404. */
export function fetchSweep(id: string): Promise<Sweep | null>;
/** Key `["sweeps", profileId, axis]`. */
export function sweepsQuery(filter: { profileId: ProfileId; axis: SweepAxis }): QueryOptions<Sweep[]>;
/** Key `["sweep", id]`. */
export function sweepQuery(id: string): QueryOptions<Sweep | null>;
```

- Both parse with core's `Sweep`. Its refinement checks the stored boundary against `boundaryOf`, so the screen can trust `sweep.boundary`.
- Both reuse `parseResponse` from `api/runs.ts`, which gains an `export`. (`s3-08` exported it first on main, so after the merge this PR no longer changes the file.) A non-OK answer rejects with io's `error`; a body that is not a sweep rejects with zod's account.
- The latest sweep is `fetchSweeps(...)[0]`, since io lists newest first. The query string is built with `URLSearchParams`.

### What a sweep says: `packages/web/src/boundary/reading.ts`

```ts
export type SweepReading =
  | { kind: "boundary"; row: SweepValue }   // the row whose value is sweep.boundary
  | { kind: "stopped"; row: SweepValue }    // no boundary, and this is the first row with an error
  | { kind: "none"; last: SweepValue }      // no boundary and no error: the last stored row
  | { kind: "empty" };                      // no value stored yet (an incomplete sweep)
export function readSweep(sweep: Sweep): SweepReading;

/** Rows the chart may draw: up to and including a stopped row, else all. */
export function claimedRows(sweep: Sweep, reading: SweepReading): SweepValue[];
/** Got through over the seed set, and route open, or null with no route table. */
export function shares(sweep: Sweep, row: SweepValue): { through: number; routeOpen: number | null };
```

- `stopped` is "`boundary` is null and some row has `errors > 0`": `boundaryOf` returns null at the first error only when no row before it was under half. So the walk is core's, not copied.
- Denominator: `sweep.seeds.length`, as `boundaryOf` counts.

### Axis copy and presets: `packages/web/src/boundary/axis.ts`

```ts
export const BOUNDARY_PRESETS = {
  contrast:    { profileId: "prof_vera", axis: "contrast" },
  maxElements: { profileId: "prof_kai",  axis: "maxElements" },
} as const satisfies Record<SweepAxis, { profileId: ProfileId; axis: SweepAxis }>;


/** Prose: "3:1", "2.5:1", "10". Chart and table: on the grid's precision, "3.0:1", "10". */
export function proseValue(axis: SweepAxis, value: number): string;
export function gridValue(sweep: Sweep, value: number, unit?: boolean): string;
/** "contrast threshold" / "attention cap"; the x-axis title; the switch label. */
export const AXIS_COPY: Record<SweepAxis, { name: string; switchLabel: string; xTitle: (persona: string) => string; unit: string }>;
/** "seeds 1–10", or "seeds 1, 3, 7" when they do not run on. */
export function seedsLabel(seeds: readonly number[]): string;
```

- Contrast precision is the most decimals any value of the grid needs: `sweepValues(axis, from, to, step)`, which starts at the lower end whatever order `from` and `to` come in. At least 1, at most 3, the grid's own thousandths.
- The switch labels follow the picture: "contrast · Vera", "attention · Kai". Each is a `PersonaChip` in the persona's slot.

### The chart: `packages/web/src/boundary/sweep-chart.tsx`

```tsx
export function SweepChart(props: { sweep: Sweep; reading: SweepReading; persona: string }): JSX.Element;
```

The figure follows `boundary.html`:

- **Frame:** `viewBox` 812 × 404, drawn at that size. The plot runs from x 60 to 796 and y 52 to 330.
- **Measuring surface:** the dot grid and the four corner ticks are drawn in the SVG, on `paper-sunken`. No CSS is added outside the token block. The plot itself sits on a `surface` plate with a `line` edge, as the picture draws it.
- **x:** one band per value of the full grid (`sweepValues(axis, from, to, step)`), laxest left. Each value sits at its band's centre, so an incomplete sweep shows the range it has not reached. Tick labels are thinned when they would collide, at about 9.6 px per mono character. The boundary's tick label is always kept, in `signal-ink`. The x title reads "<Persona>'s contrast threshold, x:1" or "<Persona>'s attention cap, elements", with "stricter →" at the right.
- **y:** 0, 0.5 and 1 labelled, grid every 0.1, and a dotted `half` line at 0.5 labelled "half the seeds". The y title reads "share of <n> seeds".
- **Series:**
  - `route` is a polyline with square points. With no route table (`routeOpenSeeds` null), the route line, the gap and the gap's legend entry are all left out.
  - `through` is a dashed polyline in `var(--p)` with open circles.
  - The `gap` polygon (route forward, through back) is filled with an SVG hatch pattern. Its id comes from `useId`, so two charts never share one.
  - Every series draws only `claimedRows`.
- **Boundary:** a `post` at the boundary value, from the axis to the top. Its `flag` reads `boundary 3.0:1 · 2/10`. The flag flips to the post's left when it would cross the plot's right edge.
- **No boundary:** a text in the plot's lower right, "no boundary up to 4.5:1". Every got-through point is at or over 0.5 there, so the lower half is free.
- **Stopped:** no post. A solid `fault` stop line at the stopped value, with the label "stops at 4.0:1 · 1 run errored" in `fault`. Nothing is drawn past it. It is solid because a crash is a fact, and dashed means hypothesis. "Post" names the `signal` boundary mark alone.
- **Empty:** the axes and the grid alone, with "nothing measured yet".
- **Colours:** only tokens. `--p` comes from `slotStyle(slotOf(sweep.profileId))` on the figure.
- **Geometry:** coordinates, point sizes, stroke widths (2.5) and dashes (7 5, 2 4) are the drawing's own constants in this file, copied from `components.css`'s `.wf-chart`. The post's stroke is `--stroke-post`.
- **Accessibility:** `role="img"` with an `aria-label` that states the reading in words. The table carries the same numbers for assistive technology.

Above the plot, a legend in HTML, as the picture draws it:

- "route open · the filter · deterministic";
- "got through · the agent · hypothesis";
- "lost on an open route";
- with no route table, "route open · — for this goal".

Each entry starts with the series' own glyph (`SeriesGlyph`, exported for the table headers).

### The table: `packages/web/src/boundary/value-table.tsx`

```tsx
export function ValueTable(props: {
  sweep: Sweep;
  reading: SweepReading;
  selected: number | undefined;
  /** The cell's link to the runs at `value`: the current route with `value` set. */
  linkProps: (value: number) => LinkProps;
}): JSX.Element;
```

- Columns: value | route open | got through | runs. The header carries the series glyphs and the words "route open" and "got through".
- One row per stored value. All of them are listed, past a stop too: they are evidence, and the chart makes the claim.
- **Every cell opens its runs.** The route-open, got-through and runs cells are each a `Link` to `?value=<v>`, at least 32 px tall. Each link's `aria-label` reads, for example, "got through 2/10 at 3.0:1: open its runs".
- The value cell is the row header (`<th scope="row">`), and it links to the same runs, so every cell of the row opens them. Every link is measured as a control by `collect`.
- Route open reads "—" when null; the cell still links to the runs.
- The runs cell reads `10 →`, after a `fault` note "1 error" when `errors > 0`.
- The boundary row carries the `signal` post glyph and `signal-ink` text, and `aria-label` "boundary, 3.0:1". The selected row is marked `aria-current="true"`.
- At 1280 × 720 the table scrolls inside its column when the values outgrow it (up to `MAX_SWEEP_VALUES`). The demo's seven do not.

### The runs behind a value: `packages/web/src/boundary/value-runs.tsx`

```tsx
export function ValueRuns(props: { sweep: Sweep; row: SweepValue; closeProps: LinkProps }): JSX.Element;
```

- Shown under the table when the URL's `value` matches a stored row.
- It holds a label ("runs at 3.0:1"), then one 32 px cell per seed, in seed order (`row.runIds[i]` is `sweep.seeds[i]`'s run). Each cell is a `Link` to `/runs/$runId`. Under the cells, one key line, and a "Close" link that drops `value`.
- Each run is fetched with the existing `runQuery(id)` (`useQueries`), whose cache run detail shares. The cell is drawn the way `docs/DESIGN.md`'s SeedStrip says:

  | What the data says | How the cell is drawn |
  |---|---|
  | seed in `routeOpenSeeds` | solid border |
  | seed not in it | dashed border |
  | `routeOpenSeeds` is null | `SeedStrip`'s one 1 px `line-strong` border; the `aria-label` reads "no route table". Not dotted: dotted means soft. |
  | outcome `success` | filled `--p` |
  | outcome `error`, or never stored (`null`) | `fault` slash |
  | still loading | a `Skeleton` cell: no border, no fill, no slash |
  | failed to load | a blank `paper-sunken` cell, no border, under one fault banner: "k runs of n could not be read from io", io's words in mono, and "Try again", which refetches the failed runs |

  A cell with no outcome never borrows an outcome's look: a bordered, unfilled cell reads as "did not get through" (PR review).

  The cells hold no text. The `aria-label` says the rest, e.g. "seed 2: got through, route open. Opens run_swp-vera-30-s2". Under them, `SeedLegend` names the borders, the fill and the slash.
- A read cell is `s3-08`'s `SeedCell`, so the two screens draw one seed cell. `SeedStrip` takes outcomes already settled, while this panel reads its runs one by one, so the panel lays the cells out itself.

### The screen: `packages/web/src/screens/boundary.tsx`, `packages/web/src/boundary/sweep-view.tsx`

Routes:

```ts
const BoundarySearch = z.object({
  axis: SweepAxis.optional().catch(undefined),    // absent → "contrast"
  value: z.number().optional().catch(undefined),  // the row whose runs are open
});
export const boundaryRoute = createRoute({ path: "/boundary", validateSearch: BoundarySearch, … });
export const boundarySweepRoute = createRoute({
  path: "/boundary/$sweepId",
  validateSearch: BoundarySearch.pick({ value: true }),
  …,
});
```

- **`/boundary`** reads `sweepsQuery(BOUNDARY_PRESETS[axis ?? "contrast"])`:
  - pending: the skeleton;
  - an error: the fault banner;
  - `[]`: the preset's empty state;
  - otherwise `SweepView` on `[0]`.
- **`/boundary/$sweepId`** reads `sweepQuery(id)`. `null` is the empty state "no stored sweep `<id>`", with an action back to `/boundary`.
- **`SweepView`** (`boundary/sweep-view.tsx`) takes a loaded sweep, the URL's `value` and the link builders, and draws in this order:
  1. The top bar slot: `SourceBadge source="stored"` and `Tag variant="plain"` holding `sweep.backend`. The pair is a small exported `SweepSource`, so a static test can render it outside the portal.
  2. The head, as the picture lays it out:
     - left: the 88 px `PersonaAvatar` when the profile is bundled (a profile that is not reads as its id, in mono, with no avatar), then the meta line in mono `ink-3`: "Vera · task_past-order · contrast 1.5–4.5:1 · seeds 1–10 · 70 runs", plus " · incomplete, 3 of 7 values" when incomplete. Under it, the `<h1>` headline, across the full width.
     - right of the meta line: the axis switch, a `<nav aria-label="Axis">` of two links to `/boundary?axis=<preset>`, drawn with `SEGMENT_GROUP` and `segmentItem` from `components/segmented-control.tsx` (changed in review, below). One click opens the preset and drops `value`. The shown preset is marked `aria-current="page"`; on `/boundary/$sweepId` neither is. `components/` is not edited.
  3. The lead in `lead` `ink-2`, numbers in mono:

     | Reading | Lead |
     |---|---|
     | boundary | "The first value, from the laxest, where under half got through: **2/10** at 3:1, while the filter left a route open in **3/10**." The route-open clause reads "This goal has no route table, so route open reads —." when null. |
     | none | "Half or more got through at every value from 1.5:1 to 4.5:1." |
     | stopped | "1 run at 4:1 errored, so the sweep claims nothing from there on." |
     | empty | "The sweep is stored, but no value has finished yet." |

  4. The body grid, 848 px and the rest:
     - left: the chart in its figure;
     - right: `ValueTable`, `ValueRuns` when a value is open, and the note "Only <Persona>'s <axis name> moves; the rest of the profile stays as stored."

Headline per reading. The number is a `display-xl` span in `signal-ink`, and the sentence around it is `display-l`:

| Reading | Headline |
|---|---|
| boundary | "Under half get through, first at **3:1**." |
| none | "No boundary up to **4.5:1**." |
| stopped | "Stops at **4:1**: a run errored." (shortened in review, below) |
| empty | "Nothing measured yet." |

**Empty preset:**

- the mono label `no sweep stored`;
- the `display-m` sentence "No contrast sweep on Vera yet." as the `<h1>`;
- the body line "`pnpm seed:demo` stores both demo sweeps. `pnpm --filter @wayford/io sweep` prints how to run one alone." The copy is checked again once PR #177 adds `seed:demo` to the root `package.json`;
- one action, "Check again", which refetches.

The empty state is local to `boundary/`, since `s3-08` owns the shared `EmptyState`.

**Loading:** `Skeleton` blocks shaped as the head, the chart and the table.

**Fault:** `Banner kind="fault"` with the message in mono (io's words carry the status) and a "Try again" button that refetches.

### Wiring

- `router.tsx`: `boundaryRoute` and `boundarySweepRoute` join the tree.
- `components/top-bar.tsx`: `STORY_NAV` gains `{ number: "05", label: "Boundary", to: "/boundary" }`. TanStack's fuzzy match keeps it current on `/boundary/$sweepId`. A test checks that it stays current under a search too.
- `scripts/self-check.ts`: two entries.
  - `boundary` at `/boundary`, served `{ "/sweeps": [vera] }`. The check keys responses by path alone, so the query string is ignored.
  - `boundary · maxElements` at `/boundary/swp_kai-max-elements`, served `{ "/sweeps/swp_kai-max-elements": kai }`.
  - Both wait on `role=heading[name^="Under half get through"]` and take the sweeps from `@wayford/core/fixtures`.

## Files

| File | Why |
|---|---|
| `packages/web/src/api/sweeps.ts`, `sweeps.test.ts` | `GET /sweeps`, `GET /sweeps/:id`, parsed with `Sweep`. |
| `packages/web/src/api/runs.ts` | Outside the task's list: `parseResponse` gains `export`, so `sweeps.ts` parses as `runs.ts` does instead of copying it. |
| `packages/web/src/boundary/reading.ts`, `reading.test.ts` | What a sweep says: boundary, none, stopped or empty. |
| `packages/web/src/boundary/axis.ts`, `axis.test.ts` | Presets, value formats, axis copy, seed labels. |
| `packages/web/src/boundary/sweep-chart.tsx`, `sweep-chart.test.tsx` | The SVG chart and its legend. |
| `packages/web/src/boundary/value-table.tsx` | The value table, each cell a link to its runs. |
| `packages/web/src/boundary/value-runs.tsx` | The seed cells of one value. |
| `packages/web/src/boundary/sweep-view.tsx` | The loaded sweep's layout, the badge, the headline and the lead. |
| `packages/web/src/screens/boundary.tsx`, `boundary.test.tsx` | The two routes and their states. |
| `packages/web/src/router.tsx` | Two routes join the tree. |
| `packages/web/src/components/top-bar.tsx`, `top-bar.test.tsx` | `05 Boundary`. |
| `packages/web/scripts/self-check.ts` | Two screens join the list. |
| `tasks/s3-09-sweep-screen.md` | Boxes ticked with evidence. |

The table and the runs cells are tested through `boundary.test.tsx`, on the routed screen, where their links resolve.

`sweepFixtures` holds no sweep without a boundary and none stopped at an error. The tests build both from Vera's fixture, run through `Sweep.parse`, so the schema's boundary check keeps them honest:

- **no boundary:** every value at or above 5/10, and no error;
- **stopped:** an error at 2.5, before 3.0.

## Acceptance mapping

| Acceptance box | Proven by |
|---|---|
| web test: on the `Sweep` fixture, both curves and the marker render | `sweep-chart.test.tsx` "Vera's fixture draws route open, got through, the gap and one post flagged boundary 3.0:1 · 2/10"; `boundary.test.tsx` "/boundary opens Vera's latest sweep with its headline" |
| web test: "no boundary" for a sweep without one; a stopped sweep names its value | `reading.test.ts` cases for `none` and `stopped`; `sweep-chart.test.tsx` "no boundary up to 4.5:1" and "stops at 2.5:1 · 1 run errored: a stop line, no post, no 'no boundary', nothing drawn past it"; `boundary.test.tsx` headlines for both |
| web test: a cell links to its runs | `boundary.test.tsx` "each number cell links to ?value=<v>", and "with ?value=3 the runs at 3.0:1 link to each run's detail, in seed order" |
| web test: a preset with no stored sweep says how to run one | `boundary.test.tsx` "/boundary?axis=maxElements with no stored sweep says how to run one" |
| `check:self` passes with the Boundary listed, both themes | `pnpm --filter @wayford/web check:self`; also `self-check.browser.test.ts`, which runs every listed screen |
| `rg -n recharts packages/web/src -g '!**/runs/**'` prints nothing | the command |
| after `seed:demo --fake`, both sweeps open, one click to switch; screenshots | manual: `seed:demo --fake` (PR #177), or the fixture sweeps saved with io's `saveSweep` if it has not merged; then `pnpm dev`, screenshots at 1280 × 720 of both presets in Daylight and Night, with the reference beside them |
| root `pnpm lint`, `pnpm typecheck`, `pnpm test` | the commands |

## Decision log

| Question | Taken | Why |
|---|---|---|
| What the preset search param is | `axis`, `contrast` or `maxElements`, absent meaning `contrast` | Each axis has one demo persona, and the param reads as the switch does. `.optional().catch(undefined)` as `RunsSearch`, so a broken link opens Vera. |
| Latest sweep: complete only, or any? | Any stored, as io lists them, newest first | The task says "the latest stored sweep". An incomplete one shows its stored values and says it is incomplete, which claims less than hiding it. |
| One fetch of all sweeps, or a filtered fetch per preset? | `GET /sweeps?profileId&axis` per preset | It is io's filter, and the response stays one persona's. The self-check keys responses by path, so it still serves one list. |
| How a cell "opens the runs behind it" | Each number cell links to `?value=<v>`, and a panel under the table shows that value's seed cells, each linking to run detail | The Runs screen cannot list a sweep's runs (io lists them only under `?sweepId=`, the screen has no such filter, and Runs belongs to `s3-14`). A URL keeps the opened value a link, and every seed's run is one click on. |
| Mark each seed's outcome in that panel? | Yes: `runQuery` per run, through `useQueries` | Without outcomes, the got-through cell would not show which runs got through. Ten local fetches, only after a click, shared with run detail's cache. |
| Build SeedStrip and EmptyState in `components/`? | No: small local versions in `boundary/` | `s3-08` owns those files. A follow-up swaps them once it lands. |
| Measuring surface (dot grid, corner ticks) | Drawn in the chart's SVG | Writing it as CSS would add values outside the token block in `index.css`, which `s3-11` may also touch. |
| Chart geometry constants in the component | Kept as the drawing's own numbers, copied from `components.css` | They are the drawing, as the avatar's coordinates are. Colours and fonts come only from tokens. |
| Values past a stop: in the chart, the table? | Chart: no. Table: yes | The chart is the claim, and claims nothing past the stop. The table is evidence, and every stored run stays reachable. |
| Number formats | Prose drops a trailing `.0` ("3:1"); the chart and table keep the grid's precision ("3.0:1") | That is how the picture writes them. |
| Headline for `maxElements` | Same sentence, "Under half get through, first at 10." The lead names the attention cap | One sentence for both axes, short enough to fit beside the avatar and the switch. |
| The note under the table | "Only Vera's contrast threshold moves; the rest of the profile stays as stored." The picture's softness and report lines are not copied | That much holds by `sweptProfile`. The softness would come from the bundled profile, not the sweep, and whether the report counts sweep runs is not this screen's to say. |
| Where `parseResponse` comes from | Exported from `api/runs.ts` | One word outside the list, instead of a copy. `s3-08` exported it first on main, so the PR no longer changes the file. |
| How the switch reaches the other preset | The existing `SegmentedControl`, navigating on change | It is the design system's control for sibling views. Clicking an item is the one click. |
| (build) The head's rows | Meta line on top across the full width; headline and switch share the second row | The meta line, the avatar and the switch do not share one row at 1280. Superseded by the PR review row "The head's rows, again". |
| (build) An open value's height | The right column scrolls inside itself, bounded to the chart's height | An open value never grows the page past 720. |
| (build) Cell link width | `min-w-8` too, beside `min-h-8` | Kai's one-digit caps measured 21 px wide, under the 32 px floor. |
| (build) Seed cell gap | 4 px, not `.wf-seeds`' 6 | Ten cells fit on one row in the table's column. |
| (build) How a cell link is typed | A small `ValueLink` component per route, passed down | It types cleanly with TanStack. Preset links always write their `axis`. |
| (build) The empty preset's switch | Kept at the top right | The other preset stays one click away from an empty one. |
| (build) Legend spacing | One row, entries 16 px apart, the figure padded 8 px | The reference's own legend overruns its frame. Wrapping cost 28 px the page does not have at 720. |
| (build) Labels inside the plot | Drawn over the series, with a `surface` halo | In a no-boundary sweep the hatch covered "half the seeds". |
| (build) `preview.test.tsx`, now `lens.test.tsx` | Its whole-nav assertion gains `["Boundary", "/boundary"]` | It pins the full story nav, which this task extends. |
| (review) A seed cell's border | Route open alone; an outcome only fills or slashes | The cold review found the outcome classes overriding the border, so a cell stopped showing the filter's number. |
| (review) The stopped headline | "Stops at 2.5:1: a run errored." | The longer sentence wrapped at 1280 and pushed the page to 750 px. This one still names the value and the error. |
| (review) The switch on `/boundary/$sweepId` | Neither item pressed, so each opens its preset's latest sweep; `presetOf` goes | A pressed item cannot be clicked, so an older sweep could not reach its preset's latest from the switch. |
| (review) Cleanups from the simplify pass | Several, listed below | Each removes a second copy of something. |
| (review 2) The axis switch | Two links drawn with main's `SEGMENT_GROUP` and `segmentItem`, not `SegmentedControl` | `s3-11` exported the look for a row of links. A preset is a place, so a link: real `href`s, one click, no `""` sentinel. |
| (review 2) The headline's number on no boundary and on a stop | `ink` and `fault`, not `signal-ink` | Orange marks the line alone (`docs/DESIGN.md`, Principle 2). A stop is a fault, drawn so on the chart too. |
| (review 2) A grid cache, and a stale time on the runs | Both dropped | At 50 values and ten local fetches, neither pays for its code. |
| (review 2) The no-boundary test sweep | Every seed keeps a route open | Successes never exceed route-open seeds (F9 AC5), so the chart it drew could not occur. |
| (PR review) A seed cell whose run is loading or failed to load | A skeleton while it loads; a blank sunken cell under a fault banner with "Try again" once it failed | Drawn border only, it read as "did not get through": ten failed reads looked like 0/10 under a row saying 2/10. `docs/DESIGN.md` "States" asks for a skeleton and a fault banner. |
| (PR review) The seed cells, now `s3-08` has landed | `SeedCell`, pulled out of `SeedStrip` in `components/seed-strip.tsx`, with `SeedLegend` and `OUTCOME_WORDS` | `docs/DESIGN.md` "Components": built once, reused. `SeedStrip` takes settled outcomes and route lists, this panel loads runs one by one and knows route open as a yes or no, so the cell is shared and the layout is not. |
| (PR review) The empty state, now `s3-08` has landed | Kept local | `EmptyState` draws its sentence as an `<h2>` under the Report's own `<h1>`, takes its line as a string, and pads itself. The Boundary's empty state is the page's only heading, and its line holds two commands in mono. |
| (PR review) How a cell link is typed | One `ValueLink`: `to="."`, `value` set in the search, the rest kept | It replaces a link component per route passed down three levels. On a bare `/boundary` a cell now links to `/boundary?value=3`, which opens Vera's preset all the same. |
| (PR review) The source badge's guard | The Boundary's self-check entries wait on the top bar's `stored` badge as well as the headline | The badge is a portal, which a static render never draws, so only a mounted shell can see it go missing. |
| (PR review) The headline's words | "Under half get through, first at 3:1.", from #184, and "get through from" joins the screen's banned words | `boundaryOf` returns the first value under half, and the rate is not monotone, so "from 3:1" claimed every stricter value too. The chart's `aria-label` says the same. |
| (PR review) The head's rows, again | As the picture: the meta line and the switch share the top row, the headline has the second row to itself. The meta line drops "at every value", and the headline loses its 6 px top margin | "Under half get through, first at 2.5:1." needs 797 px, and beside the switch it had 758, so it wrapped and the page grew to 750 px. Now Vera and Kai end at 718 px. An incomplete sweep's longer meta line can still wrap beside the switch; `seed:demo` stores none. |
| (PR review) The recharts acceptance glob | `-g '!**/runs/**'` | rg anchors `runs/**` to the working directory, so the command as first written matched `runs/task-results.tsx`. |

The simplify pass made these changes:

- One test-only `boundary/fixture-sweeps.ts` holds the sweeps the tests and the self-check share. It replaces five copies.
- One `gridOf` replaces four spellings of `sweepValues`.
- The screen uses `personaLabel` from `runs/task-results.tsx`.
- `FRAME` is shared by every state.
- `ValueTable` reads `sweep.boundary`.
- The chart's points and legend glyph share one `Point`.

Skipped, with the reason:

- A `sweepFixture` export in core: outside this task.
- An `api/io.ts` for the parse helpers: waits for a third caller.
- Moving test markup readers out of `runs.test.tsx`: outside this diff.

## Risks

- **The headline width.** Bricolage at 48 px beside the avatar and the switch may not fit "Under half get through, first at 3:1." on one line at 1280. The screenshot step checks it. If it does not fit, the switch moves above the headline, or the sentence wraps.
- **SVG text in `check:self`.** `collect` does not measure SVG text (an `img` role), so the 16 px tick rule is held by the code and the test alone.
- **PR #177 (`seed:demo`) is unmerged.** For the screenshot box, the fixture sweeps go into a scratch database with io's `saveSweep`, as the task allows. Their cells then link to runs that do not exist, so run detail shows its not-found state.
- **A merge with `s3-08`.** Both add a line to `STORY_NAV`, `router.tsx` and the self-check list. Each conflict is a one-line one.

## Review note

Round 1, `spec-reviewer`: ready after fixes, no blocking finding. Every finding was taken:

- **should:**
  - The stopped mark is a solid `fault` stop line, never a post. The dashed version contradicted "no post", and dashed means hypothesis.
  - The stopped headline names the error too.
  - Contrast decimals come from the grid's values, not from `from`.
  - A seed cell with no route table is a `line` hairline, not dotted, since dotted means soft.
- **nit:**
  - The switch's "none pressed" is `SegmentedControl<SweepAxis | "">` with `""`.
  - Without a route table, there is no gap and no gap legend entry.
  - The value cell links too.
  - `fetchSweep` encodes the id.
  - The tests build the no-boundary and stopped sweeps through `Sweep.parse`.
  - The empty state says the sweep CLI prints its usage.
  - The plot's `surface` plate is drawn.
  - A non-bundled persona reads as its id.

Two smaller points are noted and not changed:

- An open runs panel may push the page past 720 px. The fit is for the default view: headline, chart and table.
- A measuring-surface utility from `s3-11` could replace the chart's own dot grid once it exists. That is a follow-up, since `s3-11` has not pushed one.
