# s3-03 — Ring: several personas on one task, live

Stream: s3
Milestone: week 3
Size: L
Depends on: s3-02. Only the real-key acceptance box needs s4-03 merged; everything else builds against the routes in `tasks/s4-03-runs-api.md` with a stubbed `fetch` and `EventSource`.

## Context

Read first, in this order:

- `docs/PLAN.md` F3, F6, assumption A7, and section "UI" (the playful input register, the race track)
- `KONCEPCJA.md` section "Demo, 90 sekund", steps 3 and 4
- `packages/core/src/run.ts` — `RunEvent`
- `packages/io/src/` after s4-03 — `POST /tasks`, `POST /runs`, the run event streams
- `packages/web/src/` after s3-02 — avatars and the shell

## Goal

An arena screen takes a goal in one sentence and three to five personas, starts the runs, and shows them side by side with avatars moving on their run events, so the demo shows who gets across and who does not.

## Interface

- In: `POST /tasks` (the Extractor), `POST /runs`, `GET /runs/:id/events`
- Out: route `/arena` in `packages/web`: the start panel, then the race; avatar animation states
- Files expected to change: `packages/web/**`

## Constraints

- Start panel: pick one of the target app's two goals (`packages/target-app/README.md`, "Goals"). The preset supplies `startUrl` and the `success` condition, which never come from the model or the sentence. Its sentence stays editable and goes through the Extractor (`POST /tasks` with `story`, `startUrl`, `success`), and the rewrite and stripped words are shown before the start (F3 AC1). Then the personas, 3 to 5, and one seed.
- One `EventSource` per run, at most five runs: browsers allow six connections per origin. A comment in the code says so.
- Avatar state is a pure function of the events seen so far: idle before the first step, moving after an action, stuck when the last N steps stayed on one URL (N stated in the code), done on `success`, gave up on `gave_up` or `budget_exceeded`, error on `runFailed`. Tested without a browser.
- Finish order and elapsed time come from event timestamps, never the local clock (F6 AC3).
- Each tile shows its run's latest step screenshot, served by io. No live video: cut in `m0-08`.
- Animation with Framer Motion (`docs/STACK.md`). Every control has an accessible name.

## Acceptance

- [ ] `pnpm --filter @wayford/web test` passes and includes a test of the avatar-state function over the fixture events
- [ ] A test replays the fixture events as three runs through a stubbed `EventSource`: three tiles, avatars change state, the finish order matches the event timestamps
- [ ] With synthetic profiles in the test (only four fixture personas exist), the start panel refuses a sixth persona
- [ ] A test shows the `POST /tasks` body carries the chosen preset's `startUrl` and `success`
- [ ] A test shows a path-laden sentence displays the Extractor's rewrite and stripped words before the start button is enabled
- [ ] Needs s4-03 merged. With `pnpm dev` and a real key: pick the easy goal, pick Ada, Vera and Zoya, start; three avatars race, each ends in a final state, and the runs appear in `GET /runs` (screen recording in the PR)
- [ ] `pnpm --filter @wayford/web build` passes
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Live video. Cut in `m0-08`; the `webm` in run detail is the recording.
- The dashboard and run detail (s3-04).
- Choosing target-app parameters from the arena; runs use the defaults.

## Notes for the reviewer

- Watch Zoya: at the defaults she cannot leave the home page, so her avatar should go stuck, then gave up. If it goes "moving" forever, the stuck rule is wrong.
