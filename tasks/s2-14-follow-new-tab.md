# s2-14 — Follow a tab the action opens

Stream: s2
Milestone: week 4, any target (finals). Taken only if a run on our pick hits a new tab (`docs/adr/0003-any-target.md` D8).
Size: S
Depends on: a run on our pick that opens a new tab, in `s1-07`'s run set or `s4-08`'s rehearsal

## Context

Read first, in this order:

- `AGENTS.md`
- `docs/adr/0003-any-target.md` — Context, "A click that opens a new tab"; D8
- `docs/CONVENTIONS.md`
- `docs/DEMO.md` — "Finals: any target", the run that hit it
- `packages/agent/src/act.ts` — every action runs on `run.page`, the one page the run opened
- `packages/agent/src/run-context.ts` — the context, its video and trace
- `packages/agent/src/success.ts` — `urlMatches` reads the run's page

## Goal

When an action opens a new tab (`target="_blank"`, `window.open`), the loop goes on in that tab: the next observation is of the new page, and the success check reads its URL.

## Interface

- In: an action whose click opens a page in the run's context
- Out: the run continues on the newest page; `RunResult` unchanged in shape
- Files expected to change: `packages/agent/src/act.ts`, `run-context.ts`, possibly `success.ts`, and their tests

## Constraints

- The run's page is replaced, not added to: one page at a time, as a person looking at the newest tab.
- The old tab stays open; nothing closes it.
- The fake cursor and the vision emulation follow the new page, so the persona's view does not change with the tab.

## Acceptance

- [ ] `pnpm --filter @wayford/agent test` passes and includes a browser test: a fixture page with a `target="_blank"` link to a second page. After the click, the next observation's URL is the second page's, and a `urlMatches` on it ends the run with `success`.
- [ ] The run's video and trace still cover the steps on the new tab, or the PR says which part they miss and why.
- [ ] The run on our pick that hit it, run again, follows the tab
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Switching back to an earlier tab, closing tabs, popups for sign-in.
- Any change to the target app.

## Notes for the reviewer

- Playwright records one video per page: check where the new tab's video goes, and that run detail still finds the run's video.
