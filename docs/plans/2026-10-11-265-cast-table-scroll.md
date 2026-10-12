# #265 — Report: in a narrow window only the cast table should scroll sideways, not the whole page: plan

Task: issue #265 (no task file: an issue fix, "Fix #265" on `main`) · Spec: none (S; the issue is the spec)
Status: approved 2026-10-11 (auto)

The issue's acceptance:

1. On the hard goal's Report, with the self-check fixture and with a ten-seed report: at 768 and 375 px wide, `document.documentElement.scrollWidth` equals the window width. At 320 px, nothing inside `<main>` ends past the viewport.
2. When the window is narrower than the table, only the cast table scrolls sideways. The findings grid, the header and the footer are no wider than the window minus its gutters, and the three findings Info buttons are inside the viewport.
3. Nothing moves at 1280 × 720: "a ten-seed report fits 1280 × 720" passes unchanged, `check:self` passes in both themes, and axe passes.
4. At 375 px, Tab reaches the cast table's two Info buttons and their hints open inside the viewport. The hints test's 320 px case still passes.
5. A browser test pins the narrow widths and fails on `main` (918 px at 768).

Measured on `main` `140fdcb` (Chromium, 720 px high, the hard goal's Report, fonts loaded), the issue's table holds to the pixel. The page is 918 px wide (925 with ten seeds) in any window of 900 px or less. From 920 px down, the page column takes the cast table's minimum width, 886 px (893), and the header, the findings and the footer take it too.

Moving the table into an `overflow-x-auto` box by script brings the column back to the window, but the page stays 906 px (913) wide: a `NoValue`'s `sr-only` reason is positioned against the page. With `relative` on the box too, the page is as wide as the window at every width tried, 375 px included. At 320 px it is 373, the top bar's own overflow.

| # | Step | Files | Serves | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | The checks, listed under this table | `packages/web/src/screens/report.browser.test.ts` | 1, 2, 4, 5 | This is the test. It fails on `main` with "the page at 768 px: expected 918 to be 768" (925 with ten seeds) | `pnpm --filter @wayford/web exec vitest run src/screens/report.browser.test.ts` fails on the new tests only | — |
| 2 | The box: the table goes inside `<div className="relative overflow-x-auto">`, and the file's header says why | `packages/web/src/report/cast-table.tsx` | 1, 2, 3, 4 | Step 1's tests | Step 1's tests pass, and so do `report.test.tsx` and `scripts/hints.browser.test.ts` | — |
| 3 | Verify | — | all | — | `pnpm lint`, `pnpm typecheck` and `pnpm test` pass. `pnpm --filter @wayford/web check:self` shows 0 shortfalls in both themes. A one-off axe scan finds 0 WCAG violations at 1280, 768, 375 and 320 px in both themes. Every element's box in `<main>` at 1280, 1024 and 1023 px matches `main`'s | — |

Step 1's checks:

- With the self-check's report and with a ten-seed one, on one page resized to 1280, 768, 375 and 320 px:
  - the page is as wide as the window, except at 320 px;
  - nothing in `<main>` but the table's content ends past the window;
  - the table's box scrolls across only below 1280 px, and never down;
  - the header, the findings and the footer are no wider than the window less its gutters, with 8 px of slack at 320 px (see the decision log);
  - the findings' three Info buttons lie inside the window.
- At 375 px, Tab reaches the two cast-table Info buttons:
  - each button shows inside the box and inside the window;
  - its hint, the button's description, opens inside the window;
  - the box has scrolled.

The task is S, so it is built in this session, not fanned out.

## Decision log

| Question | Taken | Why |
|---|---|---|
| Where the fix goes | The cast table in a box of its own, `relative overflow-x-auto`, as the issue recommends | The page column is a grid, and its one column is as wide as its widest item's minimum width. A scroll container's minimum width there is 0. The Runs screen wraps its table in such a box already (`runs.tsx`) |
| `relative` on the box | Kept | Without it, a `NoValue`'s `sr-only` reason ("no run got through") has no positioned ancestor and is placed against the page. Measured: 906 px at 768 (913 with ten seeds). The new test fails without `relative` |
| A fade, a shadow, a role, a name or a tab stop for the box | None, as the issue says | The scrollbar and the column cut off at the box's edge show that it scrolls. Every row has links inside the box. Tab reaches them and scrolls the box, and the arrow keys scroll it from there: 0 to 80 px from a persona link, measured. A tab stop of its own would add one at 1280 px too, where nothing scrolls. axe's `scrollable-region-focusable` passes at 768, 375 and 320 px |
| A narrower table (wrapped header labels, stacked rows) | No, as the issue says | It is more work, and it changes the 1280 × 720 picture DESIGN pins |
| What "nothing inside `<main>` ends past the viewport" checks at 320 px | Every element in `<main>` except the table's content, which its box clips. The box itself is checked | By design, the table's cells end past the window inside the box that scrolls. At 320 px the top bar makes the page 373 px wide on every screen (`top-bar.tsx`), which the issue leaves out. At 768 and 375 px the test checks `scrollWidth` itself, which also catches a `sr-only` span that escapes the box |
| The gutter check at 320 px | Kept, with 8 px of slack: at 320 px the header, the findings and the footer may run up to 8 px into the right gutter (CI; the slack from the teammate review) | CI on Linux failed the strict check: the findings were 261.2 px wide against a 256 px column. A finding card is as wide as its widest tag, which never breaks, plus 42 px of padding and border. The Measurement card's "axe · color-contrast" tag is 211 px wide on Windows and 219 on Linux, where its 20 characters of Geist Mono set 8 px wider. So on Linux the column runs 5 px into the right gutter at 320 px, and nothing passes the window. 8 px covers that and still fails a new intrusion: a 285 px section turns the test red at 320 px. Dropping the check, as the first CI fix did, let it through. The tag is shared with the Lens, Race and Cast screens, and lies outside this issue: #269 lets a finding's tag break, and then the check is strict at 320 px again. At 768 and 375 px the check holds on both systems with no slack |
| Where the tests live | In `report.browser.test.ts`, beside "a ten-seed report fits 1280 × 720" and its `tenSeedReport` | The fit tests live there. Open PR #263 edits `hints.browser.test.ts`'s header, so a test there would collide with it |
| How the Tab test places the button | Inside the box's visible part and inside the window, not only inside the window | A button the box clips can still lie inside the window. On `main`, Tab leaves the second Info button partly past the window: x 352.9 to 384.9 at 375 px |
| How the hint's bubble is measured | `getByRole("tooltip")` itself (build) | Radix puts the role on the bubble itself when the content has no `aria-label`, and `Hint` passes none (`@radix-ui/react-tooltip` 1.2, `TooltipContentImpl`). The bubble measured 320 × 138 at 375 px |
| `docs/DESIGN.md` | No change | DESIGN pins the 1280 × 720 fit, which this leaves as it was, and it names no rule for narrower windows. A general rule ("a wide table scrolls in its own box") would claim more than the app does: the Boundary's value table has no such box. In a probe, the Boundary is 886 px wide at 375 px |
| The projector at 150 % zoom (`docs/DEMO.md`, "Zoom checked on the projector") | Said in the PR, not changed in DEMO | At 853 CSS px the page no longer scrolls. The cast table scrolls inside its 789 px box, so its median column sits past the box's edge. The table fits whole from 950 px with the fixture and 957 px with ten seeds; 125 % zoom (1024 px) fits. Below 1280 px its cells wrap and its rows grow, as on `main`. With ten seeds, a row is 87 px tall at 1280, 163 at 1024 and 201 from 958 down (branch review) |

## Review note

The branch review (`branch-reviewer`, cold) found nothing blocking.

- Fixed: the check on the findings' Info buttons passed even when its locator matched nothing. It now counts three first, and that mutation turns both cases red.
- Taken: the projector row above now says the table's rows grow below 1280 px, as on `main`. It is measured on both.
- For the top bar's follow-up, not this issue: with a classic 15 px scrollbar, as in Chrome on Windows, the top bar already runs past a 375 px window. The headless tests hide scrollbars.

A teammate's review (gstysiak-cshark, at `09e6ce9`) confirmed the PR's mutation claims on macOS.
- Taken: the gutter check at 320 px is back, with 8 px of slack instead of none. The Tab test waits for the fonts before it measures.
- The follow-up for the tag is #269, which the teammate filed. The test's comment cites it, and says the slack goes once it lands (re-review at `492e796`).
