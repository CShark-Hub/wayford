# Wayford — RULES: what the filter does and where each rule comes from

Status: **frozen for week 2.** The objections the week 2 filter tasks depend on (issues #22, #23 and #49) were decided in `m0-08`, and the decisions are written where they apply. From here on a change to this file is a PR with a reviewer's approval; it took two until week 4 (`docs/CONVENTIONS.md`). Every rule here is a claim the team must be able to defend in Q&A. If a rule has no source, it says `folk` and the report says `folk`. If a rule cannot be made deterministic, it does not belong in the filter; it belongs in the "what next" slide.

This document is the domain model behind `Profile`, `Observation` and `Finding`. The `provenance` field in a profile refers to a source id from the registry at the bottom.

## The pipeline

Order is fixed and matters. Each stage takes the observation from the previous one.

```
1. viewport       what is on screen at all              deterministic   (device, scroll position)
2. perception     what can be seen                       deterministic per element per run (run seed)
3. degradation    how well it can be read                deterministic per element per run (run seed)
4. knowledge      what it means                          deterministic
5. attention      what gets noticed first, how much      deterministic ordering, capped
6. memory         what the Actor still remembers         deterministic truncation
7. behaviour      what the Actor does with its choice    dice per action (run seed)
```

Stages 1 to 6 shape the `Observation`. Stage 7 shapes the `Action`. The Actor prompt is identical for every persona. Only the observation and the action post-processing differ.

## Thresholds, bands and the roll

Decided in `m0-08` (issues #22 and #23). This is the arithmetic `perceive` implements; the tables below follow from it.

Every perception rule compares a value the filter measured with a threshold from the profile. `>=` passes: a value exactly on the threshold is visible.

**Hard cut** (`softness` absent or 0). At or above the threshold the element is `visible`, below it `invisible`. A hard cut never degrades.

**Soft cut.** The band runs from its floor, `threshold × (1 − softness)`, up to the threshold.

| Measured value | State |
|---|---|
| `>= threshold` | `visible` |
| `< floor` | `invisible` |
| in the band | `degraded` when `rolled < position`, otherwise `invisible` |

`position = (value − floor) / (threshold − floor)`, from 0 at the floor towards 1 at the threshold. An element just under the threshold is usually seen but misread; one near the floor is usually missed.

**The roll.** `rolled` is one number in `[0, 1)` per element per run, taken from `hash(run seed, element key)`. The run seed decides, not the profile seed (`docs/PLAN.md` A20). Every soft rule on the element uses the same `rolled`, and every soft perception decision stores it, so a reviewer can see why an element was degraded in run 7 and missing in run 8.

**Several rules.** Every rule an element fails is recorded as a decision on it; a rule it passes is not. Each decision says the state that rule alone gives: a perception rule `degraded` or `invisible` by the band arithmetic above, V2, A1 and A3 `invisible`, K1, K2 and K4 none (they replace the name, `renamedName`, and leave the state). The element's state is the worst of them: `invisible` over `degraded` over `visible`, and `visible` when there is none. A masked name exists only when the result is `degraded` and no knowledge rule renamed the element; a renamed element reads its replacement whole, never as "partly legible". This understates in one known case: a degraded element K2 renames reads its replacement whole, so when the term is only part of its name, the other words reach the model unmasked, and knowledge undoes part of perception's degradation. K1 and K4 leak nothing, since the bare role replaces the whole name. No fixture and no preview slider reaches the case today: on the target app the only listed term, "Fulfilment ledger", is the ledger link's whole name, so no other word of a name is left to leak. Decisions are listed in pipeline order, then by rule id, so the evidence for a seed is byte-stable. An element cut by V2 or by attention stays in the evidence as `invisible` with that decision. V2 records the side the element lies wholly beyond: `above`, `below`, `left` or `right` (issue #116). The sides are cut too: a slide-out menu parked off the side of the screen is not seen, and the Actor could not reach an element there anyway. An element gets one V2 decision, so one off a corner gets one side, and the horizontal wins: the Actor scrolls only up and down, so no scroll brings it into view. Only `below` is counted, in `belowFoldCount`, and only when none of the element's perception decisions (P1 to P4) is `invisible`, since "N more below" says what scrolling could bring into view. An element below the viewport that perception removed keeps its V2 decision in the evidence and is counted nowhere, like everything perception removes (issue #118). One above the viewport (scrolled past), or left or right of it, is counted nowhere. A1 and A3 cut only the elements stages 1 to 3 left shown, so an element V2 or perception already made `invisible` never carries an attention decision (A1 still puts it in its order: "Salience (A1)"). Elements cut by A1 or A3 are counted in `hiddenCount`.

**Monotone per perception rule.** For a fixed run seed and element, and with softness held fixed, raising a perception threshold never gives the element a better state under that rule: `rolled` does not move and `position` only falls. Changing softness can move an element back from invisible to degraded, so a sweep keeps it constant. This holds per rule, not for the element's final state. A1 ranks and cuts only what stages 1 to 3 left shown, so a stricter threshold that removes one element can free a slot for one the cap had cut: A1 is not monotone in the perception thresholds, and is not meant to be. In its own cap it is: salience reads measured values only, so for a fixed run seed A1 shows a prefix of one salience order, and a smaller `maxElements` shows a subset of what a larger one shows. The sweep on `maxElements` (F9) relies on it. A3 is not built; whoever builds it fixes its order against A1 and writes it here. The contrast sweep (F9) relies on the bound in the calibration row "Sweep on contrast", not on a monotone success rate, and the calibration table checks it.

**Worked example.** Vera's contrast cut is 3.0 with softness 0.5, so her band runs from 1.5 to 3.0. The target app's hard link measures 2.0056:1 (reported as 2.005) at its defaults, which is position 0.337. Across seeds the link reaches her degraded in about one run in three and not at all in the rest. It never reaches her whole.

**What is measured.** Controls, and text blocks: headings, paragraphs, list items (issue #49). The cues that tell a person where to go are mostly text, so P1 and P3 apply to text blocks too. P4 applies to controls only. A text block's own text is the text it holds outside the controls and text blocks nested in it that a sighted person can see and that are in the accessibility tree, read as its name is read: text hidden from the accessibility tree is not part of it (issue #124). A name it takes from its content holds only its own text, and a nested element leaves a space there, never a marker: `<p>Read the <a href="/terms">terms</a> first</p>` is the paragraph "Read the first" beside the link "terms". Of the text it draws, only its own counts: a faint word of its own counts against it, and a faint link inside it is decided on its own. A text block that draws none of its own text is not measured, whatever names it: a nav list item whose only text is its link, a card list item that holds only a heading, a paragraph and a link, or a heading that holds only an image. A control that takes its name from its content is named and measured by all of it, a text block inside it included. The cost: a card link is cut whole when a subtitle in it fails P1 or P3 (issue #124). A label's text is measured on the control it names, and the label is not measured as a separate text block (issue #117): a `<label>` has no ARIA role to key it on. The control carries the contrast and font size of its label's text. When the label activates the control (a wrapping `<label>`, or `label for=`), the control's target size is the smaller side of the area a click activates, taken as one rectangle around its own box and its label's box. For a wrapping label that is the label's box. For a label apart from its control the rectangle takes in the gap between them too: simpler to measure, and it can overstate the target. The cost: a control is degraded or cut when its label's text fails P1 or P3. A contrast ratio is truncated to 3 decimals, never rounded up, since WCAG never rounds a ratio up to meet a threshold: 2.9996:1 is 2.999 and fails a 3.0 cut (issue #128). A control also carries what its markup says it opens, for stage 4 only and never in its key: `hasPopup`, its `aria-haspopup` as ARIA 1.2 reads it (`true` is `menu`; `false` or an unknown value is left out), and `controls`, the role of the first element its `aria-controls` names that exists, hidden or not (left out when that element has no role, or a role that is not one lowercase word). A text block carries neither. A control that draws no text has no font size; stage 4 reads that as icon-only.

## Stage 2 and 3: perception and degradation

Three states per element, not two. Binary removal makes every failure "did not see it". Degradation makes "saw it, misread it" possible, which is where real wrong clicks come from.

| State | Effect on the element in the observation |
|---|---|
| `visible` | passed through unchanged |
| `degraded` | passed through with its name partially masked (see "The mask" below); role and bounding box kept |
| `invisible` | removed from the Actor-facing observation, kept in evidence |

**The mask.** A degraded element that no knowledge rule renamed reads a masked name. The share of its characters that is masked is its own draw, one number in `[0, 1)` per element per run from `hash(run seed, key + ":mask")`, never the element's `rolled`. The draw is defined for every key so it stays pure, but it is used only when a mask exists. Reusing the roll would tie the mask to the degrade decision: an element is degraded only when `rolled < position`, so one near the band floor, the hardest to see, could only ever get a light mask. Which characters are masked is the filter's choice, as long as it is a pure function of the run seed, the key and the name. At least one character is masked, never all of them. The masked name is stored in the evidence (`maskedName`); the mask draw is not, since it can be recomputed from the run seed and the key. Keys end in the page's own name text, so an element named `Foo:mask` has a roll equal to the mask draw of a `Foo` under the same landmarks and role; that correlation is accepted.

Rules that decide the state. Metric is computed by the filter from the DOM, threshold comes from the profile.

| Id | Metric | Visible when | Degraded when | Source |
|---|---|---|---|---|
| P1 | text contrast ratio, after colour-vision simulation if the profile sets one | `>= threshold` | in the band, by roll (see above) | WCAG 2.2 1.4.3 for the 4.5:1 and 3:1 anchors, 1.4.6 for 7:1; Machado 2009 for the simulation |
| P2 | non-text contrast of controls, borders, icons | `>= threshold` (WCAG anchor 3:1) | band | WCAG 2.2 1.4.11 |
| P3 | font size in CSS px, scaled by page zoom | `>= threshold` | band | Legge and Bigelow 2011 for the acuity to print-size relation; WCAG 1.4.4 for the 200% zoom anchor |
| P4 | target size: the smaller side of the area a click activates, one rectangle around the control's box and its label's box when a label activates it ("What is measured", issue #117) | `>= threshold` (anchors 24 px AA, 44 px AAA) | band | WCAG 2.2 2.5.8 and 2.5.5; Parhi 2006 for the 9.2 mm touch anchor; Apple HIG 44 pt; Material 48 dp |
| P5 | colour-only distinction: two adjacent siblings whose names are identical and which differ only in colour | n/a | both degraded to the same name after simulation | WCAG 1.4.1 |
| P6 | contrast under `reducedContrast` or `blurredVision` CDP emulation | as P1 but on the emulated screenshot | | CDP `Emulation.setEmulatedVisionDeficiency`; illustration only, decision is P1 |

Softness and the roll work the same for every rule in this table: see "Thresholds, bands and the roll" above.

Open: P3 threshold should be derived from a declared acuity (Snellen 20/40, 20/70) and a nominal viewing distance, not typed as px. Then the profile says "20/70" and the px falls out with a source attached. Not in the week 2 plan; a candidate for week 3 or the "what next" slide.

## Stage 4: knowledge

Deterministic. No dice. The persona either knows a pattern or does not.

**Patterns.** A profile names a pattern by one of these ids and no other: `hamburger`, `kebab`, `breadcrumb`, `carousel`, `tabs`, `accordion`, `fab`, `infiniteScroll`, `swipe`, `search`, `cart`, `backLink`.

**A pattern in neither list is known.** K1 and K4 read `unknownPatterns` only: a pattern is unknown to the persona when its profile lists it there, never because a list leaves it out, and neither rule touches an element that matches no pattern. So every rename points to a profile entry the report can cite. The bundle table in "Persona composition" reads the same way: Vera does not know the three patterns her row names and knows the rest. `knownPatterns` documents the bundle and changes nothing in the filter. K1 and K4 share one input on purpose: a control that draws no text and whose pattern is unknown fails both, so it carries both decisions ("Several rules" above), each with its own source. A control that draws a word is read by that word, whatever its pattern: the sources measure hidden navigation and unlabelled icons, not a label the persona can read, and the hidden half of hidden navigation is the page's own (a closed menu is `display: none` and is not measured).

| Id | Input | Effect | Source |
|---|---|---|---|
| K1 | element matches a UI pattern in `unknownPatterns` and draws no text | element name replaced by its bare role: where Ada reads `button "More options"`, the persona reads `button "button"` | NN/g hidden navigation study (2016): hidden nav roughly halves discoverability; Jakob's Law |
| K2 | element name contains a term not in `domainVocabulary` and flagged as jargon | term replaced by `[unfamiliar term]` (`renamedName`): a rename, not a degradation mask | PLAIN guidelines; a jargon list per target app, provenance `folk` or `llm` depending on who wrote it |
| K3 | readability of a text block above the persona's grade level | block summarised to its first sentence, rest masked | Pisarek fog index (Polish), Flesch-Kincaid or Gunning fog (English) |
| K4 | icon-only control, one that draws no text so no font size is measured, whose pattern is in `unknownPatterns` | as K1 | NN/g icon usability |

**Detection.** A detector is a pure function of one measured element: its role, its name, its position as the outermost landmark in its key, its font size, and `hasPopup` and `controls`. An element matches at most one pattern, the first detector below that fires, and every K1 and K4 decision names it. When in doubt a detector does not fire: a missed pattern understates, a wrong one invents. Wrong detection is a bug, not a finding. Each detector has a target-app page where it fires and one where it must not.

| Pattern | Matches | Fires on | Must not fire on | Source |
|---|---|---|---|---|
| `hamburger` | a `button` whose outermost landmark is none, `banner` or `navigation`, and whose `controls` is `navigation` | "Menu", on every page at a phone width | the kebab | WAI-ARIA APG, disclosure navigation |
| `kebab` | a `button` that draws no text, whose `hasPopup` is `menu`, and whose name starts with the word More, Options or Actions, alone or after Show | "More options" on `/account` | the phone "Menu" toggle, and every control on `/settings` | WAI-ARIA APG, menu button |

The other ten patterns have no detector yet, so K1 and K4 never fire for them whatever a profile lists: Kai's breadcrumb, tabs and accordion change nothing, and a run is not evidence about them. A detector lands with a target-app page where it fires. `swipe` and `infiniteScroll` are a gesture and a page behaviour, not an element.

Known misses: a toggle whose `aria-controls` names no navigation landmark, a menu button with no `aria-haspopup`, a kebab drawn as a text glyph such as ⋮, a name not in English. A control that draws its word is not renamed even when its pattern is unknown (above). Each one understates; none renames an element wrongly. K1 and K4 are decided on every element, those V2 or perception made invisible too; a reader of the evidence classifies by state first.

**Vocabulary (K2).** K2 applies only when the profile sets `domainVocabulary` and the target app has a jargon list, as K1 and K4 read only `unknownPatterns`. Every replacement then points to one entry of the list and to its absence from the persona's vocabulary, both of which the report can cite. Only Kai sets one today, so K2 never touches the other four. The list holds terms, each a word or a phrase. A term is known when `domainVocabulary` holds it, or holds every word of it (words split on whitespace), compared case-insensitively. An unknown term is matched in the element's name whole and case-insensitively, with a word boundary at each end of the term that is a word character: "ledger" does not match inside "ledgers". Each occurrence becomes one `[unfamiliar term]`. At each place in the name, longer terms are tried first, terms of equal length in the list's order, and replaced text is never matched again, so a word inside a masked phrase is not masked again. A blank term matches nothing. The rest of the name stays as written. The K2 decision names the terms it replaced, as the list spells them, in order of first occurrence in the name. Like K1 and K4, K2 is decided on every element, text blocks and those V2 or perception made invisible included.

**The jargon list.** One list per target app, a data file with provenance `folk`: `packages/core/src/fixtures/jargon.json`. `perceive` reads no file; it takes the list as an option, so the preview stays browser-safe. Today the list holds one term, "Fulfilment ledger", the one label on the target app a team member would call shop jargon: fulfilment is back-office logistics, and a ledger is bookkeeping. A short list is the defensible one. "Order archive", "in transit" and "Sign-in activity" are everyday wording and stay off it. "Fulfilment" is the British spelling, and a vocabulary entry "fulfillment" does not make it known: matching is whole-term by design.

**Order between K1, K4 and K2.** K1 and K4 win the name: the element reads its bare role, which holds no jargon, so it already covers K2. K2 is still recorded on such an element, since every rule an element fails is recorded ("Several rules"). Within the stage the decisions are listed K1, K2, K4.

## Stage 1 and 5: viewport and attention

| Id | Input | Effect | Source |
|---|---|---|---|
| V1 | `device` | real Playwright device emulation, viewport, touch, user agent | deterministic |
| V2 | scroll position | observation contains only elements intersecting the viewport, plus a count "N more below" | NN/g scrolling and attention (2018): 57% of viewing time above the fold |
| A1 | attention capacity `maxElements` | observation ordered by salience (below), then truncated to `maxElements` | visual hierarchy: size, contrast, position; F-pattern (NN/g 2006) for the shape of the position term; anchors WCAG 2.2; the formula `folk` |
| A2 | banner blindness | elements in ad-like positions and sizes (right rail, top leaderboard, image-heavy blocks) pushed to the end of the order for personas with low attention capacity | Benway 1998; NN/g banner blindness |
| A3 | option cap | in a list or menu with more than `maxOptions` entries only the first `maxOptions` are passed, the rest counted | Hick-Hyman law for choice time; Cowan 2001 for the capacity of about four items |

A1 is the rule that makes low-literacy personas *scan* rather than *read*. It changes what the model sees first, which changes what it clicks. It is deterministic and cheap.

**Salience (A1).** Salience is computed from three things only: the element's measured box, its metrics and the page's viewport. It never reads a perception state, a threshold, the profile or the seed. So the evidence is enough to recompute it, and what perception removes never reorders the rest. Three terms, each from 0 to 1:

| Term | Value | Anchor |
|---|---|---|
| size `S` | `min(1, s / 24)`. `s` is the font size. An element that draws no text, such as an icon-only control, has no font size; `s` is then the smaller side of its box divided by 1.5, the font size whose line would fill the box. | 24 px is large-scale text (WCAG 2.2, 1.4.3); 1.5 is the line height of WCAG 2.2, 1.4.12 |
| contrast `C` | `min(1, (c − 1) / 3.5)`, where `c` is the measured contrast ratio: 0 at 1:1, 1 from 4.5:1 up. Absent when no contrast was measured. | 4.5:1 is the AA level for text (WCAG 2.2, 1.4.3) |
| position `P` | `1 − y × (1 + x) / 2`. `x` and `y` place the box's top-left corner as a share of the viewport's width and height, each clamped to 0 to 1. `P` is 1 along the top edge, 0.5 at the bottom of the left edge and 0 at the bottom-right corner. | the F-pattern (NN/g 2006): the top is read across; further down, attention keeps to the left |

Salience is the mean of the terms the element has: `(S + C + P) / 3`, or `(S + P) / 2` when no contrast was measured. Every element has a box, so every element has `S` and `P`. A missing contrast is left out, never replaced by a value that would put the element first or last. Two worked examples, from the target app at 1280 × 720. The icon-only kebab on `/account` (28 × 28 px, top-left at 224, 164, no text) has `S` 0.778 and `P` 0.866, so its salience is 0.822: it is ranked by its size and its position alone. The hard link "Order archive" on `/deliveries` (16 px text at 2.005:1, top-left at 224, 603) has `S` 0.667, `C` 0.287 and `P` 0.508, so its salience is 0.487, the lowest of the 14 elements there.

Contrast stops counting at 4.5:1 on purpose. Below it, text gets harder to make out. Above it, the filter cannot say which of two clear elements stands out more: it measures the contrast of text against its own background, not a button's fill or hue, and white text on a coloured button often measures lower than black text on white. So a filled button counts by its text alone: on `/account` the white-on-blue button "Delivery address" (0.813) ranks just under the grey paragraph above it (0.816), and Kai's cap of 11 cuts it.

Salience uses only addition, subtraction, multiplication, division, `min` and `max`, and compares the values as computed. Every JavaScript engine computes these to the same bit, so the browser preview and the Actor's Node process put elements in the same order. A logarithm would not: the language leaves its last bit to the engine.

**Order and cut.** A1 applies only when the profile sets `maxElements`. With none, the observation keeps measurement order, the way an absent threshold does not gate. With a cap, every element of the measurement, those stages 1 to 3 removed too, is put in one order: highest salience first, and equal salience in measurement order. The evidence lists the elements in that order, and the shown ones are numbered `e1..eN` down it, so the Actor reads the most salient first. The order covers every element, but the cut counts only the elements stages 1 to 3 left shown: of those, the first `maxElements` in the order stay. Each later one is `invisible` with an A1 decision and is counted in `hiddenCount`. The order reads no state, so a smaller cap shows a prefix of the same order.

Sources: the terms are the visual-hierarchy cues of the A1 row, the anchors are WCAG 2.2's (`wcag22`), and the shape of `P` is NN/g's F-pattern (`nngroup`). The linear shapes, the cut-off at each anchor, the equal weights and leaving a missing term out are `folk`.

## Stage 6: memory

| Id | Input | Effect | Source |
|---|---|---|---|
| M1 | `memorySteps` | the Actor's conversation history is truncated to the last `memorySteps` steps; earlier steps replaced by a one-line count | Cowan 2001 working memory of about four chunks; PIAAC level descriptions for multi-step tasks |

This is the one rule that touches the model's context directly instead of the observation, and it is still deterministic. It is also the most honest model of "lost track of where I was".

## Stage 7: behaviour

Dice per action, from one stream of the run seed, every roll logged.

- **Firing rule.** A rule that applies to the action draws one number `rolled` in [0, 1) and fires when `rolled < p`. `p` is the probability the rule resolved for this action: the profile knob for B1 and B2, the effective-width model for B4. `p` 0 never fires; `p` 1 always does. Each `rolled` is the next draw of the run seed's behaviour stream (`docs/CONVENTIONS.md`, "Determinism rules"), never the profile seed's (`docs/PLAN.md` A20); `s2-10` builds that stream.
- **What is logged.** Per step: the action the model proposed, the action performed, and every roll as `{ rule, p, rolled, fired }` in the order rolled, fired or not. A rule that does not apply to the action logs nothing. Without a fired roll the two actions are identical. B3 is a budget, not a dice, and never appears in this log.
- **B2 in the log.** The proposed action is the `giveUp` or the repeat, the performed action is the injected `scroll` down, and the Actor decides again on the next step.

| Id | Roll | Effect | Source |
|---|---|---|---|
| B1 | `doubleClick` | a `click` becomes `doubleClick` | `folk` |
| B2 | `scrollWhenStuck` | when the Actor emits `giveUp` or repeats an action, with probability p a `scroll` down is performed instead on that step, and the Actor decides again on the next step | NN/g scrolling data for the anchor; the probability itself is `folk` |
| B3 | `budgetSeconds` | run ends `budget_exceeded`. Wall-clock, so model latency counts: the one behaviour rule a seed does not reproduce, and the run records its elapsed time | Nielsen response-time and abandonment literature for the order of magnitude; the exact number is `folk` |
| B4 | `misclick` | for targets smaller than the persona's motor threshold, with probability from the effective-width model the click lands on the nearest neighbour | ISO 9241-9 effective width, Fitts's law for the time penalty; MacKenzie 1992 |

B4 is the only behaviour rule with real science behind it. B1 and B2 are folk and say so.

## Calibration: how we know the engine is not broken

Not how we know the personas are right. We do not claim that.

| Check | Expectation |
|---|---|
| Persona with no thresholds (Ada) on the target app | success at or near 10/10, short path. If not, the Actor or the target app is broken, not the persona. |
| Vera with her contrast cut made hard (3.0, softness 0) | 0/10 on the hard goal. P1 removes the hard link (2.0056:1, reported as 2.005), and P4 removes the entrances to routes B and C (28 px, under her 32 px cut). The filter removed every route. |
| Vera at the target app's defaults: soft cut 3.0, band from 1.5, hard link at 2.0056:1 (reported as 2.005). Its 16 px font sits exactly on her 16 px font cut, on purpose, so the row also checks that `>=` passes; its 36 px box clears her 32 px target cut (issue #32) | the link reaches her degraded in about one seed in three (checked over 1000 seeds in `s1-01`) and never whole. For a fixed seed list the number of seeds where it is degraded is fixed, and hard-goal successes never exceed it. Ten seeds are too few to judge the share: at a true third, 4/10 or more happens almost half the time. |
| Zoya at the target app's defaults | 0/10 on both goals. Her hard 24 px font cut removes every link in the app (16 to 18 px), so no route leaves the home page. That is the far end of the scale, not a broken engine (decided in `m0-08`, issue #23). |
| axe-core violations on the target app | every P1 to P4 removal on a page corresponds to at least one axe finding on the same page, or the rule is stricter than WCAG and says so in provenance |
| Same task, profile, run seed and Actor answers, twice (fake adapter) | identical observations and dice rolls on every step both runs reach (`docs/PLAN.md` F5 AC1). Re-running a seed on a live model is not this check: its answers can differ. |
| Sweep on contrast, on a persona whose B and C entrances P4 closes, such as Vera | per seed, a higher threshold never gives an element a better state under the contrast rules (`s1-01` tests P1 on `perceive` alone, on a profile with no attention cap). So over the fixed seed set, the seeds where those rules leave the hard link visible or degraded never grow in number, and at each value hard-goal successes never outnumber them. The success rate itself is not monotone (`docs/PLAN.md` F9 AC5): the Actor's own variance can make a stricter value score higher, and so can the attention cap (A1). For any other persona the hard link is not the only route, so the bound is not guaranteed. |
| Kai at the target app's defaults | no perception decision on any page (seeds 1 to 100). Every difference between what the filter gives Kai and what it gives Ada comes from stages 4 to 6. |
| `/settings/data` at the WCAG AA anchors (4.5:1, 24 px) | no element fails P1 or P4, and every element that carries text has a measured contrast, none left out for an unknown background (issue #125). |
| What the filter leaves on each route to the hard goal | as the route table below, per persona. |

The route table is what `pnpm --filter @wayford/filter routes` prints: the target app at its defaults, each persona on its own device, run seeds 1 to 100. `ROUTES` in `packages/target-app/src/pages.ts` names the routes. Each step is measured where a person reaches it: on the page as loaded, or with the menu open that the step before it opened. On a phone, a step behind the menu toggle is reached through it, and the toggle is a home step of its own. A route closes at the first step the filter cuts; a step on `/` is home, the last step the final link, any other the entrance. A route open in some seeds and closed in others reads `per seed`. `routes.browser.test.ts` checks each cell up to its first colon; the text after it is a note. Under the salience formula Kai's cap of 10 cut route C's final link, "Fulfilment ledger" (11th of the 18 elements on `/settings/data`), so `s1-03` raised it to 11, the smallest cap that keeps routes B and C open.

| Route | Ada | Kai | Milo | Vera | Zoya |
|---|---|---|---|---|---|
| A | open | closed at the final link (A1): "Order archive" is the least salient of the 14 elements on `/deliveries` | closed at the final link (P4): the hard link, 36 px under 44 | per seed (P1): degraded in some seeds and cut in the rest, never whole | closed at home (P3, P4): her font cut alone removes every link |
| B | open | open: the kebab shown renamed (K1, K4) | closed at the entrance (P4) | closed at the entrance (P4) | closed at home (P3, P4) |
| C | open | open: "Your data" shown; "Fulfilment ledger" shown renamed to `[unfamiliar term]` (K2) | closed at the entrance (P4) | closed at the entrance (P4) | closed at home (P3, P4) |

## Persona composition

A persona is a bundle. Reference points for calibrating bundles, not for labelling them:

- **PIAAC / OECD problem solving in technology-rich environments**, as summarised by NN/g (2016): 26% of adults cannot use a computer, 14% below level 1, 29% level 1, 26% level 2, 5% level 3. Level 1 means few steps, no navigating across pages, explicit criteria. Maps onto `memorySteps`, `maxElements`, `unknownPatterns`, `budgetSeconds`.
- **WCAG 2.2** anchors for perception thresholds.
- **PersonaLayer** taxonomy of 45 profiles as a checklist of dimensions we do or do not model.

Five hackathon personas, as bundles, listed in the order they are numbered
here and stored on disk. Ada and Zoya are the two ends of the scale: Ada is
what the engine looks like with nothing switched on, Zoya is every dimension at
once, except K2 vocabulary: she sets no `domainVocabulary`, and K2 applies only
when a profile sets it (`s1-05`). Kai, Milo and Vera are the three interesting
middles.

| Persona | Perception | Knowledge | Attention and memory | Behaviour |
|---|---|---|---|---|
| Ada | none | all known | unlimited | budget 120 s |
| Kai | none | unknown: hamburger, kebab, breadcrumb, tabs, accordion (folk), everyday shop words only (folk) | `maxElements` 11, `memorySteps` 2 (folk, set against PIAAC level 1 and Cowan 2001; 11 since `s1-03`, the smallest cap that keeps routes B and C open) | budget 120 s |
| Milo | mobile device, target 44, no contrast rule | all known | `maxElements` 20, `memorySteps` 6 | scrollWhenStuck 0.9, budget 90 s |
| Vera | contrast 3.0 soft, font 16, target 32, `blurredVision` | unknown: hamburger, kebab, breadcrumb | `maxElements` 20, `memorySteps` 3 | doubleClick 0.8, budget 120 s |
| Zoya | contrast 7.0 soft, font 24, target 48, `reducedContrast` | every pattern unknown, no `domainVocabulary` (K2 off) | `maxElements` 5, `maxOptions` 4, `memorySteps` 2 | doubleClick 0.9, scrollWhenStuck 0.3, budget 180 s |

The initial is the dimension the persona is defined by: **A**ll clear,
**K**nowledge, **M**obile and motor, **V**ision, and **Z** for the far end of the
scale. Ada comes first, the control persona with nothing switched on, and Zoya
last, with the most switched on. In between the order is alphabetical, so a
dashboard and a sweep both read left to right without sorting anything. The
middles are not ordered by how much each switches on: Kai switches on seven
constraints (two caps, five unknown patterns), Milo three. Thresholds across
different metrics are not comparable either — Milo's 44 px target is stricter
than Vera's 32 px — so no order here is a severity score.

Zoya is the far end on purpose. At the target app's defaults the calibration
table above expects her at 0/10 on both goals: her 24 px font cut alone removes
every link. That is a finding about the app, and it stays (decided in `m0-08`,
issue #23).

The contrast sweep runs on Vera. At the app's defaults, on route A contrast is
the only metric that gates her (`tasks/m0-06-target-app.md`), and P4 closes the
entrances to routes B and C at every contrast (`tasks/s1-04-target-app-routes.md`).
So the sweep measures one route, and sweeping her contrast threshold asks the
question the sweep exists for: at which value does the path come back.

## Source registry

Ids used in `provenance`. Each entry: id, what it anchors, citation.

| Id | Anchors | Citation |
|---|---|---|
| `wcag22` | contrast 4.5:1 and 3:1, enhanced contrast 7:1, non-text 3:1, target 24 px and 44 px, colour-only, zoom 200% | W3C WCAG 2.2, criteria 1.4.3, 1.4.6, 1.4.11, 1.4.1, 1.4.4, 2.5.8, 2.5.5 |
| `machado2009` | colour-vision deficiency simulation | Machado, Oliveira, Fernandes. A physiologically-based model for simulation of color vision deficiency. IEEE TVCG 2009. Same model as Chrome DevTools and `culori` |
| `legge2011` | print size vs acuity | Legge, Bigelow. Does print size matter for reading? Journal of Vision 2011 |
| `parhi2006` | touch target 9.2 mm | Parhi, Karlson, Bederson. Target size study for one-handed thumb use on small touchscreen devices. MobileHCI 2006 |
| `hig` | 44 pt touch target | Apple Human Interface Guidelines |
| `material` | 48 dp touch target | Google Material Design |
| `fitts` | movement time vs distance and width | Fitts 1954; MacKenzie 1992 Shannon formulation |
| `iso9241` | effective width, error rate | ISO 9241-9 (now 9241-411) |
| `hick` | choice time vs number of options | Hick 1952, Hyman 1953 |
| `cowan2001` | working memory about four chunks | Cowan. The magical number 4 in short-term memory. BBS 2001 |
| `nngroup` | hidden navigation, F-pattern, banner blindness, scrolling and attention, icon usability | Nielsen Norman Group articles, cited individually in the rule that uses them |
| `benway1998` | banner blindness | Benway. Banner blindness. Proc. HFES 1998 |
| `nielsen` | response time limits, abandonment | Nielsen. Usability Engineering 1993; nngroup.com response-times |
| `piaac` | digital skill levels | OECD PIAAC; NN/g 2016 "The distribution of users' computer skills" |
| `pisarek` | Polish readability | Pisarek fog index |
| `flesch` | English readability | Flesch-Kincaid, Gunning fog |
| `plain` | jargon, plain language | PLAIN Federal plain language guidelines |
| `personalayer` | dimension checklist | PersonaLayer, 45 UX profiles |
| `folk` | anything without a source | none, and the report says so |
| `llm` | generated by a model | none, and the report says so |

## What is not in the filter, on purpose

- Compensation: leaning in, zooming, asking someone. Real people do it, the model will not unless we add a rule. Possible later as a deterministic `zoom` factor on P3. Not for the hackathon.
- Emotion, frustration, motivation. Hypothesis layer only, produced by the Analyst, labelled `hypothesis`.
- Motor tremor as a continuous model. B4 is the discrete version.
- Screen readers and keyboard-only navigation. A different observation channel entirely. Strong "what next" slide, out of scope now.
