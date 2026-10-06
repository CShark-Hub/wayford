# s3-07 — Design direction, tokens and the self-check: spec

Task: `tasks/s3-07-design-direction.md` · Branch: `feature/s3-07-design-direction` · Date: 2026-10-05
Status: approved 2026-10-05

## Goal

Wayford has one written design direction, its tokens in the web app, the shell and the personas screen in that look, and a check that fails when a screen falls below the filter's own WCAG AA measurement.

## Constraints that bind

- **Two registers** (`docs/PLAN.md`, "UI"):
  - the input side is playful: large avatar cards, bold names, one colour per persona;
  - the output side is sober: monochrome, dense, evidence first, monospace for seeds and measurements;
  - dark by default;
  - the persona colour is the only thing that crosses both registers.
- **Decided once.** `s3-08`, `s3-09`, `s3-11` and `s3-12` follow `docs/DESIGN.md` and add no tokens of their own.
- **Projector:** 1280 × 720, no text under 14 px, contrast to spare.
- **The self-check uses `collect`,** not axe or a second formula. It is a Node script, never bundled. The Biome override allows `@wayford/filter` in `packages/web/scripts/**` only. An override repeats the package's bans in full, at level `error` (`docs/STACK.md`, "Package import rules").
- **A screen that reads io is measured with data**, served by `page.route` from core fixtures, never in its empty or loading state.
- **The screen list.** It names the screens that must pass, each with the io responses it is served. This task adds the shell and the personas screen.
- **No test changes.** Every existing test stays green, and accessible names and roles do not change.
- **Out of scope:**
  - restyling the preview, arena, runs and run detail beyond what the tokens change by themselves;
  - a light theme switch;
  - new animation.

## Design

### 1. The direction (`docs/DESIGN.md`, one page)

**The idea:** a ford at night. The chrome is dark, cool and monochrome, the water. The personas are the only colour in it, the people crossing. Colour therefore always means "who", never decoration, status or brand.

**Two registers:**

| | Input: personas, preview controls, arena | Output: runs, run detail, report, sweep |
|---|---|---|
| Feel | playful, big, colour-led | sober, dense, evidence first |
| Type | bold names (30–36 px, 800 weight), 16 px body | 14–16 px, mono for seeds, measurements, ids and costs, tabular figures |
| Colour | the persona colour as card accent and avatar panel tint | monochrome; the persona colour only as a 4 px stripe or dot beside the persona's name, and as its chart series |
| Shape | `rounded-2xl` cards, generous padding (24 px) | `rounded-md`, tables and rows, 8–12 px padding |

**Colour.**
- Dark theme tokens: a cool near-black background (`oklch(0.16 0.012 250)`), a card one step up (`oklch(0.205 0.014 250)`), a near-white foreground (`oklch(0.97 0.005 250)`) and `muted-foreground` at `oklch(0.72 0.012 250)`. Their contrast was worked once with the filter's own `contrastRatio`, and `docs/DESIGN.md` records it:
  - foreground: 17.8:1 on the background and 16.4:1 on the card;
  - muted: 7.8:1 on the background and 7.2:1 on the card, against 6.9:1 today;
  - `check:self` guards the 4.5:1 floor on every listed screen, not these margins.
- Primary is near-white on dark, with no brand hue.
- `destructive` is the one non-persona hue, kept for errors, never for a persona's failure: a failed run is a fact, not an alarm.
- **Persona colour:** `paletteOf(hue).persona` stays as it is, `oklch(0.75 0.12 h)`. On the new card it measures 7.6:1 to 8.5:1 across all 12 hues, worked the same way, so `parts.ts`'s "7.5:1 or more on the dark card" stays true. It may colour a name or a stripe. It is never a background behind text, never a status, and never two personas' colours mixed.
- The light `:root` values stay shadcn's. There is no switch, and `index.html` keeps `class="dark"`.

