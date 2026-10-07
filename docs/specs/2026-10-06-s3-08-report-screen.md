# s3-08 — Report screen: spec

Task: `tasks/s3-08-report-screen.md` · Branch: `feature/s3-08-report-screen` · Date: 2026-10-06
Status: approved 2026-10-06 (auto)

## Goal

The report screen shows one task's report: per persona the two numbers side by side, and the findings grouped by type, each opening its evidence step.

## Constraints that bind

- **Two numbers, never merged** (task; `docs/PLAN.md` F8 AC6; `docs/DESIGN.md` Principle 4):
  - "Route open k/n" is the filter's. "Got through k/n" is the agent's.
  - Numbers are k/n in `mono`, never a bare percentage.
  - `null` reads "—", with its reason.
- **Three groups, visually distinct** (F8 AC1). A hypothesis is never styled like a measurement.
  - A basis with `folk` or `llm` keeps its group, is marked soft (dotted), and shows its source (F8 AC5).
  - Soft is not "not hard": `isHardFinding` is false for every hypothesis.
- **Line style means certainty** (Principle 3):
  - solid is measured;
  - solid with end ticks is deterministic;
  - dashed is a hypothesis;
  - dotted is soft.

  Colour never carries certainty.
- **No evidence, no finding** (`AGENTS.md`, "Every verdict clickable through to evidence"). Every finding shows its recommendation and evidence links, each to the run and step in run detail.
- **Source badge `stored`**, with `report.backend` as the backend tag. Both come from the data (Principle 6).
- **States** (`docs/DESIGN.md`, "States"):
  - loading is a skeleton;
  - empty is a mono label, a `display-m` sentence, one body line and one action;
  - a fault is a fault banner with the status in mono and "Try again".
- **Copy:** outcome words are **Got through**, **Gave up**, **Over budget**, **Error**. No words from `docs/DEMO.md`'s "Words we do not use".
- **Fit:** the cast table and the findings' headers fit 1280 × 720. The screen joins `check:self` in both themes, which means 16 px text, 32 px targets and 4.5:1, with text measured only in headings, paragraphs, list items and controls.
- **Imports:** web imports core, and filter only through `./perceive`. No new dependency.
- **Out of scope:** export, sharing, a print view, and editing findings.

## Design

### Data: `packages/web/src/api/reports.ts`

```ts
export function fetchReport(taskId: string): Promise<Report | null>; // GET /api/reports/:taskId; 404 → null
export function reportQuery(taskId: string): QueryOptions<Report | null>; // key ["reports", taskId]
export function analyse(taskId: string, backend?: ReportBackend): Promise<Report>; // POST /api/reports/:taskId, body {} or { backend }
```

- Both functions parse with core's `Report`.
- They reuse `api/runs.ts`'s `parseResponse` and `postJson`, which this task exports from that file, so a refusal reads `io answered <status>: <error>`.
- `reportQuery` sets `retry: false`, as `api/measure.ts`'s `IO_CACHE` does, so the fault state shows at once while io is down.
- `analyse` is called through TanStack Query's `useMutation`. On success, its result is written into `reportQuery(taskId)` with `setQueryData`.
- `POST` is synchronous on io and can take minutes. "Running" is therefore the mutation's own pending state; there is no job id or progress.

### Route and screen: `packages/web/src/screens/report.tsx`

`reportRoute = createRoute({ path: "/report/$taskId", validateSearch: ReportSearch, component: ReportScreen })`.

`ReportSearch = z.object({ persona: ProfileId.optional().catch(undefined) })`:
- It is the persona whose row was picked. A finding is kept when its `personaIds` include that id, or when its type is `measurement` (a measurement holds whoever is looking).
- A line above the findings says the view is filtered, "Kai's findings and the page's measurements", with a "Show all" link back to no `persona`. Each group heading's count then reads "N of M", and an empty group reads "None of Kai's in this group."

`ReportScreen` draws one of these states:

