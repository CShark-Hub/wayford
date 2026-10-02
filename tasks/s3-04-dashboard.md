# s3-04 — Dashboard and run detail

Stream: s3
Milestone: week 3
Size: L
Depends on: s3-02, issue #15 (the fixture run carries a dice roll). Only the `pnpm dev` acceptance box needs s4-03 merged; everything else builds against the routes in `tasks/s4-03-runs-api.md` with stubbed responses.

## Context

Read first, in this order:

- `docs/PLAN.md` F7, F12 AC2, and section "UI" (the sober output register)
- `AGENTS.md` sections "Every verdict clickable through to evidence" and "Traps already identified" (narration is confabulated)
- `packages/core/src/run.ts` and `packages/core/src/observation.ts`
- `packages/io/src/` after s4-03 — the runs API
- `packages/web/src/` after s3-02 — the router and the shell

## Goal

Every stored run can be found and replayed step by step with its evidence, video and trace, and a task's results read per persona at a glance.

## Interface

- In: the s4-03 runs API
- Out: routes `/runs` and `/runs/:id` in `packages/web`
- Files expected to change: `packages/web/**`, `pnpm-lock.yaml`

## Constraints

- Filters (task, persona, outcome) live in the URL (F7 AC1).
- Per task: success rate and median duration per persona (F7 AC2), in Recharts, personas left to right in fixture order, Ada to Zoya.
- Run header: `persona | seed | run id` in monospace (F7 AC4), and the run's cost.
- Replay per step (F7 AC3): the screenshot; the Actor-facing text exactly as stored; the evidence, every element with its state and decisions, so a masked name (P1 to P4), a renamed one (K1, K4, later K2) and an attention cut (A1) each show with the rule that made it; the action proposed and performed, with any dice rolls; the narration under a "narration" label, set apart from the rest because it is interpretation after the fact, not measurement. A wasted step (`"wasted" in step`) has no action, screenshot or narration of its own: it shows the latest earlier step's screenshot, or none (a wasted step 0, or a run of wasted steps from the start); in place of the action, the answers the loop refused, labelled as refs the Actor was not shown; and their narrations under the "narration" label, never in the action slot.
- Video player and trace download (F12 AC2).
- Output register: sober, monochrome, dense. The persona colour is the only accent.
- Responses parsed with the core schemas. No run logic duplicated from core.

## Acceptance

