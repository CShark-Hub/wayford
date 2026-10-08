# s3-14 — Cast and Runs redesigned, Recharts out

Stream: s3
Milestone: week 4
Size: M
Depends on: s3-13, s3-08
Optional: `docs/DEMO.md` shows neither screen. Until this lands they keep their layouts under the new tokens.

## Context

Read first, in this order:

- `docs/DESIGN.md`:
  - "Screens";
  - "Colour", the persona slots;
  - the CastCard row of "Components".
- `docs/design/screens/cast.html` — the picture to match
- `docs/RULES.md`, "Persona composition" — which rule each dimension feeds
- `packages/web/src/screens/personas.tsx` and `packages/core/src/profile.ts`
- `packages/web/src/screens/runs.tsx` and `runs/task-results.tsx`

## Goal

Two screens and one dependency change:

- **Cast** shows the five personas as a lineup over a capability matrix.
- **Runs** is one archive table.
- **Recharts** leaves the app with the old per-task bar charts.

## Interface

- In: the bundled profile fixtures; `GET /runs` as today.
- Out:
  - the `/cast` screen's new layout;
  - the `/runs` table.
- Files expected to change:
  - `packages/web/src/screens/personas.tsx`, which may be renamed `cast.tsx`, and `screens/runs.tsx`;
  - `packages/web/src/runs/**`, `packages/web/src/components/**` for CastCard;
  - `packages/web/package.json`;
  - their tests.

## Constraints

- **Lineup.** Five avatar tiles with each persona's name in `display-l`, its description and its device. Ada carries a `control` tag.
  - The description is the profile's own, clamped to three lines, with the full text on hover and in the CastCard.
  - Kai's description runs to about 210 characters, so the clamp is what makes the lineup fit.
- **Matrix.**
  - Rows, each labelled with the rule it feeds: contrast `P1`, font size `P3`, target size `P4`, attention `A1`, memory `M1`, patience `B3`, patterns `K1` (12 pips), vocabulary `K2`.
  - Each cell shows the value in mono.
  - The three perception thresholds (P1, P3, P4) add their provenance tag and a mini gauge in the persona's colour, with the post in `signal`. Nothing else in a profile carries a provenance, so no other row has a tag.
  - Patterns known is 12 − `unknownPatterns.length`, drawn as 12 pips: a pattern in neither list is known (`docs/RULES.md`, K1).
  - A dimension the persona does not set reads `—`, never zero and never "all". `folk` and `llm` take the dotted soft tag.
  - Clicking a persona's column opens that persona in the Lens.
- **Runs.**
  - One table: persona chip, goal, outcome, seed, duration, steps, cost, run id.
  - Mono for every number.
  - The task, persona and outcome filters as segmented chips, held in the URL as today.
  - The per-task summary and its bar charts go. The link to each task's report is `s3-08`'s.
- **Recharts** is removed from `package.json` with the bar charts it drew.
- Both screens join the `check:self` list, in both themes.

## Acceptance

- [x] `pnpm --filter @wayford/web test` passes (70 files, 1014 tests, with `main` at #208 merged in):
  - the matrix shows `—` for a dimension a persona does not set: `personas.test.tsx` "the matrix reads — and not set where a persona sets nothing", `dimensions.test.ts` "a dimension the persona does not set has no value";
  - a `folk` threshold shows the soft tag, and no non-threshold row has a tag: `personas.test.tsx` "Vera's target size carries the dotted folk tag, and no uncited row carries a tag", `dimensions.test.ts` "only the three thresholds carry a provenance or a gauge, over all five fixtures";
  - Vera's patterns read 9: `personas.test.tsx` "Vera's patterns read 9, with 9 of 12 pips known", `dimensions.test.ts` "patterns known is 12 less the unknown";
  - a runs row links to its run detail: `runs.test.tsx` "each row's run id links to its run detail".
- [x] `pnpm --filter @wayford/web check:self` passes with Cast and Runs listed, in both themes: `17 screens checked in Daylight and Night: 0 shortfalls`, with `cast`, `cast-card` (Vera's hover card open) and `runs` among them
- [x] `rg -n "recharts" packages/web` prints nothing (exit 1)
- [x] The PR shows Cast and Runs at 1280 × 720 beside `docs/design/screens/cast.html`: in both themes, with Vera's hover card open, from branch `assets/s3-14-screenshots`
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root: lint 437 files clean, typecheck clean, 174 files and 2769 tests (2766 passed, 3 skipped)

## Out of scope

- The profile builder (cut for the hackathon, `docs/PLAN.md` F1 AC1).
- Any chart on Runs.

## Outcome

Spec: `docs/specs/2026-10-07-s3-14-cast-and-runs.md`; its decision log holds every call below.

- **Cast** (`screens/personas.tsx`, file and route export kept): one column-major grid.
  - Each persona is a `<section>` on a subgrid, so its tile and its eight matrix cells are one column.
  - The tile's link to `/lens?persona=<id>` is stretched over the whole column, so a click anywhere in it opens the Lens.
  - Hovering the tile opens the persona's **CastCard** (`components/cast-card.tsx`) in a Radix hover card. That is where the description shows whole; the lineup clamps it to three lines.
  - The matrix and the card read a profile through one model, `cast/dimensions.ts`.
  - The control tag comes from the profile, not from Ada's id: core's `constraintCount` is 0, its own test of the control.
  - The gauges use the reference's rulers: contrast 1–7, font 8–24 px, target 16–48 px.
  - The lead says "A threshold cites its source; every other number is folk.", as `docs/RULES.md` and the report's basis have it, and the legend's dotted line reads "folk / llm · no source".
- **Runs** (`screens/runs.tsx`): one table.
  - The filters are rows of segment-look links, so a filter stays a place in the URL.
  - Each goal links to its task's report: s3-08's per-task link, kept.
  - F7 AC2 (success and median time per persona) now lives on the Report's cast table, once the task has a report, which takes an Analyst run. `docs/PLAN.md` says so.
- **What left:** `runs/task-results.tsx`, its charts, and `runs/stats.ts` with its test.
  - `PersonaName` and `personaLabel` moved to `components/persona-avatar.tsx`, and `formatSeconds` to `runs/step-replay.tsx` beside `usd`. Nine importers changed one line each.
  - `profileColour` in `avatar/slots.ts` lost its last caller and went too.
  - Recharts left `package.json` and the lockfile.
- **Files outside the list:**
  - `scripts/self-check.ts` lists the screens.
  - `scripts/theme.browser.test.ts` opens the new Cast heading, and `scripts/cast.browser.test.ts` clicks and tabs through it in Chromium.
  - `router.test.tsx` counts the new sections.
  - The nine import lines above.
  - A sentence each in `docs/STACK.md` and `docs/PLAN.md`, and two stale ones out of `docs/DESIGN.md`.
  - Comment-only lines in io's `analyst-runs.ts` and `analyst-text.ts` and the report's `cast-table.tsx`, which cited the deleted `stats.ts`.
- **Keyboard:** keyboard focus on a column's link opens its card as hovering the tile does, so the clamped description is readable without a pointer. A mouse press focuses the link too but opens no card, so a middle click, which opens the Lens in a new tab, leaves none over the matrix.
