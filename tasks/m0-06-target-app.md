# m0-06 — Demo target app

Stream: m0
Milestone: week 1
Size: L
Depends on: m0-01

## Context

Read first, in this order:

- `docs/PLAN.md` assumption A5, F2, F9
- `KONCEPCJA.md` section "Przykład działania" for the flavour of goals, ignoring the energy domain
- `AGENTS.md` rejected item "Domain context"

## Goal

A small static web app with a handful of pages and one intentional wayfinding problem, whose contrast, font size and target size are driven by CSS variables set from the URL, so the filter, the preview and the sweep have a stable, tunable target.

## Interface

- In: query parameters `contrast`, `fontPx`, `targetPx` (optional, with defaults)
- Out: a Vite vanilla app in `packages/target-app` served on a fixed port
- Files expected to change: `packages/target-app/**`

## Constraints

- Domain neutral. A generic "my account" style app: home, two top-level sections, one settings page, one page holding the goal. No energy, no billing jargon.
- Two goals reachable: one easy (two clicks, large obvious link), one hard (the link is small, low contrast, placed in a section with a misleading label). The hard goal is the one the sweep breaks.
- Success for each goal is detectable by URL alone, so `urlMatches` works.
- CSS variables `--fg`, `--bg`, `--font-size`, `--target-size` computed from query parameters. Changing `contrast` changes only the low-contrast link, not the whole page, so the boundary is sharp.
- No framework, no router library. Plain HTML pages, one small script for the query parameters.
- Every interactive element has an accessible name. Do not use icon-only controls.
- One hamburger menu on mobile width only, for the knowledge dimension later.

## Acceptance

- [ ] `pnpm --filter @wayford/target-app dev` serves the app on the documented port
- [ ] Opening `/?contrast=2` renders the hard link with a contrast ratio near 2:1 and `/?contrast=7` near 7:1, verified by a vitest test that computes contrast from the CSS variables
- [ ] The two task fixtures from m0-04 point at this app and their `urlMatches` conditions match the goal pages
- [ ] A short `README.md` in the package lists pages, goals and parameters

## Out of scope

- Playwright, filter, anything from other packages.
- Visual polish. It should look like a plausible ordinary app, not a design piece.

## Notes for the reviewer

- Open it with `?contrast=3` and check that you personally struggle to notice the hard link. If you do not, it is not low enough.
