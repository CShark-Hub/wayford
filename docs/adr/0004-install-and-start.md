---
status: accepted
date: 2026-10-09
decided-by: Tomasz
---

# 0004 — Install and start: a clone and two commands

Wayford runs on the machine of the person using it. Nobody hosts it and nobody gets a URL: whoever uses it runs io, the web app and Chromium on their own machine. So how it installs and starts is part of the product.

For now, from a clone of the repository, that takes two commands:

```bash
pnpm install
pnpm start
```

The goal after the finals is a released package that starts with one short command, such as `npx wayford`. It is not built now. What is known about it is under "Later" below.

## Context

On 2026-10-09 a fresh clone needs four steps before the first screen (`README.md`, "Quick start"):

- `pnpm install`.
- `pnpm --filter @wayford/agent exec playwright install --only-shell chromium`, once per machine.
- `cp .env.example .env`, with a key in it. io refuses to boot without `LLM_API_KEY`, even for screens that call no model.
- `pnpm dev`, which starts three dev servers: web on 5173, io on 3000 under `tsx watch`, and the target app on 5174.

`pnpm dev` is a command for working on Wayford. It serves the target app from Vite's dev server, which `docs/STACK.md` ("Target app") rules out for seeded runs, sweeps and recordings. Running against a build takes a second terminal and a filtered command.

A released package is further away than it looks:

- **The repository is private.** `npx` cannot fetch a GitHub Release asset without auth, and GitHub Packages asks for a token even to install.
- **Eight places find files by the repository's layout.** They use `new URL("../../../runs/", import.meta.url)` and the like, for `runs/`, `.env`, the migrations and the target app.
- **The packages export TypeScript source** and depend on each other as `workspace:*`. A published package needs them bundled.

Nothing in the demo or the finals waits on this. It is taken now because it is small. It also helps everyone who starts from a clone: the finals laptop, the drill (`demo-3`), and anyone after the hackathon.

## Decision

| # | Decision |
|---|---|
| D1 | From a clone: `pnpm install`, then `pnpm start`. Both run at the repository root, with no filter and no flag. |
| D2 | `pnpm start` installs Playwright's Chromium headless shell when it is missing, then goes on. It is Playwright's own build, pinned by the lockfile, never the machine's Chrome. Another Chromium can lay a page out differently, and that would move perception decisions between machines, which the seed promises not to do. |
| D3 | Chromium is installed at start, not by a `postinstall` script. `pnpm install` runs in every worktree an agent makes, and in CI, which installs Chromium its own way. Start is the one step that needs a browser. |
| D4 | `pnpm start` builds the web app and the target app, then serves three processes on the ports `pnpm dev` uses: web with `vite preview` on 5173, io on 3000, and the target app with `vite preview` on 5174. io runs without `watch`. |
| D5 | web reaches io through the same `/api` proxy as in dev. `vite preview` uses `server.proxy` when it has no proxy of its own. io's guard (`docs/adr/0003-any-target.md`, D7) is unchanged. |
| D6 | The target app is served as a production build, which `docs/STACK.md` already asks for seeded runs, sweeps and recordings. Under `pnpm start` they need no second terminal. |
| D7 | io boots without `LLM_API_KEY`. The Cast, the Lens, Runs, run detail and data seeded with `seed:demo --fake` call no model. The Target screen (the Extractor), the Race, Scout and a new report (the Analyst) do, so they need the key from their first step. A model call with no key fails at once, before any request leaves the machine. Its error names `LLM_API_KEY` and the root `.env`. io logs one warning at boot saying so. The CLIs that call a model keep failing at boot without a key, as today. |
| D8 | `pnpm start` opens the browser on the web app, `http://localhost:5173`. |
| D9 | `pnpm dev` stays as it is, for working on Wayford: hot reload, and the target app's dev server. `pnpm start` is for using Wayford. |

## Considered options

- **io serves the web app on its own port: one process, one URL.** Rejected. io's guard refuses a request with `Sec-Fetch-Site: none` and `Sec-Fetch-Mode: navigate` (ADR 0003, D7). A person typing `localhost:3000` sends exactly that, and so does io's own Chromium on `goto`. Headers cannot tell the two apart, so serving the app from io would mean loosening D7.
- **Chromium installed by a root `postinstall` script.** Rejected, D3.
- **The machine's own Chrome (`channel: "chrome"`), with no download.** Rejected, D2.
- **Docker.** Rejected. A container cannot reach an app on the user's own `localhost` without `host.docker.internal`, and a local app is a target Wayford is meant for. `docs/PLAN.md` already rules out Docker.
- **A single executable** (Node SEA, `bun build --compile`). Rejected: Playwright's browser and `better-sqlite3`'s native binary do not fit in one file.
- **`npx github:CShark-Hub/promptozaury`.** Rejected. npm cannot resolve a pnpm workspace's `workspace:*` dependencies, and the package would build on the user's machine.
- **A released package now.** Deferred until after the finals. It needs the work under "Later", plus a decision on where to publish, and it does not fit before the merge cutoff on 2026-10-13.

## Consequences

- `README.md`, "Quick start", leads with the two commands. The key stops being a prerequisite and becomes the step that turns on runs.
- `docs/DEVELOPMENT.md`: "Configuration" no longer says io needs a key to boot, and "Running locally" names `pnpm start` beside `pnpm dev`.
- `docs/PLAN.md`, "Hackathon scope", and `docs/ROADMAP.md`, "Cut order if time runs out", list the task. It is the first thing cut.
- `docs/STACK.md`, "Target app", names `pnpm start` as the way to serve the build on 5174. The sweep and Scout CLIs reuse that build, as they reuse any build that answers there. `seed:demo --fake` serves its own target app, so it runs before `pnpm start` or while it is stopped, as it does with `pnpm dev` today.
- Every model call gets a new failure: no key. A run that hits it ends as an `error` run, like any other failed model call.

## Later: a released package

Recorded on 2026-10-09. None of it is decided.

- **One package with a `bin`.** The workspace is bundled into it. `playwright`, `better-sqlite3` and `@axe-core/playwright` stay real dependencies. The built web app, the built target app and the migrations ship inside the package.
- **One module for paths.** It replaces the eight repository-relative paths. The user's data (the database, `runs/`, `.env`) goes in a data directory such as `~/.wayford`. Shipped files are found next to the bundle.
- **Where to publish is open**, since the repository is private:
  - public npm: the name `wayford` was free on 2026-10-09, but the code becomes public;
  - GitHub Packages: stays private, but every user needs a token in `~/.npmrc`;
  - a `.tgz` on a GitHub Release: org members only, `gh release download`, then `npm i -g`.
- **A release on a `v*` tag** builds, packs, smoke-tests the packed file and publishes it.
- **Two origins stay** for D5's reason, unless someone finds another way to tell a person from io's Chromium (ADR 0003, D7).
