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
- A run's id is its only number: runs carry no index, and the ids `POST /runs` returns are the run numbers the run header shows (F7 AC4, issue #94). io mints each `RunId` before its run starts and passes it to `runActor`, so the `202` can return ids for runs that have not finished. Within a run set, persona and seed already tell runs apart; across a sweep, runs are told apart by the swept value, which #64 tracks.
- SSE keeps the m0-07 framing: `event:` is the `RunEvent` type, `data:` the event as JSON, `id:` its index in the run, and `Last-Event-ID` resumes. One stream per run; the ring opens at most five, under the browser's six connections per origin.
- The stored `RunResult` is `runResultFromEvents` of exactly the events streamed. A run that crashes is stored with outcome `error` and does not stop the others; a client that disconnects does not stop a run.
- Validation at the edge with `@hono/zod-validator` and the core schemas. Responses are core shapes.
- Downloads name persona, seed and run id (F12 AC3) and serve only files under the runs directory.
- Tests use a fake runner behind the same interface as `runActor`; one test runs the real `runActor` with the fake LLM adapter against the target app.

## Acceptance

- [x] `pnpm --filter @wayford/io test` passes, with a test per route. 14 files, 107 tests, the browser test included. `GET /health` and the fixture replay are in `app.test.ts`. `routes/runs.test.ts` has one `describe` per runs route: `POST /runs`, `GET /runs`, `GET /runs/:id`, `GET /runs/:id/events`, `GET /runs/:id/video`, `GET /runs/:id/trace` and `GET /runs/:id/steps/:index/screenshot`. `routes/tasks.test.ts` covers `POST /tasks` and `GET /tasks`, and `routes/profiles.test.ts` covers `GET /profiles`.
- [x] `POST /runs` for 2 personas × 2 seeds returns 4 run ids; each stream ends with `runFinished` or `runFailed`, and `GET /runs` then lists all four. The test is "a run set of 2 personas × 2 seeds streams four runs and stores them". The 202 holds four runs in seed-major order. Each stream is read to its end, and `GET /runs` lists the four. The real-key box below showed the same on three real runs.
- [x] `POST /runs` with `seeds: [1, 1]` returns 400 and starts no run. In "a repeated seed is a 400 and starts no run", the fake run is never called and `GET /runs` is `[]`. A repeated profile id, 11 seeds and an unknown key are 400s too, an unknown task or profile is a 404, and a valid body sent as `text/plain`, as a form or with no type is a 415; none of them starts a run.
- [x] A fake run that throws is stored with outcome `error`, and the others finish and are stored. In "a run that throws is stored as error and the others are stored", one of four fakes throws after `runStarted`. Its stream ends in io's own `runFailed`, and all four are listed. "a run that ends in its own runFailed is stored as error, with its video" covers the path a real crash takes. "a run that throws before it starts streams one runFailed, and nothing is stored" covers the throw before `runStarted`: that run is not stored, and its stream still ends. `runner.test.ts` covers the runner's own close-out paths: a rejection after `runStarted`, and a run that returns without a terminal event.
- [x] Every stored run deep-equals `runResultFromEvents` of the events its stream sent. It holds by construction, since the runner stores its own fold of what it published. It is asserted on the runs of six tests in `routes/runs.test.ts` (the four-run box test and both crash tests among them) and five in `runner.test.ts`, and on the two real `runActor` runs in `runs.browser.test.ts`. It also held for the three real-key runs below: each stream's `data:` lines, folded, deep-equal the stored run, and every event on each stream carries that stream's run id.
- [x] `GET /runs?profileId=prof_vera&outcome=gave_up` returns only matching runs. In "the list filters by persona and outcome", Ada and Vera runs end `success` and `gave_up`, so the persona and the outcome each have a run that must drop out. The `taskId` filter is checked as well. An unknown key, a bad outcome and a repeated key are 400s.
- [x] The video download's file name contains persona, seed and run id; a stored path outside the runs directory gives 404.
  - **Names.** "the video downloads under its persona, seed and run id" checks the name `vera-seed1-<id>.webm` and the type `video/webm`. On the real-key run, Zoya's download came back as `attachment; filename="zoya-seed1-run_01m3yj0q5jsvtv3109969w41hf.webm"; filename*=UTF-8''…`, 1,315,768 bytes, and the trace and the step-19 screenshot were named the same way.
  - **Containment.** In "a stored path outside the run's folder is a 404", every target is a real file, so the 404 can only come from the containment check: `<tmp>/outside.webm` through `../../outside.webm`, the same file by its absolute path, and another run's video. A file inside the run's folder downloads with 200 in the same test. `run-files.test.ts` covers the check itself.
