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

- [ ] `pnpm --filter @wayford/agent test` passes, with a fake adapter giving a fixed table: the route lookup, the end counts and the medians
- [ ] With a real key, `calibrate` prints the table, and the PR shows it with the go/no-go result. If Ada or the hard-cut Vera misses, the PR says which run and why, and the board says so before anything is built on the loop
- [ ] Needs s1-03 and s2-10. The table rerun with Kai's row, in a comment on the PR or in the s1-03 PR
- [ ] `--max-usd 0.01` stops before any run starts
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- The Jev backend: `s2-06` adds `--backend jev` and fills its gate with this command.
- Storing calibration results in the database, a screen for them, the Analyst.

## Notes for the reviewer

- If Ada fails, the Actor or the app is broken, not the filter (`docs/RULES.md`, calibration).
- Many runs ending on the clock point at model latency, not at the persona. Lower the Actor's reasoning effort in config first; raising a persona's `budgetSeconds` is a `docs/RULES.md` change. Say which in the PR, and never change B3 itself.
