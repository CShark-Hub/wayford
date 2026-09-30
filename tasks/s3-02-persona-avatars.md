# s3-02 — Persona cards and procedural avatars

Stream: s3
Milestone: week 2
Size: M
Depends on: m0-07, PR #71 (`rng` in core, from issue #26; merged)

## Context

Read first, in this order:

- `AGENTS.md` section "A profile is a capability bundle, not a job title"
- `docs/PLAN.md` F1, assumption A10, and the avatars paragraph in section "UI"
- `docs/STACK.md` section "Web", the avatars row
- `packages/core/src/profile.ts` — the dimensions an avatar follows
- `packages/web/src/` after m0-07 — the shell this task puts a router in

## Goal

The web app gets its router and dark shell, and a personas screen shows the four fixture personas as cards, each with a procedural SVG avatar drawn from the profile's seed and dimensions, so the input side of the product has its playful register, the preview has a shell to live in, and the ring in week 3 has something to animate.

## Interface

- In: `Profile` from `@wayford/core`; the persona fixtures from `packages/core/src/fixtures/profiles/*.yaml`
- Out: TanStack Router with an app shell other screens add routes to; route `/personas`; an `Avatar` component and the pure function behind it in `packages/web`; the core fixtures bundled for the browser
- Files expected to change: `packages/web/**`, `pnpm-lock.yaml`, `docs/STACK.md` only for a dependency it does not list

## Constraints

- Deterministic: the same profile gives the same SVG, byte for byte. Randomness only from `rng(profile.seed)` in core. That is what the profile seed is for (`docs/PLAN.md` F1 AC4).
- Parts follow dimensions, never a job title or a diagnosis: glasses that thicken as the contrast threshold rises, a phone in hand for `device: mobile`, a sign of patience from `budgetSeconds`. One colour per persona: the only thing that later crosses into the output register.
- A card shows the label, the description, the device, and each switched-on threshold with its provenance, with `folk` and `llm` shown as such. No "impaired", "disabled" or "able-bodied" anywhere.
- Own SVG parts, no avatar library (`docs/STACK.md` rejected DiceBear).
- `@wayford/core/fixtures` reads from disk and cannot run in a browser. Bundle the fixtures another way, such as JSON and YAML imports or a build step, validated with the core schemas; no Node polyfills. s3-01 reuses it for the measurement fixture.
- TanStack Router, with search params typed, because the preview keeps its sliders in the URL (`docs/STACK.md`). Dark theme by default (`docs/PLAN.md` "UI"). The m0-07 event list stays reachable on its own route.

## Acceptance

- [x] `pnpm --filter @wayford/web test` passes and includes a test for the avatar and one that the bundled profiles deep-equal `profileFixtures` from `@wayford/core/fixtures`. 9 files, 42 tests pass. The avatar is tested in `src/avatar/parts.test.ts` and `src/avatar/avatar.test.tsx`. `src/bundled-fixtures.test.ts` "the bundled profiles deep-equal profileFixtures" compares with `toStrictEqual`, so the order counts too.
- [x] A test proves the same profile renders the same SVG string twice, and Ada and Vera render different ones. `src/avatar/avatar.test.tsx` "the same profile renders the same SVG string twice" covers every fixture and a `structuredClone` of each. "Ada and Vera render different SVGs" is the second half.
- [x] A test proves a contrast threshold of 7 draws thicker glasses than one of 3, and Milo's avatar holds a phone. `src/avatar/parts.test.ts` "a contrast threshold of 7 gives thicker glasses than one of 3" uses Vera with only the threshold moved, and gets stroke 2.5 against 4.5. `src/avatar/avatar.test.tsx` "the glasses' stroke width follows the contrast threshold" reads `stroke-width="2.5"` and `"4.5"` off the rendered glasses. "Milo holds a phone" finds `data-part="phone"` in Milo's SVG and no held device or glasses in Ada's.
- [x] `http://localhost:5173/personas` shows four cards in the order Ada, Milo, Vera, Zoya (screenshot in the PR). Checked in a browser with `pnpm dev`. `/` redirects to `/personas`, the page is dark, the four cards read Ada, Milo, Vera, Zoya, and the console shows no errors. The screenshot for the PR is taken at 1440 × 900, where all four sit in one row. `src/router.test.tsx` "/personas shows the four cards in order" covers the order.
- [x] A test reads the rendered personas screen and finds none of "impaired", "disabled", "able-bodied". `src/router.test.tsx` "the personas screen says none of the banned words" renders `/personas` through the app's router. It reads the text between tags, which holds each avatar's `<title>`, plus every `aria-label`, `title` and `alt` value.
- [x] The m0-07 event list still streams the fixture run on its own route (click described in the PR). With `pnpm dev`, clicking Events in the top nav opens `/events`, which reads "io: up". 5 events show at about 1.5 s, and all 18 at about 6.5 s, ending with `runFinished` and "Stream: run ended". Replay starts again from event 0 and ends at 18. `src/router.test.tsx` "/events renders the m0-07 screen" covers the static half.
- [x] `pnpm --filter @wayford/web build` passes. It prints `✓ built` with no warning: 476 kB of JavaScript, 151 kB gzipped (Outcome).
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root. Lint checks 135 files and applies no fixes. The typecheck is clean. 44 test files, 701 tests pass, with s2-02 merged in from main.

## Out of scope

