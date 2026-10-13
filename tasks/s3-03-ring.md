# s3-03 — Ring: several personas on one task, live

Stream: s3
Milestone: week 3
Size: M (was L; motion cut on 2026-10-01 to fit week 3)
Depends on: s3-02. Only the real-key acceptance box needs s4-03 merged; everything else builds against the routes in `tasks/s4-03-runs-api.md` with a stubbed `fetch` and `EventSource`.

## Context

Read first, in this order:

- `docs/PLAN.md` F3, F6, assumption A7, and section "UI" (the playful input register, the race track)
- `tasks/KONCEPCJA.md` section "Demo, 90 sekund", steps 3 and 4
- `packages/core/src/run.ts` — `RunEvent`
- `packages/io/src/` after s4-03 — `POST /tasks`, `POST /runs`, the run event streams
- `packages/web/src/` after s3-02 — avatars and the shell

## Goal

An arena screen takes a goal in one sentence and three to five personas, starts the runs, and shows them side by side with avatars whose state follows their run events, so the demo shows who gets across and who does not.

## Interface

- In: `POST /tasks` (the Extractor), `POST /runs`, `GET /runs/:id/events`
- Out: route `/arena` in `packages/web`: the start panel, then the race; avatar states
- Files expected to change: `packages/web/**`

## Constraints

- Start panel: pick one of the target app's two goals (`packages/target-app/README.md`, "Goals"). The preset supplies `startUrl` and the `success` condition, which never come from the model or the sentence. Its sentence stays editable and goes through the Extractor (`POST /tasks` with `story`, `startUrl`, `success`), and the rewrite and stripped words are shown before the start (F3 AC1). Then the personas, 3 to 5, and one seed.
- One `EventSource` per run, at most five runs: browsers allow six connections per origin. A comment in the code says so.
- Avatar state is a pure function of the events seen so far: idle before the first step, moving after an action, stuck when the last N steps stayed on one URL (N stated in the code), done on `success`, gave up on `gave_up` or `budget_exceeded`, error on `runFailed`. Tested without a browser.
- Finish order and elapsed time come from event timestamps, never the local clock (F6 AC3).
- Each tile shows its run's latest step screenshot, served by io, and the latest narration line under a "narration" label: the Actor talking is step 4 of the demo (`tasks/KONCEPCJA.md`, "Demo, 90 sekund"). A Jev run has no narration, and the line stays empty. No live video: cut in `m0-08`.
- No motion: each avatar state is a static variant of the avatar from s3-02, swapped when the state changes. Every control has an accessible name.

## Acceptance

