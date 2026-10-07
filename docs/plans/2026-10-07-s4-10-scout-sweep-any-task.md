# s4-10 — Scout over HTTP and the sweep CLI on any stored task: plan

Task: `tasks/s4-10-scout-sweep-any-task.md` · Spec: `docs/specs/2026-10-07-s4-10-scout-sweep-any-task.md`
Status: approved 2026-10-07 (auto)

| # | Step | Files | Serves box | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| A | agent: Scout takes `run`, and `targetAppOnFixturePort` | `packages/agent/src/scout.ts`, `scout.browser.test.ts`, `cli.ts`, `cli.test.ts`, `run-scout.ts` | 1 (Scout over a fake run), 2 (no build when served) | `cli.test.ts`: reuses a port that answers (`"build"`), says `"dev"` when `/@vite/client` answers, calls `serve` when nothing answers. `scout.browser.test.ts` passes `run`. | `pnpm --filter @wayford/agent typecheck` and `pnpm --filter @wayford/agent exec vitest run src/cli.test.ts src/scout` green, lint clean | B |
| B | io: `onTargetApp`, `refuseJevOffTargetApp`, 422 on `POST /runs` | `packages/io/src/runner.ts`, `runner.test.ts`, `routes/runs.ts`, `routes/runs.test.ts` | 1 (Jev refused, runs nothing) | `runner.test.ts`: `start` throws `jev_off_target_app` for Jev off the app, named or by default, and mints nothing; LLM off the app and Jev on it start. `runs.test.ts`: 422 naming D9, `fakeRun().calls` empty, `GET /runs` empty. | `pnpm --filter @wayford/io typecheck` and `pnpm --filter @wayford/io exec vitest run src/runner.test.ts src/routes/runs.test.ts` green, lint clean | A |
| C | io: Scout over HTTP | `packages/io/src/db/tasks.ts`, `scout-jobs.ts` (new), `scout-task.ts` (new), `routes/tasks.ts`, `routes/tasks.test.ts`, `app.ts`, `test-app.ts`, `server.ts`, `scout-isolation.test.ts` (new) | 1 (POST/GET scout, report reads it) | `tasks.test.ts`: the acceptance test from the spec's mapping (real `scout` over `fakeRun(() => ({ step: true, gate }))`, 202 then 200, report has `scout.reached`); one Scout per task; 404 unknown task; 404 nothing started; 502 after a failure until the next POST; 200 for a file written before; 400 for a bad id or body. `scout-isolation.test.ts`: only `scout-task.ts` imports `@wayford/agent/scout`. | `pnpm --filter @wayford/io typecheck` and `pnpm --filter @wayford/io test` green, lint clean | — (after A and B) |
| D | io: the sweep CLI on any task, and the Scout CLI | `packages/io/src/sweep-cli.ts`, `scout-cli.ts` (new), `packages/io/package.json` | 2 (sweep on a stored foreign task) | None automated: both CLIs load `.env` and bill, and no test imports them (as for `sweep-cli.ts` today). The refusal and the probe they call are tested in B and A. | `pnpm --filter @wayford/io typecheck`, lint clean. `pnpm --filter @wayford/io sweep -- --task task_nope ...` exits 1 with `task_not_found`. `pnpm --filter @wayford/io scout` with no args exits 2 with usage. | — (after C) |
| E | Verify | task file | all | — | `pnpm lint`, `pnpm typecheck`, `pnpm test` green at the root; the acceptance commands run, or listed for the user where they need the real key | — |

Notes:

- A and B touch disjoint packages and neither changes `pnpm-lock.yaml`. D adds a script to `packages/io/package.json` and no dependency, so the lockfile is untouched.
- C uses `ScoutRunFn` from A and `onTargetApp` from B. D uses `targetAppOnFixturePort` from A, `refuseJevOffTargetApp` from B, and `loadTaskOrFixture` and `scoutTask` from C.
- Box 2's real-key run, a foreign task stored through the Extractor and then swept on the LLM, needs the root `.env` linked into the worktree. That happens only on the user's yes. Without one, the box is listed for the user with the exact commands.
- Box 3 waits on `s4-09`.
- (build) Step C's `scout-isolation.test.ts` was deleted in the branch review: it only grepped `index.ts` (spec, "Review note"). The Scout CLI calls agent's `scout` directly, not `scoutTask`.

## Decision log

In the spec.
