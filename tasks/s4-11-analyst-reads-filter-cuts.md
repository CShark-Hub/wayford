# s4-11 — The Analyst reads what the filter cut, on a goal with no route table

Stream: s4
Milestone: week 4, any target (finals)
Size: S
Depends on: s4-04, s4-10 (both done)

## Context

Read first, in this order:

- `AGENTS.md` — "Persona is a filter, not a prompt", "Separated LLM roles", "Every verdict clickable through to evidence", "Claim less than you'd like to"
- `docs/adr/0003-any-target.md` — D3: off the route table, a report has no route-open number and no closure findings
- `docs/PLAN.md` F8, AC1, AC2 and AC5
- `docs/specs/2026-10-05-s4-04-analyst.md` — "io: the case the Analyst reads", and the decision log rows "Rules a hypothesis names" and "(build) Rule ids in the case"
- `packages/io/src/analyst-digest.ts` — the case; it reads every step's `fullObservation` already, for the masked name
- `packages/io/src/analyst-closures.ts` — `showsCut` and `clauseOf`, the rule and wording to reuse
- `packages/io/src/analyst-prompt.md` — what the model is told
- `docs/STACK.md` and `docs/CONVENTIONS.md`

**What went wrong.** Seen on 2026-10-09, on `main` at `9cfa1e2`: the `s4-08` rehearsal's G1 on `https://www.cshark.com/`, "Find the names of the company's board members.", with Ada, Kai and Vera on seeds 1 to 3 on the LLM. Ada and Kai got through 3/3, Vera 0/3. Scout reached the goal in 2 steps: `Reject All`, then the header's `About` (`banner//link:About`).

- The stored runs are clear. At every step where Vera stood at the top of `/` (seed 1: steps 0, 4, 6, 8), the link `About` with key `banner//link:About` is `invisible` with one decision: `P4`, `targetPx` 16 against her threshold of 32. `Reject All` is `invisible` at all ten steps of each of her runs, by `P3`: font size 14 against 16.
- The case the Analyst reads holds none of it. Rebuilt from the stored runs with `analystCase`, it gives each of Vera's steps as `step 0 on /: scroll down; narration: "…"`. It has no decision, no rule and no hidden element. Its only findings are three axe-core measurements. The persona lines say `route open: —`.
- The prompt adds three nudges toward a wayfinding reading. It says "Everything that can be counted or checked has already been counted and checked by code", so no listed cut reads as "nothing was cut". It says the model has no persona settings beyond the listed findings. It lets a hypothesis name rules "from the listed findings" only. It also says narration is never the reason an agent acted, so Vera's own "the navigation does not expose an About link" was discounted.
- What the model could see: Kai clicked `About` on `/` at step 0, and Vera scrolled on `/` and never clicked it. "Reachable but not sufficiently salient" is the only reading that fits that. The hypothesis it wrote came out with `basis: []`, and it recommended a more prominent About link. The right fix is a larger target.

The evidence link already works. A hypothesis citing Vera's step 0 opens run detail at that step, where "Filtered out" shows `About` with `P4 targetPx 16 < 32: invisible`. Only the case is missing it.

A full dump is no option: Vera's steps on `/` each hold 166 to 181 invisible elements.

## Goal

On a goal with no route table, the case gives each run that did not get through the elements the filter cut from it at the steps where it stood on a page where a run that got through, or Scout, used them, with the rule and the measured value. The Analyst can then cite that decision in a hypothesis, and code copies its provenance.

## Interface

- In: `RunResult`, `PersonaResult` and `GroundTruth` from `@wayford/core`. No schema changes.
- Out: the same `analystCase` string, plus cut lines. The same `Report`.
- `analystCase` takes one more input, Scout's shortest path, as `scoutPath: readonly PathStep[] | undefined`. `analyseTask` passes `groundTruth?.shortest?.path.steps`.
- Files expected to change:
  - `packages/io/src/analyst-digest.ts` and `analyst-digest.test.ts`;
  - `packages/io/src/analyst-closures.ts`, which exports `clauseOf` and changes nothing else;
  - `packages/io/src/analyst.ts`, one argument;
  - `packages/io/src/analyst-prompt.md`;
  - `docs/specs/2026-10-05-s4-04-analyst.md`, one decision-log row.

The rule, all of it computed in code from stored data:

1. **Used elements.** Each is a pair of page and element key. The page is the origin and path of a step's `urlBefore`. Two sources:
   - every step of a chosen run with outcome `success` whose performed action names a ref, with the key looked up by that ref in the step's own `fullObservation`;
   - every step of Scout's shortest path that carries a `key`.

   Keys, not role and name: the key is what perception hashes its decision on, and it tells the header's `About` from a footer one.
