# s3-05 — Live preview on the target app: spec

Task: `tasks/s3-05-live-preview.md` · Branch: `feature/s3-05-live-preview` · Date: 2026-10-03
Status: approved 2026-10-03 (auto)

## Goal

The preview perceives the live target app's page, measured by io for the persona's device, on `/deliveries`, `/account` and `/settings/data`, and falls back to the stored `measurementFixture` with a visible banner when io or the target app is down.

## Constraints that bind

- "io measures once per device and page, and keeps the result until io restarts. `page` takes only paths in the target app's `PAGES`; anything else is a 400. [...] a slider move never calls io." (task)
- "io calls `collect(page, { isMobile })` with the mobile flag of the device it measures." (task)
- "The same `perceive` as the Actor, in the browser, given the whole persona (F2 AC3)." The preview already does this; only the measurement it is given changes.
- Fallback (F2 AC5): io or the target app unreachable, the stored `measurementFixture` and a visible banner.
- Out of scope: pages outside `PAGES`, other app parameters, public sites, the emulated screenshot layer (s3-06), knowledge and attention sliders.
- `docs/STACK.md`: web imports core and `@wayford/filter/perceive` only and talks to io over HTTP through the `/api` proxy; io may import core, filter, agent; target app on 5174; no dependency without a STACK line.
- Open tasks own other files: `packages/agent/src/**` is s2-10's (PR #154). So io uses agent's exported surface only, and agent's `settle`, which the barrel does not export, is out of reach.

## Design

### io

`packages/io/src/routes/measure.ts`, mounted at `/measure` by `createApp`:

```ts
/** The devices a persona can be measured on: core's `DeviceKind` without `tablet`, which no persona uses. */
export const MeasureDevice = DeviceKind.exclude(["tablet"]);
export type MeasureDevice = z.infer<typeof MeasureDevice>;

/** One target-app page at its default parameters, measured on a device. */
export type MeasureFn = (device: MeasureDevice, path: string) => Promise<PageMeasurement>;

const MeasureQuery = z.object({
  device: MeasureDevice.default("desktop"),
  page: z.string().refine((path) => TARGET_APP_PATHS.includes(path), "...").default("/deliveries"),
}).strict();

export function measureRoute({ measure }: { measure: MeasureFn }): Hono;
```

- `GET /measure?device=&page=` answers 200 with the `PageMeasurement`; 400 `{ error }` for a query that is not a `MeasureQuery` (a path outside `TARGET_APP_PATHS`, `tablet`, an unknown or repeated key); 502 `{ error: "<code>: <message>" }` when `measure` throws a `WayfordError`. Any other error reaches `createApp`'s `onError`, a logged 500.
- The route keeps one `Map<"<device> <page>", Promise<PageMeasurement>>` for the app's life. A request finds the promise or starts one; a rejected one is deleted, so a target app that comes up later is measured on the next request. Requests that arrive together share one measurement.
- `TARGET_APP_PATHS` comes from `@wayford/filter/serve-target-app`, the copy of `PAGES` a test already keeps equal to it. io may not import target-app.

`packages/io/src/live-measure.ts`, outside the barrel like `chromium.ts`:

```ts
export function liveMeasure(options: { browser: () => Promise<Browser>; origin: string }): MeasureFn;
```

Per call: a new context on the shared browser with `deviceContextOptions(device)` (agent's V1 descriptors), `goto(startUrlFor({ startUrl: origin + path }, TARGET_APP_DEFAULTS), { timeout: 10_000 })`, then `document.fonts.ready` raced in the page against a 3 s deadline (agent's `SETTLE_TIMEOUT_MS`, as `settleScript` races it) and a check that no font face failed, then `collect(page, { isMobile: deviceContextOptions(device).isMobile })`, and the context closed in `finally`. The whole call is also raced on Node's clock against 15 s, and the context closed on expiry, so a page whose main thread never answers cannot hold a cached promise for io's life. A failed `goto`, a non-OK response or the `goto` timeout throws `WayfordError("target_app_unavailable")`; fonts still loading at the deadline or the 15 s race `page_not_settled`; a failed font `font_failed`; `collect`'s own `invalid_measurement` passes through. Every one of them reaches the route as a `WayfordError`, so it is a 502 and is dropped from the map.

`packages/io/src/chromium.ts`: the launch-sharing logic moves into `sharedBrowser(launch?) => () => Promise<Browser>`, and `sharedChromium(browser)` becomes the `RunFn` on it, with no default browser, so a caller cannot start a second Chromium by leaving it out. `server.ts` makes one `sharedBrowser()` and hands it to both `sharedChromium` and `liveMeasure`, so runs and measurements share one Chromium. `server.ts` also names the target app's origin, `http://localhost:5174` (`docs/STACK.md`, "Ports").

