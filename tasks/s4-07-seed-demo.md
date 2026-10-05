# s4-07 — `seed:demo`: the demo's data in one command

Stream: s4
Milestone: week 4
Size: M
Depends on: s4-04, s4-05, s2-12

## Context

Read first, in this order:

- `docs/PLAN.md` F11
- `docs/DEMO.md` — "Before the demo", and beats 5 and 6, which read stored data only
- `docs/adr/0001-jev-actor-backend.md` — the gate passed, so this runs on Jev
- `packages/io/src/runner.ts`, the Analyst from `s4-04` and the sweep from `s4-05`
- `packages/agent/src/calibration-run.browser.test.ts` — the fake that answers from the page it is shown, and seeds 1 and 2 only, to keep a browser test fast
- `packages/agent/src/fake-llm.ts` — the fake `decide`, which gives Jev's answer

## Goal

`pnpm seed:demo` fills the database with everything the dashboard, the report and the sweep screens show in the demo, and prints how many runs it made, how long it took and what it cost, the numbers the pitch quotes.

## Interface

- Out: `pnpm seed:demo [--fake | --backend llm] [--reset]` at the root. It runs:
  - Ada, Kai and Vera on `task_next-parcel` and `task_past-order`, seeds 1 to 10;
  - the Analyst on both tasks;
  - Vera's contrast sweep and Kai's `maxElements` sweep, with `s4-05`'s ranges.
- Files expected to change: `packages/io/src/seed-demo.ts` and its test, `packages/io/package.json`, the root `package.json`

## Constraints

- Default backend `jev`. `--backend llm` is the fallback if Jev is down on the day.
- `--fake` needs no key. It is how screens are built and tested on real-shaped data without spending, so it fakes the backend the real command runs:
  - the Jev backend, with a fake `decide` that answers from the page it is shown, so each step stores a `decision` drawn through `drawOption`, as a real Jev step does;
  - a fake Analyst.
- `--fake` and `--backend llm` do not combine: the LLM fallback matters only for the real run.
- A task with no ground-truth file under `runs/ground-truth/` gets a warning naming `pnpm --filter @wayford/agent scout`, since the report opens with Scout's line. `seed:demo` does not run Scout.
- The run sets, the Analyst and the sweeps are one function, which the command calls with the full set and the test with a reduced one.
- It refuses to write into a database that already holds runs, unless `--reset`, which empties runs, reports and sweeps first.
- One summary at the end: runs made, by outcome; wall time; total cost; cost per run. Printed so it pastes into the pitch notes.

## Acceptance

- [ ] `pnpm --filter @wayford/io test` passes with a test of the `--fake` path on a reduced set, seeds 1 and 2 and two values per sweep, on a fresh database: 12 runs outside any sweep, each step carrying a `decision`; 2 reports; 2 sweeps of 4 runs each, each with a boundary or "no boundary"
- [ ] `pnpm seed:demo --fake` on a fresh database stores 60 runs outside any sweep, 2 reports and 2 sweeps (output in the PR)
- [ ] After `pnpm seed:demo --fake`, `pnpm dev` shows a populated dashboard, both reports, both sweeps and, once `s3-10` is in, the Jev panel in run detail. The PR has a screenshot of each.
- [ ] With a real key, `pnpm seed:demo --reset` on Jev completes; its summary is in the PR
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Milo and Zoya. The demo's cast is Ada, Kai and Vera.
- Scheduling or resuming. A failed seed is rerun with `--reset`.

## Notes for the reviewer

- Run `--fake` yourself; it is the fastest way to see every week 4 screen with data.
