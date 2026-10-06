# s3-10 — Jev decisions in run detail: plan

Task: `tasks/s3-10-jev-decisions.md` · Spec: none (S task)
Status: approved 2026-10-06 (auto)

| # | Step | Files | Serves box | Test first | Done when | Parallel with |
|---|---|---|---|---|---|---|
| 1 | The decision panel: one bar per option in offer order, the drawn one marked, the rolled value on the cumulative scale, the confidence labelled as the model's | `packages/web/src/runs/decision-panel.tsx`, `runs/decision-panel.test.tsx` | 1 | `decision-panel.test.tsx` on `decisionRecordFixture`: ten options in offer order, `e3` "Deliveries" marked drawn, rolled 0.4 inside its cumulative range, confidence 0.71 with its label | `pnpm --filter @wayford/web exec vitest run src/runs/decision-panel.test.tsx` green | — |
| 2 | The panel in the step replay, only on a step with `decision`; the run header names the backend beside the model | `packages/web/src/runs/step-replay.tsx`, `runs/step-replay.test.tsx`, `screens/run-detail.tsx`, `screens/run-detail.test.tsx` | 1 | `step-replay.test.tsx`: a Jev step draws the Decision section, every fixture (LLM) step draws none; `run-detail.test.tsx`: the header reads `jev` on a run whose steps carry a decision, `llm` on the fixture run | `pnpm --filter @wayford/web test` green | — |
| 3 | Verify: `pnpm lint`, `pnpm typecheck`, `pnpm test`; the panel on a real Jev run in the browser, with a screenshot; tick the boxes | `tasks/s3-10-jev-decisions.md` | all | — | all three commands exit 0; each box has its evidence | — |

Step 2 waits on step 1, since the replay imports the panel. No step changes `pnpm-lock.yaml`.

The real Jev run for box 2: the stored runs of the real-key sweeps on Jev (`s4-05`, `typesafe/jev-1.13`) are real Jev runs, so the panel can be shown on one of them without billing a new run. `run:one --backend jev` is the fallback, and needs the user's yes to bill and to link `.env`.

## Decision log

| Question | Taken | Why |
|---|---|---|
| Where the panel goes | Its own section, "Decision", between the Actor's view and evidence row and the Action row, drawn only when the step carries `decision` | The draw chose the proposed action, so it reads just before the Action section. An LLM step draws nothing new, as the task asks |
| What a bar's length shows | The option's share of the draw, `p / total`, the scale `drawOption` uses. The number beside it is `p` as stored | Jev's probabilities are unnormalised (the fixture's sum to 0.99), so a bar scaled to the total matches the cumulative scale the roll lands on, and the printed number stays the record's |
| How the rolled value is marked "on the cumulative scale" | Each option lists its interval on 0–1 (`[from, to)` of the running total over the total). The rolled value is printed once, above the table, with the option it lands on, and the drawn row is marked "drawn: the roll lands here" (build: a stored roll can run to 17 digits, which crowded the row) | It shows the draw without the end-to-end strip, which is `docs/DESIGN.md`'s JevDraw and waits on `s3-13`; until then `s3-12` restyles the panel (task Constraints) |
| Which option is drawn | Core's `drawOption(probabilities, rolled)`, never worked out again in web | One rule for the draw, the one the run used; the schema already checks it matches `proposedAction` |
| The confidence's label | "Confidence 0.71, the model's: how sure Jev was, lower on a more ambiguous page, not how the persona felt" (build: reworded in review, since "how ambiguous" read a high confidence as high ambiguity) | ADR 0001, decision 6: model uncertainty is not a person's confusion |
| How web knows the backend for the header | `jev` when any step carries a `decision`, `llm` otherwise, beside the Actor model id | Web has no `LLM_JEV_MODEL`, so it cannot match the model id first, as io's `backendOf` does. Any Jev run that stopped before its first planned action reads `llm`, a wider gap than io's (only such a run on an earlier Jev version); the model id beside it still names Jev |
| A Jev run for the web tests (build) | `fixtureJevRun` in `runs/fixture-runs.ts`: the fixture run with `decisionRecordFixture` on step 0, whose proposed click on `e3` is the option it draws, Jev's model id and no `actorSampling`. Kept out of `fixtureRuns` | Core has no Jev run fixture, and the record replays to step 0's action, so the schema accepts it. Outside `fixtureRuns`, the runs list and stats tests stay as they are. The file is test data, outside the task's file list |
| Where the panel's `Details` and table classes come from (build) | A leaf module, `runs/details.tsx`, holding `Details`, `Detail` and the note and table classes, which `step-replay.tsx`, the panel and `run-detail.tsx` all import | The panel had copied them from `step-replay.tsx` and already drifted (its `<dd>` lost `min-w-0 break-words`). Importing them from `step-replay.tsx`, which imports the panel, would be a cycle (simplify pass) |
| Bars as elements | A list item per option with a decorative bar (`aria-hidden`) and the number as text | The numbers carry the meaning for every reader; a bar is never the only place a value is |
