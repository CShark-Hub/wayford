# s2-13 — Runs on any site: start URL, jargon and settle

Stream: s2
Milestone: week 4, any target (finals)
Size: M
Depends on: none

## Context

Read first, in this order:

- `AGENTS.md`
- `docs/adr/0003-any-target.md` — D2, D3 and D4 are this task
- `docs/STACK.md` and `docs/CONVENTIONS.md`
- `packages/agent/src/start-url.ts` — `startUrlFor` appends the target app's three parameters to every start URL
- `packages/agent/src/run-context.ts`, `actor-loop.ts`, `scout.ts` — where `params` and `jargon` are required
- `packages/agent/src/settle.ts` — `font_failed`, and the wait on running animations up to its deadline
- `packages/io/src/server.ts` (`TARGET_APP_ORIGIN`, `params`, `jargon`) and `packages/io/src/runner.ts` — what every run gets today
- `packages/agent/src/test-support.ts`, `calibration-run.ts`, `packages/filter/src/serve-target-app.ts` — the target app served on a free port, on purpose

## Goal

A run handed no target-app parameters opens its start URL exactly as given, perceives with no jargon list, and spends no time waiting on fonts that failed or animations that never end. A run handed the parameters behaves exactly as today.

## Interface

- In: `Task` from `@wayford/core`, with any http(s) `startUrl`
- Out: `RunResult` from `@wayford/core`, unchanged in shape
- `params` becomes optional on a run, on Scout and on `startUrlFor`. A run handed no `params` is on another site:
  - the recorded `startUrl` equals `task.startUrl`;
  - it gets no jargon list;
  - it gets the lenient `settle` below.
- A run handed `params` is on the target app, wherever it is served: the CLIs and the tests keep passing them, as they do today.
- io's runner decides per run: a task whose start URL's origin, port included, is io's `TARGET_APP_ORIGIN` gets the parameters and the target app's jargon list; any other task gets neither. The origin stays in io's config, where it is today.
- The lenient `settle`:
  - a font face that failed is logged, and the step goes on;
  - an animation whose iteration count is infinite is not waited on. Every other animation is waited on up to the deadline, as today.
- Files expected to change: `packages/agent/src/start-url.ts`, `run-context.ts`, `actor-loop.ts`, `scout.ts`, `settle.ts`, `packages/io/src/server.ts`, `runner.ts`, and their tests

## Constraints

- "Elements below threshold never reach the model. Zero LLM in this layer." Nothing here touches `perceive` beyond the jargon it is handed.
- Determinism on the target app is unchanged: the seed test and the calibration pass without edits, on whatever port they serve the app.
- Agent holds no target-app origin. Whether a run is on the target app is decided by whoever hands it `params`.
- No change to a core schema. The lenient `settle` logs what it skipped, and the run record has no field for it. A field is a contract change and gets its own issue.

## Acceptance

- [ ] `pnpm --filter @wayford/agent test` passes and includes:
  - a run handed no `params`, on a page served on a second port, opens its start URL unchanged, and its `RunResult.startUrl` equals `task.startUrl`;
  - a run handed `params`, on the target app on a free port, records the start URL with the three parameters, as today;
  - K2 never fires on a run handed no jargon list, even on an element whose name is a term from the target app's list;
  - on a page with an infinite CSS animation and a failing `@font-face`, a run handed no `params` reaches its outcome and is no `error` run, and each step spends milliseconds in `settle`, not the deadline;
  - the same page with `params` still gives `font_failed`. A unit test of the settle check is enough.
- [ ] `pnpm --filter @wayford/io test` passes with a runner test of two tasks: one on the configured target-app origin, handed the parameters and the jargon list, and one on another origin, handed neither
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Following a tab the action opens: `s2-14`.
- The Lens's measurement and axe on any URL: `s4-09`. `live-measure.ts` keeps its own page loading here.
- The step cap (`DEFAULT_MAX_STEPS`), cookie banners, logins.

## Notes for the reviewer

- Look first at the runner's origin check: the port must count, or a user's app on `localhost:8080` is taken for the target app.
- `settle` is shared by every run. Check that the path a run handed `params` takes through it is the old one, line for line.