**Type scale.**
- Tailwind's scale, with one token change: `--text-xs` is raised to 14 px (`0.875rem`, line height 1.25rem). Every `text-xs` on every screen then meets the floor through the token alone.
- Two sizes bypass the scale today, and `docs/DESIGN.md` bans both kinds (arbitrary `text-[…]` sizes, chart ticks under 14 px):
  - `text-[11px]` in `preview/perceived-page.tsx:155`;
  - the Recharts tick at `fontSize: 12` in `runs/task-results.tsx:88`.

  They are follow-ups for `s3-11` and `s3-12`, whose screens they are on.
- `text-sm` is also 14 px. `docs/DESIGN.md` says to use `text-sm`, and that `text-xs` exists only so old classes stay legal.
- Sizes in use: 14 for meta, badges and tables; 16 for body; 18 for leads; 20 and 24 for section titles; 30 and 36 for persona names and screen titles on the input side.

**Spacing, radius, motion and charts.**
- Spacing is Tailwind's 4 px grid: 24 between cards and as card padding on the input side, 8 and 12 on the output side.
- Radius: `--radius` stays 0.625 rem. Input cards take `rounded-2xl`, output surfaces `rounded-md`.
- Motion: colour and opacity transitions only, 150 ms, none under `prefers-reduced-motion`. No new animation.
- Chart style, for Recharts in `s3-09`:
  - series in persona colours, everything else in `foreground` or `muted-foreground`;
  - grid lines in `border`, axis ticks 14 px mono;
  - no gradients, fills under lines or 3D;
  - a boundary value is a labelled vertical rule.

### 2. Tokens (`packages/web/src/index.css`)

- The `.dark` block gets the new values (above). The `:root` (light) block is untouched.
- In `@theme`: `--text-xs: 0.875rem; --text-xs--line-height: 1.25rem;`.
- A base rule under `@media (prefers-reduced-motion: reduce)`: `--default-transition-duration: 0s` on `:root` (build, see the decision log).
- No new token names. The persona colour stays a JS value (`personaColour`), since it depends on the profile.

### 3. Shell (`shell.tsx`)

- Header `h-16`, its content aligned to the same `max-w-7xl` container as the screens that use it (personas, arena, runs); `docs/DESIGN.md` names it the page column (review).
- The wordmark is `inline-flex h-10 items-center text-lg font-bold`. An inline 18 px link measures about 21 px tall, under the 24 px floor.
- Nav links are `text-sm`. Their active state is `bg-accent` with the foreground colour, and a hover state.
- Only class names change. Every link keeps its text and the `nav[aria-label="Main"]`.

### 4. The personas screen (`screens/personas.tsx`), input register

- **Title:** `text-3xl font-bold`. The explainer line is `text-base`.
- **Grid:** one row of five at ≥ 1280 px (`xl:grid-cols-5`), two columns below, one on a phone.
- **Card:**
  - `rounded-2xl` with the 4 px persona-colour top border;
  - the avatar as it is: it already draws its own disc in the persona's colours, so no second tint goes behind it;
  - the name in `text-3xl font-extrabold`;
  - the description in `text-sm text-muted-foreground`;
  - device and budget below; the budget value in mono.
- **Threshold rows:** the reading in mono (`Contrast 4.5:1`), `soft 0.2` in mono and muted, and the provenance badge in `text-sm` mono.
- **Unchanged:** the headings, the `article[aria-labelledby]`, every text the tests read, and the dashed outline of `folk` and `llm`.

### 5. The self-check (`pnpm --filter @wayford/web check:self`)

`packages/web/scripts/self-check.ts` is the testable module:

