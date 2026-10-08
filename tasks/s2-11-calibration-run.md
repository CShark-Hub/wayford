# s2-11 — Calibration run: does the engine work on the real model

Stream: s2
Milestone: week 3
Size: S
Depends on: s2-03, s1-04. The Kai row means something once `s1-03` and `s2-10` are merged.

## Context

Read first, in this order:

- `docs/RULES.md` section "Calibration" — what each row expects, and why it is not a claim about people
- `docs/PLAN.md` F5 and assumption A13 (one key, a 50 USD cap)
- `packages/agent/src/` after s2-03 — `runActor` and `run:one`
- `packages/target-app/src/pages.ts` after s1-04 — `ROUTES`
- `packages/agent/models.yaml` and `packages/agent/src/llm-settings.ts` — model prices and the Actor's settings

## Goal

One command runs the calibration set on the real model and prints a table that says whether the engine works: who reached which goal, by which route, at what cost and speed. It is week 3's go/no-go, and the table the Jev gate fills (`docs/adr/0001-jev-actor-backend.md`).

## Interface

- In: the persona and task fixtures, a seed range
- Out: `pnpm --filter @wayford/agent calibrate [--seeds 1-5] [--max-usd 2]`, a table on stdout and the same data in `runs/calibration/<timestamp>.json`; every run is written under `runs/` as `run:one` writes it
- Files expected to change: `packages/agent/src/**`, `packages/agent/package.json`

## Constraints

- The set: Ada on both goals; Vera and Kai on the hard goal; Vera with her contrast cut made hard (3.0, softness 0) on the hard goal. Run seeds 1 to 5 by default.
- Per row:
  - successes out of runs, and the route of each success, read from the page the run was on just before the success URL through `ROUTES`;
  - how the other runs ended: `gave_up`, the step cap, or the clock;
  - median steps, median model latency per step, median prompt size in tokens;
  - total cost.
- Under the table, the projected cost of `seed:demo` (F11) from the measured mean cost per run.
- Before it starts, the command estimates the set's cost from the configured prices and stops if it exceeds `--max-usd`.
- No new judgement: success is the task's own condition, and the route is a lookup.
- The go/no-go, also a week 3 exit criterion: Ada at least 4/5 on both goals, and the hard-cut Vera at 0/5. The Vera and Kai rows are reported, not judged: they are the hypothesis the product tests.

## Acceptance

- [x] `pnpm --filter @wayford/agent test` passes, with a fake adapter giving a fixed table: the route lookup, the end counts and the medians 16 files, 306 tests.
  - `calibration.test.ts` (25 tests) uses hand-built results. It covers the route lookup, the step cap against the clock, the medians and end counts, and the go/no-go at 5 and 10 seeds, including an incomplete set and a crash on the hard-cut row.
  - `calibration-run.browser.test.ts` (5 tests). "a fake adapter gives a fixed table" runs all five rows on seeds 1 and 2 on the served app, each run with a fresh `fakeLlm` that answers from the page it is shown. It pins successes, routes, ends, steps, tokens, cost and "go", every column but the time ones. For time, it checks that each step's model time is at least the fake's 20 ms, that each run's model time adds up to the fake's own answer times, and that 2 to 5 runs were in flight at once. Since s1-03, Kai gives up on `/account`: K1 and K4 rename the kebab. The other tests cover:
    - the spend stopping new runs, leaving the set incomplete and unjudged;
    - a run billed before it rejects being counted in the spend;
    - a rejected run being an error while the others finish;
    - `--max-usd 0.01` starting nothing.
