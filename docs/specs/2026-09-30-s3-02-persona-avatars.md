# s3-02 — Persona cards and procedural avatars: spec

Task: `tasks/s3-02-persona-avatars.md` · Branch: `feature/s3-02-persona-avatars` · Date: 2026-09-30
Status: approved 2026-09-30

## Goal

The web app gets a TanStack Router shell in a dark theme. A `/personas` screen shows the four fixture personas as cards, each with a procedural SVG avatar drawn from the profile's seed and dimensions. The m0-07 event list moves to a route of its own.

## Constraints that bind

- **Deterministic.** "The same profile gives the same SVG, byte for byte. Randomness only from `rng(profile.seed)` in core" (`docs/PLAN.md` F1 AC4, A20).
- **Parts follow dimensions**, "never a job title or a diagnosis": glasses that thicken as the contrast threshold rises, a phone in hand for `device: mobile`, a sign of patience from `budgetSeconds`. "One colour per persona", the only thing that later crosses into the output register.
- **The card** shows the label, the description, the device, and each switched-on threshold with its provenance, with `folk` and `llm` shown as such. No "impaired", "disabled" or "able-bodied" anywhere.
- **No avatar library.** Our own SVG parts (`docs/STACK.md`, "Avatars").
- **Fixtures in the browser.** `@wayford/core/fixtures` reads from disk and cannot run there. The fixtures are bundled another way, "validated with the core schemas; no Node polyfills". s3-01 reuses the same mechanism for the measurement fixture.
- **Routing and theme.** TanStack Router with typed search params. Dark by default. The m0-07 event list stays reachable on its own route.
- **Package rules.** web imports core, and never reaches another package by a relative path (`docs/STACK.md`, "Package import rules"). The work touches only `packages/web/**` and `pnpm-lock.yaml`. The one exception is the task file itself, whose boxes are ticked with the work (`tasks/README.md`, step 7).
- **Out of scope.** The six animation states, the profile builder, and any change to `packages/core`.

## Design

### Dependencies

`@tanstack/react-router` (`docs/STACK.md`, "Routing") goes into web's `dependencies`. `yaml` (`docs/STACK.md`, "YAML") goes into its `devDependencies`, since only `vite.config.ts` uses it (review: first a runtime dependency, while the page parsed the YAML). Both rows already exist, so `docs/STACK.md` does not change. Code-based routes need no router plugin.

### Bundled fixtures: `src/bundled-fixtures.ts`

`vite.config.ts` defines one alias. `@core-fixtures` points at the directory that holds `@wayford/core/fixtures`, found with `createRequire(import.meta.url).resolve("@wayford/core/fixtures")`. The resolution goes through core's `exports`, so the config never hard-codes `../core`. It is the directory `profilesFixtureDir` lives in, which core already exports to Node callers.

```ts
/** The persona fixtures, alphabetical by file name like `profileFixtures`. */
export const bundledProfiles: Profile[];
```

An eager `import.meta.glob<unknown>("@core-fixtures/profiles/*.yaml", { import: "default", eager: true })` brings in each file at build time. A five-line transform in `vite.config.ts` parses each YAML file with `yaml`, the library core's loader uses, into plain data (review: first parsed in the browser from `?raw` text). The page runs `Profile.safeParse` on each. A failure throws an `Error` that names the file, as core's loader does. The entries are sorted by path, so the order is Ada, Milo, Vera, Zoya.

s3-01 adds `bundledMeasurement` the same way: a glob of `@core-fixtures/measurement.json`, parsed with `PageMeasurement`. A spike on 2026-09-30 confirmed that the alias and the glob work under vitest, which loads web's `vite.config.ts` for the web project, and that `tsc` accepts the typed glob.

### Router and shell

| File | Holds |
|---|---|
| `src/shell.tsx` | `rootRoute = createRootRoute({ component: Shell })`. `Shell` is a header with the wordmark and `<nav aria-label="Main">`, with `Link`s to Personas and Events, then `<Outlet />`. |
| `src/screens/personas.tsx` | `personasRoute` at `/personas`, whose component is `PersonasScreen`, and `PersonaCard({ profile })` |
| `src/screens/events.tsx` | `eventsRoute` at `/events`: the m0-07 screen, moved out of `app.tsx` unchanged (health check, Replay, `EventLog`) |
| `src/router.tsx` | the index route, where `/` redirects to `/personas`; `routeTree`; `createAppRouter(options?: { history?: RouterHistory })`; and the `Register` declaration for `@tanstack/react-router` |
| `src/app.tsx` | `App` renders `<RouterProvider router={router} />`, with the router made once at module scope. In Node its history stays unset until first use, so `index.test.ts` can still import `App`. `main.tsx` and `index.ts` do not change. |