```ts
export const SELF_CHECK_FLOOR = { contrast: 4.5, targetPx: 24, fontPx: 14 } as const;

/** A screen that must pass, and the io responses it is served, keyed by path under /api. */
export interface SelfCheckScreen {
  name: string;
  path: string;                       // e.g. "/personas"
  /** Shown once the screen has its data; the check measures after it is visible. */
  ready: string;                      // a Playwright selector, e.g. 'role=heading[name="Personas"]'
  responses: Record<string, unknown>; // "/runs" -> runResultFixture, … ; empty for these two
}

export const SELF_CHECK_SCREENS: readonly SelfCheckScreen[];   // personas (with the shell around it)

export type Shortfall = { screen: string; key: string; role: string; name: string } & (
  | { metric: "contrast" | "targetPx" | "fontPx"; value: number; floor: number }
  /** Text whose background `collect` could not resolve, so it has no contrast to compare. */
  | { metric: "unmeasured" }
);

/** Every element under the floor, from a measurement. Pure. */
export function shortfalls(screen: string, measurement: PageMeasurement): Shortfall[];

/** The measurement, kept so a caller can see what was measured, and its shortfalls. */
export interface ScreenCheck { measurement: PageMeasurement; shortfalls: Shortfall[] }

export async function checkScreen(page: Page, origin: string, screen: SelfCheckScreen): Promise<ScreenCheck>;
```

- **`shortfalls`** works on `collect`'s metrics:
  - text with `contrast < 4.5` or `fontPx < 14`;
  - text that has `fontPx` but no `contrast`, which is `"unmeasured"`. `collect` leaves contrast out when the background is unknown, and the filter's own AA check counts that as a failure (`docs/RULES.md`, #125);
  - a control with `targetPx < 24`;
  - each comparison strict, as the filter's `>=` passes a value at the floor.
- **The 14 px floor** is the task's projector constraint. It is checked here because nothing else would catch a regression.
- **`checkScreen`, in order:**
  1. Route every request whose `pathname` starts with `/api/`. Match by predicate, not the glob `**/api/**`, which also catches Vite's module URLs for `src/api/*.ts` and blanks the app; this was found while taking the "before" screenshots. A path in `responses` is fulfilled as JSON. Any other path is recorded and fulfilled with 404.
  2. Open `origin + path`.
  3. Race `ready` against the first unanswered request. An unanswered request throws `WayfordError("self_check_unanswered", …)` naming the path, so a screen is never measured empty, and never times out instead of saying why.
  4. Wait for `document.fonts.ready`, so Inter is measured, not the fallback.
  5. Run `collect`, then `shortfalls`.

`packages/web/scripts/check-self.ts` is the CLI:
- it starts the web app on Vite at port 0, as `preview.browser.test.ts` does;
- it launches Chromium at a 1280 × 720 viewport and runs `checkScreen` on every listed screen;
- it prints one line per shortfall (`personas  link "Runs"  contrast 3.1 < 4.5`) and a summary;
- it exits 1 on any shortfall or unanswered request, and 0 otherwise.

`package.json`: `"check:self": "tsx scripts/check-self.ts"`, with `tsx` as a dev dependency (`docs/STACK.md` lists it as the runner for scripts).

`tsconfig.json`: `include` gains `scripts`, so the typecheck covers it.

`scripts/self-check.browser.test.ts`:
1. It loads a page with 3:1 text and a 20 px button. The page is served with `page.route` on a fake `http://self-check.test/` origin, because `collect` needs an http(s) URL. `checkScreen` returns exactly those two shortfalls: contrast for the text, and `targetPx` for the button.
2. It runs every screen in `SELF_CHECK_SCREENS` against the real app.
   - Each returns no shortfalls.
   - Each measurement holds text and controls, and the personas screen's holds its `Personas` heading, so an empty page cannot pass.
   - This guards later screens and tokens through `pnpm test`.
3. A page that requests an unanswered `/api` path rejects with `self_check_unanswered`, naming the path.
4. A page whose text sits on a background image is reported as `"unmeasured"`.

### 6. Lint and docs

- `biome.json` gets an override for `packages/web/scripts/**`, placed after the web one. It repeats every web ban at `error` except the bare `"@wayford/filter"` path ban. The `["@wayford/filter/**", "!@wayford/filter/perceive"]` pattern stays, so `scripts/` reaches the main entry (`collect`) and nothing else: not `./routes`, not `./serve-target-app`. A lint probe confirms that a subpath still fails there.
- `docs/STACK.md`, "Package import rules": one sentence. Web's `scripts/` may import `@wayford/filter`, for the self-check's `collect`. It is Node only and never bundled; `src/` keeps the `./perceive`-only rule.

