# s4-06 — axe-core sidecar

Stream: s4
Milestone: week 4
Size: M
Depends on: none. Its report box waits for s4-04.

## Context

Read first, in this order:

- `docs/PLAN.md` F10 and `docs/DEMO.md` beat 3 ("This page passes WCAG — axe finds nothing")
- `docs/RULES.md` "Calibration", the axe row
- `docs/STACK.md` — `axe-core` through `@axe-core/playwright`
- `packages/io/src/live-measure.ts` and `routes/measure.ts` — how io already loads a target-app page in Chromium for the preview
- `packages/web/src/screens/preview.tsx` — where the card goes
- `packages/io/src/analyst.ts` from `s4-04` — where the report's findings are assembled, for the report box

## Goal

io scans each target-app page with axe-core once per page and app parameters, stores the result, serves it, and the preview shows the current page's violation count on a card. The report cites each violation on a page its runs visited as a `measurement` finding.

## Interface

- In: a target-app path and the app parameters
- Out:
  - an `axe_results` table keyed by URL: rule id, impact, the WCAG tags, the node count, when it was scanned;
  - `GET /axe?page=/settings/data` in io, which scans on a miss and returns the stored result after. `page` is checked against `TARGET_APP_PATHS`, as `GET /measure` checks it, so the scan stays on the target app;
  - a card beside the preview: "axe-core, WCAG 2.2 A and AA: N violations", with the rule ids;
  - in the report (`s4-04`), one `measurement` finding per axe violation on a page a run of the report visited, carrying its `axeRuleId`, with evidence on the steps that stood on that page. Code writes it; the Analyst writes its recommendation, as it does for the `deterministic` findings.
- Files expected to change: `packages/io/src/axe*.ts`, `routes/axe.ts`, `db/`, a new migration, `packages/io/package.json`, `packages/io/src/analyst*.ts`, `packages/web/src/api/axe.ts`, `screens/preview.tsx` and its test

## Constraints

- axe is a measurement, never a filter input. Nothing in `packages/filter` reads it, and the Actor never sees it.
- Rules limited to the WCAG 2.2 A and AA tags, so the card's claim is exactly what was checked.
- The scan is by page, not by run. The pages are the same for every persona at fixed app parameters (F10, simplified on 2026-10-04).
- A failed scan shows "axe did not run" on the card, never "0 violations".

## Acceptance

- [x] `pnpm --filter @wayford/io test` passes: a scan of a fixture page with a known contrast failure stores and returns that rule; a second request does not rescan; a page outside `TARGET_APP_PATHS` is a 400 and scans nothing
  - `axe.browser.test.ts`, on the served build and the real scanner: "/deliveries at the defaults: color-contrast, WCAG 2 AA, stored and returned", "a second request reads the store and does not scan again", "a page outside the app is a 400 and scans nothing". The same cases on a fake scan in `routes/axe.test.ts` and `axe.test.ts`.
- [x] `GET /axe?page=/settings/data` at the defaults returns its result. Either it is 0 violations, or the PR lists them, and `docs/DEMO.md` beat 3 is changed to match.
  - 0 violations, so beat 3 stands. Under `pnpm dev`: `{"url":"/settings/data?contrast=2&fontPx=16&targetPx=36","scannedAt":"2026-10-06T09:35:24.405Z","axeVersion":"4.13.0","violations":[]}`, HTTP 200. Also "/settings/data at the defaults returns its scan, stored" on the served build, and the `axe-scans.json` fixture.
- [x] In the preview on `/deliveries` and `/settings/data`, the card shows each page's count, and the PR shows both
  - Under `pnpm dev`: `/deliveries` reads "axe-core, WCAG 2.2 A and AA: 1 violation", `color-contrast, 1 element`; `/settings/data` reads "0 violations". Screenshots in the PR. `preview.test.tsx` and `preview.browser.test.ts` check both counts, and "axe did not run" with no count on a failed scan.
- [x] Once `s4-04` is in: `pnpm --filter @wayford/io test` passes with a page that has an axe violation, which a run visited, giving a `measurement` finding carrying its `axeRuleId`
  - `analyst.test.ts`, "a violation where the runs stood is a measurement, listed first and keyed with the rest": `axeRuleId: "color-contrast"`, evidence on the first step of each run on `/deliveries`, the Analyst's recommendation by its key. `analyst-axe.test.ts` covers which runs and pages count.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root
  - After the review fixes, the simplify pass and the PR reviews: `pnpm lint` and `pnpm typecheck` exit 0, and `pnpm test` passes with 124 files passed and 1 skipped, 1859 tests passed and 3 skipped. In the first run, before the review, one load flake outside this branch, agent's `scout.browser.test.ts` (a Scout attempt crashed), passed alone (3/3).

## Outcome

Built as `docs/specs/2026-10-06-s4-06-axe-sidecar.md` designs it. Where it differs from this file:

- **The scan's shape is in core.** `AxeScan` lives in `packages/core/src/axe.ts`, with real scans as the fixture `axe-scans.json`: io stores and serves it, and web parses it.
- **Desktop only.** Each page is scanned once per app parameters, on desktop. The card and each finding say so.
- **More files than listed.** `live-measure.ts` shares its page loading with the scanner, `app.ts` builds the one lookup that `/axe` and `/reports` share, `server.ts` and the `analyse` CLI wire the scanner, and `preview.browser.test.ts` answers the card's fetch.
- **Reports scan on a miss.** A report scans any page it needs that isn't stored yet, so it doesn't depend on the preview having opened the page. A failed scan costs only that page's findings, logged; the report is still built.
- **Stored scans never expire.** A scan is kept until cleared: `DELETE FROM axe_results` scans again.
- **The scanner waits for styles.** It waits for the page's stylesheet before running axe. The first scan ever of `/settings/data` reported `target-size` on links that pass once styled, and 26 scans after it did not.

## Out of scope

- Scanning during runs, or pages outside the target app.
- The RULES calibration check that every P1 to P4 removal has an axe counterpart.

## Notes for the reviewer

- Check that the tags passed to axe match the card's words.
