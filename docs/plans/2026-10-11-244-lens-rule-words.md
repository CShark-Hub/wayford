# #244 — Lens: say in plain words what each fired rule did (P4 target, V2 viewport…): plan

Task: issue #244 (no task file: an issue fix, "Fix #244" on `main`) · Spec: none (S; the issue is the spec)
Status: approved 2026-10-11 (auto)

The issue's acceptance:

1. Hovering or focusing a fired rule on the Lens says in plain words what it did, with its count on this page.
2. Finding cards' rule tags get the same hint.
3. Copy passes `docs/DEMO.md` "Words we do not use" ("doesn't reach the model", never "can't see").

From its recommendation, kept: a description for every rule the screens can show, transcribed from `docs/RULES.md`, and a test that every rule has one. Left out: the persona's threshold and its source in the hint (decision log).

Display only. No core, io, filter or Analyst change, and no new dependency. The hint is #240's `Hint` (`components/ui/tooltip.tsx`).

Measured on `main` `dd4d56a`: the "rules fired" cell is 116 px tall with three rows of tags (a 20 px label, 6 px, three 26 px tags and two 6 px gaps), which is the strip's floor (`min-h-29`, #224). `check:self` fails a control under 32 px (DESIGN, "Checked by"), so a tag cannot be a 26 px button, and a 32 px Info button beside each tag makes three rows 134 px tall, or, at two rows a column, takes about 240 px of width from the axe-core card.

## How it works

**The words.** `components/filter-states.tsx` gains `RULE_HINTS: Partial<Record<RuleId, string>>` beside `RULE_WORDS`: one plain description for each rule a screen can draw a tag for, the eleven `RULE_WORDS` holds. The Lens strip lists only those, and a finding's basis holds only the rules io gives a source (`provenanceOf`, `packages/io/src/analyst-closures.ts`), the same eleven, so no other rule's tag is ever drawn. Each is transcribed from its `docs/RULES.md` row and checked against the code (table below; where the two differ, the code wins, decision log), and a test checks the keys are `RULE_WORDS`' own. Each says what the rule does to what reaches the model, never what a person sees. P2 and A3 are not built yet (`packages/filter` holds no decision for P2, and RULES says so of A3) and say "Not built yet: it changes nothing today", since io gives either a source when the profile sets its threshold.

**The trigger.** `Hint` takes an optional `face`, as #274 (#243) gives it, so the two PRs' `tooltip.tsx` are identical. Given one, the button draws it in place of the Info icon: still a ghost `Button`, `type="button"`, a 32 px box (`--target-min`, at least as wide) around the 26 px tag with `-my-0.75`, so the box costs its row no height, and the tag takes the hover ground. Its name is `label`, which holds the face's words (WCAG 2.5.3, label in name). Without a face it is #240's Info button, unchanged.

**`RuleTag({ rule, words, count })`**, in `filter-states.tsx`: `Hint` with `<Tag variant="rule">` as its face, named "Explain" and the tag's text, `rule` alone or `rule` and its `RULE_WORDS` word when `words` is set, as every hint button on `main` and #274's are (DESIGN, Copy: a button starts with a verb). Its hint is `RULE_HINTS[rule]`, and with a `count`, then `On this page it fired on N elements.` ("1 element" for one). A rule with no description is drawn as the plain tag, no button.

**The Lens strip** (`screens/lens.tsx`). `rulesFired` returns `{ rule, count }` per fired rule, in `RULE_WORDS`' order, `count` the elements carrying a decision of that rule, whatever state it gave. A knowledge rule (K1, K2, K4) counts only on an element that reaches the model (`state !== "invisible"`): the filter records it on every element, removed ones too (`docs/RULES.md`, "Several rules"), and a rename nothing reads did nothing. With no such element it is left out of the strip. Each list item holds a `RuleTag` with words and count. The strip keeps `main`'s gaps: each button's margins give its row back the 6 px the box adds, so three rows are still 116 px, the floor, the first tag stands 6 px under the label, and "none" and the skeleton keep their 6 px. So the strip's height and the drawn page's size do not change (#224, #245).

