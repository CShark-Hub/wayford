# #243 — Cast: explain each threshold's source (wcag22, legge2011, material…) on hover: plan

Task: issue #243 (no task file: an issue fix, "Fix #243" on `main`) · Spec: none (S; the issue is the spec)
Status: approved 2026-10-11 (auto)

The issue's acceptance:

1. Hovering or focusing any provenance tag shows the source, what it anchors and the citation.
2. Keyboard and touch reach it.
3. A test covers every id in `PROVENANCE_IDS`.

Plus its recommendation: a web-side map transcribed from `docs/RULES.md`'s "Source registry", nothing in `packages/core` changed, and #240's `Hint` reused, with the tag as its trigger, in `ProvenanceTag` and the matrix's bare tag, so the Cast, the Lens and finding cards change at once.

Display only. No core, io, filter or Analyst change, and no new dependency.

## How it works

**The words** (`components/provenance-words.ts`, new). `PROVENANCE_WORDS: Record<ProvenanceId, { name, anchors, citation }>`, one entry per registry row, each a phrase: what the source is, what Wayford's rules take from it, and where to find it. `citation` is `null` for `folk` and `llm`, the ids core counts unsourced. `provenanceHint(id)` joins them as `"<name>. In Wayford: <anchors>. <citation>."`, and in place of a missing citation says "Nothing to cite, so what rests on it is soft, drawn dotted", which is what Principle 3 draws. The `Record` type fails typecheck on a missing id, and a test checks the keys against `PROVENANCE_IDS` at run time too.

