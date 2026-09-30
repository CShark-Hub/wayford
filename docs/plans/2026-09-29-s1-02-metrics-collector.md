# s1-02 — DOM metrics collector and the seed test on the target app: plan

Spec: `docs/specs/2026-09-29-s1-02-metrics-collector.md`
Status: approved 2026-09-29

| # | Step | Files | Serves box | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | Dependencies and config | `packages/filter/package.json`, `pnpm-lock.yaml`, `packages/filter/tsconfig.json`, `docs/STACK.md` | all (prerequisite) | none: config only | `pnpm install --frozen-lockfile` is clean; `pnpm lint` and `pnpm typecheck` pass; `pnpm --filter @wayford/filter exec playwright --version` prints 1.63 | none (the only step that changes the lockfile) |
| 2 | WCAG contrast, compositing and truncation | `packages/filter/src/contrast.ts`, `contrast.test.ts`, `index.ts` (one line) | 1; the contrast constraint | `contrast.test.ts` | `pnpm --filter @wayford/filter exec vitest run src/contrast.test.ts` passes; `pnpm typecheck` passes | 3, 7 |
| 3 | Serve the target app from a build | `packages/filter/src/serve-target-app.ts` | 2 to 6 (prerequisite); "tests start the target app themselves" | none: test support, exercised by every browser test in step 5 | a one-off `tsx` smoke run, not committed, prints the checks in the notes below, twice in a row, while another process holds port 5174 | 2, 7 |
| 4 | The in-page walk and `collect` | `packages/filter/src/measure-page.ts`, `collect.ts`, `collect-rules.browser.test.ts`, `index.ts` (one line) | the measuring constraints; 7 | `collect-rules.browser.test.ts` | it passes under vitest; `pnpm typecheck` and `pnpm lint` pass | none (needs 2) |
| 5 | `collect` on the target app | `packages/filter/src/collect.browser.test.ts`; fixes in `measure-page.ts` or `collect.ts` only if the tests find a collector bug | 3, 4, 5, 6 | `collect.browser.test.ts`: the contrast-at-2-and-7, `getByRole` on six pages, seed and hard-cut tests | the file passes; no `getByRole` check is weakened to pass | none (needs 3 and 4) |
| 6 | Regenerate the fixture | `packages/filter/scripts/measure-fixture.ts`, `packages/filter/package.json` (script line), `packages/core/src/fixtures/measurement.json`, `packages/core/src/measurement.test.ts`, `packages/core/src/fixtures/index.ts`, `collect.browser.test.ts` (the fixture test) | 2 | "collect on /deliveries matches measurementFixture" | `pnpm --filter @wayford/filter fixture:measurement` rewrites the fixture, and a second run changes no byte; the JSON diff shows only what the Outcome will explain; `pnpm --filter @wayford/core test` and `pnpm --filter @wayford/filter test` pass | none (needs 5) |
| 7 | Chromium in CI | `.github/workflows/ci.yml` | 1, 8 in CI | none: workflow only | the YAML parses, and the new step sits between Install and Lint with the same `if:` guard; proven for real by the PR's CI run | 2, 3 |
| 8 | Verify and record | `tasks/s1-02-metrics-collector.md` | all | none | `pnpm lint`, `pnpm typecheck`, `pnpm test` and every acceptance command pass; every box ticked with its evidence; Outcome written | none |

Before step 1: rebase the branch onto `main` once PR #113 has merged, so the build starts from the current filter contract.

## Notes per step

**1.**
- `culori` is a dependency. `playwright`, `vite` (`^8.3.0`, as `target-app`) and `@types/culori` are dev dependencies.
- `tsconfig.json` sets `"lib": ["ES2023", "DOM", "DOM.Iterable"]`. `tsconfig.perceive.json` is left alone.
- `docs/STACK.md` gets one clause in the `culori` row: types from `@types/culori`.
- No `fixture:measurement` script yet: step 6 adds it with the script it runs.

**2.**
- The published values: black on white 21:1, `#767676` on white 4.54:1, `#777777` on white 4.48:1, each to 2 decimals.
- `BackgroundLayer` with `image: true` anywhere up to the first opaque colour gives `undefined`.
- An unparsable colour throws `WayfordError` `unparsable_colour`.
- `truncateRatio` cuts to 3 decimals and never rounds up: 2.9996 → 2.999, 3 → 3, 21 → 21. `textContrast` returns the truncated value.

**3.**
- No committed test: the review standard counts a test of test support as bloat (`.claude/skills/pr-review/references/lenses.md`, "Test bloat"). Every browser test in step 5 runs through it.
- The one-off smoke run checks:
  - `/deliveries` returns 200 with its title and no `/@vite/client`, so it is a build;
  - `/nope` returns 404;
  - `close()` frees the port and removes the temp directory.

**4.**
- `pageSource` wraps a function's source with a no-op `__name`. The rules test proves it by evaluating a source that calls `__name(`, rather than by checking the wrapper's text.
- `collect-rules.browser.test.ts` serves synthetic pages through `page.route` on `http://collect.test/` and covers the cases the spec lists, as a table where the cases share a shape.
- The implementer checks the in-page function runs under `tsx` too: `pnpm --filter @wayford/filter exec tsx` on a one-off script that collects a routed page. That is the real `keepNames` case.

**5.**
- Every page is opened in a fresh 1280 × 720 context, with `contrast`, `fontPx` and `targetPx` on the URL, and `document.fonts.check('16px "Inter"')` asserted before `collect`.
- The six pages come from the target app's contract list (`packages/target-app/README.md`, "Pages"). They are written out in the test, since filter may not import `target-app`.
- `getByRole` (spec, Decision log row 1):
  - Roles that take a name use `getByRole(role, { name, exact: true })`.
  - `paragraph` and `listitem` use `getByRole(role)` and pick the match whose collapsed `innerText()` equals the name.
  - Both are scoped by the landmark chain, and one match must have the measured box within 0.01 px.
- The seed test: Vera, run seed 7, two fresh contexts, `renderObservationForModel(toActorObservation(perceive(...)))` string-equal.
- The hard cut: Ada with `perception.contrast = { threshold: 3, provenance: "wcag22" }`; "Order archive" absent at `contrast=2` and present at `contrast=7`.
- If a check fails, the collector is fixed, never the check. A fix that changes what is measured goes back through the spec's decision log, marked "(build)".

**6.**
- The script serves on 5174 with `strictPort` and fails with a readable message if the port is taken.
- It writes the JSON in the fixture's current layout: one element per block, with `bbox` and `metrics` inline.
- The core test pins follow the new boxes. Its keys, kinds, roles, names and metrics pins stay unless the regenerated values differ, and any difference is explained in the Outcome.
- The reviewer note asks for the regenerated fixture to be compared with the hand-measured one. That comparison, element by element, goes into the task file's Outcome.

**7.** `pnpm --filter @wayford/filter exec playwright install --with-deps --only-shell chromium`, named "Install Chromium", guarded by `if: ${{ !cancelled() && steps.install.outcome == 'success' }}`.

**8.**
- Box 7's evidence is `PLAYWRIGHT_BROWSERS_PATH=/nonexistent pnpm test:unit` passing, since a launch would fail there, together with `pnpm test` listing the browser files.
- The Outcome covers what shipped:
  - the `getByRole` check for text blocks;
  - labels on their control (#117);
  - the macOS fixture;
  - the fixture comparison;
  - the files outside the task's list.
- Follow-ups: shadow DOM, iframes, backgrounds in pixels, custom form controls, and `isMobile` for `s2-02`.

The last step is always verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` and every acceptance command in the task file.
