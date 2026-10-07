# s2-13 — Runs on any site: start URL, jargon and settle: spec

Task: `tasks/s2-13-runs-on-any-site.md` · Branch: `feature/s2-13-runs-on-any-site` · Date: 2026-10-07
Status: approved 2026-10-07 (auto)

## Goal

A run handed no target-app parameters opens its start URL exactly as given, perceives with no jargon list, and spends no time waiting on fonts that failed or animations that never end. A run handed the parameters behaves exactly as today.

## Constraints that bind

- ADR 0003 D2 to D4: what only the target app has (parameters, jargon list, strict `settle`) goes to a run only when the run is handed it. Off the target app a failed font is logged, and an animation that repeats forever is not waited on.
- "Agent holds no target-app origin. Whether a run is on the target app is decided by whoever hands it `params`."
- "No change to a core schema." The run record gets no field for what the lenient `settle` skipped.
- Determinism on the target app is unchanged: the seed test and the calibration pass without edits.
- Nothing touches `perceive` beyond the jargon it is handed. Zero LLM in the filter.
- `settle` is shared by every run: the strict path's behaviour is unchanged. Its diff is the lines that compute `waited` (equal to `running` when strict) and the success value, `{ failedFonts: [], endlessAnimations: [] }` in place of `null`.
- Out of scope: new tabs (`s2-14`), the Lens's measurement and axe (`s4-09`, `live-measure.ts` untouched), the step cap, cookie banners, logins.

## Design

### agent: `start-url.ts`

```ts
export function startUrlFor(task: Pick<Task, "startUrl">, params?: TargetAppParams): string
```

`params` absent: returns `task.startUrl` as given, not passed through `new URL` (which could normalise it), so the recorded `startUrl` equals `task.startUrl`. `params` given: unchanged.

### agent: `settle.ts`

```ts
export interface SettleOptions {
  /** Off the target app (ADR 0003 D4): failed fonts and endless animations are skipped, not errors. */
  lenient?: boolean;
  timeoutMs?: number; // SETTLE_TIMEOUT_MS when absent
}
/** What a lenient settle did not wait on. Both empty on the strict path. */
export interface Skipped {
  failedFonts: string[];       // font families whose face failed to load
  endlessAnimations: string[]; // labels as the deadline message writes them
}
export async function settle(page: Page, options: SettleOptions = {}): Promise<Skipped>
```

The in-page script takes `(timeoutMs, lenient)`. The one change to its loop:

- `running` is computed as today. When `lenient`, an animation waiting cannot end is set aside, in one pass, and its label noted at the end: its effect's `getTiming().iterations === Infinity`, or its timeline is not a `DocumentTimeline` (a scroll-driven one, added in PR review). The rest, `waited`, is what the loop waits on, names at the deadline and checks for zero. On the strict path `waited` holds every running animation.
- Once nothing is waited on, the failed-font check runs as today. Strict: a failed face is `font_failed`, as today. Lenient: the families go into `failedFonts` and the page counts as settled.
- Loading (`load`, `document.fonts.ready`) and every finite animation keep the deadline in both modes.

The script returns `{ code, why }` (unsettled) or `{ failedFonts, endlessAnimations }` (settled). The Node side throws on the first, as today, and returns the second.

The existing tests' three calls with a timeout (`settle.browser.test.ts` lines 123, 151, 173) become `settle(page, { timeoutMs: 300 })` and the like.

The doc comment carries ADR 0003's consequence: off the target app an element that animates forever is measured at whatever frame it is in, so the seed no longer fixes that measurement.

### agent: `actor-loop.ts`

- `RunActorOptions.params?: TargetAppParams` and `jargon?: readonly string[]`. Docs: a run handed `params` is on the target app and gets the strict `settle`; a run handed none is on another site, opens `task.startUrl` as given and gets the lenient `settle`. `jargon` is K2's list; absent, K2 never fires (`perceive` already treats a missing list so). `params` without `jargon` is refused, `invalid_run_input`, before any event, so a run on the target app cannot turn K2 off without a sound (added in the branch review).
- `Loop` gains `lenient: boolean` (`params === undefined`), and its `jargon` is `options.jargon ?? []`. `observe` and `land` call `settle(page, { lenient: loop.lenient })` inside `retryOnNavigation` and return what it skipped with their result. They log it once, after `retryOnNavigation` returns, so an attempt cut off by a navigation does not log twice: `logger.info({ step, failedFonts, endlessAnimations }, "settle skipped what never ends")`, only when either list is non-empty, so the strict path logs nothing new.
- `perceive(..., { jargon: loop.jargon })`: an empty list is no list, so K2 never fires off the target app.

### agent: `run-context.ts`

`RunContextOptions.params?: TargetAppParams`. `startUrlFor(task, params)` already handles the absence. Doc comments say so.

### agent: `scout.ts`

