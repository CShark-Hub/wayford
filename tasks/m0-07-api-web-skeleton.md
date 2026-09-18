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

- [ ] `pnpm dev` starts all three processes and `curl localhost:<port>/health` returns `{"ok":true}`
- [ ] `curl -N localhost:<port>/runs/fixture/events` streams the fixture events and ends with `runFinished`
- [ ] The web page shows the events appearing one by one
- [ ] `pnpm --filter @wayford/io db:migrate` creates the SQLite file

## Out of scope

- Real runs, Playwright, LLM calls, any real screen.

## Notes for the reviewer

- Check ports are the ones documented in the root README from m0-01.
