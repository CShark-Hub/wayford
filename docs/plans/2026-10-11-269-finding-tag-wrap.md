# #269 — Report: a finding's tag never breaks, so at 320 px on Linux the findings run 5 px into the gutter: plan

Task: issue #269 (no task file: an issue fix, "Fix #269", stacked on PR #268, `fix/265-cast-table-scroll`) · Spec: none (S; the issue is the spec)
Status: approved 2026-10-11 (auto)

The issue's acceptance:

1. At 320 px on Linux, the header, the findings and the footer are no wider than the window less its gutters, with no slack in the test.

From the brief:

2. A finding's tag keeps its one line wherever it fits, and nothing changes at 1280 × 720.
3. A test proves a tag wider than its card breaks inside it, and fails on macOS without the fix, as the strict 320 px check fails on Linux.

Measured on `fix/265-cast-table-scroll` `716e106` (Chromium on macOS, 720 px high, the hard goal's Report, fonts loaded). The Measurement card's "axe · color-contrast" is 208 px here; a 320 px window leaves a tag 214 px (the 256 px column less the card's 42 px of padding and border). Spaced out to Linux's 219 px (0.55 px a character), the card is 261 px against the 256 px column, the issue's number. With `landmark-no-duplicate-contentinfo`, a real axe rule, the tag is 390 px on one line, and the page is 464 px wide at 375 and 320 px.

The card already sets `overflow-wrap: anywhere` (`wrap-anywhere`), which the tag inherits. It never takes effect, because `Tag` sets `white-space: nowrap`, which forbids every break. So the issue's first idea, `[overflow-wrap:anywhere]` on the tag, does nothing alone.

| # | Step | Files | Serves | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | The checks. The #265 test's gutter check at 320 px loses its 8 px of slack and its comment the exception. A new test, on the hard goal's Report with its axe finding on `landmark-no-duplicate-contentinfo`, at 1280, 768, 375 and 320 px: that tag lies inside its card, the card inside its column, the column inside the window less its gutter; the tag runs over more than one line at 1280, 375 and 320 px and keeps one line at 768 px; every other tag keeps one line | `packages/web/src/screens/report.browser.test.ts` | 1, 2, 3 | This is the test. Without step 2 it fails with "the long tag at 1280 px: expected 'one line' to be 'more than one line'" | `pnpm --filter @wayford/web exec vitest run src/screens/report.browser.test.ts` fails on the new test only | — |
| 2 | `Tag` takes `breaks`, a variant that sets `whitespace-normal` (and, since the review, `wrap-anywhere`). The finding card sets it on its axe tag (on each of its tags, through `ProvenanceTag` too, until the review cut it). `docs/DESIGN.md`'s Finding row and `docs/design/components.css` say so | `packages/web/src/components/tag.tsx`, `packages/web/src/components/finding.tsx`, `docs/DESIGN.md`, `docs/design/components.css` | 1, 2 | Step 1's tests | Step 1's tests pass | — |
| 3 | Verify | — | all | — | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @wayford/web check:self` with 0 shortfalls in both themes. A scratch probe, deleted after, measures the widest card against its column at 1280, 768, 375 and 320 px with the tag forced to 219 px; the Report at 320 px is screenshotted and looked at | — |

## Decision log

| Question | Taken | Why |
|---|---|---|
| How the tag breaks | `white-space: normal` and `overflow-wrap: anywhere` on the tag (`breaks`), so it breaks at its spaces and hyphens, and anywhere in an id with none. Until the review at 07b3a02 the variant set `white-space: normal` alone and leaned on the finding card's inherited `overflow-wrap: anywhere`, which the Lens's axe-core card does not set | `nowrap` was the only thing stopping it. A flex item takes its one-line width while it fits, so a tag that fits draws as before: the Measurement card at 1280 and 320 px is the same picture to the byte, before and after |
| Where it may break | Wherever the browser breaks text: "axe · color-" over "contrast" at 219 px | A break kept to " · " would need the rule id unbreakable, which overflows again on a rule id wider than the card, as `landmark-no-duplicate-contentinfo` is at 375 px. A hyphen is a natural place to break an id |
| Which tags | The finding card's axe tag alone, through a `breaks` variant on `Tag`; after the review at 07b3a02, the Lens's axe violation tag too | Only the axe tag's text is free: `axeRuleId` is a `z.string()` holding any axe rule id, in a column as narrow as 214 px. The card's other tags come from fixed lists: `RuleId` and `ProvenanceId` are closed enums, the widest of them, "folk · no source", is about 172 px, and "soft" is one word, so none can outgrow the card. The Lens's axe violation tag is the same free text in the axe-core card, and the review found it running past that card. The other tags (the Lens's rules, the cast card's source, the Race's label) sit in rows that wrap or in wide places, and no issue reports them; `nowrap` stays their default so nothing moves on those screens |
| A selector on the card (`[&_span]:whitespace-normal`) instead of a prop | No | It reaches into `Tag`'s markup from outside; a prop says it where the tag is drawn |
| The proof on macOS | A real, long axe rule id in the new test, not a spaced-out tag | macOS sets "axe · color-contrast" 8 to 11 px narrower than Linux, so the strict 320 px check alone passes there with or without the fix. A 390 px tag is wider than a card at three widths on every system, so the test fails on any system without the fix |
| The #265 plan's slack row | Left as it was | It records #265 as merged; this plan and the test record the change |

## Review at 07b3a02

dawidtheshark's review, "merge after fixes", with no blocking or should-fix findings.

| Point | Done |
|---|---|
| Cut list: `breaks` on the axe tag only | `ProvenanceTag` is back to its one-line signature on `main`; the soft, rule and provenance tags in `finding.tsx` lose `breaks`. Checked: `RULE_IDS` and `PROVENANCE_IDS` in `packages/core/src/primitives.ts` are closed lists, and `axeRuleId` is `z.string().trim().min(1)` in `finding.ts`. The "Which tags" row above is corrected: "any basis rule" did not hold. The #269 test and the strict 320 px check pass; with the axe tag's `breaks` taken out, the #269 test fails with "the long tag at 1280 px: expected 'one line' to be 'more than one line'" |
| Nit: the JSDoc's promise | The `breaks` variant is `whitespace-normal wrap-anywhere`, so a tag breaks inside an id with no hyphen wherever it is used, not only inside the finding card. The JSDoc on `Tag` says what the variant sets and what follows. On the Lens, with a 48-character id with no hyphen, the new Lens test passes with the variant and fails ("the tag in its card") with `whitespace-normal` alone (a scratch run, not kept) |
| Question: the Lens's axe violation tag | Fixed here, by the same mechanism: `breaks` on the tag in `AxeCard` (`lens.tsx`). Test first in `lens.browser.test.ts`: a scan with `landmark-no-duplicate-contentinfo`, 2 elements, at 1280 × 720; the tag lies inside the axe-core card, nothing scrolls, and the stage stays 640 px wide or more. Measured (Chromium on macOS): the tag is 455 px on one line and the page 1353 px wide before; after, it is 341 px over two lines, the page 1280 px, and the strip 20 px taller, so the stage draws the page 642 px wide against 663 px with `color-contrast`. Without the fix it fails with "the tag in its card". `docs/DESIGN.md`'s Finding row says the axe tag; no row describes the Lens's axe-core card, so it is not named there (and the Tag row stays as it is, since #274 rewrites it). `docs/design/components.css` has a `.wf-tag--breaks` modifier in place of `.wf-finding .wf-tag`, set on the axe tags in `report.html` and `lens.html` |
| Conflicts with #274 and #275 | Checked with `git merge-tree`; the results are in the PR body |