**The trigger** (`components/ui/tooltip.tsx`). `Hint` takes an optional `face`, drawn in place of the Info icon in the same one button, with the same open rules (#240): hover, keyboard focus, a click, a tap toggle, Esc, one hint at a time, the hidden description. With a face the button is `size="sm"` (32 px high), at least 32 px wide, with no padding: a 32 px box around a flag about 26 px tall, whose `-my-0.75` margins give the row back the 6 px, so every row the tag sits in keeps its height. The ghost hover ground moves from the box to the flag.

**The tag** (`components/tag.tsx`). `ProvenanceTag({ provenance, bare })` is a `Hint` whose face is the old tag: solid for a sourced id, dotted with "· no source" for `folk` and `llm`, and with `bare`, the id alone, still dotted, as the Cast's matrix draws it under a legend that says what dotted means. The button is named `Explain <the tag's words>`: a button starts with a verb (DESIGN, Copy), and the name holds the visible words (WCAG 2.2, 2.5.3).

**The Cast's matrix** (`components/cast-card.tsx`). `DimensionValue` draws `ProvenanceTag` in both rooms, `bare` in the matrix. There the tag's `<p>` is raised (`relative z-2`) over the link the Cast stretches across each column (`z-1`), so the tag takes the pointer: hovering it opens its hint, a click opens no Lens. The CastCard in the tile's hover card needs no change: its tags are triggers too.

**The Lens and finding cards** call `ProvenanceTag` already, so they change with it.

## Copy

Drawn from the registry and the rules that cite each id, and narrowed to what the built rules take from a source (branch review, then PR review). "In Wayford:", not the issue's "Here:", since the anchors are the source's across the rules, not the threshold beside the tag. The filter builds P1, P3, P4, V2, V3, A1, K1, K2 and K4; P2, P5, A2, A3 and K3 are not built, P1 simulates no colour vision and P3 scales by no zoom (#277). So:

- `wcag22` anchors contrast 4.5:1, 3:1 and 7:1 and targets of 24 and 44 px, citing 1.4.3, 1.4.6, 2.5.5 and 2.5.8; colour alone (1.4.1), non-text contrast (1.4.11) and zoom (1.4.4) are left out until a rule takes them.
- `machado2009` anchors the colour shift a run's screenshots show (P6, illustration only), with nothing that reaches the model changed.
- `legge2011`, a review, anchors the font-size cut, whose px are set by hand, not yet derived from an acuity (RULES, stage 2, "Open").
- `hick` anchors choice time against the number of options, as its row says, for an option cap not built yet (A3); `benway1998`, `pisarek`, `flesch` and `nngroup`'s banners say "for a rule not built yet" (A2, K3).
- `plain` anchors the idea of jargon behind K2, its list being folk; `personalayer` a checklist of dimensions Wayford does or does not model.
- `folk` says "anything set without a source, such as a team's number or list, or a threshold moved on the Lens", as io's `provenanceOf` marks K1, K2, K4, V2 and V3 folk too, which are lists or page tests, not numbers; `llm` "a profile, threshold or word list a model wrote", never a rule, which is code.

RULES's pointer says the words are drawn from the table and narrowed, not transcribed, so a change to a row must be checked there; only the ids are tested.

Kept clear of `docs/DEMO.md`'s "Words we do not use", which DESIGN's Copy keeps "off every screen": `nngroup` and `benway1998` say "banners passed over as ads" rather than the paper's own title word, so no hint holds "blind", which #271's Report check bans in every description. `benway1998`'s citation drops the title, so it names the meeting, the 42nd, to stay findable; whether citations are exempt from the list is the team's call (asked on the PR).

## Steps

| # | Step | Files | Done when |
|---|---|---|---|
| 1 | The words and their tests: every id has a name and anchors; a citation exactly when core counts it sourced; the wcag22 and folk hints pinned; no hint holds a persona name or a DEMO word | `components/provenance-words.ts`, `.test.ts` | green |
| 2 | `Hint`'s face, tested through `ProvenanceTag` (step 3) and the browser test (step 5) | `components/ui/tooltip.tsx` | green |
| 3 | `ProvenanceTag` as a `Hint`, `bare`; its tests: one button named `Explain …`, the tag its face, described by `provenanceHint` | `components/tag.tsx`, `tag.test.tsx` | green |
| 4 | The matrix cell through `ProvenanceTag`, raised over the stretch; the tests that pinned the bare `<span>` read it inside the button; the card's button list names the source's button | `components/cast-card.tsx`, `cast-card.test.tsx`, `finding.test.tsx` | green |
| 5 | The browser test: on the Cast, the Lens and the Report, a tag opens its words on hover, inside the viewport, and stays while the pointer is on them; every provenance tag is a target of 32 px or more and its row is as high as its flag; Tab reaches Vera's tags after her column's link, Esc closes with focus kept; a click and a tap on a matrix tag open its words and no Lens; in Vera's spec sheet a tag's words and the sheet both stay while the pointer moves onto the bubble | `scripts/provenance-hints.browser.test.ts` (new) | green; red without `z-2` (hover, click, tap) and without `-my-0.75` (the row height, on all three screens) |
| 6 | Docs: DESIGN's Tag row; a line in RULES's registry pointing at the transcription | `docs/DESIGN.md`, `docs/RULES.md` | read back |
| 7 | Verify: `pnpm lint`, `pnpm typecheck`, `pnpm test` (its self-check scan runs axe on the Cast, the CastCard, the Lens and the Report in both themes), `check:self`; screenshots of each screen with a hint open in both themes, looked at | — | all green, 0 shortfalls |

## Decision log

| Question | Taken | Why |
|---|---|---|
| Where the words live | A web-side `Record<ProvenanceId, …>` | The issue's recommendation. Core's ids stay a transcription of the registry, and the words are display. RULES's registry now points at the file, so a change to a row is seen to change the words |
| The trigger | The tag itself, a face of `Hint` | The issue's recommendation. An Info button beside each tag would double the tags' room in the matrix, the gauges and the cards. #271's notes say the same: a tag has no job of its own, so #243 extends `Hint`, keeping its tap toggle, rather than taking `LinkHint` |
| A 32 px target for a 26 px flag | A transparent 32 px box with negative margins, flag unchanged | DESIGN's floor, enforced by `check:self`, is 32 px for any control. Growing every row by 6 px would push the Lens's three gauges 18 px and the matrix's threshold rows. #240 refused a negative margin for its one header row, where the row could grow; here the same tag sits in rows on three screens, and the browser test holds each to its flag's height |
| The button's name | `Explain <the tag's words>`, "· no source" included | A button starts with a verb, and the name must hold the visible words for voice control (2.5.3) |
| The matrix tag and the column's link | The tag raised over the link's stretch | Under it, the stretch takes every hover and click, so the hint never opens by pointer. Raised, a click on the tag opens its words, not the Lens; the column's hover ground drops while the pointer is on the tag, which says the tag is not the link |
| The CastCard's tags | Triggers too, unchanged | The issue asks for every provenance tag. The card opens on the tile's hover or the link's keyboard focus, and Tab leaves the link for the matrix's tags, which carry the same sources, so a keyboard reaches each source there |
| A bubble over its neighbours | Accepted | A hint is hoverable (1.4.13), so while open it covers what lies beside it, as #240's and #271's do. It closes when the pointer leaves it or on Esc |
| A `check:self` entry with a provenance hint open | None | The bubble is #240's, whose `report-hint` entry measures it in both themes; the tags themselves are measured as controls on `cast`, `cast-card`, `lens` and `report` |
| Drawing it in `docs/design/components.html` | Not here | Open PR #271 edits `components.html`; the DESIGN row is the record, as #240 left its drawing to a follow-up |
| Open PR #271, which moves `Hint`'s open rules into `useHintOpen` | This branch is cut from `main`; whichever merges second resolves it | `git merge-tree` (branch review) conflicts `tooltip.tsx` from the imports through `useHintOpen`, and DESIGN's adjacent Tag and Hint rows. Resolve by taking #271's hunk and its Hint row, then adding back `FACE`, the face paragraph of `Hint`'s comment, `face` in `Hint`'s signature (outside the hunk, so it merges silently to #271's and `tsc` catches it), and the Tag row. Probed on a scratch merge: `tsc` clean, and the provenance, hints and cast browser tests and the unit tests pass with #271's 300 ms rest, its DEMO-words check included |
| The flag's hover ground | `hover:*:bg-paper-sunken` (branch review) | An arbitrary `[&:hover>*]` variant sits outside Tailwind's `@media (hover: hover)`, so a tap left the flag sunken on a touch screen |
| A matrix tag in a window 800 px wide or less | Left as it is (branch review) | There Vera's tags overflow her column into Zoya's, whose stretched link covers the overflow, so a click on a flag's right edge opens the Lens on Zoya. The overflow is `main`'s, before this change; from 900 px the tags fit |

## Review note

The branch review (`pr-reviewer`, at 6004c81) found no blocking defect. It confirmed the tests prove what they claim (removing `z-2` turns the hover, click and tap cases red; removing `-my-0.75` the row height on all three screens), that no tag's box overlaps another control at 1280 or 1024 px, that the flag's hover ground keeps 5.15:1 in Daylight and 7.86:1 in Night, and that the Tab order is the column's link, then its tags. Fixed: the copy's over-claims (`legge2011`, `hick`, `plain`, `personalayer`, `folk`, `llm`) and "Here:"; RULES's pointer, which claimed a change there changes the words, when only the ids are tested; the Cast's header comment on a click in a column; the hover ground on touch; this plan's conflict note. Taken from its cut list: the face's class assertions in `tooltip.test.tsx` and the `legge2011` pin. Not taken: the narrow-window overflow (see the decision log).

The PR review (gstysiak-cshark, at b631cec) found no blocking defect, and re-ran both mutation probes red. Fixed: `wcag22`, `machado2009`, `hick`, `benway1998`, `pisarek`, `flesch` and `legge2011` claimed rules the filter does not build or a derivation it does not make, and `legge2011` is a review, not a study; `nngroup`'s banners too, on the same reading. RULES's pointer no longer says "transcribed". "here" became "in Wayford" in DESIGN's Tag row and `ProvenanceTag`'s comment (also the CI review's nit). Cut: the face test in `tooltip.test.tsx`, which `tag.test.tsx` covers on the real caller. Not taken: RULES's P1 and P3 rows, which #277 tracks. On the conflicts with #275 (#244) and #276 (#269): one prop for a tag inside `Hint`, with this PR's `FACE` classes, whichever lands second taking the first's name, since #275's shape lets each tag row grow 6 px; and a provenance flag that wraps (#276) must not sit in the fixed 32 px box, decided by whichever lands second.
