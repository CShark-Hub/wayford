# s4-04 — Analyst and the report API

Stream: s4
Milestone: week 4
Size: L
Depends on: s1-06

## Context

Read first, in this order:

- `AGENTS.md` sections "Separated LLM roles", "Every verdict clickable through to evidence", "Provenance on every threshold", "Scout is mandatory"
- `docs/PLAN.md` F8, all six criteria, and A9
- `packages/core/src/finding.ts` and `fixtures/findings.json` — the `Finding` contract
- `packages/core/src/run.ts` — `RunResult`, steps, the evidence observation with each element's decisions, and the optional `sweep` that marks a sweep run
- `packages/core/src/ground-truth.ts` and `runs/ground-truth/<task id>.json` — Scout's output
- `packages/agent/src/llm.ts` and `llm-settings.ts` — `complete` and the `analyst` role
- `packages/io/src/db/` — the table pattern: the whole document as JSON, real columns only for what a query filters on

## Goal

`POST /reports/:taskId` reads one run set's worth of stored runs of a task, across all personas, and stores a `Report`: per persona, how often the filter left a route open and how often the persona got through, and the findings, each with its evidence. `GET /reports/:taskId` returns the latest.

## Interface

- In: `backend`, `jev` by default, as `seed:demo` runs; per persona and seed, the latest stored run on that backend that is not a sweep run; the bundled profiles, `routeOpenSeeds` from `s1-06`, the task's ground truth when its file exists
- Out:
  - `Report` in `@wayford/core` with a fixture:
    - the task id, the backend it read, when it was analysed, run count and total cost;
    - Scout's line: reached or not, in how many steps, or "no ground truth";
    - per persona: runs, successes, route-open seeds (or `null` without a route table), median time to success (or `null`);
    - `Finding[]`.
  - a `reports` table; `POST /reports/:taskId` and `GET /reports/:taskId` in io
  - `pnpm --filter @wayford/io analyse -- --task <id>` printing the report as text
- Files expected to change: new `packages/core/src/report.ts`, its test and fixture, `packages/core/src/index.ts`, `packages/io/src/analyst*.ts`, `packages/io/src/routes/reports.ts`, `packages/io/src/db/`, a new migration, `packages/io/src/analyst-prompt.md`

## Constraints

- **Code decides what is true; the model only words it.**
  - The numbers and the `deterministic` findings are built in code. For each persona and each route the filter closed, there is one finding: where it closed, the rules, the measured value against the threshold. Its evidence is the steps where a run of that persona stood on that page with the element cut or renamed.
  - The Analyst writes one recommendation per code-built finding, and up to five `hypothesis` findings read from the runs' narration and actions.
- **Every finding cites a stored step**, and evidence is checked in code. A finding whose evidence names a run or step that does not exist is dropped and logged (F8 AC2).
- **Provenance comes from the profiles.** Each basis entry's provenance is copied in code from the named profile's threshold. The model names rule ids only (F8 AC5).
- **The Analyst sees all runs of all personas for the task at once**, in one call on the `analyst` role (F8 AC4). The digest it reads is built in code: per run, the persona, the outcome and each step's page, action and narration. A Jev run has no narration, and the digest says so.
- **Scout is context, not a verdict.** When Scout reached the goal, the report says the feature works. When it did not, the report says so first, and every persona finding is read against it.
- **The model writes into fields, never prose for the page** (A9). Structured output, validated with the core schemas.
- **One run per persona and seed, one backend** (A22: a run set uses one backend). The live race and rehearsals rerun the same seeds on the LLM; without this rule they would double-count seeds and mix backends.
- **A run left out of the report is said in the report:** older runs of a seed, runs on the other backend, and sweep runs, each as a count.
- **A closed route with no run on its page is no finding.** A route-closure finding needs a step where a run of that persona stood on the page where the route closed. When no run reached that page, as when Vera never opens `/account`, the closure has no evidence and is not a finding (F8 AC2). The route-open number already counts it, and the report lists such closures by name beside its left-out counts.

## Acceptance

- [x] `pnpm --filter @wayford/core test` passes; the `Report` fixture parses and holds one finding of each type
  - Evidence: 16 files, 387 tests passed. `report.test.ts`, "the hard-goal fixture holds one finding of each type, and a soft one".
