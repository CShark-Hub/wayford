# #236 — Race: drop the "narration · after the fact" prefix from each lane's bubble: plan

Task: issue #236 (no task file: an issue fix, "Fix #236" on `main`) · Spec: none (S; the issue is the spec)
Status: approved 2026-10-10 (auto)

The issue's acceptance, with what the #197 comment adds:

1. A race lane's bubble shows only the persona's narration.
2. It still reads as a hypothesis: a dashed border in the persona colour `--p` (the issue asked for the tail too; it is a caret too short to dash, see the decision log). Before the text sits a visually hidden "Narration, written after the action:" for a screen reader.
3. `race-lane.test.tsx` is updated.
4. Run detail's heading `narration · after the fact` (`runs/step-replay.tsx`) stays as it is.

| # | Step | Files | Serves | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | The bubble without its visible label. The `mono-label` span goes; in its place an `sr-only` span reads "Narration, written after the action:", then the narration. The paragraph keeps its clamp, two lines with no detail line and one over it (#195). The outline, the `aria-hidden` span, is dashed; it and its tail, the `::after`, stay in `--p` on `paper`. The file's header comment says how the bubble marks a hypothesis | `packages/web/src/components/race-lane.tsx`, `race-lane.test.tsx`, `packages/web/src/arena/race-view.test.tsx` | 1, 2, 3 | `race-lane.test.tsx`: the bubble's visible text, its `sr-only` spans dropped, is the narration alone; the hidden prefix is the paragraph's first child, `sr-only`, with the issue's words; the outline carries `border-dashed` beside `border-(--p)`, and the tail `after:border-(--p)`; the clamp tests read the paragraph by its narration. `race-view.test.tsx`'s `narrationOf` reads the text after the hidden prefix | `pnpm --filter @wayford/web exec vitest run src/components/race-lane.test.tsx src/arena` green | — |
| 2 | The design docs say it. `docs/DESIGN.md`: Principle 6's narration line names where the label stays (run detail's heading) and how the Race marks it (dashed bubble, hidden prefix); the RaceLane row says the outline is dashed. `docs/design/components.css`: `.wf-narration` drops its label and its outline is dashed (review) | `docs/DESIGN.md`, `docs/design/components.css` | 2, 4 | — (docs) | Read back | 1 |
| 3 | Verify | — | all | — | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @wayford/web check:self` with 0 shortfalls in both themes and the Race layout tests green (bubble inside its lane, tail under the avatar, race-live not cut, race-detail cut); screenshots of the Race at 1280 × 720 in both themes, looked at, the tail's join to the bubble among them | — |

Run detail (`runs/step-replay.tsx`) and the report are not touched: #197 and #239 cover them.

## Decision log

| Question | Taken | Why |
|---|---|---|
| Where the hidden prefix sits | Inside the clamped paragraph, its first child | It is read with the narration as one sentence. An `sr-only` span is absolutely positioned, so it takes no room from the clamp and its containing block is the bubble's `relative` wrapper, not the paragraph |
| The hidden prefix's words | "Narration, written after the action:", the issue's | Says the same as the visible label did, in a sentence a screen reader speaks well; no "after the fact" shorthand needed out loud |
| Whether the tail is dashed | No: the outline is dashed, the hypothesis marking; the tail is a caret too short to dash, drawn in the same persona colour (review) | Each tail side is 8 px with a 2 px stroke, and Chromium draws a dashed one solid: a review probe found tail crops pixel-identical with `after:border-dashed` and with it forced to solid |
| `docs/design/components.css`'s `.wf-narration` | The `::before` label is deleted and the outline is dashed; the tail stays solid (review) | The reference sheets (`components.html`, `screens/race.html`) draw the bubble as the app does |
