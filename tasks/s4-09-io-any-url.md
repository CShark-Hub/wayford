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

- [ ] `pnpm --filter @wayford/io test` passes and includes:
  - `GET /measure?url=` and `GET /axe?url=` on a fixture page served on a second port, measured and scanned;
  - the same path on two origins stored and served as two results;
  - a request with a foreign `Host`, and one with `Sec-Fetch-Site: cross-site`, refused, and nothing measured or scanned;
  - the Analyst on runs of an app on `localhost:<another port>` cites none of the target app's violations, and cites that app's own;
  - a report over runs that visited more than ten foreign pages scans ten.
- [ ] Under `pnpm dev`, `curl 'localhost:3000/measure?device=desktop&url=https://example.com/'` returns a measurement, and `/axe?url=…` a scan. The PR shows both. Use the io port `pnpm dev` prints.
- [ ] The Lens on `/deliveries`, `/account` and `/settings/data` is unchanged, through the dev proxy
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- The Lens's URL field and its copy: `s3-16`.
- Scout over HTTP and the sweep on a stored task: `s4-10`.
- Measuring a page again without restarting io. Restarting clears the cache.
- iframes, shadow DOM, cookie banners, logins.

## Notes for the reviewer

- The migration: check that a stored target-app scan is either kept with its origin or re-scanned, never served for another site.
- The middleware is a security change. Try it through the dev proxy, with `curl -H 'Host: evil.test'`, and with `curl -H 'Sec-Fetch-Site: cross-site'`.
