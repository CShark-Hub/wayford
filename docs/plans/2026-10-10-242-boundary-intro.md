# #242 — Boundary: say what the page is for: plan

Task: issue #242 (no task file: an issue fix, "Fix #242" on `main`) · Spec: none (S; the issue is the spec)
Status: approved 2026-10-10 (auto)

The issue's acceptance:

1. The Boundary, empty or not, says in one or two sentences what a sweep is and what the boundary means, before any chart or command.
2. The empty state says what is missing and how to get it, with the commands secondary.
3. Copy passes `docs/DEMO.md` "Words we do not use".

Measured on `main` `6f0c0fd` at 1280 × 720, in both themes, with the self-check's fixture sweeps: the page does not scroll, and Vera's chart SVG runs from y 293 to 697. Under it, the chart's frame and the page's bottom padding leave about 3 px to spare (first read as 23 px, off the SVG alone: corrected in review). Beat 6 is shown at that size.

| # | Step | Files | Serves | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | The intro: `BOUNDARY_INTRO`, one line, in a `body` paragraph in `ink-2`. It shares the head's top row with the axis switch, on a loaded sweep and on the empty preset alike; the meta line takes the row under it, full width. On a missing sweep id it leads the page. The Boundary's frame gives back the 20 px the meta line's row costs | `packages/web/src/boundary/sweep-view.tsx`, `packages/web/src/screens/boundary.tsx`, `boundary.test.tsx` | 1 | `boundary.test.tsx`: the intro is in the markup before the `<h1>` and before the chart's `<figure>` on both routes, on the empty preset and on a missing id | `pnpm --filter @wayford/web exec vitest run src/screens/boundary.test.tsx` green | — |
| 2 | The empty state: the mono label, the `display-m` sentence of what is missing, then the commands as one secondary line in `ink-3`, led by "How to store one:", then the action (`docs/DESIGN.md`, "States": one line of body, one action) | `packages/web/src/screens/boundary.tsx`, `boundary.test.tsx` | 2 | The empty preset's and the missing id's line starts "How to store one:" and comes after the `<h1>`; the banned words are checked on both empty states too | as step 1 | — |
| 3 | The docs say it. `docs/DESIGN.md`, "Charts": the Boundary opens with the intro | `docs/DESIGN.md` | — | — (docs) | Read back | 2 |
| 4 | Verify | — | all | — | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @wayford/web check:self`; the page measured at 1280 × 720 in both themes (no scroll, the intro on one line, the chart's bottom inside the window) on Vera's and Kai's sweeps, an incomplete sweep, a sweep on a minted task id and both empty states, screenshots looked at | — |

Steps 1 and 2 both change `boundary.tsx` and its test, so they run one after the other. The task is S, so it is built in this session.

## Decision log

| Question | Taken | Why |
|---|---|---|
| Where the intro goes on a loaded sweep | The head's top row, beside the axis switch, with the meta line in a full-width row under it (review) | First built above the meta line in the switch's row, which cost 4 px. The cold review found the meta line wraps beside the switch on an incomplete sweep or a minted task id, such as the finals' pick: the row then grew by 24 px and the page scrolled 20 px. Truncating the meta line would hide "incomplete, 3 of 7 values", which nothing else on the page says. Under the intro, the meta line has 1104 px: enough for either, and for both on Kai's sweep (1085 px). Both at once on Vera's contrast range still wraps it and scrolls the page 18 px (second review); a sweep of hers on a minted task id that also stopped short is the one case left, and the finals' sweep is Kai's |
| Where the 20 px the meta line's row costs come from | The Boundary's own `FRAME`: 16 px at the top (was 24), 8 px between and under the blocks (was 12) (review) | A loaded sweep had about 3 px to spare, and the chart has no height to give: its 16 px tick labels sit at the self-check's floor, so it cannot scale down. `FRAME` is used by every state of this screen and no other, so nothing moves when the data arrives |
| How long the intro is | Two short sentences on one line, at most the width left of the switch (757 px at 1280; the line is 735) | A second line costs 24 px more than the page has. The first draft, one sentence of 108 characters, wrapped. The lead under the headline gives the numbers behind the boundary, and the note beside the table says which field moved |
| The issue's longer copy ("Where does it stop working? …") | Not taken | It is four sentences: it fits the empty state but not the loaded page, and the issue asks for the same intro on both |
| The empty state's shape | Keep `docs/DESIGN.md`'s empty state (a mono label, one sentence, one line of body, one action); the intro sits above it; the line becomes "How to store one:" and the commands, in `ink-3` | The issue asks for the commands to be secondary; DESIGN's States rule fixes the empty state's parts |
| Guarding the fit | A browser test in `self-check.browser.test.ts`: the listed Boundary, Kai's sweep on a minted task id and an incomplete sweep, in both themes, each with the intro and the meta line on one line and nothing scrolling (second review) | The page has about 2 px to spare, and `docs/DESIGN.md`'s "must stay one line" had no guard. It fails on the first build's layout, on the minted id and the incomplete sweep |
| The loading skeleton | Three rows in the head, as the loaded page has (second review) | The old two-row skeleton put the chart 38 px above where it lands. Now 2 px |
| `docs/design/screens/boundary.html` | Not redrawn; `docs/DESIGN.md`, "Charts", is the record of the intro, and the code's comment says the picture lacks it (second review question) | The picture is a reference for the look; the change is one line of copy and a row moved |
| The missing id's line | The same "How to store one:" line as the empty preset (review question) | The headline already says io holds no sweep under the id, and "Open the latest sweep" is the way out. One shared line keeps the empty state to DESIGN's one line of body |
| The commands' ink | Inherit the line's `ink-3`, not `ink` (review) | At full ink the commands were the darkest text under the headline, which the issue asks to make secondary |
| Renaming the switch's items to "Vera · contrast threshold", "Kai · attention cap" | Not taken | The issue lists it under Recommendation, not Acceptance. The longer labels widen the switch by about 100 px, which the intro's one line needs, and the meta line and the note beside the table already name the field |
