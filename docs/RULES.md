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

**The roll.** `rolled` is one number in `[0, 1)` per element per run, taken from `hash(run seed, element key)`. The run seed decides, not the profile seed (`docs/PLAN.md` A20). Every soft rule on the element, and on each of its parts when it is drawn in parts ("What is measured"), uses the same `rolled`, and every soft perception decision stores it, so a reviewer can see why an element was degraded in run 7 and missing in run 8.

**Several rules.** Every rule an element fails is recorded as a decision on it; a rule it passes is not. Each decision says the state that rule alone gives: a perception rule `degraded` or `invisible` by the band arithmetic above, V2, A1 and A3 `invisible`, K1, K2 and K4 none (they replace the name, `renamedName`, and leave the state). The element's state is the worst of them: `invisible` over `degraded` over `visible`, and `visible` when there is none. A control drawn in parts ("What is measured") records each part's P1 and P3 decisions on the part, with the state they give it (`parts`), and carries those of its best part as its own; every soft decision on its parts stores the control's roll. A masked name exists only when the result is `degraded` and no knowledge rule renamed the element; a renamed element reads its replacement whole, never as "partly legible". This understates in one known case: a degraded element K2 renames reads its replacement whole, so when the term is only part of its name, the other words reach the model unmasked, and knowledge undoes part of perception's degradation. K1 and K4 leak nothing, since the bare role replaces the whole name. No fixture and no preview slider reaches the case today: on the target app the only listed term, "Fulfilment ledger", is the ledger link's whole name, so no other word of a name is left to leak. On a shown control with a part left out ("What is measured"), the mask reads its shown name (`shownName`) and K2 the same text, never its whole name, so neither puts a left-out part's text back. Decisions are listed in pipeline order, then by rule id, so the evidence for a seed is byte-stable. An element cut by V2 or by attention stays in the evidence as `invisible` with that decision. V2 records the side the element lies wholly beyond: `above`, `below`, `left` or `right` (issue #116). The sides are cut too: a slide-out menu parked off the side of the screen is not seen, and the Actor could not reach an element there anyway. An element gets one V2 decision, so one off a corner gets one side, and the horizontal wins: the Actor scrolls only up and down, so no scroll brings it into view. Only `below` is counted, in `belowFoldCount`, and only when none of the element's perception decisions (P1 to P4) is `invisible`, since "N more below" says what scrolling could bring into view. An element below the viewport that perception removed keeps its V2 decision in the evidence and is counted nowhere, like everything perception removes (issue #118). One above the viewport (scrolled past), or left or right of it, is counted nowhere. A1 and A3 cut only the elements stages 1 to 3 left shown, so an element V2 or perception already made `invisible` never carries an attention decision (A1 still puts it in its order: "Salience (A1)"). Elements cut by A1 or A3 are counted in `hiddenCount`.

**Monotone per perception rule.** For a fixed run seed and element, and with softness held fixed, raising a perception threshold never gives the element a better state under that rule: `rolled` does not move and `position` only falls. Changing softness can move an element back from invisible to degraded, so a sweep keeps it constant. A control drawn in parts ("What is measured") keeps it part by part: for a fixed roll each part's state never improves as a threshold rises, so neither does the best of them, which is the control's P1 and P3 state taken together. It need not hold for one of the control's two rules alone, since its best part can change from one threshold to the next. This holds per rule, not for the element's final state. A1 ranks and cuts only what stages 1 to 3 left shown, so a stricter threshold that removes one element can free a slot for one the cap had cut: A1 is not monotone in the perception thresholds, and is not meant to be. In its own cap it is: salience reads measured values only, so for a fixed run seed A1 shows a prefix of one salience order, and a smaller `maxElements` shows a subset of what a larger one shows. The sweep on `maxElements` (F9) relies on it. A3 is not built; whoever builds it fixes its order against A1 and writes it here. The contrast sweep (F9) relies on the bound in the calibration row "Sweep on contrast", not on a monotone success rate, and the calibration table checks it.

**Worked example.** Vera's contrast cut is 3.0 with softness 0.5, so her band runs from 1.5 to 3.0. The target app's hard link measures 2.0056:1 (reported as 2.005) at its defaults, which is position 0.337. Across seeds the link reaches her degraded in about one run in three and not at all in the rest. It never reaches her whole.

**What is measured.** Controls, and text blocks: headings, paragraphs, list items (issue #49), and boxes of text (issue #219). The cues that tell a person where to go are mostly text, so P1 and P3 apply to text blocks too. P4 applies to controls only. A text block's own text is the text it holds outside the controls and text blocks nested in it that a sighted person can see and that are in the accessibility tree, read as its name is read: text hidden from the accessibility tree is not part of it (issue #124). A name it takes from its content holds only its own text, and a nested element leaves a space there, never a marker: `<p>Read the <a href="/terms">terms</a> first</p>` is the paragraph "Read the first" beside the link "terms". Of the text it draws, only its own counts: a faint word of its own counts against it, and a faint link inside it is decided on its own. A text block that draws none of its own text is not measured, whatever names it: a nav list item whose only text is its link, a card list item that holds only a heading, a paragraph and a link, or a heading that holds only an image. Text drawn outside every control and text block is measured as a box of text (issue #219): a text block with the role `text`, which is no ARIA role, so `getByRole` cannot find it. A box is an element with no role it is measured by, drawn as a box of its own rather than as a run in its parent's line (its `display` is neither `inline` nor `contents`), seen and in the accessibility tree, and outside every control, every text block, every label or `aria-labelledby` referent of a measured control, and fallback content. The label of a control nobody sees, such as a custom checkbox's hidden input, names nothing measured, so its text is read where it is drawn. Its own text is what it draws outside the boxes, text blocks, controls, control names and fallback content inside it, read as a text block's is: `<div>Rate: <strong>125 PLN</strong> per hour</div>` is the one box "Rate: 125 PLN per hour", and a run of text a box reads is read by nothing else. Its box is the element's, as a text block's is. A box whose own text holds no letter or digit, such as a lone "|" between two links, is not measured. A box that is itself a landmark, as a `<footer>` holding its text directly is, ends its key's landmark path with itself: `contentinfo//text:…`. Text inside a text block stays the block's, and text inside a control the control's, as before. On the target app the boxes are the footer's sentence on every page and the address on `/account/address`; they change no route. A control that takes its name from its content is named by all of it, a text block inside it included. When more than one element draws that name, the control is measured in parts (issue #124): one part per element that draws a run of it, in document order, each holding the text that element draws itself and that text's contrast and font size. It has parts only when those texts, joined by spaces, spell its name: each element's text in one stretch, in the page's order, set apart from the next. Otherwise a shown name could read words out of order (`<a>Read <b>more</b> about pricing</a>` would read "Read about pricing more"), split a word across two elements, or keep text no part draws, so the control is measured whole, by the worst of its text. Text made only of characters that draw nothing is no text an element draws, for parts or for any measurement: whitespace, a format character such as a zero-width space or a soft hyphen, a default-ignorable one such as the Hangul filler, and the blank braille pattern. Neither is the fallback content of a video, audio, canvas, object, iframe or noscript element, which the page draws only where that element is not supported, nor the content of a progress or meter element, which draws its bar instead (issue #219). The control's own contrast and font size stay the worst of its parts, so salience (A1) and stage 4 read it as before. Perception judges P1 and P3 on each part, with the control's one roll ("The roll"), and a part's state is the worst of its own outcomes. The control takes the P1 and P3 decisions of its best part, the least severe state, the first in document order on a tie: it is cut only when every part is cut, and degraded when its best part is. P4 is the control's own. A shown control with a part worse off than its best part reads its shown name (`shownName`): the text of the parts in its best part's state, joined by spaces. A cut part's text does not reach the model, and neither does a degraded part's beside a visible one, which would otherwise be read as if it were clear: a card link `<a href="/deliveries"><h2>Deliveries</h2><p>See older orders</p></a>` whose subtitle fails P3 reaches the persona as `link "Deliveries"`: a person who can read its heading can click it. Two costs. A degraded part beside a visible one is left out, not read masked, since a control reads one name, whole or masked: the persona is shown less of it than it might make out. That understates, where reading the part whole would overstate. And a blind spot of the collector on one part now keeps a control rather than cutting it. Text drawn off the screen or clipped away still counts as drawn (issue #126): an image-replacement link whose name is pushed off with `text-indent` keeps a part the persona never sees. A part over an unknown background has no contrast to fail (issue #125). Partial opacity, a filter or a transform is not read. A control drawn by one element is cut harder by such a gap, at worst; one drawn in parts can be kept by it, since its best part decides. A control named from a label, an `aria-labelledby` referent or a placeholder has no parts: it is measured whole, where that name is drawn. A label's text is measured on the control it names, and the label is not measured as a separate text block (issue #117): its text is the control's. The control carries the contrast and font size of its label's text. When the label activates the control (a wrapping `<label>`, or `label for=`), the control's target size is the smaller side of the area a click activates, taken as one rectangle around its own box and its label's box. For a wrapping label that is the label's box. For a label apart from its control the rectangle takes in the gap between them too: simpler to measure, and it can overstate the target. The cost: a control is degraded or cut when its label's text fails P1 or P3. A contrast ratio is truncated to 3 decimals, never rounded up, since WCAG never rounds a ratio up to meet a threshold: 2.9996:1 is 2.999 and fails a 3.0 cut (issue #128). A control also carries what its markup says it opens, for stage 4 only and never in its key: `hasPopup`, its `aria-haspopup` as ARIA 1.2 reads it (`true` is `menu`; `false` or an unknown value is left out), and `controls`, the role of the first element its `aria-controls` names that exists, hidden or not (left out when that element has no role, or a role that is not one lowercase word). A text block carries neither. A control that draws no text has no font size; stage 4 reads that as icon-only.

## Stage 2 and 3: perception and degradation

Three states per element, not two. Binary removal makes every failure "did not see it". Degradation makes "saw it, misread it" possible, which is where real wrong clicks come from.

| State | Effect on the element in the observation |
|---|---|
| `visible` | passed through unchanged |
| `degraded` | passed through with its name partially masked (see "The mask" below); role and bounding box kept |
| `invisible` | removed from the Actor-facing observation, kept in evidence |

**The mask.** A degraded element that no knowledge rule renamed reads a masked name. The share of its characters that is masked is its own draw, one number in `[0, 1)` per element per run from `hash(run seed, key + ":mask")`, never the element's `rolled`. The draw is defined for every key so it stays pure, but it is used only when a mask exists. Reusing the roll would tie the mask to the degrade decision: an element is degraded only when `rolled < position`, so one near the band floor, the hardest to see, could only ever get a light mask. Which characters are masked is the filter's choice, as long as it is a pure function of the run seed, the key and the name. The name masked is a shown control's shown name when a part of it is left out ("What is measured"), so the mask never puts a left-out part's letters back. At least one character is masked, never all of them. The masked name is stored in the evidence (`maskedName`); the mask draw is not, since it can be recomputed from the run seed and the key. Keys end in the page's own name text, so an element named `Foo:mask` has a roll equal to the mask draw of a `Foo` under the same landmarks and role; that correlation is accepted.

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

**Vocabulary (K2).** K2 applies only when the profile sets `domainVocabulary` and the target app has a jargon list, as K1 and K4 read only `unknownPatterns`. Every replacement then points to one entry of the list and to its absence from the persona's vocabulary, both of which the report can cite. Only Kai sets one today, so K2 never touches the other four. The list holds terms, each a word or a phrase. A term is known when `domainVocabulary` holds it, or holds every word of it (words split on whitespace), compared case-insensitively. An unknown term is matched in the element's name (what is left of a control drawn in parts when a part of it is left out, "What is measured") whole and case-insensitively, with a word boundary at each end of the term that is a word character: "ledger" does not match inside "ledgers". Each occurrence becomes one `[unfamiliar term]`. At each place in the name, longer terms are tried first, terms of equal length in the list's order, and replaced text is never matched again, so a word inside a masked phrase is not masked again. A blank term matches nothing. The rest of the name stays as written. The K2 decision names the terms it replaced, as the list spells them, in order of first occurrence in the name. Like K1 and K4, K2 is decided on every element, text blocks and those V2 or perception made invisible included; K2 reads what is left of a control drawn in parts whether or not V2 or attention removed it, so its decision does not change when it scrolls into view.

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

Salience is the mean of the terms the element has: `(S + C + P) / 3`, or `(S + P) / 2` when no contrast was measured. Every element has a box, so every element has `S` and `P`. A missing contrast is left out, never replaced by a value that would put the element first or last. Two worked examples, from the target app at 1280 × 720. The icon-only kebab on `/account` (28 × 28 px, top-left at 224, 164, no text) has `S` 0.778 and `P` 0.866, so its salience is 0.822: it is ranked by its size and its position alone. The hard link "Order archive" on `/deliveries` (16 px text at 2.005:1, top-left at 224, 603) has `S` 0.667, `C` 0.287 and `P` 0.508, so its salience is 0.487, the lowest of the 15 elements there.

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
| B2 | `scrollWhenStuck` | when the Actor emits `giveUp` or repeats an action, with probability p a `scroll` down is performed instead on that step, and the Actor decides again on the next step. A repeat is a proposal whose history line is the line of the Actor's previous one: the same move on the same URL, its target named by the same role and name as the Actor was shown them, on a page that did not change between the two, element for element as the Actor read it. A press or scroll that changed the page is progress, not a repeat. A ref alone never makes a repeat, since every page gives its refs out again. A wasted step proposed nothing and is skipped, and a run's first proposal is no repeat. A proposed `scroll` down is never a B2 case, since B2 would perform the same scroll. B2 rolls after B1, and not at all on a step where B1 fired: that action is then the double click B1 made, no longer the Actor's repeat | NN/g scrolling data for the anchor; the probability itself is `folk` |
| B3 | `budgetSeconds`, paced by `thinkingTime` and `motorTime` | run ends `budget_exceeded` once its simulated time passes `budgetSeconds`. B3 is decided on a simulated clock, not the wall clock: each step's time comes from the KLM and Fitts's law ("B3 in detail" below), so model latency and machine load do not count, and the run seed and the Actor's answers reproduce it. The run still records its wall-clock time, as evidence, and that decides nothing | KLM for the operators (Card, Moran and Newell 1980, 1983; Kieras 1993 for B); Fitts's law in its Shannon form for pointing (MacKenzie 1992), with MacKenzie, Sellen and Buxton 1991's mouse constants; Nielsen response-time and abandonment literature for the budget's order of magnitude; the persona's budget and pace factors are `folk` unless a profile cites a source |
| B4 | `misclick` | for a click on a control smaller than the persona's motor limit, with a control in reach, with probability `p` from the effective-width model the click lands on the nearest such control ("B4 in detail" below) | ISO 9241-9 effective width, MacKenzie 1992; error model, Wobbrock et al. 2008; the persona's limit carries its own provenance; the time penalty is B3's (Fitts's law): the movement is timed to the target the Actor proposed, the press lands on the neighbour, and the next step's movement starts from the neighbour ("B3 in detail") |

B4's error model has sources (ISO 9241-9, MacKenzie 1992, Wobbrock et al. 2008); reading a persona's limit as an effective width, the reach, the neighbour and where the press lands are Wayford's (`folk`). B1 and B2 are folk and say so.

**B4 in detail.** `W` is the clicked control's target size, its `targetPx`, the smaller side of the area a click activates ("What is measured"), and `L` the persona's motor limit, the threshold of `behaviour.misclick` in its profile, both in CSS px. ISO 9241-9 takes a pointer's endpoints as normally spread around the aim point, and its effective width as 4.133 standard deviations, the width that holds 96% of them (MacKenzie 1992). B4 reads the persona's limit as that width, so `σ = L / 4.133`. A tap then misses a target of width `W` when it lands more than `W / 2` from the aim point along the target's smaller side, which happens with probability `1 − erf(k · W / L)`, `k = 4.133 / (2√2) ≈ 1.46124`: the error model of Wobbrock, Cutrell, Harada and MacKenzie (An error model for pointing based on Fitts' law, CHI 2008). B4 rolls only what the target's smallness adds to the miss rate the same persona has at its limit: `p = erf(k) − erf(k · W / L)`, for `W < L`. `erf(k) = 0.961219` is the hit rate at the limit, the 96% the effective width holds. `p` is 0 at `W = L` and rises as the target shrinks, so a target at or above the limit rolls nothing and `p` does not jump there. Worked examples, computed with an erf outside our code (Python's `math.erf`): `W = L / 2` gives `p = 0.961219 − erf(0.730618) = 0.262706`; 30 px under 44, `0.120061`; 36 under 44, `0.052099`; 46 under 48, `0.008878`; `W = 0`, `0.961219`. What the formula assumes: reading a persona's limit as a 96% effective width is Wayford's assumption (`folk`), whatever source the number itself has, since no target-size guideline gives a hit rate; the error model was measured with a mouse, in one dimension, and in it the spread grows with the distance and the speed of the movement, both of which B4 ignores: it fixes the spread at `L / 4.133`; the misses a persona makes on a target at its limit, the baseline, are not modelled for any target.

