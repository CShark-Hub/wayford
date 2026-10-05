# s2-12 — io runs a run set on the chosen Actor backend

Stream: s2
Milestone: week 4
Size: S
Depends on: s2-06

## Context

Read first, in this order:

- `docs/adr/0001-jev-actor-backend.md` — one backend per run set; the gate passed, so the sweep and `seed:demo` run on Jev
- `packages/io/src/server.ts` — builds `llmActor` whatever `LLM_ACTOR_BACKEND` says (the follow-up named in PR #158)
- `packages/io/src/routes/runs.ts` — `RunsRequest`
- `packages/io/src/runner.ts` — `RunnerOptions.actor`
- `packages/agent/src/cli.ts` after s2-06 — `backendFactory`, `ActorBackendName`

## Goal

`POST /runs` takes an optional `backend`, `llm` or `jev`, and every run of the set runs on it, so the sweep and `seed:demo` reach Jev through the same runner as the arena.

## Interface

- In: `RunsRequest` with `backend?: "llm" | "jev"`
- Out: the runner builds the Actor per run set from the named backend; without `backend`, io uses `LLM_ACTOR_BACKEND` (default `llm`)
- Files expected to change: `packages/io/src/server.ts`, `runner.ts`, `routes/runs.ts`, their tests; `packages/agent/src/index.ts` if `backendFactory` has to move out of the CLI module to be importable

## Constraints

- One backend per run set (ADR 0001, decision 1). A request never mixes them.
- The runner still imports agent as types only. The factories are built in `server.ts`, the one io module that loads agent's runtime.
- The web is unchanged. The arena keeps sending no `backend`, so the live race runs on `LLM_ACTOR_BACKEND`, which the demo keeps unset or `llm` (`docs/DEMO.md`, "Before the demo").

## Acceptance

- [ ] `pnpm --filter @wayford/io test` passes:
  - with fake backends, `backend: "jev"` gives runs whose `runStarted.modelIds.actor` is the Jev model and `backend: "llm"` the LLM's;
  - no `backend` follows `LLM_ACTOR_BACKEND`;
  - `backend: "other"` is a 400 and starts nothing.
- [ ] With a real key, `POST /runs` with `backend: "jev"`, Ada, the easy goal and seed 1 ends `success` (the stored run's `modelIds` in the PR)
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- A backend toggle in the arena.
- Mixing backends inside a run set, or falling back from Jev to the LLM.

## Notes for the reviewer

- Check that `runner.ts` gained no runtime import of agent.
