# s4-09 — io on any URL: the Lens's measurement and axe

Stream: s4
Milestone: week 4, any target (finals)
Size: L
Depends on: s2-13 (the lenient settle, and the runner's origin check)

## Context

Read first, in this order:

- `AGENTS.md`
- `docs/adr/0003-any-target.md` — D4, D5, D7 and D10 are this task
- `docs/STACK.md` and `docs/CONVENTIONS.md`
- `tasks/s4-06-axe-sidecar.md` — how the scan was built, and its Outcome
- `packages/io/src/server.ts`, `live-measure.ts`, `routes/measure.ts` — one origin, a path, a cache for the life of the process
- `packages/io/src/axe-scan.ts`, `axe.ts`, `routes/axe.ts`, `db/schema.ts` (`axe_results`) — scans keyed by path and query, no origin
- `packages/core/src/axe.ts` — `AxeUrl`
- `packages/io/src/analyst-axe.ts` — `TARGET_APP_HOSTS` ignores the port
- `packages/io/src/app.ts` — the 415 check, which covers `POST` only
- `packages/web/vite.config.ts` — the dev proxy, with no `changeOrigin`

## Goal

`GET /measure` and `GET /axe` take any http(s) URL as well as a target-app path, and everything io stores or caches about a page is keyed by its whole URL. The Analyst recognises the target app by its origin and finds axe violations on the pages a foreign run visited. io refuses a request addressed to another host or sent cross-site.

## Interface

- In: `GET /measure?device=…&url=…` and `GET /axe?url=…`. The `page` parameter keeps working for the target app's paths, so web needs no change in this task.
- Out:
  - `PageMeasurement` and `AxeScan` from `@wayford/core`;
  - `AxeUrl` carrying the origin, with a migration of `axe_results`. Dropping the old rows is fine: they are re-scanned on the next request.
- A failed load names the page and its URL, never "the target app", when the URL is not on it.
- Off the target app, page loading for the Lens and for axe follows `s2-13`'s lenient `settle`. A stylesheet link that fails is no `page_not_settled`.
- `analyst-axe.ts`:
  - a run is on the target app when its start URL's origin, port included, is the target-app origin io is configured with, passed in as an option so tests pass their own;
  - pages of any other run are scanned by their whole URL, on desktop, at most ten per report: those the most runs visited (D10). The rest are logged;
  - each finding names the page's URL, not "the app's parameters".
- One middleware refuses:
  - a request whose `Host` is not io's own;
  - a request with `Sec-Fetch-Site: cross-site`.
- The web dev proxy sets `changeOrigin: true`, so it sends io's own host.
- Files expected to change:
  - io: `server.ts`, `app.ts`, `live-measure.ts`, `routes/measure.ts`, `axe-scan.ts`, `axe.ts`, `routes/axe.ts`, `db/`, a new migration, `analyst-axe.ts`;
  - `packages/core/src/axe.ts` and the `axe-scans.json` fixture;
  - `packages/web/vite.config.ts`;
  - and their tests.

## Constraints

- axe stays a measurement and never a filter input (`s4-06`).
- A scan that did not run says so; never "0 violations".
- No URL from a request is fetched by anything but the Chromium io already runs.
- The target app's pages give the same measurement and scan as before this task.

## Acceptance

- [x] `pnpm --filter @wayford/io test` passes and includes:
  - `GET /measure?url=` and `GET /axe?url=` on a fixture page served on a second port, measured and scanned;
  - the same path on two origins stored and served as two results;
  - a request with a foreign `Host`, and one with `Sec-Fetch-Site: cross-site`, refused, and nothing measured or scanned;
  - the Analyst on runs of an app on `localhost:<another port>` cites none of the target app's violations, and cites that app's own;
  - a report over runs that visited more than ten foreign pages scans ten.

  io: 40 files, 393 tests passed, after the PR review fixes. The sub-items, in order:
  - `measure.browser.test.ts` and `axe.browser.test.ts`, "any page", on a Node server on `127.0.0.1` and a free port. Each serves a page with low-contrast text, a stylesheet and a font face that answer 404, and an endless animation:
    - "url= on a page with a 404 stylesheet, a 404 font and an endless animation is measured";
    - "… is scanned and stored by its URL", with `color-contrast`;
    - a closed port and a 404 path are each a 502 `page_unavailable: the page at <url> …`, never "target app".
  - `axe.browser.test.ts`: "the same path on another origin is its own scan; two rows, and a repeat of each scans nothing". `routes/measure.test.ts`: "the same path on two origins is two measurements, each kept and served its own".
  - `app.test.ts`, "a request to another host or from another site", "%s is a 403, and nothing is measured, scanned or run":
    - each of these is a 403 on `/measure`, `/axe` and `POST /runs`: a `Host` header naming another host, a URL on another host, `Sec-Fetch-Site` of `cross-site` or `same-site`, and a navigation the browser started itself (`Sec-Fetch-Site: none` with `Sec-Fetch-Mode: navigate`, added in the branch review);
    - the counting fakes were never called, and no run started.
  - `analyst-axe.test.ts`: "a run on an app on localhost:<another port> cites none of the target app's violations, and its own". Only `http://localhost:8080/deliveries` is asked, and its finding names that URL.
  - `analyst-axe.test.ts`, "a report over runs on more than ten foreign pages scans ten: those the most runs stood on, in the order first stood on". It has twelve pages: ten are asked, and the other two are named in one warning. Also "a tie at the cut goes to the page stood on first".
- [x] Under `pnpm dev`, `curl 'localhost:3000/measure?device=desktop&url=https://example.com/'` returns a measurement, and `/axe?url=…` a scan. The PR shows both. Use the io port `pnpm dev` prints.
  - HTTP 200 with `{"url":"https://example.com/","title":"Example Domain","viewport":{"width":1280,…},"elements":[{"key":"//paragraph:This domain is for use in documentation examples …"`, and `/axe?url=https://example.com/` HTTP 200 with `{"url":"https://example.com/","scannedAt":"2026-10-07T11:55:14.418Z","axeVersion":"4.13.0","violations":[]}`. io printed port 3000.
  - The reviewer's checks under the same `pnpm dev`:
    - `-H 'Host: evil.test'` is a 403, and so are `-H 'Sec-Fetch-Site: cross-site'` and `same-site`.
    - Through the dev proxy, `localhost:5173/api/health` is 200 with `same-origin` and 403 with `cross-site`.
    - The database then held one scan, `https://example.com/`.
  - After the review fixes, under `pnpm dev` again:
    - both `example.com` curls answer 200;
    - `url=file:///etc/passwd` is a 400;
    - `url=http://localhost:3000/runs` is a 502 `page_unavailable … answered 403`: the middleware refuses io's Chromium.
    - A probe site that answers each hop with a 302 into `localhost:3000/measure?url=<next hop>` saw one hit, with `site=none mode=navigate`. The request answered 502 `page_unavailable: the page at http://127.0.0.1:18098/0 answered 403`. Before the fix, the branch review saw that chain run three hops.
- [x] The Lens on `/deliveries`, `/account` and `/settings/data` is unchanged, through the dev proxy
  - Captured through `localhost:5173/api` under `pnpm dev`, once on `main` before any change and once on the branch, on a fresh database each time:
    - `/api/measure` on desktop and mobile, and `/api/axe`, for the three pages;
    - a full-page screenshot of `/lens?page=…` for each.
  - The six measurements are byte for byte equal.
  - The three scans are equal but for `url`, which gains `http://localhost:5174`, and `scannedAt`. `/deliveries` keeps its one `color-contrast`, and the other two have none.
  - The three screenshots are byte for byte identical.
  - Captured again after the review fixes, where the target app's pages also load inside `retryOnNavigation`. The six measurements and three scans are still equal. Through the proxy in a browser, the Lens's six `/api` calls answer 200.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root
  - After the review fixes:
    - Biome checked 410 files with no fixes, and typecheck passed in every package.
    - `pnpm test` passed 163 files with 2517 tests, after the PR review fixes.
    - The run before that one failed once in agent's `run-context.browser.test.ts`, a file this branch does not touch, with "Page.captureScreenshot: Unable to capture screenshot". It passed alone, 12 of 12, and in the full rerun.

## Outcome

Built as `docs/specs/2026-10-07-s4-09-io-any-url.md` designs it. Where it differs from this file:

- **`same-site` is refused too.** An app under test on another `localhost` port is `same-site` to io, not `cross-site`. Nothing of ours sends `same-site`: web reaches io through its proxy, as `same-origin`.
- **`url=` refuses `file:` and the like, and credentials, as core's `AxeUrl` on `HttpUrl` does.** io's own host is refused by the middleware instead (branch review): if io's Chromium opened io, the request would pass the host check with `Sec-Fetch-Site: none`, so `Sec-Fetch-Site: none` with `Sec-Fetch-Mode: navigate` is a 403.
- **One loader for both kinds of page, on agent's `settle`.** Agent's barrel now exports `settle.js`, so io's own font wait is gone, which closes s3-05's follow-up. A page on the target app's origin settles strictly, as before, and is measured byte for byte the same. Any other page:
  - settles leniently;
  - gets a run's 30 s load, with each deadline 20 s longer.

  Every page settles and is measured or scanned inside `retryOnNavigation`, as a run's step is. A navigation that cuts the work off has it run again on the new document; one that lands after the work ends is not seen.
- **Strict by origin.** A `url=` on the target app's own origin loads strictly and waits for styles, as `page=` does, for `/measure` and `/axe` alike, since it can share a `page=` key (PR review).
- **Without a stylesheet wait.** Off the target app a scan does not wait for stylesheets: the wait refuses a page with no stylesheet at all. A stylesheet that failed to load never held the wait up, since Chromium gives a failed link a `sheet` too (PR review).
- **A foreign run's pages:** every http(s) page a step stood on, on any origin, with the hash dropped. A redirect to `www.` keeps its pages, and a skip link's `#main` is not a page of its own.
- **More files than listed:**
  - `page-ref.ts`, new: the `PageRef` both routes and the Analyst use;
  - agent's `index.ts`;
  - core's `fixtures/index.ts`;
  - io's `test-app.ts`, `db/axe.test.ts`, `analyse.ts`, `seed-demo-cli.ts` and `seed-demo.browser.test.ts`;
  - web's two Lens test helpers, which read the fixture's new key. No web app code changed.

## Out of scope

- The Lens's URL field and its copy: `s3-16`.
- Scout over HTTP and the sweep on a stored task: `s4-10`.
- Measuring a page again without restarting io. Restarting clears the cache.
- iframes, shadow DOM, cookie banners, logins.

## Notes for the reviewer

- The migration: check that a stored target-app scan is either kept with its origin or re-scanned, never served for another site.
- The middleware is a security change. Try it through the dev proxy, with `curl -H 'Host: evil.test'`, and with `curl -H 'Sec-Fetch-Site: cross-site'`.
