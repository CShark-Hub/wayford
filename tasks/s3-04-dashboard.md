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
- Replay per step (F7 AC3): the screenshot; the Actor-facing text exactly as stored; the evidence, every element with its state and decisions; the action proposed and performed, with any dice rolls; the narration under a "narration" label, set apart from the rest because it is interpretation after the fact, not measurement. A wasted step (`"wasted" in step`) has no action, screenshot or narration of its own: it shows the latest earlier step's screenshot, or none (a wasted step 0, or a run of wasted steps from the start); in place of the action, the answers the loop refused, labelled as refs the Actor was not shown; and their narrations under the "narration" label, never in the action slot.
- Video player and trace download (F12 AC2).
- Output register: sober, monochrome, dense. The persona colour is the only accent.
- Responses parsed with the core schemas. No run logic duplicated from core.

## Acceptance

- [ ] `pnpm --filter @wayford/web test` passes: filters, success rate and median computed from a fixture list, and the replay route showing step N
- [ ] A test shows narration renders under its own "narration" label, outside the observation and evidence blocks
- [ ] Needs s4-03 merged. With `pnpm dev`, after a few runs started through `POST /runs`, `/runs` lists them; filtering by persona narrows the list, and clicking a run opens its steps with screenshots, the observation and the action (screenshot in the PR)
- [ ] A test renders the fixture run's replay and shows step 2's dice roll
- [ ] Reloading a filtered URL restores the same filtered view
- [ ] `pnpm --filter @wayford/web build` passes
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Findings and the report, the sweep, and demo seed data (F11). Week 4.
- Starting runs. That is the arena (s3-03).

## Notes for the reviewer

- Open the replay of a degraded element and check the evidence shows the real name and the Actor text shows the masked one. If they read the same, the wrong field is being shown.
