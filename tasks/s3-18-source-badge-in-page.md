# s3-18 — The source badge moves into the page

Stream: s3
Milestone: week 4
Size: S
Depends on: s3-12, s3-14

## Context

Read first, in this order:

- `AGENTS.md`
- `docs/DESIGN.md`, Principle 6 and "Space, shape and layout": the rule this task follows, changed in the same PR
- `docs/STACK.md` and `docs/CONVENTIONS.md`
- `docs/design/screens/race.html`, `run-detail.html`, `boundary.html`: where the badge and the backend word now sit

The top bar held a source badge and a backend tag that each screen filled through `TopBarSlot`. On five of the six screens the badge could only ever say `stored`, so it told the viewer nothing, and next to the nav it read as a status of the whole app ("the app is in stored mode"). Only the Race can be either: a race running now, or one read back from io. The Lens can be either too, but its stored banner already says so.

## Goal

The source badge is drawn only where the data beside it can be live or stored, in the Race header, and the top bar holds nothing that comes from a screen's data.

## Interface

- In: nothing new.
- Out: nothing new.
- Files expected to change: `packages/web/src/components/top-bar.tsx` and its test; `packages/web/src/arena/race-view.tsx`; `packages/web/src/screens/{lens,run-detail,report,runs}.tsx`; `packages/web/src/boundary/sweep-view.tsx`; their tests and the self-check entries that waited on the top-bar badge.

## Constraints

- "Claim less than you'd like to." Where the data can be either, the badge still comes from the data, never hard-coded.
- The Race keeps its rule: `live` while its streams are open, `stored` on a race read back from io, nothing once a live race is over.
- The backend a run, report or sweep was on stays on screen: a `backend` fact on Run detail (from `backendOf`), a word in the Report and Boundary meta lines.

## Acceptance

- [x] `TopBarSlot` and its slot are gone from `top-bar.tsx`; no screen imports it.
- [x] The Race header shows `live` during a race and `stored` on a stored race.
- [x] Lens, Run detail, Report, Runs and Boundary draw no source badge and no backend tag.
- [x] Run detail lists `backend` in its facts once a step planned an action; Report and Boundary name the backend in their meta lines.
- [x] `pnpm --filter @wayford/web test`, root `pnpm typecheck` and `pnpm lint` pass.

## Out of scope

- Tooltips on the badge.
- Restyling `SourceBadge` itself.
- The Lens's stored banner, which stays as it is.

## Notes for the reviewer

- `s3-17` (the nav carries the target) also edits `top-bar.tsx`. Whichever merges second rebases.
- The older specs under `docs/specs/` describe the top-bar badge. They are records of what was built then and stay as they are.
