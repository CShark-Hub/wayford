# #195 — Race narration as a speech bubble per persona: plan

Task: issue #195 (no task file: an issue fix, "Fix #195" on `main`) · Spec: none (S; the issue is the spec)
Status: approved 2026-10-08 (auto)

| # | Step | Files | Serves | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | The narration as a bubble in `RaceLane`. With a narration: a bubble that fits its text, first in row 2, right under the avatar. It holds the label `narration · after the fact` in `mono-label` `ink-3`, then the text in `ink`, clamped as today. A tail at its top points at the avatar, and its outline and tail are in the persona's fill. With no narration: no bubble and no label. The bubble's ground, outline and tail are drawn outside the paragraph's box, so they cost the lane no height | `packages/web/src/components/race-lane.tsx`, `race-lane.test.tsx`, `packages/web/src/arena/race-view.test.tsx` | 1, 2, 3, 4 | `race-lane.test.tsx`: a narration draws one bubble, which comes before the detail line and holds the label, then the text, in `text-ink`; its outline and tail use `--p`, and the tail is `aria-hidden`; the clamp is two lines with no detail line and one under it; no narration draws no bubble and no label. `race-view.test.tsx`: a Jev run's lane has no bubble | `pnpm --filter @wayford/web exec vitest run src/components/race-lane.test.tsx src/arena` green | — |
| 2 | The fit and the look in a browser. In both themes, on the live race and on the race with a detail line in every lane, each lane's bubble lies inside its lane, clear of the screenshot, and three lanes still fit 1280 × 720 | `packages/web/scripts/self-check.browser.test.ts` | 1, 2, 4 | In the live-race fit test: every bubble's box is inside its `<article>` and left of the screenshot | `pnpm --filter @wayford/web exec vitest run scripts/self-check.browser.test.ts` green, and `pnpm --filter @wayford/web check:self` with 0 shortfalls | — |
| 3 | The design docs say it. `docs/DESIGN.md`: narration's ink, the persona fill's new use (a narration bubble's outline and tail), the RaceLane row. `docs/design/components.css`: `.wf-narration` drawn as the bubble, under the avatar, so `components.html` and `screens/race.html` show it | `docs/DESIGN.md`, `docs/design/components.css` | 1, 2 | — (docs) | `screens/race.html` opened in Chromium at 1280 shows a bubble under each avatar | 2 |
| 4 | Verify | — | all | — | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @wayford/web check:self`; screenshots of the live race at 1280 × 720 in both themes, looked at | — |

The issue's acceptance:

1. On a race with five lanes, each persona's current narration is the first thing the eye finds in its lane.
2. It is clear which persona each narration belongs to.
3. The "after the fact" label is still visible.
4. Lanes keep their height; a long narration is clamped or scrolls inside the bubble, not pushing the lane.

## Decision log

| Question | Taken | Why |
|---|---|---|
| How the bubble costs no height | Its ground and outline are an `aria-hidden` layer beside the paragraph. It reaches 2 px up into the 8 px row gap and stops at the text's last line, whose leading pads it. The tail sits inside the row gap. The paragraph keeps today's two 24 px lines | s3-12 measured the lane at 146 px and three of them at the edge of 720 while the race is live: 24 px more per lane overflowed by 30 px. Real padding would add 8 px or more per lane. The clamp needs `overflow: hidden`, so the layer sits beside the paragraph, not inside it. A ground reaching 4 px below the text, as first built, ran into the detail line (build) |
| Where the bubble sits | First in row 2, right under the avatar. A detail line, when there is one, goes under it | The tail reaches the avatar only with nothing between them, and the issue wants the narration found first. The detail line keeps its fault colour. This flips s3-12's order, which put the detail line first |
| Its look | Ground `paper` on the lane's `surface`, a 2 px (`stroke-rule`) outline in the persona's fill `--p`, `radius-sm`, and a tail at the avatar's centre. Text in `ink`, not `ink-2`; the label stays in `mono-label` `ink-3`, first inside the bubble | The outline and tail tie the words to the persona whose avatar they point at (acceptance 2). DESIGN keeps a persona colour from ever sitting behind body text, so the colour is on the outline only, never the ground. `ink` reads further on a projector. `ink`, `ink-3` and every persona fill hold their contrast on `paper` in both themes |
| Font size | `body`, 16 px, as today | A larger style has a taller line, and row 2 has no room for it. The bubble, the outline and the ink carry the weight instead |
| The label "smaller", as the issue asks | It stays `mono-label`, 16 px, in `ink-3` (review) | DESIGN's floor is 16 px, with no caption size. The meta ink and the mono set it apart from the words |
| A transition when the narration changes | None | DESIGN's Motion: "nothing else animates on its own". The issue says to follow DESIGN. The new words replace the old ones in a bordered bubble, which the eye already watches. An exception would be DESIGN's call, as a team decision |
| No narration (a Jev run, or before the first narration) | No bubble and no label; row 2 keeps its 48 px | The issue: "no bubble, rather than an empty one". A label with nothing after it labels nothing, and DESIGN's "Narration is labelled" still holds wherever a narration shows |
| Width | The bubble fits its text, up to the width of columns 1 and 2 | A short line reads as speech, not as a banner across the lane |
| A long narration | Clamped in CSS as today: two lines alone, one under a detail line. The markup keeps every word | The issue allows "clamped or scrolls"; a scroll box in a lane would be a keyboard stop per lane for no gain |
| The drawing | `.wf-narration` in `components.css` becomes the bubble, from the avatar's column across the lane. Its outline is a CSS `outline` and it has no vertical padding, so it takes no height | The issue: "if the bubble changes the lane's layout, update the drawing too". One class change updates `components.html` and `screens/race.html` together. A border and padding, as first drawn, put `race.html` at 754 px; it measures 720 again, with its lanes at 167 px (review) |
| Run detail's narration | Unchanged | The issue names the race. Run detail shows one step's narration in its own section |
