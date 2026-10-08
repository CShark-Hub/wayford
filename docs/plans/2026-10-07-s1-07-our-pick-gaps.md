# s1-07 — Our pick through the API, and the gaps it hits: plan

Task: `tasks/s1-07-our-pick-gaps.md` · Spec: `docs/specs/2026-10-07-s1-07-our-pick-gaps.md`
Status: approved 2026-10-07

The fix steps are not known yet. This plan runs up to the triage (step 6). Step 7 is the amendment that adds one step per blocking gap, approved by the user before any fix is built (spec, "Fixes").

| # | Step | Files | Serves box | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | The driver and the watch | scratchpad only: `drive.mjs` (plain Node, `fetch`, no workspace imports) | 1, 3 | Run under `pnpm dev` with `--trigger click --dry` against io's fixture replay, `GET /runs/fixture/events`. The fixture run has clicks and no `type`, so the dry watch must report its first `click` and kill nothing. | The dry run names the fixture's first click with its step index. With no flags, the trigger is `type` and the kill is real. | — |
| 2 | Before the first pass | none | 1 | — | The user has placed `.env` in the worktree root (asked once, never read). The job offer answers 200 and still links "Apply Now!" to the form (spec, section 2, step 0). `env -u PORT pnpm dev` is up, `GET http://localhost:3000/tasks` answers 200, and io's PID is noted for the watch. | — |
| 3 | First pass | scratchpad: `pass-1/` (task answers, run ids, reports as JSON) | 1 | — | Three `POST /tasks` answer 201, each goal still naming what its story asks for (spec, section 2, step 1). Each goal's nine runs are stored, posted one goal at a time under the watch. Three `POST /reports/<taskId>` with `backend: "llm"` answer 201 and are saved as JSON. If the watch fires, stop and ask the user. | — |
| 4 | Record the first pass | `docs/DEMO.md` | 1 | — | "Finals: any target", "Our own pick": the site, the start URL, the three goals (story, extracted goal, success glob, what success proves), per goal a persona-by-seed table with outcome, steps and time plus the nine run ids, and each report's headline. Committed. | — |
| 5 | Find the gaps | scratchpad notes; a throwaway probe `.ts` in `packages/filter`, deleted after use | 1 | — | Every run read: its outcome, its error code, its wasted steps, and per step its observation against its screenshot. Every new-tab sign checked (spec, section 5). Each suspected gap confirmed or dropped by the probe on the page where it showed up. The result is a list of gaps, each with the run, step and page it showed up on. | — |
| 6 | Triage | `docs/DEMO.md` | 1 | — | Each gap matched to #124 to #127, #146 or #149, or a new `[Gap]` issue drafted and shown to the user before filing. Each verdict is blocking or not, by the spec's four conditions: a blocking gap names the screens it would show wrong, any other gets one line of why. The gaps table is in DEMO.md and committed. A new tab, if any, is offered as `s2-14`. | — |
| 7 | Plan amendment | this file | 2, 3 | — | One step per blocking gap: its files, the fixture test written first and failing before the fix, its done-check, and any `docs/RULES.md` change. A gap over one M is split out instead, and the user decides. The user approves the amendment. With no blocking gap, the amendment says so, and step 8 is skipped (spec, section 6). | — |
| 8 | Second pass | scratchpad: `pass-2/`; `docs/DEMO.md` | 3 | — | Step 2's checks again. The same stored tasks, personas, seeds and backend, under the watch. Three reports rebuilt. For each blocking gap, the re-run's evidence on its page, or the probe on that page after the fix when no run went there, recorded beside the gap in DEMO.md. Committed. | — |
| 9 | Verify | `tasks/s1-07-our-pick-gaps.md` | all | — | `pnpm lint`, `pnpm typecheck` and `pnpm test` at the root, and `pnpm --filter @wayford/filter test`, with the real output read. Each box ticked with its evidence. An Outcome section: three goals, G3 stops at the form, no write guard, where each fix's fixture lives, and whether the second pass ran. Committed. | — |

Every step runs in order. Steps 3 and 8 hold io and the live site for about 15 to 20 minutes each, and nothing else needs to run beside them.

## Amendment, after the triage (step 7)

Status: approved 2026-10-07

The first pass found two blocking gaps (`docs/DEMO.md`, "Gaps the first pass hit"). The user chose, on 2026-10-07:

- for #190, longer bounds off the target app only, in agent;
- for #124's control half, the fix in this PR.