### 7. Screenshots for the PR

`runs/s3-07/screenshots.ts`, which is gitignored and not committed, takes the personas screen at 1440 × 900 and 1280 × 720. It runs once on `origin/main` for "before" and once on the branch for "after". The PNGs go in the PR body, from a branch that holds them only (`assets/s3-07-screenshots`, never merged), so `main` stays free of binaries.

## Files

| File | Why |
|---|---|
| `docs/DESIGN.md` | new, the direction (section 1) |
| `packages/web/src/index.css` | dark tokens, the 14 px `--text-xs`, reduced motion |
| `packages/web/src/shell.tsx` | restyled header |
| `packages/web/src/screens/personas.tsx` | restyled in the input register |
| `packages/web/src/components/ui/button.tsx` | its `xs` size is 24 px tall with `text-xs`, which is now 14 px. Its padding and gap are checked to fit, and only class names change, if any |
| `packages/web/scripts/self-check.ts` | new, `shortfalls`, `checkScreen`, the screen list |
| `packages/web/scripts/check-self.ts` | new, the CLI |
| `packages/web/scripts/self-check.browser.test.ts` | new, the failing page, the listed screens passing, the unanswered request |
| `packages/web/package.json` | `check:self`, `tsx` dev dependency (and `pnpm-lock.yaml`) |
| `packages/web/tsconfig.json` | `scripts` in `include`. Outside the task's list: without it the script is not typechecked |
| `biome.json` | the scripts override |
| `docs/STACK.md` | the import-rule sentence |
| `tasks/s3-07-design-direction.md` | boxes ticked, Outcome |

## Acceptance mapping

| Acceptance box | Proven by |
|---|---|
| `docs/DESIGN.md` exists; the PR shows the personas screen before and after, at 1440 × 900 and 1280 × 720 | The file. Four PNGs from `runs/s3-07/screenshots.ts`, linked in the PR body |
| `check:self` passes on the shell and personas, and a test shows it failing on 3:1 text and a 20 px button | `pnpm --filter @wayford/web check:self`, exit 0. `self-check.browser.test.ts`: "a page with 3:1 text and a 20 px button fails on exactly those two", and "every listed screen passes" |
| The reviewer approves the look in the PR | Left to the reviewer. The PR asks for it, at projector size |
| `pnpm lint`, `pnpm typecheck`, `pnpm test` pass | The three commands at the root |

## Decision log

