# Wayford — STACK: exact library picks

`docs/PLAN.md` names the stack by category. This file names the library, and why, so no task has to decide it again. Versions are not listed here; the lockfile from `m0-01` is the source of truth, always current stable at install time.

## Workspace and tooling

| Need | Pick | Why, and what was rejected |
|---|---|---|
| Package manager | pnpm workspaces | Strict node_modules, fast. No Turborepo yet; six packages do not need a task graph. |
| Language | TypeScript, strict, ESM only | `moduleResolution: bundler`. No CommonJS anywhere. |
| Runner for scripts | tsx | No build step for CLIs and the server in development. |
| Tests | vitest | One runner for unit, browser-backed and API tests. `@playwright/test` rejected to avoid two runners. |
| Lint and format | Biome | One tool. ESLint and Prettier rejected. |
| Env | `dotenv` plus a zod-validated `config` object | Fail at boot with a readable message, never `undefined` at runtime. `.env` sits at the repository root; io finds it from `config.ts`, whatever directory pnpm starts it in. agent's smoke script reads the same file with Node's own `process.loadEnvFile`, so agent needs no `dotenv`; the adapter itself never reads the environment. |
| Logging | `pino` | One logger, JSON lines, `runId` on every line from a run. |
| Ids | Prefix plus lowercase ULID: `prof_`, `task_`, `run_`, `step_`, `fnd_`, `swp_`, `race_` | Sortable, readable in logs and URLs. Canonical ULIDs are uppercase; the generator lowercases them, which keeps their order. The id schema rejects uppercase, so an id has one spelling and compares as a plain string (the reducer's `runId` check, SQLite keys, URLs). Fixtures use readable slugs (`run_vera-hard-1`), which the schema also accepts. One generator in core, with no `Math.random`: `newId("task")` in `packages/core/src/id.ts`, for every `ID_PREFIXES` entry. |

## Core and filter

| Need | Pick | Why |
|---|---|---|
| Schemas | zod | Runtime validation, TypeScript types, JSON Schema for structured LLM output, one source. |
| YAML | `yaml` | Profiles on disk are YAML, everything else JSON. |
| Seeded random | own `mulberry32` | About ten lines. Identical output in Node and browser, no dependency, easy to explain to a jury. |
| Stable hashing | own FNV-1a 32-bit, finished with one `mulberry32` step | For `hash(seed, elementKey)`. Same reason. The step is needed: FNV-1a alone gives keys that differ only at the end, like the links of a list, nearly the same roll. |
| Colour parsing and CVD simulation | `culori` | Parses any CSS colour from computed styles. Ships colour-vision-deficiency filters based on Machado et al. 2009, the same model Chrome uses. Lets the filter compute contrast *after* simulated deficiency, deterministically. Types from `@types/culori`. |
| Contrast | own WCAG 2.2 relative luminance and ratio | Fifteen lines. We defend this number in front of people, so we own the code. Tested against published examples. |
| Browser | Playwright (library, not test runner) | CDP access through `page.context().newCDPSession(page)`. |
| Accessibility scan | `axe-core` injected through `@axe-core/playwright` | Sidecar measurements for the report. |

## Agent

| Need | Pick | Why |
|---|---|---|
| LLM client | plain `fetch` to an OpenAI-compatible `/chat/completions`, response parsed with zod | The adapter (`packages/agent/src/llm.ts`) is about 400 lines of code, `decide` included. The `openai` SDK and the Vercel AI SDK were rejected because they hide the request body and we must control exactly what the Actor receives. |
| Structured output | JSON schema from zod 4's built-in `z.toJSONSchema()`, `response_format: json_schema` in strict mode where supported, JSON-mode fallback with a zod repair round | Works on OpenRouter, OpenAI, Anthropic-compatible proxies and Ollama. `zod-to-json-schema` targets zod 3 and is not used. Strict modes need an object at the root, so every response schema is one (`ActorResponse`, not a bare `Action`). Refinements do not survive into JSON Schema, so every response is re-parsed with zod. |
| Decision model | Jev, pinned to `typesafe/jev-1.13`, through OpenRouter's System One API with plain `fetch`, on the LLM's key and base URL | The Actor's second backend (`docs/adr/0001-jev-actor-backend.md`): a probability per option, sub-second, input tokens billed only. `~typesafe/jev-latest` and `typesafe/jev-router` rejected: both change the model under a tuned run. |
| Retries | own: at most 3 retries a round, of a network error, 408, 429 or 5xx, after 1, 2 and 4 s, or after what a `Retry-After` asks, up to 30 s. A timed-out Actor or Scout attempt is retried once a round; other roles fail on a timeout (`docs/adr/0005-llm-timeout-retry.md`). Every attempt is logged with its wall time. | No library. The OpenAI SDK retries every timeout twice. A call that does not stream is billed whether or not anyone waits for it, so we pay twice only where losing the call costs a run. |
| Cost | own table `models.yaml` with price per million tokens per model id | Stored on every step. |

## API

| Need | Pick | Why |
|---|---|---|
| HTTP | Hono, served by `@hono/node-server` | Small, typed, `streamSSE` helper built in. Express and Fastify rejected. `@hono/node-server` is its Node adapter. |
| SSE | Hono `streamSSE` | Run events. `event:` is the `RunEvent` type, `id:` its index in the run, and `Last-Event-ID` resumes after it (`packages/io/src/routes/runs.ts`). |
| WebSocket | Hono `ws` helper (Node adapter) | Not used for the hackathon: live video was cut in `m0-08`. Kept here for when it comes back, since SSE is text and cannot carry JPEG frames efficiently. |
| Database | Drizzle ORM over SQLite (`better-sqlite3`, types from `@types/better-sqlite3`) | Schema is written Postgres-compatible. Switching is the driver import and the connection string. `better-sqlite3` is native, so `pnpm-workspace.yaml` allows its build. |
| Migrations | `drizzle-kit` | Generated by `db:generate` into `packages/io/drizzle/`, committed, applied by `db:migrate` through Drizzle's own migrator. |
| Validation at the edge | `@hono/zod-validator` with the same `core` schemas | No second set of DTOs. |

## Web

| Need | Pick | Why |
|---|---|---|
| Build | Vite | |
| UI | React 19 | |
| Routing | TanStack Router | Type-safe routes and search params. Sliders live in the URL so a preview state is a link. React Router rejected for weaker typing. |
| Server state | TanStack Query | |
| Live events | native `EventSource` for SSE, native `WebSocket` for screencast | No wrapper library. |
| Reaching io | Vite dev proxy, `/api/*` to io on 3000 | The page calls its own origin: no CORS to configure, and `EventSource` needs no credentials mode. |
| Styling | Tailwind, through `@tailwindcss/vite` | |
| Components | shadcn/ui | Copied into the repo, so the sober report side can be adjusted freely. Radix underneath gives keyboard and screen-reader behaviour, which matters for a tool about accessibility. Set up as `shadcn init` (v4, Radix base) does it: `components.json`, `#components/*` package imports instead of a tsconfig alias, and the runtime deps `radix-ui`, `class-variance-authority`, `cn` (shadcn's clsx plus tailwind-merge in one) and `tw-animate-css`. `shadcn` itself is a devDependency, heavy (about 300 packages) but needed: the CSS imports `shadcn/tailwind.css` from it, and `pnpm --filter @wayford/web exec shadcn add <name>` runs the pinned CLI. Components import `cn` from its package, so there is no `lib/utils.ts`. |
| Icons | `lucide-react` | Comes with shadcn. Drawn at 20 px with a 1.75 stroke (`docs/DESIGN.md`, "Icons, wordmark, avatars"). Every icon-only control in our own UI gets an `aria-label`. |
| Forms | `react-hook-form` with `@hookform/resolvers/zod` | Profile builder validates with the same `Profile` schema as the API. |
| Animation | CSS transitions, no library | Avatar and ring motion were cut on 2026-10-01; the one animation left, a Lens element changing state, is a CSS keyframe animation played once by a keyed remount (`docs/DESIGN.md`, "Motion"; `s3-11`). Framer Motion was never installed. |
| Charts | plain SVG, no library | One chart, the sweep, with a fixed 0–1 axis and marks a chart library fights (`docs/adr/0002-daylight-instrument-redesign.md`, D11). Recharts left with the old runs bar charts in `s3-14`. |
| Avatars | own SVG parts, no library | DiceBear rejected: its parts do not map to capability dimensions. Ours do: glasses thickness follows contrast threshold, device follows `device`, posture follows patience. |
| Fonts | Bricolage Grotesque for names and titles, Geist for UI, Geist Mono for seeds, measurements and evidence: `@fontsource-variable/bricolage-grotesque/opsz.css`, `@fontsource-variable/geist`, `@fontsource-variable/geist-mono` | Loaded locally, no CDN, so the demo works offline. They register the families as "… Variable", the names the font stacks lead with. Chosen in the redesign (`docs/DESIGN.md`, "Type"). |
| Accessibility check of our own screens | `axe-core` through `@axe-core/playwright`, a devDependency | The self-check's test scans every listed screen with it, with the tags io scans a target-app page with (`AXE_WCAG_TAGS`; `docs/DESIGN.md`, "Checked by"). The package io uses, at the version io resolves, so the lockfile holds one `axe-core`. Web can't borrow io's copy: web may not import `@wayford/io`, and pnpm links only a package's declared dependencies. |

## Target app

Plain HTML, CSS variables, one small script for the query parameters and the mobile menu. Vite for serving only. No framework, no router. One bundled font, Inter (variable weight, Latin subset, SIL Open Font License), served from `public/fonts/`: no CDN and no system font, so text metrics do not depend on the machine's fonts (issue #32).

Using it from a harness: put all three parameters (`contrast`, `fontPx`, `targetPx`) on the start URL of every run, e.g. `http://localhost:5174/?contrast=3&fontPx=16&targetPx=36`. `Task.startUrl` in the core fixtures is the bare `http://localhost:5174/`, so the harness appends the run's parameters instead of calling `goto(task.startUrl)` unchanged. The page keeps them in `sessionStorage` for the tab and removes them from the address bar, so links stay plain paths and the `urlMatches` goal globs match. Record the URL passed to `goto`, not `page.url()`: it is `startUrl` on `runStarted` and `RunResult` in `@wayford/core`. Full contract: `packages/target-app/README.md`.

The parameters set the app, not the persona. Preview sliders and the boundary sweep move profile thresholds, and the app's parameters stay fixed for a whole sweep (`docs/PLAN.md` F9 AC4). Tuning the app by hand is how a human checks a boundary the sweep found.

Serving it for a run: seeded runs, sweeps and the demo recording use a production build on 5174, `pnpm --filter @wayford/target-app build` and then `pnpm --filter @wayford/target-app preview`. On the dev server, Vite's client can restyle or reload a page in the middle of a run (`packages/target-app/README.md`). The root `pnpm dev` starts target-app in dev mode and holds 5174, so to run against a build, start io and web alone with `pnpm -r --parallel --filter @wayford/io --filter @wayford/web dev` and serve the build from a second terminal. The sweep CLI and both Scout CLIs serve the build themselves only when nothing answers on 5174. They reuse the target app when it answers there, and print a warning when it is the dev server; the stored sweep and ground truth do not record it (s4-10). Anything else on 5174, such as another project Vite moved there, is refused. A sweep on the hard goal builds all the same: its route walk serves its own copy on a free port. The `pnpm dev` checks in task acceptance lists are smoke checks: they show the pieces connect, and dev mode is fine for them.

## Recording and evidence

| Need | Pick | Why |
|---|---|---|
| Video | Playwright `recordVideo` on the context | webm out of the box, no ffmpeg. |
| Trace | Playwright `context.tracing` with screenshots and snapshots | `trace.zip` opens in the Playwright trace viewer, which is the developer-facing reproduction tool. |
| Live video | CDP `Page.startScreencast`, JPEG, quality 60, every second frame | Not used for the hackathon (cut in `m0-08`); the ring shows step screenshots. |
| Fake cursor | own `addInitScript` that draws a cursor `div` and moves it before each click | Shows intent in video and screenshots. |
| Screenshots | Playwright `page.screenshot` per step, PNG | Evidence rows. |

## Ports

| Process | Port |
|---|---|
| io (API, SSE, WS) | 3000 |
| web | 5173 |
| target-app | 5174 |

## Package import rules

Enforced with Biome `noRestrictedImports` in each package, later `dependency-cruiser` if needed.

```
core        imports nothing from the workspace
filter      imports core
agent       imports core, filter
io          imports core, filter, agent
web         imports core, and filter only through @wayford/filter/perceive; talks to io over HTTP
target-app  imports nothing
```

A package that may not be imported is banned with every subpath: in `agent`, `@wayford/io` and `@wayford/io/src/app.js` both fail lint, and in `web` every `@wayford/filter` import fails except `@wayford/filter/perceive` itself.

Web's `scripts/` may also import `@wayford/filter`'s main entry, for the self-check's `collect`: it is Node only and never bundled, while `src/` keeps the `./perceive`-only rule.

A relative import stays inside its package. In every package, lint fails on a relative path where a `..` segment is followed by `core`, `filter`, `agent`, `io`, `web`, `target-app` or `packages`, such as `../../io/src/config.js` or `../../../packages/io/src/config.js`. That holds where the other package may be imported by name too: `agent` imports `@wayford/core`, never `../../core/src/run.js`. A relative path into `node_modules` fails as well. The check reads the path, not where the file sits, so a package may not name one of its own directories after any of them.

`pnpm typecheck` catches two more mistakes, both with TS2307: a workspace package missing from the importing package's `package.json`, since pnpm links declared dependencies only, and a subpath the package does not export, such as `@wayford/core/src/run.js` from `io`, since TypeScript resolves a workspace package through its `exports` only.

Biome does not merge `noRestrictedImports` options across overrides. For the files it matches, a later override that sets the rule as an object, even `{ "level": "warn" }` alone, replaces the package's bans, and the string `"warn"` turns them into warnings, which do not fail `pnpm lint`. So an override for part of a package repeats the package's bans in full, at level `error`.

`agent` never imports `io`. The Actor code path never imports Scout output (see `m0-03` and `docs/PLAN.md` F4). Both live in `agent`, where these per-package rules cannot tell them apart, so `s2-04` enforces it with a test that walks the Actor's imports.

`@wayford/filter/perceive` is the browser-safe entry of the filter: `perceive` and nothing that needs Node or Playwright. The preview runs it in the browser, so it applies the same code the Actor's observation comes from (`docs/PLAN.md` F2 AC3). The collector, which needs a Playwright page, sits in the main entry only. Its in-page half, `measure-page.ts`, carries `/// <reference lib="dom" />`, which reaches every program that imports the main entry: once `agent` or `io` imports `collect`, their typecheck no longer catches a browser global such as `document` in Node code.
