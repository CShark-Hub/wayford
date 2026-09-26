# s1-02 — DOM metrics collector and the seed test on the target app

Stream: s1
Milestone: week 2
Size: L
Depends on: s1-01

## Context

Read first, in this order:

- `docs/RULES.md` stages 1 to 3: what P1 to P4 measure
- `docs/PLAN.md` section "Filter internals"
- `packages/core/src/measurement.ts` after s1-01, and `observation.ts` (`elementKey`)
- `packages/target-app/README.md` — pages, parameters, and how parameters persist in a tab
- `docs/STACK.md` sections "Core and filter" and "Target app"

## Goal

Given a Playwright page, the filter produces its `PageMeasurement`, and collect-then-perceive twice with the same seed on the running target app gives identical observations: the week 2 exit criterion for stream 1.

## Interface

- In: a Playwright `Page` showing any web page
- Out: `collect(page): Promise<PageMeasurement>` from `@wayford/filter` (not from `./perceive`); `measurementFixture` in core regenerated from its output
- Files expected to change: `packages/filter/src/**`, `packages/filter/package.json`, `pnpm-lock.yaml`, root `package.json` (`test:unit`, if missing), `packages/core/src/fixtures/measurement.json`, `.github/workflows/ci.yml` only if it exists

## Constraints

- Measurement only: no thresholds, no profile, no decisions. Those are `perceive` (s1-01).
- Contrast is the WCAG 2.2 relative-luminance ratio, in our own code, tested against published values: black on white 21:1, `#767676` on white 4.54:1, `#777777` on white 4.48:1. The background is the effective one: walk the ancestors, compositing alpha, until an opaque colour. A text colour with alpha is composited too.
- Font size is the computed CSS pixel size. Target size is the smaller side of a control's bounding box.
- Measured: every control, and every text block (heading, paragraph, list item, label) with visible text, as `docs/RULES.md` says. Elements with `display: none`, `visibility: hidden` or `aria-hidden="true"` are not measured.
- Role and accessible name: for every element measured on the target app, `page.getByRole(role, { name, exact: true })` resolves to it. The key is `elementKey` from core, over the element's named landmark ancestors.
- `@wayford/filter/perceive` stays browser-safe, so `collect` lives outside it. Playwright is a dev dependency of `filter`: `collect` takes the page from its caller.
- Tests start the target app themselves, with no manual `pnpm dev`, and load pages with all three parameters on the URL, as `packages/target-app/README.md` requires.
- Browser tests live in files ending `.browser.test.ts`. If the root `package.json` has no `test:unit` yet, add `"test:unit": "vitest run --exclude \"**/*.browser.test.ts\""`; s2-02 adds the same line, so whichever lands second keeps it as it is. `pnpm test` still runs everything.
- If `.github/workflows/ci.yml` exists by then (issue #28), install Chromium there for the browser tests.

## Acceptance

- [ ] `pnpm --filter @wayford/filter test` passes and includes `contrast.test.ts` and `collect.browser.test.ts`
- [ ] `collect` on `/deliveries` at default parameters matches the regenerated `measurementFixture` in keys, roles, names, kinds, contrast and font size. Boxes are not compared: the target app bundles its one font (issue #32), but glyph positioning can still differ between operating systems.
- [ ] The "Order archive" link measures within 0.01 of 2.006:1 at `?contrast=2&fontPx=16&targetPx=36` and within 0.01 of 7.005:1 at `?contrast=7&fontPx=16&targetPx=36`
- [ ] For every element `collect` returns on each of the six target-app pages, `getByRole(role, { name, exact: true })` finds it
- [ ] Collect-then-perceive twice on `/deliveries` with Vera and seed 7 gives string-equal `renderObservationForModel(toActorObservation(...))`
- [ ] With a hard contrast cut of 3.0, the "Order archive" link is absent from the Actor-facing text at `?contrast=2` and present at `?contrast=7`
- [ ] `pnpm test:unit` runs without launching a browser, and `pnpm test` runs the browser tests
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Thresholds and decisions (s1-01), CDP vision-deficiency emulation and screenshots (s2-02), axe-core (week 4).
- Changes to `packages/target-app`. If the app needs one, stop and report.
- A harness that runs a whole task: browser context per persona, video, trace, fake cursor. That is s2-02.

## Notes for the reviewer

- Compare the regenerated fixture with the hand-measured one from s1-01. A large difference is either a collector bug or a measuring mistake in s1-01; find out which before merging.
- The accessible-name check against `getByRole` is what keeps the element key stable. Do not accept a weaker version.