**Where a miss lands.** The aim point is where the click would have landed: the target's action point, the centre of the part of its box inside the viewport, where every click is pressed (`actionPoint`, `packages/agent/src/act.ts`). The candidates are the shown controls of the step's observation: the elements with a ref, not `invisible`, and with a measured `targetPx`, which only a control carries. The target is not one. A text block is not one either: a tap that lands on text does nothing, like one on empty space, and a click on a wide paragraph would be pressed at its centre, hundreds of px from where the miss fell. Also left out are a control whose box holds the aim point (one that encloses the target) and a control whose own action point lies inside the target's box, since a click there lands on the target. A box holds a point on its left and top edges and not on its right and bottom ones, as the viewport does. A candidate's distance is the Euclidean distance from the aim point to the nearest point of its box: a tap lands on a neighbour once it crosses the neighbour's edge, not its centre. A candidate is in reach when its distance is at most `L`. Along one axis the model puts fewer than 1 tap in 20,000 further than `L` from the aim point, in the plane about 1 in 5,000. With no candidate in reach, B4 does not apply to the click: it draws nothing and logs nothing. A miss onto empty space would be a click on nothing, which an `Action` cannot carry, so it is left out. The nearest candidate is the one in reach at the smallest distance; a tie goes to the one earlier in the observation's element order, the order the Actor reads them (`e1..eN`). When the roll fires, the performed action is a click on the nearest candidate's ref, or a `doubleClick` when B1 fired, and the cursor moves to that control's action point before the press, as for any click on it (`docs/PLAN.md` F5 AC7). An `Action` names a ref, not a point, so the press lands where a click on that neighbour always lands, not where the miss crossed its edge. Once the roll has fired, nothing about where the click lands is random: geometry decides it, and the seed reproduces it.

