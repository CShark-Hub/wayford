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

- [x] `pnpm --filter @wayford/agent test` passes and includes: 25 files, 440 tests passed (after merging `main` at PR review).
  - a run handed no `params`, on a page served on a second port, opens its start URL unchanged, and its `RunResult.startUrl` equals `task.startUrl`; `actor-loop.browser.test.ts`, "as another site, handed no params": "a run opens its start URL as given and records it unchanged", on `http://127.0.0.1:<port>?q=1#h`, which `new URL` would respell;
  - a run handed `params`, on the target app on a free port, records the start URL with the three parameters, as today; `actor-loop.browser.test.ts`: "a run handed params records the start URL with the three parameters, on a free port";
  - K2 never fires on a run handed no jargon list, even on an element whose name is a term from the target app's list; "K2 never fires with no jargon list, even on a term from the target app's list" (Kai, "Fulfilment ledger", which the existing target-app run marks K2);
  - on a page with an infinite CSS animation and a failing `@font-face`, a run handed no `params` reaches its outcome and is no `error` run, and each step spends milliseconds in `settle`, not the deadline; "an endless spinner and a font that 404s cost each step milliseconds, not the deadline": two steps to `success`, each gap that holds one `settle` under `SETTLE_TIMEOUT_MS`, and what was skipped logged. With `settle` forced strict the same test fails `error`. `settle.browser.test.ts`: "lenient: an endless animation and a failed font are skipped at once, and named", under 500 ms;
  - (reworded in review, see Outcome) with `params`, `settle` stays strict: a failing font alone still gives `font_failed`, and the page with the endless animation too still fails, `page_not_settled` at the deadline. A unit test of the settle check is enough. `settle.browser.test.ts`: "a used font that cannot be fetched fails font_failed, naming its family" (strict, unchanged) and "strict: the same page is not settled at the deadline, the spinner named".
- [x] `pnpm --filter @wayford/io test` passes with a runner test of two tasks: one on the configured target-app origin, handed the parameters and the jargon list, and one on another origin, handed neither. 37 files, 347 tests passed. `runner.test.ts`: "a task on the target app's origin gets the parameters and the jargon list; any other origin, the same host on another port included, neither", with a third task on `localhost:8080`
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root: lint clean on 390 files, typecheck clean, 154 files and 2262 tests passed (after merging `main` at PR review)

## Out of scope

- Following a tab the action opens: `s2-14`.
- The Lens's measurement and axe on any URL: `s4-09`. `live-measure.ts` keeps its own page loading here.
- The step cap (`DEFAULT_MAX_STEPS`), cookie banners, logins.

## Notes for the reviewer

- Look first at the runner's origin check: the port must count, or a user's app on `localhost:8080` is taken for the target app.
- `settle` is shared by every run. Check that the path a run handed `params` takes through it is the old one, line for line.

## Outcome

- **The fifth agent sub-item, reworded.** It read: "the same page with `params` still gives `font_failed`". That cannot happen. Strict `settle` waits on animations before it checks fonts, so on the page with both the endless animation and the failing font, a run handed `params` reaches the deadline first and fails `page_not_settled`, on `main` too. Changing that order would change the strict path, which must stay as it is. So the item now states what the two tests prove: strict `settle` still fails a failed font `font_failed` on the font alone, and on the combined page it still fails, `page_not_settled`. The rewording is the agent's and waits for the task author's agreement in review.
- **Files beyond the expected list.** `targetAppOrigin` is required on the runner, so `test-app.ts`, `sweep-cli.ts` and `seed-demo-cli.ts` pass one. The three io browser tests that serve the app on a free port also pass one: `sweep`, `seed-demo` and `runs`. Without it their runs would quietly lose the parameters.
- **`settle`'s signature.** It now takes `{ lenient, timeoutMs }` and returns what it skipped. The loop logs that, once per settle, as "settle skipped what never ends".
- **`jargon` is optional on `runActor`.** Absent, K2 is off. A run handed `params` without the list is refused with `invalid_run_input` before any event, so a run on the target app cannot turn K2 off without a sound.
- **Scroll-driven animations, added in PR review.** Lenient `settle` also sets aside an animation whose timeline is not the document's, such as a reading-progress bar on `animation-timeline: scroll()`. It runs until the page is scrolled to its end, so waiting cannot end it, which is the task's Goal and ADR 0003 D4's reason, if not the Interface's "iteration count is infinite". The strict path is untouched.
- **The CLIs' origin.** The sweep and `seed:demo` CLIs hand the runner `http://localhost:5174`, as `server.ts` does, not the URL Vite reports for the app they serve, which is `127.0.0.1` under `--dns-result-order=ipv4first`.
- **The runner compares exact origins.** A task on `http://127.0.0.1:5174/` is another site to io, configured with `http://localhost:5174`. The Target form (`s3-15`) should say so, or offer the target app's own URL.
