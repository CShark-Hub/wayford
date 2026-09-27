# s4-03 — Runs API: start, stream, store, list

Stream: s4
Milestone: week 3
Size: L
Depends on: s2-03, s4-01, s4-02

## Context

Read first, in this order:

- `docs/PLAN.md` section "Architecture", F5, F6 AC1, F7 and F12, assumption A20
- `docs/STACK.md` section "API"
- `packages/io/src/app.ts` and `packages/io/src/routes/` after m0-07 — the SSE framing to keep
- `packages/io/src/db/` after s4-02
- `packages/agent/src/` after s2-03 — `runActor`

## Goal

`POST /runs` starts persona × seed runs inside the io process, each run streams its events live, every run is stored when it ends, and the web app can list, open and download runs: the week 3 meeting point, and the API the ring and the dashboard use.

## Interface

- In: `POST /runs` with `{ taskId, profileIds, seeds }`, validated with zod
- Out:
  - `202` with the run ids; `GET /runs/:id/events` (SSE); runs stored through s4-02 when they end
  - `GET /runs?taskId&profileId&outcome`, `GET /runs/:id`, `GET /runs/:id/video`, `GET /runs/:id/trace`, `GET /runs/:id/steps/:index/screenshot`
  - `GET /profiles`, `GET /tasks`, and `POST /tasks`, which now stores the Extractor's task
- Files expected to change: `packages/io/src/**`, `packages/io/package.json`

## Constraints

- One Node process: no queue, no workers (`docs/PLAN.md`, "Architecture"). One browser, one context per run (F6 AC1), at most 5 runs at once.
- Every persona in one request gets the same seed list (A20).
- The seeds in one request are distinct: a repeated seed is a 400, since a run set runs each persona once per seed (A20).
- SSE keeps the m0-07 framing: `event:` is the `RunEvent` type, `data:` the event as JSON, `id:` its index in the run, and `Last-Event-ID` resumes. One stream per run; the ring opens at most five, under the browser's six connections per origin.
- The stored `RunResult` is `runResultFromEvents` of exactly the events streamed. A run that crashes is stored with outcome `error` and does not stop the others; a client that disconnects does not stop a run.
- Validation at the edge with `@hono/zod-validator` and the core schemas. Responses are core shapes.
- Downloads name persona, seed and run id (F12 AC3) and serve only files under the runs directory.
- Tests use a fake runner behind the same interface as `runActor`; one test runs the real `runActor` with the fake LLM adapter against the target app.

## Acceptance

- [ ] `pnpm --filter @wayford/io test` passes, with a test per route
- [ ] `POST /runs` for 2 personas × 2 seeds returns 4 run ids; each stream ends with `runFinished` or `runFailed`, and `GET /runs` then lists all four
- [ ] `POST /runs` with `seeds: [1, 1]` returns 400 and starts no run
- [ ] A fake run that throws is stored with outcome `error`, and the others finish and are stored
- [ ] Every stored run deep-equals `runResultFromEvents` of the events its stream sent
- [ ] `GET /runs?profileId=prof_vera&outcome=gave_up` returns only matching runs
- [ ] The video download's file name contains persona, seed and run id; a stored path outside the runs directory gives 404
- [ ] `POST /tasks` stores the task and `GET /tasks` lists it
- [ ] With `pnpm dev` and a real key, `POST /runs` for Ada, Vera and Zoya on the easy goal, then `curl -N` on each stream, shows three runs that `GET /runs` lists afterwards (output in the PR)
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- UI: the ring (s3-03), the dashboard (s3-04).
- Several runs over one connection, live video, cancelling or retrying runs.
- Calling Scout before the runs. Week 4, with the Analyst that reads ground truth.

## Notes for the reviewer

- Start two requests at once and check no event reaches the wrong stream.
- Try `../` in a stored path. This is the only file-serving code in the project.
