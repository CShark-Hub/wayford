# s3-13 — Redesign foundation: tokens, themes, top bar, renamed routes

Stream: s3
Milestone: week 4
Size: M
Depends on: none. Coordinates with `s4-06`, which is in progress (see Constraints).

## Context

Read first, in this order:

- `docs/adr/0002-daylight-instrument-redesign.md` — what changed and why
- `docs/DESIGN.md` — all of it; this task builds its foundation
- `docs/design/tokens.css`, `components.html` and `screens/*.html` — the source of every value, and the picture to match, opened in a browser
- `packages/web/src/index.css`, `shell.tsx` and `router.tsx` — the token block, the header, the routes
- `packages/web/src/avatar/parts.ts` and `packages/web/scripts/self-check.ts`

## Goal

Every existing screen wears the new system through its tokens alone. In use:

- the top bar, with the renamed routes;
- the theme toggle;
- the restyled Button;
- the persona slots, with the avatar and chip.

The small components that several screen tasks need at once exist and are tested: SegmentedControl, Tag, SourceBadge, Banner and Skeleton. The top bar uses SourceBadge and Tag; each screen task adopts the rest on its own screen. `check:self` holds Wayford to Vera's floors in both themes.

## Interface

- In: nothing new.
- Out:
  - **Routes:** `/cast` (was `/personas`), `/lens` (was `/preview`) and `/race` (was `/arena`), with `/` redirecting to `/cast`.
  - **Components** in `packages/web/src/components/`:
    - TopBar, with a slot each screen fills with its own source badge and backend tag;
    - Button;
    - SegmentedControl, Tag, SourceBadge, Banner and Skeleton, each with a test;
    - PersonaAvatar tile and PersonaChip.
  - **Slots:** a profile-to-slot function in `avatar/`.
- Files expected to change:
  - `packages/web/index.html`, for the boot script;
  - `src/index.css`, `src/shell.tsx`, `src/router.tsx`;
  - `src/components/**`, `src/avatar/**`;
  - the route and label lines in `src/screens/*.tsx`;
  - the persona-colour lines in every caller of `personaColour`, each moved to its slot:
    - `src/arena/start-panel.tsx`;
    - `src/arena/race-view.tsx` and its test;
    - `src/runs/task-results.tsx`, with `personaColourOf`;
    - `src/screens/run-detail.tsx`, `preview.tsx` and `personas.tsx`.
  - `scripts/self-check.ts`, `scripts/check-self.ts`, and the floors in `scripts/self-check.browser.test.ts`;
  - `packages/web/package.json`;
  - tests only where they read a route, a label, a class or a floor.

## Constraints

- **Look only.** What each screen fetches, decides and does stays as it is. Screen layouts are their own tasks.
- **Tokens.**
  - Every value is copied from `docs/design/tokens.css`, as `docs/DESIGN.md`, "In code" says.
  - No colour, size, radius or shadow is written outside the token block in `index.css`.
  - shadcn's default palette goes.
- **Themes.**
  - CSS keys on `data-theme` only.
  - A boot script inline in `index.html` sets it before first paint: the stored choice if there is one, else `prefers-color-scheme`. Storage access can throw, so wrap it.
  - The top bar's one toggle flips the theme and stores the choice. No theme menu.
- **Top bar.**
  - The numbered story nav: `01 Cast`, `02 Lens`, `03 Race`, `04 Report`, `05 Boundary`.
  - A nav entry exists only for a route that exists: `s3-08` adds Report, `s3-09` adds Boundary.
  - `Runs` sits apart. Events leaves the nav and keeps its route.
  - The source badge and backend tag come from each screen's own data, so this task renders the slot and fills nothing. Nothing about the source or the backend is hard-coded.
  - No sidebar, no command palette.
- **Persona slots.**
  - The five fixtures are pinned by profile id: Ada graphite, Vera cobalt, Kai raspberry, Milo jade, Zoya violet. Any other profile takes the neutral fallback.
  - The avatar reads its colours from CSS variables, and the same profile still gives the same SVG (`docs/PLAN.md` F1 AC4).
  - `personaColour`, `paletteOf` and the 12-hue wheel go.
  - Each caller colours with `var(--persona-<slot>)` instead, and changes nothing else in its file. Where a library needs a plain colour string, read the token's computed value: the Recharts bars in `task-results.tsx`.
- **Fonts.**
  - `@fontsource-variable/bricolage-grotesque/opsz.css`, `@fontsource-variable/geist` and `@fontsource-variable/geist-mono`. No CDN.
  - Web's Inter and JetBrains Mono files and their `@font-face` rules go. The target app keeps its own Inter.
- **Icons:** `lucide-react` stays, at 20 px with a 1.75 stroke.
- **Floors.** In `check:self`:
  - text 4.5:1 and 16 px, targets 32 px;
  - every listed screen checked in both themes.
- **`s4-06`** edits `screens/preview.tsx` and its test, and is in progress.
  - This task renames no file.
  - If `s4-06` merges first, rebase onto it before review. If this task merges first, tell its owner, since their rebase meets the renamed `/lens` URLs in that test.

## Acceptance

- [ ] `pnpm --filter @wayford/web test` passes, the avatar's determinism test included
- [ ] `pnpm --filter @wayford/web check:self` passes on `/cast` in Daylight and Night, and its output names the 16 px and 32 px floors
- [ ] `rg -n "#[0-9a-fA-F]{3,8}\b|rgba?\(|oklch\(" packages/web/src -g '!index.css' -g '!*.test.*'` prints nothing
- [ ] `rg -n "personaColour|paletteOf" packages/web/src` prints nothing
- [ ] With the OS in dark mode, the app opens in Night. Flipping the toggle to Daylight survives a reload.
- [ ] The PR shows Cast, Lens, Race and Runs at 1280 × 720 in Daylight and Night, before and after
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Any screen's layout: `s3-11` (Lens), `s3-12` (Race and run detail), `s3-08` (Report), `s3-09` (Boundary) and `s3-14` (Cast and Runs, optional).
- Outcome (`s3-12`) and EmptyState (`s3-08`): each has one screen task that uses it, and that task builds it.
- Swapping the existing screens' banners, loading text and selects for the new components: each screen's own task does that.
- Redirects from the old paths.
- The Lens animation and any other motion beyond 160 ms colour transitions.
- Removing Recharts (`s3-14`).

## Notes for the reviewer

- Every screen task waits on this one: review it the day it opens.
- Check the renamed routes against the tests that read them, and that a persona's avatar is byte-for-byte unchanged apart from colour.
