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

- [ ] `pnpm --filter @wayford/agent test` and `pnpm --filter @wayford/core test` pass
- [ ] A unit test pins the movement time for given travel and width against the formula in RULES
- [ ] Same seed and answers twice, under fake wall clocks running at different speeds: identical simulated times and the same outcome
- [ ] With the same answers, a persona whose knobs make it slower ends `budget_exceeded` on a run that Ada's knobs finish
- [ ] The persona fixtures validate with their new knobs, each with its source or `folk`
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Misclicks (s2-08). Typing speed. Cursor path animation.

## Notes for the reviewer

- Find every reader of a duration or the budget, in agent, io and web, and check it reads the clock the spec chose.
- `calibrate` (`s2-11`) reports how many runs end on the wall clock. That number is the case for this task: if it is near zero, the task can wait.