| Question | Taken | Why |
|---|---|---|
| A brand hue? | None; monochrome chrome, colour means "who" | The brief makes the persona colour the only thing crossing registers. A brand hue would compete with five persona hues |
| How to hold the 14 px floor on screens this task does not restyle | Raise `--text-xs` to 14 px in `@theme` | A token-only change, which Out of scope allows ("what the tokens change by themselves"). It covers 24 `text-xs` uses across 10 files with no edits there |
| Should the check also test font size? | Yes, `fontPx < 14` is a shortfall | It is the task's projector constraint. Without it nothing catches a later screen drawing 12 px |
| Contrast floor for large text (WCAG allows 3:1)? | A flat 4.5:1 | The task says "every text below 4.5:1", and contrast to spare suits a projector |
| Where the testable logic lives | `scripts/self-check.ts`, the CLI a thin `check-self.ts` | The test imports the logic without spawning a process |
| Viewport for the check | 1280 × 720 | The projector size the constraints name |
| How the check runs in CI | Through `pnpm test` (`self-check.browser.test.ts` runs the listed screens) | Later design tasks then fail tests, not only a script nobody runs |
| An unanswered `/api` request | Fails the check | Otherwise a screen is measured empty, which the task forbids |
| Personas grid | Five in a row at ≥ 1280 px | All five personas are visible at once on the projector; the input side is about the cast |
| Screenshots in the PR | From an unmerged `assets/s3-07-screenshots` branch | `gh` cannot upload images to a PR body, and `main` stays free of binaries |
| Persona colour value | Unchanged | Avatars and their checked contrast stay as they are. On the new card every hue measures 7.6:1 or more with the filter's `contrastRatio`, so `parts.ts`'s comment holds |
| Text with no measured contrast | A shortfall, `"unmeasured"` | The filter's own AA check counts it as a failure (`docs/RULES.md`, #125). Passing it would let a screen hide text from the check |
| An unanswered `/api` request | Throws `self_check_unanswered`, racing `ready` | A named failure instead of a 30 s timeout on a `ready` that never shows |
| Avatar panel tint | None | The avatar already draws a disc in the persona's colours (seen in the "before" screenshots) |
| Which elements get which check (build) | Every element gets all four: contrast, font size, target size and unmeasured | A control carries its label's text (core's `measurement.ts`). Checking text blocks only let a 2.2:1, 12 px nav pass (branch review, round 1) |
| Reduced motion (build) | `--default-transition-duration: 0s` in `@layer base` | Every `transition-*` utility reads it, so no `!important` and no lint override (simplify pass). Verified: the nav link's transition goes from 0.15 s to 0 s |
| Persona colour on input controls (build) | Allowed: slider fill, selected tile border, checkbox `accent-color`, race tile border, set as `--persona` | The preview and the arena already do it. `DESIGN.md` describes it so `s3-11` and `s3-12` follow one rule (branch review, round 1) |
| Personas grid (review) | Five in a row stays | The reviewer approved the look at 1280 × 720 and 1440 × 900: every persona is on screen, and Vera's contrast row, the axis her sweep moves, is above the fold |
| How a persona colour reaches a control (review) | `DESIGN.md` no longer says "set as `--persona`" | The arena's tile and checkbox, and the persona card, set the colour inline; the page says where the colour may go, not how it is applied |
| The page column (review) | `max-w-7xl`, named in `DESIGN.md` | The header keeps to it, but the preview and loaded run detail use 1400 px. Naming it lets `s3-11` and `s3-12` move them onto it; restyling them here is out of scope |
| The shared button's transition (review) | `transition-colors`, not shadcn's `transition-all` | `DESIGN.md` allows colour and opacity transitions only; `transition-all` also animated the focus ring |
| `check:self`'s printed value (review) | As measured, not rounded | Rounding printed 4.496 as "contrast 4.5 < 4.5". Contrast already arrives truncated to three decimals |
| A test that the check waits for a screen's data (review) | A fake page drawn 300 ms after a listed `/api/runs` response | The listed-screen guard only needs one text and one control, which the heading and nav give alone. This test goes red without the `ready` wait or the listed-response branch |

## Risks

- **Five cards in one row at 1280 px** may not fit the thresholds without wrapping into tall cards. The fallback is three plus two, logged as a (build) row.
- **The preview's perceived pane** redraws the target app scaled down and muted on purpose, so it cannot pass this check as the contract stands. `s3-11` extends `SelfCheckScreen`, for example with an optional `exclude` selector for that region, and says why in `docs/DESIGN.md`. This task adds no field it does not use.
- **The new tokens may push an existing screen below the floor.** Those screens are not on the list yet, so it is not this task's failure. A clear case found while checking is logged as a follow-up for `s3-11` or `s3-12`.

## Review note

Spec review: **ready after fixes**. All eight findings were taken:

1. Text with no measured contrast is a shortfall (`"unmeasured"`). Test 2 asserts that something was measured.
2. An unanswered request has a mechanism: it throws `self_check_unanswered`, racing `ready`.
3. The "no class can draw under 14 px" claim is dropped. `text-[11px]` and the 12 px chart tick are logged as follow-ups, and `DESIGN.md` bans both kinds.
4. The contrast figures were worked with the filter's `contrastRatio` and stated as such, not as something `check:self` proves. The persona colour still clears 7.5:1 on the new card, so `parts.ts` needs no edit.
5. The Biome override keeps the subpath pattern and drops only the bare path ban.
6. The wordmark's classes are named.
7. The font wait is a step of `checkScreen`.
8. Risks say `s3-11` extends the screen shape for the perceived pane.

Added from the "before" screenshots: the `/api` route predicate, and no avatar tint panel.