`ScoutOptions.params?: TargetAppParams`. Each attempt gets `params` and `targetAppJargon` when `params` is given, and neither when not.

### io: `runner.ts`

```ts
export interface RunnerOptions {
  ...
  /** The origin the target app is served on, port included: a task starting there gets `params` and `jargon`. */
  targetAppOrigin: string;
  params: TargetAppParams; // the target app's, handed only to runs on targetAppOrigin
  jargon: readonly string[]; // likewise
}
```

`createRunner` parses `new URL(targetAppOrigin).origin` once, so a bad config fails at startup, not on the first `POST /runs`. `start` decides once per set, since a set has one task: `new URL(task.startUrl).origin` equals that parsed origin. `URL.origin` keeps the port and drops a default one, so `http://localhost:8080` is never `http://localhost:5174`, and `http://localhost:80` equals `http://localhost`. On the target app each run gets `{ params, jargon }`; off it, neither key is set.

### io: callers of `createRunner`

- `server.ts`: `targetAppOrigin: TARGET_APP_ORIGIN`. The origin stays where it is.
- `sweep-cli.ts`, `seed-demo-cli.ts`: `targetAppOrigin: app.origin`, the app they serve on 5174.
- `test-app.ts` `runnerDefaults`: `targetAppOrigin: "http://localhost:5174"`, the core task fixtures' origin. `fakeRun` already calls `startUrlFor(task, params)`, which now takes an absent `params`.
- `sweep.browser.test.ts`, `seed-demo.browser.test.ts`, `runs.browser.test.ts`: they serve the app on a free port, so they pass `targetAppOrigin: target.origin` (`runs.browser.test.ts` through `testApp`'s options). Without it their runs would lose the parameters.

## Files

| File | Why |
|---|---|
| `packages/agent/src/start-url.ts` | `params` optional; absent returns `task.startUrl` as given |
| `packages/agent/src/start-url.test.ts` | the absent case |
| `packages/agent/src/settle.ts` | `SettleOptions`, `Skipped`, the lenient branch |
| `packages/agent/src/settle.browser.test.ts` | lenient tests; the strict ones' calls move to the options object |
| `packages/agent/src/actor-loop.ts` | `params` and `jargon` optional, lenient `settle` off the target app, the log line |
| `packages/agent/src/actor-loop.browser.test.ts` | the any-site runs, K2 with no list, the target app on a free port |
| `packages/agent/src/run-context.ts` | `params` optional |
| `packages/agent/src/scout.ts` | `params` optional, jargon only with it |
| `packages/io/src/runner.ts` | `targetAppOrigin` and the per-set decision |
| `packages/io/src/runner.test.ts` | the two-task test |
| `packages/io/src/server.ts` | hands `TARGET_APP_ORIGIN` to the runner |
| `packages/io/src/test-app.ts` | `runnerDefaults` gets the fixtures' origin. Not in the task's list: it builds every runner the io tests use |
| `packages/io/src/sweep-cli.ts`, `seed-demo-cli.ts` | pass the origin they serve on. Not in the task's list: `targetAppOrigin` is required, so typecheck finds them |
| `packages/io/src/sweep.browser.test.ts`, `seed-demo.browser.test.ts`, `runs.browser.test.ts` | pass the free port's origin, or their runs lose the parameters |
| `tasks/s2-13-runs-on-any-site.md` | boxes ticked |

No core schema, no `perceive`, no `live-measure.ts`, no web.

## Acceptance mapping

| Acceptance box | Proven by |
|---|---|
| agent: no `params`, page on a second port, start URL unchanged, `RunResult.startUrl === task.startUrl` | `actor-loop.browser.test.ts`, "on another site": "a run handed no params opens its start URL as given" (the start URL is `http://127.0.0.1:<port>?q=1#h`, with no `/` before the query: `new URL` would add one, and an appended parameter would show too) |
| agent: `params`, target app on a free port, start URL with the three parameters | `actor-loop.browser.test.ts`: "a run handed params records the start URL with the three parameters" (asserts `startUrl === startUrlFor(task, TARGET_APP_DEFAULTS)` and that it ends with `TARGET_APP_DEFAULT_QUERY`) |
| agent: K2 never fires with no jargon list, on a name from the target app's list | `actor-loop.browser.test.ts`, "on another site": Kai on a served page with a link named "Fulfilment ledger", no `params`, no `jargon`: the element has no K2 decision and its name reaches the Actor |
| agent: infinite animation + failing `@font-face`, no `params`: outcome reached, not `error`, each step milliseconds in `settle` | `actor-loop.browser.test.ts`, "on another site": two steps (click to a second such page, then `success`); from the event timestamps, each gap that holds one `settle` (`actionPlanned`→`actionPerformed` of a step, `actionPerformed`→the next `stepObserved`) is under `SETTLE_TIMEOUT_MS`. `settle.browser.test.ts`: lenient `settle` on that page returns in under 500 ms, naming the family and the animation |
| agent: the same with `params` still gives `font_failed`, unit test of the settle check | `settle.browser.test.ts`: strict `settle` on the failing font gives `font_failed` (the existing test, kept) and, on the page with the endless animation too, rejects `page_not_settled` at its deadline (see decision log). The existing run-level test "a page that never settles after a click still records where it landed, then ends the run" (`/spin`, with `params`) shows the strict path still ends a run on an endless animation |
| io: runner test of two tasks, target-app origin vs another | `runner.test.ts`: "a task on the target app's origin gets the parameters and the jargon list, any other origin neither", with a third task on the same host and another port, which gets neither |
| root lint, typecheck, test | `pnpm lint`, `pnpm typecheck`, `pnpm test` |

## Decision log

| Question | Taken | Why |
|---|---|---|
| How `runActor` takes "no jargon list" | `jargon?` optional, independent of `params` | The task makes `params` optional and `perceive` already reads a missing list as no K2. A union type tying the two together breaks `Omit<RunActorOptions, "browser">` in io's `RunFn`. One `targetApp?: { params, jargon }` would keep the guard but rename `params` at every caller. Every caller that hands `params` (runner, Scout, CLIs, tests) hands the list beside it |
| How a run tells the lenient `settle` from the strict | `params === undefined` in `runActor` | The task: whoever hands `params` decides. No second flag that could disagree with it |
| `settle`'s signature | options object `{ lenient, timeoutMs }`, returning `Skipped` | A positional boolean reads badly at the call; the return value lets the loop log, since `settle` has no logger |
| "Infinite" | `effect.getTiming().iterations === Infinity` | The task's wording, iteration count. A finite long animation is still waited on to the deadline |
| Where the skipped items are logged | the loop, `info`, only when a list is non-empty | "logged, and the step goes on"; no field in the record (Constraints) |
| Strict `settle` on the page with both the endless animation and the failing font | the box is proven by the failing font alone giving `font_failed`, and the combined page giving `page_not_settled` | Strict waits on animations before it checks fonts, so on the combined page it reaches the deadline first. Changing that order would change the strict path, which must stay line for line. The box allows "a unit test of the settle check", and its point, strict still fails a failed font, holds. Noted in the task's Outcome |
| Where the runner decides | once per `start`, on the set's one task | A set has one task, so every run of it is on the same site |
| Origin comparison | `new URL(a).origin === new URL(b).origin`, the configured one parsed once in `createRunner` | Port included; the reviewer note's `localhost:8080` case. A bad config fails at startup |
| `runnerDefaults`' origin | `http://localhost:5174` | The core task fixtures start there, so every existing runner test keeps its parameters unchanged |
| io browser tests on a free port | pass `targetAppOrigin: target.origin` | They serve the target app and expect its parameters; without it they would silently run lenient with no K2 |
| (build, branch review) `params` without `jargon` | `runActor` refuses it, `invalid_run_input`, before any event | Three lines bring back the guard the optional field dropped, without the union type. K2 is the Kai beat of the demo |
| (build, branch review) The fifth agent sub-item | reworded to what the two settle tests prove, the original kept in the task's Outcome | Its wording cannot hold on the strict path; the rewording waits for the task author's agreement in review |
| (build, PR review) The CLIs' target-app origin | `http://localhost:${TARGET_APP_PORT}`, as `server.ts` has it, not `app.origin` | Vite reports `127.0.0.1` under `--dns-result-order=ipv4first`, and the fixture tasks start on `localhost`: every set would run as another site |
| (build, PR review) Scroll-driven animations | lenient `settle` sets aside an animation whose timeline is not a `DocumentTimeline` | It runs until the page is scrolled to its end, so waiting cannot end it (ADR 0003 D4's reason). Its frame follows the scroll, which the run's actions set. The strict path is untouched |

## Risks

- The two io browser tests (`sweep`, `seed-demo`) are slow; a missed `targetAppOrigin` there would change their outcomes, not their compile. Both are named above.
- `getTiming().iterations` on a CSS animation in Chromium: expected `Infinity` for `infinite`. The lenient settle test proves it.
- A failing font on a page served by a Node server: the face must fail fast (a 404), not hang, or `document.fonts.ready` would reach the deadline in both modes. The test server answers 404 at once.

## Review note

Round 1 (spec-reviewer): ready after fixes, no blocking finding.

- should: `runs.browser.test.ts` also serves the app on a free port. Added to Files and Design.
- should: the timing check is now per gap from event timestamps, not the run's total.
- nits taken: the guard `jargon?` drops is said in the doc comment and the log names `targetApp?`; box 1's URL now one `new URL` would rewrite; box 5 cites the existing `/spin` run test; three test calls, not four; `animation.effect` checked for null; the skipped items logged once after `retryOnNavigation`; "line for line" restated as the concrete diff; the origin parsed once in `createRunner`; the lenient doc comment carries ADR 0003's consequence.
