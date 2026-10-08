# s2-09 — Simulated time: click speed and the budget

Stream: s2
Milestone: week 4
Size: L
Depends on: s2-10 (B3 and the injectable clock); after s2-08 if both are in flight, since both use Fitts's law

## Context

Read first, in this order:

- `docs/RULES.md` stage 7, the B3 row
- `docs/PLAN.md` F5 AC5, F6 AC3 and F7 AC2
- `packages/core/src/profile.ts` — `Behaviour` and `budgetSeconds`
- `packages/core/src/run.ts` — `RunResult` and its durations
- `packages/agent/src/` after s2-10 — the loop's injectable clock and B3

## Goal

Every run keeps a simulated clock in which each action costs the time a person with the persona's speed would take, thinking, pointing and pressing, so `budgetSeconds` ends a slow persona's run from the seed and the answers instead of from model latency.

## Interface

- In: per action, the cursor's travel from the previous point, the target's width and the action type; speed knobs added to `Behaviour`
- Out: a simulated duration per step and per run in the run record, and B3 decided on the simulated clock
- Files expected to change: `docs/RULES.md` (B3) and `packages/core/src/profile.ts`, `run.ts` and the persona fixtures; `packages/agent/src/**`; `packages/io/**` and `packages/web/**` for the clock's label on screen; `docs/PLAN.md` F5 AC5 and A12, which say B3 is the one rule a seed does not reproduce

## Constraints

- Today B3 is wall-clock, "the one behaviour rule a seed does not reproduce" (RULES). This task makes it reproducible, and RULES' B3 row changes first, with its sources:
  - pointing by Fitts's law in its Shannon form, `MT = a + b · log2(D / W + 1)` (Fitts 1954, MacKenzie 1992);
  - per-action operators from the Keystroke-Level Model (Card, Moran and Newell 1983).
- Persona speeds with no citation behind them say `folk`, as every unsourced number does (`AGENTS.md`, "Provenance on every threshold"). How a behaviour knob carries its provenance is decided here.
- Deterministic: no clock read decides anything (`docs/CONVENTIONS.md`, "Determinism rules"). The same seed and answers give the same simulated times and the same outcome.
- Model latency no longer counts toward the budget. The run still records its wall-clock time, as evidence. Whether a wall-clock safety cap stays next to the step cap is the spec's call.
- If the clock adds any jitter, it is a draw of the behaviour stream, logged like a roll. Otherwise time is a pure function of geometry and the knobs.
- The ring's elapsed time and finish order (F6 AC3) and the dashboard's median time (F7 AC2) read one of the two clocks. The spec says which and labels it on screen.

## Acceptance

- [x] `pnpm --filter @wayford/agent test` and `pnpm --filter @wayford/core test` pass. On 2026-10-08, after the PR review's fixes, agent passed 27 files and 521 tests, and core 19 files and 493 tests.
- [x] A unit test pins the movement time for given travel and width against the formula in RULES. `packages/agent/src/simulated-time.test.ts`, "movementMs matches RULES' worked example": D 400 and W 36, 36 and 36, 600 and 20, 1000 and 10. Each matches RULES' printed value to 4 decimals and Python's `-107 + 223 * math.log2(D / W + 1)` to 1e-9. Beside it: "a move too short for the intercept is floored at 0, not below", "W is at least 1 px", and "RULES' worked click, D 400 and W 36: Ada 2245 ms, Vera 4043, Zoya 5841".
- [x] Same seed and answers twice, under fake wall clocks running at different speeds: identical simulated times and the same outcome. `packages/agent/src/actor-loop.browser.test.ts`, "simulated time does not read the wall clock: two wall clocks, one outcome".
  - One wall clock moves 1 ms per read, the other 60 s.
  - Both runs end `success`, with equal `simulatedMs` on every step and on the run.
  - The slow run's `durationMs` is exactly 60,000 times the fast one's, so the wall clocks did differ, and nothing branched on them.
  - Under the old wall-clock B3, the 60 s run ended on step 0.
- [x] With the same answers, a persona whose knobs make it slower ends `budget_exceeded` on a run that Ada's knobs finish. Same file, "a slower pace runs out where Ada's finishes".
  - Ada's knobs reach the easy goal inside a budget set from her own simulated total, rounded up to whole seconds.
  - The same profile and budget with `thinkingTime` 3 (`folk`) ends `budget_exceeded`, `limit: "clock"`, its last step planned and never performed.
- [x] The persona fixtures validate with their new knobs, each with its source or `folk`. `packages/core/src/profile.test.ts`:
  - every fixture parses;
  - "Vera and Zoya set a pace for B3's clock, folk since no source gives one";
  - "Ada, Kai and Milo keep the norm's pace: they set no knob";
  - for each knob, "a %s without provenance is rejected, like a threshold without one";
  - "each persona's numbers in the RULES bundle table equal its fixture's, both ways", which covers the pace column.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root. On 2026-10-08, after the PR review's fixes:
  - lint checked 447 files with no fixes, and typecheck exited 0 in every package;
  - test, with four workers, passed 179 files and 2960 tests, with 1 file and 3 tests skipped;
  - before them, at `fd91e9c`, the same run passed 2965 tests; the review's cuts removed tests that only restated a constant or a neighbour;
  - one full run at the default worker count had one failure, agent's `jev-actor.browser.test.ts`: a run measured the target app before its stylesheet applied. The branch does not touch that file, and it passed 3 of 3 alone.

## Out of scope

- Misclicks (s2-08). Typing speed. Cursor path animation.

## Notes for the reviewer

- Find every reader of a duration or the budget, in agent, io and web, and check it reads the clock the spec chose.
- `calibrate` (`s2-11`) reports how many runs end on the wall clock. That number is the case for this task: if it is near zero, the task can wait.

## Outcome

Built to `docs/specs/2026-10-08-s2-09-simulated-time.md` (approved 2026-10-08) and its plan. The case for it: on our pick, 10 of the second pass's 27 runs ran out of their 120 s on the wall clock (`docs/DEMO.md`).

**What differs from the task file:**

- **Files outside its list:**
  - `packages/core/src/primitives.ts` gains the `klm` source id.
  - `packages/core/src/report.ts` gains `medianSimulatedMs`, so a stored report keeps its wall-clock median's meaning.
  - ADR 0001 and ADR 0003 get a dated note each, since both said B3 runs on the wall clock.
- **The knobs** are `thinkingTime` and `motorTime`, each `{ factor, provenance }`. Absent means the norm. Vera is set to 2 and 1.5, Zoya to 3 and 2, all `folk`.
- **The budgets are unchanged.** A click step costs Ada about 2.2 s, so under a 20-step cap the clock ends no walk of clicks and scrolls. The runs the wall clock used to cut short now go to the cap or succeed. `seed:demo` and the rehearsal on our pick (`s4-08`) need a rerun after merge.
- **No wall-clock safety cap.** The step cap bounds a run, and every wait inside a step has its own bound. Since the PR review, that includes the LLM Actor's own 60 s per model call, in place of the adapter's 300 s for the Analyst.
- **The screens read the simulated clock:** the Race's clocks and finish order, the Report's median, the Runs list. Run detail shows both clocks, and the events log the wall clock, each labelled. The Cast is unchanged; RULES' persona table names the pace knobs.
