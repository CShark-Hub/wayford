# #225 — Lens: evidence flags overlap on dense pages: plan

Task: issue #225 (no task file: an issue fix, "Fix #225" on `main`) · Spec: none (S; the issue is the spec)
Status: approved 2026-10-11 (auto)

What the issue asks (it lists no acceptance boxes):

1. Kai on `/settings/data`, Evidence view (demo beat 3), at 1280 × 720: no flag overlaps another, and none runs off the frame.
2. The drawn page itself stays unchanged: the Lens draws only what `perceive` returns (F2 AC3).

Measured on `main` `dd4d56a` at 1280 × 720 against the live target app, light and dark: the frame is 663 × 374 and the page is drawn at about 0.52. Under "What we keep", Kai's cap removes five links 43 px apart. Each draws its own `A1 · attention` flag, about 22 px tall at full size, so the five sit edge to edge, their leaders zig-zagging between the outlines. Under "Your rights" the paragraph's flag is drawn inside its outline and the button's beside it, at the canvas's crop, where it is cut off. At full size the flags have room, but read as eight separate claims.

| # | Step | Files | Serves | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | `flagRuns`: removed elements stacked one under another, each starting less than 48 measured px below the top of the one above it, overlapping it across, with the same flag lines, form a run. The topmost carries the run's flag; the rest map to `null` | `packages/web/src/preview/perceived-page.tsx` | 1 | `perceived-page.test.tsx`: the five links make one run of 5, in any order; a V2 between A1s, side-by-side nav links, and 48 px apart each break a run, 47 px does not | The new tests green | — |
| 2 | The run's flag: `A1 · attention ×5`, centred on the run, past its widest edge (`CutFlag` takes a `style`). The others keep their lines in an `sr-only` span, so a screen reader still hears what removed each. A lone element keeps `CutFlag`'s own place, its markup unchanged | `perceived-page.tsx`, `components/filter-states.tsx` | 1, 2 | The render test: every link outlined at its box, one flag with the count at `top: 101`, `left: 167`, the rest unflagged with their lines | The render test green; the existing flag tests green, adjusted where a run's member draws no flag | — |
| 3 | DESIGN's FilterStates row says neighbours share one flag | `docs/DESIGN.md` | — | — | — | — |
| 4 | Verify | — | all | — | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `check:self` with 0 shortfalls; screenshots of Kai on `/settings/data` in Evidence, fitted and at full size, both themes, looked at | — |

## Decision log

| Question | Taken | Why |
|---|---|---|
| Stack the flags, or one per run of neighbours (the issue's two options) | One per run, with its count | Stacked, five flags at about half scale reach 110 px past a run 100 px tall, so they drift away from what they mark. One flag reads at a glance, and "×5" is what beat 3 points at: the entries the cap left out |
| What makes neighbours | Same flag lines, overlapping across, each starting less than 48 measured px below the one above | 48 px is a 22 px flag at the fitted scale, about half. The list's 43 px pitch joins; the nav links, side by side, never do. Measured boxes only, not the drawn scale, so the flags are the same fitted or at full size, and the rule is testable without a browser |
| Where the run's flag sits | Beside the run's middle, past its widest member's edge, on the side `flagSide` picks for the run's box | Centred on one member it would sit over the outline of a wider one below it |
| What the members keep | Their outline, their name and their lines, the lines `sr-only` | The page is unchanged; only the flags merge. A screen reader still hears what removed each |
| The flag cut off at the crop under "Your rights" | No change of its own | The paragraph and the button are both A1 cuts 42 px apart, so they now share one flag, drawn inside the paragraph's outline, inside the canvas. The `V2` flag left past the crop is the footer's, wholly below the fold, which the crop hides by design |

### Review at fffcd4e

| Point | Done |
|---|---|
| The count glued to the first line (`P1 · 6.386 < 7 ×7`, "24 times 6") | The count stands in a column of its own after a rule, beside every line: `P1 · 6.386 < 7 │ ×7`. A last line was tried first: it made Kai's one-line "Your rights" flag two lines tall, inside the paragraph's outline at the crop, and the crop cut the `×2` off again. The column adds no height, and in the accessibility tree the count is an item of its own (`A1 · attention ×5`, not `attention×5`). Test: "a run's count stands apart from the lines…", a P1 run and a P3 + P4 run; the render test reads the lines `["A1 · attention"]` and the count `×5` apart |
| A run member's `sr-only` lines run together (`< 24P4 · 30`) | They are joined with ", ", so the text itself reads `P3 · 17 < 24, P4 · 30 < 48`. Pinned on the markup's text in the same test |
| `runs.find` reaches past an element with different lines | A removed element with other lines that overlaps a run across ends it. Test: A1 at y 0, V2 at y 20, A1 at y 40, all at x 0 to 100, make three flags. The "V2 between two A1 cuts" case now breaks by the V2: A1s at 43 and 86, 43 px apart, the V2 at 60 |
| No test sees the flag's side taken from the topmost's own box | Test: a topmost at x 600 to 800 over a member at x 150 to 650; its own box would put the flag left, the run's puts it right |
| DESIGN's row: "the same lines" | Said so, with the count's own column and the break |
| "Fixes #225" against `docs/DEMO.md`'s header row | The PR is "Part of #225": merging leaves #225 open for the dense header's side-by-side flags, which `docs/DEMO.md` tracks under it and this change leaves alone |

The review's two questions:

- **A fixed 48 px pitch for every fit?** It targets the target app's fitted Lens and beat 3, where the page is drawn at about 0.5. A wider page from the URL row, fitted smaller, can still overlap: its flags are taller in measured px than 48. A scale-aware pitch would make the flags differ fitted and at full size, and the rule untestable without a browser.
- **A paragraph plus a button as a run?** Yes. They are stacked neighbours with the same lines, `A1 · attention`, 42 px apart, overlapping across. Merging them is what moves the "Request a copy" flag off the canvas's crop, inside the paragraph's outline.

### Review at 4ba0a28

| Point | Done |
|---|---|
| `runStyle`'s inside case and its left-side placement have no test | Two tests. The list moved to the page's right takes its flag on the left, with `right` 167, at the run's left edge. "Your rights"'s paragraph and button take theirs inside, with no style and their count. Dropping the inside guard, or moving the left flag, turns one of them red |
| The first commit's "Fix #225" closes #225 on a default squash, which lists every commit message | Reworded "Part of #225"; the rewritten branch holds the same files |
| `flagPx` repeats `measuredPx` in `rendered-markup.ts` | `measuredPx` is exported and used; `flagPx` is gone |
| `LIST` sits one entry above the links Kai's cap removes | It holds the five the cap removes, Saved addresses to Marketing choices, y 363 to 535; the run's box starts at 363 |
| DESIGN's "Motion" has every newly removed element's flag drop in | It says one that joins a run under its topmost has no flag of its own: the run's count changes in place |
| Not done | Flags that cross into the next column, as on Kai's `/account`: a question of #225's scope. A shared flag drawn in `docs/design/`: still the follow-up |