- [x] `POST /tasks` stores the task and `GET /tasks` lists it. In "a task the Extractor accepts is stored and listed", the 201's task is exactly what `GET /tasks` then lists. A goal the check refuses stores nothing. The real-key box below stored `task_01m3yj0ahb2jx622agrxbkcr0g` the same way.
- [x] With `pnpm dev` and a real key, `POST /runs` for Ada, Vera and Zoya on the easy goal, then `curl -N` on each stream, shows three runs that `GET /runs` lists afterwards. The output is in Outcome below and in the PR. All three streams ended with `runFinished`, and `GET /runs` listed the three runs.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root.
  - **In CI.** PR #144's CI run 37043049622, attempt 2, passed: lint checked 192 files with no fixes, typecheck passed, and the tests ran 67 files, 1,059 tests.
  - **The first attempt** failed one agent test, "a back to a page that never finishes loading fails page_not_settled at the deadline" in `act.browser.test.ts`. The rerun of that job passed, and `main`'s CI passed at `f1e85c9` and `19182af`, so it reads as a timing flake under CI load; see Outcome.
  - **Locally,** on the branch rebased onto `main` at `f1e85c9`, lint, run as `biome check .` because a local hook rewrites `pnpm lint`, and typecheck passed. 1,058 of 1,059 tests passed. The one that failed is agent's "a 400 ms CSS animation is waited out" in `settle.browser.test.ts`, because this machine's Chromium draws no animation frames. It fails there at `654ddd2` too, and CI passes it.

## Out of scope

- UI: the ring (s3-03), the dashboard (s3-04).
- Several runs over one connection, live video, cancelling or retrying runs.
- Calling Scout before the runs. Week 4, with the Analyst that reads ground truth.

## Notes for the reviewer

- Start two requests at once and check no event reaches the wrong stream.
- Try `../` in a stored path. This is the only file-serving code in the project.

## Outcome

Built as `docs/specs/2026-10-02-s4-03-runs-api.md` says; its decision log has every choice, the ones taken during the build marked "(build)". What a reader of this file should know:

- **The modules.**
  - `runner.ts` is the job runner: five slots, live events, saving.
  - `chromium.ts` runs `runActor` on one shared Chromium.
  - `run-files.ts` holds the containment check and the download headers.
  - `routes/runs.ts`, `routes/tasks.ts` and `routes/profiles.ts` are the routes, and `server.ts` wires them.
  - `test-app.ts` is io's test support: `testApp` and `runnerDefaults`, `fakeRun` and `gate`, the JSON request helpers, and `readSse` and `readEvents`.

  io's library code imports agent as types only. Only `server.ts` and `chromium.ts` load agent's runtime and Playwright, and the barrel is unchanged.
- **The API.**
  - `POST /runs` answers 202 `{ runs: [{ id, profileId, seed }] }`, seed-major. It answers 400 for a repeated seed or persona, more than 10 seeds, or any other invalid body, and 404 for an unknown task or persona; neither starts a run.
  - Any `POST` whose body is not `application/json` is a 415, so a page under test cannot start runs or call the Extractor with a `text/plain` request that needs no CORS preflight (from the PR review).
  - `GET /runs` takes `taskId`, `profileId` and `outcome`, and an unknown key is a 400.
  - `GET /runs/:id`, the events stream, and the video, trace and step screenshot downloads.
  - `GET /profiles` returns core's fixture personas. `GET /tasks` lists, and `POST /tasks` now stores.