`AppOptions` gains `measure: MeasureFn`; `testApp` defaults it to a function that throws, as `noBackend` does.

### web

`packages/web/src/api/measure.ts`:

```ts
export async function fetchMeasurement(device: DeviceKind, page: string): Promise<PageMeasurement>;
export function measurementQuery(device: DeviceKind, page: string) {
  return queryOptions({
    queryKey: ["measure", device, page],
    queryFn: () => fetchMeasurement(device, page),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    retryOnMount: false,
  });
}
```

`GET /api/measure?device=…&page=…`, parsed with core's `PageMeasurement`; a non-OK answer rejects with io's `error` when it sent one, else its status. The key holds the device and the page only, and a measurement once there never goes stale, so neither a slider move nor a refocus refetches it. `retryOnMount: false` keeps a failure failed: with TanStack's default a failed query with no data mounts as `pending`, so the fallback would never show and the static test of it would see "Measuring…" instead. A failure holds no data, so a refocus, a return to that page or Try again asks io again, which is how a target app started later is found.

`packages/web/src/preview/search.ts`: a `page` search param, one of `PREVIEW_PAGES = ["/deliveries", "/account", "/settings/data"]`, `/deliveries` when absent or invalid. `PreviewState.page` holds it, and `personaSearch` keeps it, as it keeps the seed. Unlike the seed, which `personaSearch` always writes, `page` is left out of the URL at `/deliveries`, so a persona link from a short URL stays short.

`packages/web/src/screens/preview.tsx`:

- `useQuery(measurementQuery(state.persona.device, state.page))`. The screen perceives `query.data` when it has it, else `bundledMeasurement`, on every render as now.
- Pending: no drawing, a `role="status"` line "Measuring <page> on the target app…".
- Error: the stored page drawn, and above it a banner (`role="status"`): the live page is unavailable and why, "showing the stored /deliveries, measured on desktop at the app's defaults", with a Try again button that refetches.
- Success: the live page, and a line naming its URL and device.
- A page picker: `<nav aria-label="Page">` with one `Link` per `PREVIEW_PAGES` entry, `aria-current="page"` on the current one, keeping persona, seed, sliders and view. A page is a place, so it is a link, as the persona switcher's are.
- The stage is capped at the measured viewport's width, so a phone page is drawn at its own width, not stretched across the pane.
- The header copy stays neutral ("the page as perceive returns it"): which page it is, live or stored, is said by the success line or the banner, so the header never claims a live page the fallback is not drawing.

## Files

| File | Why |
|---|---|
| `packages/io/src/routes/measure.ts` (new), `measure.test.ts` (new) | The route, its query, its cache; unit tests on a fake `MeasureFn`. |
| `packages/io/src/live-measure.ts` (new), `measure.browser.test.ts` (new) | The real measurement; the test against the served target app. |
| `packages/io/src/chromium.ts`, `chromium.test.ts`, `runs.browser.test.ts` | `sharedBrowser` split out; call sites updated. |
| `packages/io/src/app.ts`, `server.ts`, `test-app.ts` | Mount the route; wire the shared browser and origin; the test default. |
| `packages/web/src/api/measure.ts` (new), `measure.test.ts` (new) | The client and its query. |
| `packages/web/src/preview/search.ts`, `search.test.ts` | The `page` param. |
| `packages/web/src/screens/preview.tsx`, `preview.test.tsx` | The live page, the states, the picker. The test helper seeds the query cache. |
| `packages/web/src/screens/preview.browser.test.ts` (new) | The fetch spy in a real browser, on a Vite dev server started from web's config on port 0, so a developer's `pnpm dev` on 5173 does not fail it. |
| `packages/web/package.json`, `pnpm-lock.yaml` | `playwright` as a web devDependency, for that test. Playwright is STACK's browser pick. |
| `tasks/s3-05-live-preview.md`, `tasks/BOARD.md` | Boxes ticked; status `review` in the PR. |

## Acceptance mapping

