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

- [ ] `pnpm --filter @wayford/web test` passes:
  - the matrix shows `—` for a dimension a persona does not set;
  - a `folk` threshold shows the soft tag, and no non-threshold row has a tag;
  - Vera's patterns read 9;
  - a runs row links to its run detail.
- [ ] `pnpm --filter @wayford/web check:self` passes with Cast and Runs listed, in both themes
- [ ] `rg -n "recharts" packages/web` prints nothing
- [ ] The PR shows Cast and Runs at 1280 × 720 beside `docs/design/screens/cast.html`
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- The profile builder (cut for the hackathon, `docs/PLAN.md` F1 AC1).
- Any chart on Runs.
