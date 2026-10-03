# s2-11 — Calibration run on the real model: plan

Spec: `docs/specs/2026-10-02-s2-11-calibration-run.md`
Status: approved 2026-10-02

| # | Step | Files | Serves box | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | Shared route copy | `packages/filter/src/serve-target-app.ts`, `packages/filter/src/target-app-routes.browser.test.ts` | 1 (route lookup) | "TARGET_APP_ROUTES equals target-app's ROUTES" | `pnpm --filter @wayford/filter test` and `pnpm --filter @wayford/filter typecheck` pass | 2 |
| 2 | Pure calibration functions | `packages/agent/src/calibration.ts`, `packages/agent/src/calibration.test.ts` | 1, 4 | "routeOf reads the route off the last page", "endOf tells the step cap from the clock", "summarise gives the medians and end counts", "goNoGo scales to the seed count", "the estimate for the default set exceeds 0.01 USD on Luna" | `pnpm --filter @wayford/agent exec vitest run src/calibration.test.ts` passes; `pnpm --filter @wayford/agent typecheck` passes once step 1 is in | 1 |
| 3 | `calibrate()`: runs, latency, guards, report | `packages/agent/src/calibration-run.ts`, `packages/agent/src/calibration-run.browser.test.ts` | 1, 4 | "a fake adapter gives a fixed table", "maxUsd 0.01 starts no run", "a run that rejects is an error and the others finish" | `pnpm --filter @wayford/agent test` passes | none (after 1 and 2) |
| 4 | The CLI | `packages/agent/src/calibrate.ts`, `packages/agent/package.json` | 2, 4 | none (the CLI holds no logic of its own and no test imports it); usage errors checked by hand | `pnpm --filter @wayford/agent calibrate -- --max-usd 0.01` prints the over-budget line, starts nothing, exits 1; `--seeds x` exits 2 | none (after 3) |
| 5 | Verify | task file | all | none | `pnpm lint`, `pnpm typecheck`, `pnpm test` at the root; then the real-key `calibrate` run, asked first | none |

## Notes per step

**Step 1.** `TargetAppRoute` and `TARGET_APP_ROUTES` sit beside `TARGET_APP_PATHS`, with a comment saying `s1-03` and `s2-11` share them. The drift test reads `pages.ts` as text and slices `export const ROUTES` … `];`.

**Step 2.**
- `calibration.ts` imports `TargetAppRoute` with `import type` only, so it pulls in no `vite`.
- The tests use hand-built `RunResult`s that are parsed with core's `RunResult` schema, so they stay valid shapes:
  - success via `/deliveries`, `/account` and `/settings/data`;
  - an unmapped page;
  - the easy goal;
  - `gave_up`;
  - the step cap with a complete last step;
  - the clock with an incomplete last step;
  - an `error` run.

**Step 3.**
- One served app on port 0 and one Chromium for the file, as in `actor-loop.browser.test.ts`.
- A fresh `fakeLlm` per run, through the factory, with answers picked from the page text, as the spec's "fake-adapter test" says.
- `fetch` is stubbed to throw, so nothing reaches a network.
- The reject test uses a factory that throws on one seed only.

**Step 4.** Copy `run-one.ts`'s setup order and its error printing (`WayfordError` → `code: message`, never the settings). The report path is `<repo>/runs/calibration/<ISO timestamp, colons replaced>.json`.

**Step 5.** The real-key run costs about 1 USD on Luna. Ask before running it. The table and the go/no-go go into the PR.
