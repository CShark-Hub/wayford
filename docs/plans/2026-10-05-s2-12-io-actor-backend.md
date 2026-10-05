# s2-12 — io runs a run set on the chosen Actor backend: plan

Spec: none. An S task's task file is its spec (`docs/CONVENTIONS.md`, "Git"); the decisions below go in the PR body.
Status: approved 2026-10-05

## Shape

- `RunnerOptions.actor: ActorBackendFactory` becomes `backends: Readonly<Record<ActorBackendName, ActorBackendFactory>>` and `defaultBackend: ActorBackendName`. Both are types from agent, so the runner still imports agent as types only.
- `Runner.start(task, profiles, seeds, backend?)` resolves the factory once per call, `backends[backend ?? defaultBackend]`, and hands that one factory to every run of the set. A set can't mix backends, because the factory is chosen once per set.
- `RunsRequest` gains `backend: z.enum(["llm", "jev"]).exactOptional()`. Being `.strict()`, it answers `backend: "other"` with a 400 before anything starts.
- `server.ts` builds `backends: { llm: llmActor({ settings }), jev: jevActor({ settings }) }` and `defaultBackend: settings.actorBackend`, which is `LLM_ACTOR_BACKEND`, default `llm`.

## Decisions

| Question | Taken | Why |
|---|---|---|
| Move `backendFactory` out of `cli.ts`? | No. `server.ts` builds the record from `llmActor` and `jevActor`, which the barrel already exports. | `cli.ts` loads Playwright and the target-app server. `actor-backend.ts` can't hold the factory without an import cycle with the two backends. The `Record<ActorBackendName, …>` type fails to compile when agent adds a name, so the mapping can't silently drift. Agent stays unchanged. |
| Where the route gets the backend names | Spelt in `routes/runs.ts` as `z.enum(["llm", "jev"])`. | Importing agent's `ActorBackendName` value would load agent's runtime into io's barrel (s4-03, "The barrel"). (build, simplify) As shipped, the enum is `z.enum({ llm: "llm", jev: "jev" } satisfies Record<ActorBackendName, ActorBackendName>)` under a type-only import, so a name added on either side fails typecheck. That replaced the planned test that posted every one of agent's `ActorBackendName.options`. |
| How "no `backend` follows `LLM_ACTOR_BACKEND`" is proven | `runs.test.ts` builds `defaultBackend` from `parseLlmSettings({ LLM_API_KEY, LLM_ACTOR_BACKEND: "jev" })`, and from the same env without the variable for `llm`. | `server.ts` runs on import and has no test. Its one line, `defaultBackend: settings.actorBackend`, is what this test reproduces. |
| How a fake run shows the backend | `fakeRun` builds the backend from `options.backend(...)` as `runActor` does and writes its `modelId` into `runStarted.modelIds.actor`. `test-app.ts` gains `fakeBackend(modelId)`, whose `answer` throws. | The acceptance box reads `runStarted.modelIds.actor`. A fake that ignored the factory would prove nothing about which one the runner handed on. |
| (build, after #166) `backendFactory` | `actorBackends(settings)` in a new io module, `actor-backends.ts`, builds both entries with `backendFactory("llm", settings)` and `backendFactory("jev", settings)`, plus `defaultBackend: settings.actorBackend`. `server.ts` spreads it, and the route tests build the same, so the third row's copy of the wiring is gone (branch review and simplify). | #166 (Grzegorz, merged first) moved `backendFactory` into agent's barrel as `backend-factory.ts`, so the first row is overtaken: io now shares the CLIs' one mapping. The first row's "`cli.ts` loads Playwright" was a weak reason anyway: agent's barrel loads Playwright through `device.ts`, and agent's `exports` are what kept `cli.ts` out of io's reach. |
| `noBackend` | Kept for `chromium.test.ts`, which never reaches the factory. `runnerDefaults` gets `fakeBackend("fake-llm")` and `fakeBackend("fake-jev")`, with default `llm`. | `fakeRun` now calls the factory, so the runner's defaults need factories that build. |

## Steps

| # | Step | Files | Serves box | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | Runner and test support: `backends` and `defaultBackend`, `start(…, backend?)`, `fakeBackend`, `fakeRun` reading the model id from the factory | `packages/io/src/runner.ts`, `test-app.ts`, `runner.test.ts`, `chromium.test.ts` (if its options change), `runs.browser.test.ts` (`actor:` becomes `backends:`) | 1 | `runner.test.ts`: a set started with `"jev"` hands every run `backends.jev`, and one started with none hands every run the default | `pnpm exec vitest run src/runner.test.ts` in `packages/io` | — |
| 2 | Route: `backend` in `RunsRequest`, passed to `runner.start` | `packages/io/src/routes/runs.ts`, `routes/runs.test.ts` | 1 | `runs.test.ts`: `jev` gives the Jev model id and `llm` the LLM's; no `backend` follows `LLM_ACTOR_BACKEND`, both ways; `"other"` is a 400 with `run.calls` empty; a backend name added on either side, the route or agent's `ActorBackendName`, fails typecheck (build: a type check replaced the planned test that posted every name) | `pnpm exec vitest run src/routes/runs.test.ts` in `packages/io` | — |
| 3 | `server.ts` builds both factories and the default | `packages/io/src/server.ts` | 1, 2 | none: it runs on import (covered by step 2's default test) | `pnpm --filter @wayford/io typecheck` | — |
| 4 | Verify: root `pnpm lint`, `pnpm typecheck`, `pnpm test`; `pnpm --filter @wayford/io test`; with a real key, `POST /runs` `{ backend: "jev" }`, Ada, the easy goal, seed 1, then `GET /runs/:id` for `outcome` and `modelIds` | task file ticks | 1, 2, 3 | — | every box ticked with its output | — |

The steps run in sequence: each builds on the one before, and the S task is built by the orchestrator alone.

Step 4's real-key box needs the root `.env` with a key, which you place yourself. I don't read or copy it.
