# s3-08 — Report screen

Stream: s3
Milestone: week 4
Size: M
Depends on: s4-04, s3-13

## Context

Read first, in this order:

- `AGENTS.md` section "Every verdict clickable through to evidence"
- `docs/PLAN.md` F8
- `docs/DEMO.md` beat 5 — what the jury sees and clicks
- `docs/DESIGN.md`, rows SeedStrip, Readout and Finding, and `docs/design/screens/report.html`, the picture to match
- `packages/core/src/report.ts` and its fixture from `s4-04`; `isHardFinding` in `finding.ts`
- `packages/web/src/runs/task-results.tsx` and `screens/run-detail.tsx` — the per-persona table and the replay a finding links to

## Goal

The report screen shows one task's report: per persona the two numbers side by side, and the findings grouped by type, each opening its evidence step.

## Interface

- In: `GET /reports/:taskId`, `POST /reports/:taskId`
- Out:
  - a `/report/$taskId` route;
  - the `04 Report` entry in the top bar's story nav, opening the hard goal's report;
  - a link to it from each task on the runs screen.
- Files expected to change:
  - `packages/web/src/screens/report.tsx` and its test, `packages/web/src/report/**`, `packages/web/src/api/reports.ts`;
  - `packages/web/src/components/**` for SeedStrip, Readout, Finding and EmptyState;
  - `router.tsx`, the top bar, `runs/task-results.tsx`.

## Constraints

- **Two numbers per persona, never merged.** "Route open k/n" is the filter's, deterministic. "Got through k/n" is the agent's. The screen labels them in those words, as `docs/DEMO.md` beat 5 says them; "measurement" stays the name of axe's group. `null` reads "—", with the reason on hover.
- **Each number opens its runs**, as `task-results.tsx` does.
- **Source badge:** `stored`, with `report.backend` as the backend tag.
- **One row per persona:** avatar and name, the seed strip, route open, got through, the gap bar, median time. A seed cell opens its run.
- **Three groups:** measurement, deterministic, hypothesis, visually distinct (F8 AC1).
  - Three columns at 1280, each headed by its certainty glyph from `docs/DESIGN.md`.
  - A hypothesis is never styled like a measurement.
  - A finding whose basis includes `folk` or `llm` keeps its group, is marked soft (dotted), and shows its sources (F8 AC5).
  - Soft is not "not hard": `isHardFinding` is false for every hypothesis, and a hypothesis is dashed unless its own basis is `folk` or `llm`.
  - Each finding shows its recommendation and its evidence links, each to the run and step in run detail.
- **Scout's line heads the report** (reached, or "no ground truth").
- **"Analyse again"** calls `POST` and shows it running. With no report yet, the screen offers it instead of an empty page.
- **Fit.** The cast table and the findings' headers fit 1280 × 720.
- **Looks and passes** as `docs/DESIGN.md` says. The screen joins the `check:self` list, served the `Report` fixture.

## Acceptance

- [x] `pnpm --filter @wayford/web test` passes:
  - on the `Report` fixture, every finding renders in its group;
  - a soft finding shows its source;
  - every evidence link points at its run and step;
  - a `null` route-open share reads "—".

  Evidence, 51 files and 498 tests:
  - `report.test.tsx`: "each finding is in its own group", the evidence-chip hrefs on both fixtures, and "on the easy goal, route open reads — with its reason".
  - `finding.test.tsx`: "a soft finding is dotted, tagged soft, and shows its rule and its source", and the `findingLine` table, where no hypothesis is ever drawn as a measurement on any provenance.
  - Breaking each guarded line in a probe turned its test red (both branch reviews).
- [x] `pnpm --filter @wayford/web check:self` passes with the report screen listed, in both themes
  - "3 screens checked in Daylight and Night: 0 shortfalls" (cast, lens, report). The report is served the `task_past-order` fixture.
- [x] After `seed:demo --fake` (or on stored runs before `s4-07` lands), clicking Kai's row and then a failed run's evidence opens run detail at that step. Screenshots in the PR, beside `docs/design/screens/report.html`.
  - `s4-07` was still open (PR #177), so its own `seed:demo --fake --reset` ran from a worktree of its head into this branch's database: 200 runs, 2 reports, 2 sweeps, 59 s, $0.
  - This branch's `pnpm dev` then served that database. On `/report/task_past-order`, clicking Kai's name and then his chip `run_01m49ah4k6g604mtwxat13re1h · step 1 · Gave up` opened `/runs/run_01m49ah4k6g604mtwxat13re1h?step=1`, showing "Step 1".
  - That step shows "Order archive" invisible for Kai, cut by A1, as the finding says.
  - The screenshots are on the PR, beside the drawing, from the unmerged `assets/s3-08-screenshots` branch.
  - `report.browser.test.ts` proves the same click path on served fixtures, in every run of the suite.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root
  - 146 files and 2,080 tests, after merging `main` with s3-11 (the Lens), s3-12 and s3-09 on the board.

## Out of scope

- Export, sharing, or a print view.
- Editing findings.

## Notes for the reviewer

- Check that no hypothesis can be styled like a measurement.

## Outcome

- **The screen** is `/report/$taskId` (`screens/report.tsx`), with the cast table and findings in `report/` and the components the design assigns to this task in `components/` (seed strip, readout and gap bar, finding card, certainty glyph, empty state, outcome words). Spec: `docs/specs/2026-10-06-s3-08-report-screen.md`.
- **Each number opens its runs, with one caveat.**
  - The seed cells open each counted run exactly.
  - The two readouts open the runs screen filtered by task, persona and, for got through, outcome. That is a superset: older runs, the other backend and sweep runs, which the report leaves out. Each link's title says so.
  - An exact filter is a question for the team (s3-14).
- **Clicking a row** picks the persona (`?persona=`): the findings narrow to theirs, measurements stay, and a line above says so with "Show all". Beat 5's "click Kai's row, then one failed run" goes through the outcome word on each evidence chip.
- **Design calls flagged for the design owner:**
  - The goal sentence is `display-m` as drawn, not DESIGN's `display-xl`, for the fit at 1280 × 720.
  - The persona name is set at 24 px, as drawn, which DESIGN's scale has no style for.
- **Three files outside the list:**
  - `api/runs.ts` exports two helpers.
  - `scripts/self-check.ts` lists the screen.
  - `screens/lens.test.tsx`, from s3-11, lists `04 Report` in its nav assertion.
- **Follow-ups:**
  - A shared `CurrentLink` with run detail, and `PersonaName` and `DEMO_GOAL` moved out of `runs/` and `arena/`. These touch s3-12's files.
  - Shared test and browser harnesses with the lens tests (s3-11).
