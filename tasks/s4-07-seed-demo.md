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

- [x] `pnpm --filter @wayford/io test` passes with a test of the `--fake` path on a reduced set, seeds 1 and 2 and two values per sweep, on a fresh database: 12 runs outside any sweep, each step carrying a `decision`; 2 reports; 2 sweeps of 4 runs each, each with a boundary or "no boundary". 37 files, 345 tests, on 2026-10-07 after the PR review fixes.

  `seed-demo.browser.test.ts` runs `seedDemo` on the reduced plan into a fresh `tempStore()`, with the real `runActor`, the served app, the walk, the fake Jev, the fake Analyst and test-app's `fakeAxe()`. It asserts:
  - 12 runs, none errored, each step with a `decision`, and a success on each goal;
  - 2 reports on `jev` over 6 runs each, with no sweep run left out and the axe lookup asked;
  - 2 sweeps, each `complete` with 2 values and 4 runs;
  - each sweep's summary line reads `boundary <value>`, or `no boundary` when its boundary is null;
  - the summary's outcome tally equals the stored runs', outcome by outcome.

  `sweep-text.test.ts` covers the boundary line's no-boundary and errored cases, and `sweep.test.ts` covers `routeOpenFrom` with no route table. A fake that cannot parse the options turns the browser test red (checked by breaking the parser).
- [x] `pnpm seed:demo --fake` on a fresh database stores 60 runs outside any sweep, 2 reports and 2 sweeps (output in the PR). Rerun on 2026-10-06 after merging s4-06 (axe) and s3-10, on a fresh `DATABASE_URL=file:./wayford-fake.sqlite`, with the real axe-core scanner in the loop. It exited 0:

  ```
  seed:demo on jev, fake-jev
  runs       200: 58 success, 142 gave up, 0 budget exceeded, 0 error
             60 in the run sets, 140 in 2 sweeps
  reports    task_next-parcel, task_past-order
  sweep      Vera contrast, 1.5 to 4.5, swp_01m48tetj91jsa07dspw63c626
  boundary   2.5 (rate 30%)
  sweep      Kai maxElements, 16 to 4, swp_01m48tgar6czemy5hxpc33zg89
  boundary   16 (rate 30%)
  wall time  1m 56s
  cost       0.0000 USD: runs 0.0000 USD, Analyst 0.0000 USD
  per run    0.0000 USD
  ```

  The counts and boundaries match the first run before the merge exactly. On `pnpm dev`:
  - `GET /runs` returned 60 runs;
  - `GET /reports/:taskId` returned 200 for both tasks, each over 30 runs. The hard goal's report holds an axe-core `measurement` finding, 4 deterministic findings and a hypothesis, and the fake Analyst answered the measurement's key too;
  - `GET /sweeps` returned 2, both complete with 7 values.
- [x] After `pnpm seed:demo --fake`, `pnpm dev` shows a populated dashboard, both reports, both sweeps and, once `s3-10` is in, the Jev panel in run detail. The PR has a screenshot of each.
  - Ticked in `s3-09`'s PR (#182) on 2026-10-07, after merging main with this task, `s3-08` (PR #183) and `s3-10` (PR #174). Scout's ground truth from box 4's run was copied into `runs/ground-truth/`.
  - `pnpm seed:demo --fake` on a fresh `DATABASE_URL=file:./wayford-fake.sqlite` exited 0 with box 2's summary: 200 runs, 58 success and 142 gave up; Vera's boundary 2.5 and Kai's 16; wall time 2m 01s.
  - `pnpm dev` ran on it, and Playwright took each screen at 1280 × 720 in Daylight and Night. The screenshots are in PR #182:
    - **the dashboard:** `/runs`, 60 of 60 runs, and both goals' results per persona;
    - **both reports:** `/report/task_past-order` and `/report/task_next-parcel`, each opening with Scout's line, with `stored jev` in the top bar;
    - **both sweeps:** `/boundary`, "Under half get through, first at 2.5:1.", and `/boundary?axis=maxElements`, "Under half get through, first at 16.";
    - **the Jev panel:** run detail of one of Kai's runs on the hard goal, on `jev` with `fake-jev`. It shows each option's probability, share and range, and where the roll landed.
- [x] With a real key, `pnpm seed:demo --reset` on Jev completes; its summary is in the PR. Run on 2026-10-06 with Marcin's yes, after Scout (`pnpm --filter @wayford/agent scout`: both goals reached in 2 steps, 0.0010 USD). It exited 0:

  ```
  seed:demo on jev, typesafe/jev-1.13
  runs       200: 94 success, 6 gave up, 100 budget exceeded, 0 error
             60 in the run sets, 140 in 2 sweeps
  reports    task_next-parcel, task_past-order
  sweep      Vera contrast, 1.5 to 4.5, swp_01m48m973t7hvvckqnbnkmvbae
  boundary   3.0 (rate 40%)
  sweep      Kai maxElements, 16 to 4, swp_01m48me8rjm36qeq5z60crgvn1
  boundary   12 (rate 0%)
  wall time  8m 26s
  cost       0.1183 USD: runs 0.1057 USD, Analyst 0.0125 USD
  per run    0.0005 USD
  ```

  The printed estimate was at most 0.3360 USD for the runs.

  The reports, both opening with Scout's line, on the Analyst's `openai/gpt-6-luna`:
  - **Easy goal:** Ada, Kai and Vera each 10/10.
  - **Hard goal:**

    | persona | got through | route open |
    |---|---|---|
    | Ada | 10/10 | 10/10 |
    | Kai | 0/10 | 10/10 |
    | Vera | 4/10 | 4/10 |

    It holds 3 deterministic findings and 1 hypothesis.

  This run predates s4-06's merge, so its reports hold no axe-core `measurement` finding. The runs and sweeps do not depend on the Analyst. The reseed the day before the demo brings the axe findings, and so would `pnpm --filter @wayford/io analyse -- --task <id>` on these runs (about 0.01 USD).

  Each sweep value's successes match s4-05's real sweeps, value for value. Vera's successes equal her route-open seeds at every value. Kai's 0/10 at caps 12 and 10, with a route open on every seed, is the same gap. The 100 runs ended `budget_exceeded` are Jev wandering until the step cap where no route led on, not errors.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root: 129 files, 1895 tests, on 2026-10-07 after the PR review fixes.

