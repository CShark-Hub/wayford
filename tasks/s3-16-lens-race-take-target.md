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

- [x] `pnpm --filter @wayford/web test` passes and includes:
  - a Lens link with `url=` resolved and measured;
  - a failed foreign measurement shows no bundled page;
  - a `url=` page perceived for Kai masks no term from the target app's jargon list;
  - a Race link with `task=` preselecting a stored goal and starting with no new check.

  68 files, 1013 tests. The named tests are:
  - `lens.test.tsx`: "a url= link measures and draws that page, live, opened as given", "a failed URL page draws no page, never the stored /deliveries, and says why", and "Kai on a url= page gets no jargon list: Fulfilment ledger is masked on page= and not on url=";
  - `arena.test.tsx`: "/race?task= opens on the stored goal, checked, with its start and success shown";
  - `panel-calls.test.ts`: "a stored goal starts with POST /runs alone, no POST /tasks".
- [x] Under `pnpm dev`: the Lens on a public site's page for Ada and Vera, and the Race on a stored foreign goal with three personas. The PR shows both.
  - **The race, on 2026-10-08, with the user's yes and the real key:** `pnpm dev` on a scratch database.
    - From `/race?task=task_01k71a2b3c4d5e6f7g8h9j0k1m`, a task stored on `https://example.com/`, Ada, Kai and Vera were chosen and Start was pressed.
    - The browser sent `POST /api/runs` alone, with no `POST /tasks`. The race is `race_01m4d7mv897mtvp71p9drpydfb`.
    - Its runs are `run_01m4d7mv898cngb6gq6fe05vjb` (Ada), `run_01m4d7mv89sjsvt32qzw6gcrb2` (Kai) and `run_01m4d7mv89d0476zga6ewdkqjd` (Vera). Each has the stored task's id and starts at `https://example.com/`, on `openai/gpt-6-luna` with seed 1. The three cost about 0.00045 USD.
    - Each persona read the page and gave up on step 1, since example.com says on its face what it is for: the goal was a poor one, not a fault. The lanes show "Gave up, 1 step", 0/3 got through.
  - **First, with no key:** `pnpm dev` on a scratch database, with io on a placeholder LLM key and an unreachable base URL, so nothing could be billed.
    - The Lens on `https://example.com/`, live: "Live: https://example.com/ on desktop, opened as given.", with the badge "live page".
      - Ada reads 6 visible and 1 removed.
      - Vera reads 1 visible and 6 removed (P3 font size, P4 target).
    - The Race at `/race?task=<a stored task on https://example.com/>` opens on it, checked, with "start · https://example.com/" and its success shown. With Ada, Kai and Vera chosen, Start is enabled, with no new check.
- [x] `pnpm --filter @wayford/web check:self` passes on `/lens` and `/race`
  - It prints `17 screens checked in Daylight and Night: 0 shortfalls`, including `lens · url` and `race · stored goal`, after merging main.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root
  - Biome is clean on 435 files, and typecheck exits 0.
  - `pnpm test`: 172 files and 2768 tests, after merging main. Under machine load, four browser tests timed out in one full run. They pass alone (22 tests), and the next full run was clean.

## Outcome

- **The Lens half (steps 1 and 2) is built as the spec says.** A `url=` link opens any http(s) page. The Lens measures it live, and perceives it with no jargon list. A failed page draws nothing and says why. The copy reads "opened as given", never "the target app's default parameters".
- **The Race half was ported onto main** after #204 to #208 reshaped the Race (#205: race URLs and History; #206: an editable success). The spec's section "The Race on main after #204 to #208 (build)" says how:
  - stored goals sit in a select beside the presets;
  - `?task=` on `/race` opens one, checked;
  - a stored goal shows its start URL beside its success;
  - Start posts `POST /runs` alone;
  - a stored success that is not a URL pattern is held fixed and shown in words.
- **The Race setup on a stored goal** fits the 720 px view down to the History's own line. The check block a stored goal opens with is the one a preset shows after its check.
- **The Target screen (#208)** already links "Open in the Lens" (`/lens?url=`) and "Race on this goal" (`/race?task=`), as plain anchors. This branch makes them open the page and the goal. It also deletes the screen's sentence "Until the Lens and the Race take a goal of their own, each opens on its own default", which was no longer true (`target-view.tsx`, outside the expected files for that reason). Turning the anchors into typed `Link`s is a follow-up.
- **A stored goal after its race:** the check is spent, and the goal stays selected. A select fires no change on the option it holds, so to race the same stored task again, choose another goal and then this one back. A new check would mint a new task.
- **Follow-up, cut list:** `LensUrl` is io's `pageUrlParam`, word for word. One copy in core beside `AxeUrl` would give the cache-key rule one definition. That touches core and io, which are outside this task's files.

## Out of scope

- The form that creates a foreign task: `s3-15`.
- io's side: `s4-09`.

## Notes for the reviewer

- Run demo beats 1 to 4 on the target app after the change: nothing may move.