- [x] `pnpm --filter @wayford/web test` passes: filters, success rate and median computed from a fixture list, and the replay route showing step N. 19 files, 157 tests pass. Filters: `src/runs/filter.test.ts` (6). Success rate and median from `src/runs/fixture-runs.ts`, the fixture run and 23 variants of it, 24 runs across Ada, Milo, Vera, Zoya and `prof_guest`, both tasks and all four outcomes: `src/runs/stats.test.ts` (8), "the success rate leaves error runs out", "the median time is over successful runs only", and through the screen, `src/screens/runs.test.tsx` "each task's table holds its exact numbers, bundled personas first". Step N through the app router: `src/screens/run-detail.test.tsx` "?step=4 replays the give-up and its narration".
- [x] A test shows narration renders under its own "narration" label, outside the observation and evidence blocks. `src/runs/step-replay.test.tsx` "a complete step: step 0's narration" and "a wasted step: step 3's refused answers, each labelled by the ref it was not shown": the text is inside the Narration section and in none of the Actor's view, Evidence or Action sections.
- [x] Needs s4-03 merged. With `pnpm dev`, after a few runs started through `POST /runs`, `/runs` lists them; filtering by persona narrows the list, and clicking a run opens its steps with screenshots, the observation and the action (screenshot in the PR). On 2026-10-02, after s4-03 merged (#144), with a real key and every role on Luna: `POST /tasks` stored the easy goal as `task_01m3z83jxw8hrfp3yfttmmb5er`, and `POST /runs` for Ada, Vera and Zoya on seed 1 returned three ids. Ada and Vera ended `success` in 2 steps, and Zoya `budget_exceeded` in 20. `/runs` listed 3 of 3 as they were stored. The Persona select set to Vera gave `?profileId=prof_vera` and 1 of 3. A click on Vera's run opened `Vera | 1 | run_01m3z83vzj9bp13px994kq483t`, and step 1 showed both of io's screenshots (1280 × 720), the Actor's view, the evidence (the degraded `Order archive`, read as `Or▒▒r ▒▒▒hive` by P1), the action and the narration. Vera's video loaded in the player (7.0 s), and Zoya's downloads came back as `zoya-seed1-<id>.webm`, `.trace.zip` and `-step-19.png`. Screenshots in the PR.
- [x] A test renders the fixture run's replay and shows step 2's dice roll. `src/runs/step-replay.test.tsx` "step 2 shows the proposed click, the performed doubleClick and the B1 roll that fired": `click e2`, `doubleClick e2`, a row `B1 0.8 0.62 fired`.
- [x] Reloading a filtered URL restores the same filtered view. `src/screens/runs.test.tsx` "a reloaded filtered URL lists only its runs and the selects show its values" opens `/runs?profileId=prof_vera&outcome=gave_up` from a fresh router. In the browser pane against the stub, the two selects set by hand wrote that URL, and a reload of it showed the same 2 of 11 runs with Persona at Vera and Outcome at gave_up.
- [x] `pnpm --filter @wayford/web build` passes. `✓ built`. Vite warns that the one chunk is over its 500 kB advisory (815 kB, 251 kB gzipped), from Recharts; a warning, not a failure.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root, after the merge of `main` with s4-03 and s1-04. Lint checks 208 files and applies no fixes. The typecheck is clean. 74 test files, 1142 tests pass. On Windows under load, one of io's s4-03 tests failed in three of four full runs, a different one each time; each passes alone, and io passes 14 files and 107 tests on its own. This PR changes nothing in io.

## Out of scope

- Findings and the report, the sweep, and demo seed data (F11). Week 4.
- Starting runs. That is the arena (s3-03).

## Notes for the reviewer

- Open the replay of a degraded element and check the evidence shows the real name and the Actor text shows the masked one. If they read the same, the wrong field is being shown. The same goes for a renamed element once s1-03 lands.

## Outcome

What shipped, for the next reader. The design and every decision are in `docs/specs/2026-10-02-s3-04-dashboard.md`.

- **io access** (`packages/web/src/api/runs.ts`). Every io path and every response parse of the two screens: `GET /runs`, `GET /runs/:id` (404 is `null`) and `GET /tasks`, parsed with `RunResult` and `Task`, and the screenshot, video and trace URLs. Built against `tasks/s4-03-runs-api.md` with bare core shapes, which is what s4-03 merged; a change to io's shapes is a change to this file.
- **`/runs`** (`src/screens/runs.tsx`, `src/runs/filter.ts`, `src/runs/stats.ts`, `src/runs/task-results.tsx`). The URL holds `taskId`, `profileId` and `outcome`, io's own query names. The screen fetches every run once and filters in the browser. Per task, two Recharts bar charts and a table: success rate over the runs that did not error, and median time to success over the successful runs only. The task filter narrows them; persona and outcome narrow the run list only. The persona, success and error cells link to the runs behind them.
- **`/runs/$runId`** (`src/screens/run-detail.tsx`, `src/runs/replay.ts`, `src/runs/step-replay.tsx`). Header `persona | seed | run id` with cost, video with a download link, trace download, a step list and `?step=N`, a `stepIndex`. Each step shows two screenshots, Observed (the latest earlier non-wasted step's, since a stored screenshot is taken after its action) and After (its own), the stored Actor text, the evidence table, the action with its dice, and the narration in its own section.

**Open.** The run video plays but cannot be scrubbed: io answers a Range request with the whole file, so Chromium reports it unseekable. The fix is io's (Range support on the run-file routes), a follow-up to s4-03.

