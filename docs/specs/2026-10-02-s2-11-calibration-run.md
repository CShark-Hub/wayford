# s2-11 — Calibration run on the real model: spec

Task: `tasks/s2-11-calibration-run.md` · Branch: `feature/s2-11-calibration-run` · Date: 2026-10-02
Status: approved 2026-10-02

## Goal

One command, `pnpm --filter @wayford/agent calibrate`, runs the calibration set on the real model. It prints a table of who reached which goal, by which route, how the other runs ended, at what speed and cost, and the week 3 go/no-go.

## Constraints that bind

- **The set** (task): Ada on both goals; Vera and Kai on the hard goal; Vera with her contrast cut made hard (3.0, softness 0) on the hard goal. Seeds 1 to 5 by default, and every row runs the same seeds (`docs/PLAN.md` A20).
- **Go/no-go** (task; `docs/ROADMAP.md:99`):
  - Ada must reach each goal on at least 4 of 5 seeds, and the hard-cut Vera must succeed on 0 of 5.
  - The Vera and Kai rows are reported, not judged.
- **No new judgement.** Success is the task's own condition, and the route is a lookup.
- **Cost guard.** Before anything starts, estimate the set's cost from the configured prices, and stop if it exceeds `--max-usd`. `--max-usd 0.01` stops before any run.
- **The Jev gate.** `s2-06` fills its gate with this command on seeds 1 to 10 and adds `--backend jev` (`docs/adr/0001-jev-actor-backend.md:47-60`; `tasks/s2-06-jev-actor-backend.md:52`). So:
  - `--seeds` takes any range;
  - the output carries wall time;
  - the output names the backend, the model and the concurrency.
- **No test calls a real LLM** (`docs/CONVENTIONS.md`). No test imports the CLI file.
- **Out of scope:**
  - the Jev backend;
  - storing results in the database, a screen, the Analyst.
- **Imports.**
  - Agent may not import `@wayford/target-app` (`biome.json:113-130`).
  - Agent may import `@wayford/filter/serve-target-app` (`run-one.ts:29`).
- **Never touch B3 or a persona's `budgetSeconds`** (task, "Notes for the reviewer").
- **The key.** It is never printed. Settings are parsed the way `run-one.ts` does it (`run-one.ts:182-183`, `:230-233`).

## Design

### Routes: one shared copy