| # | Step | Files | Serves box | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 7a | #190: lenient `settle` bounds | `packages/agent/src/settle.ts`, `actor-loop.ts` (its only caller; Scout runs through the same loop), `settle.browser.test.ts`, `actor-loop.browser.test.ts` | 2, 3 | Three tests, which fail before the fix: (1) lenient `settle` waits out a 5 s finite animation, where strict still fails `page_not_settled` at 3 s; (2) a lenient run whose page blocks its main thread for 10 s after a click reaches its outcome, where a run handed `params` still fails "did not answer"; (3) the strict numbers are unchanged. | `pnpm --filter @wayford/agent test` passes, and so do the calibration and seed tests, unedited. | 7b |
| 7b | #124's control half: a control drawn in parts is perceived part by part | core: `measurement.ts`, `observation.ts`, the `measurement.json` and `observation.json` fixtures, their tests. filter: `measure-page.ts`, `collect.ts`, `perceive.ts`, `collect-rules.browser.test.ts`, `perceive.test.ts`. `docs/RULES.md` | 2, 3 | A fixture page with the cshark.com pattern cut down: `<a href><span>`20 px title`</span><p>`14 px description`</p></a>`. Under a 16 px font cut the link is shown, reads only its title, and its second part carries the P3 decision. With both parts below the cut it is invisible. These fail before the fix, since today the link is cut whole. | `pnpm --filter @wayford/core test` and `pnpm --filter @wayford/filter test` pass. `collect.browser.test.ts`, `routes.browser.test.ts` and `target-app-routes.browser.test.ts` pass unedited: the target app has no control drawn in parts. | 7a |

Then step 8 and step 9 as above.

### 7a: how the bounds change

- Off the target app, where `settle` is already lenient:
  - the in-page deadline for load, fonts and finite animations becomes 10 s;
  - the bound on one `retryOnNavigation` attempt becomes 30 s.
- On the target app both stay 3 s and 8 s, so the strict path is unchanged line for line.
- `actor-loop.ts` passes both on its two `retryOnNavigation` calls, from `loop.lenient`.
- A page whose main thread never yields still ends the run `page_not_settled`, later.
- The cost goes in the record: a slow step still spends the persona's wall-clock budget (B3).

### 7b: the design

A control that takes its name from its content and draws it in more than one run (more than one element draws its text) is measured and perceived part by part. A person who can read the title of a card link can click it, even when its description is too small for them. A part they cannot read does not reach the model.

- **Measurement**, a filter contract change:
  - `MeasuredElement` gets `parts`, present only on such a control: `{ text, metrics: { contrast?, fontPx? } }[]`, one entry per element that draws a run of the name, in document order.
  - `metrics.contrast` and `metrics.fontPx` stay the worst over the parts, as today, so every reader that does not know `parts` decides as before.
  - A refine keeps them equal to the worst of the parts.
  - `measure-page.ts` reports, per drawer, the text it draws itself.
  - `collect.ts` turns each run into one part's metrics, as it turns the element's runs today.
- **Perception.** For a control with parts:
  - P1 and P3 are judged on each part, with the element's one roll (RULES, "The roll"). A part's state is the worst of its own two outcomes.
  - The element's P1 and P3 decisions are those of its best part: least severe state, then the first in document order. So the control is cut only when every part is cut, and degraded when its best part is.
  - P4 is the control's own, as today.
  - Each part's state and decisions go in the evidence: `ObservedElement.parts`.
  - When some parts are cut and the control is shown, `ObservedElement.shownName` holds the text of the parts left, joined by spaces.
- **What reads the name:**
  - `toActorObservation` reads `shownName` where it read `name`, so the Lens and the step replay show it too, since web reads names through it.
  - The mask and K2 read `shownName` when there is one, so neither puts a cut part's text back.
  - K1 and K4 rename to the bare role and leak nothing.
- **Monotone:** for a fixed roll each part's state never improves as a threshold rises. So their best never does either, and the sweep's bound holds.
- **Salience (A1)** is unchanged: it still reads the worst metrics. That a card link's 14 px description lowers its rank under Kai's cap is #149's kind of question, and is noted in `docs/DEMO.md` as not fixed here.
- **`docs/RULES.md`:**
  - "What is measured" loses "a card link is cut whole when a subtitle in it fails P1 or P3", and says the above.
  - "Several rules" and "The mask" say where `shownName` comes in.
  - The calibration table does not move.
- **Outside the spec's Files list.** core's `measurement.ts`, `observation.ts` and fixtures change, because the user chose to fix the gap here and it cannot be fixed without them (the spec's section 5 allowed for a contract change, "the filter contract"). One reviewer, as from week 4.

## Notes

- **Step 1.** The watch follows `GET /runs/<id>/events` for every run id of the set in flight. It parses the SSE frames itself, since Node's `EventSource` is still behind a flag. It fires on the first `actionPlanned` whose `performedAction.type` equals the trigger. Fired for real, it runs `taskkill /PID <io pid> /T /F` and prints the run, step, URL and typed text. The driver posts one goal's set, waits until every run id from the `202` answers `GET /runs/<id>` with 200, then posts the next goal's set.
- **Step 2.** In manual mode, starting the dev stack and every call to the live site happen only after the user's go for step 3. The stack is stopped by PID after each pass.
- **Step 5.** The probe opens the page in the persona's device, as a run does: `deviceContextOptions` from agent, which is "Desktop Chrome", 1280 × 720, for all three personas. It waits for load, and prints three things side by side: `collect`'s elements, `perceive`'s Actor text for the persona and seed, and `page.locator("body").ariaSnapshot()`. Run with `node_modules\.bin\tsx.CMD` from PowerShell, since `pnpm exec tsx -e` fails on Windows.

## Decision log

In the spec.
