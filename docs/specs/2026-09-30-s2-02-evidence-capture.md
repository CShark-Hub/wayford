# s2-02 — Run context and evidence capture: spec

Task: `tasks/s2-02-evidence-capture.md` · Branch: `feature/s2-02-evidence-capture` · Date: 2026-09-30
Status: approved 2026-09-30

## Goal

One call, `openRunContext`, opens a Playwright context for a persona, a task and a seed on the target app. The context has the persona's device, its vision emulation, a fake cursor and every recording running. Closing it leaves one `webm`, one `trace.zip` and one PNG per step on disk, named for persona, seed and run id. The Actor loop in week 3 then only has to decide what to click.

## Constraints that bind

- **Start URL** (issue #51, `packages/target-app/README.md` "Parameters"): one function builds it from `task.startUrl` and all three target-app parameters. `goto` receives exactly that URL, and the function returns it. `page.url()` is never read to recover it.
- **V1 device** (`docs/RULES.md`): real Playwright device emulation from `profile.device`, covering viewport, touch, the mobile flag and user agent.
- **P6 vision emulation**: `profile.perception.emulation` goes through CDP `Emulation.setEmulatedVisionDeficiency`. It changes screenshots and video only. "Nothing measured or decided may read it", and a comment says so.
- **F5 AC7 fake cursor**: `addInitScript`, so it survives navigation. It is drawn above the page, never focusable, and hidden from the accessibility tree, "so the collector does not measure it". Moving it is a separate call. PLAN F5 AC7 says it "appears in video and screenshots".
- **F12 recording**: `recordVideo`, `context.tracing` with screenshots and snapshots, and a PNG per step. Every file name carries persona, seed and run id (AC3). Everything goes under the caller's output directory.
- **Scope**: "No LLM, no filter, no `RunEvent`s. This is the browser side of a run only." Out of scope: the Actor loop, live video, `RunEvent`/`RunResult`/database, and measuring the page.
- **Browser tests** live in `*.browser.test.ts`, start the target app themselves and reuse `serveTargetApp` from s1-02.
- **Repo rules**:
  - agent imports core and filter only (`docs/STACK.md`).
  - No dependency without a `docs/STACK.md` line. Playwright already has one (`Browser`, and the "Recording and evidence" rows).
  - One error class, `WayfordError`, thrown at boundaries (`docs/CONVENTIONS.md`).
  - Barrel lines are alphabetical and nothing else goes in `index.ts`.
  - `Date.now()` never decides anything.

## Design

Four modules in `packages/agent/src/`, one feature each, plus a dev script. They reuse `Profile`, `Task`, `Seed`, `RunId`, `StepIndex`, `DeviceKind` and `WayfordError` from core. `StepIndex` is a schema with no exported type, so the handle takes a `number` and parses it. Playwright 1.63.0 becomes a runtime dependency of agent, the same version filter resolves, so CI's single `playwright install` serves both.

### `start-url.ts`: the start URL (issue #51)

```ts
/** The target app's three query parameters, in the ranges of its README's Parameters table. */
export const TargetAppParams = z.object({
  contrast: z.number().min(1).max(21),   // z.number() already rejects NaN and ±Infinity in zod 4
  fontPx: z.number().min(6).max(72),
  targetPx: z.number().min(8).max(96),
}).strict();
export type TargetAppParams = z.infer<typeof TargetAppParams>;

/** The README's defaults, which the calibration table in docs/RULES.md is written against. */
export const TARGET_APP_DEFAULTS = { contrast: 2, fontPx: 16, targetPx: 36 } as const satisfies TargetAppParams;

/** `task.startUrl` with all three parameters, last and in this order: the URL `goto` receives and the run records. */
export function startUrlFor(task: Pick<Task, "startUrl">, params: TargetAppParams): string;
```

`new URL(task.startUrl)`. Delete `contrast`, `fontPx` and `targetPx` from `searchParams`, append them in that order, and return `href`.

- A parameter already on the task's URL is replaced, and duplicates go too.
- Any other query parameter and the hash are kept. `URLSearchParams` may re-encode the rest of the query, for example `%20` as `+`.
- `http://localhost:5174/` with the defaults gives `http://localhost:5174/?contrast=2&fontPx=16&targetPx=36`. That is the task's acceptance URL, and `docs/STACK.md`'s example uses the same shape with `contrast=3`.
- Parameters that fail `TargetAppParams` throw `WayfordError("invalid_target_app_params")`. The app would clamp them silently, and then the recorded URL would no longer be the whole setting.
- `openRunContext` validates its parameters through this function, so a bad value gets that one code on either path.

`TARGET_APP_DEFAULTS` is here because three week 3 tasks need 2, 16 and 36 on the same Monday: s2-03's `run:one` and the Vera box, s3-05's `/measure`, and s3-03's runs. This PR's tests and smoke script need them too. One constant, citing the README, means nobody writes a second one.

### `device.ts`: V1

```ts
const DEVICES = { desktop: "Desktop Chrome", tablet: "Galaxy Tab S4", mobile: "Pixel 7" } as const satisfies Record<DeviceKind, string>;
export type DeviceContextOptions = Omit<(typeof devices)[string], "defaultBrowserType">;
/** The Playwright descriptor for a device kind: viewport, screen when it has one, user agent, scale, isMobile, hasTouch. */
export function deviceContextOptions(kind: DeviceKind): DeviceContextOptions;
```

All three are Chromium descriptors, since vision emulation is CDP. Their values in Playwright 1.63:

| Kind | Descriptor | Viewport | DPR | isMobile | hasTouch |
|---|---|---|---|---|---|
| desktop | Desktop Chrome | 1280×720 | 1 | false | false |
| tablet | Galaxy Tab S4 | 712×1138 | 2.25 | true | true |
| mobile | Pixel 7 | 412×839 | 2.625 | true | true |

It is exported so that s3-05, which emulates a device without a run, reuses V1 instead of writing a second copy. `device.test.ts` checks one invariant: every `DeviceKind` maps to a descriptor whose `defaultBrowserType` is `chromium`. The Milo and Ada browser test proves the mapping end to end.

### `cursor.ts`: the fake cursor (F5 AC7)

The in-page code is one typed function, `cursorScript(point: { x: number; y: number } | null)`. Its file carries `/// <reference lib="dom" />`. Every call wraps the function's source with a `__name` shim, the pattern `pageSource` in `packages/filter/src/measure-page.ts` uses: tsx's `keepNames` would otherwise inject `__name(...)` calls, which do not exist in the page, and vitest never shows it.

- `installCursor(context)` registers it with `context.addInitScript({ content })` and no point. It runs before the page's own scripts, on every navigation.
  - At that moment `document.documentElement` is still null (probe), so the script appends the element on `DOMContentLoaded`.
  - It appends to `<html>`, outside `<body>`. The collector walks `body *` only (`measure-page.ts:336`) and skips `aria-hidden` subtrees (`:140`).
- The element is a `div` marked `data-wayford-cursor`. It has no `id`, because `getElementById` resolves `aria-labelledby` referents in the collector (`:216`).
  - It carries `aria-hidden="true"`, no role and no `tabindex`.
  - Styles are inline and `!important`: `position: fixed`, `pointer-events: none`, `z-index: 2147483647`, a 24 px border-box circle, and a translucent red fill with a white ring and a dark hairline, so it shows on any background.
  - It has no `transition` and no `animation`. s2-03 settles the page on `document.getAnimations()` being empty, over the whole document, so a moving or pulsing cursor would never let a page settle.
  - Its `left`/`top` put the box centre exactly on the point.
  - It starts as `display: none` on a new document until it is placed.
- `showCursor(page, point)` evaluates the same function with the point. It re-creates the element if it is missing, so it works on a page where the init script did not run, such as `about:blank`.

### `run-context.ts`: `openRunContext`

```ts
export interface RunContextOptions {
  /** Chromium, owned by the caller: one browser, one context per run (F6 AC1, s4-03). */
  browser: Browser;
  profile: Profile;
  task: Task;
  seed: Seed;
  runId: RunId;
  params: TargetAppParams;
  outputDir: string;
}
export interface RunContext {
  readonly page: Page;
  /** Exactly the URL `goto` received (`startUrlFor`), for `runStarted` and `RunResult`. Never `page.url()`. */
  readonly startUrl: string;
  /** The device's mobile flag, for `collect(page, { isMobile })` (s2-03): a page cannot tell. */
  readonly isMobile: boolean;
  /** Moves the fake cursor to a viewport point and holds it there. Call it before a click, at the click's point. */
  moveCursor(point: { x: number; y: number }): Promise<void>;
  /** A viewport PNG of the page now, taken after step `step`'s action (core's post-action screenshot). Returns its path. */
  screenshot(step: number): Promise<string>;
  /** Stops the trace, closes the context, names the video. */
  close(): Promise<RunRecording>;
}
export interface RunRecording { videoPath: string; tracePath: string }
export function openRunContext(options: RunContextOptions): Promise<RunContext>;
```

Data flow of `openRunContext`:

1. **Validate.** `startUrl = startUrlFor(task, params)` checks the parameters. Everything else except `browser` is parsed with core's `Profile`, `Task`, `Seed` and `RunId`, plus a non-empty `outputDir`. A failure throws `WayfordError("invalid_run_context")`.
   - This parse is what keeps `/`, `\`, `..` and spaces out of the file names, and a comment says so. The TypeScript types are plain strings and numbers.
   - What the schemas allow: a run id is `run_` then `[a-z0-9-]`, a seed is a uint32, and a label is one capitalised word of Unicode letters. So a name can hold `ë` (s4-03 encodes it for download).
2. **Names.** `stem = <label lowercased>-seed<seed>-<runId>`, for example `vera-seed7-run_vera-evidence-1`. From it come the file names `<stem>.webm`, `<stem>.trace.zip` and `<stem>-step-<n>.png`. `n` is unpadded, like the `step-0.png` of core's fixtures. Paths are `join(outputDir, name)`, so the caller's relative or absolute form is kept. `mkdir(outputDir, { recursive: true })`.
3. **Context.** `browser.newContext({ ...deviceContextOptions(profile.device), recordVideo: { dir: outputDir, size: viewport } })`. The size is the viewport, since Playwright's default scales the video down to fit 800×800.
4. `installCursor(context)`.
5. `context.tracing.start({ screenshots: true, snapshots: true, title: "Vera | seed 7 | run_…" })`, before the page exists, so `newPage` and `goto` are in the trace. The title follows the run header of F7 AC4.
6. `page = context.newPage()`.
7. **P6.** `cdp = context.newCDPSession(page)`, then `Emulation.setEmulatedVisionDeficiency({ type: profile.perception.emulation })`. `none` is sent too, so there is one code path.
   - The session stays open for the run: detaching it clears the emulation (probe).
   - The emulation is per page and survives navigation, including cross-origin (probe).
   - The comment states P6 in full. The emulation is illustration in the step PNGs, the video and the trace filmstrip. `collect` reads computed styles and boxes, which the emulation does not change (probe: identical measurements). The emulated PNGs and video are evidence for people. They must never become the Actor's or the Analyst's image input: PLAN A16's screenshot flag has to take an unemulated shot. That goes to whoever builds A16 as a follow-up.
8. **Start.** `response = page.goto(startUrl)`, which waits for `load`. A response that is not `ok()` is a failed start. On the target app, a trailing slash answers 404 with an empty body, and a run on that blank page would read as "the persona could not find it" when the start itself was broken.
9. **Failure.** If any step from 3 on throws or the start is not OK: close the context, delete the unfinished video, and throw `WayfordError("run_start_failed", …, { cause })`. The output directory keeps no half-written `webm`. s2-03 then has no handle, and builds `runStarted`/`runFailed`'s `startUrl` with `startUrlFor` itself.

The handle:

- **`moveCursor(point)`**: `showCursor(page, point)`, remember the point, then hold `CURSOR_HOLD_MS = 250`.
  - The hold is there so the webm shows the cursor for about six frames at Playwright's 25 fps before the click lands.
  - It is no seeded decision. It adds 250 ms per move to the run's wall clock, which B3 budgets and `durationMs` measures, the same for every persona and seed. s2-03 is told.
- **`screenshot(step)`**:
  1. `StepIndex` parses the step, and a failure throws `WayfordError("invalid_step")`.
  2. If a point was remembered, `showCursor` puts the cursor back there, because a navigating click replaced the document and its cursor.
  3. `page.screenshot({ path, scale: "css" })` of the viewport only.

  So the post-action PNG shows the pointer where the action landed, as a real pointer would stay, and F5 AC7's "screenshots" holds for navigating clicks too. `scale: "css"` makes a PNG pixel a CSS pixel: Milo's PNG is 412×839, not 1082×2202, and it lines up with the measurement's boxes. Trace steps need no group: the viewer lists each action, including every screenshot with its `…-step-<n>.png` path. s2-03 owns step boundaries and may add groups.
- **`close()`**:
  1. `tracing.stop({ path: tracePath })` in a `try`.
  2. `context.close()`, `video.saveAs(videoPath)` and `video.delete()` of Playwright's `page@<guid>.webm` in its `finally`. So a failed trace stop still closes the context and names the video, and then close rejects.
  3. It returns `{ videoPath, tracePath }`.

  After a crash mid-step, close works as usual. If the browser itself is gone, close rejects, and s2-03 emits `runFailed` without paths, which core allows (`run.ts:470-471`, both optional).

What stays out of the run context:

- No filter import. Only dev tooling and tests import filter: the test server and, in a test, `collect`.
- No font check.
- No `RunEvent`.

### `smoke-run.ts`: a recording the reviewer can open

`pnpm --filter @wayford/agent smoke:run [dir]` runs `tsx src/smoke-run.ts`. It does this:

1. Serves the target app and launches Chromium's headless shell.
2. Opens a run for Vera on `/deliveries` at `TARGET_APP_DEFAULTS`, seed 7.
3. Takes two steps, each moving the cursor to a link's centre, clicking with `page.mouse` at that point, and screenshotting:
   - step 0: the "Your account" nav link;
   - step 1: the delivery address link on `/account`.
4. Closes, and prints the paths.

It writes to a fresh temporary directory unless one is given. Its order is core's (move, act, post-action screenshot), since it is the one worked example of the handle. It is the source of the `webm` the reviewer notes ask to open, and of the `trace.zip` for `playwright show-trace`. It is dev tooling like `smoke:llm`, not an Actor loop.

### Serving the target app in agent's tests

`serveTargetApp` builds and serves the app with Vite, which is a devDependency of filter. With one line in filter's `index.ts`, as the task says, Vite would become a runtime import of filter's main entry:

- Every importer of `@wayford/filter` would load it: agent from s2-03 on, and io's server with it.
- It costs roughly 100 to 200 ms, depending on the machine.
- It undoes, for Vite, what `collect.ts`'s type-only Playwright import does on purpose: no devDependency loads through the main entry.

So this spec exposes it as a subpath instead: `"./serve-target-app": "./src/serve-target-app.ts"` in filter's `package.json` `exports`, next to `./perceive`.

- The precedents are `@wayford/agent/fake` and `@wayford/core/fixtures`, both test support kept out of the main entry (s2-01 spec, "Where the fake ships").
- Lint already allows filter subpaths in agent and io (`biome.json`, their overrides), and web stays banned from everything but `/perceive`.
- s3-05's io test will need the same helper.
- Filter's `index.ts` is untouched. This is a deviation from the task's file list: see decision 1.

## Files

| File | Why |
|---|---|
| `packages/agent/src/start-url.ts`, `start-url.test.ts` | `TargetAppParams`, `TARGET_APP_DEFAULTS`, `startUrlFor`, unit tests. |
| `packages/agent/src/device.ts`, `device.test.ts` | V1 mapping, and the one Chromium invariant. |
| `packages/agent/src/cursor.ts` | The in-page cursor, `installCursor`, `showCursor`. Tested in the browser file. |
| `packages/agent/src/run-context.ts` | `openRunContext`, `RunContext`, `RunRecording`. |
| `packages/agent/src/run-context.browser.test.ts` | The browser tests against the served target app. |
| `packages/agent/src/smoke-run.ts` | The reviewer's recording. |
| `packages/agent/src/index.ts` | Three barrel lines: `device`, `run-context`, `start-url`. `cursor` stays internal. |
| `packages/agent/package.json` | `playwright` `^1.63.0` in `dependencies`, and the `smoke:run` script. |
| `pnpm-lock.yaml` | agent's new `playwright` entry, resolving to the existing 1.63.0. |
| `packages/filter/package.json` | Outside the task's list, in place of `packages/filter/src/index.ts`: the `./serve-target-app` export (decision 1). |

No change to core, io, web, CI, `docs/STACK.md` or `docs/RULES.md`.

## Acceptance mapping

| Acceptance box | Proven by |
|---|---|
| `pnpm --filter @wayford/agent test` passes and includes a `.browser.test.ts` against the running target app | `run-context.browser.test.ts`, with `serveTargetApp` in `beforeAll` |
| Vera with `contrast=2&fontPx=16&targetPx=36`: the start URL carries all three, and after load `page.url()` does not | test "Vera's start URL carries all three parameters and the loaded page drops them"; `start-url.test.ts` for order, replacement, duplicates and ranges |
| Milo reads `isMobile` and a viewport under 500 px from the page; Ada is desktop | test "Milo's run is a phone and Ada's a desktop": in the page, `navigator.userAgentData.mobile`, `maxTouchPoints` and `innerWidth`, plus `run.isMobile` |
| Cursor box centred on the point, after a navigation too; `aria-hidden="true"`, no role | test "the cursor centres on its point, after a navigation too, and stays out of reach". It checks the box centre, `aria-hidden`, no `role`, not focusable, its parent being `<html>`, and `document.getAnimations()` empty after a move. After a navigating click, the next `screenshot` puts the cursor back at the click point |
| After close: one `webm`, one `trace.zip`, one PNG per step, each name with `vera`, the seed and the run id | test "close leaves one webm, one trace.zip and one PNG per step, all named for persona, seed and run id". It lists the directory exactly, so a leftover `page@….webm` fails it |
| Vera's `/deliveries` screenshot differs from Ada's | test "Vera's blurred screenshot differs from Ada's, and still after a navigation", with Ada against Ada byte-equal as the control |
| `pnpm exec playwright show-trace <trace.zip>` shows the steps (screenshot in the PR) | manual: `pnpm --filter @wayford/agent smoke:run`, then `pnpm --filter @wayford/agent exec playwright show-trace -p <port> <trace.zip>`. Only the headless shell is installed, so the viewer is served on a port and opened in a browser. Both clicks and both step screenshots are visible |
| `pnpm lint`, `pnpm typecheck`, `pnpm test` pass | the commands |

Beyond the boxes, each test claiming only what it proves:

- "the vision emulation does not reach the measurement": `collect` on Vera's `blurredVision` run page JSON-equals `collect` on a bare Desktop Chrome context at the same URL. That guards P6 against a future pixel-reading collector. The cursor is parked on "Order archive" during it, which would catch a future hit-test that ignores `pointer-events`. The cursor's own guard is the attribute and placement checks above, because today's collector would skip a role-less `div` anywhere.
- "a click at the cursor's point lands on the element under it": park the cursor on a link, `page.mouse.click` at the same point, assert the navigation. It ended up as `clickArchive`, the helper the cursor and close tests share, which fails in `waitForURL` if the click does not pass through; its own test was cut as redundant in the CI review (build).
- "a start that answers 404 throws `run_start_failed` and leaves no video": a start URL with a trailing slash.

The webm check from the reviewer notes is manual, on the `smoke:run` output.

## Decision log

| # | Question | Taken | Why |
|---|---|---|---|
| 1 | How agent's tests reach `serveTargetApp` | A `./serve-target-app` subpath export in filter's `package.json`, not a barrel line | A barrel line makes Vite, a devDependency, a runtime import of filter's main entry for agent and io. Test support stays out of main entries (`@wayford/agent/fake`, `@wayford/core/fixtures`). This deviates from the task's file list; the user chose the subpath at gate 1. |
| 2 | Who owns the browser | The caller passes a `Browser` | s4-03 runs "one browser, one context per run", and F6 AC1 says the same. Tests share one browser the way filter's do. Launching one per run would make s4-03 undo it. |
| 3 | Return the mobile flag? | Yes, `isMobile` on the handle | s2-03 and s3-05 must pass it to `collect`, and the page cannot tell. |
| 4 | Descriptors | Desktop Chrome, Galaxy Tab S4, Pixel 7 | All Chromium, for CDP and Chrome user agents. Pixel 7 is 412 px wide, a current phone. The Tab S4's 712 px keeps a tablet out of the target app's collapsed nav (≤ 640 px), so it stays distinct from a phone; the S9's 640 px would not. |
| 5 | File names | `<label lowercased>-seed<seed>-<runId>` plus `.webm`, `.trace.zip`, `-step-<n>.png`, flat in `outputDir` | F12 AC3 wants all three in every name. The label is what F7's header shows, and `seed` names the bare number. s2-03 passes `runs/<run id>/` as the directory. |
| 6 | Path form returned | `join(outputDir, name)` | The caller picks relative or absolute. Normalising for storage is s2-03's and s4-03's job. |
| 7 | Naming the video | `recordVideo.dir = outputDir`; after close, `saveAs` then `delete` | Playwright has no file-name option. `saveAs` after close is the documented path (probe verified). |
| 8 | Vision emulation | A CDP session kept open for the run, set before `goto`, `none` sent too | Detach clears it (probe). One code path for every persona. |
| 9 | Cursor placement | Child of `<html>` on `DOMContentLoaded`, `data-` attribute, no `id` | Outside `body *` and `aria-hidden`. No `id`, so it cannot collide with a labelledby referent. |
| 10 | Cursor after a navigation | The handle remembers the last point, and `screenshot` puts the cursor back before the shot | A navigating click replaces the document, and the post-action PNG would show no cursor, against F5 AC7's "screenshots". A real pointer stays where it clicked. The init script cannot know the point, so the handle does it at the shot, deterministically, rather than racing a load event. |
| 11 | Holding the cursor | 250 ms in Node after the move, no in-page frame wait | A click right after the move could come before a video frame shows it. Six frames at 25 fps cover paint. An in-page `requestAnimationFrame` wait adds a hang path (`evaluate` has no timeout) for nothing. |
| 12 | In-page code | A typed function with a DOM lib reference and a `__name` shim | filter's `pageSource` pattern, because tsx `keepNames` breaks nested names in the page. The lib reference accepts, one task early, the cost `docs/STACK.md` describes for agent once it imports `collect`: agent's Node files stop failing on browser globals. The browser test's `collect` import brings it in anyway. |
| 13 | Screenshot | Viewport only, `scale: "css"`, no trace group | What is on screen is what the persona sees (RULES stage 1). CSS scale lines up with the boxes. A group around the shot alone would misstate what a step is, and it would nest under s2-03's own step groups. |
| 14 | Parameter validation | The README's ranges, one code `invalid_target_app_params` on either path | An out-of-range value is clamped by the app, and the recorded URL would lie. |
| 15 | Input validation | Core schemas at the boundary, and `StepIndex` in `screenshot` | Run id, seed, label and step reach file paths, so no traversal through them. |
| 16 | Font check (`document.fonts.check('16px "Inter"')`) | Not in the run context; the tests do it | It belongs to whoever measures (s2-03), and it would fail the week 4 public-site run, which has no Inter. A follow-up for s2-03. |
| 17 | Default parameters | `TARGET_APP_DEFAULTS` next to the schema | s2-03, s3-05 and s3-03 need them in parallel next week, and this PR's tests do too. One constant, citing the README. |
| 18 | `smoke:run` script | Added, in core's step order | The reviewer notes need a real `webm` and `trace.zip`, and the tests delete theirs. As the one worked example, it has to show the post-action order. |
| 19 | `collect` in a test | Allowed | "No filter" is about the run context itself. The test uses the filter to show the emulation does not reach it. |
| 20 | Failure paths | Open cleans up and throws `run_start_failed`, a non-OK response included. Close closes and names the video in a `finally`, and is not memoised | s2-03 closes once, in its `finally`. A dead browser makes close reject, and `runFailed`'s paths are optional. |
| 21 | Optional parameters for a site that is not ours | Not now | A5's public-site run is week 4. `params` stays required here, and a follow-up makes it optional there. |

## Risks

- **Two Playwright versions.** If pnpm resolves agent's `^1.63.0` to a newer 1.x, CI installs the browser for filter's version only, and agent's tests fail to launch. Check: a single `playwright@1.63.0` entry in `pnpm-lock.yaml` after install.
- **ffmpeg on CI.** Video needs Playwright's bundled ffmpeg. `--only-shell chromium` installs it (the local dry-run lists it), but CI has not recorded a video yet. The first CI run on the PR tells.
- **A second page.** A popup or new tab gets the cursor, since the init script is on the context, but not the vision emulation, which is per page. It would also leave a second video. The target app opens none, so the loop that clicks (s2-03) owns that case.
- **Load.** Browser test files in filter and agent run in parallel, each with its own Chromium and target-app build.
  - Hooks get 60 s, as filter's do.
  - Tests get 30 s, set once for the file with `vi.setConfig` (build, simplify pass: a per-test argument broke every test into a five-line layout). That is new here: recording, encoding and saving a video take longer than filter's measuring tests, which run on the 5 s default.
- **The emulation reaches the cursor too.** In Vera's video and PNGs the cursor is blurred with the page, since it is drawn in the page. That is expected and noted for the reviewer.
- **Absolute paths in traces.** The trace records the calling script's absolute path in its stacks. A trace from a developer's machine names their home directory. Low; worth noting when traces are shared.

## Follow-ups (for the PR body)

- **s2-03:**
  - the font check;
  - `startUrlFor` for a failed start;
  - the 250 ms per cursor move on the B3 clock;
  - calling `screenshot` after the action, so its PNG is the post-action one.
- **Whoever builds PLAN A16's screenshot input:** take an unemulated shot, never the step PNG.
- **s4-03:** encode non-ASCII persona labels in download headers.
- **Week 4:** optional `params` for the public-site run.

## Review note

Three reviewers ran on the first draft: `spec-reviewer`, a fact-check lens and a consumer-fit lens. None found a blocker, and all three said "approve with changes". Changes made:

- **Interface:**
  - `screenshot(step: number)` parsed with `StepIndex`, since core exports no `StepIndex` type.
  - `DeviceContextOptions` defined.
  - `TARGET_APP_DEFAULTS` added.
  - One error code for bad parameters.
- **Cursor:**
  - It returns to the last point before each screenshot, so a post-action PNG after a navigating click shows it (F5 AC7).
  - No transition and no animation, so s2-03's settle check is unaffected, with a `getAnimations()` assertion.
  - The in-page animation-frame wait was cut (hang path). The hold is now described as wall-clock that B3 budgets.
- **Start:** a non-OK `goto` response is a failed start (404 on a trailing slash).
- **Start URL:** delete-then-append keeps the promised order. The re-encoding of other parameters is stated.
- **P6:** the comment now also rules out the emulated PNGs as model input (A16).
- **Cut:**
  - the trace group;
  - the memoised close and its second-close assertion;
  - the `ariaSnapshot` check, which could not fail;
  - `device.test.ts`, down to the Chromium invariant.
- **Tests:**
  - A real click-through assertion replaces "proven by `pointer-events: none`".
  - The collect-equality test now claims only what it proves.
- **Smoke script:** reordered to move, click, then the post-action screenshot. The link is named "Your account".
- **Facts corrected:**
  - Filter sets no per-test timeouts.
  - STACK's example uses `contrast=3`.
  - zod 4 rejects NaN and ±Infinity in `z.number()` itself.
  - The real id and label patterns (Unicode letters).
  - The DOM lib is not in agent's program yet.
  - `serveTargetApp` imports Vite, not Playwright.
  - s2-01's reason for `./fake`.
  - The Tab S4 has no `screen`.

Rejected: none.