As shipped (decision 41): the copy below landed on `main` with s1-03 (#148), whose drift test is `routes.browser.test.ts`. This branch dropped its own copy in the rebase and changes no filter file.

**`packages/filter/src/serve-target-app.ts`** gains `TARGET_APP_ROUTES` and the type `TargetAppRoute`:
- `TargetAppRoute` is `{ id: "A" | "B" | "C"; steps: readonly { page: string; role: "link" | "button" | "menuitem"; name: string }[] }`.
- `TARGET_APP_ROUTES: readonly TargetAppRoute[]` is `ROUTES` from `target-app/src/pages.ts` written out, next to `TARGET_APP_PATHS`.
- s1-04 decided this (`tasks/s1-04-target-app-routes.md` Outcome; its spec, decision 23): one copy, made by the first task that needs it, shared by `s1-03` and `s2-11`.

**A drift test** in `packages/filter/src/target-app-routes.browser.test.ts`, "TARGET_APP_ROUTES equals target-app's ROUTES":
- It reads `pages.ts` as text, the way the `TARGET_APP_PATHS` test does.
- It slices from `export const ROUTES` to the closing `];`.
- It rebuilds each route's id and steps, then compares them with `toStrictEqual`.

### `packages/agent/src/calibration.ts`

Pure functions: no browser, no network, no top-level side effects. Its only import from filter is `import type { TargetAppRoute }`, so `vite` is never loaded.

```ts
export interface CalibrationRow {
  label: string;     // "Ada, easy", "Ada, hard", "Vera, hard", "Kai, hard", "Vera hard-cut, hard"
  profile: Profile;  // the hard-cut row's profile is Vera with contrast {threshold: 3, softness: 0, provenance as Vera's}
  task: Task;
  judged?: "reach" | "never"; // Ada's rows must reach the goal; the hard-cut Vera must never reach it
}
export function calibrationSet(): CalibrationRow[];  // from core's fixtures, in the task's order

/** A run of the set: what runActor returned, plus the model's time per step, measured live. */
export interface CalibrationRun { seed: Seed; result: RunResult; latencyMs: number[] }

type RouteId = TargetAppRoute["id"];
/** The route of a successful hard-goal run: the last step's `urlBefore` pathname against the last page of each route. */
// As shipped (decision 38): routeOf(result), with TARGET_APP_ROUTES imported as a value.
export function routeOf(result: RunResult, routes: readonly TargetAppRoute[]): RouteId | "?" | undefined;
// undefined: not a success, or the easy goal. "?": a page no route ends on.

export type End = "success" | "gave_up" | "step_cap" | "clock" | "error";
export function endOf(result: RunResult, maxSteps: number): End;
// For budget_exceeded: the step cap is steps.length === maxSteps with a last step that is not
// incomplete; anything else is the clock (s2-10).

export interface RowSummary {
  // As shipped (decision 36): no notRun here; it is a count on the report. A `judged` field is added.
  label: string; runs: number; notRun: number; successes: number;
  routes: Partial<Record<RouteId | "?", number>>;
  ends: Record<Exclude<End, "success">, number>;
  medianSteps: number; medianLatencyMs: number; medianPromptTokens: number;
  medianWallMs: number; costUsd: number;
  verdict?: "pass" | "fail"; // judged rows only
}
// As shipped (decisions 36, 38): summarise(row, runs, maxSteps).
export function summarise(row: CalibrationRow, runs: CalibrationRun[], seeds: number, maxSteps: number, routes: readonly TargetAppRoute[]): RowSummary;

// Superseded in part by decisions 24 and 25: a crash fails a "never" row, and any failed row is
// "no-go" before "incomplete" is considered.
// As shipped (decision 36): goNoGo(rows, notRun): "incomplete" when any run did not start, and
// then no row is judged; otherwise "no-go" if any row failed, else "go".
export function goNoGo(rows: RowSummary[]): "go" | "no-go" | "incomplete";
// "incomplete" when any row has notRun > 0. Otherwise:
//   reach: successes >= ceil(0.8 × runs), where an errored run counts as a miss;
//   never: successes === 0.
// That is 4/5 by default and 8/10 on the Jev gate's ten seeds (ADR line 57).

export function estimateUsd(price: ModelPrice, runs: number, maxSteps: number): number;
// runs × maxSteps × (8000 tokens in + 2000 out) at the price. An estimate, not a bound.
// Superseded by decision 26: 2000 in, 500 out.

export function projectSeedDemo(meanRunUsd: number): number; // × 60 runs (F11: 3 personas × 2 tasks × 10)
// Superseded by decision 29: inlined in calibrate().
export function renderTable(summaries: RowSummary[], header: ReportHeader): string; // fixed-width text
```

- **Medians.**
  - Steps: over all runs of the row.
  - Latency: per step, over all steps of all runs.
  - Prompt size: `step.cost.tokensIn` per step. It includes a retry or repair, so the header says "tokens in per step".
  - Wall time: `result.durationMs` per run.
  - An empty input gives 0.
- **Cost:** the sum of `result.cost.usd`.

### `packages/agent/src/calibration-run.ts`

The orchestration, with no top-level side effects, so tests import it safely:

```ts
export interface CalibrateOptions {
  rows: CalibrationRow[];          // calibrationSet() from the CLI; a test may pass its own
  seeds: Seed[];
  maxUsd: number;
  maxSteps?: number;               // removed (decision 37): DEFAULT_MAX_STEPS is used directly
  backend: ActorBackendFactory;    // the CLI passes llmActor({ settings })
  backendId: "llm";                // superseded by decision 28: a constant in the report header
  price: ModelPrice;               // priceOf(loadModelPrices(), settings.roles.actor.model)
  browser: Browser;
  origin: string;                  // the served app; each task's startUrl is rebased onto it
  runsDir: string;
  logger: Logger;
  concurrency?: number;            // 5 (F6 AC1)
}
export async function calibrate(options: CalibrateOptions): Promise<CalibrationReport>;
```

**Before anything starts.**
- Compute the estimate. If it exceeds `maxUsd`, throw `WayfordError("calibration_over_budget", …)`, which says the estimate and the limit. That happens before any run, and before the backend factory is called.
- In the CLI it also happens before the app is served or a browser is launched.

**Runs.**
- Every row × seed, on one browser, at most `concurrency` at a time, through `runActor`:
  - `params: TARGET_APP_DEFAULTS`;
  - `task.startUrl` rebased onto `origin`.
- **Latency.** The backend factory is wrapped: each `answer()` is timed with `performance.now()`, and a step's time is the sum of its answers. A step closes on `actionPlanned` or `stepWasted`, read through `onEvent`.
- **A run that rejects** (the factory throws, or `result.json` cannot be written) does not stop the others. It is recorded as an `error` run with what is known: seed, error message, no result. In the summary it counts as an `error` end, and for a judged "reach" row as a miss.
- **The running check is the real cost guard.** The estimate is only a first stop. Once the spend so far reaches `maxUsd`, no new run starts. Runs not started count as `notRun` on the report, and the go/no-go is then "incomplete", with no row judged (decision 36, which supersedes 25). The CLI exits 1 when runs did not start.

**Output.**
- The table goes to stdout. Under it:
  - the go/no-go, and which judged row failed;
  - the measured mean cost per run;
  - the projected cost of `seed:demo`, as 60 runs, with the sweeps named as extra.
- The report goes to `runs/calibration/<timestamp>.json` in every case, including errors and an incomplete set. It holds:
  - the backend id, model, effort, concurrency, seeds, `maxSteps`;
  - each row's label, profile id, the profile itself (so the hard-cut variant is on record), task id;
  - each run's id, seed, outcome, end, route, steps, wall time, latencies, cost, or the error for a rejected run;
  - each row's summary, the go/no-go, the estimate and the projection.
- Each run also writes `runs/<run id>/` as `run:one` does.

### `packages/agent/src/calibrate.ts`

The CLI, a thin wrapper in the shape of `run-one.ts`, and imported by no test.

**Setup**, in this order:
- load the root `.env`;
- `parseLlmSettings`;
- if `LLM_ACTOR_BACKEND` is `jev`, refuse with a usage error until s2-06;
- `priceOf` on the Actor model;
- the estimate check;
- serve the app on 5174, launch Chromium, call `calibrate()`;
- print the table, write the report.

**Exit codes.**
- 0 when the set finished with no `error` run, whatever the go/no-go: a no-go is a measurement.
- 1 on a setup failure, an over-budget estimate, an incomplete set, or any `error` run. The table and the report are written first.
- 2 on a usage error.

**Package.**
- `packages/agent/package.json` gets `"calibrate": "tsx src/calibrate.ts"`.
- Flags: `--seeds <a-b | a,b,c>` (default `1-5`), `--max-usd <n>` (default 2), `--max-steps <n>` (default 20). Superseded by decision 27: `--seeds <a-b | n>` and `--max-usd <n>` only.

## Files

| File | Why |
|---|---|
| `packages/agent/src/calibration.ts` (new) | the set, route lookup, ends, medians, go/no-go, estimate, projection, table |
| `packages/agent/src/calibration.test.ts` (new) | unit tests on hand-built `RunResult`s: box 1's lookup, end counts and medians; box 4's estimate |
| `packages/agent/src/calibration-run.ts` (new) | `calibrate()`: runs, latency, guards, report |
| `packages/agent/src/calibration-run.browser.test.ts` (new) | `calibrate()` with a fake adapter on the served app (box 1); `maxUsd 0.01` starts no run (box 4) |
| `packages/agent/src/calibrate.ts` (new) | the CLI |
| `packages/agent/package.json` | the `calibrate` script |
| `packages/filter/src/serve-target-app.ts` | **outside the task's list:** `TARGET_APP_ROUTES` and `TargetAppRoute`, the shared copy that s1-04 decided on. Dropped in the rebase: `main` has it from #148 (decision 41). |
| `packages/filter/src/target-app-routes.browser.test.ts` | **outside the task's list:** the drift test. Dropped in the rebase: `main` has it in `routes.browser.test.ts` (decision 41). |
| `tasks/s2-11-calibration-run.md` | boxes and outcome |

## Acceptance mapping

| Acceptance box | Proven by |
|---|---|
| agent tests pass, with a fake adapter giving a fixed table: route lookup, end counts, medians | `calibration.test.ts`: "routeOf reads the route off the last page", "endOf tells the step cap from the clock", "summarise gives the medians and end counts", "goNoGo scales to the seed count". Also `calibration-run.browser.test.ts` "a fake adapter gives a fixed table": all five rows on seeds 1 and 2, see below. |
| real key: `calibrate` prints the table; the PR shows it with the go/no-go, says why if Ada or the hard-cut Vera misses, and the board says so | Run in phase 7 with the user's key, asked first because it is billed. The output goes in the PR. On a no-go, the board row for s2-11 carries a note before anything is built on the loop, again asked first because it pushes to `main`. |
| needs s1-03 and s2-10: the table rerun with Kai's row | not in this PR (depends on unmerged tasks); named in the PR as a follow-up |
| `--max-usd 0.01` stops before any run starts | `calibration.test.ts` "the estimate for the default set exceeds 0.01 USD on Luna"; `calibration-run.browser.test.ts` "maxUsd 0.01 starts no run" (the factory is never called, and no run directory is written); plus the CLI run by hand on Luna |
| lint, typecheck, test at the root | `pnpm lint && pnpm typecheck && pnpm test` |

**The fake-adapter test.**
- Each run gets a fresh `fakeLlm` through the per-run factory, wired as `actor-loop.browser.test.ts:195-204` does, with `billed()`'s fixed cost.
- Each answer is picked from the page shown:
  - on `/`, click "Your account" for the hard goal, or "Your account" then "Delivery address" for the easy goal;
  - on `/account`, the hard goal clicks "More options" if shown, then "Past orders";
  - when the element it needs is not shown, `giveUp`.
- So Ada and Kai reach the archive by route B. Both Vera rows give up, since P4 hides the kebab from them. As shipped (decision 42): since s1-03, K1 and K4 rename Kai's kebab to its bare role, so Kai gives up too.
- The test pins successes, routes, ends, steps, tokens and cost per row, and the go/no-go: "go". It checks the time columns only as non-negative numbers.

## Decision log

| # | Question | Taken | Why |
|---|---|---|---|
| 1 | Where the route copy lives | `TARGET_APP_ROUTES` and `TargetAppRoute` in `filter/src/serve-target-app.ts`, with a drift test | s1-04 decided one shared copy, made by the first task that needs it. Agent already imports that module. `calibration.ts` imports the type only. |
| 2 | Go/no-go at other seed counts | reach: at least ceil(0.8 × seeds), an errored run counting as a miss; never: 0; "incomplete" if any run did not start | It gives 4/5 for the task and 8/10 for the Jev gate. Superseded in part by 24 and 25. |
| 3 | Wall time | a median wall-time column | The Jev gate's Ada row needs it (ADR line 54). |
| 4 | Ends | `gave_up`, step cap, clock, error | The task lists three ends; a crash is a fourth (`RUN_OUTCOMES`). The step cap is `steps.length === maxSteps` with a complete or wasted last step; the clock column stays 0 until s2-10. |
| 5 | Model latency | time the backend's `answer()` calls through a wrapped factory | No stored field holds it, and `endedAt - startedAt` includes acting and settling. |
| 6 | Hard-cut Vera's id | keeps `prof_vera`; the report carries the row's profile | `RunResult` has no profile snapshot (#64). A new id would be an unknown profile wherever a run is looked up by id. |
| 7 | Estimate | runs × max steps × (8,000 in, 2,000 out) at the configured price, called an estimate | From the ladder figure (s2-01 spec, line 244). On Luna the default set comes to about 0.90 USD. It is not a bound: retries, repairs, long reasoning and a regional host can exceed it. On a free model it is 0. Superseded in part by 26. |
| 8 | Overspend while running | no new run starts once the spend reaches `--max-usd`; this is the real guard | The estimate can be wrong. |
| 9 | Concurrency | 5 at a time on one browser, recorded in the report | F6 AC1 caps at 5. Wall time and latency depend on it, and the Jev gate compares them. |
| 10 | `seed:demo` projection | mean cost per run × 60, with the sweeps named as extra | F11 fixes 3 × 2 × 10. No doc fixes the sweep sizes. |
| 11 | Vera's bound from `docs/ROADMAP.md:93` (successes never exceed the seeds where the link reached her) | not computed here | The task says Vera's row is reported, not judged. The count is the filter's (`s1-03`'s `routes` command). |
| 12 | Exit code | 0 on a finished set with no error run, go or no-go; 1 on an error run, an incomplete set or a setup failure, after the output is written | A no-go is a measurement; a crash is not. |
| 13 | Port | 5174, as `run:one` uses | Core's fixtures name it, so recorded URLs read the same origin. |
| 14 | Real-key run | in phase 7, after asking | It is billed, and the user holds the key. |
| 15 | Where `calibrate()` lives | `calibration-run.ts`, with no top-level code; `calibrate.ts` is the CLI alone | `run-one.ts` runs its CLI at import time, so a test importing a file like it would load `.env` and start billed runs (spec review). |
| 16 | `LLM_ACTOR_BACKEND=jev` | refused with a usage error until s2-06 | It must not quietly run the LLM while the report says otherwise. |
| 17 | A run with no result (build) | `CalibrationRun` carries `result?` and `error?` | That is how a rejected run is recorded with "no result", as decision 2 needs. |
| 18 | Verdict with seeds not run (build) | judged against the seeds the row was meant to run, and "pending" while unrun seeds could still change it | Judged against the runs started, a row cut short by the spend could read "pass" (step check). |
| 19 | `actor` on `CalibrateOptions` (build) | `actor: Pick<RoleSettings, "model" \| "effort">`, passed by the CLI | The report needs the model and effort before any backend exists. The key never reaches it. |
| 20 | Run order (build) | seed by seed, every row on a seed before the next | A set stopped by the spend still has every row on its first seeds. |
| 21 | One estimate check (build) | `checkEstimate()` in `calibration-run.ts`, called by `calibrate()` and by the CLI before it serves anything | One message, one rule. Singular "step" when the cap is 1. |
| 22 | `--seeds` limits (build) | at most 100 seeds, distinct, ascending range; `--max-usd` plain decimals; `--max-steps` digits | Guards typos such as `0-4294967295`; the Jev gate needs 10. |
| 23 | Route lookup scope (build) | only `task_past-order` has routes; the easy goal shows none | Otherwise the easy goal's last page, `/account`, would read as route B. |
| 24 | A crashed run on a "never" row (build, branch review) | any error end makes it "fail" | A crash measures nothing; a hard cut that only crashed must not read "go" (decision 12). |
| 25 | A failed row with seeds not run (build, branch review) | `goNoGo` is "no-go" as soon as any row failed, "incomplete" only when none did | A definite failure is known before the set ends, and the verdict line names it. |
| 26 | Estimate figures (build, after the real run) | 2,000 tokens in and 500 out per step, replacing 8,000 and 2,000 (decision 7) | The run measured about 1,000 in and 100 out, so the old figures were 24 times too high and the Jev gate's 10 seeds would have estimated 1.80 of the 2 USD limit. The default set now estimates 0.225 USD and `--max-usd 0.01` still stops it. |
| 27 | Flags (build, branch review) | `--seeds a-b` or one seed, and `--max-usd`; no `--max-steps`, no comma list | The task's interface is `calibrate [--seeds 1-5] [--max-usd 2]`; `calibrate()` keeps its `maxSteps` option for tests. |
| 28 | Backend id (build, branch review) | a constant "llm" in the report header, not an option | It has one value until s2-06 adds `jev`. |
| 29 | `seed:demo` projection (build, branch review) | inlined as mean × 60 where `calibrate()` reports it | One multiplication with its F11 comment. |
| 30 | Latency and concurrency tests (build, branch review) | the fake waits 20 ms per answer; the test checks every step's model time is at least 20 ms and that 2 to 5 runs were in flight at once | Zeroing the timing or forcing one worker left every test green. |
| 31 | Input checks in `calibrate()` (branch review cut list) | kept | It is an exported function; a bad `concurrency` would otherwise start nothing silently. Superseded by 32. |
| 32 | Input checks in `calibrate()` (PR #145 review) | removed | The CLI is the only caller: it always passes the default `maxSteps` and never sets `concurrency`, since the flags were dropped (decision 27). If they come back, the CLI's argument parsing is where they are checked. |
| 33 | `profileId` on report rows (PR #145 review) | removed | It repeated `profile.id`, which the row carries whole. |
| 34 | Model-time test (PR #145 review) | each run's measured model time must add up to what the fake's answers took, within a few ms per answer | A lower bound alone stayed green when step times added up across the run. |
| 35 | A run billed and then rejected (PR #145 review) | its cost, taken from the terminal event, counts in the spend, the row and the report | Otherwise the running guard (decision 8) never sees it. |
| 36 | A set cut short (PR #145 review) | "incomplete", and its rows are not judged; no per-row "pending", no "not run" column. Supersedes 18 and 25. | The running guard triggers only far past the estimate; one rule is enough. |
| 37 | `calibrate()`'s `maxSteps` option (PR #145 review) | removed; `DEFAULT_MAX_STEPS` is used directly. Supersedes the "kept for tests" part of 27. | No caller passed it. |
| 38 | The `routes` parameter (PR #145 review) | removed; `calibration.ts` imports `TARGET_APP_ROUTES` as a value. Supersedes the type-only part of 1. | Every caller passed the same constant, and every importer of `calibration.ts` loads `serve-target-app` anyway. |
| 39 | Comma-separated seed list in the header (PR #145 review) | removed | The CLI only produces `a-b` or one seed. |
| 40 | The GO's base (PR #145 review) | rebased onto `main` with #147 and rerun on the real model | #147 changed what the Actor is shown; the week 3 go/no-go should be measured on it. |
| 41 | The shared route copy after the rebase (build) | `main`'s copy from s1-03 (#148); this branch's own copy and drift test dropped | Both copies matched; keeping two would undo s1-04's "one copy". The branch no longer changes `packages/filter`. |
| 42 | Kai in the fake-adapter test after s1-03 (build) | Kai gives up on `/account`, as both Veras do | K1 and K4 rename the kebab to its bare role, and the fake clicks by name. The test pins what the filter now decides. |

## Risks

- **Real-model failure.** If Ada misses on Luna at effort `high`, the week 3 go/no-go fails. The task says to report it and to say so on the board before anything is built on the loop.
- **Many runs on the clock** (once s2-10 lands). The task says that points at model latency, not at the persona: lower the Actor's reasoning effort in config first, and say which in the PR. Raising `budgetSeconds` is a RULES change.
- **The drift test parses `pages.ts` by regex.** It depends on each step staying on one line, as `TARGET_APP_PATHS`'s test does.

## Review note

Spec review, round 1: ready after fixes, one blocking finding. Every finding was taken.

- (blocking) `calibrate()` moved to `calibration-run.ts`, a file with no top-level code. `calibrate.ts` is the CLI alone and no test imports it (decision 15).
- (should) `goNoGo` returns "incomplete" too, and the exit codes cover it.
- (should) The fake-adapter test pins everything but the time columns, which it checks only as non-negative numbers.
- (should) The test uses a fresh `fakeLlm` per run, with answers picked from the page shown, and runs all five rows on two seeds.
- (should) A run that rejects is recorded as an `error` and does not stop the others. An errored Ada run counts as a miss, and the output is written before exit 1.
- (should) The estimate is called an estimate; the running check is the real guard; the manual box 4 check runs on Luna.
- (nit) `endOf` counts the step cap only with a complete or wasted last step.
- (nit) `TargetAppRoute` is exported and imported as a type, so `calibration.ts` never loads `vite`.
- (nit) Concurrency and the backend are recorded, and `jev` is refused until s2-06.
- (nit) The Risks bullet now follows the task's note about the clock. The ADR line is corrected to 54. Box 2's board note is mapped. The hard-cut contrast keeps `provenance`.
