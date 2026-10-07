# s4-08 — Rehearsal on our site: every screen, from the Target screen

Stream: s4
Milestone: week 4, any target (finals). Rewritten on 2026-10-06 (`docs/adr/0003-any-target.md`). It was "Credibility run on a public site", one recorded run set for the Q&A.
Size: M
Depends on: s1-07, s4-09, s4-10, s3-15, s3-16

## Context

Read first, in this order:

- `AGENTS.md`
- `docs/adr/0003-any-target.md` — what works on a foreign site, and what is out
- `docs/DEMO.md` — "Finals: any target", with our pick, its goals and the gaps `s1-07` found
- `docs/PLAN.md` F9 AC4 — a sweep varies the persona, never the site
- Issues #124 to #127, #146 and #149 — the collector's known gaps

## Goal

Our pick, the site `s1-07` chose and ran first through the API, runs through every story screen from the Target screen, rehearsed. Any gap the UI hits that `s1-07` did not is listed, blocking or not.

## Interface

- **In:** our pick and its two read-only goals, from `s1-07`.
- **Out:**
  - for each goal, from the Target screen: Scout, the Lens on three of its pages for all five personas, a race with Ada, Kai and Vera, and ten seeds per persona with a report;
  - one sweep on one goal, prepared with the sweep CLI and opened on the Boundary;
  - in `docs/DEMO.md` "Finals: any target": the results per persona, and any new gap;
  - each gap noted as blocking a screen or not, with its issue number. A new issue for a gap no issue covers.
- Files expected to change: `docs/DEMO.md`; code only for a fix under S size that unblocks a screen. Bigger fixes go to `s1-07`.

## Constraints

- A read-only goal: no form that saves, no login, no purchase, nothing that writes to the site.
- Every run on the LLM: the race, the run set, Scout and the sweep (`docs/adr/0003-any-target.md` D9).
- Started from the Target screen, as the finals will be. A step that needs the CLI, other than the sweep, is itself a gap.

## Acceptance

- [ ] Both goals through every screen, with the stored runs, reports and the sweep listed in `docs/DEMO.md`
- [ ] Every new gap listed in `docs/DEMO.md` with its issue, blocking or not
- [ ] Wall time and cost from URL to report, ten seeds, in `docs/DEMO.md`
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Fixing a gap larger than S: it goes back to `s1-07`'s list, or is cut.
- A route table for the site.
