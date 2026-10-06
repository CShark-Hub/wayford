# s3-13 — Redesign foundation: tokens, themes, top bar, renamed routes: plan

Spec: `docs/specs/2026-10-06-s3-13-redesign-foundation.md`
Status: approved 2026-10-06 (auto)

All paths are under `packages/web/` unless they start with `docs/`, `tasks/` or `pnpm-lock.yaml`. Every command runs from the worktree root. Every step ends with `pnpm --filter @wayford/web typecheck` green, so no commit leaves the branch uncompiled.

| # | Step | Files | Serves box | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | Tokens, fonts and the theme contract | `index.html`, `package.json`, `pnpm-lock.yaml`, `public/fonts/**` (deleted), `src/index.css`, `src/theme.ts`, `src/theme.test.ts` | 1, 3, 5 | `theme.test.ts`: the boot script from `index.html`, run with stubbed storage and `matchMedia`, sets `data-theme` for stored dark, stored light, nothing stored with the OS dark, a junk value, and storage that throws. Its key equals `THEME_STORAGE_KEY`. `applyTheme` keeps the attribute when storage throws | `vitest run src/theme.test.ts` green; `pnpm --filter @wayford/web build` compiles the CSS and bundles the three fonts; web typecheck green | — |
| 2 | Persona slots, the avatar in slot colours, and every caller moved to slots | `src/avatar/slots.ts`, `slots.test.ts`, `parts.ts`, `parts.test.ts`, `avatar.tsx`, `avatar.test.tsx`; `src/components/persona-avatar.tsx`, `persona-avatar.test.tsx`; the persona lines of `src/screens/personas.tsx`, `preview.tsx`, `run-detail.tsx`, `src/arena/start-panel.tsx`, `race-view.tsx`, `src/runs/task-results.tsx`; `src/arena/race-view.test.tsx`, `race.test.tsx` | 1, 3, 4 | `slots.test.ts`: five fixtures pinned, other ids fallback, `slotColour` and `slotStyle` strings. `avatar.test.tsx`: no markup matches the acceptance pattern, and every `fill`/`stroke` value is in the spec's list. `persona-avatar.test.tsx`: the tile sets `--p`, `--p-ink`, `--p-soft` and holds the avatar; the chip's square and name. `race-view.test.tsx`: Vera's top border is `var(--persona-cobalt)`; the dimmed avatar's tile carries `opacity-50` (`race.test.tsx` too) | Web tests green; web typecheck green; `rg -n "personaColour\|paletteOf" packages/web/src` prints nothing; the byte check (notes) prints 42 equal | 3 |
| 3 | Button restyle and the small components | `src/components/ui/button.tsx`, `button.test.ts`, `src/components/{segmented-control,tag,source-badge,banner,skeleton}.tsx` and a `.test.tsx` each | 1 | One static-render test per component, written first (spec, §6 and §7). `pickedValue` keeps the current value on an empty pick | `vitest run src/components` green; web typecheck green | 2 |
| 4 | Top bar, theme toggle, shell, routes and labels | `src/components/top-bar.tsx`, `top-bar.test.tsx`, `theme-toggle.tsx`, `theme-toggle.test.tsx`; `src/shell.tsx`; `src/router.tsx`, `router.test.tsx`; the path, `<h1>` and `to=` lines of `src/screens/{personas,preview,arena}.tsx`; `src/screens/arena.test.tsx`, `preview.test.tsx` (nav test, URLs), `preview.browser.test.ts` (URLs) | 1, 5, 7 | `top-bar.test.tsx`: the story nav lists 01 Cast, 02 Lens, 03 Race with the current one marked; no Events; Runs outside the nav; an empty slot element; `TopBarSlot` renders nothing statically. `theme-toggle.test.tsx`: label and icon per theme. Router test: `/cast` renders the cards and the `Story` nav | Web tests green; root `pnpm typecheck` green (typed routes) | — |
| 5 | Self-check in both themes, and the theme in the browser | `scripts/self-check.ts`, `check-self.ts`, `self-check.browser.test.ts`, `scripts/theme.browser.test.ts` | 2, 5 | `self-check.browser.test.ts`: fake-page floors at 16 px and 32 px; `cast` in Daylight and Night. `theme.browser.test.ts`: OS dark opens Night; the toggle flips to Daylight, which survives a reload | `pnpm --filter @wayford/web check:self` exits 0 and names both floors; browser tests green | — |
| 6 | Verify | `tasks/s3-13-redesign-foundation.md` | all | — | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `check:self`, both `rg` commands; by hand: OS dark, toggle, reload; the Recharts bars' and axes' computed colours in both themes; after screenshots; the avatar byte check | — |

## Notes

**Step 1** is foundational and judgement-heavy (the alias table), so the orchestrator builds it. The three Fontsource packages go in with `pnpm --filter @wayford/web add`. No other step touches `pnpm-lock.yaml`.

**Step 2, the byte check.**
- `origin/main`'s markup is already dumped to the scratchpad as `avatar-before.json`: every fixture in every state, plus a tablet Ada, 42 avatars.
- After the step, the same dump runs on the branch.
- Each pair is compared with every `fill="…"` and `stroke="…"` value masked. All 42 must be equal, and the output goes in the PR.

**Step 2** removes `personaColour` and moves its callers in the same step, so the branch compiles after every commit. It needs care around the draw order, so it runs on Opus.

**Step 3** has files disjoint from step 2's, so the two run in parallel after step 1. It is mechanical against the spec's class lists, so it runs on Sonnet.

**Step 4** runs after step 2, since both touch `personas.tsx` and `preview.tsx`. It also comes after step 3, since the top bar uses the ghost Button.

**Step 6**'s screenshots use the scratchpad's `shots.ts`.
- It serves io from core fixtures at 1280 × 720.
- It shoots `/cast`, `/lens?persona=prof_vera&seed=1`, `/race` and `/runs` in light and dark.
- The before set came from `origin/main`.
