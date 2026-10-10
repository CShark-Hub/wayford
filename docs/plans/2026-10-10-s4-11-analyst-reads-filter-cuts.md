# s4-11 — The Analyst reads what the filter cut: plan

Task: `tasks/s4-11-analyst-reads-filter-cuts.md` · Spec: none (S; the task file is the spec)
Status: approved 2026-10-10 (the user asked for the build in the same session)

| # | Step | Files | Serves | Test first | Done when |
|---|---|---|---|---|---|
| 1 | Export `clauseOf`, unchanged | `analyst-closures.ts` | rule 4 | none: a visibility change, covered by step 2's tests | `pnpm typecheck` |
| 2 | Cut lines in the case: used elements from the runs that got through and from Scout's path, the cut test, the grouped lines, the route-table gate | `analyst-digest.ts`, `analyst-digest.test.ts` | box 1 | the seven cases of box 1, red before the code | `pnpm --filter @wayford/io test analyst-digest` |
| 3 | `analyseTask` hands Scout's shortest path to the case | `analyst.ts` | rule 1 | `analyst.test.ts` already builds reports with ground truth; it stays green | `pnpm --filter @wayford/io test analyst` |
| 4 | The prompt's four edits | `analyst-prompt.md` | rule 5 | the prompt tests, unchanged | `pnpm --filter @wayford/io test analyst-digest` |
| 5 | The spec's decision-log row | `docs/specs/2026-10-05-s4-04-analyst.md` | Files expected to change | — | read |
| 6 | Verify: lint, typecheck, test at the root; the real-key run on a copy of the rehearsal store | — | boxes 2 and 3 | — | output read |

Steps run in order: 2 needs 1, 3 needs 2's signature.

## Decision log

| Question | Decision | Why |
|---|---|---|
| A run whose persona the case has no `PersonaResult` for | gets cut lines | The gate asks "did the route table already say it?". Only a persona whose `routeOpenSeeds` is a number has a route table. In a real report every persona has a result. |
| Two elements with one key, cut with different values | one line per distinct clause | The clause carries the value, so different values are different facts. |
| How steps read | `step 3`, `steps 0, 4, 6, 8`, `steps 0 to 9` for a consecutive run of three or more | Short for the common "every step" case. Every listed index is a step of the run. |
| Which page a used element belongs to | origin and path of `urlBefore` (Scout: `PathStep.url`); the line shows the path, as the step lines do | A page on another site may carry a query string that changes between runs, such as a tracking parameter. On the target app `urlBefore` carries none. |
| An `Action` with a ref | `click`, `doubleClick` and `type` | Every action that names an element is a use of it. |
| (review) The demo's easy goal | gets cut lines: `task_next-parcel` has no route table, so a real-key report on it now reads Kai's A1 cuts of "Go to deliveries" on `/` and "Delivery address" on `/account` | Rule 2 as written. `seed:demo --fake` is unaffected: its fake Analyst reads the run headers only. The PR says so. |
