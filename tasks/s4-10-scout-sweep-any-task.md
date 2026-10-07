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

- [ ] `pnpm --filter @wayford/io test` passes with a fake run function and includes:
  - `POST /tasks/:id/scout` writes ground truth that `GET /tasks/:id/scout` serves and the report then reads;
  - Jev for a task off the target app is refused by `POST /runs`, and runs nothing.
- [ ] `pnpm --filter @wayford/io sweep -- --task <a stored foreign task> …` runs on the LLM without building the target app. The PR shows its table, and the Boundary opening the stored sweep.
- [ ] Once `s4-09` is in: under `pnpm dev`, a stored task on a public site, scouted, with a run set and a report, gives a report with its Scout line and axe findings. The PR shows it.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Starting a sweep over HTTP (`docs/adr/0003-any-target.md`, Considered options).
- Route tables, route-open numbers or closure findings for any task but the hard goal.
- Cancelling Scout, a run or a sweep.
- The Target screen itself: `s3-15`.

## Notes for the reviewer

- Check that the target app is never served twice: `pnpm dev` holds 5174.
