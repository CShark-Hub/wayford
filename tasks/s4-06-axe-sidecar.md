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

- [ ] `pnpm --filter @wayford/io test` passes: a scan of a fixture page with a known contrast failure stores and returns that rule; a second request does not rescan; a page outside `TARGET_APP_PATHS` is a 400 and scans nothing
- [ ] `GET /axe?page=/settings/data` at the defaults returns its result. Either it is 0 violations, or the PR lists them, and `docs/DEMO.md` beat 3 is changed to match.
- [ ] In the preview on `/deliveries` and `/settings/data`, the card shows each page's count, and the PR shows both
- [ ] Once `s4-04` is in: `pnpm --filter @wayford/io test` passes with a page that has an axe violation, which a run visited, giving a `measurement` finding carrying its `axeRuleId`
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Scanning during runs, or pages outside the target app.
- The RULES calibration check that every P1 to P4 removal has an axe counterpart.

## Notes for the reviewer

- Check that the tags passed to axe match the card's words.
