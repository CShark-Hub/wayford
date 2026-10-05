# s2-12 — io runs a run set on the chosen Actor backend

Stream: s2
Milestone: week 4
Size: S
Depends on: s2-06

## Context

Read first, in this order:

- `docs/adr/0001-jev-actor-backend.md` — one backend per run set; the gate passed, so the sweep and `seed:demo` run on Jev
- `packages/io/src/server.ts` — builds the Actor from `LLM_ACTOR_BACKEND` through agent's `backendFactory` since #161
- `packages/io/src/routes/runs.ts` — `RunsRequest`
- `packages/io/src/runner.ts` — `RunnerOptions.actor`
- `packages/agent/src/backend-factory.ts` — `backendFactory`; `ActorBackendName` in `llm-settings.ts`

## Goal

`POST /runs` takes an optional `backend`, `llm` or `jev`, and every run of the set runs on it, so the sweep and `seed:demo` reach Jev through the same runner as the arena.

#161 is fixed (#166): io already follows `LLM_ACTOR_BACKEND`. This task adds the optional per-request `backend` on top, so `LLM_ACTOR_BACKEND` becomes the default of a run set that names none.

## Interface

- In: `RunsRequest` with `backend?: "llm" | "jev"`
- Out: the runner builds the Actor per run set from the named backend; without `backend`, io uses `LLM_ACTOR_BACKEND` (default `llm`)
- Files expected to change: `packages/io/src/server.ts`, `runner.ts`, `routes/runs.ts`, their tests

## Constraints

- One backend per run set (ADR 0001, decision 1). A request never mixes them.
- The runner still imports agent as types only. The factories are built in `server.ts`, the one io module that loads agent's runtime.
- The web is unchanged. The arena keeps sending no `backend`, so the live race runs on `LLM_ACTOR_BACKEND`, which the demo keeps unset or `llm` (`docs/DEMO.md`, "Before the demo").

## Acceptance

