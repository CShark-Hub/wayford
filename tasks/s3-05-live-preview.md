# s3-05 — Live preview on the target app

Stream: s3
Milestone: week 3
Size: S
Depends on: s1-02, s2-02, s3-01

## Context

Read first, in this order:

- `docs/PLAN.md` F2
- `packages/web/src/` after s3-01 — the preview
- `packages/filter/src/` after s1-02 — `collect`
- `packages/agent/src/` after s2-02 — the run context, which opens the target app for a persona's device
- `docs/STACK.md` section "Target app"

## Goal

The preview draws the live `/deliveries` of the running target app instead of the stored fixture, and falls back to the fixture when the app is down, so what the demo shows is the real page.

## Interface

- In: the persona's device, the target app at its default parameters
- Out: io `GET /measure?device=desktop|mobile`, returning the `PageMeasurement` of `/deliveries`; the preview using it
- Files expected to change: `packages/io/src/**`, `packages/io/package.json`, `packages/web/**`

## Constraints

- io measures once per device and keeps the result until io restarts. The browser re-perceives on every slider move; a slider move never calls io.
- io calls `collect(page, { isMobile })` with the mobile flag of the device it measures, so `/measure?device=mobile` records `isMobile: true`. A page cannot tell it is emulating a phone.
- The same `perceive` as the Actor, in the browser (F2 AC3).
- Fallback (F2 AC5): with io or the target app unreachable, the stored `measurementFixture` and a visible banner saying so.

## Acceptance

- [ ] `pnpm --filter @wayford/io test` includes `/measure` against the running target app returning a valid `PageMeasurement`
- [ ] A web test with a fetch spy shows slider moves make no request
- [ ] With `pnpm dev`, the preview shows the live page, and a slider redraw stays under 500 ms (profiler screenshot in the PR)
- [ ] With the target app stopped, the preview shows the fixture and the banner
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Other pages than `/deliveries`, other app parameters, real public sites.
- The emulated screenshot layer (F2 AC4). Optional; week 4 if time allows.
- Knowledge and attention sliders.

## Notes for the reviewer

- Move a slider while watching the network panel. Any request is a bug.