Each screen file exports its route, with `getParentRoute: () => rootRoute`, and `router.tsx` lists the routes. A later screen is one file and one line in `routeTree`.

Typed search params: registering the router types `Link`, `useNavigate` and `useSearch` against each route's `validateSearch`. No s3-02 route takes search params; the first ones are s3-01's sliders on `/preview`.

Dark by default: `class="dark"` on `<html>` in `index.html`, since the shadcn theme in `index.css` keys its dark variables on `.dark`. `color-scheme: dark` goes in the `.dark` block, so native scrollbars and controls follow.

### Avatar: `src/avatar/parts.ts` (pure) and `src/avatar/avatar.tsx`

```ts
export type AvatarParts = {
  hue: number;                              // one of 12 hues, 30° apart
  tuft: "curl" | "spikes" | "wave" | "sprout";
  brows: "arch" | "bar" | "none";
  pattern: "plain" | "stripes" | "dots";
  glasses: { threshold: number; strokeWidth: number } | null;  // from perception.contrast (review: carries its threshold)
  held: "phone" | "tablet" | null;          // from device
  patience: number;                         // from behaviour.budgetSeconds, 0 to 1
};
export function avatarParts(profile: Profile): AvatarParts;
/** The persona's one colour, `oklch(0.75 0.12 <hue>)`: the accent later screens reuse. */
export function personaColour(profile: Profile): string;
```

**Seed parts.** `const draw = rng(profile.seed)` gives four draws, in a fixed order: hue, tuft, brows, pattern. Each variant is `list[Math.floor(draw() * list.length)]`. Dimension parts never draw. So moving a threshold, as the preview and the sweep do, never changes a persona's colour or face. The draw order is part of the record, like the `rng` algorithm itself: a later seed part is drawn after `pattern`, never inserted before it, so existing avatars keep their looks.

**Hue.** `bin = floor(draw × 12)`, `hue = ((bin × 5) mod 12) × 30`. Stepping by 5 of 12 puts neighbouring bins 150° apart. It is needed: Ada's first draw is 0.584 and Vera's 0.567, so a plain `draw × 360` gives them 210° and 203°, one colour. With the step, Ada is 330, Milo 120, Vera 180 and Zoya 300.

**Dimension parts.**

| Part | Source | Rule | Fixtures |
|---|---|---|---|
| glasses | `perception.contrast` | present when the threshold is set; `strokeWidth = min(6, 1 + threshold / 2)`, rounded to 2 decimals. The cap is reached at 10:1, so every threshold from 10 to 21 draws the same glasses; the fixtures and the preview's sliders sit below it | Vera 3 → 2.5, Zoya 7 → 4.5, Ada and Milo none |
| held device | `device` | `mobile` → phone, `tablet` → tablet, `desktop` → none | Milo holds a phone |
| hourglass | `behaviour.budgetSeconds` | the top bulb holds `min(1, budgetSeconds / 300)` of its sand, rounded to 2 decimals | Milo 0.3, Ada and Vera 0.4, Zoya 0.6 |

**Rendering.** `Avatar({ profile, className? })` renders `<svg viewBox="0 0 160 160" role="img">`. Its `<title>` names the parts in capability terms, for example "Glasses for a contrast threshold of 3:1. Hourglass for a budget of 120 s." Layers, back to front: background disc, body with its pattern, head, tuft, face, glasses, held device, hourglass. Each part is a `<g data-part="…">`. Every number is a constant or rounded to 2 decimals. There is no trigonometry, no `useId` and no element id, so the markup depends on the profile alone, not on where it renders.

**Neutral identity.** Seed parts are random. On a screen ordered from the calibration persona to the far end of the scale, any human trait that happened to land on Zoya would read as a claim about that trait. So the figure is a character, not a likeness:

- no skin tones: the head is one pale cool tone for every persona (build: first tinted in the persona's hue, which read as skin at warm hues);
- no age cues: no grey hair, wrinkles or walking aids;
- no gender cues: tufts instead of hairstyles;
- the face always smiles, so no seed draws a mood.

**Colours.** Persona colour `oklch(0.75 0.12 h)`, head `oklch(0.94 0.02 250)` for everyone (build; see the decision log), ink `oklch(0.25 0.03 h)`, dark accent `oklch(0.55 0.09 h)`. All four stay inside sRGB at every one of the 12 hues, so no browser has to gamut-map them; higher chroma leaves sRGB at some hues (checked with `culori`). The persona colour is 7.5:1 or more against the dark card, `oklch(0.205 0 0)`.

### Persona card

`PersonaCard({ profile })` is an `<article>` labelled by its `<h2>`, with a top border in the persona colour. The `<h2>`'s id is built from `profile.id` (`persona-prof_vera`), not from `useId`, so the card's markup is as stable as the avatar's. It holds the `Avatar`, the label as the `<h2>`, the description, "Device: <device>", the thresholds, and "Budget: <n> s", the number the hourglass is drawn from.

| Threshold | Shown as |
|---|---|
| `perception.contrast` | `Contrast 3:1`, plus `soft 0.5` when `softness > 0` |
| `perception.fontPx` | `Font size 16 px`, plus `soft …` likewise |
| `perception.targetPx` | `Target size 32 px`, plus `soft …` likewise |

Each row ends with its provenance id. `isUnsourced` from core picks out `folk` and `llm`, which are shown with the words "no source" and a dashed outline. With no threshold switched on, as for Ada, the list reads "No perception threshold". `PersonasScreen` renders `bundledProfiles` as a `<ul>` of cards, in fixture order (review: it first took the list as a prop, which no caller needed).

## Files

| File | Why |
|---|---|
| `packages/web/package.json`, `pnpm-lock.yaml` | the two dependencies |
| `packages/web/vite.config.ts` | the `@core-fixtures` alias |
| `packages/web/index.html`, `packages/web/src/index.css` | dark by default |
| `packages/web/src/app.tsx` | `App` renders the router; the m0-07 screen moves out |
| `packages/web/src/router.tsx`, `router.test.tsx` | route tree, `createAppRouter`, `Register`; route-level tests |
| `packages/web/src/shell.tsx` | root route and dark shell |
| `packages/web/src/screens/events.tsx` | the m0-07 screen on `/events` |
| `packages/web/src/screens/personas.tsx`, `personas.test.tsx` | the personas screen and the card |
| `packages/web/src/avatar/parts.ts`, `parts.test.ts` | the pure function |
| `packages/web/src/avatar/avatar.tsx`, `avatar.test.tsx` | the component |
| `packages/web/src/bundled-fixtures.ts`, `bundled-fixtures.test.ts` | fixtures for the browser |
| `tasks/s3-02-persona-avatars.md` | outside the task's file list: the ticked boxes and an Outcome section, as `tasks/README.md` step 7 asks |

## Acceptance mapping

Tests render with `renderToStaticMarkup` from `react-dom/server` in vitest's Node environment. Route tests go through `createAppRouter({ history: createMemoryHistory(...) })` and `await router.load()`. A spike confirmed that this renders the matched route with its shell. No DOM library is needed, since `docs/STACK.md` lists none.

| Acceptance box | Proven by |
|---|---|
| web test passes, with an avatar test and the bundled deep-equal | `pnpm --filter @wayford/web test`; `bundled-fixtures.test.ts` "the bundled profiles deep-equal profileFixtures" (`toStrictEqual`, order included); the avatar tests below |
| same SVG twice; Ada and Vera differ | `avatar.test.tsx`: "the same profile renders the same SVG string twice", "Ada and Vera render different SVGs" |
| threshold 7 draws thicker glasses than 3; Milo holds a phone | `parts.test.ts`: "a contrast threshold of 7 gives thicker glasses than one of 3", on Vera with only the threshold changed; `avatar.test.tsx`: the rendered `data-part="glasses"` carries that stroke width, and Milo's SVG has `data-part="phone"` while Ada's has none |
| `/personas` shows four cards, Ada, Milo, Vera, Zoya (screenshot) | `router.test.tsx`: "/personas shows the four cards in order", read from the `<h2>`s; by hand: `pnpm dev`, open `http://localhost:5173/personas`, screenshot for the PR |
| no "impaired", "disabled", "able-bodied" | `router.test.tsx`: "the personas screen says none of the banned words". It renders `/personas` through the router and reads what a person or a screen reader gets: the text, plus every `aria-label`, `title` and `alt` value, case-insensitive |
| event list on its own route (click in the PR) | `router.test.tsx`: "/events renders the m0-07 screen", inside a `QueryClientProvider`, asserting the "Fixture run, replayed by io" heading and the Replay button. A static render runs no effect and no query, so the streaming itself is the hand check: `pnpm dev`, click Events in the nav, the fixture events appear one by one and end with "Stream: run ended", Replay starts again from event 0 |
| `pnpm --filter @wayford/web build` passes | the command |
| root `lint`, `typecheck`, `test` pass | the commands |

Tests for the constraints without a box of their own:

- `personas.test.tsx`: Vera's card lists all three thresholds with their provenance, and her `folk` target size reads "no source"; a synthetic profile with `llm` provenance reads "no source" too; Ada's card reads "No perception threshold"; every card shows its device and budget.
- `parts.test.ts`: no glasses without a contrast threshold (Ada, Milo); more budget gives more sand (Milo < Ada < Zoya); a tablet profile holds a tablet; the four fixtures get four different hues; changing a threshold leaves hue, tuft, brows and pattern unchanged.
- Dark by default is checked by hand and in the screenshot. A test that read `class="dark"` off `index.html` only restated the literal, and the PR review cut it.

## Decision log

| Question | Taken | Why |
|---|---|---|
| How the browser gets the fixtures | Alias to core's fixtures directory, resolved through core's `exports`; an eager glob; the YAML parsed at build time by a transform in `vite.config.ts`, with `yaml`; `Profile.safeParse` in the page (review: first a raw glob parsed in the browser) | It is the task's "JSON and YAML imports" and needs no change to core, whose `exports` list only `.` and `./fixtures`. The deep-equal test compares two different loaders. s3-01 reuses the alias for `measurement.json`. |
| Rejected: a virtual module built from `profileFixtures` in `vite.config.ts` | — | The browser would get core's own parse, and the deep-equal test would compare core with itself. |
| Rejected: committed generated JSON in web | — | A second copy of the fixtures to keep in sync. |
| Rejected: `../core/...` in a glob or an alias | — | It leaves the package by a relative path, which `docs/STACK.md` bans for imports; resolving by package name keeps to the rule. |
| Where YAML is parsed | At build time, by a five-line transform in `vite.config.ts` with `yaml` (review; first in the browser) | The same library as core. The spec first ruled out build-time parsing because it assumed a plugin package `docs/STACK.md` does not list, and an inline transform needs none. The page ships no YAML parser: 98 kB less JavaScript, and no chunk-size warning. |
| Route definitions | Code-based, no router plugin | `@tanstack/router-plugin` is not in `docs/STACK.md`, and code-based routes are typed the same. |
| Where routes live | Each screen file exports its route; `router.tsx` assembles them | A later screen adds a file and one line. |
| `/` | Redirects to `/personas` | The input side comes first. A redirect does not render server-side (spiked), so it is checked by hand. |
| The m0-07 list's route | `/events`, the screen moved unchanged | "Its own route". It does not clash with s3-04's `/runs`. |
| io health indicator | Stays on the events screen | Personas need no io; the m0-07 screen stays as it was. |
| Search params | None in s3-02; the router's type is registered | The first ones are s3-01's sliders. |
| Dark theme | `class="dark"` on `<html>`, plus `color-scheme: dark` | shadcn keys its dark variables on `.dark`. m0-07 left the theme light for stream 3. |
| Fonts | Not in this task | Local Inter and JetBrains Mono need font packages or files; no box asks for them. Follow-up. |
| What the pure function returns | A parts object; the component turns it into SVG | The glasses test reads a number, and the byte test reads the rendered string. |
| How tests render | `renderToStaticMarkup`, Node environment, memory history | No jsdom or testing-library, neither of which `docs/STACK.md` lists. Spiked. |
| Colour | 12 hues, stepping by 5 | Ada's and Vera's draws are 0.017 apart; see "Hue". |
| Colour source | The first draw of `rng(profile.seed)`, exported as `personaColour` | Later screens need the one accent without drawing an avatar. |
| Seed parts | Tuft, brows, pattern; no skin, age or gender cues; always smiling | See "Neutral identity". |
| Patience sign | An hourglass on every avatar, sand in proportion to the budget, full at 300 s | `docs/PLAN.md` says "hourglass for low patience", which would need an arbitrary cut-off; a continuous mapping needs none. |
| Glasses | Present only with a contrast threshold; stroke `min(6, 1 + threshold / 2)` | The task: thicker as the threshold rises. `docs/PLAN.md`'s "thick glasses for a low contrast threshold" means low tolerance, which is the same direction. |
| Tablet | A tablet in hand | `device` has three values, and drawing a tablet persona as desktop would be wrong. |
| Other dimensions (font, target, caps, patterns) | Not drawn | The task names three parts; the card lists the thresholds as text. |
| Budget on the card | Shown | It is the number behind the hourglass. |
| Scope of the banned-word test | Text plus `aria-label`, `title`, `alt` | The constraint is about wording. Markup such as Tailwind's `disabled:` variant is code, not copy. |
| Marking unsourced provenance | `isUnsourced` from core | Core already defines which ids are unsourced. |
| Where route tests live | All in `router.test.tsx` | One render helper, and no helpers module (`docs/CONVENTIONS.md`). |
| The moved screen's heading (build) | `<h1>` "Wayford" becomes "Events"; nothing else changes | The shell now carries the wordmark. |
| `<main>` (review) | The shell renders the page's one `<main>` around the matched route; screens render a `<div>` | A later screen cannot leave the landmark out. First built the other way, with each screen bringing its own. |
| Focus style (build, then review) | A solid 2 px outline in the full-strength ring colour, set once for every element by `:focus-visible` in `index.css`'s base layer | shadcn's half-strength ring is 1.9:1 on the dark background, under WCAG 2.2's 3:1 for non-text contrast, and an outline survives forced-colours mode. First a class string on the shell's links alone; the base rule covers every later link and control. `Button` sets `outline-none` and keeps shadcn's ring: a follow-up. |
| Order of the bundled profiles (build) | Sorted by glob key, comparing code units | The same order as core's bare `.sort()`; `localeCompare` depends on the locale. |
| Pinned seed parts (build) | `parts.test.ts` pins each fixture's hue, tuft, brows and pattern | The draw order and the lists are part of the record, and `random.ts` pins its own record the same way. |
| Head colour (build) | One fixed tone, `oklch(0.94 0.02 250)`, for every persona's head and hand, in place of `oklch(0.92 0.03 h)` | Tinted per hue, the head came out peach or cream at hues 0 to 90, which reads as a light skin tone and breaks "no skin tones". No fixture sits there, but about one new persona in three would. |
| Sand in the hourglass (build) | The sand triangle is the top bulb scaled by `√patience`, so its area is `patience` of the bulb's | Scaling by `patience` made the area `patience²`: 0.4 showed 16% of the bulb, and 90 s and 120 s looked the same. The spec's rule is the share of sand, which is an area. |

## Risks

- **Server render.** Route tests depend on TanStack Router rendering after `router.load()` in Node. The spike showed that it does, except for a redirect, which renders nothing there.
- **Dev server.** In dev, the eager glob becomes `/@fs/` imports of core's files. Vite allows them because its default `server.fs.allow` is the pnpm workspace root. Only vitest was spiked, so the build step checks `pnpm dev` and `vite build` early.
- **Colour collisions beyond the fixtures.** The step of 5 was chosen because it separates the four fixture seeds. With 12 hues, a fifth persona from the builder shares a hue with one of the four about a third of the time. "One colour per persona" holds for the fixtures only. Colour is never the only cue: the name and the avatar always travel with it.
- **OKLCH in SVG attributes.** Needs a current browser. The demo runs on current Chrome.
- **Taste.** The reviewer is asked to put the four avatars side by side and send back a stereotype. The drawings are data in one component, so reworking them leaves the pure function and its tests alone.

## Review note

One round of `spec-reviewer`, verdict "ready after fixes": one should-fix finding and six nits, all taken.

- **Should.** The `/events` test claimed more than a static render can show. It now asserts the heading and the Replay button inside a `QueryClientProvider`, and the streaming is left to the hand check.
- **Nits.**
  - The card's heading id is built from `profile.id`.
  - Seed draws are append-only.
  - The hue collision rate beyond the fixtures is a risk.
  - The glasses' 10:1 cap is stated.
  - The task file is named as the one file outside `packages/web/**`.
  - The dark-by-default check moved to `shell.test.ts`, which the PR review later cut.