**What B4 gets wrong.** B4 is wrong in known ways. It sends every miss it rolls to one neighbour, so `p` is not the model's chance of landing on that neighbour: that chance is lower where a gap lies between the two, since most misses land just off the target's edge, and can be higher where the neighbour's label abuts the target. The aim point is the centre of the control's own box, which for a checkbox inside its label is not the centre of the area a click activates, and a square target can be missed on both axes where the model reads one: both make real misses likelier than `p`, so B4 understates there. Misses onto text or empty space are not modelled, and with them every miss on a control with no control in reach, so B4 understates there too. B4 rolls on a proposed `click` only, though a `type`, or a `doubleClick` the Actor proposes, presses the same point, so a small text field, or a small control the Actor double-clicks, is never missed: it understates there as well. The candidates are the controls the Actor was shown, so a control that perception or attention removed is never where a miss lands, though the hand does not depend on the eye: where one lies nearest, B4 sends the miss to a shown control further off and misattributes it, or, with no shown control in reach, rolls nothing and understates.

**B4 beside B1 and B2.** The rules roll in the table's order, B1, B2, B4: B4 does not roll on a step where B2 fired, since the scroll has no target, and a fired B1 and a fired B4 make a double click on the neighbour. The history keeps the action the Actor proposed, so after a miss that leaves the page reading the same, such as a toggled checkbox, the same click proposed again is a B2 repeat.