| Acceptance box | Proven by |
|---|---|
| io test: `/measure` against the running target app returns a valid `PageMeasurement` | `measure.browser.test.ts`: `serveTargetApp()`, `GET /measure` parses as `PageMeasurement`, on `/deliveries`, desktop; `device=mobile` records `isMobile: true` at 412 px. After the target app is closed, a page measured before still answers 200 from the cache (kept until io restarts) and one not measured yet answers 502 |
| Web test with a fetch spy: slider moves make no request | `preview.browser.test.ts`: the web dev server in Chromium, `/api/measure` fulfilled by `page.route`, an in-page `fetch` spy and a request listener. Keyboard moves on the contrast, softness and seed sliders write the URL and redraw, with no fetch and no request. Opening `/account` from the picker does fetch, so the spy is seen to work |
| `pnpm dev`: the live page, slider redraw under 500 ms (profiler screenshot) | Manual, in the browser pane: `pnpm dev`, `/preview`, the live line shown, and the dev build's `preview redraw N ms` console lines read. The profiler screenshot: a trace Playwright recorded while it dragged the contrast slider on `pnpm dev`, opened in Chromium's DevTools Performance panel and attached to the PR |
| Target app stopped: the fixture and the banner | `preview.test.tsx`: a client whose measurement query failed through `prefetchQuery` with a rejecting `queryFn` (as `run-detail.test.tsx`'s `ioDown`) draws the stored page and the banner; manual: io (fresh) and web up, target app down |
| `/account` and `/settings/data` live in the picker; `GET /measure?page=/nowhere` is 400 | `measure.browser.test.ts` measures both pages; `measure.test.ts` "a path outside PAGES is a 400"; `preview.test.tsx` picker links; manual in `pnpm dev` |
| `pnpm lint`, `pnpm typecheck`, `pnpm test` | The commands |

## Decision log

| Question | Taken | Why |
|---|---|---|
| Which pages the picker offers | The three the task names; io accepts every `PAGES` path | The task names them; io's rule is the task's ("only paths in `PAGES`"). |
| Where "once per device and page" lives | A map in the route, promises, failures dropped | Tests prove it through `app.request`; a dropped failure lets a target app started later be measured without restarting io. |
| How the page settles before `collect` | `goto`'s `load`, `document.fonts.ready`, no failed face | Agent's `settle` is not exported and `packages/agent/src/**` is s2-10's. The target app runs no animation, so for a fresh load this is what `settle` waits for; `measure-fixture.ts` measured the fixture the same way. Follow-up: use `settle` once agent exports it. |
| One Chromium or two | One, `sharedBrowser` shared by runs and measurements | Same process, no second launch. |
| Target app origin | Constant in `server.ts` | The port is fixed in `docs/STACK.md`; tests pass their own origin. |
| `tablet` | Not a `device` value, a 400 | The task's interface says `desktop|mobile`; no persona uses a tablet. The preview then falls back with io's reason in the banner. |
| While the measurement loads | Nothing drawn, a status line | Drawing the stored `/deliveries` while `/account` loads would show the wrong page. |
| Retries | None, a Try again button | TanStack's three retries would hold the fallback back for about 7 s. |
| How to prove "no request" | Playwright in a real browser, `playwright` added to web's devDependencies | Web tests render statically in Node, where nothing fetches, so a spy there proves nothing. A DOM library would need a STACK line; Playwright has one. |
| Phone page width | Stage capped at the measured viewport width | A 412 px page stretched to the pane misleads about sizes. |
| Which page link is current (build) | `activeOptions={{ explicitUndefined: true }}` on the page links | TanStack marks a link current when its search is part of the URL's, so `/deliveries`, which leaves `page` out, read as current on every page. |
| The test's `/api` route (build) | Matched by path prefix, `/api/` | A `**/api/**` glob also caught the app's own modules under `src/api/`. |
| The unavailable message (build) | Names the path, then Playwright's first line | Playwright's line names the full URL already; naming it twice filled the banner. |
| Try again while it measures (build) | Nothing of its own: the stage's "Measuring" line | A refetch of a query with no data puts it back to `pending`, so the banner gives way to the line at once (branch review). |
| Phone paragraphs clipped (build) | Left as is, a follow-up | `PerceivedPage` draws every box on one line (s3-01); wrapping is drawing, not this task, and week 4 reworks the look. |

## Risks

- The web dev server inside vitest may be slow on a cold transform; the browser test gets the 120 s timeout io's uses.
- PR #151 (s3-03) also edits `preview.test.tsx`, near its nav test; a merge conflict there is mechanical.

## Review note

Branch review (branch-reviewer, one round, no blocking finding). Fixed: the Try again "Measuring…" state, which never rendered, removed; the query's comment says a failure is asked again on refocus and return; box 3 left unticked until the profiler screenshot was attached (a Playwright-recorded trace in DevTools, PR comment); `sharedChromium` takes its browser with no default; the banner says "io did not answer" for the proxy's own status. Cut: the query-key test and two link tests that `preview.test.tsx` already holds. Kept: io's own font wait, until agent exports `settle` (decision log). Security review: no findings.

Round 1 (spec-reviewer): ready after fixes, no blocking finding. Fixed: `retryOnMount: false` on the measurement query and how the failed-query test is set up; a deadline on every wait in `liveMeasure` (10 s `goto`, 3 s fonts, 15 s on Node's clock); the browser test's Vite on port 0; box 1 asserts both the cached 200 and the 502 after the target app stops; the header copy kept neutral; `isMobile` read from `deviceContextOptions`; the `personaSearch` wording. Nothing rejected.
