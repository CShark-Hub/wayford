# s3-17 — The nav carries the target

Stream: s3
Milestone: week 4, any target (finals)
Size: M
Depends on: s3-15 (done), s3-16 (PR #210)

## Context

Read first, in this order:

- `AGENTS.md`
- `docs/adr/0003-any-target.md`: D6, then the amendment of 2026-10-08 (D11 to D15), which this task builds
- `docs/DESIGN.md`: "Space, shape and layout" (the top bar) and the Screens table
- `docs/STACK.md` and `docs/CONVENTIONS.md`
- `packages/web/src/components/top-bar.tsx` and its test: `STORY_NAV` and the Race tab's shown race
- `packages/web/src/arena/shown-race.ts`: the store to model the current target on, and `forgetRace`
- `packages/web/src/screens/target.tsx` and `target/target-view.tsx`: `StoredGoal`, `LiveGoal` and the goal view's "Open it" links
- `packages/web/src/preview/search.ts`: `LensUrl` (added by `s3-16`), which reads a `url=` value
- `packages/web/src/theme.ts`: the app's one use of browser storage so far

## Goal

The top bar leads the Lens, the Race and the Report to the target last opened on the Target screen, and leads back to that target, until it is cleared.

## Interface

- **The current target:** a new `packages/web/src/target/current-target.ts`.
  - It holds `{ taskId, startUrl }`, or nothing.
  - It is kept in `sessionStorage` under one key and read back through zod, as `TaskId` and `LensUrl`. A value that fails the parse reads as nothing. If the storage throws (blocked, or full), a read gives nothing and a write is dropped. Neither ever throws.
  - It has a hook for the top bar, as `useShownRace` is. In a static render the hook reads the same store.
  - It has a set function and a clear function. Setting a task id other than the current one calls `forgetRace()`, so the Race tab leads to the new goal. Setting the same id again does not.
- **Set:** the Target screen's goal view sets the current target to its task when it draws a task io holds (`LiveGoal`).
- **Clear:**
  - `StoredGoal` finds that io holds no task under the id (`stored === null`) and the id is the current one;
  - a "Clear target" control on the goal view, beside "New goal", clears it and opens the form. "New goal" keeps the current target until the form's next goal is accepted.
- **The links:** one function takes the current target, or nothing, and returns the links of `00 Target`, `02 Lens`, `03 Race` and `04 Report`.

  | Nav item | No target (as today) | With a target |
  |---|---|---|
  | `00 Target` | `/target` | `/target?task=<id>` |
  | `02 Lens` | `/lens` | `/lens?url=<start URL>` |
  | `03 Race` | `/race` | `/race?task=<id>` |
  | `04 Report` | `/report/<DEMO_GOAL>` | `/report/<id>` |

  The goal view's "Open in the Lens" and "Race on this goal" are built by the same function, as typed `Link`s instead of plain anchors.
- **The top bar:**
  - `STORY_NAV` starts with `00 Target`. The `Target` button on the right is removed, and `Runs` stays.
  - With a target set, the `00 Target` item names the target's host (`example.com`) beside its label, in mono. A long host is cut with an ellipsis, so the bar fits at 1280 px. The link's accessible name includes the host.
  - A shown race still wins the Race tab, as today. With no shown race, the Race tab follows the table above.
  - `01 Cast` and `05 Boundary` do not change.
- Files expected to change:
  - a new `packages/web/src/target/current-target.ts` and its test;
  - `components/top-bar.tsx` and its test;
  - `screens/target.tsx`, `target/target-view.tsx` and `screens/target.test.tsx`;
  - `scripts/self-check.ts`;
  - `docs/DESIGN.md`: the top bar's nav, and the `/target` row's "Off the story path".

## Constraints

- A screen reads only its own URL (D14). Nothing here changes what a screen draws for a given URL. A `/lens` link opens the target app's `/deliveries` in any tab, with or without a target remembered. "The URL holds the whole preview state, so a preview is a link" (`src/preview/search.ts`).
- With no target, nothing changes (D15). `/` opens the Cast, the nav leads where it leads today, and the 90-second demo's beats look and behave as before.
- Only the Target screen writes the current target (D12). A Race opened on `?task=` and a Lens opened on `url=` do not set it.
- `check:self` passes in Daylight and Night (`docs/DESIGN.md`).

## Acceptance

- [x] `pnpm --filter @wayford/web test` passes and includes: (2026-10-08, in the root run of 181 files and 2930 tests: the named tests in `current-target.test.ts`, `top-bar.test.tsx` and `target.test.tsx`; the static Target tests check the rule and the button's place; the goal view setting the target and the click on "Clear target" are proven live in `scripts/target.browser.test.ts`)
  - `current-target.test.ts`:
    - a target set is read back, and a cleared one reads as nothing;
    - a broken stored value reads as nothing;
    - a storage that throws reads as nothing, and setting a target does not throw;
    - setting a new task forgets the shown race, and setting the same task does not;
  - `top-bar.test.tsx`:
    - the nav numbers Target, Cast, Lens, Race, Report and Boundary, `00` to `05`, and the right of the bar holds no Target button;
    - with no target, every link is today's;
    - with a target, Target, Lens, Race and Report carry it, and Cast and Boundary do not;
    - a shown race still wins the Race tab;
  - `target.test.tsx`:
    - the goal view sets the current target;
    - an id io does not hold clears the current target when it is that id, and leaves another one;
    - "Clear target" clears it;
    - the goal view's Lens and Race links equal the nav's.
- [x] Under `pnpm dev`, check a goal on a public site, such as `https://example.com/`, then: (2026-10-08, `pnpm dev` with a key, at 1280 × 720, driven by Playwright: `https://example.com/` checked by the real Extractor as `task_01m4ekdc6667d31zvpnz3nsybn`, and steps 1 to 6 and the D14 note each passed; the two bars are in the PR)
  1. the Lens tab opens the site's page, and a persona switch stays on it;
  2. the Race tab opens the panel on that goal;
  3. the Report tab opens that goal's report, or its empty state before one is written;
  4. the Target tab leads back to the goal view;
  5. after a reload on the Lens, the tabs still lead to the site;
  6. after "Clear target", every tab leads where it does today.

  The PR shows the bar with a target and without one.
- [x] Demo beats 1 to 4 on the target app, with no target set, look and behave as before. ("with no target, every link is today's" in `top-bar.test.tsx`; the Lens, Race and self-check browser tests unchanged and green; the one visible change is the `00 Target` entry, D15)
- [x] `pnpm --filter @wayford/web check:self` passes, with a new entry for the bar with a target set and a long host. (`target · nav`: "20 screens checked in Daylight and Night: 0 shortfalls")
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root. (181 files, 2930 tests, after the PR review's fixes)

## Outcome

- **The stored start URL is read as `HttpUrl`, not `LensUrl`.** io stores `Task.startUrl` as `HttpUrl`, so a start URL with a user and a password is a valid goal; read through `LensUrl` it would drop the whole target. `LensUrl` applies only to the Lens link, which stays plain for such a URL (spec, decision log).
- **Clearing the target forgets the shown race too**, as D13's "a change of current target forgets it" reads.
- **Every nav link is current on its path whatever the search** (`activeOptions.includeSearch: false`), so the Lens tab stays current on `/lens` while it carries another `url=`.
- **The `pnpm dev` box is a manual check**, since checking a goal calls the Extractor and needs a key. It was run on 2026-10-08 against `https://example.com/`: every step below passed, the Report showed "No report on this goal yet.", and a typed `/lens` opened `/deliveries`. A race then a new target was left to the browser test, since a live race would start three LLM runs. `target.browser.test.ts` covers with io answered per path: the bar after the goal view draws, a reload, "Clear target", a race then a new target, a typed `/lens` (D14), and the bar's fit at 1280 px with a long host in both themes. Steps for the reviewer, under `pnpm dev` with io and a key:
  1. `/target`: start URL `https://example.com/`, a goal, success by URL, "Check the goal". The bar's `00 Target` names `example.com`.
  2. `02 Lens`: the Lens opens `https://example.com/`; switch the persona, it stays on it.
  3. `03 Race`: the start panel on that goal. `04 Report`: its report, or "No report on this goal yet."
  4. `00 Target`: back to the goal view.
  5. Reload on the Lens: the tabs still lead to the site.
  6. "Clear target": every tab leads where it does on `main`.
- `packages/web/src/screens/lens.test.tsx` lists the whole nav, so it gained the `Target` row.
- **Two of the `target.test.tsx` bullets are proven live.** A static render runs no effect and clicks nothing, so the static tests are named for what they check: "the goal view's rule, followStoredGoal, sets the current target to a task io holds" and "Clear target sits beside New goal, as an outline button". The goal view setting the target and the click on "Clear target" run in `packages/web/scripts/target.browser.test.ts`, in `scripts/` because it starts the app with the self-check's `startWebApp`.

## Out of scope

- Any change inside the Lens, the Race, the Report or the Boundary. They already take a target by link (`s3-16`).
- A list of stored goals on the Target screen to choose from. The Race's goal select (`s3-16`) lists them.
- Setting the target anywhere but the Target screen.
- The Boundary on the current target: a sweep is opened by its id (D6).
- `/` opening the Target screen (D15).

## Notes for the reviewer

- Check D14 first. With a target remembered, type `/lens` into the address bar: it must open the target app's `/deliveries`. Only the nav's link carries the target.
- Open a race, then set a new target. The Race tab must lead to the panel on the new goal, not to the old race.
- The bar at 1280 px with a long host, in both themes.
