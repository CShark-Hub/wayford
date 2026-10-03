# s3-05 — Live preview on the target app: plan

Spec: `docs/specs/2026-10-03-s3-05-live-preview.md`
Status: approved 2026-10-03 (auto)

| # | Step | Files | Serves box | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | io route and its cache, on a fake `MeasureFn`; mounted in `createApp`; `testApp` default | `packages/io/src/routes/measure.ts`, `routes/measure.test.ts`, `app.ts`, `test-app.ts` | 1, 5 | `measure.test.ts`: defaults, 400s (`/nowhere`, `tablet`, unknown and repeated key), cache once per key, shared in-flight, failure dropped and 502, other error 500 | `pnpm --filter @wayford/io exec vitest run src/routes/measure.test.ts` green | 3 |
| 2 | `sharedBrowser` split; `liveMeasure`; `server.ts` wiring; the browser test | `packages/io/src/chromium.ts`, `chromium.test.ts`, `runs.browser.test.ts`, `live-measure.ts`, `measure.browser.test.ts`, `server.ts` | 1, 5 | `measure.browser.test.ts`: `/deliveries` desktop, `device=mobile`, `/account`, `/settings/data`, cached 200 and 502 after the target app stops | `pnpm --filter @wayford/io test` green | 3 |
| 3 | web client and query; the `page` search param | `packages/web/src/api/measure.ts`, `api/measure.test.ts`, `preview/search.ts`, `preview/search.test.ts` | 2, 4, 5 | `measure.test.ts` (URL, parse, io's error, status); `search.test.ts` (`page` default, invalid, `personaSearch` keeps it) | `pnpm --filter @wayford/web exec vitest run src/api/measure.test.ts src/preview/search.test.ts` green | 1, 2 |
| 4 | The screen: query, pending, error banner with Try again, live line, page picker, width cap | `packages/web/src/screens/preview.tsx`, `screens/preview.test.tsx` | 3, 4, 5 | `preview.test.tsx`: helper seeds the cache; live measurement drawn; pending draws nothing; failed query draws the stored page and banner; picker links and current page; Milo asks for mobile | `pnpm --filter @wayford/web exec vitest run src/screens/preview.test.tsx` green | — |
| 5 | Fetch spy in a real browser | `packages/web/src/screens/preview.browser.test.ts`, `packages/web/package.json`, `pnpm-lock.yaml` | 2 | the test itself: slider moves, no fetch, no request; the picker fetches | `pnpm --filter @wayford/web test` green | — |
| 6 | Verify: `pnpm lint`, `pnpm typecheck`, `pnpm test`; manual `pnpm dev` checks (live page, redraw timings, picker, target app stopped); tick boxes in the task file | `tasks/s3-05-live-preview.md` | all | — | all three commands exit 0; each box has its evidence | — |

Step 1 before 2: 2's browser test mounts the route through `testApp`. Step 3 runs beside 1 and 2 (disjoint packages, no lockfile change). Step 5 alone changes `pnpm-lock.yaml`.
