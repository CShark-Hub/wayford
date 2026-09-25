# s2-02 — Run context and evidence capture

Stream: s2
Milestone: week 2
Size: L
Depends on: none beyond week 1

## Context

Read first, in this order:

- `docs/PLAN.md` F5 AC3 and AC7, F12, and rule V1 in `docs/RULES.md`
- `docs/STACK.md` sections "Recording and evidence" and "Target app"
- `packages/target-app/README.md` section "Parameters" — how a run must open the app
- `packages/core/src/profile.ts` and `packages/core/src/task.ts` — what a run is opened for
- Issue #51 on `CShark-Hub/promptozaury` — the start-URL helper this task provides

## Goal

One call opens a browser context set up for a persona, a task and a seed on the target app, with a fake cursor and every recording in place, and closing it leaves a `webm`, a `trace.zip` and a screenshot per step on disk, so the Actor loop in week 3 only has to decide what to click.

## Interface

- In: `Profile`, `Task` and `Seed` from `@wayford/core`, a run id, the three target-app parameters, an output directory
- Out, from `@wayford/agent`: a function that opens the run context and returns the page, the exact start URL it navigated to, a cursor it can move before a click, a per-step screenshot function, and a close function that returns the video and trace paths
- Files expected to change: `packages/agent/src/**`, `packages/agent/package.json`, `pnpm-lock.yaml`, root `package.json` (`test:unit`, if missing), `.github/workflows/ci.yml` only if it exists

## Constraints

- The start URL is built by one function from the task's `startUrl` and all three target-app parameters (issue #51), and that exact URL is what `goto` receives and what the function returns. `page.url()` is never read to recover it (`packages/target-app/README.md`).
- Device (V1): the context uses real Playwright device emulation chosen from `profile.device`: viewport, touch, mobile flag and user agent.
- Vision emulation (P6): `profile.perception.emulation` is applied through CDP `Emulation.setEmulatedVisionDeficiency`. It changes screenshots and video only; nothing measured or decided may read it. A comment says so.
- Fake cursor (F5 AC7): injected with `addInitScript` so it survives navigation, drawn above the page, never focusable and hidden from the accessibility tree, so the collector does not measure it. Moving it to a point before a click is a separate call the Actor loop will make.
- Recording (F12): `recordVideo` on the context, `context.tracing` with screenshots and snapshots, a PNG per step. Every file name carries persona, seed and run id (F12 AC3). Everything is written under the output directory the caller gives; tests use a temporary directory.
- No LLM, no filter, no `RunEvent`s. This is the browser side of a run only.
- Browser tests live in files ending `.browser.test.ts`. If the root `package.json` has no `test:unit` yet, add `"test:unit": "vitest run --exclude \"**/*.browser.test.ts\""`; s1-02 adds the same line, so whichever lands second keeps it as it is. If `.github/workflows/ci.yml` exists by then (issue #28), install Chromium there.
- Tests start the target app themselves, with no manual `pnpm dev`.

## Acceptance

- [ ] `pnpm --filter @wayford/agent test` passes and includes a `.browser.test.ts` file against the running target app
- [ ] A test opens a run for Vera with `contrast=2&fontPx=16&targetPx=36`: the returned start URL carries all three parameters, and after load `page.url()` no longer does
- [ ] A test opens a run for Milo and reads `isMobile` and a viewport narrower than 500 px from the page; Ada's run is desktop
- [ ] A test moves the cursor to a point and reads the cursor element's box centred on that point, after a navigation too; the element has `aria-hidden="true"` and no role
- [ ] After close, the output directory holds one `webm`, one `trace.zip` and one PNG per step taken, each file name containing `vera`, the seed and the run id
- [ ] A screenshot of `/deliveries` for Vera (`blurredVision`) differs from the same screenshot for Ada
- [ ] `pnpm exec playwright show-trace <the trace.zip>` opens the trace with the steps visible (screenshot in the PR)
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- The Actor loop, prompts, the LLM adapter and behaviour dice. Week 3.
- Live video of any persona. Cut in `m0-08` (`docs/PLAN.md` A7, F6 AC4); the `webm` is the recording.
- Writing `RunEvent`s or `RunResult`s, or storing anything in the database.
- Measuring the page. That is s1-02.

## Notes for the reviewer

- Open the `webm`: the cursor should be visible before each click, and nothing else of ours should be.
- Check that vision emulation cannot leak into anything the filter reads. It is illustration, not decision.