**The arithmetic.** B4 computes `erf` by its Maclaurin series, a fixed 40 terms: `t_0 = x`, `t_n = t_{n−1} × (−x²) / n`, each summand `t_n / (2n + 1)`, summed from `n = 39` down to `n = 0`, and the sum multiplied by `2/√π` written as the literal `1.1283791670955126`. It uses only addition, subtraction, multiplication and division, in a fixed order, so every JavaScript engine computes the same `p` to the bit and a stored roll's `fired` replays. Salience (A1) avoids a logarithm for the same reason. The difference is floored at 0: for a target a unit or two in the last place under the limit, the two sums can round a unit apart the wrong way, and a probability is never below 0. A roll at `p` 0 is still drawn and logged, and never fires. Over `[0, k]`, all that `W < L` reaches, the series is within a few units in the last place of erf.

**P4 and B4.** Seeing a target and hitting it are two capabilities, but the line between P4 and B4 is an engineering division, not two capabilities measured apart. P4 removes a target below the persona's cut from the observation, or degrades it in its band. B4 adds a modelled miss rate on the targets P4 leaves shown. B4 rolls only on a control the Actor was shown, so a persona whose P4 floor (its threshold, for a hard cut) is at or above its motor limit never rolls B4. Vera's P4 cut does not change: it still closes the entrances to routes B and C, so the contrast sweep on her still measures one route ("Persona composition"). No persona sets a motor limit yet, so no row of the bundle, calibration or route tables changes and no run of the five personas rolls B4. The next step is to move a motor persona's target size from P4 into B4, Milo's 44 px first; it needs misses onto empty space modelled first.

