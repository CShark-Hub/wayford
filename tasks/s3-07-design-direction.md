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

- [x] `docs/DESIGN.md` exists and the PR shows screenshots of the personas screen before and after, at 1440 × 900 and 1280 × 720. The four PNGs are on the unmerged `assets/s3-07-screenshots` branch, shown in the PR body.
- [x] `pnpm --filter @wayford/web check:self` passes on the shell and the personas screen, and a test shows it failing on a page with a 3:1 text and a 20 px button.
  - `check:self` prints "1 screen checked: 0 shortfalls" and exits 0.
  - `scripts/self-check.browser.test.ts` covers the failing side: the 3:1 text (`#949494` on white, 3.03:1) and the 20 px button give exactly two shortfalls, and a link at 3:1 and 12 px fails on both, since a control carries its own text.
  - The same file shows a screen that reads io is measured with its data: a fake page drawn 300 ms after its listed `/api/runs` response gives its late 3:1 line as the one shortfall.
  - The same file checks every listed screen, so the check runs in `pnpm test`.
  - Probe: a 12 px badge on the personas screen turns that test red, and `check:self` then exits 1 with 7 shortfalls.
- [x] The reviewer approves the look in the PR, not only the code. Approved in a PR comment at 1280 × 720 and 1440 × 900: five in a row stays.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root: 103 files, 1557 tests.

## Outcome

Built as `docs/specs/2026-10-05-s3-07-design-direction.md` says. Its decision log has every choice; the ones taken during the build are marked "(build)". What differs from this file:

- **The check does more than the Interface lists.** On top of text under 4.5:1 and controls under 24 px, it also fails on:
  - text under 14 px, the projector constraint above;
  - text with no measured contrast, which the filter's own AA check counts as a failure (#125);
  - an `/api` request the screen's list does not answer.
- **The 14 px floor is a token.** `--text-xs` is 14 px, so every `text-xs` on every screen meets it with no edit there. Two sizes bypass the scale:
  - `text-[11px]` in `preview/perceived-page.tsx`, a follow-up for `s3-11`;
  - the 12 px Recharts tick in `runs/task-results.tsx`, a follow-up for `s3-12`.

  `docs/DESIGN.md` bans both kinds.
- **The persona colour on the output side.** `run-detail.tsx` colours the current step's left border with `--persona`. That is more than `docs/DESIGN.md` allows on the output side (a stripe or dot beside the name, and chart series), so it is a follow-up for `s3-12`.
- **What `check:self` cannot see:** text in table cells, `div`s and `span`s outside headings, paragraphs, list items and controls. `docs/DESIGN.md`, "Checked by", says so.
- **`packages/web/tsconfig.json`** includes `scripts`, so the check is typechecked. It is not in the expected files.
- **For later screens:**
  - The preview's perceived pane redraws the target app small and muted on purpose. `s3-11` extends `SelfCheckScreen`, for example with an `exclude` selector, to list it.
  - The screen list answers `/api` from core fixtures by path. A screen that reads io adds its responses there.

## Out of scope

- Restyling the preview, arena, runs and run detail screens beyond what the tokens change by themselves (`s3-11`, `s3-12`).
- A light theme switch.
- New animation. The avatar's motion was cut in week 3.

## Notes for the reviewer

- Judge the look on the projector size. This task sets the bar for every other screen.
