# s2-02 — Run context and evidence capture: plan

Spec: `docs/specs/2026-09-30-s2-02-evidence-capture.md`
Status: approved 2026-09-30

| # | Step | Files | Serves box | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | Dependencies and the filter subpath | `packages/agent/package.json`, `packages/filter/package.json`, `pnpm-lock.yaml` | prerequisite for all | none (no behaviour) | `pnpm install` is clean; `pnpm-workspace.yaml` is unchanged; the lock has one `playwright@1.63.0` entry and no other `playwright@`; `pnpm --filter @wayford/agent exec playwright --version` prints 1.63.0; `pnpm typecheck` passes | none: the only step that touches the lockfile |
| 2 | Start URL | `packages/agent/src/start-url.ts`, `start-url.test.ts` | Vera start-URL box (unit half) | default URL is `…/?contrast=2&fontPx=16&targetPx=36`; the path is kept (`/deliveries`); existing and duplicate parameters are replaced and land last in order; other query and hash are kept; out-of-range, NaN and Infinity throw `invalid_target_app_params`; `TARGET_APP_DEFAULTS` parses | `pnpm exec vitest run packages/agent/src/start-url.test.ts` is green | 3 |
| 3 | Device mapping | `packages/agent/src/device.ts`, `device.test.ts` | Milo/Ada box (unit half) | every `DeviceKind` maps to a descriptor whose `defaultBrowserType` is `chromium`, and the returned options carry no `defaultBrowserType` | `pnpm exec vitest run packages/agent/src/device.test.ts` is green | 2 |
| 4 | Cursor and run context | `packages/agent/src/cursor.ts`, `run-context.ts`, `run-context.browser.test.ts` | all browser boxes | every browser test in the spec's acceptance mapping, plus its three extras. Written first and red, because `run-context.ts` does not exist yet | `pnpm exec vitest run packages/agent/src/run-context.browser.test.ts` is green, twice in a row | none: needs 2 and 3 |
| 5 | Barrel and smoke script | `packages/agent/src/index.ts`, `packages/agent/src/smoke-run.ts` | show-trace box, reviewer's webm check | none (a barrel and a manual script) | `index.ts` holds exactly five `export *` lines in alphabetical order (`device`, `llm`, `llm-settings`, `run-context`, `start-url`); `pnpm --filter @wayford/agent smoke:run` prints a `webm`, a `trace.zip` and two PNG paths that exist; typecheck passes | none: after 4 |
| 6 | Manual checks | none | show-trace box, reviewer notes | none | `show-trace -p <port>` on the smoke trace, opened in the browser pane: both clicks and both step screenshots visible, with a screenshot saved for the PR. The webm, played in the browser pane: the cursor visible before each click and nothing else of ours | none: after 5 |
| 7 | Verify | the task file (ticks, Outcome) | every box | none | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @wayford/agent test`, all green; the boxes ticked with evidence | none: last |

## Notes

**Step 1.**
- Add `"playwright": "^1.63.0"` to agent's `dependencies`, the range filter uses, and `"smoke:run": "tsx src/smoke-run.ts"` to its scripts.
- Add `"./serve-target-app": "./src/serve-target-app.ts"` to filter's `exports`, after `./perceive`.
- If pnpm resolves a newer 1.x, or writes a `minimumReleaseAgeExclude` into `pnpm-workspace.yaml`, revert and pin to what filter locks. Do not keep a second Playwright or an exclusion.

**Step 4.** This is the big step.
- **Setup.** The test file launches Chromium once in `beforeAll`, with filter's install hint on failure, and serves the app with `serveTargetApp` from `@wayford/filter/serve-target-app`. Both run with 60 s hook timeouts.
- **Per test.** Each test takes a fresh `mkdtemp` output directory, removed in `afterEach`, and passes 30 s as vitest's per-test timeout.
- **The task.** Tests build it from the fixtures, `{ ...taskFixtures[1], startUrl: \`${app.origin}/deliveries\` }`, and check the bundled Inter font after open, as filter's tests do.
- **Run ids.** They are readable slugs such as `run_vera-evidence-1`, and the seed is 7.
- **Emulation leak test.** It imports `collect` from `@wayford/filter`.
- **Order inside `openRunContext`.** Follow the spec's data flow, steps 1 to 9, and keep the P6 comment's full wording.
- **Cursor code.** The in-page function has no nested named function declarations. The `__name` shim wraps every source sent to the page.

**Step 5.** `smoke-run.ts` finds each link's box with `page.getByRole("link", { name })` and clicks with `page.mouse.click` at the box centre, after `moveCursor` to the same point. It takes the screenshot after the click. It launches with filter's install hint and closes the browser and the server in a `finally`.

The last step is verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` and every acceptance command in the task file.