- The six animation states (idle, moving, stuck, done, gave up, error). They come with the ring in week 3.
- The profile builder and saving profiles (F1 AC1, AC2).
- Any change to `packages/core`.

## Notes for the reviewer

- Put the four avatars side by side. If one reads as a stereotype rather than a set of capabilities, send it back.

## Outcome

What shipped, for the next reader. The design and every decision are in `docs/specs/2026-09-30-s3-02-persona-avatars.md`.

- **Fixtures in the browser** (`packages/web/src/bundled-fixtures.ts`).
  - `vite.config.ts` points the alias `@core-fixtures` at the directory of `@wayford/core/fixtures`. It resolves that directory through core's `exports`, never with `../core`.
  - An eager `import.meta.glob` brings in the YAML files. A five-line transform in `vite.config.ts` parses them with `yaml` at build time, and the page validates each with `Profile.safeParse`, so `bundledProfiles` deep-equals `profileFixtures`. The page ships no YAML parser.
  - **For s3-01:** add `bundledMeasurement` in the same file, as a glob of `@core-fixtures/measurement.json` parsed with `PageMeasurement`. Vite's dev server serves core's files, since its `fs.allow` is the workspace root.
- **Router** (`src/router.tsx`).
  - Routes are code-based, with no router plugin. Each screen file exports its route under `rootRoute` from `src/shell.tsx`, and `routeTree` lists it: a new screen is one file and one entry.
  - The `Register` declaration type-checks every `Link`, `redirect` and `useSearch`. A link to a missing path fails `pnpm typecheck`. No route has search params yet; s3-01's sliders are the first.
  - `/` redirects to `/personas`. The m0-07 screen lives on `/events`, unchanged except that its `<h1>` now reads "Events", because the shell carries the wordmark.
  - The shell renders the page's one `<main>` around the matched route, so a screen renders a `<div>`.
- **Dark by default.** `class="dark"` sits on `<html>` in `index.html`, and `color-scheme: dark` sits in the `.dark` block of `index.css`.
- **Keyboard focus.** A `:focus-visible` rule in `index.css`'s base layer gives every element a solid 2 px outline in the full-strength ring colour, 4.2:1 on the background.
- **Avatar.** `src/avatar/parts.ts` holds `avatarParts` and `personaColour`, and `src/avatar/avatar.tsx` holds `Avatar`.
  - **Seed parts.** Four draws of `rng(profile.seed)`, in a fixed order that is part of the record, pick the hue, tuft, brows and pattern.
  - **Colour.** Twelve hues, stepped by 5 so close draws land far apart: Ada 330, Milo 120, Vera 180, Zoya 300. `personaColour` is `oklch(0.75 0.12 <hue>)`, the one accent later screens reuse.
  - **Dimension parts.** They never draw from `rng`:
    - glasses as thick as `min(6, 1 + contrast threshold / 2)`;
    - a phone for `mobile`, a tablet for `tablet`;
    - an hourglass whose top-bulb sand has `min(1, budgetSeconds / 300)` of the bulb's area.
  - **Neutral identity.** The figure is a character, not a likeness. The head is one cool tone for everyone, `oklch(0.94 0.02 250)`. There are no age or gender cues, and the face always smiles.
  - **Changes from the spec.** The head was first tinted per hue, which read as a light skin tone at hues 0 to 90. The sand was first scaled linearly, which drew an area of `patience²`. Both were fixed during the build.
- **Cards** (`src/screens/personas.tsx`).
  - Each card shows the avatar, the name, the description, the device, the budget (the number behind the hourglass) and each perception threshold.
  - A threshold carries its softness and its source. `folk` and `llm` read "· no source" in a dashed badge, through core's `isUnsourced`.
  - A persona with no threshold reads "No perception threshold".
- **Tests render without a DOM library.** They use `renderToStaticMarkup` in vitest's Node environment, and route tests go through `createAppRouter` with a memory history. A server-side load does not follow a redirect, so `/` is checked by hand.
- **Build size.** 476 kB of JavaScript (151 kB gzipped), up from 406 kB for the router, with no size warning. Parsing YAML in the browser had cost another 98 kB, until the branch review moved it to build time.
- **Local machine note.** `pnpm test` needs Playwright's headless shell build 1243 for filter's browser tests: `pnpm --filter @wayford/filter exec playwright install --only-shell chromium`.

## Follow-ups

- **Fonts.** `docs/STACK.md` asks for Inter and JetBrains Mono, loaded locally. The web app still uses the system stack.
- **Focus ring.** shadcn's `Button` sets `outline-none` and draws its own ring (`focus-visible:ring-ring/50`), 1.9:1 on the dark background, under WCAG 2.2's 3:1 for non-text contrast. Every other element gets the full-strength outline from `index.css`.
- **Colour collisions.** A fifth persona from the builder shares a hue with one of the four fixtures about one time in three. Name and avatar always travel with the colour.
- **Ada and Zoya sit 30° apart.** Their hues are pink 330 and lilac 300, and they share every seed part. Only the glasses and the sand set them apart. No step across the 12 hues separates all four fixture draws by more than 30°. If the report needs its two ends further apart, the lasting fix is a colour field on `Profile`, which is a core change.
- **`docs/STACK.md` "Avatars"** still says "posture follows patience". What shipped is an hourglass, as `docs/PLAN.md` and this task say. One word to change at the next STACK edit.
