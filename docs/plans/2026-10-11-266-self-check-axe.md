# #266 — Self-check: run axe-core on every listed screen, in both themes, in CI: plan

Task: issue #266 (no task file: an issue fix, "Fix #266" on `main`) · Spec: none (S; the issue is the spec)
Status: approved 2026-10-11 (auto)

The issue's acceptance:

1. `pnpm test` runs axe-core with `AXE_WCAG_TAGS` on every `SELF_CHECK_SCREENS` entry in Daylight and in Night, skipping the entry's `exclude`. It fails on any violation and names the rule and the elements.
2. An icon button with no `aria-label`, added as a probe and not committed, makes it fail.
3. `@axe-core/playwright` is a web devDependency at the version io resolves, `pnpm-lock.yaml` holds no second `axe-core`, and `docs/STACK.md` has its line.
4. `docs/DESIGN.md`, "Checked by", says that `pnpm test` runs axe on the listed screens, names the tags, and says best-practice rules are left out.
5. The PR states how much time the pass adds to `self-check.browser.test.ts` on CI, and the job stays inside its 15 minutes.

Measured on `140fdcb` with a throwaway probe over the 21 entries in both themes (axe-core 4.13.0, Chromium, Windows):

- 0 WCAG violations in all 42 scans, with 23 to 33 rules passed in each, `button-name`, `nested-interactive`, `color-contrast`, `target-size` and the `aria-*` rules among them. The pass needs no fix and turns no rule off.
- Left for review (`incomplete`), which fails nothing: `color-contrast` on 12 entries, where axe cannot settle the background (a ground drawn by another element, an `aria-hidden` arrow glyph, a one-character label, SVG text, an open hint or spec sheet over the page), and `video-caption` on run detail's recording.
- Scanned whole, the stage included, the three Lens entries are clean too: the stage draws its boxes in `text-ink`, not in the target page's colours. Its `exclude` is a guard for now.
- Best-practice rules flag `region` alone, on Radix's popper wrapper in `cast-card` and `report-hint`, as PR #261 found for the hints.
- A scan takes 0.54 to 1.18 s, 0.76 s on average: 32 s over the 42.

| # | Step | Files | Serves | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | The dependency: `@axe-core/playwright` `^4.13.0` in web's devDependencies | `packages/web/package.json`, `pnpm-lock.yaml` | 3 | — | The lockfile gains web's importer entry at `4.13.0(playwright-core@1.63.0)` and no package entry; `pnpm-workspace.yaml` unchanged | — |
| 2 | The pass. In "every listed screen passes", after `checkScreen` and on its page, `AxeBuilder` with `AXE_WCAG_TAGS`, and `.exclude(screen.exclude)` when the entry has one; each violation as its rule id and its elements' selectors, expected `[]`. `newPage` opens its page in a context of its own. The case's name says it runs axe. A page built to fail, with two buttons that have no name, one inside an exclude, shows the scan names what it finds (review) | `packages/web/scripts/self-check.browser.test.ts` | 1, 2 | This is the test. A probe, an icon button with no name on the Cast screen, turns it red | The 42 cases green; with the probe, the four Cast cases red on `button-name` and the rest green; the fake page's case red with the helper's tags, its violations or its exclude broken; the whole file green | — |
| 3 | The docs: DESIGN's "Checked by" and a row in STACK's Web table | `docs/DESIGN.md`, `docs/STACK.md` | 3, 4 | — | Read against boxes 3 and 4 | — |
| 4 | Verify | — | all | — | `pnpm lint`, `pnpm typecheck`, `pnpm test`; on CI, the file's time against `main`'s 105 s, and the job under 15 minutes | — |

The task is S, so it is built in this session, not fanned out.

## Decision log

| Question | Taken | Why |
|---|---|---|
| Where the scan runs | In "every listed screen passes", on the page `checkScreen` measured | The issue's recommendation: 42 scans, no screen opened twice, so the cost is axe's run alone |
| Which rules | `AXE_WCAG_TAGS` only | io scans the target app with the same tags, so Wayford's screens meet the bar its report sets for a target page. Best-practice rules are no WCAG criterion, and `region` flags Radix's portals (above) |
| How a failure reads | The violations mapped to `{ rule, targets }` and compared to `[]` | vitest's diff then prints each rule id and the selector of each element it flags |
| What fails | Violations only; what axe leaves for review fails nothing | As io keeps violations only (`scanOf` in `packages/io/src/axe-scan.ts`). A review item is axe saying it cannot decide |
| How the page is made | `newPage` makes a context of its own, for every test in the file | axe's `analyze()` opens a second page in the page's context (`finishRun`), which Playwright 1.63 refuses on a page from `browser.newPage()`. Each page had a context of its own before too, so nothing else changes |
| Where the scan's code lives | A helper in the test file, not in `self-check.ts` | `check:self` stays as it is (the issue), and `self-check.ts` is what it loads under plain `tsx` |
| The Lens stage | Skipped, as `checkScreen` skips it | The issue's acceptance, and DESIGN's reason: the stage redraws the target page on purpose. Scanned whole it is clean today, so the skip is a guard |
| A version in the STACK row | None | `docs/STACK.md:3`: the lockfile is the source of truth |
| A committed check that the scan finds anything (branch review's question) | A page built to fail, as `checkScreen`'s own failures are shown: two buttons with no name, one inside `#stage`; `button-name` names both, and only the one outside when `#stage` is excluded | Every listed screen passes, so a scan that found nothing would pass them all. axe-core 4.13 raises nothing on a tag it does not know and runs no rule (probe: `withTags(["wcag2x"])`). The case fails on that, on a helper that drops what axe found, and on an exclude left off (three mutation probes). It costs under a second |

## Review

`branch-reviewer` at `c85b2cf` found the code ready, with nothing to cut. Its probes confirmed the scan runs while the hint is open, the exclude skips what sits in the stage, and best-practice flags `region` alone. Its one blocking finding was the PR body's CI timing, still a placeholder then; the body now gives it. Its one question led to the page built to fail above.
