# #241 — Report: compact finding cards: plan

Task: issue #241 (no task file: an issue fix in two PRs. #252, "Part of #241", built the card; its follow-up settles acceptance 2 and what the clamp hides, with the issue author on 2026-10-11) · Spec: none (S; the issue is the spec)
Status: approved 2026-10-09 (auto)

The issue's acceptance:

1. A finding's title is no larger than `lead` and takes at most two lines at rest.
2. On the `seed:demo` report, a findings column is roughly half its current height (screenshots in the PR).
3. Nothing on the card is lost: what is clamped opens on demand.
4. Line styles and evidence links unchanged.

Measured on `main` `dbc2708`, the fixture report (`task_past-order`) at 1280 × 720: the three columns are 1009 px tall, the cards 409, 463, 485 and 579 px.

| # | Step | Files | Serves | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | The card at rest, then open. **At rest:** the persona chips (when the finding names any), the title in semibold `body` clamped to two lines, one quiet line of the other tags (soft, axe, each basis rule and its source), the detail clamped to one line with a "More" button at its end, then the evidence links as today. **Open** (the button reads "Less", `aria-expanded="true"`): the title and the detail whole, and `change →` with the recommendation. The border and the evidence row are as they were | `packages/web/src/components/finding.tsx`, `finding.test.tsx` | 1, 3, 4 | `finding.test.tsx`: the title is `body` + `font-semibold` + `line-clamp-2`, not `title`; the persona chips come before the title and the rule, source, soft and axe tags after it; at rest the detail is `line-clamp-1`, the button reads "More" with `aria-expanded="false"` controlling the card's body, and no `change →` is drawn; the borders per line and the evidence links are as before | `pnpm --filter @wayford/web exec vitest run src/components/finding.test.tsx src/report` green | — |
| 2 | The card in a browser. At 1280 × 720 on the fixture report: every title is at most two lines tall; "More" opens a card to its whole title, detail and `change →`, and "Less" closes it; the tallest findings column is at most 60 % of `main`'s 1009 px; nothing scrolls sideways | `packages/web/src/screens/report.browser.test.ts` | 1, 2, 3 | The test, written before step 1 is built, fails on `main` on the title's height | `pnpm --filter @wayford/web exec vitest run src/screens/report.browser.test.ts` green | — |
| 3 | The design source: `.wf-finding__title` at semibold 16/24, clamped to two lines; the DESIGN component row for Finding says what a card shows at rest and what "More" opens | `docs/design/components.css`, `docs/DESIGN.md` | 1 | — (docs) | `docs/design/screens/report.html` opened at 1280 shows the smaller titles | 1 |
| 4 | Verify | — | all | — | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @wayford/web check:self`; before and after screenshots of the fixture report at 1280 × 720 in both themes, looked at, with the column heights | — |

The task is S and is built in this session, step by step.

## Decision log

| Question | Taken | Why |
|---|---|---|
| The title's size | Semibold `body`, 16/24, clamped to two lines | The issue allows `lead` or semibold `body`. At 16 px the title still leads the card by weight and ink (`text-ink` against the detail's `text-ink-2`), and two lines of it are 48 px against 112 px for four lines of `title` today |
| What stays at rest | Persona chips, title, one tag line, the detail's first line with "More", the evidence | The issue: "a card at rest is tags, title and one line". The evidence stays in view (Principle 4: every number opens its evidence) |
| What "More" opens | The whole title, the whole detail, and `change →` with the recommendation | All that the clamp or the rest state hides opens in one place, so nothing on the card is lost (acceptance 3). One button per card, not one per field |
| How the clamp hides | CSS `line-clamp` on the title and the detail, so their whole text stays in the page for a screen reader; the recommendation is not drawn until opened | A screen reader hears the claim and its detail whole. The recommendation is one press away, as for a sighted reader |
| The button's place and words | At the end of the detail's line, "More" and "Less", with `aria-expanded` and `aria-controls` | It costs no row of its own. The words match the evidence row's "Show N more" in spirit and stay short; the card's `aria-expanded` says what state it is in |
| The tag line | Under the title: soft, axe, each basis rule and its source, as today's `Tag`s, in one wrapping row | The issue: "rule and provenance tags move to one quiet line under the title". The persona chips stay on top |
| A finding with no persona | No chip row at all | A measurement names no persona; an empty row would cost a gap |
| Three columns at `lg` | Kept | Compact cards make the three columns comparable side by side, which is the point; a single column would be longer still |
| The gap inside a card | `space-2` (8 px), down from `space-3` | The rows at rest are short; 12 px between four of them was a third of the saving |
| The `seed:demo` report, which acceptance 2 names | Measured too, beside the fixture (review): `pnpm seed:demo --fake` in the worktree, io serving its reports, the branch's card against `main`'s at 1280 × 720. The columns go from 1983 to 1323 px, 67 %; on the fixture report from 1009 to 583 px, 58 % | On `seed:demo` the six findings cite 13, 3, 3, 5, 6 and 1 runs, so most cards keep up to three evidence links stacked, and the ones citing more add "Show N more", about 128 px in all, which acceptance 4 keeps unchanged. Getting nearer half there would mean fewer links at rest, which acceptance 4 rules out; that is the issue author's call, raised on the PR |
| The design source | `components.css` draws the card at rest (`.wf-finding__rest`) and open (`.wf-finding--open`), with the card's gap at `space-2`; `report.html` draws its four cards at rest and `components.html` one at rest and one open (review) | The issue asks for the design source to match the screen; with only the title's clamp changed, the mockups clamped titles with no way to open them |
| The button's words and its description (review, at `d4ecda0`) | "Show more" and "Show less", in place of "More" and "Less"; `aria-describedby` points at the card's title | `docs/DESIGN.md`, "Copy": buttons start with a verb, and these now match the evidence row's "Show N more" and "Show fewer". With six cards, six buttons of one name could not say which finding each opens; the title, whole in the page even while clamped, now follows the name. The rows above keep the words they were decided with |
| Acceptance 2 on `seed:demo` (the issue author, 2026-10-11) | 67 % accepted; the three evidence links at rest stay | One link at rest measures 57 % (review), still not half, and hides evidence a reader would otherwise see without a click (Principle 4). Acceptance 4 keeps the evidence row unchanged |
| What the clamp hides (the issue author, 2026-10-11) | io's two title templates lead with what must stay in view. Deterministic: `Vera, 3 of 10 seeds: the link "Order archive" on /deliveries is cut by V2, P1, A1`. Measurement: `/deliveries: <axe's help> (<rule>)` | At about 1093 px and below the deterministic titles lost their "k of n seeds", and at 1280 the axe title never showed its page. The count keeps the claim small (`AGENTS.md`, "Claim less than you'd like to"). What falls past the clamp now is the rules, and the card's basis tags name them too. The axe title drops its `axe-core:` prefix: the card's `axe ·` tag, the report text's `axe rule` field and the digest's "axe-core measurement" each name the source |
