# s1-07 — Our pick through the API, and the gaps it hits

Stream: s1
Milestone: week 4, any target (finals)
Size: M for the run set and the list. Each blocking gap is sized when found, and split out when it is more than one M.
Depends on: s2-13

## Context

Read first, in this order:

- `AGENTS.md`
- `docs/adr/0003-any-target.md` — D8: the gaps a run on our pick hits are the ones fixed, and no other
- `docs/RULES.md` — "What is measured", the rules a fix must keep
- `docs/DEMO.md` — "Finals: any target"
- Issues #124 to #127, #146 and #149 — the collector's known gaps
- `packages/io/src/routes/tasks.ts`, `routes/runs.ts`, `routes/reports.ts` — the three calls this task drives by hand

## Goal

Our pick for the finals is chosen and run through the engine the day `s2-13` merges, before any screen for it exists, so the collector gaps it hits are found and fixed early. `s4-08` then rehearses the same site through the UI.

## Interface

- **In:**
  - one site whose terms allow automated browsing;
  - no login, and no cookie banner in an iframe;
  - two read-only goals, each with a success condition the team can defend.
- **The run,** through io under `pnpm dev`, by `curl` or a short script:
  - `POST /tasks` for each goal;
  - `POST /runs` with Ada, Kai and Vera on three seeds, on the LLM;
  - `POST /reports/:taskId` with `backend: "llm"`.
- **Out:**
  - in `docs/DEMO.md` "Finals: any target": the site, the goals, the result per persona, and each gap the runs hit, with its issue (a new issue for a gap no issue covers), blocking a screen or not;
  - the fixes for the blocking gaps, with `docs/RULES.md` changed wherever a fix changes what is measured;
  - if a run hits a new tab, `s2-14` taken.
- Files expected to change: `docs/DEMO.md`, `packages/filter/src/` where each gap lives, `docs/RULES.md`

## Constraints

- A read-only goal: no form that saves, no login, no purchase, nothing that writes to the site.
- A change to `docs/RULES.md` or the filter contract is a PR with one approval (`docs/ROADMAP.md`).
- The target app's measurements and the calibration table stay as they are, or the PR says what moved and why.
- Zero LLM in the filter.

## Acceptance

- [ ] The site, its goals, the nine runs per goal and their reports listed in `docs/DEMO.md`, each gap with its issue
- [ ] `pnpm --filter @wayford/filter test` passes with a fixture page for each gap fixed
- [ ] The run set re-run after the fixes hits none of the blocking gaps, recorded in `docs/DEMO.md`
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Gaps the runs did not hit.
- iframes and shadow DOM (`docs/adr/0003-any-target.md`), unless the site cannot be swapped.
- The UI rehearsal: `s4-08`.
