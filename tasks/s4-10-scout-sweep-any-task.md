# s4-10 — Scout over HTTP and the sweep CLI on any stored task

Stream: s4
Milestone: week 4, any target (finals)
Size: M
Depends on: s2-13. Its report box waits for s4-09.

## Context

Read first, in this order:

- `AGENTS.md` — "Scout is mandatory", and the capability-axis sweep
- `docs/adr/0003-any-target.md` — D3, D6 and D9
- `docs/STACK.md` and `docs/CONVENTIONS.md`
- `docs/specs/2026-10-05-s4-05-sweep.md` — the sweep engine and its CLI
- `packages/io/src/sweep-cli.ts` — it loads stored tasks already, and serves the target app on 5174 whatever the task
- `packages/agent/src/run-scout.ts`, `scout.ts` — Scout runs the fixture tasks only
- `packages/io/src/analyst.ts` — `readGroundTruth(dir, task.id)`, where the report's Scout line comes from
- `packages/io/src/routes/runs.ts`, `routes/tasks.ts`, `routes/reports.ts` — what io already serves

## Goal

io can Scout any stored task over HTTP, so the Target screen (`s3-15`) can start it, and the sweep CLI runs on a stored foreign task without building the target app. A report on such a task opens with its Scout line.

## Interface

- `POST /tasks/:id/scout`: runs Scout on the stored task and writes `<taskId>.json` where the report reads ground truth. Answers 202.
- `GET /tasks/:id/scout`:
  - 200 with the ground truth once it is written;
  - 202 while Scout runs;
  - 404 when none was started.
- `sweep-cli.ts` and the Scout CLI take any stored task. They serve the target app only for a task on it, and only when nothing already serves it.
- Off the target app, `POST /runs` and the CLIs refuse a run set, Scout or sweep whose backend is Jev, whether the request names it or io's default resolves to it, naming `docs/adr/0003-any-target.md` D9.
- The run set and the report need nothing new: `POST /runs` takes up to ten seeds, and `POST /reports/:taskId` takes any task.
- Files expected to change: `packages/io/src/routes/tasks.ts`, `routes/runs.ts`, `sweep-cli.ts`, `server.ts`, `packages/agent/src/run-scout.ts`, `cli.ts`, and their tests

## Constraints

- "The Actor has no access to Scout's output." Scout's ground truth is written where the Analyst reads it and nowhere the Actor reads.
- The sweep keeps its rules: a capability axis, never a site parameter; softness fixed for the whole sweep; the same seeds at every value (`docs/PLAN.md` F9).
- One Scout per task at a time. A second `POST /tasks/:id/scout` while one runs answers 202 with the running one.

## Acceptance

- [x] `pnpm --filter @wayford/io test` passes with a fake run function and includes:
  - `POST /tasks/:id/scout` writes ground truth that `GET /tasks/:id/scout` serves and the report then reads;
  - Jev for a task off the target app is refused by `POST /runs`, and runs nothing.

  Evidence:
  - `routes/tasks.test.ts`, "POST scout writes ground truth that GET serves and the report opens with": agent's real `scout` over `fakeRun()`. `GET` answers 202 while Scout runs, then 200, and the report's `scout` line says reached.
  - `routes/runs.test.ts`, "Jev on a task off the target app is a 422 naming D9 and starts no run, whether named or the default".
  - `runner.test.ts`: `start` throws, and no run is called or stored.
- [x] `pnpm --filter @wayford/io sweep -- --task <a stored foreign task> …` runs on the LLM without building the target app. The PR shows its table, and the Boundary opening the stored sweep.

  Evidence, on the real key, 2026-10-07:
  - `task_01m4b5p4nh97x5k87brhrvy37t` (`https://example.com/`) was stored through `POST /tasks`.
  - `--persona vera --axis contrast --from 3 --to 4.5 --step 1.5 --seeds 1 --backend llm` exits 0:
    - header: `site       https://example.com, not the target app: no parameters, no jargon list`;
    - sweep `swp_01m4b5pfbqsrg2bn7hmq7d2wx8` is complete: 0/1 at 3.0 and at 4.5, no errors, boundary 3.0;
    - 0.0055 USD, 2 min 33 s.
  - stderr has no Vite or build line.
  - `/boundary/swp_01m4b5pfbqsrg2bn7hmq7d2wx8` opens it (screenshot in the PR).
  - The 0/1 is real: example.com has no link on it today, so the goal cannot be reached.
  - With `--backend jev` the sweep exits 1 with `jev_off_target_app ... (docs/adr/0003-any-target.md, D9)`.
