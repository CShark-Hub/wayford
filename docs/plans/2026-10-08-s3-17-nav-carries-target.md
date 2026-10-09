# s3-17 — The nav carries the target: plan

Task: `tasks/s3-17-nav-carries-target.md` · Spec: `docs/specs/2026-10-08-s3-17-nav-carries-target.md`
Status: approved 2026-10-08 (auto)

| # | Step | Files | Serves box | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | The store: `CurrentTarget`, read, set, clear, the hook, `followStoredGoal`, `targetLinks` | `packages/web/src/target/current-target.ts`, `current-target.test.ts` | web tests: current-target (4 bullets) | `current-target.test.ts`: the four boxes, plus `targetLinks` with and without a target and a refused Lens URL | `pnpm --filter @wayford/web exec vitest run src/target/current-target.test.ts` green; `pnpm --filter @wayford/web typecheck` | — |
| 2 | The top bar: `00 Target` first, links from `targetLinks`, host in mono, no right-hand Target, `includeSearch: false` | `packages/web/src/components/top-bar.tsx`, `top-bar.test.tsx` | web tests: top-bar (4 bullets); demo beats unchanged | `top-bar.test.tsx`: numbering `00`–`05` and no Target button; no target → today's links; with a target (stubbed `sessionStorage`) the four carry it and the host is in Target's name; a shown race wins; per-entry "only X is current" including `/target?task=<other>` | `vitest run src/components/top-bar.test.tsx` green; typecheck | 3 |
| 3 | The Target screen: `StoredGoal`'s effect over `followStoredGoal`, "Clear target" beside "New goal", the goal view's Lens and Race as typed `Link`s from `targetLinks` | `packages/web/src/screens/target.tsx`, `target/target-view.tsx`, `screens/target.test.tsx` | web tests: target (4 bullets) | `target.test.tsx`: `followStoredGoal` sets on a task; `null` clears only the same id; "Clear target" rendered beside "New goal" and `onClearTarget` wired; goal view's Lens and Race hrefs equal the nav's with that target set | `vitest run src/screens/target.test.tsx` green; typecheck | 2 |
| 4 | The self-check entry `target · nav` with a long host, and `docs/DESIGN.md`'s top bar and `/target` row | `packages/web/scripts/self-check.ts`, `docs/DESIGN.md` | `check:self` box | the entry itself is the test: it fails until the bar draws the host | `pnpm --filter @wayford/web check:self` passes in Daylight and Night, `target · nav` listed | 5 |
| 5 | The browser test: effect sets the bar, reload keeps it, Clear target restores today's hrefs, race then new target forgets the race, typed `/lens` opens `/deliveries`, bar fits at 1280 px with a long host in both themes | `packages/web/scripts/target.browser.test.ts` (new) | `pnpm dev` box (steps 4–6, reviewer notes); D14 | the file is the test | `pnpm --filter @wayford/web exec vitest run scripts/target.browser.test.ts` green | 4 |
| 6 | Verify: root `pnpm lint`, `pnpm typecheck`, `pnpm test`, `check:self`; the manual `pnpm dev` steps written into the task's Outcome; boxes ticked | `tasks/s3-17-nav-carries-target.md` | all | — | every command green | — |

Notes:

- Steps 2 and 3 depend on step 1; their files are disjoint, so they run in parallel. Steps 4 and 5 depend on 2 and 3, and are disjoint too. No step changes `pnpm-lock.yaml`.
- Step 5 serves the box under `pnpm dev` only in part; steps 1 to 3 of that box need the Extractor and a key, and are a documented manual check (spec, decision log).

## Decision log

in the spec
