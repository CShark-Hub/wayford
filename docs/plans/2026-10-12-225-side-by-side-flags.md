# #225 — Lens: evidence flags overlap on dense pages, side by side: plan

Task: issue #225 (no task file: an issue fix, "Part of #225" on `main`) · Spec: none (S; the issue is the spec)
Status: approved 2026-10-12 (auto)

What is left of the issue after #270, which merged removed neighbours stacked one under another (`docs/DEMO.md`, "Gaps the rehearsal hit"):

1. Removed elements side by side, as a header's links, share one flag with their count, as stacked ones do since #270: the target app's header (Zoya on every page; Vera at targetPx 48 or fontPx 20) and cshark.com's (Vera's P4 flags, Kai's A1 flags), in the Evidence view at 1280 × 720.
2. Nothing #270 merges changes: beat 3, Kai on `/settings/data`, still reads `A1 · attention │ ×5` and `│ ×2`, unclipped.
3. The drawn page itself stays unchanged: the Lens draws only what `perceive` returns (F2 AC3).

Measured on `main` `6dfda40` at 1280 × 720, light and dark alike, fitted:

- The target app's nav links, Home to Settings, are 8 px apart, each 46 px tall at y 12. Zoya's lines (`P3 · 17 < 24`, `P4 · 46 < 48`), or Vera's at targetPx 48 (`P4 · 46 < 48`) or fontPx 20 (`P3 · 17 < 20`), are the same on all four, so their four flags, all to the left, overlap in 4 pairs.
- cshark.com is fitted at about 0.37. Vera's P4 cut removes the logo (`P4 · 21.3125 < 32`) and four nav links (`P4 · 16 < 32`): Projects and About 35.5 px apart, then Careers, which stays, then Blog and Resources 35.6 px apart. Its cookie banner, a paragraph and three buttons 15, 8 and 8 px apart, is removed by her P3 cut, or by Kai's attention cap. The header draws 9 overlapping pairs for Vera; the banner 5 for each. Kai's header is kept on today's page: his A1 flags are the banner's.

| # | Step | Files | Serves | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | `flagRuns` takes #270's columns first, as they are. Then rows, among the removed elements no column took: in order across, each overlapping the one before it down and starting less than `ROW_GAP_PX`, 40 measured px, right of its edge, with the same lines. Any other removed element between the row's last member and the next, a column's member included, ends the row: it overlaps the last member down and starts at or past its right edge. One that starts under the last member lies behind the row and ends nothing. The leftmost carries the flag | `packages/web/src/preview/perceived-page.tsx` | 1, 2 | `perceived-page.test.tsx`: a nav of four makes one run, in any order and a little out of line; a V2 between two A1s, a gap of 40 px, and no overlap down each break a row, 39 px joins; a list of label-and-button entries stays two columns | The new tests green, and #270's | — |
| 2 | The row's flag: at the row's middle, beside it, on the side `flagSide` picks for the row's box, past its outer edge, with the count column. `runStyle` already reads only the run's box | `perceived-page.tsx` | 1, 3 | The render test: the nav at the page's right takes its flag on the left, `right` 76 and `top` 15, the rest unflagged with their lines; at the page's left, on the right, `left` 435. The existing "a flag sits beside its element" test: Zoya's four nav links draw one flag, Home's, `×4`, on the left | Green | — |
| 3 | DESIGN's FilterStates row says side by side too; DEMO's row under #225 says what is left | `docs/DESIGN.md`, `docs/DEMO.md` | — | — | — | — |
| 4 | Verify | — | all | — | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `check:self` with 0 shortfalls; the cases above measured again, with Kai on `/settings/data`, screenshots looked at | — |

## Decision log

