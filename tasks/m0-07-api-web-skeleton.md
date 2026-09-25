# m0-07 — API and web skeleton with SSE echo

Stream: m0
Milestone: week 1
Size: M
Depends on: m0-01, m0-05

## Context

Read first, in this order:

- `docs/PLAN.md` sections "Architecture" and "Stack", assumption A15
- `packages/core/src/run.ts` after m0-05 merges

## Goal

A running Hono server and a Vite React shell that talk to each other, including one SSE endpoint that streams fixture `RunEvent`s, so stream 3 and stream 4 have a live wire from day one.

## Interface

- In: `RunEvent` fixtures from `@wayford/core`
- Out: `GET /health`, `GET /runs/:id/events` (SSE, fixture replay with 300 ms spacing), web page that subscribes and lists events
- Files expected to change: `packages/io/src/server.ts`, `packages/io/src/routes/*.ts`, `packages/web/src/App.tsx`, `packages/web/src/api/*.ts`, root `package.json` scripts

## Constraints

- Hono with its SSE helper. No Express.
- Drizzle plus SQLite initialised with an empty migration and a `profiles` table only, to prove the pipeline. Other tables come with their features.
- Web uses TanStack Query for fetches and a plain `EventSource` for SSE.
- Tailwind and shadcn/ui installed and one button rendered, nothing more.
- `pnpm dev` at the root starts io, web and target-app together.

## Acceptance

- [x] `pnpm dev` starts all three processes and `curl localhost:<port>/health` returns `{"ok":true}`. io is on 3000, web on 5173 and target-app on 5174, as in the root README. `curl localhost:3000/health` prints `{"ok":true}`, and so does `curl localhost:5173/api/health` through the web proxy. Covered by `packages/io/src/app.test.ts`.
- [x] `curl -N localhost:<port>/runs/fixture/events` streams the fixture events and ends with `runFinished`. All 18 arrive about 300 ms apart, the last is `event: runFinished` with `id: 17`, and the stream closes after about 5.4 s. The timing is the same through `localhost:5173/api/...`, so the proxy does not buffer. Covered by `app.test.ts`.
- [x] The web page shows the events appearing one by one. Checked in a browser: 8 events at about 1.5 s, 13 at about 3 s, then all 18 and "Stream: run ended". Replay starts again from event 0. There is one events request per run and no reconnect after the end. With io stopped at load, the page reads "io: unreachable", Replay is disabled and no stream is opened. If io stops later, the next health check turns the header to "unreachable" and disables Replay, and the events already received stay on screen. `packages/web/src/api/run-events.test.ts` covers the subscription.
- [x] `pnpm --filter @wayford/io db:migrate` creates the SQLite file. It prints `migrated …\wayford.sqlite`, at the repository root, and the file holds `profiles` plus Drizzle's `__drizzle_migrations`. A second run is a no-op. The file is gitignored. Covered by `packages/io/src/db/database.test.ts`.

## Out of scope

- Real runs, Playwright, LLM calls, any real screen.

## Notes for the reviewer

- Check ports are the ones documented in the root README from m0-01.

## Outcome

What shipped, for the next reader.

- **The wire.** `GET /runs/:id/events` names each SSE message after its `RunEvent` type (`event: stepObserved`), sends the whole event as JSON in `data:`, and numbers it with its index in the run (`id: 0` … `id: 17`). A reconnecting `EventSource` sends `Last-Event-ID` and the stream resumes after it. A client that has already seen the last event gets 204, which tells `EventSource` to stop. Only `fixture` exists; any other id is a 404. Real runs should keep this framing, because the web client relies on it.
- **The web client** (`packages/web/src/api/run-events.ts`) validates every message with the core `RunEvent` schema and closes the stream on the first one that fails. It also closes after `runFinished` or `runFailed`, because io ends the stream there and an `EventSource` left open would reconnect. The page subscribes only after `/health` answers, which covers io still booting under `pnpm dev`.
- **The web reaches io through Vite's proxy**, `/api/*` to `localhost:3000`, so the page never calls another origin and io needs no CORS.
- **Files differ from the list above.** `src/app.ts` builds the Hono app and `src/server.ts` only listens. Tests drive `createApp()` without a port, and neither file has to detect that it is the entry point: `import.meta.main` is `undefined` under tsx, and the old `file://${argv[1]}` check never matched on Windows. `db/migrate.ts` is the entry point for `db:migrate`, and `db/database.ts` holds the functions. The web file is the existing `src/app.tsx`, not `App.tsx`, because files are kebab-case. The root `package.json` needed no change: its `dev` script from m0-01 already starts the three packages.
- **Database.** `profiles` has `id`, `label` and `document`, which is the whole `Profile` as JSON. The migration is `packages/io/drizzle/0000_init.sql`, generated with `db:generate`. `db:migrate` runs Drizzle's migrator from app code instead of `drizzle-kit migrate`, so it reads `DATABASE_URL` through the same zod config as the server. A relative `DATABASE_URL` resolves from the repository root, where `.env` lives, so one value names one file whichever directory a script starts in. The default puts `wayford.sqlite` at the root.
- **`.env` is read from the repository root**, where the README puts it. Before, `import "dotenv/config"` looked in the working directory, which pnpm sets to `packages/io`, so the root `.env` was ignored.
- **io listens on `localhost` only.** The API has no auth.
- **shadcn/ui** is set up as `shadcn init` 4.21 does it for Vite with Radix. The CLI ran in a scratch project and its output was ported by hand, because in the repo it would have run `pnpm add lucide-react`, and 1.48.0 was younger than pnpm's minimum release age. There is no `lib/utils.ts`: components import `cn` from shadcn's `cn` package. The theme is shadcn's default and light. `docs/PLAN.md` asks for dark by default; that is left to stream 3.
- **Biome** now parses Tailwind directives, and it skips `packages/io/drizzle`, which drizzle-kit rewrites without trailing newlines.

## Follow-ups

None block this task.

- **`PORT` is a generic name.** io reads `PORT`, and `pnpm dev` passes one environment to all three processes. A tool that sets `PORT` for the whole tree moves io onto that port. A preview runner did exactly that here, putting io on 5173 before Vite could start. The web proxy in `packages/web/vite.config.ts` also hard-codes 3000, so a moved io reads as "io: unreachable" with no hint why. Consider `IO_PORT`, read by `config.ts` and by `vite.config.ts` through Vite's `loadEnv` from the repository root. That is a change to the m0-01 config and `.env.example`.
- **Six connections per origin.** Browsers allow six HTTP/1.1 connections per origin, and every open `EventSource` holds one. The ring's 3 to 5 runs, each with its own stream, would leave one or two connections for every other request, including Vite's module loading in dev. When the ring lands, stream several runs over one connection.
- **`better-sqlite3` compiled from source** on the Windows machine this was built on (MSBuild, under a minute). A machine without build tools depends on its prebuilt binaries being found.
- **drizzle-kit pulls in deprecated `@esbuild-kit/*`**, which `pnpm install` reports as deprecated subdependencies. These are not peer-dependency warnings.
- **`lucide-react` is installed but unused.** shadcn init adds it for the icons that later components use.
