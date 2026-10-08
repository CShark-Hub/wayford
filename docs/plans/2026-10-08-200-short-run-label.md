# #200 — Run id is too long to read; show a short run label: plan

Task: issue #200 (no task file: an issue fix, "Fix #200" on `main`) · Spec: none (S; the issue is the spec)
Status: approved 2026-10-08 (auto)

| # | Step | Files | Serves | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | `runLabel(id)`: a minted run id shown as `run …` and its last six characters; any other id, such as a fixture's `run_vera-hard-1`, as it is | `packages/web/src/runs/run-label.ts`, `run-label.test.ts` | 1, 2 | `run-label.test.ts`: a ULID run id reads `run …3fr6hk`; two runs minted in one race read apart; a fixture id reads whole | `pnpm --filter @wayford/web exec vitest run src/runs/run-label.test.ts` green | — |
| 2 | The label wherever a person reads a run id. The Runs list's Run column shows the label, its link to the whole id. Run detail's header shows the label after persona and seed, with a copy button for the whole id, and its loading and missing headings show the label. The seed cells' accessible names say `Opens run …3fr6hk` | `packages/web/src/screens/runs.tsx`, `screens/run-detail.tsx`, `components/seed-strip.tsx`, `boundary/value-runs.tsx`, their tests | 1, 2, 3 | `runs.test.tsx`: the Run cell reads the label and links to the whole id. `run-detail.test.tsx`: the header reads the label, never the whole id, and has a "Copy the run id" button carrying it; the loading heading reads the label. `seed-strip.test.tsx` and the Boundary test: the cell's name ends `Opens run …<six>` | `pnpm --filter @wayford/web exec vitest run src/screens/runs.test.tsx src/screens/run-detail.test.tsx src/screens/boundary.test.tsx src/components` green | — |
| 3 | The copy works in a browser | `packages/web/src/screens/run-detail.browser.test.ts` (new) | 3 | Run detail on a minted id, with clipboard permission granted: a click on "Copy the run id" leaves the whole id on the clipboard and says "Copied" | `pnpm --filter @wayford/web exec vitest run src/screens/run-detail.browser.test.ts` green | — |
| 4 | Verify | — | all | — | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @wayford/web check:self` (run detail's floors with the new button) | — |

The issue's acceptance:
1. No screen shows the full ~30-character id as its main label.
2. Two runs of the same race are easy to tell apart at a glance.
3. The full id can still be copied from run detail.

## Decision log

| Question | Taken | Why |
|---|---|---|
| Which short form | `run …` and the id's last six characters, for an id `newId("run")` minted (`run_` and 26 lower-case base-32 characters). Any other id is shown whole | The last six are the random part, so two runs minted in the same millisecond still differ: 32⁶, about a billion, against a handful of runs per race. A per-race number would need the race. "Vera · seed 3" is what the persona and seed columns and the evidence chips already say beside it, and two runs on two goals can share it. Fixture ids such as `run_vera-hard-1` are already short and readable |
| The evidence chips and the race lanes | Unchanged | Since #203 and #204 (2026-10-07) the chips read "Vera, seed 3 · outcome" and the lanes link "See the run", so neither shows the id. The issue was filed at `2ec8fbe`, before both |
| Where the whole id stays | The URL, the API, the `title` of run detail's label, the missing-run sentence ("No run <id> is stored"), and run detail's copy button | The issue keeps the full id as the key and wants it on hover and copyable |
| The copy button | An icon button, lucide's `Copy`, named "Copy the run id", beside the label. A click writes the whole id with `navigator.clipboard.writeText`, then says "Copied" in a polite status until the next copy. A failed write says so | DESIGN: an icon-only control gets an `aria-label`. The button is `size="icon"`, 40 px, over the 32 px floor. A status line tells a screen-reader user what happened. No timer, so nothing animates or changes on its own |
| Accessible names that read the id (`Opens run_…` on seed cells) | Use the label | A screen reader reading 30 characters is the same noise the issue describes |
| Race ids (`race_…`), shown only in the Race screen's no-race state (`NoRace`, `arena.tsx`) | Out of scope | The issue names runs. `runLabel` reads only `run_`, so a follow-up would widen its pattern |
| The debug Events screen (`/events`) | Unchanged | It is off the nav and is a log for developers, where the whole id is the point |
| A `title` on the Runs list's label (review) | None | A link's `title` becomes its accessible description, so a screen reader would read the whole id on every row: the noise the label removes. Run detail keeps the hover and the copy |
| No clipboard, as on plain http by another host (review) | "Could not copy", nothing thrown | The write runs inside a promise, so a missing `navigator.clipboard` fails as a refused write does. Both are tested in the browser |
| DESIGN.md and PLAN.md F7 AC4 (review) | One clause each naming the label | DESIGN says ids are set "exactly as the code spells them", and F7 AC4 names the header's run id; both now say how a minted id reads |
| Where the copy button sits (PR review) | Right after the label, the `<h1>` without `flex-1`, the status keeping `min-w-28` | At the row's far end the button sat about 400 px from the label, and a status that took its width from the row moved it 52 or 110 px, so a retry landed on the text. Now nothing moves when the status appears |
| A second press (PR review) | Each press replaces the status text, keyed on a press count | Setting the same outcome again left the live region unchanged, so a second "Copied" or a failed retry was silent |
| The failure message (PR review) | "Could not copy", unchanged | A sentence naming the address bar would need about three times the status's room in the header row, which wraps the heading at 960 for a failure only plain http on another host meets. The whole id is in the address bar and on hover |
| A selectable fact in place of the button (PR review) | The button stays | The issue recommends a copy button, and a fact would put the whole id back on screen |