- [x] Once `s4-09` is in: under `pnpm dev`, a stored task on a public site, scouted, with a run set and a report, gives a report with its Scout line and axe findings. The PR shows it.

  Evidence, on the real key, 2026-10-07, at 3484d10 (main with s4-09 merged in):
  - io's and web's dev servers from this branch, on 3100 and 5183, since another worktree's `pnpm dev` held 3000, 5173 and 5174. The task needs no target app.
  - `POST /tasks` stored `task_01m4bv06qpezpt8h5psfk49pwh`: start `https://www.w3.org/WAI/demos/bad/before/home.html`, the W3C's inaccessible demo, `urlMatches` `**/WAI/demos/bad/before/tickets.html`.
  - `POST /tasks/:id/scout` answered 202, `GET` 202 while it ran, then 200 after about 35 s: reached in 3 of 3 attempts, each one click on `//link:Tickets`.
  - `POST /runs` with Ada and Vera, seed 1, `backend: "llm"`: Ada got through in 1 step, and Vera ran out of budget after 20 steps.
  - `POST /reports/:id` with `backend: "llm"` answered 201. `scout` is `{ status: "reached", steps: 1 }`.
  - The report has 7 findings:
    - six axe-core measurements on the home page: `color-contrast`, `html-has-lang`, `image-alt`, `link-name`, `select-name` and `target-size`;
    - one hypothesis, "The ticket route works, but Vera does not discover it from the homepage".
  - `/report/<id>` shows "Scout reached it in 1 step · $0.0073 in all" and the seven findings (screenshot in the PR).
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root. Evidence: lint "Checked 411 files … No fixes applied"; typecheck clean; test "Test Files 162 passed (162)", "Tests 2490 passed (2490)".

## Out of scope

- Starting a sweep over HTTP (`docs/adr/0003-any-target.md`, Considered options).
- Route tables, route-open numbers or closure findings for any task but the hard goal.
- Cancelling Scout, a run or a sweep.
- The Target screen itself: `s3-15`.

## Notes for the reviewer

- Check that the target app is never served twice: `pnpm dev` holds 5174.

## Outcome

What shipped differs from the interface above in five ways (`docs/specs/2026-10-07-s4-10-scout-sweep-any-task.md`, decision log):

- **The Scout CLI on a stored task is io's.** It runs as `pnpm --filter @wayford/io scout -- --task <id>`, since agent may not import io's database. agent's `pnpm --filter @wayford/agent scout` keeps the two fixture goals. Both reuse the target app when it answers on 5174 instead of serving a second copy.
- **`GET /tasks/:id/scout` adds a 502.** It answers 502 `{ error }` after a failed Scout, until the next `POST`, so a screen never polls a dead job. It answers 200 for a ground-truth file that a CLI or an earlier process wrote.
- **The Jev refusal is a 422 from `runner.start`.** Every caller gets it: `POST /runs`, the sweep and `seed:demo`. A screen off the target app has to send `backend: "llm"` when io's default is Jev (`s3-15`, `s3-16`).
- **"Nothing already serves it" means no HTTP answer on `localhost:5174`.** The target app is reused when it answers there, and anything else is refused (`target_app_unavailable`). `/@vite/client` tells `pnpm dev` from a preview. A sweep or Scout on the dev server says so in its output, since `docs/STACK.md` wants a build for seeded runs. The stored sweep does not record it.
- **Scout takes a run function** (`ScoutOptions.run`) instead of a browser. So io's Scout shares the runs' Chromium, and the test drives the real Scout over `fakeRun()`.
