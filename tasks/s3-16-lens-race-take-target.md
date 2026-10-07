# s3-16 — The Lens and the Race take a target

Stream: s3
Milestone: week 4, any target (finals)
Size: M
Depends on: s3-11, s3-12, s4-09

## Context

Read first, in this order:

- `AGENTS.md`
- `docs/adr/0003-any-target.md` — D2 (the Lens's `page=` and `url=`) and D6
- `docs/DESIGN.md`, `docs/design/screens/lens.html` and `race.html`
- `packages/web/src/preview/search.ts` — `PREVIEW_PAGES`, the `page` param as an enum
- `packages/web/src/screens/lens.tsx` — the bundled fallback when the live measurement fails
- `packages/web/src/api/measure.ts`, `api/axe.ts` — cache keys with no origin
- `packages/web/src/arena/panel-state.ts` — `GOAL_PRESETS` from the bundled tasks only

## Goal

The Lens opens any page by URL and the Race runs any stored goal, both by link, so the Target screen (`s3-15`) can send a person to either.

## Interface

- **Lens:**
  - a `url` search param, any http(s) URL, beside `page`;
  - a URL field beside the page picker; the picker keeps the target app's three pages;
  - query keys carry the whole URL.
- **Lens off the target app**, which is any `url=` link (D2):
  - `perceive` gets no jargon list, as a run off the target app gets none. A `url=` link that points at the target app itself is perceived the same way, so for Kai it can differ from a run there: the target app's pages open with `page=`;
  - a failed measurement shows its error and no page. Never the bundled `/deliveries`: that would be the wrong site;
  - the copy names the page's URL, not "the target app's default parameters".
- **Race:**
  - the goals list holds the presets, then every stored task from `GET /tasks`;
  - `?task=<id>` chooses one;
  - a stored task's goal is already checked, so Start needs no new check;
  - its start URL and success condition are shown, as a preset's are.
- Files expected to change: `packages/web/src/preview/search.ts`, `screens/lens.tsx`, `api/measure.ts`, `api/axe.ts`, `packages/web/src/arena/panel-state.ts`, `start-panel.tsx`, `screens/arena.tsx`, and their tests

## Constraints

- The Lens still draws only what `perceive` returns (F2 AC3).
- A goal's start URL and success come from a preset or a stored task, never from the model (`tasks/s3-03-ring.md`).
- The 90-second demo's beats on the target app look and behave exactly as before.

## Acceptance

- [ ] `pnpm --filter @wayford/web test` passes and includes:
  - a Lens link with `url=` resolved and measured;
  - a failed foreign measurement shows no bundled page;
  - a `url=` page perceived for Kai masks no term from the target app's jargon list;
  - a Race link with `task=` preselecting a stored goal and starting with no new check.
- [ ] Under `pnpm dev`: the Lens on a public site's page for Ada and Vera, and the Race on a stored foreign goal with three personas. The PR shows both.
- [ ] `pnpm --filter @wayford/web check:self` passes on `/lens` and `/race`
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- The form that creates a foreign task: `s3-15`.
- io's side: `s4-09`.

## Notes for the reviewer

- Run demo beats 1 to 4 on the target app after the change: nothing may move.
