# s3-13 — Redesign foundation: tokens, themes, top bar, renamed routes: spec

Task: `tasks/s3-13-redesign-foundation.md` · Branch: `feature/s3-13-redesign-foundation` · Date: 2026-10-06
Status: approved 2026-10-06 (auto)

## Goal

Every existing screen wears the Daylight/Night system of `docs/DESIGN.md` through its tokens alone, with the top bar, the renamed routes, the theme toggle, the restyled Button and the persona slots in use, the small shared components built and tested, and `check:self` holding Wayford to Vera's floors in both themes.

## Constraints that bind

- **Look only** (task): what each screen fetches, decides and does stays. Screen layouts belong to `s3-11`, `s3-12`, `s3-08`, `s3-09`, `s3-14`.
- **Tokens** (task, `docs/DESIGN.md` "In code"): every value copied from `docs/design/tokens.css`; no colour, size, radius or shadow written outside the token block in `index.css`; shadcn's default palette goes.
- **Themes:** CSS keys on `data-theme` only; an inline boot script in `index.html` sets it before first paint (stored choice, else `prefers-color-scheme`, storage wrapped in `try`); one toggle, no menu.
- **Top bar:** `01 Cast`, `02 Lens`, `03 Race`; an entry only for a route that exists; `Runs` apart; Events leaves the nav and keeps `/events`; a slot for each screen's source badge and backend tag, filled by nothing here; no sidebar, no command palette.
- **Persona slots:** pinned by profile id (Ada graphite, Vera cobalt, Kai raspberry, Milo jade, Zoya violet), anything else the fallback. The avatar reads colours from CSS variables; same profile, same SVG (`docs/PLAN.md` F1 AC4). `personaColour`, `paletteOf` and the 12-hue wheel go. Each caller colours with `var(--persona-<slot>)` and changes nothing else in its file.
- **Fonts** from Fontsource, already in `docs/STACK.md`; web's Inter and JetBrains Mono go; target-app keeps its own Inter.
- **Icons:** `lucide-react` at 20 px, stroke 1.75.
- **Floors** in `check:self`: text 4.5:1 and 16 px, targets 32 px, every listed screen in both themes.
- **`s4-06`** (PR #173, open) edits `screens/preview.tsx` and its tests: rename no file; rebase onto it if it merges first, else tell its owner.
- **Out of scope:** any screen's layout; Outcome and EmptyState; swapping the screens' own banners, loading text and selects for the new components; redirects from old paths; motion beyond 160 ms colour transitions and the skeleton shimmer; removing Recharts.
- **Reviewer note:** a persona's avatar is byte for byte unchanged apart from colour.

## Design

### 1. Tokens: `packages/web/src/index.css`

One fenced token block, then rules that hold only `var()` references.

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/bricolage-grotesque/opsz.css";
@import "@fontsource-variable/geist";
@import "@fontsource-variable/geist-mono";

@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

/* ---- Tokens: copied from docs/design/tokens.css. No value is written outside this block. ---- */
:root, [data-theme="light"] { …Daylight colours and shadows, verbatim… }
[data-theme="dark"]        { …Night colours and shadows, verbatim… }
:root { --space-1 … --space-9, --header-h, --rail-w, --content-max, --control-h, --target-min,
        --stroke-hair/rule/post, --z-sticky/overlay/toast  (verbatim)
        --persona-fallback: var(--ink-3); --persona-fallback-ink: var(--ink-2);
        --persona-fallback-soft: var(--paper-sunken); }
@theme {
  --font-display / --font-sans / --font-mono: the stacks, verbatim;
  --font-mono--font-feature-settings: "tnum", "zero";   /* tabular, slashed zero */
  --radius-xs: 2px; --radius-sm: 6px; --radius-md: 10px; --radius-lg: 20px;  /* verbatim */
  --text-xs: 1rem; --text-xs--line-height: 1.5rem;   /* the 16 px floor: old classes stay legal */
  --text-sm: 1rem; --text-sm--line-height: 1.5rem;
  --default-transition-duration: 160ms; --default-transition-timing-function: ease-out;
  --animate-shimmer: shimmer 1.4s ease-in-out infinite;  @keyframes shimmer { to { transform: translateX(100%) } }
}
@utility display-xl { … }  …  @utility mono-label { … }   /* the ten type styles, verbatim */
/* ---- end of tokens ---- */

@theme inline {
  /* Wayford's own names */
  --color-paper: var(--paper); … every colour token, persona-* (incl. fallback) and avatar-*;
  /* shadcn's names, kept so every existing screen changes through its tokens alone */
  --color-background: var(--paper);      --color-foreground: var(--ink);
  --color-card: var(--surface);          --color-card-foreground: var(--ink);
  --color-popover: var(--surface);       --color-popover-foreground: var(--ink);
  --color-primary: var(--ink);           --color-primary-foreground: var(--paper);
  --color-secondary: var(--paper-sunken);--color-secondary-foreground: var(--ink);
  --color-muted: var(--paper-sunken);    --color-muted-foreground: var(--ink-2);
  --color-accent: var(--paper-sunken);   --color-accent-foreground: var(--ink);
  --color-destructive: var(--fault);     --color-border: var(--line);
  --color-input: var(--line-strong);     --color-ring: var(--focus-ring);
}
@layer base {
  :root { color-scheme: light } [data-theme="dark"] { color-scheme: dark }
  * { @apply border-border }
  body { @apply bg-background text-foreground font-sans antialiased; font-size/line-height via --text-base }
  :focus-visible { outline: var(--stroke-rule) solid var(--focus-ring); outline-offset: var(--stroke-rule) }
  @media (prefers-reduced-motion: reduce) { :root { --default-transition-duration: 0s } *, ::before, ::after { animation: none } }
}
```

- The old `:root` and `.dark` oklch blocks, `--radius`, the `@font-face` rules and the chart and sidebar aliases go.
- `--text-xs` and `--text-sm` drawing 16 px is how the screens meet the 16 px floor without touching their files, as `s3-07` did for 14 px.
- Only `@theme` keys Tailwind owns go in `@theme`: fonts, radii, text, transition, animation. The rest stay plain `:root` variables, used as `p-(--space-5)` or `h-(--header-h)`.
- `shadow-raised` and `shadow-pop` are themed, so they are not Tailwind keys: a component writes `shadow-(--shadow-raised)`.

### 2. Theme

`index.html` drops `class="dark"`. Its `<head>` gets an inline classic script before any stylesheet or module:

```html
<script>
  (function () {
    var theme;
    try { theme = localStorage.getItem("wayford-theme"); } catch (error) {}
    if (theme !== "light" && theme !== "dark") {
      theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", theme);
  })();
</script>
```

`src/theme.ts`, the app's side of the same contract:

```ts
export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "wayford-theme";
/** The theme the boot script set; "light" where there is no document (a static render). */
export function currentTheme(): Theme;
/** Writes `data-theme` and the stored choice; a storage that throws keeps the attribute. */
export function applyTheme(theme: Theme): void;
export function otherTheme(theme: Theme): Theme;
```

`src/components/theme-toggle.tsx`: `ThemeToggle`, a ghost icon Button (40 px). Its icon shows the current theme (lucide `Sun`, `Moon`, 20 px, stroke 1.75); its `aria-label` names the action, `Switch to Night` or `Switch to Daylight`. State is `useState(currentTheme)`; a click calls `applyTheme(otherTheme(theme))` and sets state.

### 3. Top bar: `src/components/top-bar.tsx`, `src/shell.tsx`

```ts
/** Holds the slot element, so a screen anywhere under the shell can fill it. */
export function TopBarProvider({ children }: { children: ReactNode }): JSX.Element;
/** Wordmark, story nav, then Runs, the slot and the theme toggle. */
export function TopBar(): JSX.Element;
/** A screen's source badge and backend tag, portalled into the top bar. Renders nothing until
 *  the bar's slot element exists, so a static render draws nothing and never calls createPortal. */
export function TopBarSlot({ children }: { children: ReactNode }): ReactPortal | null;

export const STORY_NAV = [
  { number: "01", label: "Cast", to: "/cast" },
  { number: "02", label: "Lens", to: "/lens" },
  { number: "03", label: "Race", to: "/race" },
] as const;   // s3-08 adds 04 Report, s3-09 adds 05 Boundary
```

- The `header` is `h-(--header-h)`, a three-column grid (wordmark, centred nav, right group), `border-b border-line bg-paper`, padded `px-(--space-6)`.
- **Wordmark:** a `Link` to `/cast`, `inline-flex min-h-9 items-center` (36 px, as `.wf-wordmark`), reading "Wayford" in `font-display` 700 at 24 px (`text-2xl`). Before it, three `aria-hidden` spans drawn with Tailwind's spacing scale: the `signal` post, then two steps, one in `ink` and one in `ink-3`, each a little lower and further right, as `components.css` draws `.wf-wordmark::before`.
- **Story nav:** `<nav aria-label="Story"><ul>` of `Link`s. Each shows its number in `font-mono text-ink-3`, `aria-hidden`, so the link's name is its label alone. The current link (`aria-current="page"`, which TanStack sets) gets `bg-surface text-ink`, an inset ink underline and a hairline ring. Others are `text-ink-2` with a `hover:bg-paper-sunken`. Min height 36 px.
- **Right group:** a `Runs` link styled `buttonVariants({ variant: "ghost" })`, then the slot `<div>` (the provider's ref), then `ThemeToggle`.
- `Shell` becomes `TopBarProvider` › `TopBar` + `<main><Outlet/></main>`. The wordmark link and nav move out of `shell.tsx` into `top-bar.tsx`.

### 4. Routes and labels

| File | Path | `<h1>` | Other lines |
|---|---|---|---|
| `screens/personas.tsx` | `/personas` → `/cast` | Personas → Cast | |
| `screens/preview.tsx` | `/preview` → `/lens` | Preview → Lens | two `to="/preview"` → `"/lens"` |
| `screens/arena.tsx` | `/arena` → `/race` | Arena → Race | |
| `router.tsx` | `/` redirects to `/cast` | | |

Files, route constants and component names keep their names (`personasRoute`, `PreviewScreen`): this task renames no file.

### 5. Persona slots: `src/avatar/slots.ts`

```ts
export const PERSONA_SLOTS = ["graphite", "cobalt", "raspberry", "jade", "violet"] as const;
export type PersonaSlot = (typeof PERSONA_SLOTS)[number] | "fallback";
/** The fixtures' slots by profile id; any other id takes "fallback". */
export function slotOf(profileId: string): PersonaSlot;
/** `var(--persona-<slot>)`, `var(--persona-<slot>-ink)` or `var(--persona-<slot>-soft)`. */
export function slotColour(slot: PersonaSlot, tone?: "fill" | "ink" | "soft"): string;
/** `--p`, `--p-ink` and `--p-soft` for an inline style, as `components.css`'s `.wf-p-*` set them. */
export function slotStyle(slot: PersonaSlot): CSSProperties;
```

**`parts.ts`.** `hue`, `HUE_BINS`, `HUE_STEP`, `hueOf`, `Palette`, `paletteOf` and `personaColour` go. The first draw of `rng(profile.seed)` is still taken and discarded, so tuft, brows and pattern keep every persona's values.

**`avatar.tsx`.** The drawing is untouched. Its colours become one constant:

```ts
const COLOURS = {
  persona: "var(--p)",
  ink: "var(--avatar-line)",
  accent: "var(--p-ink)",
  head: "var(--avatar-head)",
} as const;
```

It replaces `paletteOf(parts.hue)` and stays in the same `fill` and `stroke` attributes. Chromium resolves `var()` in SVG presentation attributes; this was checked with Playwright on 2026-10-06. So the markup differs from today's only in those attribute values. The eyes' `white` stays, as in the reference.

**`components/persona-avatar.tsx`.**

```ts
/** The avatar on its squircle tile: slot-soft in Daylight, the fixed avatar-tile in Night.
 *  Sets the slot's variables, which the avatar inside reads. `className` sizes the tile. */
export function PersonaAvatar(props: { profile: Profile; state?: AvatarState; className?: string }): JSX.Element;
/** A 12 px slot-coloured square, then the name. */
export function PersonaChip(props: { slot: PersonaSlot; children: ReactNode }): JSX.Element;
```

- **Tile:** `grid place-items-center overflow-hidden rounded-lg bg-(--p-soft) dark:bg-avatar-tile`. `radius-lg` is DESIGN's radius for avatar tiles. The reference scales the corner with the tile (`calc(var(--s) * 0.3)`), but that is a radius written outside the token block. So a fixed 20 px is taken, and it rounds the small tiles to circles: 24 px in the Lens switcher, 40 px in the start panel. `s3-11` and `s3-12` size those tiles in their layouts.
- **Chip square:** `size-3 rounded-xs bg-(--p)`.

**Callers.** Each changes only its persona lines: the colour, the avatar and the chip.

| File | Today | After |
|---|---|---|
| `screens/personas.tsx` | `borderTopColor: personaColour(profile)`, `<Avatar … size-40>` | `slotColour(slotOf(profile.id))`, `<PersonaAvatar … size-40>` |
| `arena/start-panel.tsx` | `accentColor: personaColour(profile)`, `<Avatar … size-10>` | `slotColour(…)`, `<PersonaAvatar …>` |
| `arena/race-view.tsx` | `borderTopColor: personaColour(profile)`, two `<Avatar … size-20>` | `slotColour(…)`, `<PersonaAvatar …>` (dimmed one keeps `opacity-50`, on the tile) |
| `screens/preview.tsx` | `"--persona": personaColour(state.persona)`, switcher `<Avatar … size-6>` | `slotColour(slotOf(state.persona.id))`, `<PersonaAvatar …>` |
| `screens/run-detail.tsx` | `"--persona": personaColourOf(run.profileId)` | `slotColour(slotOf(run.profileId))` |
| `runs/task-results.tsx` | `BUNDLED.colour`, `personaColourOf`, `UNCOLOURED`, `PersonaName`'s dot, `barOf`'s `fill`; the axes' `AXIS_TICK.fill` `var(--muted-foreground)` and `AXIS_LINE` `var(--border)` | `BUNDLED` keeps labels; `personaColourOf` and `UNCOLOURED` go; `PersonaName` renders `PersonaChip` with a mono id when the persona is not bundled; `fill: slotColour(slotOf(profileId))`; `AXIS_TICK.fill` `var(--ink-2)`, `AXIS_LINE` `var(--line)` |

The two axis lines name shadcn's raw variables, which §1 deletes, so without this change the axes would fall back to black and vanish in Night. A search for `var(--<shadcn name>)` outside `index.css` finds only these two. The tick's `fontSize: 12` stays: Recharts leaves in `s3-14`, Runs is not on the `check:self` list, and 16 px ticks would crowd the fixed 360 px chart.

The Recharts bars get the `var()` string. Recharts writes it into the `fill` attribute, which resolves, as shown above, and re-colours on a theme flip with no re-render. The task asks for the computed value only "where a library needs a plain colour string", and this one does not. Verify step 7 checks the bars' and axes' computed colours in both themes. The PR body calls out this departure from the task's wording.

### 6. Button: `src/components/ui/button.tsx`

The shadcn variant names stay, so no call site changes:

| Variant | Look |
|---|---|
| `default` | The ink primary: `bg-ink text-paper border-ink`, hover `ink-2`. |
| `outline` | DESIGN's outlined default: `bg-surface border-line-strong text-ink`, hover `paper-sunken`. |
| `ghost` | Transparent, `text-ink-2`, hover `paper-sunken text-ink`. |

`destructive`, `secondary` and `link` go, since nothing uses them.

| Size | Height |
|---|---|
| `default`, `icon` | `h-(--control-h)`, 40 px |
| `sm`, `icon-sm` | `h-(--target-min)`, 32 px |

`xs` and `icon-xs` go: they sit under the 32 px floor. `lg` and `icon-lg` go too, unused.

Every variant gets `rounded-sm` (6 px) and `label` type. A press moves it 1 px (`active:translate-y-px`). Disabled draws `text-ink-3 bg-paper-sunken border-line`. The component's own focus ring goes, so the base `:focus-visible` outline applies. Icons are `size-5` (20 px) with a 1.75 stroke.

### 7. The small components (`src/components/`)

Each is one file with one static-render test.

- **`segmented-control.tsx`.** `SegmentedControl<T extends string>({ label, options: {value: T; label: ReactNode}[], value, onValueChange, mono? })`, on Radix `ToggleGroup` `type="single"`, which gives arrow-key focus. An empty value from Radix (re-clicking the pressed item) is ignored by `pickedValue(current, next)`, exported and tested. Looks: `.wf-seg`, with 34 px items. The control is 40 px; DESIGN's 32 px floor is the item's target.
- **`tag.tsx`.**
  - `Tag({ variant?: "default" | "soft" | "cut" | "rule" | "plain", children })`, drawn as `.wf-tag--*`.
  - `ProvenanceTag({ provenance })`: soft, reading "`<id>` · no source" when `isUnsourced(provenance)`, otherwise default with the id.
- **`source-badge.tsx`.** `SourceBadge({ source: "live" | "stored", children? })`.
  - Live draws a `signal` dot. Stored draws a dashed border and a hollow dot.
  - The label defaults to the source.
  - No source is assumed: the prop is required.
- **`banner.tsx`.** `Banner({ kind: "stored" | "fault", children, action? })`.
  - Stored is `role="status"`, dashed on `paper-sunken`, with lucide `Archive`.
  - Fault is `role="alert"`, on `fault-soft` with a `fault` border, with lucide `OctagonAlert`.
  - One action slot.
- **`skeleton.tsx`.** `Skeleton({ className })`: an `aria-hidden` block on `paper-sunken` with the shimmer on `::after`. The shimmer is `animate-shimmer` over a `surface/70` gradient. The caller sizes it.

### 8. Self-check: `scripts/self-check.ts`, `scripts/check-self.ts`

```ts
export const SELF_CHECK_FLOOR = { contrast: 4.5, fontPx: 16, targetPx: 32 } as const;
export const SELF_CHECK_THEMES = [
  { theme: "light", name: "Daylight" },
  { theme: "dark", name: "Night" },
] as const;
export const SELF_CHECK_SCREENS = [
  { name: "cast", path: "/cast", ready: 'role=heading[name="Cast"s]', responses: {} },
];
export type SelfCheckTheme = (typeof SELF_CHECK_THEMES)[number];
export function checkScreen(page, origin, screen, entry?: SelfCheckTheme): Promise<ScreenCheck>;
```

- **Theme.** With an entry, `checkScreen` calls `page.emulateMedia({ colorScheme: entry.theme })` before `goto`, so the boot script picks it. After `ready` it reads `<html data-theme>` and throws `WayfordError("self_check_theme")` if it differs from `entry.theme`, so a broken boot script cannot pass as Daylight twice. With no entry, as for the fake pages, it emulates and asserts nothing.
- **Shortfalls** carry the theme's name, from the `SELF_CHECK_THEMES` entry `checkScreen` was given: `cast · Night  link "Runs"  contrast 3.1 < 4.5`.
- **`check-self.ts`** prints the floors first, `floors: text 4.5:1 and 16 px, targets 32 px`. It checks every screen in every theme and ends with `1 screen checked in Daylight and Night: 0 shortfalls`.
- **The browser test** runs `test.each` over screens × themes. The fake-page expectations move to the new floors, 16 px and 32 px.

### 9. Fonts

- `package.json` adds `@fontsource-variable/bricolage-grotesque`, `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` (5.3.0). `index.css` imports them.
- `packages/web/public/fonts/`, Inter and JetBrains Mono, is deleted. Nothing else in web reads it. Target-app serves its own Inter.
- The comment in `self-check.ts` that names Inter changes.

## Files

| File | Why |
|---|---|
| `packages/web/index.html` | Boot script; `class="dark"` goes |
| `packages/web/package.json`, `pnpm-lock.yaml` | Three Fontsource packages (lockfile follows the manifest) |
| `packages/web/public/fonts/**` (deleted) | Web's Inter and JetBrains Mono go (task: "files and their `@font-face` rules go") |
| `src/index.css` | Token block, aliases, base |
| `src/theme.ts`, `src/theme.test.ts` | Outside the task's list: the toggle, `theme.test.ts` and `scripts/theme.browser.test.ts` share its storage key, and `scripts/self-check.ts` its `Theme` type. The test runs `index.html`'s inline boot script |
| `src/shell.tsx` | Shell renders the top bar |
| `src/router.tsx`, `src/router.test.tsx` | Redirect to `/cast`; tests read routes and the nav's label |
| `src/components/top-bar.tsx`, `.test.tsx` | TopBar, TopBarSlot, TopBarProvider, STORY_NAV |
| `src/components/theme-toggle.tsx`, `.test.tsx` | The toggle |
| `src/components/ui/button.tsx`, `button.test.ts` | Restyle; the existing test keeps its `px-*` override check, adapted to the new padding class |
| `src/components/{segmented-control,tag,source-badge,banner,skeleton,persona-avatar}.tsx` and a `.test.tsx` each | New components |
| `src/avatar/slots.ts`, `slots.test.ts` | Profile-to-slot |
| `src/avatar/parts.ts`, `parts.test.ts` | Hue wheel, palette and `personaColour` go |
| `src/avatar/avatar.tsx`, `avatar.test.tsx` | Colours become CSS variables. A test: no markup matches the acceptance pattern (`#hex`, `rgb(`, `oklch(`), and every `fill`/`stroke` value is one of `var(--p)`, `var(--p-ink)`, `var(--avatar-line)`, `var(--avatar-head)`, `white` (the eyes, as in the reference) or `none` |
| `src/screens/personas.tsx`, `preview.tsx`, `arena.tsx`, `run-detail.tsx` | Route, label and persona lines |
| `src/arena/start-panel.tsx`, `race-view.tsx`, `src/runs/task-results.tsx` | Persona lines |
| `src/screens/arena.test.tsx`, `preview.test.tsx`, `preview.browser.test.ts`, `src/arena/race-view.test.tsx`, `race.test.tsx` | Tests reading a route, a label, a class (the avatar's dimming moved to the tile) or a persona colour |
| `scripts/self-check.ts`, `check-self.ts`, `self-check.browser.test.ts` | Floors, both themes, `/cast` |
| `scripts/theme.browser.test.ts` | OS dark opens Night; the toggle survives a reload. It lives in `scripts/` because it starts the app with `startWebApp`, which imports the filter's main entry |
| `tasks/s3-13-redesign-foundation.md` | Ticked boxes, Outcome |
| `docs/specs/…`, `docs/plans/…` | This spec and its plan |

`runs/task-results.tsx`'s `PersonaName` changes beyond a colour value: it renders `PersonaChip`. It is the persona's dot-and-name, which the chip replaces (DESIGN, "PersonaChip"). `race.test.tsx` is outside the task's list but reads the avatar's class.

## Acceptance mapping

| Acceptance box | Proven by |
|---|---|
| Web tests pass, the avatar's determinism test included | `pnpm --filter @wayford/web test`; `avatar.test.tsx` "the same profile renders the same SVG string twice" stays as is |
| `check:self` passes on `/cast` in Daylight and Night, output names 16 px and 32 px floors | `pnpm --filter @wayford/web check:self` output in the PR; `self-check.browser.test.ts` "cast · Daylight/Night" |
| `rg` for colour literals outside `index.css` and tests prints nothing | The command, run in verify |
| `rg "personaColour\|paletteOf"` prints nothing | The command, run in verify |
| OS dark opens in Night; toggle to Daylight survives a reload | `scripts/theme.browser.test.ts`; also done by hand in the browser pane |
| PR shows Cast, Lens, Race, Runs at 1280 × 720 in Daylight and Night, before and after | Playwright screenshots. Before: `origin/main`, Night only, since it has no Daylight. After: both themes. io is answered from core fixtures as `check:self` does |
| Root `pnpm lint`, `typecheck`, `test` pass | The commands |
| (reviewer note) avatar byte for byte apart from colour | Build check: every fixture × state rendered before and after, with `fill`/`stroke` values masked, compared equal; output in the PR |

## Decision log

| Question | Taken | Why |
|---|---|---|
| How existing screens wear the system "through tokens alone" | shadcn's semantic colour names stay as aliases onto Wayford tokens (`muted-foreground` → `ink-2`, …); the oklch palette goes | Screen layouts are other tasks' work. Renaming every class in every screen would break "changes nothing else in its file" |
| `muted-foreground` → `ink-2` or `ink-3` | `ink-2` | It colours descriptions and table cells more than captions. DESIGN keeps `ink-3` off evidence numbers |
| The 16 px floor on screens that use `text-xs`/`text-sm` | Both draw 16 px / 24 px | Same move `s3-07` made for 14 px. Old classes stay legal |
| Type styles | Copied as `@utility` classes named as in `tokens.css` | A text-* key cannot carry the family. One class per style matches the reference |
| Where `--persona-fallback*` lives | Three aliases in the token block's `:root` | Lets every caller write `var(--persona-<slot>)` for any slot. They are aliases of `ink-3`, `ink-2` and `paper-sunken`, DESIGN's fallback, not new values |
| `slotOf` input | A profile id | `run-detail` and `task-results` hold only `profileId`. The task pins slots "by profile id" |
| Who sets `--p` for the avatar | `PersonaAvatar`'s tile; `Avatar` only reads | Keeps `Avatar`'s markup byte for byte apart from colour values |
| Avatar callers | Each `<Avatar>` becomes `<PersonaAvatar>` | The tile is how DESIGN draws the avatar (D4). The goal lists the avatar and chip "in use". It is the persona line in each file |
| The background disc inside the SVG | Kept, filled `var(--p)` at 16 % | Byte for byte apart from colour. The tile shows behind it |
| SVG colours: attribute or `style` | `fill`/`stroke` attributes holding `var()` | Checked in Chromium. The smallest diff from today's markup |
| Recharts bars: computed value or `var()` | `var()` | The task's condition, a library that "needs a plain colour string", does not hold: Recharts writes an attribute that resolves `var()` (checked). A computed value would also freeze on a theme flip |
| Button variant names | shadcn's `default`/`outline`/`ghost` kept, restyled | No call site changes. `default` is the ink primary, as shadcn's default is its filled primary |
| Theme toggle label | Names the action ("Switch to Night"); the icon shows the current theme | An icon-only control needs a name saying what a press does |
| Storage key | `wayford-theme`, in `theme.ts` and the boot script, with a test that they match | One spelling |
| Number in the nav | `aria-hidden` | The link's name is the screen's name. The number is decoration of the story order the list already gives |
| Nav landmark name | `Story` (was `Main`) | The reference's name. Runs sits outside it |
| Top bar slot | A portal into an element the provider holds | A static render draws nothing and never calls `createPortal`. No state loop between the shell and a screen |
| Theme in `check:self` | `emulateMedia` before `goto`, then assert `data-theme` | It exercises the boot script and needs no storage |
| SegmentedControl base | Radix `ToggleGroup` | DESIGN: Radix underneath for keyboard. Arrow keys for free |
| Before screenshots | `origin/main`, Night only | `main` has no Daylight |
| The 1 px press on Button | Kept (`active:translate-y-px`) | DESIGN, "Motion", asks for it beside the 160 ms colour transitions. It is part of that rule, not new motion |
| Axis colours in `task-results.tsx` | `var(--ink-2)` and `var(--line)` | They named shadcn's raw variables, which go. These are the tokens `muted-foreground` and `border` map to |
| Mono segments (build) | `mono-label font-normal` in place of `label` | Both set the family, so an item carries one of them. The build first added `font-mono` for the figures; the simplify pass moved tabular, slashed-zero figures into the mono type styles and dropped it |
| Pressed state of SegmentedControl (build) | Radix's own: `role="radiogroup"`, items `role="radio"` with `aria-checked` | That is what a single-choice `ToggleGroup` renders; the reference's `aria-pressed` was drawn for buttons |
| PersonaAvatar tile element (build) | A `<div>` | A `<span>` tile nests a span in the start panel's and Lens switcher's `aria-hidden` spans, which the Lens tests' reader refuses. Those wrappers belong to `s3-11` and `s3-12`, which can drop them |
| Passing `state` to `Avatar` (build) | A conditional spread | `exactOptionalPropertyTypes` rejects `state={undefined}`; same idiom as `arena/race.ts` |
| Top bar on a narrow window (build) | The story nav scrolls sideways (`min-w-0 overflow-x-auto`) | At about 560 px the bar pushed the toggle off the page. The old header scrolled its nav the same way |
| Before and after screenshots in the PR (build) | On an unmerged `assets/s3-13-screenshots` branch | As `s3-07` did, so `main` gets no binaries |
| Simplify pass (build) | Taken: `profileColour(profileId, tone?)` in `slots.ts` for the six callers; `SELF_CHECK_THEMES` as plain `Theme`s, the name looked up where printed; base rules in Wayford names; only the seven shadcn aliases still used are kept; no `persona-*` colour utilities, so a persona's colour comes only through `slotOf`; the 16 px `text-xs`/`text-sm` shim marked transitional at the end of the token block; mono type styles carry tabular, slashed-zero figures. Skipped: dropping the avatar's `palette` prop (keeps the drawing untouched for the byte check), splitting the top bar's context, running self-check screens in parallel | Four cleanup reviews (reuse, simplification, efficiency, altitude) |

## Risks

- **`s4-06` conflicts.** It touches `preview.tsx`, `preview.test.tsx` and `preview.browser.test.ts`, plus `pnpm-lock.yaml`. Whichever merges second rebases. The lockfile is settled by `pnpm install`.
- **Night or Daylight contrast on `/cast`.** A class left on an old shadcn alias could land under 4.5:1 or under 16 px. `check:self` finds it, and the fix stays in tokens or in the persona lines.
- **Fontsource under pnpm 12's supply-chain policy.** The packages are 5.3.0, published 2026-07-19, so they are old enough for any release-age gate.
- **Knock-on of keeping Tailwind's class names.** The screen tasks should know:
  - existing `rounded-lg` panels become 20 px, a radius DESIGN reserves for the cast: `preview.tsx` (four panels) and `task-results.tsx` (one);
  - `shadow-sm`, `shadow-xs`, `rounded-xl` and `rounded-2xl` keep Tailwind's default values, which are not tokens.

  Each screen's own task replaces them. This task changes no layout.
- **Typed routes.** TanStack fails the typecheck on any missed `"/preview"`, `"/arena"` or `"/personas"`. That is a help.

## Review note

Round 1 (spec-reviewer), verdict "ready after fixes":

- **Blocking, fixed.** The Runs axes read `var(--muted-foreground)` and `var(--border)`, which §1 deletes. Both lines move to tokens in §5.
- **Nits, fixed:**
  - the wordmark's 36 px box;
  - a decision row for the 1 px press;
  - the avatar test's exact pattern;
  - the fixed tile radius, noted for `s3-11` and `s3-12`;
  - the knock-on risks;
  - where the theme's name comes from;
  - why `theme.ts` is outside the list;
  - the PR callout for the Recharts `var()` departure.
- **Nit, fixed by removal.** The worktree row was bookkeeping, not design.
- **Round 2**, verdict "ready": two wording nits fixed (`checkScreen`'s `entry` parameter in §8; who uses `theme.ts`).
- **Optional, rejected.** Raising the Recharts tick to 16 px: Recharts leaves in `s3-14`, Runs is not checked, and the fixed 360 px chart would crowd.