- **A stream ends only once the save has been tried.** The runner holds the terminal event back until the save, so a client that sees `runFinished` finds the run in `GET /runs`. If the save fails, the error is logged, the stream still ends with its terminal event, and the run is missing from the list. A run that stops without a terminal event gets io's own `runFailed`, and is stored as `error`.
- **Tasks come from the database only.** Core's two fixture tasks are not seeded, so the arena, and anyone with `curl`, starts with `POST /tasks`.
- **Screenshots are served while a run is live,** from its `actionPerformed` events, so the ring can show each run's latest step (s3-03).
- **At most five runs at once per app,** FIFO across requests, on one Chromium that the first run launches.
- **A run that never sent `runStarted` is not stored.** Only a bug, or a Chromium that does not launch, gets there. Its stream ends with a `runFailed`; for a missing browser that is `browser_launch_failed`, naming the install command.
- **Boot.** `server.ts` migrates the database before it opens it, and keeps run files in the repository's `runs/`, which `run:one` uses too. `playwright` joined io's dependencies at agent's range; the lockfile gained io's importer entry only.
- **The real-key run,** on 2026-10-02, with `pnpm dev` and every role on Luna:

  ```
  POST /tasks  201  task_01m3yj0ahb2jx622agrxbkcr0g
                    goal "You want to check where your next parcel is being sent."
                    strippedPaths ["Account", "Address"], rewritten true
  POST /runs   202  run_01m3yj0q5hcz3eb1r4w5hw68a4  prof_ada   seed 1
                    run_01m3yj0q5jbza7hb61gjdncdwv  prof_vera  seed 1
                    run_01m3yj0q5jsvtv3109969w41hf  prof_zoya  seed 1
  curl -N      ada   10 events, ends runFinished success
               vera  10 events, ends runFinished success
               zoya  82 events, ends runFinished budget_exceeded
  GET /runs    200  (newest first)
    run_01m3yj0q5jsvtv3109969w41hf  prof_zoya  seed 1  budget_exceeded  steps 20  102938 ms  $0.0025609
    run_01m3yj0q5jbza7hb61gjdncdwv  prof_vera  seed 1  success          steps 2     7692 ms  $0.000264
    run_01m3yj0q5hcz3eb1r4w5hw68a4  prof_ada   seed 1  success          steps 2    21230 ms  $0.0002647
  ```

  No warning or error was logged. The three runs cost $0.0031 together.
- **Follow-ups.**
  - `GET /runs` returns whole `RunResult`s, so three runs made 243 KB, mostly Zoya's 20 observations. When the dashboard needs it, add a summary route. That would be a new contract.
  - No range requests: a video plays from start to end but may not seek. When s3-04's player needs seeking, `serveStatic` from `@hono/node-server` gives them, at the cost of reporting every stat failure as a 404 (spec, decision log).
  - Live events are kept in memory for the life of the process. A run in flight when io restarts, which `tsx watch` does on every save, is lost.
  - Symlinks inside a run's folder are followed. Only our own code writes there.
  - A flaky agent test: "a back to a page that never finishes loading fails page_not_settled at the deadline" (`act.browser.test.ts`, s2-03) failed once in this PR's CI and passed on the rerun. With a 300 ms deadline, the `back` resolved as if no navigation had started. That fits a timing race when the CI runner is busy, and this branch adds an io browser test that runs beside it. Worth a look by whoever next touches `act.ts`.
  - `StartedRun`, the `POST /runs` receipt `{ id, profileId, seed }`, is the one response shape not in core, so the arena (`s3-03`) builds its 3-field schema from core's `RunId`, `ProfileId` and `Seed`. Decided on 2026-10-02 to leave it in io; it moves to core if a second consumer appears.
  - Hardening, from the security review: io checks no `Host` header, so a page the developer visits could reach the API through DNS rebinding while `pnpm dev` runs, and start runs or read what they saw. Current Chrome blocks that by default. A few lines of middleware that refuse any host but `localhost`, `127.0.0.1` and `[::1]` would close it, as Vite's `allowedHosts` does for the two Vite servers.
  - Zoya ran out the 20-step cap on the easy goal on seed 1. Whether the filter or the agent caused that is a question for the calibration run (`s2-11`), not for this task.