| Question | Taken | Why |
|---|---|---|
| What makes a row | Same lines, each overlapping the one before it down and starting less than 40 measured px right of its edge, with no other removed element between | The row is #270's column turned across: it reads measured boxes only, never the scale, so the flags are the same fitted or at full size, and it is testable without a browser |
| The gap | 40 px | The smallest round number over both headers' gaps: the target app's 8 px and cshark's 35.5 px. The next gap on cshark's header, 146 px, holds a link that stays, Careers; a row reaching past it would count links that are not neighbours |
| An element that could join a column and a row | The column takes it: columns are found first, as #270 finds them, and a row only joins the elements no column took | Every run #270 makes stays the same, beat 3 included. Taken row first, a list whose entries each hold a removed label and button would draw a flag per entry, 43 px apart, which overlap, where the columns draw two. A column's member still ends a row it lands in |
| Where the row's flag sits | `runStyle` as it is: the row's middle, beside its outer edge, on the side `flagSide` picks for the row's box | One rule for both directions. The target app's nav, at the page's right, takes its flag on the left, clear of the logo's |
| Which member carries it | The first in its order: the topmost of a column, the leftmost of a row | It is drawn by its own outline, as #270's is; `runStyle` sets it from the run's box, whichever member it is |
| What is not cleared | Vera's header on cshark, fitted at about a third: 2 overlapping pairs of 9; at full size the two nav pairs' flags still cross over Careers | The two nav pairs' flags face each other across Careers, and the logo's flag, `P4 · 21.3125 < 32`, has another value, so it never merges. A 150 px gap would merge all four links past Careers and leave 1 pair fitted; it is not taken, for the reason above. That case stays under #225 |

## Review

| Finding | Done |
|---|---|
| No test checks that a column's member ends a row it lands in: mapping column members out of the rows instead of to no lines left all 34 tests green | Fixed. "A row breaks where…" gains a case: A1 cuts at x 0 and x 135, 100 px wide, with a two-member column at x 105, 20 px wide, at y 0 and y 30. Counts `[1, 2, null, 1]`. Green on `d6cc165`, red under that mutation |
| `docs/DEMO.md`'s #225 row says Vera's cshark header overlaps "fitted at about a third", which suggests Full size is clean; at full size the two nav-pair flags overlap by 118 × 22 px over Careers | Fixed. The row adds that at full size the two pairs' flags still cross over Careers; the decision log's "What is not cleared" says the same. No flag changed, so no new screenshots |

## Review at a2a6eb4

| Finding | Done |
|---|---|
| Should fix: the row pass ended a row on any removed element with other lines that overlapped its last member down and started right of its left edge, so one lying behind the row, not between its members, split it. On cshark.com the V3-covered "Our commitment…" paragraph (x 196 to 1084, y 596 to 673) lies behind the cookie banner and split it: `flagRuns` gave `[1, 1, 3, null, null]` for the covered paragraph, the banner's paragraph and its three buttons, and Vera drew `P3 · 14 < 16` beside `P3 · 14 < 16 │ ×3`, Kai `A1 · attention` beside `A1 · attention │ ×3` | Fixed, as the docs say. The row's break test is now `down(last, next) && next.bbox.x >= last.bbox.x + last.bbox.width`: `chain` reads the row in order across, so an element starting at or past the last member's right edge lies before any later member, between the two. A new test, "an element behind a row, not between its members, never ends it", holds the boxes io measures on cshark.com for the Lens: `[1, 4, null, null, null]`, the row's box x 25, width 1230. Red on `a2a6eb4`, green now. With 25 px of room on either side, the banner's flag goes inside its paragraph's outline; measured live, it collides with nothing, and Vera's cshark page drops from 3 overlapping pairs to 2 |
| Known follow-up, not changed: the column pass has the same broader break. It passes `across` as its break test, with the elements in order down, so a removed element with other lines that overlaps a column's last member across and starts below its top, inside it, ends the column even when it lies behind the column rather than between two members. The docs' "between" would be `across(last, next) && next.bbox.y >= last.bbox.y + last.bbox.height` | Left as #270 merged it: beat 3 depends on the column pass, and none of the six measured cases hits the difference: their runs come out the same under that break. A follow-up under #225 |
| Cut list: the `link.lines === undefined` guard in `chain`'s `find`, and opening a run led by an unmarked element closed, never change the result | Taken: every run opens, and the `find` drops the guard. An unmarked element joins only a run of unmarked ones, which is dropped. The marker still matters: mapping a column's members out of the rows, instead of to no lines, turns "a row breaks where…" red |
| Nit: the `run` prop's doc said `null` means "the element above it carries its flag" | It says "the element above it, or to its left in a row" |
| Nit: the chain member's type was named `Link`, which this file uses for link elements | Renamed `Member`, with its uses |
| Nit: the `ROW_GAP_PX` comment read as a guarantee, and said a row's flag would cover a link in between | It says what was measured: on those two headers the next gap holds a link that stays. A row reads removed elements only, so a shown element narrower than the gap does not end it; the flag sits past the row's edge, so no claim about covering |