- [x] `pnpm --filter @wayford/io test` passes:
  - with fake backends, `backend: "jev"` gives runs whose `runStarted.modelIds.actor` is the Jev model and `backend: "llm"` the LLM's;
  - no `backend` follows `LLM_ACTOR_BACKEND`;
  - `backend: "other"` is a 400 and starts nothing.

  16 files and 121 tests pass, 1 file and 3 tests skipped (after the merge of #165). The first two boxes are the tests under "POST /runs › on a named backend (s2-12)" in `routes/runs.test.ts`. They run on `actorBackends(settings)`, the module `server.ts` spreads, so they test io's own wiring, not a copy of it. The backends are the real ones from agent's `backendFactory`, built by the fake run and never asked a turn, with `fetch` stubbed to throw. The stored runs' `modelIds.actor` is `typesafe/jev-1.13` for `"jev"`, posted where the default is `llm`, and `openai/gpt-6-luna` for `"llm"`, posted where `LLM_ACTOR_BACKEND=jev`. So each explicit name is seen to win over the default. With no `backend`, it is Jev's under `LLM_ACTOR_BACKEND=jev` and the LLM's with the variable unset. Probes: a hard-coded `defaultBackend: "llm"` fails the default test, and swapped record entries fail both. A runner that honours only `"jev"` (Grzegorz's probe in the PR review) fails the first. The third box is five rows of the table test of refused bodies: `"other"`, `"LLM"`, `""`, `null` and `1` are each a 400, and no run starts. The route's two names are checked against agent's `ActorBackendName` by type. A name added on either side fails `pnpm typecheck` (probed: TS2741 for a missing name, TS2353 for an extra one).
- [x] With a real key, `POST /runs` with `backend: "jev"`, Ada, the easy goal and seed 1 ends `success` (the stored run's `modelIds` in the PR). On 2026-10-05 with `pnpm dev`, after the merge of #166, so through `backendFactory`. First with the root `.env` leaving `LLM_ACTOR_BACKEND` unset, then with `LLM_ACTOR_BACKEND=jev` in the environment:

  ```
  LLM_ACTOR_BACKEND unset   startup: {"actorBackend":"llm","msg":"default Actor backend, LLM_ACTOR_BACKEND"}
  POST /runs  202  backend "jev"  run_01m46b199405p4j81fgdsazr7t  prof_ada  seed 1
                   success  modelIds {"actor":"typesafe/jev-1.13"}  2 steps  1886 ms  $0.00010584  decision record on step 0
  POST /runs  202  no backend     run_01m46b1dawn03ng7j638zp6n41  prof_ada  seed 1
                   success  modelIds {"actor":"openai/gpt-6-luna"}  2 steps  5642 ms  $0.0002429

  LLM_ACTOR_BACKEND=jev     startup: {"actorBackend":"jev","msg":"default Actor backend, LLM_ACTOR_BACKEND"}
  POST /runs  202  no backend     run_01m46b28qrakqh3vzykydgdran  prof_ada  seed 1
                   success  modelIds {"actor":"typesafe/jev-1.13"}  2 steps  1677 ms  $0.00010584
  POST /runs  202  backend "llm"  run_01m46b2as9y7fkk5a7a1q1cevm  prof_ada  seed 1
                   success  modelIds {"actor":"openai/gpt-6-luna"}  2 steps  6148 ms  $0.0002444
  POST /runs  400  backend "other"  ✖ Invalid option: expected one of "llm"|"jev" → at backend
  ```

  The easy goal is `task_01m467cxzcrwzaggmvvqkvhhxz`, stored earlier the same day by `POST /tasks` ("You want to check where your next parcel is being sent."). The first real-key run, before #166, gave the same outcomes and model ids (`run_01m467d8mvxfv6qx442kearzbp` on Jev, `run_01m467dk0ct9wefh7k42j64s4g` on the LLM).
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root.
  - **After the merge of #166:** lint checks 276 files and applies no fixes, and the typecheck is clean. 102 test files and 1550 tests pass, 1 file and 3 tests skipped.
  - **After the merge of #165 and the PR review fixes:** lint and the typecheck are again clean. 1556 of the 1558 tests that run pass, in 100 of the 102 test files that run.
  - **The two failures** were filter's `attention.test.ts` "lowering maxElements from 20 to 1…" and `collect.browser.test.ts` "getByRole finds every measured element on /account". Both hit vitest's 5 s timeout while other sessions loaded the machine (15 node processes). Both files pass 44 of 44 alone, and this branch does not touch filter.
  - **The full run before it** had one such timeout, in agent's `actor-loop.browser.test.ts`, which passes 40 of 40 alone.
  - CI on Linux is the judge for these.

## Outcome

Built as the task says, after #166 (Grzegorz's fix for #161), which merged first.

- **The runner.** `RunnerOptions.actor` became `backends`, one factory per `ActorBackendName`, and `defaultBackend`. `Runner.start(task, profiles, seeds, { backend })` picks the factory once per set, so a set never mixes backends. The options object follows Grzegorz's PR review, so s4-05 can add its sweep beside `backend`. `runner.ts` still imports agent as types only.
- **The wiring.** A new io module, `actor-backends.ts`, builds both backends with agent's `backendFactory`, which #166 moved into agent's barrel, and takes the default from `LLM_ACTOR_BACKEND`. `server.ts` spreads it, and the route tests run it. It loads agent's runtime, so like `chromium.ts` it stays out of io's barrel. The Constraints say the factories are built in `server.ts`; they are built for it, one import away, so that a test can run them. #166's startup line now names the backend as the default.
- **The route.** It spells `{ llm, jev }` itself, checked against agent's `ActorBackendName` by a type-only import, so io's barrel loads no agent runtime.
- **Test support.** io's `fakeRun` builds the backend it is handed, with the run's own provider seed and decision stream, and records its `modelId`.
- **From the reviews.** The branch review found that the default test copied `server.ts`'s line instead of running it. `actor-backends.ts` is the fix. It also cut a runner test that the route tests cover. Simplify replaced a runtime drift test with the type check and folded the bad-backend 400s into the table test. The checks of #166 found that agent's barrel already loads Playwright, through `device.ts`. Agent's `exports` are what keep `cli.ts` out of io's reach.

Plan: `docs/plans/2026-10-05-s2-12-io-actor-backend.md`.

## Out of scope

- A backend toggle in the arena.
- Mixing backends inside a run set, or falling back from Jev to the LLM.

## Notes for the reviewer

- Check that `runner.ts` gained no runtime import of agent.
