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
- Files expected to change: `packages/agent/src/**`, `packages/agent/package.json`, `pnpm-lock.yaml`, `packages/filter/src/index.ts` (one export line, see Constraints)

## Constraints

- The start URL is built by one function from the task's `startUrl` and all three target-app parameters (issue #51), and that exact URL is what `goto` receives and what the function returns. `page.url()` is never read to recover it (`packages/target-app/README.md`).
- Device (V1): the context uses real Playwright device emulation chosen from `profile.device`: viewport, touch, mobile flag and user agent.
- Vision emulation (P6): `profile.perception.emulation` is applied through CDP `Emulation.setEmulatedVisionDeficiency`. It changes screenshots and video only; nothing measured or decided may read it. A comment says so.
- Fake cursor (F5 AC7): injected with `addInitScript` so it survives navigation, drawn above the page, never focusable and hidden from the accessibility tree, so the collector does not measure it. Moving it to a point before a click is a separate call the Actor loop will make.
- Recording (F12): `recordVideo` on the context, `context.tracing` with screenshots and snapshots, a PNG per step. Every file name carries persona, seed and run id (F12 AC3). Everything is written under the output directory the caller gives; tests use a temporary directory.
- No LLM, no filter, no `RunEvent`s. This is the browser side of a run only.
- Browser tests live in files ending `.browser.test.ts`. The root `test:unit` script skips them and `pnpm test` runs them. CI installs Chromium's headless shell once s1-02 (PR #123) is merged, so `.github/workflows/ci.yml` needs no change.
- Tests start the target app themselves, with no manual `pnpm dev`. Reuse `serveTargetApp` from `packages/filter/src/serve-target-app.ts` (s1-02, PR #123), which builds the app and serves it on a free port, rather than write a second server. It is internal to filter, so export it from `@wayford/filter` with one line in its `index.ts`.

## Acceptance

- [x] `pnpm --filter @wayford/agent test` passes and includes a `.browser.test.ts` file against the running target app. 6 files, 80 tests. `packages/agent/src/run-context.browser.test.ts` has 12 tests against the target app, which `serveTargetApp` builds and serves on a free port in `beforeAll`. It passed twice in a row. `pnpm test:unit` skips it (36 files).
- [x] A test opens a run for Vera with `contrast=2&fontPx=16&targetPx=36`: the returned start URL carries all three parameters, and after load `page.url()` no longer does. The test is "Vera's start URL carries all three parameters and the loaded page drops them":
  - `startUrl` is exactly `<origin>/deliveries?contrast=2&fontPx=16&targetPx=36`, and `page.url()` is `<origin>/deliveries`.
  - The app's `sessionStorage` entry holds 2, 16 and 36, which shows `goto` received them.
  - `start-url.test.ts` (11 tests) covers the order, replaced and duplicate parameters, other query and hash, and the README's ranges.
- [x] A test opens a run for Milo and reads `isMobile` and a viewport narrower than 500 px from the page; Ada's run is desktop. The test is "Milo's run is a phone and Ada's a desktop":
  - **Milo:** `navigator.userAgentData.mobile` is true, touch points are above 0 and `innerWidth` is 412. `run.isMobile` is true, and his step PNG is 412 × 839, one CSS pixel per pixel.
  - **Ada:** `{ mobile: false, touchPoints: 0, width: 1280 }`.
- [x] A test moves the cursor to a point and reads the cursor element's box centred on that point, after a navigation too; the element has `aria-hidden="true"` and no role. The test is "the cursor centres on its point, after a navigation too, and stays out of reach":
  - The box is 24 × 24, centred on (300, 200), then on (640, 360).
  - After a navigating click, the step screenshot puts it back at the click point, and the PNG differs from the same view with the cursor hidden. A mutation that restores the cursor after the shot turns this red.
  - `aria-hidden="true"`, no `role`, no `tabindex`, not focusable, a child of `<html>`, and `document.getAnimations()` empty.
- [x] After close, the output directory holds one `webm`, one `trace.zip` and one PNG per step taken, each file name containing `vera`, the seed and the run id. The test "close leaves one webm, one trace.zip and one PNG per step, all named for persona, seed and run id" lists the directory exactly: `vera-seed7-run_vera-evidence-1-step-0.png`, `…-step-1.png`, `….trace.zip` and `….webm`. The webm is non-empty, and the trace starts with `PK`. A leftover `page@….webm` would fail it.
- [x] A screenshot of `/deliveries` for Vera (`blurredVision`) differs from the same screenshot for Ada. The test "Vera's blurred screenshot differs from Ada's, and still after a navigation" checks `/deliveries` and the archive page after a `goto`. Ada against a second Ada run is byte-equal as the control.
- [x] `pnpm exec playwright show-trace <the trace.zip>` opens the trace with the steps visible (screenshot in the PR). The viewer screenshot is attached to PR #132's description.
  - **How it was run.** `pnpm --filter @wayford/agent smoke:run` wrote the trace, and `pnpm --filter @wayford/agent exec playwright show-trace -h 127.0.0.1 -p 9323 <trace.zip>` served the viewer. The root has no `playwright` bin, and only the headless shell is installed.
  - **What it showed.** The title "Vera | seed 7 | run_smoke-1", the navigation to `/deliveries?contrast=2&fontPx=16&targetPx=36`, and both clicks, each followed by its step screenshot, in the action list and the filmstrip.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root. Lint checked 130 files with no fixes, typecheck is clean in every package, and the tests ran 39 files, 674 passed.

## Out of scope

- The Actor loop, prompts, the LLM adapter and behaviour dice. Week 3.
- Live video of any persona. Cut in `m0-08` (`docs/PLAN.md` A7, F6 AC4); the `webm` is the recording.
- Writing `RunEvent`s or `RunResult`s, or storing anything in the database.
- Measuring the page. That is s1-02.

## Notes for the reviewer

- Open the `webm`: the cursor should be visible before each click, and nothing else of ours should be.
- Check that vision emulation cannot leak into anything the filter reads. It is illustration, not decision.

## Outcome

What shipped, for the next reader. The design and every decision are in `docs/specs/2026-09-30-s2-02-evidence-capture.md`.

- **The surface**, from `@wayford/agent`:
  - `openRunContext({ browser, profile, task, seed, runId, params, outputDir })` returns a handle with these members:
    - `page`;
    - `startUrl`, exactly what `goto` received;
    - `isMobile`, for `collect(page, { isMobile })`;
    - `moveCursor(point)`;
    - `screenshot(step)`, which returns the PNG's path;
    - `close()`, which returns `{ videoPath, tracePath }`.
  - `startUrlFor(task, params)` is issue #51's start URL. It comes with `TargetAppParams`, in the README's ranges, and `TARGET_APP_DEFAULTS` (2, 16, 36).
  - `deviceContextOptions(kind)` is V1: Desktop Chrome, Galaxy Tab S4 and Pixel 7.
- **The caller owns the browser.** The In list grew a `Browser`, because s4-03 runs one browser with one context per run (F6 AC1). The Out list grew `isMobile`, because s2-03 and s3-05 must pass it to `collect` and a page cannot tell.
- **`serveTargetApp` ships as `@wayford/filter/serve-target-app`**, a subpath in filter's `package.json`, not a line in filter's `index.ts`. The user chose this at spec approval. A barrel line would make Vite, a filter devDependency, load at runtime for every importer of `@wayford/filter`, io's server included from week 3. Filter's `index.ts` is untouched.
- **File names.** They are `<label lowercased>-seed<seed>-<runId>`, plus `.webm`, `.trace.zip` or `-step-<n>.png`, flat in the output directory. The inputs are parsed with core's schemas first, so no run id, seed or label can put `/` or `..` into a path.
- **The cursor.**
  - It is a `div` under `<html>`, outside `<body>`, with `aria-hidden`, `pointer-events: none` and no transition or animation.
  - It is hidden on a new document until it is placed.
  - `screenshot` puts it back at the last point, so the post-action PNG after a navigating click shows where the click landed (F5 AC7's "screenshots").
  - Each move holds 250 ms so the webm shows it, and that counts toward B3's wall clock.
- **Vision emulation.** A CDP session is kept open for the run. Emulation changes the PNGs, the video and the trace filmstrip, not the trace's DOM snapshots. A test shows `collect` measures Vera's blurred page exactly as a bare context does.
- **A failed start.** A start that throws or answers anything but 2xx is `run_start_failed`. The context is closed and the unfinished video deleted. On the target app, a trailing slash is a 404.
- **`smoke:run`** leaves a real webm and trace for the reviewer, from two scripted clicks as Vera. Its webm was checked frame by frame: the cursor is on each link before its click, back at the click point on the next page, and nothing else of ours is drawn.
- **Follow-ups:**
  - **s2-03:**
    - check `document.fonts.check('16px "Inter"')` where it measures;
    - build `startUrl` with `startUrlFor` for a failed start;
    - call `screenshot` after the action, once its navigation, if any, has loaded: putting the cursor back evaluates in the page, and that throws while a document is being replaced (cold review);
    - expect 250 ms per cursor move on the B3 clock.
  - **Whoever builds PLAN A16's screenshot input:** take an unemulated shot, never the step PNG, which is emulated.
  - **s4-03:** encode non-ASCII persona labels in download headers.
  - **Week 4:** make `params` optional for a site that is not ours.