| Query state | Drawn |
|---|---|
| pending | header with the goal sentence, then a `Skeleton` per cast row and per findings column |
| error | `Banner kind="fault"` with the error message in mono (it begins `io answered <status>`) and a "Try again" button that refetches |
| `null` (no report) | `EmptyState`: label `no report`, sentence "No report on this goal yet.", line "The Analyst reads the latest run of each persona and seed on this goal, all personas at once.", action "Analyse runs" (POST with no backend, so io's default, `jev`; a report on `llm` runs comes from `pnpm --filter @wayford/io analyse -- --task <id> --backend llm`) |
| a `Report` | the report (below) |

While the POST runs, the action button is disabled and reads "Analysing…". A `role="status"` line says "Analysing the stored runs. This can take a few minutes." A failed POST shows a fault banner above whatever was drawn, with "Try again" posting again. A stored report stays on screen.

**The report, top to bottom** (`docs/design/screens/report.html`):

1. **Header.**
   - The goal sentence is an `<h1>` in `display-m`. It comes from `bundledTasks` by task id, falling back to the id.
   - Below it, a mono meta line, `·`-separated:
     - the task id;
     - the run count;
     - the Scout line;
     - the cost: runs plus Analyst, as one `usd` figure, labelled "in all".
   - Then the "Analyse again" button (outline). It posts with `report.backend`.
   - The Scout line has one form per status:
     - `reached`: "Scout reached it in N steps".
     - `notReached`: "Scout did not reach it in N attempts".
     - `noGroundTruth`: "no ground truth".
   - The source badge and backend tag go in the top bar through `TopBarSlot`: `<SourceBadge source="stored" />` and `<Tag variant="plain">{report.backend}</Tag>`. A static render draws no portal, so the browser test checks them.
2. **Cast table** (`report/cast-table.tsx`). One row per `report.personas`, in report order. Columns: persona · seeds · route open · got through · gap · median time. Above it, at the right as drawn, a legend of the seed cell as a list: "route open" (solid border), "got through" (filled), "every route closed" (dashed), "error" (slash).
   - **Persona:**
     - `PersonaAvatar` for a bundled profile, `PersonaChip` otherwise, then the name.
     - The name is a link that picks the persona (`?persona=<id>`). On a picked row it reads `aria-current="true"` and links back with no `persona`. The link sets `aria-current` itself and matches the URL only exactly (`activeOptions: { exact: true }`), because TanStack's partial search match would mark the "back" link current.
   - **Seeds:** `SeedStrip`.
   - **Route open:** `Readout` (route open). `k/n` is `routeOpenSeeds / seeds.length`. It links to `/runs?taskId&profileId`, every run of that persona on the goal, since no runs filter selects route-open seeds. When null it reads "—", with the reason "no route table for this goal" as a `title` and as visually hidden text.
   - **Got through:** `Readout` (got through), with a dashed underline. `k/n` is `successes / (runs − errors)`, as `task-results.tsx` counts it. It links to `/runs?taskId&profileId&outcome=success`; a `k` of 0 stays plain text, as on the runs screen. When every run errored it reads "—" with "every run errored". When `errors > 0`, a line below reads "1 error" (`N errors`) in `ink-2`.
   - **Gap:** the gap bar from `Readout`, counted per seed from `seeds[]`, with errored seeds left out of the bar as they are left out of got through:
     - **through:** seeds whose outcome is `success`, whatever their routes;
     - **gap:** seeds with a route open whose outcome is neither `success` nor `error`;
     - **closed:** seeds with every route closed whose outcome is neither `success` nor `error`;
     - the bar's total is `seeds.length − errors`.
     - It draws through in the persona fill, the gap hatched, and closed as the sunken rest.
     - It is `role="img"`, with an `aria-label` that names the three counts and any errored seeds left out.
     - Under it, a `<p>` caption reads "N open, not through" in `ink-2`.
     - With no route data, or with every run errored, it reads "—".
   - **Median time:** `formatSeconds(medianSuccessMs)`, or "—" with "no run got through".
   - **Measured text:** every text cell wraps its text in a `<p>`, so `check:self` measures it.
3. **Findings** (`report/findings.tsx`). Three `<section>`s side by side at 1280, each headed by an `<h2>`:
   - the certainty glyph, then **Measurement** · count · "the page, by axe";
   - the glyph, then **Deterministic** · count · "the filter, in code";
   - the glyph, then **Hypothesis** · count · "read from the runs".

   An empty group reads "None in this group." Findings keep report order within a group.
4. **Footer.**
   - "Analysed 5 Oct 2026, 14:20 UTC by <analystModelId>.": `analysedAt` formatted with fixed options in UTC (`en-GB`, day, short month, year, hour and minute), so a test reads the same on any machine.
   - "Left out: N older runs, N runs on the <other backend> backend, N sweep runs." Zero terms are dropped, and the whole line goes when all are zero.
   - "Closed with no evidence step:", then each unevidenced closure as one line: persona · route · page · role "name" · rules · N seeds.

### Components (`packages/web/src/components/`)

- **`certainty.tsx`:** `CertaintyGlyph({ line: "measured" | "deterministic" | "hypothesis" | "soft" })`. A 22 px `aria-hidden` mark: a solid post, a post with end ticks, dashed, or dotted.
- **`seed-strip.tsx`:** `SeedStrip({ seeds: ReportSeed[], label: string })`. A labelled group with one link per seed to `/runs/$runId`, each a 32 × 32 cell. It encodes:
  - **border:**
    - solid `ink` when `openRoutes.length > 0` (route open);
    - dashed `line-strong` when `openRoutes` is `[]` (closed);
    - a 1 px `line-strong` border when `openRoutes` is `null` (no route table): seen at 3:1, yet thinner than an open seed's 2 px ink. Dotted means soft, so it is not used here.
  - **fill:** the persona's `--p` on `success`.
  - **slash:** in `fault`, on `error`.
  - **`aria-label`:** "seed 1: Gave up, routes open: B, C. Opens run_kai-past-order-1". The route part reads "routes open: none" or "no route table".
- **`readout.tsx`:** `Readout({ kind: "routeOpen" | "gotThrough", value: { k: number; n: number } | null, to: LinkProps, opens: string })`, with `opens` as the link's title, and `GapBar({ seeds })`, which counts with an exported `gapCounts(seeds)`; `NoValue({ reason, className })` is the "—" both use. (As built: see the decision log.)
  - The value is `readout` type, `k` in `ink` and `/n` beside it. `gotThrough` adds the dashed underline.
  - A `null` value reads "—", with `reason`.
- **`finding.tsx`:** `FindingCard({ finding: Finding, outcomeOf: (runId: RunId) => RunOutcome })` (`outcomesOf(report)` in `report/findings.tsx`, which throws on a run the report does not name, since `Report` rules that out), an `<article>` with:
  1. **tags:** persona chips, then `Tag variant="soft"` "soft" when soft, then per basis entry a `Tag variant="rule"` rule id and its `ProvenanceTag`. A measurement with `axeRuleId` shows `Tag` "axe · <id>" instead.
  2. **title:** `<h3>`.
  3. **evidence chips:** one link per `EvidenceRef`, to `/runs/$runId?step=N`, text `<runId> · step N · <outcome word>`, e.g. `run_kai-past-order-1 · step 1 · Gave up`. The outcome comes from the report's own `seeds[]` through `outcomeOf`, so beat 5's "then one failed run" can be picked by its word.
  4. **detail:** `<p>`.
  5. **change:** `<p>` with `change →` in mono, then the recommendation.

  The border is chosen by `findingLine(finding)`, an exported pure function:
  - `"soft"` when any basis provenance `isUnsourced` (dotted);
  - else `"hypothesis"` when the type is hypothesis (dashed);
  - else `"deterministic"` (hairline with end-tick glyph in the column head);
  - else `"measured"` (hairline).

  The card also carries `data-line`, which the tests read.
- **`empty-state.tsx`:** `EmptyState({ label, sentence, line, action })`, as `docs/DESIGN.md` describes it.
- **`outcome-words.ts`:** `OUTCOME_WORDS: Record<RunOutcome, string>`, the fixed words of `docs/DESIGN.md`, "Copy": **Got through**, **Gave up**, **Over budget**, **Error**. The seed strip, the evidence chips and later `s3-12`'s Outcome read them from this one place.

### Navigation

- **Top bar** (`components/top-bar.tsx`). `STORY_NAV` gains `{ number: "04", label: "Report", to: "/report/$taskId", params: { taskId: DEMO_GOAL } }`.
  - Entries without params get no `params` key. The nav maps `params` through to `Link`.
  - `DEMO_GOAL` is imported from `arena/panel-state.ts`, the one place web names the hard goal.
  - `04` is current on the hard goal's report only.
- **Runs screen** (`runs/task-results.tsx`). Each task's header gains a link, "Report", to `/report/$taskId`.

### `check:self`

`SELF_CHECK_SCREENS` gains a `report` entry:
- `path`: `/report/task_past-order`;
- `ready`: `role=heading[name=/^Measurement/]`;
- `responses`: `{ "/reports/task_past-order": reportFixture("task_past-order") }`.

The screen fetches nothing else.

## Files

| File | Why |
|---|---|
| `packages/web/src/api/reports.ts`, `reports.test.ts` | new: GET with 404 → null, POST |
| `packages/web/src/api/runs.ts` | exports `parseResponse` and `postJson`, so the reports API reuses them instead of copying them |
| `packages/web/src/components/outcome-words.ts` | new: the fixed outcome words in one place |
| `packages/web/src/screens/report.tsx`, `report.test.tsx` | new: the route, states, header, footer |
| `packages/web/src/report/cast-table.tsx`, `findings.tsx` | new: the two halves of the screen |
| `packages/web/src/components/certainty.tsx`, `seed-strip.tsx`, `readout.tsx`, `finding.tsx`, `empty-state.tsx` and tests | new: the components DESIGN assigns to s3-08 (`certainty.tsx` is the glyph they share) |
| `packages/web/src/screens/report.browser.test.ts` | new: the click path of box 3, the running state, the top-bar badge, fit at 1280 × 720 |
| `packages/web/src/router.tsx` | the route |
| `packages/web/src/components/top-bar.tsx`, `top-bar.test.tsx` | `04 Report` |
| `packages/web/src/runs/task-results.tsx`, `screens/runs.test.tsx` | the per-task Report link |
| `packages/web/scripts/self-check.ts` | the report screen in `check:self` |
| `tasks/s3-08-report-screen.md` | evidence and Outcome |

`screens/runs.test.tsx` and `top-bar.test.tsx` are tests of changed files. `self-check.ts` is required by box 2. Both are outside the task's file list.

## Acceptance mapping

| Acceptance box | Proven by |
|---|---|
| web test: every finding renders in its group | `report.test.tsx` "on the hard goal's report, each finding is in its own group" |
| web test: a soft finding shows its source | `finding.test.tsx` "a soft finding is dotted, tagged soft, and shows its rule and its source", on the fixture's A1 finding; its `findingLine` table, which includes a derived soft hypothesis and shows that no hypothesis gets `measured`; `report.test.tsx` "each finding is in its own group" places A1 under Deterministic |
| web test: every evidence link points at its run and step | `report.test.tsx` "every evidence chip links to /runs/<runId>?step=<n>", over every finding of both fixtures |
| web test: a null route-open share reads "—" | `report.test.tsx` "on the easy goal, route open reads — with its reason" |
| `check:self` with the report screen, both themes | `pnpm --filter @wayford/web check:self`, and `self-check.browser.test.ts` per screen and theme |
| click Kai's row, then a failed run's evidence, opens run detail at that step; screenshots | `report.browser.test.ts` "Kai's row, then his failed run's evidence, opens run detail at that step". It serves, through `page.route`: `/api/reports/task_past-order` (the fixture), `/api/runs/run_kai-past-order-1` (`runResultFixture` re-parsed with that id, `prof_kai`, seed 1, `gave_up`, so it has a step 1), `/api/tasks` (`taskFixtures`), and a 404 for screenshot, video and trace files. It asserts the URL `/runs/run_kai-past-order-1?step=1` and that run detail shows "Step 1". Then by hand on `seed:demo --fake` (see Risks), with screenshots in the PR |
| the cast table and the findings' headers fit 1280 × 720 | `report.browser.test.ts` "a ten-seed report fits 1280 × 720": the hard goal's fixture with its seed rows cloned to seeds 1 to 10 (new run ids, `runs` and `runCount` fixed), the findings' `<h2>`s end above 720 px and `scrollWidth` is at most 1280 |
| lint, typecheck, test | the root commands |

## Decision log

| Question | Taken | Why |
|---|---|---|
| What "clicking Kai's row" does | The persona name links to `?persona=prof_kai`, which narrows the findings to Kai's (measurements stay) and marks the row current | Beat 5 clicks the row and then a failed run. The narrowed findings put Kai's evidence chips in reach. A URL param keeps it linkable, and it is about 20 lines |
| "Each number opens its runs" for route open | Route open links to every run of the persona on the goal (`/runs?taskId&profileId`). Got through links with `outcome=success`, as `task-results.tsx` does | `RunsSearch` has no route-open filter. The seed strip opens each seed's exact run |
| Got-through denominator | `runs − errors`, with "N errors" below when any | The same as the runs screen, and `PersonaResult` keeps errors apart so a crash never reads as failing |
| Route-open denominator | `seeds.length` | It is the filter's count over every seed, whatever the run did |
| A seed cell with no route table | A 1 px `line-strong` border, and "no route table" in its label | The drawing's dotted `--unknown` collides with Principle 3, where dotted means soft. A `line` hairline was too faint for a 32 px link (1.33:1 on paper; branch review), so it takes the seed cells' `line-strong` at 1 px |
| The soft tag's words | The built `ProvenanceTag` ("folk · no source"), plus a `soft` tag | `docs/DESIGN.md` and the s3-13 component agree. The drawing's "soft · folk" is the outlier. The extra `soft` tag says "marked soft" in words |
| The first group's heading | "Measurement" | The task: "measurement stays the name of axe's group" (the drawing says "Measured") |
| Goal sentence size | `display-m` (32/36), as drawn | `docs/DESIGN.md` names `display-xl` for it, but at 72 px the sentence wraps to two lines and the fit at 1280 × 720 gets tight with five personas. The drawing is the picture to match; flagged for the design owner |
| Where the goal sentence comes from | `bundledTasks`, falling back to the task id | `GET /tasks` lists stored tasks only, and an extra request would have to be served in `check:self` |
| Ada's "control" tag | Not drawn | No data names it |
| The seed tooltip with "A cut" | Not built. The seed's `aria-label` and `title` name its open routes | The report carries no full route list, and DESIGN has no tooltip component |
| Cost | One figure, runs plus Analyst, "in all" | The drawing shows one. Splitting it adds a term nobody asked for |
| Running state | `useMutation` pending: a disabled button reading "Analysing…" and a status line | io's `POST` is synchronous with no progress. This is the first mutation in web, and TanStack Query is the stack's own tool |
| Backend of a POST | `report.backend` on "Analyse again"; none (io's `jev` default) from the empty state | With no report there is no backend to read. Jev is the demo's backend |
| Fault status "in mono" | The error message in mono, which begins `io answered <status>` | `api/runs.ts`'s refusal already says it; no new error type |
| The empty state in `check:self` | Not checked there; covered by `report.test.tsx` | `SelfCheckScreen` can only answer 200 JSON, and widening it is outside this task |
| Gap caption | "N open, not through" in `ink-2` | The drawing's "lost" is not a copy word, and `ink-3` must never carry an evidence number |
| `GapBar`'s props (build) | `GapBar({ seeds })`, computing its counts with an exported pure `gapCounts(seeds)` that also returns why it is null | The bar needs the errored count for its label and the reason it is empty ("no route table" or "every run errored"). The cast table and the tests share `gapCounts` |
| The `/n` of a readout (build) | `mono` (16 px) in `ink-2`, beside `k` in `readout` | The drawing's 22 px `ink-3` would need an arbitrary size, and `ink-3` never carries an evidence number |
| The axe tag on a card (build) | Shown beside the basis tags, not instead of them | Every measurement today has an empty basis, so it looks the same. A finding that cites axe and a rule keeps its provenance |
| Persona chips on a card (build) | `PersonaName` from `runs/task-results.tsx` | It already maps a profile id to its label, or the id in mono for a profile that is not bundled; a copy would drift |
| Where "Analyse again" sits (build) | At the right of the goal's row; the meta line and the seed legend share the row under it | The drawing has no such button. This keeps the meta line and legend where the drawing puts them, and the fit is checked in the browser test |
| The persona's name in the cast table (build) | Display face at 24 px (`text-2xl`), as drawn | DESIGN's scale has no 24 px display style (`display-m` is 32 px, `title` 22 px sans). Flagged for the design owner with the goal sentence |
| A failed GET with a report already read (build) | The report stays on screen; the fault banner shows only when there is nothing to show | As run detail does: io going down after a read says nothing new about the report |
| A report analysed while the page moves to another goal (build, branch review) | The mutation is keyed by task, and its result is stored under the report's own `taskId` | Without it, a POST that resolved after a move wrote one goal's report under another's key, and the second page showed "Analysing…" (reproduced in the review). A browser test now holds a POST, moves, releases, and checks both pages |
| What the readouts' links say (build, branch review) | Each link's title says what it opens: "Every stored run of Kai on this goal, which can include runs this report leaves out", and the same for those that got through | The runs screen can only select a superset of the report's run set (older runs, the other backend, sweep runs). The seed cells open each counted run exactly. Whether the numbers should open an exact filter is a question for the team |
| The empty state's line (build, branch review) | "The Analyst reads the latest run of each persona and seed on this goal, all personas at once." | The first wording, "every stored run", claimed more than `selectRuns` reads |
| Two cuts not taken (build, branch review) | `certainty.test.tsx` and `finding.test.tsx`'s evidence-chip table stay | The glyph's line styles are Principle 3 itself, and without that test drawing soft as dashed stayed green. The chip table is the one place the outcome words on evidence are checked; `report.test.tsx` checks the hrefs on the screen |
| Second branch review (build) | The persona pick is a plain `Link` with `activeOptions: { exact: true }` and its own `aria-current`; `FindingCard`'s `outcomeOf` always answers, through `outcomesOf(report)`, which throws on a run the report does not name; the seed legend names "no route table" on a goal without one; one `seedSpan` with a joiner; the move-while-analysing test waits for the answer instead of a timer | Each is smaller than what it replaced: no `createLink` anchor, no branch for a state `Report` rules out, no legend items no cell uses, and no fixed wait that could pass without testing anything |
| `refusal` (build) | Stays private in `api/runs.ts`; only `parseResponse` and `postJson` are exported | `api/reports.ts` reaches `refusal` through `parseResponse`, so exporting it had no user |

## Risks

- **Box 3's real run needs `seed:demo --fake`, which is in PR #177 and not merged.**
  - Without it there are no stored runs and no stored report without a real key.
  - Plan: the browser test proves the click path on served fixtures. At verify, if #177 has merged, run `seed:demo --fake` and click through for the screenshots. If it has not, run its branch's `seed:demo --fake` locally against this branch's database and say so in the PR.
- **`TopBarSlot` draws nothing in a static render,** so the badge and tag are proven in the browser test, on an `llm` report so a hard-coded `jev` would fail.
- **Fit is proven on the demo's shape,** three personas and ten seeds (`tasks/s4-07-seed-demo.md`), not on five personas, which no demo report has.

## Review note

Spec review, round 1: ready after fixes, no blocking finding. Every finding was taken:

1. **The gap bar** is counted per seed, with errored seeds left out (Cast table, Gap).
2. **The fit test** runs on a ten-seed, three-persona report and checks `scrollWidth`; the five-persona risk is dropped.
3. **The box 3 browser test** says what it serves for run detail, and asserts "Step 1".
4. **`api/runs.ts`** exports the helpers the reports API needs, and is in Files (two, as built: `refusal` stays private).
5. **A picked persona:** the filter is said above the findings, counts read "N of M", the empty text names the persona, and the keep rule is exact.
6. **Evidence chips** carry the run's outcome word, from one `OUTCOME_WORDS`.
7. **The footer's time** is formatted in UTC with fixed options.
8. **Got through:** "—" when every run errored, a count of 0 stays plain, and `reportQuery` sets `retry: false`.
9. **The closures' lead-in and the seed legend** are back in.
10. **The picked row's link** sets `aria-current` itself (as built: a plain `Link` with `activeOptions: { exact: true }`; second branch review).