- [x] `pnpm --filter @wayford/io test` passes with a fake Analyst and stored fake runs of Ada, Kai and Vera on the hard goal:
  - the per-persona numbers equal what the stored runs and `routeOpenSeeds` give;
  - Vera gets a `deterministic` finding on "Order archive" with basis P1 and provenance `wcag22`, and evidence on her steps at `/deliveries`;
  - a hypothesis citing a step that does not exist is dropped;
  - sweep runs, an older run of the same seed and runs on the other backend are left out and counted;
  - a route closed on a page no run reached gives no finding and is listed as such;
  - with no ground-truth file, the report says "no ground truth".
  - Evidence: 24 files, 232 tests passed, 3 skipped (the existing `shutdown.browser.test.ts` signal tests). The box's six cases:
    - `analyst.browser.test.ts`, on one real desktop walk of the target app, with Ada, Kai and Vera on seeds 1 to 4. Each stored run's observations are `perceive` over the walked measurements. It holds:
      - "the numbers are the stored runs' and routeOpenSeeds'";
      - "Vera's closure of route A is a P1 finding with wcag22 and her /deliveries steps";
      - "Vera's routes B and C close where no run of hers stood: listed, no finding";
      - "the sweep run, the older run and the run on the LLM are left out and counted".
    - `analyst.test.ts`:
      - "a hypothesis citing a missing step, an unknown run or a left-out run is dropped and logged";
      - "with no ground-truth file the report says noGroundTruth".
    - `analyst-text.test.ts`, which prints it: "no file: no ground truth".
- [x] With a real key, `analyse -- --task task_past-order` over 10 seeds of Ada, Kai and Vera prints the report; the output and its cost are in the PR
  - Evidence: 30 runs on Jev through `POST /runs` (Ada, Kai and Vera, seeds 1 to 10), then `pnpm --filter @wayford/io analyse -- --task task_past-order`, exit 0 in 119 s.
  - Cost: 0.016821 USD for the runs and 0.006647 USD for the Analyst (`openai/gpt-6-luna`, effort `max`).
  - Numbers:
    - Ada: route open 10/10, got through 10/10.
    - Kai: route open 10/10, got through 0/10.
    - Vera: route open 4/10, got through 4/10.
  - Findings: three deterministic (Kai's A1 on "Order archive", soft; Vera's P1 on it, `wcag22`; Vera's P4 on "More options", soft) and one hypothesis.
  - Scout ground truth, run first: 0.002169 USD for both goals.
  - The easy goal was also run: 6 runs, no deterministic finding, "—" for route open.
  - The full output is in the PR.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root
  - Evidence, after merging main (s3-07): lint clean (299 files); typecheck clean; 112 files passed and 1 skipped, 1702 tests passed and 3 skipped.

## Outcome

Shipped as the spec says (`docs/specs/2026-10-05-s4-04-analyst.md`). Where it differs from this file:

- **The axe box moved to `s4-06`** at gate 1 (2026-10-05). This file no longer holds it; s4-06's task file does, waiting for s4-04.
- **Files outside the expected list:**
  - `packages/filter/src/route-table.ts` and `routes.ts` gain `routeClosings` and `hasRouteTable`: where each route closed and on what, by the same closing rule as `routeOpenSeeds`.
  - io's `analyst-routes.ts` holds the walk, out of the barrel, so io's barrel loads no Playwright.
  - io's `analyse.ts` is the CLI.
  - io's `app.ts`, `server.ts` and `test-app.ts` do the wiring.
- **The `Report` holds more than the Interface lists:**
  - per persona, one row per seed (run id, outcome, open routes) and an `errors` count;
  - the closures with no evidence, by name;
  - the Analyst's model id;
  - the cost split into runs and Analyst.
- **"Cut or renamed" reads as cut.** A route closes only at a cut step, so a renamed element still shown never closes one.
- **Evidence is every step that shows the cut.** The printed report groups each run's steps into ranges.
- **Provenance for a rule with no threshold in the profile:** A1, A3, K1, K2, K4 and V2 give `folk`, and only where the profile sets that rule's input.
- **Scout's ground truth for the real-key run** was written by `pnpm --filter @wayford/agent scout` into the worktree's `runs/ground-truth/`, which is not committed.

## Out of scope

- The report screen (`s3-08`).
- Findings across tasks, and history of past reports. The latest report per task is enough.
- Using Jev's confidence. If it ever reaches the report, it is a `hypothesis` (ADR 0001).
- `measurement` findings from axe. `s4-06` adds them to this report once its results are stored (moved there on 2026-10-05, since s4-06 was not built yet).

## Notes for the reviewer

- Read the prompt. It names no persona trait, and asks only for recommendations and hypotheses.
- Look for any path where a model-written provenance or evidence reaches the stored report unchecked.
