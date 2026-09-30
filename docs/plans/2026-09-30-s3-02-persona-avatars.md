# s3-02 — Persona cards and procedural avatars: plan

Spec: `docs/specs/2026-09-30-s3-02-persona-avatars.md`
Status: approved 2026-09-30

| # | Step | Files | Serves box | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | Dependencies | `packages/web/package.json`, `pnpm-lock.yaml` | prerequisite for all | none (no behaviour) | `pnpm install` is clean, `pnpm-workspace.yaml` is unchanged, and `pnpm --filter @wayford/web typecheck` passes | none: the only step that touches the lockfile |
| 2 | Bundled fixtures | `packages/web/vite.config.ts`, `src/bundled-fixtures.ts`, `src/bundled-fixtures.test.ts` | box 1 (deep-equal) | "the bundled profiles deep-equal profileFixtures", with `toStrictEqual` so order counts; the labels read Ada, Milo, Vera, Zoya | `pnpm --filter @wayford/web exec vitest run src/bundled-fixtures.test.ts` is green, and Biome passes on the step's files | 3, 4, 5 |
| 3 | Avatar parts | `src/avatar/parts.ts`, `src/avatar/parts.test.ts` | box 3; the dimension and seed constraints | a threshold of 7 gives thicker glasses than 3 (Vera, only the threshold changed); Milo holds a phone; Ada and Milo wear no glasses; sand Milo < Ada < Zoya; a tablet profile holds a tablet; hues Ada 330, Milo 120, Vera 180, Zoya 300; `personaColour(vera)` is `oklch(0.75 0.12 180)`; a threshold change leaves hue, tuft, brows and pattern alone; the same profile gives deep-equal parts twice | `pnpm --filter @wayford/web exec vitest run src/avatar/parts.test.ts` is green, and Biome passes | 2, 5 |
| 4 | Avatar component | `src/avatar/avatar.tsx`, `src/avatar/avatar.test.tsx` | boxes 2 and 3 | the same profile renders the same string twice; Ada and Vera differ; the rendered `data-part="glasses"` carries the parts' stroke width at 3 and at 7; Milo's SVG has `data-part="phone"`, and Ada's has no held device and no glasses; Vera's `<title>` names her glasses and hourglass | `pnpm --filter @wayford/web exec vitest run src/avatar/avatar.test.tsx` is green, and Biome passes | 2, 5 (after 3) |
| 5 | Shell, events screen, dark theme | `src/shell.tsx`, `src/shell.test.ts`, `src/screens/events.tsx`, `src/app.tsx`, `index.html`, `src/index.css` | box 6; dark by default | `index.html` sets `class="dark"` on `<html>` | `pnpm --filter @wayford/web exec vitest run src/shell.test.ts src/index.test.ts` is green, and Biome passes | 2, 3, 4 |
| 6 | Personas screen and router | `src/screens/personas.tsx`, `src/screens/personas.test.tsx`, `src/router.tsx`, `src/router.test.tsx`, `src/app.tsx` | boxes 4, 5 and 6; the card constraints | every test in the spec's mapping for `personas.test.tsx` and `router.test.tsx` | `pnpm --filter @wayford/web test`, `pnpm --filter @wayford/web typecheck` and `pnpm --filter @wayford/web build` are green, and Biome passes | none: needs 2, 4 and 5 |
| 7 | Verify | `tasks/s3-02-persona-avatars.md` | every box | none | root `pnpm lint`, `pnpm typecheck` and `pnpm test`, plus `pnpm --filter @wayford/web test` and `build`, are green; the two hand checks are done in the browser; every box is ticked with its evidence, with an Outcome section where the result differs from the task | none: last |

## Notes

**All steps.**
- Paths under `src/` are in `packages/web/`.
- Steps 2 to 5 run at the same time in one worktree. A step runs its own test file, and `biome check` on its own files. A typecheck error in another step's file is reported, not fixed.
- The orchestrator reads each diff, runs its done-check, and commits it as `s3-02: <step>`.

**Step 1.**
- The orchestrator runs `pnpm --filter @wayford/web add @tanstack/react-router yaml`. The spike on 2026-09-30 resolved 1.170.40 (published 2026-09-27) and 2.9.1, the `yaml` core already locks.
- If pnpm writes a `minimumReleaseAgeExclude` into `pnpm-workspace.yaml`, revert both files and pick an older range.