- [x] `pnpm --filter @wayford/web test` passes and includes a test of the avatar-state function over the fixture events. 26 files, 248 tests pass. `src/arena/avatar-state.test.ts` "every prefix of Vera's run: idle, moving, never stuck, then gave up" folds every prefix of `runEventFixtures`: idle through event 3, moving from the first `actionPerformed`, gave up on `runFinished`. Under the stuck rule revised in PR #151's review (the last 2 steps each left the page as it was), the fixture never reaches stuck: only its wasted step 3 changed nothing. More tests cover stuck: two wasted steps on one page are stuck once the next observation arrives and not before, scrolls that change the page are not, steps that type are not, and a changed page takes stuck back to moving; and done, `budget_exceeded`, and a crash as error even when stuck.
- [x] A test replays the fixture events as three runs through a stubbed `EventSource`: three tiles, avatars change state, the finish order matches the event timestamps. `src/arena/race.test.tsx` "replays the fixture events as three runs through a stubbed EventSource: …": Ada (success after 9.5 s), Kai (`runFailed` after 4.5 s) and Vera (the fixture with a second wasted step on `/settings`, `gave_up` after 18.5 s), played interleaved into `followRace` with the terminal events delivered Ada, Vera, Kai. The tiles' `data-state` go idle → moving → done, idle → moving → error, and idle → moving → stuck → gave up, and the finish order reads Kai, Ada, Vera: by each run's elapsed time read off the event timestamps (revised in PR #151's review, from the end instant), not by delivery. `src/arena/race.test.tsx` "a run that started late and ran shorter ranks first, though it ended later" covers the difference.
- [x] With synthetic profiles in the test (five fixture personas exist once s1-04 lands), the start panel refuses a sixth persona. `src/arena/panel-state.test.ts` "a sixth persona is refused: the same state comes back" and `src/arena/start-panel.test.tsx` "at five personas the sixth box is unavailable and the limit line says why", on six synthetic profiles (`sixProfiles` in `src/arena/fixture-race.ts`).
- [x] A test shows the `POST /tasks` body carries the chosen preset's `startUrl` and `success`. `src/arena/start-panel.test.tsx` "POST /tasks carries the edited sentence with the $label preset's start URL and success", once per preset: an edited sentence goes through `extractTask(taskRequestOf(state))` to a stubbed `fetch`, and the body holds that preset's `startUrl` and `success`. Both presets share the start URL, so the success condition is what tells them apart.
- [x] A test shows a path-laden sentence displays the Extractor's rewrite and stripped words before the start button is enabled. `src/arena/start-panel.test.tsx` "a path-laden sentence shows the rewrite and what was taken out before Start is available": "Click Deliveries → Order archive to see what I ordered three months ago" leaves Start `disabled`; after the stubbed 201 the panel shows the rewritten goal, "Taken out: Deliveries, Order archive" and "Rewritten from your sentence", and Start is enabled. A 422 keeps Start off and shows the words that survived; an answer for an older sentence is dropped.
- [x] A test shows a tile's narration line follows the latest `narration` event of its run. `src/arena/race-view.test.tsx` "Vera's line: empty, then the first narration after event 2, the second after 6, …, the last after 16", over every prefix, and "a run with no narration event, as a Jev run: the label and an empty line".
- [x] Needs s4-03 and s1-04 merged. With `pnpm dev` and a real key: pick the hard goal, pick Ada, Kai and Vera, start; three avatars race, each ends in a final state, and the runs appear in `GET /runs` (screen recording in the PR). On 2026-10-03, every role on Luna, driven by a Playwright script with video recording on: the hard goal's sentence checked as unchanged ("Nothing taken out"), Ada, Kai and Vera on seed 1, Start. `POST /runs` answered 202 with `run_01m40rmg0z5esntjyajevtjqj1`, `run_01m40rmg0ztdws1342699f4whm` and `run_01m40rmg0zx0f507155j75696h`. The avatars went idle → moving → done, with each tile's latest screenshot and narration line live, and the finish order read Kai 5.9 s, Vera 6.5 s, Ada 7 s. Each run reached the archive in 2 steps; Vera's narration names "a partly legible link", the link reaching her degraded on this seed. `GET /runs` held all three, `success`, and `/runs` listed them. Recording and screenshots in the PR.
- [x] `pnpm --filter @wayford/web build` passes. `✓ built`. Vite's 500 kB chunk advisory was already on `main` (815 kB there, from Recharts); a warning, not a failure.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root, after the merge of `main` with s1-03 (#148). Lint checks 236 files and applies no fixes. The typecheck is clean. 84 test files, 1329 tests pass (after the PR review fixes).

## Out of scope

- Live video. Cut in `m0-08`; the `webm` in run detail is the recording.
- Animation and Framer Motion. Cut on 2026-10-01 to fit week 3.
- The dashboard and run detail (s3-04).
- Choosing target-app parameters from the arena; runs use the defaults.

## Notes for the reviewer

- Watch Vera: on most seeds the archive link never reaches her and the other routes are closed at their entrances, so her avatar should go stuck, then gave up. If it goes "moving" forever, the stuck rule is wrong.

## Outcome

What shipped, for the next reader. The design and every decision are in `docs/specs/2026-10-03-s3-03-ring.md`.

- **Built against io, not stubs.** s4-03 merged before this task started, so the arena calls io's own routes, `POST /tasks`, `POST /runs`, `GET /runs/:id/events` and the live screenshot route. The stubbed `fetch` and `EventSource` above are in the tests only. io's two response bodies get their own zod schemas in `packages/web/src/api/runs.ts`, since web may not import io.
- **Start panel** (`src/arena/panel-state.ts`, `src/arena/start-panel.tsx`). The presets are core's `tasks.json` goals, labelled by task id, and the panel opens on the hard goal. "Check the goal" sends the sentence with the preset's `startUrl` and `success`. Start needs an accepted check of the current preset and sentence, 3 to 5 personas and a seed of digits only. The personas are sent in list order, Ada to Zoya.
- **Race** (`src/arena/avatar-state.ts`, `src/arena/race.ts`, `src/arena/race-view.tsx`). One `EventSource` per run (`MAX_PERSONAS` says why five). A persona is stuck when its last 2 steps each left the page as it was: the next observation is the same page and the step typed nothing. This is stricter than this file's "stayed on one URL", revised in PR #151's review so that work inside one page (a form, scrolls that reveal more) is not called stuck. The tile says what was counted. Elapsed time comes from event timestamps, and the finish order ranks by it; runs with the same time share a place. A run whose stream is lost before its end shows as lost, not in its last state. "New race" waits until every run is over, since io cannot cancel a run.
- **Avatar states** (`src/avatar/state.ts`, `src/avatar/avatar.tsx`). A static badge per state in the top-left corner, none for idle. The face never changes. Without a state the avatar's markup is what it was.

**Open.** The real run above ended in 2 steps for all three on seed 1, so stuck and gave up were not seen live; the tests cover them. The reviewer note below expects Vera to lose the link on most seeds, so a rehearsal seed for the demo, one where she does, is still to pick.
