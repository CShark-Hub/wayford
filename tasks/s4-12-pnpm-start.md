# s4-12 — `pnpm start`: Wayford from a clone in two commands

Stream: s4
Milestone: week 4, install
Size: M
Depends on: none

## Context

Read first, in this order:

- `AGENTS.md`
- `docs/adr/0004-install-and-start.md` — D1 to D9 are this task
- `docs/adr/0003-any-target.md`, D7 — io's guard, which this task leaves exactly as it is
- `docs/STACK.md` ("Target app", "Ports") and `docs/CONVENTIONS.md`
- Root `package.json`: `dev`, the pattern `start` follows
- `packages/web/vite.config.ts`: the `/api` proxy, which `vite preview` takes over when it has none of its own
- `packages/target-app/vite.config.ts`: its preview port, already 5174
- `packages/io/src/server.ts`: io's boot, `parseLlmSettings`, `createLlm` and `actorBackends`
- `packages/agent/src/llm-settings.ts` (`apiKey`) and `llm.ts` (`authorization`): where the key is required and where it is sent
- `README.md`, "Quick start": the steps this replaces
- `docs/DEVELOPMENT.md`, "Configuration" and "Running locally": the key as a boot requirement, and `pnpm dev`

## Goal

On a fresh clone with Node 24 and pnpm, `pnpm install` and then `pnpm start` open Wayford in the browser. No `.env`, no key and no other command is needed. A key in `.env` turns on runs.

## Interface

- **Root `package.json`, `start`**, in order:
  1. Install Playwright's Chromium headless shell when it is missing, from the agent package, as `README.md` does today: `playwright install --only-shell chromium`.
  2. Build `@wayford/web` and `@wayford/target-app`.
  3. Run `start` in io, web and target-app in parallel, as `dev` runs `dev`.
- **A `start` script in each of the three packages:**
  - io: `tsx src/server.ts`, without `watch`;
  - web: `vite preview --open`;
  - target-app: `vite preview`.
- **`packages/web/vite.config.ts`** gets `preview: { port: 5173, strictPort: true }`. The proxy stays under `server`, and `vite preview` takes it from there (ADR 0004, D5). Do not copy it.
- **No key, in io only:**
  - io's boot accepts a missing `LLM_API_KEY`. Every other caller of `parseLlmSettings` fails without one, as today. A malformed key is still refused at boot.
  - With no key, every call through `createLlm`'s client rejects before `fetch`: `complete` and `decide`, so Jev too. It rejects with a `WayfordError` (or `LlmError`), code `llm_no_key`. The message names `LLM_API_KEY` and the root `.env`, never a value.
  - io logs one warning at boot when the key is missing.
- **Where the data lands:** where `pnpm dev` puts it, at the repository root, whatever directory io runs from. `sqliteFilePath` resolves a relative `DATABASE_URL` from the root, and `RUNS_DIR` is found from the source file. Nothing about it changes.
- **Files expected to change:**
  - the root `package.json`, and `packages/io`, `packages/web` and `packages/target-app`'s `package.json`;
  - `packages/web/vite.config.ts`;
  - `packages/agent/src/llm-settings.ts`, `packages/agent/src/llm.ts` and `packages/io/src/server.ts`, and their tests;
  - `README.md`, `docs/DEVELOPMENT.md` and `docs/STACK.md`.

## Constraints

- "The persona is a filter, not a prompt." Nothing here touches the filter, a profile or a prompt.
- The seed's promise holds: runs use Playwright's Chromium, pinned by the lockfile, never the machine's Chrome (ADR 0004, D2).
- io's guard is unchanged: the same hosts, and the same `Sec-Fetch-Site` and `Sec-Fetch-Mode` checks (ADR 0003, D7).
- `pnpm dev` is unchanged.
- No new dependency. `vite`, `tsx` and `playwright` are already in the workspace.
- No core schema changes. A run with no key ends as `runFailed`, as any failed model call does today.

## Acceptance

- [ ] **Fresh clone.** Start from a clone with no `.env`, no `wayford.sqlite` and no `runs/`, in an empty directory or a new worktree. Run `pnpm install` and `pnpm start`, and nothing else. The browser opens on `http://localhost:5173`, the Cast lists the five personas, and the Lens draws a target-app page. `wayford.sqlite` and `runs/` appear at the repository root. Put a screenshot in the PR.
- [ ] **Chromium.** With `PLAYWRIGHT_BROWSERS_PATH` pointing at an empty directory, `pnpm start` downloads the headless shell and then starts. A second `pnpm start` downloads nothing.
- [ ] **Proxy and build.** `curl -s localhost:5173/api/health` answers through the preview proxy. `curl -s localhost:5174/deliveries` returns the built page, with no `/@vite/client` in it.
- [ ] **No key, io.** With no key, io boots and logs one warning naming `LLM_API_KEY`. A run started from the Race ends `error`, and its `runFailed.error` names `LLM_API_KEY`.
- [ ] **No key, agent.** `pnpm --filter @wayford/agent test` includes a test: a client built with no key rejects `complete` and `decide` with `llm_no_key`, and the `fetch` it is handed is never called.
- [ ] **No key, CLIs.** A CLI that calls a model still fails at boot naming `LLM_API_KEY`, as today. Check `pnpm --filter @wayford/agent scout`.
- [ ] **Seeded data.** After `pnpm seed:demo --fake` and then `pnpm start`, the Report and the Boundary show the seeded data.
- [ ] **Stop.** Ctrl-C on `pnpm start` stops all three processes, and nothing listens on 3000, 5173 or 5174 afterwards.
- [ ] **`pnpm dev`.** It starts as before, with hot reload on web.
- [ ] **Docs.**
  - `README.md`, "Quick start", leads with `pnpm install` and `pnpm start`. The key is the step that turns on runs.
  - `docs/DEVELOPMENT.md`: "Configuration" no longer says io needs `LLM_API_KEY` to boot, and "Running locally" names `pnpm start` beside `pnpm dev`.
  - `docs/STACK.md`, "Target app", names `pnpm start` as the way to serve the build on 5174.
- [ ] **Checks.** `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root.

## Out of scope

- A released package, `npx wayford`, a release workflow, and the eight repository-relative paths (ADR 0004, "Later").
- io serving the web app, and any change to io's guard.
- Telling the user in the UI that the key is missing, a settings screen, and writing `.env` for them.
- Seeding on start, or a `--demo` flag.
- Any work for Windows beyond what pnpm's shell already does.

## Notes for the reviewer

- Look first at the no-key path:
  - nothing may reach `fetch` without a key;
  - the CLIs that fail at boot today still do;
  - the key's value never appears in an error or a log line.
- `--open` can open the browser a moment before io answers. The web app's queries retry with TanStack Query's defaults. If the first screen shows an error instead, say so in the PR.