**Step 2.**
- The alias is `@core-fixtures`, set to `dirname(createRequire(import.meta.url).resolve("@wayford/core/fixtures"))`. A comment says why the path is resolved and not written: the package-name resolution goes through core's `exports`, where `../core` would leave the package.
- `bundled-fixtures.ts` has a header comment. It says why the module exists (`@wayford/core/fixtures` is Node only) and that s3-01 adds the measurement fixture here the same way.

**Step 3.**
- The order is part of the record. The variant lists are, in this order: `TUFTS = ["curl", "spikes", "wave", "sprout"]`, `BROWS = ["arch", "bar", "none"]`, `PATTERNS = ["plain", "stripes", "dots"]`.
- Constants: `HUE_BINS = 12`, `HUE_STEP = 5`, `PATIENCE_FULL_SECONDS = 300`, and the glasses cap of 6.
- Rounding is a module-private `round2`. The module has no default export, and the tests read fixtures from `@wayford/core/fixtures`.

**Step 4.**
- Art direction:
  - A friendly, bold character, not a person-likeness.
  - Large round head in the head tone, with a thick ink outline.
  - Big eyes, white with ink pupils, and a smile.
  - A tuft on top in the dark accent. Shoulders in the persona colour, with the pattern in the dark accent, kept inside the shoulder outline without a `clipPath`.
  - Behind everything, a background disc in the persona colour at `fill-opacity` 0.16.
  - Glasses are two rings around the eyes, a bridge and short temples, drawn in ink. The held device sits low right, gripped by a small hand in the head tone. The hourglass sits top right, with the sand in the persona colour.
- No trigonometry, `useId`, ids, gradients or `clipPath`. Every coordinate is a literal or is rounded to 2 decimals.
- `<svg viewBox="0 0 160 160" role="img" className={className}>`, with `<title>` as its first child. Each part is a `<g data-part>`, one of `background`, `body`, `head`, `tuft`, `face`, `glasses`, `phone` or `tablet`, and `hourglass`.
- `<title>` joins one sentence per drawn part:
  - "Glasses for a contrast threshold of 3:1."
  - "Phone in hand for a mobile device." / "Tablet in hand for a tablet device."
  - "Hourglass for a budget of 120 s."
- The sand is the part of the top bulb's triangle nearest the neck, with its height and width scaled by `patience`. It is linear arithmetic only.

**Step 5.**
- `screens/events.tsx` takes `STREAM_STATUS`, `describe`, `EventLog` and the screen from `app.tsx`, and exports `EventsScreen` and `eventsRoute`, at `/events` under `rootRoute`.
- One change is needed: the screen's `<h1>` "Wayford" becomes "Events", since the shell now carries the wordmark. Everything else moves as it is, including the io status and Replay.
- Until step 6, `App` renders `<EventsScreen />`, so the app still works between the two steps.
- `shell.tsx` exports `Shell` and `rootRoute`. `Shell` renders:
  - a header with the wordmark as a `Link` to `/`;
  - `<nav aria-label="Main">`, holding "Personas" (`/personas`) and "Events" (`/events`), styled active through `data-[status=active]`;
  - then `<Outlet />`.
- Before `router.tsx` registers the router, `Link`'s `to` is an unchecked string, so the step typechecks on its own.
- `index.css` gets `color-scheme: dark` in its `.dark` block.

**Step 6.**
- `screens/personas.tsx` exports `PersonaCard`, `PersonasScreen` and `personasRoute`. The route's component passes `bundledProfiles`.
- The card follows the spec's table: the `<h2>` id is `persona-${profile.id}`, `isUnsourced` marks provenance, and the list reads "No perception threshold" when it is empty.
- `router.tsx`:
  - the index route throws `redirect({ to: "/personas" })` in `beforeLoad`;
  - `routeTree = rootRoute.addChildren([indexRoute, eventsRoute, personasRoute])`;
  - `createAppRouter(options: { history?: RouterHistory } = {})` spreads its options into `createRouter`;
  - the `Register` declaration.
- `app.tsx` makes the router at module scope and renders `<RouterProvider router={router} />`.
- `router.test.tsx` has one helper that builds a router on `createMemoryHistory({ initialEntries: [path] })`. The helper awaits `router.load()` and renders inside a fresh `QueryClientProvider`.
- The banned-word test collects the text between tags and every `aria-label`, `title` and `alt` value. It lowercases them, then checks all three words.

**Step 7.**
- Hand checks, with `pnpm dev` running:
  - open `http://localhost:5173/personas`, confirm the four cards, and take a screenshot for the PR;
  - open `/`, and confirm it lands on `/personas`;
  - click Events, watch the fixture events arrive one by one and end with "Stream: run ended", then click Replay.
- The last step is verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` and every acceptance command in the task file.
