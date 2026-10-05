# s3-07 — Design direction, tokens and the self-check

Stream: s3
Milestone: week 4
Size: M
Depends on: none

## Context

Read first, in this order:

- `docs/PLAN.md` section "UI" — the brief: two registers, dark by default, persona colour as the only thing that crosses both
- `docs/DEMO.md` — the five screens the jury sees: preview, arena, run detail, report, sweep
- `docs/STACK.md` — Tailwind, shadcn/ui, Inter and JetBrains Mono, Recharts
- `packages/web/src/index.css`, `shell.tsx`, `avatar/parts.ts` (persona colours)
- `packages/filter/src/collect.ts` — the measurement the self-check runs

## Goal

Wayford has one written design direction, its tokens in the web app, the shell and the personas screen in that look, and a check that fails when a screen falls below the filter's own WCAG AA measurement.

## Interface

- Out:
  - `docs/DESIGN.md`, one page: the direction, the two registers, colour, type scale, spacing, radius, motion, chart style, and how a persona colour is used;
  - the tokens in `packages/web/src/index.css`, dark theme by default;
  - the shell and the personas screen restyled;
  - `pnpm --filter @wayford/web check:self`: serves the web app, answers its io requests from fixtures, runs `collect` on each listed screen and prints every text below 4.5:1 and every control below 24 px.
- Files expected to change: `docs/DESIGN.md`, `packages/web/src/index.css`, `shell.tsx`, `screens/personas.tsx`, `packages/web/src/components/ui/**`, a new `packages/web/scripts/check-self.ts` and its test, `packages/web/package.json`, `biome.json`, `docs/STACK.md`

## Constraints

- The look is decided here, once. `s3-08`, `s3-09`, `s3-11` and `s3-12` follow `docs/DESIGN.md` and add no tokens of their own.
- Direction from the brief: the input side is playful (large avatar cards, bold names, one colour per persona), the output side sober (monochrome, dense, evidence first, monospace for seeds and measurements).
- It must read on a projector at 1280 × 720: no text under 14 px, contrast to spare.
- "A tool that measures who an interface works for passes its own measurement" (`docs/ROADMAP.md`, week 4). The self-check uses `collect` from the filter, not axe or a second formula.
- The self-check is a Node script, never bundled, and it needs `collect` from `@wayford/filter`, which Biome bans everywhere in `packages/web` except `@wayford/filter/perceive`. Add a Biome override that allows `@wayford/filter` in `packages/web/scripts/**` only, and one sentence on it under "Package import rules" in `docs/STACK.md`.
- A screen that reads io is measured with data, never in its empty or loading state. The script answers `/api/*` with Playwright's `page.route`, from core fixtures: the run fixture now, and the `Report` and `Sweep` fixtures once `s4-04` and `s4-05` add them.
- The self-check keeps a list of screens that must pass, each with the io responses it is served. This task adds the shell and the personas screen. Each later design task adds its own screens and their responses.
- Every existing test stays green. Accessible names and roles do not change, since tests read them.

## Acceptance

- [ ] `docs/DESIGN.md` exists and the PR shows screenshots of the personas screen before and after, at 1440 × 900 and 1280 × 720
- [ ] `pnpm --filter @wayford/web check:self` passes on the shell and the personas screen, and a test shows it failing on a page with a 3:1 text and a 20 px button
- [ ] The reviewer approves the look in the PR, not only the code
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Restyling the preview, arena, runs and run detail screens beyond what the tokens change by themselves (`s3-11`, `s3-12`).
- A light theme switch.
- New animation. The avatar's motion was cut in week 3.

## Notes for the reviewer

- Judge the look on the projector size. This task sets the bar for every other screen.