**Finding cards** (`components/finding.tsx`). Each basis rule's `<Tag variant="rule">` becomes `RuleTag` with the id alone and no count: a finding is about runs, not one page. Its tags row keeps its height.

**Copy.** Every description, and every Lens hint with its count, passes a banned-words check, docs/DEMO.md's "Words we do not use" as whole words: `can't` (either apostrophe), `cannot`, `see` ("seed" is fine), `predict`, `real user`, `real people`, `impaired`, `disabled`, `blind`, `confused`, `replay`. A persona's name is allowed: V3's says "Ada included" (decision log).

The table holds the copy as built: the copy reviewer's corrections applied (each in the decision log), then P1, P3, P4, K1, K4 and A1 cut to two sentences of about 30 to 40 words, like #240's hints, at the review at 6f3b0e3.

| Rule | `docs/RULES.md` row | Hint |
|---|---|---|
| P1 | line 67, P1 | Text with contrast under the persona's threshold doesn't reach the model, nor does a control whose text fails. On a soft cut, a seeded roll may let text in a band below it through, partly masked. |
| P2 | line 68, P2 | Controls whose borders and icons have less contrast than the persona's threshold would not reach the model. Not built yet: it changes nothing today. |
| P3 | line 69, P3 | Text smaller than the persona's threshold in CSS px doesn't reach the model, nor does a control whose text fails. On a soft cut, a seeded roll may let text in a band below it through, partly masked. |
| P4 | line 70, P4 | A control smaller than the persona's threshold on its shorter side, its label included, doesn't reach the model. On a soft cut, a seeded roll may let one in a band below it through, partly masked. |
| K1 | line 88, K1 | A control that draws no text and matches a UI pattern the persona's profile lists as unknown reaches the model by its bare role, such as button "button". It always fires with K4; only hamburger and kebab are detected today. |
| K2 | line 89, K2 | For a persona whose profile sets a vocabulary, a term from the target app's jargon list that the vocabulary lacks reaches the model as [unfamiliar term]. The rest of the element's name stays as written. |
| K4 | line 91, K4 | The same rename as K1, on the same controls: an icon-only control whose pattern the persona's profile lists as unknown reaches the model by its bare role. The two read one input, so they always fire together. |
| V2 | line 115, V2 | Only elements on screen at the current scroll position reach the model, for every persona. Those further down that the persona's other rules would let through are counted as "N more below". |
| V3 | line 116, V3 | An element the page paints something over where a click on it would land, such as a cookie wall, a dialog or a sticky header, doesn't reach the model for any persona, Ada included. It isn't counted. |
| A1 | line 117, A1 | The persona's profile caps how many elements reach the model, ranked by size, contrast and position on the page and read in that order. Past the cap, the lowest-ranked are dropped and counted as hidden. |
| A3 | line 119, A3 | In a list or menu longer than the persona's option cap, only the first entries would reach the model, the rest counted. Not built yet: it changes nothing today. |

## Steps

| # | Step | Files | Serves | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | The unit tests. `RULE_HINTS` has a non-empty entry for every id in `RULE_IDS`, each passing the banned-words check. `Hint` with children renders them in place of the Info icon, in one `type="button"` named by `label`, described by its hint, no `title`. `rulesFired` on the observation fixture gives P1 3, P3 1, V2 5, A1 3, in that order. The strip's list items each hold a button named `P1 contrast` and so on, described by its rule's hint and `On this page it fired on 3 elements.`; `stripOf` reads the button names. A finding card's basis rule is a button named `P4`, described by P4's hint and no count | `components/filter-states.test.tsx`, `components/ui/tooltip.test.tsx`, `screens/lens.test.tsx`, `components/finding.test.tsx` | 1–3 | This is the test. It fails on `main`: there is no `RULE_HINTS` and no button in the strip | `pnpm --dir packages/web exec vitest run` on the four files fails on the new tests only | — |
| 2 | `Hint`'s optional `children`, as above | `components/ui/tooltip.tsx` | 1, 2 | Step 1 | Step 1's `tooltip.test.tsx` green, its #240 cases unchanged | 3 |
| 3 | `RULE_HINTS` and `RuleTag`, as above | `components/filter-states.tsx` | 1–3 | Step 1 | Step 1's `filter-states.test.tsx` green | 2 |
| 4 | The Lens strip: `rulesFired` with counts, `RuleTag` in each item, rows of 32 px with no row gap, no gap under the label | `screens/lens.tsx` | 1 | Step 1 | Step 1's `lens.test.tsx` green | 5 |
| 5 | Finding cards: `RuleTag` for each basis rule | `components/finding.tsx` | 2 | Step 1 | Step 1's `finding.test.tsx` green | 4 |
| 6 | The browser test, at 1280 × 720 on Ada at contrast 2.1 and 18 px (the #224 case). The existing "a slider move that fires one rule more" test reads the buttons' names, not the items' text (which now holds each hidden hint), and still finds the frame's box unchanged when P4 fires. New: hovering `P1 contrast` opens one `role="tooltip"` reading P1's hint and its count, inside the viewport; Tab reaches `P3 font size` and opens its hint, Esc closes it with focus kept; the "rules fired" cell is 116 px tall with three rules | `screens/lens.browser.test.ts` | 1 | This is the test | `pnpm --dir packages/web exec vitest run src/screens/lens.browser.test.ts` green; red with the row gap put back | — |
| 7 | The docs. `docs/DESIGN.md`'s Hint row: the button can hold a tag in place of the Info icon, named by the tag's words: a fired rule on the Lens, a basis rule on a finding card (#244) | `docs/DESIGN.md` | — | — (docs) | Read back | 6 |
| 8 | Verify | — | all | — | `pnpm lint`, `pnpm typecheck`, `pnpm test` (the self-check's axe scan included), `pnpm --filter @wayford/web check:self` with 0 shortfalls in both themes; `report.browser.test.ts`'s card fit tests green with the 32 px tags row; screenshots of the Lens with a rule hint open, and of a finding card, at 1280 × 720 in both themes, looked at | — |

The task is S, so it is built in this session, not fanned out.

## Decision log

| Question | Taken | Why |
|---|---|---|
| Finding cards too, or the Lens only | Both | The issue's acceptance names finding cards. Once `RuleTag` exists, a card is a one-line change, and no more descriptions: a basis holds only the rules `provenanceOf` gives a source, the 11 `RULE_WORDS` holds (review at 6f3b0e3) |
| An Info button beside each tag, or the tag as the button | The tag as the button, through `Hint`'s optional `face`, #274's design | Beside each tag, three rows run to 134 px and grow the strip past its floor, shrinking the drawn page (#224); two rows a column instead take about 240 px from the axe-core card. The tag in a 32 px button with no row gap keeps the floor at 116 px and the cell's width as it is, and meets `check:self`'s 32 px |
| The count on the tag or in the hint | In the hint | Acceptance asks for it in what the hint says. On the tag it widens every column and reads as a third number beside the counts the strip already shows |
| What the count counts | Elements carrying a decision of the rule, whatever state it gave; for K1, K2 and K4, only those that reach the model | That is what "fired" means in `rulesFired`. "3 removed" would be wrong for K2, which renames, and for a P1 that degraded. A knowledge rule is recorded on removed elements too, where its rename reaches nothing, so its hint would claim a rename the model never read (review at 6f3b0e3) |
| The persona's threshold and its source in the hint | Left out | The gauges above the strip show P1, P3 and P4's threshold and source tag already, and #243 explains each source. Neither is needed for the acceptance, and the strip has no profile in hand |
| The rule tags on the Lens's gauges (`lens.tsx`, `MetricGauge`) and on cut flags | Left alone | Each gauge's label names its metric beside its tag, and the flags sit in the stage, which the self-check excludes and which the issue's acceptance does not name |
| Unbuilt rules | P2 and A3 described, with "Not built yet: it changes nothing today"; no other unbuilt rule has a hint | io gives P2 and A3 a source when the profile sets their threshold, so a basis may name either, and the hint must not claim it removed anything |
| Other work in flight | #274 (#243, provenance hints) gives `Hint` a tag face too, and PR #270 edits the Lens's flags | This PR takes #274's `Hint` as it is, `face` and its margins, so the two `tooltip.tsx` are identical and only the lines both PRs add to `finding.test.tsx` and `DESIGN.md` meet; #270 touches the stage, not the strip |
| Copy review, P1 | No colour-vision simulation, a control whose text fails named, the soft band said as it is | `packages/filter/src/collect.ts:64` measures raw contrast with no simulation; the profile's emulation drives screenshots only (`core/src/profile.ts:73-84`). The band runs from threshold × (1 − softness) up to the threshold, 1.5 to 3.0 for Vera, and exists only on a soft cut (`filter/src/band.ts:40`), so "just under" understated it. RULES line 67 is ahead of the code |
| Copy review, P3 | "In CSS px", no page zoom; the band as in P1 | `collect.ts:65` and `:81` read the computed font size unscaled; no zoom exists in filter, agent or core, and RULES line 324 lists zoom as not in the filter. RULES line 69 is ahead of the code |
| Copy review, P4 | Clause order for a two-second read; the band as in P1 | RULES lines 29-39 and 70; `perceive.ts:76`; `band.ts:40` |
| Copy review, K1 and K4 | K1 says `button "button"` as an example, that it always fires with K4, and that only hamburger and kebab are detected; K4 says it is the same rename on the same controls, read from one input | `filter/src/knowledge.ts:83-93` returns both or neither, and `:64-67` detects only those two patterns. On the Lens the two tags appear together. K4's research clause is gone: io gives both the source `folk` (`analyst-closures.ts:85-87`), so on a finding card it read as if the basis were sourced (review at 6f3b0e3) |
| Copy review, K2 | Only for a persona whose profile sets a vocabulary; matched in the element's name | RULES line 104: only Kai sets one today |
| Copy review, V2 | For every persona; the count only of those the other rules would let through | RULES line 43: an element below the fold that a perception rule removed is counted nowhere, nor are those left, right or above (`perceive.ts:115`, `:173-182`) |
| Copy review, V3 | For any persona, Ada included; not counted | RULES lines 116 and 121. Naming Ada, the control persona, is what says it is no persona's limit, so the copy check allows a persona's name: docs/DEMO.md bans none |
| Copy review, A1 | The model reads them in rank order; the dropped are counted as hidden | RULES lines 117, 125 and 141; `perceive.ts:133`, `:200` |
| RULES.md ahead of the code (P1's simulation, P3's zoom) | Left for a note on the issue, not changed here | The hint follows the code. Changing RULES is a separate PR with its own approval (AGENTS.md) |
| A finding card's Tab order | Its basis rule's tag comes before Show more | The tag sits under the title, before the detail; `finding.test.tsx`'s buttons list now starts with the tag |

## Review

| Finding | Done |
|---|---|
| `filter-states.test.tsx` held `PINNED`, a second verbatim copy of all 21 `RULE_HINTS` strings, checked by `toEqual`: a change detector that checks no behaviour and doubles every copy edit. Its loop over `RULE_WORDS.keys()` was implied by the id-coverage and non-empty checks | Fixed: `PINNED`, its `toEqual` and the loop are gone, and the two `RuleTag` tests compare against `RULE_HINTS.P4`, `.P1` and `.P3`. The id-coverage, banned-words and "only P2, P5, K3, A2, A3 are unbuilt" checks stay |
| Copy nits: K4's hint gave the wrong reason the two rules always fire together (their sources), and P4's opening sentence mixed plural and singular | Fixed: K4 now says the two read one input, so they always fire together, then names each one's source (`filter/src/knowledge.ts`, `knowledgeDecisions` returns both or neither). P4 opens "A control whose clickable area, measured on its shorter side, is under the persona's threshold doesn't reach the model." Both in `RULE_HINTS` and in the copy table above |

## Review at 6f3b0e3

Fixed in `8a963e8`.

| Finding | Done |
|---|---|
| Blocking: the K1, K2 and K4 hints said a rename reached the model on an element perception had removed (Vera's 28 px kebab on `/account`; a cut "Fulfilment ledger" under K2) | Fixed: `rulesFired` counts a knowledge rule only on an element whose state is not `invisible`, and a knowledge rule with none is left out of the strip. Perception, viewport and attention rules still count every element carrying their decision. `lens.test.tsx` builds both observations by hand: the cut kebab with P4, K1 and K4 gives `P4 target` alone, the cut ledger with P1 and K2 gives `P1 contrast` alone, each by `rulesFired` and in the rendered strip; a shown kebab still counts K1 and K4. Red before the fix |
| 1. The same `Hint` change in two PRs | Fixed: `tooltip.tsx` is #274's, byte for byte: `face`, `FACE`'s 32 px box with `-my-0.75`, `min-w-(--target-min)` and the hover ground on the tag. `RuleTag` passes its `Tag` as `face`. `tooltip.test.tsx`'s case takes `face` and checks the margins and minimum width. `finding.test.tsx`'s `buttonsOf` is #274's, reading `aria-label` first |
| 2. `gap-0` removed the space under "rules fired" | Fixed: the strip has `main`'s classes again, and the gap comment is gone. `lens.browser.test.ts` checks the cell is 116 px with three rules, the frame doesn't move, the first tag stands 6 px under the label, and "none" (Ada at her defaults) and the skeleton (a measurement that never answers) stand 6 px under it. Red with `gap-0` put back |
| 3. Buttons named by the tag alone | Fixed: `Explain P4`, `Explain P1 contrast`. The tests' expected names follow |
| 4. 10 of the 21 hints could never be shown | Fixed: `RULE_HINTS` is a `Partial<Record<RuleId, string>>` over the 11 rules `RULE_WORDS` and `provenanceOf` share, and a test checks its keys are `RULE_WORDS`'. `RuleTag` draws the plain tag, no button, for a rule with no hint (`finding.test.tsx`, an M1 basis). Only P2 and A3 say "Not built yet". The JSDoc, the test comment and this plan no longer say a basis may cite any rule |
| 5. Two tests checked less than their names said | Fixed: `BANNED` gains `replays?` and `can[’']t`; the hand-written unbuilt-list test is deleted |
| Cut list | Done: the 10 hints and their copy-table and decision-log rows; `filter-states.test.tsx`'s `ruleTag` helper and both `RuleTag` tests (each `RuleTag` mutation tried, the name, the count dropped, "1 elements", no face, a button for a rule with no hint, turns `lens.test.tsx` or `finding.test.tsx` red); the `RULE_IDS` check and the M1 case; the gap comment and edits; the browser test's pointer-leave and Esc checks, which `scripts/hints.browser.test.ts` covers |
| Nit: K4's research clause beside a `folk · no source` tag | Fixed: dropped. K4 says it is the same rename as K1, read from one input |
| Nit: the browser test checked the count's wording, not its value | Fixed: the hint's whole text must equal the rule's hint and the count `perceive` gives for the same search (`resolvePreview` on the fixture). Red with `count + 1` |
| Question: P1, P3 and P4's hints were 64, 54 and 73 words | Cut to two sentences each, 36, 38 and 36 words; K1 45 to 40, K4 47 to 37, A1 40 to 35. The table above holds the new copy |
