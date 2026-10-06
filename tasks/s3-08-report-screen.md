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

- [ ] `pnpm --filter @wayford/web test` passes:
  - on the `Report` fixture, every finding renders in its group;
  - a soft finding shows its source;
  - every evidence link points at its run and step;
  - a `null` route-open share reads "—".
- [ ] `pnpm --filter @wayford/web check:self` passes with the report screen listed, in both themes
- [ ] After `seed:demo --fake` (or on stored runs before `s4-07` lands), clicking Kai's row and then a failed run's evidence opens run detail at that step. Screenshots in the PR, beside `docs/design/screens/report.html`.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Export, sharing, or a print view.
- Editing findings.

## Notes for the reviewer

- Check that no hypothesis can be styled like a measurement.