**B3 in detail.** Every run keeps a simulated clock. A step costs one decision, and the action it performs adds the motor operators of the Keystroke-Level Model (KLM), with pointing timed by Fitts's law. The run's simulated time is the sum of its steps' times, and B3 reads that sum. The wall clock decides nothing: the run records it (`durationMs`) as evidence of how long the tool took, not of how long the persona took. The clock is a model with sources, not a measurement of a person. All times are in ms.

| Operator | Time | Source |
|---|---|---|
| M, decide | 1350 | KLM: mental preparation (Card, Moran and Newell 1980, 1983) |
| P, point | `max(0, a + b · log2(D / W + 1))`, `a = −107` ms, `b = 223` ms per bit | Fitts's law in its Shannon form (MacKenzie 1992); `a` and `b` are MacKenzie, Sellen and Buxton 1991's fit for pointing with a mouse (r 0.990, CHI '91) |
| B, press or release a button | 100 | KLM, as Kieras' guide (1993) gives it |
| K, a keystroke | 280 | KLM: an average non-secretary typist, about 40 words a minute (Card, Moran and Newell 1980) |

A step's operators, by the action it performs:

| Step | Time |
|---|---|
| wasted (s2-03) | M |
| `giveUp` | M |
| `click` | M + P + 2B |
| `doubleClick` | M + P + 4B |
| `type` | M + P + 2B + K per character typed |
| `scroll` | M + K |
| `back` | M + K |
| `wait` | M + the wait's `ms` |

The performed action decides the operators: a click B1 turned into a double click costs 4B, and a `giveUp` B2 turned into a scroll costs M + K. A `type` presses its field and types the one line `act.ts` types, its characters counted in code points. A scroll moves 0.8 of the viewport at once, as Page Down does, so it costs one keystroke; a back costs one too, such as Alt+Left. A wait is time the persona chose to let pass. One M per step, a wasted one included, is Wayford's (`folk`): a step is one look and one decision, and the KLM's heuristics for placing M need a task analysis no run has. A keystroke for a scroll or a back is a `folk` use of a sourced operator.

**The pace.** Two behaviour knobs scale the operators, each a factor of the norm, the KLM's average user, and 1 when the profile sets none. `thinkingTime` scales M; `motorTime` scales P, B and the one K of a scroll or a back. Each carries its own provenance, as a threshold does. Typed characters are timed at the norm's K, unscaled: typing speed is out of scope, so no persona types faster or slower than another. A wait is not scaled. A step's time is `round(thinking × M + motor × (P + presses × B + keys × K) + typed × K + waitMs)`, a whole number of ms, where `presses` is 2 for a click or a `type`, 4 for a double click and 0 otherwise, `keys` is 1 for a scroll or a back and 0 otherwise, `typed` is the characters a `type` types, `waitMs` is a wait's `ms`, and P is 0 for a step that points at nothing. No source gives a persona's pace, so every factor set today is `folk`. Vera sets `thinkingTime` 2 and `motorTime` 1.5: with little practice with interfaces, she decides at half the norm's speed and moves at two thirds of it. Zoya sets 3 and 2, the far end of the scale. Ada, Kai and Milo set none and run at the norm. Ada is the control, with no threshold. Kai differs from Ada only after perception, in knowledge, attention and memory (the calibration row "Kai at the target app's defaults"), and his bundle keeps that. Milo is proficient, and his hurry is already his 90 s budget.

**Where a movement starts and ends.** `D` is the distance in CSS px from the cursor's last point to the aim point, and `W` is the aimed element's `targetPx`, the smaller side of the area a click activates ("What is measured"). A text block has no `targetPx`, so its `W` is the smaller side of its box. `W` is at least 1 px. The aim point is the element's action point, where every press lands (`actionPoint`, "Where a miss lands"), so the movement ends where the press lands.

- **Aim and landing.** The movement is timed to the element the Actor proposed, since that is where the hand aims. After a fired B4 the press lands on the neighbour, so the cursor's next point is the neighbour's action point, and the next step's movement starts there. That is B4's time penalty.
- **The first point** is the centre of the first observation's viewport (`folk`).
- **Moves without a point.** A scroll, a back or a wait leaves the cursor where it was in the viewport, as a real pointer stays: the loop puts it back on the last pressed point (`restorePointer`).
- **The floor.** `a` is negative, so a very short move computes below zero, and P is floored at 0. `a` is a regression intercept, not a time.

**B3's worked example.** Computed outside our code, with Python's `math.log2`. `D = 400` and `W = 36`, the target size of the hard link "Order archive", give `log2(400/36 + 1) = 3.598259` bits and P 695.4118 ms. A click there costs Ada `round(1350 + 695.4118 + 200)` = 2245 ms, and Vera, at 2 and 1.5, `round(2700 + 1.5 × 895.4118)` = 4043 ms. More pairs of `D` and `W`: 36 and 36 give 116 ms; `D = 0` gives 0, floored from −107; 600 and 20 give 997.7858 ms; 1000 and 10 give 1377.7812 ms.

**When B3 ends a run.** A planned step's time is added to the run's once its action is planned, before it is performed. A step whose time takes the run past `budgetSeconds` stays planned and is never performed, and the run ends `budget_exceeded` with `limit: "clock"`. So a success always lands inside the budget: a slow step planned inside it can no longer land past it. A wasted step's M is added when the step is wasted, and B3 checks it at the end of the step.

**B3 and the seed.** The clock adds no jitter. A step's time is a pure function of the step's evidence, the actions proposed and performed, the cursor's point and the profile's knobs, so the clock draws nothing from the behaviour stream and B3 never appears in the dice log ("What is logged"). The same run seed and Actor answers give the same simulated times and the same outcome. `Math.log2` is the engine's own, and salience (A1) avoids a logarithm for that reason. B3 can use one: only the Actor's Node loop computes a step's time, and the browser reads the stored numbers. Each step is rounded to a whole ms, so a last-bit difference between engines could move a step only at an exact half millisecond, and B3 compares whole numbers.

**What B3 gets wrong.** The KLM times an expert doing a routine task. It has no reading, no visual search and no waiting for the page, so for a person new to a page the clock understates, and the budget binds later than it would. The mouse's constants serve every device: Milo's touch is not timed apart from a mouse. M is one per step, not placed by the KLM's heuristics. No time is spent waiting for the page, which the KLM calls R: that time is the machine's, and leaving it out is what makes the clock reproducible.

**B3 and the budgets.** The budgets did not change with the clock. At the geometry of B3's worked example a click step costs Ada about 2.2 s, Vera about 4 s and Zoya about 5.8 s, so Ada's 120 s cover about 53 such steps, Vera's about 29, and Zoya's 180 s about 30. Under a step cap of 20 the clock ends no walk of clicks and scrolls; only long waits (a `wait` is at most 10 s, core's `MAX_WAIT_MS`) or long typed text could. Under io's longer caps, up to 40 (`docs/PLAN.md` F5 AC5), it ends Vera's and Zoya's long walks. On a short goal the step cap, not the clock, ends the runs the wall clock used to end: those endings were the machine's. The budgets are `folk`, and they were not retuned to make the clock bite, since that would invent behaviour for the demo.

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
| A | open | closed at the final link (A1): "Order archive" is the least salient of the 15 elements on `/deliveries` | closed at the final link (P4): the hard link, 36 px under 44 | per seed (P1): degraded in some seeds and cut in the rest, never whole | closed at home (P3, P4): her font cut alone removes every link |
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
| Vera | contrast 3.0 soft, font 16, target 32, `blurredVision` | unknown: hamburger, kebab, breadcrumb | `maxElements` 20, `memorySteps` 3 | doubleClick 0.8, budget 120 s, thinkingTime 2, motorTime 1.5 (folk) |
| Zoya | contrast 7.0 soft, font 24, target 48, `reducedContrast` | every pattern unknown, no `domainVocabulary` (K2 off) | `maxElements` 5, `maxOptions` 4, `memorySteps` 2 | doubleClick 0.9, scrollWhenStuck 0.3, budget 180 s, thinkingTime 3, motorTime 2 (folk) |

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
| `fitts` | movement time vs distance and width | Fitts 1954; MacKenzie 1992 Shannon formulation; MacKenzie, Sellen, Buxton. A comparison of input devices in elemental pointing and dragging tasks. CHI 1991 (the mouse's a and b) |
| `iso9241` | effective width, error rate | ISO 9241-9 (now 9241-411) |
| `hick` | choice time vs number of options | Hick 1952, Hyman 1953 |
| `klm` | per-action operator times: mental preparation, keystroke, button press | Card, Moran, Newell. The keystroke-level model for user performance time with interactive systems. CACM 23(7), 1980; The Psychology of Human-Computer Interaction, 1983. Kieras. Using the Keystroke-Level Model to Estimate Execution Times, 1993 (B) |
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
- Motor tremor, overshoot and the cursor's path. B4 models only where a click lands, from the effective-width error model, and B3 only how long a movement takes, from its distance and the target's width (stage 7).
- Screen readers and keyboard-only navigation. A different observation channel entirely. Strong "what next" slide, out of scope now.
