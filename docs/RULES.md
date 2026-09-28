# Wayford — RULES: what the filter does and where each rule comes from

Status: **frozen for week 2.** The objections the week 2 filter tasks depend on (issues #22, #23 and #49) were decided in `m0-08`, and the decisions are written where they apply. From here on a change to this file is a PR with two approvals, like any change to the filter contract. Every rule here is a claim the team must be able to defend in Q&A. If a rule has no source, it says `folk` and the report says `folk`. If a rule cannot be made deterministic, it does not belong in the filter; it belongs in the "what next" slide.

This document is the domain model behind `Profile`, `Observation` and `Finding`. The `provenance` field in a profile refers to a source id from the registry at the bottom.

## The pipeline

Order is fixed and matters. Each stage takes the observation from the previous one.

```
1. viewport       what is on screen at all              deterministic   (device, scroll position)
2. perception     what can be seen                       deterministic per element per run (seed)
3. degradation    how well it can be read                deterministic per element per run (seed)
4. knowledge      what it means                          deterministic
5. attention      what gets noticed first, how much      deterministic ordering, capped
6. memory         what the Actor still remembers         deterministic truncation
7. behaviour      what the Actor does with its choice    dice per action (seed)
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

**The roll.** `rolled` is one number in `[0, 1)` per element per run, taken from `hash(run seed, element key)`. The run seed decides, not the profile seed (`docs/PLAN.md` A20). Every soft rule on the element uses the same `rolled`, and every decision stores it, so a reviewer can see why an element was degraded in run 7 and missing in run 8.

**Several rules.** Every rule an element fails is recorded. The state is the worst of them: `invisible` over `degraded` over `visible`.

**Monotone by construction.** For a fixed seed and element, and with softness held fixed, raising a threshold never makes the element more visible: `rolled` does not move and `position` only falls. Changing softness can move an element back from invisible to degraded, so a sweep keeps it constant. The boundary sweep (F9) relies on this, and the calibration table checks it.

**Worked example.** Vera's contrast cut is 3.0 with softness 0.5, so her band runs from 1.5 to 3.0. The target app's hard link measures 2.006:1 at its defaults, which is position 0.337. Across seeds the link reaches her degraded in about one run in three and not at all in the rest. It never reaches her whole.

**What is measured.** Controls, and text blocks: headings, paragraphs, list items, labels (issue #49). The cues that tell a person where to go are mostly text, so P1 and P3 apply to text blocks too. P4 applies to controls only.

## Stage 2 and 3: perception and degradation

Three states per element, not two. Binary removal makes every failure "did not see it". Degradation makes "saw it, misread it" possible, which is where real wrong clicks come from.

| State | Effect on the element in the observation |
|---|---|
| `visible` | passed through unchanged |
| `degraded` | passed through with its name partially masked, masking ratio deterministic from `hash(seed, key)`; role and bounding box kept |
| `invisible` | removed from the Actor-facing observation, kept in evidence |

Rules that decide the state. Metric is computed by the filter from the DOM, threshold comes from the profile.

| Id | Metric | Visible when | Degraded when | Source |
|---|---|---|---|---|
| P1 | text contrast ratio, after colour-vision simulation if the profile sets one | `>= threshold` | in the band, by roll (see above) | WCAG 2.2 1.4.3 for the 4.5:1 and 3:1 anchors; Machado 2009 for the simulation |
| P2 | non-text contrast of controls, borders, icons | `>= threshold` (WCAG anchor 3:1) | band | WCAG 2.2 1.4.11 |
| P3 | font size in CSS px, scaled by page zoom | `>= threshold` | band | Legge and Bigelow 2011 for the acuity to print-size relation; WCAG 1.4.4 for the 200% zoom anchor |
| P4 | target size, smaller side of the bounding box | `>= threshold` (anchors 24 px AA, 44 px AAA) | band | WCAG 2.2 2.5.8 and 2.5.5; Parhi 2006 for the 9.2 mm touch anchor; Apple HIG 44 pt; Material 48 dp |
| P5 | colour-only distinction: two adjacent siblings whose names are identical and which differ only in colour | n/a | both degraded to the same name after simulation | WCAG 1.4.1 |
| P6 | contrast under `reducedContrast` or `blurredVision` CDP emulation | as P1 but on the emulated screenshot | | CDP `Emulation.setEmulatedVisionDeficiency`; illustration only, decision is P1 |

Softness and the roll work the same for every rule in this table: see "Thresholds, bands and the roll" above.

Open: P3 threshold should be derived from a declared acuity (Snellen 20/40, 20/70) and a nominal viewing distance, not typed as px. Then the profile says "20/70" and the px falls out with a source attached. Not in the week 2 plan; a candidate for week 3 or the "what next" slide.

## Stage 4: knowledge

Deterministic. No dice. The persona either knows a pattern or does not.

| Id | Input | Effect | Source |
|---|---|---|---|
| K1 | element matches a UI pattern in `unknownPatterns` (hamburger, kebab, breadcrumb, carousel, tabs, accordion, FAB, infinite scroll, swipe) | element name replaced by its bare role, e.g. "menu" becomes "button, icon only" | NN/g hidden navigation study (2016): hidden nav roughly halves discoverability; Jakob's Law |
| K2 | element name contains a term not in `domainVocabulary` and flagged as jargon | term masked as `[unfamiliar term]` | PLAIN guidelines; a jargon list per target app, provenance `folk` or `llm` depending on who wrote it |
| K3 | readability of a text block above the persona's grade level | block summarised to its first sentence, rest masked | Pisarek fog index (Polish), Flesch-Kincaid or Gunning fog (English) |
| K4 | icon-only control without a text label and pattern not in `knownPatterns` | as K1 | NN/g icon usability |

Pattern detection is heuristics on role, name, position and children. Each heuristic is a pure function with tests on the target app. Wrong detection is a bug, not a finding.

## Stage 1 and 5: viewport and attention

| Id | Input | Effect | Source |
|---|---|---|---|
| V1 | `device` | real Playwright device emulation, viewport, touch, user agent | deterministic |
| V2 | scroll position | observation contains only elements intersecting the viewport, plus a count "N more below" | NN/g scrolling and attention (2018): 57% of viewing time above the fold |
| A1 | attention capacity `maxElements` | observation ordered by salience, then truncated to `maxElements` | visual hierarchy: size, contrast, position; F-pattern (NN/g 2006) for the position weight |
| A2 | banner blindness | elements in ad-like positions and sizes (right rail, top leaderboard, image-heavy blocks) pushed to the end of the order for personas with low attention capacity | Benway 1998; NN/g banner blindness |
| A3 | option cap | in a list or menu with more than `maxOptions` entries only the first `maxOptions` are passed, the rest counted | Hick-Hyman law for choice time; Cowan 2001 for the capacity of about four items |

A1 is the rule that makes low-literacy personas *scan* rather than *read*. It changes what the model sees first, which changes what it clicks. It is deterministic and cheap.

## Stage 6: memory

| Id | Input | Effect | Source |
|---|---|---|---|
| M1 | `memorySteps` | the Actor's conversation history is truncated to the last `memorySteps` steps; earlier steps replaced by a one-line count | Cowan 2001 working memory of about four chunks; PIAAC level descriptions for multi-step tasks |

This is the one rule that touches the model's context directly instead of the observation, and it is still deterministic. It is also the most honest model of "lost track of where I was".

## Stage 7: behaviour

Dice per action, from the seeded stream, every roll logged.

- **Firing rule.** A rule that applies to the action draws one number `rolled` in [0, 1) and fires when `rolled < p`. `p` is the probability the rule resolved for this action: the profile knob for B1 and B2, the effective-width model for B4. `p` 0 never fires; `p` 1 always does. How `rolled` is drawn from the seed is decided with s2-03 and #26.
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
| Persona with a hard contrast cut above the hard link's contrast | 0/10 on the hard goal. The filter removed the only path. |
| Vera at the target app's defaults: soft cut 3.0, band from 1.5, hard link at 2.006:1. Its 16 px font sits exactly on her 16 px font cut, on purpose, so the row also checks that `>=` passes; its 36 px box clears her 32 px target cut (issue #32) | the link reaches her degraded in about one seed in three (checked over 1000 seeds in `s1-01`) and never whole. For a fixed seed list the number of seeds where it is degraded is fixed, and hard-goal successes never exceed it. Ten seeds are too few to judge the share: at a true third, 4/10 or more happens almost half the time. |
| Zoya at the target app's defaults | 0/10 on both goals. Her hard 24 px font cut removes every link in the app (16 to 18 px), so no route leaves the home page. That is the far end of the scale, not a broken engine (decided in `m0-08`, issue #23). |
| axe-core violations on the target app | every P1 to P4 removal on a page corresponds to at least one axe finding on the same page, or the rule is stricter than WCAG and says so in provenance |
| Same seed twice | identical observations per step, identical dice rolls |
| Sweep on contrast | monotone per seed: once a value fails, all stricter values fail. Over the fixed seed set the success rate never rises as the threshold does. |

## Persona composition

A persona is a bundle. Reference points for calibrating bundles, not for labelling them:

- **PIAAC / OECD problem solving in technology-rich environments**, as summarised by NN/g (2016): 26% of adults cannot use a computer, 14% below level 1, 29% level 1, 26% level 2, 5% level 3. Level 1 means few steps, no navigating across pages, explicit criteria. Maps onto `memorySteps`, `maxElements`, `unknownPatterns`, `budgetSeconds`.
- **WCAG 2.2** anchors for perception thresholds.
- **PersonaLayer** taxonomy of 45 profiles as a checklist of dimensions we do or do not model.

Four hackathon personas, as bundles, listed in the order they are numbered
here and stored on disk. Ada and Zoya are the two ends of the scale: Ada is
what the engine looks like with nothing switched on, Zoya is every dimension at
once. Milo and Vera are the two interesting middles.

| Persona | Perception | Knowledge | Attention and memory | Behaviour |
|---|---|---|---|---|
| Ada | none | all known | unlimited | budget 120 s |
| Milo | mobile device, target 44, no contrast rule | all known | `maxElements` 20, `memorySteps` 6 | scrollWhenStuck 0.9, budget 90 s |
| Vera | contrast 3.0 soft, font 16, target 32, `blurredVision` | unknown: hamburger, kebab, breadcrumb | `maxElements` 12, `memorySteps` 3 | doubleClick 0.8, budget 120 s |
| Zoya | contrast 7.0 soft, font 24, target 48, `reducedContrast` | nothing known, every pattern unknown | `maxElements` 5, `maxOptions` 4, `memorySteps` 2 | doubleClick 0.9, scrollWhenStuck 0.3, budget 180 s |

The initial is the dimension the persona is defined by: **A**ll clear, **M**obile
and motor, **V**ision, and **Z** for the far end of the scale. Alphabetical order
is therefore the order of how much filter each one switches on, so a dashboard
and a sweep both read left to right without sorting anything. Thresholds across
different metrics are not comparable — Milo's 44 px target is stricter than
Vera's 32 px — so what is ordered is the number of dimensions switched on, not a
severity score.

Zoya is the far end on purpose. At the target app's defaults the calibration
table above expects her at 0/10 on both goals: her 24 px font cut alone removes
every link. That is a finding about the app, and it stays (decided in `m0-08`,
issue #23).

The contrast sweep runs on Vera. At the app's defaults contrast is the only
metric that gates her (`tasks/m0-06-target-app.md`), so sweeping her contrast
threshold asks the question the sweep exists for: at which value does the path
come back.

## Source registry

Ids used in `provenance`. Each entry: id, what it anchors, citation.

| Id | Anchors | Citation |
|---|---|---|
| `wcag22` | contrast 4.5:1 and 3:1, non-text 3:1, target 24 px and 44 px, colour-only, zoom 200% | W3C WCAG 2.2, criteria 1.4.3, 1.4.11, 1.4.1, 1.4.4, 2.5.8, 2.5.5 |
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