- [x] With a real key, `calibrate` prints the table, and the PR shows it with the go/no-go result. If Ada or the hard-cut Vera misses, the PR says which run and why, and the board says so before anything is built on the loop Run on 2026-10-03 at commit `8ebd16b`, the code this PR ships, rebased on `main` with #147 (text blocks named by their own text) and #148 (s1-03: K1, K4, A1). Luna at effort `high`, seeds 1 to 5, concurrency 5. Result: **go**.
  - Ada reached the easy goal 5/5 and the hard goal 5/5, all by route A.
  - The hard-cut Vera reached it 0/5: every run hit the step cap.
  - Reported rows:
    - Vera 1/5 (route A), four runs on the step cap.
    - **Kai 0/5, every run on the step cap.** The filter accounts for it:
      - On `/deliveries`, A1 (Kai's cap of 10) cut "Order archive" on every visit (57 of 57), as the RULES route table allows for route A.
      - On `/account`, the kebab was shown, renamed "button" by K1 and K4 (37 times), and the model never clicked it.
      - Kai never opened Settings, so route C was never tried. The runs bounced between `/deliveries` and `/account`, scrolling.

      This is the hypothesis the row exists to report, not a broken engine. The row is to be rerun with s2-10's memory and clock (box 3).
  - The set cost 0.0483 USD, 0.0019 per run, so `seed:demo` comes to about 0.12 USD. Model time was about 2.6 to 3.4 s per step.
  - Two earlier runs, before the rebase onto #147 and #148, also gave **go**: 0.0375 USD on 2026-10-02, and 0.0374 USD at `75f8a13`. Kai matched Ada in both (5/5), since the filter had no K1, K4 or A1 yet.
  - The output as printed, also in the PR. Only the report path is shortened; the JSON report lives under the gitignored `runs/calibration/`.

    ```
    backend      llm
    model        openai/gpt-6-luna
    effort       high
    concurrency  5
    seeds        1-5
    max steps    20
    Steps, model time, tokens in and wall time are medians; tokens in per step include a retry or repair,
    and model time per step includes the adapter's retries and their backoff.

    row                  reached  routes  gave up  step cap  clock  error  steps  model ms/step  tokens in/step  wall s  cost USD   verdict
    Ada, easy                5/5       -        0         0      0      0      2           2552             869     5.5    0.0012      pass
    Ada, hard                5/5     A:5        0         0      0      0      3           3186             865    10.4    0.0018      pass
    Vera, hard               1/5     A:1        0         4      0      0     20           3321             990   111.7    0.0131  reported
    Kai, hard                0/5       -        0         5      0      0     20           3414             965   257.9    0.0158  reported
    Vera hard-cut, hard      0/5       -        0         5      0      0     20           3336             996   158.2    0.0164      pass

    go/no-go   go
    spent      0.0483 USD (estimated 0.2250 USD, limit 2.0000 USD)
    per run    0.0019 USD mean, over 25 runs with a result
    seed:demo  about 0.1160 USD for its 60 runs (3 personas × 2 tasks × 10 seeds); the sweeps are extra
    report     runs/calibration/2026-10-03T11-14-19.610Z.json
    ```
- [x] Needs s1-03 and s2-10. The table rerun with Kai's row, in a comment on the PR or in the s1-03 PR Rerun on 2026-10-08 at `main` `b77a10e`, with s2-10 (#154) and s1-03 (#148) in, posted on PR #145 ([comment](https://github.com/CShark-Hub/promptozaury/pull/145#issuecomment-6068958860)). The set is still **go** at 0.0416 USD. Kai, hard is still 0/5, every run on the step cap: A1 cut "Order archive" on `/deliveries` on every visit, the kebab on `/account` was shown renamed by K1 and K4 and never clicked, and Settings was never opened, so every run bounced between `/deliveries` and `/account` until the cap. s2-10's memory and clock did not change his path.
- [x] `--max-usd 0.01` stops before any run starts `calibration-run.browser.test.ts` "maxUsd 0.01 starts no run": the factory is never called and `runsDir` stays empty. By hand on Luna, `calibrate -- --max-usd 0.01` printed `calibration_over_budget: the estimate for 25 runs of at most 20 steps is 0.9000 USD, over the limit of 0.0100 USD` and exit 1, with no app served and no browser launched. After the branch review lowered the per-step figures, the same command prints `0.2250 USD` and still stops.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root 79 files, 1270 tests, rebased on `main` at `5bea085` (#147 and s1-03 merged).

## Outcome

Built as `docs/specs/2026-10-02-s2-11-calibration-run.md` says. Its decision log has every choice, the ones taken during the build marked "(build)". What a reader of this file should know:

- **Kai's box was closed after merge.** It needed `s1-03` and `s2-10`. s1-03 had landed by the merge: K1, K4 and A1 shaped what Kai was shown, and the run in box 2 had Kai at 0/5 (A1 cut route A, and the renamed kebab went unclicked). The rerun waited on s2-10's memory and clock. It was run on 2026-10-08, once s2-10 had merged, and Kai stayed at 0/5 for the same reasons (box 3).
- **The modules.**
  - `calibration.ts` holds the pure parts: the set, the route lookup, ends, medians, go/no-go, the estimate and the table.
  - `calibration-run.ts` is `calibrate()`: the runs, the model time per step, both cost guards and the report.
  - `calibrate.ts` is the CLI alone. No test imports it, since importing it loads `.env` and starts billed runs.
- **Routes and files outside the expected list.** The lookup uses `TARGET_APP_ROUTES` from `@wayford/filter/serve-target-app`. That is the one shared copy of the routes that s1-04 decided on, which s1-03 (#148) brought to `main` with its drift test in `routes.browser.test.ts`. This PR made the same copy first, then dropped it in the rebase, so it no longer changes `packages/filter`. The one file it changes outside the list is `tasks/s2-06-jev-actor-backend.md`, which now carries the shared CLI module as a constraint.
- **What the table adds to the task's list.**
  - A wall-time column, for the Jev gate.
  - An error column.
  - The go/no-go generalised to "at least 80% of seeds", which is 4/5 here and 8/10 for the Jev gate.
  - A set the spend stops early reads "incomplete", and its rows are not judged. A run billed before it rejects still counts in the spend.
- **What the run showed.**
  - Both Vera rows end on the step cap, not by giving up: Vera wanders for 20 steps.
  - The first estimate (0.90 USD) was 24 times what the set cost (0.0375 USD). After the run, the per-step figures came down from 8,000 tokens in and 2,000 out to 2,000 in and 500 out. The run measured about 1,000 in and 100 out. The default set now estimates 0.225 USD. It is still a first stop only; the spend check while running is the real guard.
- **Follow-up: one CLI setup module.** `calibrate.ts` repeats `run-one.ts` almost word for word for:
  - the `.env` and `runs/` paths;
  - `serve()` with its port hint;
  - the Chromium launch with its install hint;
  - digit-only seed parsing.

  A small `src/cli.ts` shared by `run:one`, `smoke:run` and `calibrate` would hold one copy. It is left out to keep this PR to its task, though `run-one.ts` and `smoke-run.ts` are in `packages/agent/src/**`. `s2-06` carries it as a constraint, since adding `--backend jev` touches both CLIs.
- **The CLI finds `.env` from its own file**, as `run:one` does. Run in a worktree, it needs the key in the shell or a `.env` at that checkout's root.

## Out of scope

- The Jev backend: `s2-06` adds `--backend jev` and fills its gate with this command.
- Storing calibration results in the database, a screen for them, the Analyst.

## Notes for the reviewer

- If Ada fails, the Actor or the app is broken, not the filter (`docs/RULES.md`, calibration).
- Many runs ending on the clock point at model latency, not at the persona. Lower the Actor's reasoning effort in config first; raising a persona's `budgetSeconds` is a `docs/RULES.md` change. Say which in the PR, and never change B3 itself.