## Outcome

Built as `docs/specs/2026-10-06-s4-07-seed-demo.md` says. Every choice is in its decision log. What a reader of this file should know:

- **One function and a command.** `seedDemo` (`packages/io/src/seed-demo.ts`) runs three phases: the run sets, then the Analyst on each task, then the sweeps.
  - The Analyst runs before the sweeps, so a report reads its run set alone. It runs on one task after the other, so a failed call leaves no second one billing after the command has shut down (PR review).
  - The command is `seed-demo-cli.ts`, a file outside the expected list. It loads `.env` and serves on import, so no test may import it, which is how `sweep.ts` and `sweep-cli.ts` split.
  - The command refuses a store that holds any run, report or sweep unless `--reset`.
  - `--reset` empties all three, then removes each removed run's folder under `runs/` by id; `ground-truth/` is never touched. It empties only after every refusal, and after the app is served.
  - It removes folders only when `DATABASE_URL` names the default database. Every database's runs write into the one `runs/`, and a copy's ids are the original's, so a reset of a copy keeps the folders and says so (PR review). That choice is `runFoldersFor` in `seed-demo.ts`, with a table test, since no test imports the command.
  - The Analyst's axe-core lookup (s4-06) scans each page the runs stood on, on the app the command serves and the Chromium its runs share.
- **`--fake`.** It runs the real Jev backend with only Jev's probabilities faked, plus a fake Analyst. Both answer through agent's `fakeLlm`, so every answer is checked as the real adapter checks it.
  - The fake Jev puts 0.9 on the options that take a step toward the goal, reading names through the mask, and spreads 0.1 over the rest. With no such option it gives up, goes back or scrolls.
  - The fake Analyst writes a recommendation per finding and one hypothesis on a failed run's last step. Each text says `seed:demo --fake` wrote it.
  - Fake runs name `fake-jev` as their Actor model.
  - The fake is deterministic and the draw is seeded, so a second `--fake --reset` reproduced the first run's counts and boundaries exactly.
  - **Its rates are not Jev's.** The fake tries the three entrances on `/` evenly and gives up at a dead end half the time. Kai's boundary on fake data is 16, where real Jev's (s4-05) is 12. Only the real seed's numbers go in the pitch.
- **The summary** goes to stdout alone. Progress goes to stderr.
  - The wall time covers the three phases. Setup (serve and walk, about 3 s) is printed apart.
  - The cost is the runs plus the Analyst, and "per run" is the runs' cost alone.
  - The command exits 1 when a run errored or was never stored.
- **The real seed's estimate** is printed, never refused: the task names no limit.
- **Box 3 was ticked in `s3-09`'s PR (#182)**, which merged after this one, since its empty state names `pnpm seed:demo`. That PR merged main, ran `pnpm seed:demo --fake`, and added the dashboard, Report, Boundary and Jev panel screenshots on that data.
- **The real seed** (box 4) cost 0.1183 USD in 8 m 26 s, Scout 0.0010 USD more.
  - The Analyst ran on Luna, the `.env` default. For the pitch run, `LLM_ANALYST_MODEL=anthropic/claude-opus-5.5` escalates it (`docs/PLAN.md`, "AI access").
  - Rerun it the day before the demo: Scout, then `pnpm seed:demo --reset`.
  - `docs/DEMO.md`, "Before the demo", still says `pnpm seed:demo` with no `--reset`, which a store holding rehearsal runs refuses. That file is `demo-1`'s, so the fix is left to it.
- **Files outside the expected list:**
  - `seed-demo-cli.ts`, `seed-demo.browser.test.ts`;
  - `sweep-text.ts` and its test: the sweep CLI's text helpers, shared with the summary;
  - in `sweep-cli.ts`, those helpers' import;
  - in `sweep.ts`, `ended` exported, and `routeOpenFrom` taking a task with no route table, with its test;
  - in `config.ts`, `DEFAULT_DATABASE_URL` exported;
  - comments in `server.ts`, `chromium.ts`, `analyst-routes.ts`, `axe-scan.ts` and agent's `fake-llm.ts`;
  - one README line.
- **`pnpm dev` needs `LLM_API_KEY` set to boot io.** To browse `--fake` data with no `.env`, any value works, as in `LLM_API_KEY=x pnpm dev`. Browsing calls no model.

## Out of scope

- Milo and Zoya. The demo's cast is Ada, Kai and Vera.
- Scheduling or resuming. A failed seed is rerun with `--reset`.

## Notes for the reviewer

- Run `--fake` yourself; it is the fastest way to see every week 4 screen with data.
