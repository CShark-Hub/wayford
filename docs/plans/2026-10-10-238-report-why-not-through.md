# #238 — Report: say in one line why each persona did not get through: plan

Task: issue #238 (no task file: an issue fix, "Fix #238" on `main`) · Spec: none (S; the issue is the spec)
Status: approved 2026-10-10 (auto)

The issue's acceptance:

1. Every persona row with a failed run shows, without clicking, how its runs ended and the main reason.
2. The reason links to its finding, and the finding to its evidence.
3. The reason keeps its certainty glyph: measurement, deterministic or hypothesis.
4. A persona no finding names says so.

Display only, from what `Report` already holds: `PersonaResult.seeds[].outcome`, `Finding.personaIds` and `Finding.type`/`basis`. No core, io or Analyst change.

| # | Step | Files | Serves | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | The tests. On the hard goal's fixture report: Ada, who got through on every seed, has no line; Kai's and Vera's lines count their seeds by outcome in the fixed words, each count matching the seeds and opening the runs of that outcome; Vera's names her first deterministic finding with its glyph and certainty word, linking to its card with Vera picked; Kai's finding keeps its soft line. A persona no finding names says so and opens its runs; one whose only failed seed is an error says the error is the tool's. Each card carries its finding's id as the anchor. No banned word in any line | `packages/web/src/screens/report.test.tsx` | 1–4 | This is the test. It fails on `main`: there is no line | `pnpm --filter @wayford/web exec vitest run src/screens/report.test.tsx` fails on the new tests only | — |
| 2 | The line. Under each persona row with a seed that did not get through, a second row whose one cell spans the five data columns: `N seeds: Gave up in 2 · Over budget in 1`, each count a link to `/runs` with that outcome, then the reason: the first finding naming the persona, deterministic before measurement before hypothesis and in report order within a type, as its certainty glyph and word and its title, linking to `/report/$taskId?persona=…#<finding id>`. No finding names the persona: `No finding names Vera.` and `Open Vera's runs`. Only errors among the failed seeds: `An error is the tool's, not Vera's.` and the same runs link. Both rows of a persona share the hover and the picked ground | `packages/web/src/report/cast-table.tsx` | 1, 3, 4 | Step 1 | Step 1's tests green | — |
| 3 | The anchor. Each finding card sits in a block carrying its finding's id, focusable with `tabIndex={-1}`, and `Findings` scrolls to the hashed card and focuses it once drawn, so the reason's link lands on it | `packages/web/src/report/findings.tsx` | 2 | Step 1 | Step 1's tests green | 2 |
| 4 | The docs say it. `docs/DESIGN.md`'s Report screen row names the line | `docs/DESIGN.md` | — | — (docs) | Read back | 2 |
| 5 | Verify | — | all | — | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @wayford/web check:self` (0 shortfalls in both themes); a screenshot of the Report at 1280 × 720 in both themes, looked at, and the reason's link followed to its card | — |

Steps 2 and 3 are one session's work; the task is S, so it is built in this session, not fanned out. `components/finding.tsx` and `screens/report.tsx` are left alone: PRs #252 and #246 change them.

## Decision log

| Question | Taken | Why |
|---|---|---|
| Which seeds the line counts | Every seed that did not end in success, by outcome: Gave up, Over budget, Error | The issue's "did not get through every run". Over budget, not "out of steps": the Report's seeds hold no limit (`docs/DESIGN.md`, Copy) |
| Repeat got through in the line, as the issue's example does | No: the line counts only the seeds that did not get through, under `N seeds:` | Got through is the readout beside it, counted over the runs that did not error. A second got-through figure over every seed would disagree with it whenever a run errored, and Principle 4 keeps one number per question |
| Which finding is the reason | The first naming the persona, deterministic, then measurement, then hypothesis, report order within a type | The issue's "deterministic before hypothesis". io never names a persona on a measurement today (`packages/io/src/analyst-axe.ts` writes `personaIds: []`); if one ever does, it is still harder than a hypothesis. Soft keeps its rank but shows its dotted line and the word soft |
| What the reason is called | Its certainty word (`deterministic`, `measurement`, `hypothesis`, `soft`) beside the glyph, not "reason" or "because" | The glyph is hidden from assistive technology, so a word must say it; and the finding names the persona, it is not proven to be why a seed ended. Claim less |
| Where the reason's link goes | `/report/$taskId?persona=<id>#<finding id>`: picks the persona and lands on the card | With another persona picked, the card would be filtered out and the hash would land nowhere. Picked, the card stays in view and its evidence leads with the persona's runs |
| A persona whose only failed seeds errored | Counts, then `An error is the tool's, not Vera's.` and its runs, no finding | `PersonaResult.errors`: a crash never reads as the persona failing. A finding cannot explain a run the tool fell over in |
| A persona with every seed through | No line | Nothing to explain; a row of "all got through" repeats the readout |
| Where the line sits | A second table row under the persona's, one cell from the seed column to the last | A sentence does not fit any one column; under the numbers it reads as theirs. Each row stays a measured `<p>` for `check:self` |
| Draw the line in `docs/design/screens/report.html` | Not here; a follow-up draws it once #252 lands | Open PR #252 edits that file; a second edit now would only conflict with it |
| How the error-only case is tested | With a report where a finding names Vera, so a finding is there to offer and is not; seen red with the guard removed (review) | On the fixture no finding names Vera, so dropping the guard kept every test green |
| What a count link says it opens | A `title` in the readouts' words: every stored run of the persona on this goal with that outcome, "which can include runs this report leaves out" (review) | The `/runs` outcome filter is not this report's seeds: the hard goal's report leaves out 2 older runs, so the link can open more runs than its number |
| How the rule under a persona's rows is drawn | `border-b` on each persona's `<tbody>`, with no flag on the row for whether a why line follows (review) | One rule per persona whatever its rows; the screenshots draw it as before |
| A test that sums every line's counts against the seeds | Cut (review) | The Vera, Kai, hypothesis and error-only tests already pin every line's counts |
| Where the card's anchor goes | A block around each card in `report/findings.tsx`, not an `id` on the card | `components/finding.tsx` is under PR #252; the anchor belongs to the report's layout anyway, since a card elsewhere would repeat the id |
| How the link lands on a fresh load | An effect in `Findings` scrolls to the hashed card once drawn and focuses it; the card's block takes `tabIndex={-1}`. A browser test opens the hashed URL on a ten-seed report and reads the card's top and focus (review) | The router scrolls to a hash once per navigation, on its first render, which on a fresh load or reload is the skeleton: the card is not there yet. Without focus, Enter on the link scrolled but left focus behind, so the next Tab scrolled back up. This is the first hash link in web, so the next one should copy this |
