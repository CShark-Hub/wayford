# s3-05 — Live preview on the target app

Stream: s3
Milestone: week 3
Size: S
Depends on: s1-02, s2-02, s3-01. Only the `/account` and `/settings/data` box needs s1-04 merged.

## Context

Read first, in this order:

- `docs/PLAN.md` F2
- `packages/web/src/` after s3-01 — the preview
- `packages/filter/src/` after s1-02 — `collect`
- `packages/agent/src/` after s2-02 — the run context, which opens the target app for a persona's device
- `docs/STACK.md` section "Target app"

## Goal

The preview draws the live target app instead of the stored fixture, on `/deliveries` and, once s1-04 lands, on `/account` and `/settings/data`, and falls back to the fixture when the app is down. So the demo shows the real page, and a persona that sees well but reads it differently, like Kai, shows something on the hero screen too.

## Interface

- In: the persona's device, the target app at its default parameters
- Out: io `GET /measure?device=desktop|mobile&page=<path>`, returning the `PageMeasurement` of that target-app page, `/deliveries` by default; the preview using it, with a page picker
- Files expected to change: `packages/io/src/**`, `packages/io/package.json`, `packages/web/**`

## Constraints

- io measures once per device and page, and keeps the result until io restarts. `page` takes only paths in the target app's `PAGES`; anything else is a 400. The browser re-perceives on every slider move; a slider move never calls io.
- io calls `collect(page, { isMobile })` with the mobile flag of the device it measures, so `/measure?device=mobile` records `isMobile: true`. A page cannot tell it is emulating a phone.
- The same `perceive` as the Actor, in the browser, given the whole persona (F2 AC3).
- Fallback (F2 AC5): with io or the target app unreachable, the stored `measurementFixture` and a visible banner saying so.

## Acceptance

- [x] `pnpm --filter @wayford/io test` includes `/measure` against the running target app returning a valid `PageMeasurement`. `packages/io/src/measure.browser.test.ts` serves the target app with `serveTargetApp()` and measures it through the real `liveMeasure` on one shared Chromium: `/deliveries` on desktop parses as `PageMeasurement` at 1280 × 720, `device=mobile` records `isMobile: true` at 412 px, `/account` and `/settings/data` are measured too, and once the target app stops a page measured before still answers from io's cache while a new one answers 502. io: 16 files, 118 tests, exit 0.
- [x] A web test with a fetch spy shows slider moves make no request. `packages/web/src/screens/preview.browser.test.ts` runs the web app on its own Vite dev server in Chromium, with an in-page `fetch` spy and a request listener. Keyboard moves on the contrast, contrast softness and seed sliders write the URL and redraw the page with no fetch and no request; opening `/account` from the page picker does fetch, so the spy is seen to work. Keying the query on the seed as a check turned the test red (`expected [ …(2) ] to have a length of 1 but got 2`).
- [x] With `pnpm dev`, the preview shows the live page, and a slider redraw stays under 500 ms (profiler screenshot in the PR). Profiler screenshot: attached to PR #155 (comment "Box 3, profiler screenshot"), the DevTools Performance panel on a trace recorded on `pnpm dev` while Playwright dragged the contrast slider twice across Vera's live `/deliveries`, about 25 ms per move, in Playwright's Chromium. It shows INP 32 ms and the dev build's `wayford:preview-redraw` measures in the Timings track; the 20 measures ran from 7.5 to 149.7 ms, the one selected 143.58 ms, each including up to 150 ms of URL-write batching. Earlier, in the browser pane on `pnpm dev`: "Live: http://localhost:5174/deliveries on desktop", then two drags and two keyboard moves logged `preview redraw` 12.7, 147.1, 77.1 and 79.2 ms (the dev build's own timing, from the first input to the commit, so up to 150 ms of URL-write batching is included), and the network panel showed no `/api/measure` after the first. The branch review's scripted run measured 7 to 159 ms over a 20-step drag and 5 key presses, with no request.
- [x] With the target app stopped, the preview shows the fixture and the banner. `preview.test.tsx` "with the live page unavailable, the stored page is drawn under a banner that says so". In the browser pane with io and web up and the target app down: the stored `/deliveries` under "The live page is unavailable: target_app_unavailable: … net::ERR_CONNECTION_REFUSED …". After starting the target app, Try again drew the live page.
- [x] Needs s1-04. The page picker shows `/account` and `/settings/data` live, and `GET /measure?page=/nowhere` answers 400. In the browser pane: Ada on `/account` and Kai on `/settings/data`, each with its "Live:" line. `curl "http://localhost:3000/measure?page=/nowhere"` answered 400 with the list of the app's pages; `routes/measure.test.ts` covers it with the other 400s.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root. Exit 0 each; 87 test files, 1313 tests.

## Out of scope

- Pages outside the target app's `PAGES`, other app parameters, real public sites.
- The emulated screenshot layer (F2 AC4): `s3-06`, week 4.
- Knowledge and attention sliders.

## Notes for the reviewer

- Move a slider while watching the network panel. Any request is a bug.

## Outcome

Built as `docs/specs/2026-10-03-s3-05-live-preview.md` describes. Where it differs from this file:

- The page picker offers the three pages named in the Goal. io accepts every path in `PAGES`.
- io waits for the page's load and fonts before `collect`, not with agent's `settle`, which agent does not export; `packages/agent/src/**` belonged to s2-10 while this ran. The target app runs no animation, so for a fresh load the two wait for the same things.
- `playwright` is now a devDependency of `@wayford/web`, for the fetch-spy test.
- On a phone (Milo), a paragraph that wraps on the page is drawn on one line and clipped: `PerceivedPage` draws every box as one line (s3-01). Left for the week 4 design pass.