2. **Runs that get cut lines.** A run gets them when its outcome is `gave_up` or `budget_exceeded` and its persona's `routeOpenSeeds` is `null`, which means no route table. On the hard goal the closure findings already say this, so the case does not change there. An `error` run says nothing about the persona and gets none.
3. **A cut.** A step of such a run shows a cut when:
   - it stands on a used page;
   - its `fullObservation` holds at least one element with a used key of that page, and every one is `invisible`;
   - a matching element carries a decision whose own state (`decisionState`) is `invisible`, at the `perception` or `attention` stage.

   This is `showsCut`'s test, keyed. V2 is left out, since it says where the agent had scrolled, which the step lines show already. A `degraded` element is no cut.
4. **Lines.** The cuts follow the run's step lines, grouped by page, key and clause, in the order of the first step. Each clause is `clauseOf`'s, the wording the closure findings use:

   ```
     cut from this agent at these steps, of what a run that got through or Scout used:
       link "About" on /, steps 0, 4, 6, 8. P4: target size 16 px, below Vera's threshold of 32 px.
       button "Reject All" on /, steps 0 to 9. P3: font size 14 px, below Vera's threshold of 16 px.
   ```

   Names are quoted with `quote`, like every other name from the page.
5. **Prompt.** Four edits, with no persona label and no trait word (the test checks):
   - "You receive": a run that did not get through, on a goal with no route-open numbers, may end with cut lines. Each line is an element that a run that got through, or the baseline, used on a page this run stood on, and that the filter kept from this run's agent there.
   - "You are not given the personas' settings beyond what the listed findings state" adds "and the cut lines".
   - A hypothesis's `rules` may name ids "from the listed findings or the cut lines".
   - New caution: a cut line is code's record that the agent was not given that element at those steps. Never call such an element reachable, visible, or easy or hard to notice for that run. Whether the cut is why the run did not get through stays a hypothesis: the page may offer another way.

Nothing changes after the call. `basisOf` already takes any rule a cited persona's profile sources. A hypothesis that names `P4` and cites Vera gets `P4` with her `targetPx` provenance, `folk`, so the Report marks it soft.

## Constraints

- "The persona is a filter, not a prompt." The case says what the filter decided and never what a persona is like. No trait word, no label in the prompt.
- "Code decides what is true; the model only words it" (`s4-04`). A cut line is read off stored decisions. The claim that it explains the outcome stays a `hypothesis`. This task writes no `deterministic` finding off the route table: ADR 0003 D3 stands, and without a route table code cannot say the page offered no other way.
- "Every verdict clickable through to evidence." Every step a cut line lists is a step of that run, and run detail's "Filtered out" shows the same decision there.
- "The Actor has no access to Scout's output." Only the Analyst's case reads Scout's path, which `s4-04` allows.
- `analystCase` stays pure.
- No change to `packages/core`, `docs/RULES.md` or the `Report` contract.

## Acceptance

- [ ] `pnpm --filter @wayford/io test` passes and `analyst-digest.test.ts` includes:
  - a failing run's step on `/` where the key a successful run clicked is cut by P4 gives one cut line, with its steps and `clauseOf`'s clause;
  - the same element `visible` or `degraded` gives no line;
  - two elements with the key, one shown, give no line;
  - an element cut by V2 alone gives no line;
  - a persona with a route table (`routeOpenSeeds` not `null`) gives no line, so the hard goal's case is byte for byte as before;
  - a successful run and an `error` run get no lines;
  - Scout's path alone, with no run through, makes an element used;
  - the prompt tests pass unchanged: no label, no trait word.
- [ ] On the real key, `pnpm --filter @wayford/io analyse -- --task task_01m4grew5fed6wk4zg607hr1a8 --backend llm` runs against a copy of the 2026-10-09 rehearsal store, with Scout's `task_01m4grew5fed6wk4zg607hr1a8.json` in `runs/ground-truth/`. That is one Analyst call. The PR shows:
  - Vera's cut lines as the case gives them, built with `analystCase` over the same stored runs;
  - the hypothesis the report writes. Expected, not guaranteed: it names P4, cites Vera's steps, and has the basis P4 `folk`.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root.

## Out of scope

- A `deterministic` finding for a cut off the route table, such as "the link About, which every run that got through clicked, is cut by P4 for Vera". It may be the right next step, but it amends ADR 0003 D3 and the `s4-04` spec, and it needs a claim code can defend without a route table.
- Degraded elements, shown with a masked name. Same function, one more wording branch: take it only if a rehearsal shows the same misreading on a degraded element.
- Every cut element on a step: 166 to 181 per step on `/` of our pick.
- Any check of the hypothesis text in code ("reachable", "salient"). Code checks evidence and basis; wording is the model's.
- The Report screen and #238's per-persona line. They show what the report holds.

## Notes for the reviewer

- Check the gate first. The hard goal's case must not change: diff the case of the `seed:demo` fixture runs before and after.
- `Reject All` shows up too, since Ada and Scout clicked it and P3 cuts it for Vera. Kai got through without it. That is a true line, and the model has to weigh it. Do not filter it out in code.
- `s4-10`'s report on the W3C demo had a hypothesis worded the same way, "The ticket route works, but Vera does not discover it from the homepage". It is likely the same gap. Not checked.
