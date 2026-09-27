# s2-06 — Jev Actor backend

Stream: s2
Milestone: week 3
Size: L
Depends on: s2-03, s2-05

## Context

Read first, in this order:

- `docs/adr/0001-jev-actor-backend.md` — the decision, the gate, what the backend may not do
- `docs/PLAN.md` F5, and `docs/RULES.md` stages 6 and 7 and "Calibration"
- `packages/core/src/run.ts` — `RunStep`, the `actionPlanned` event, `runResultFromEvents`
- `packages/agent/src/` after s2-03 and s2-05 — the Actor backend seam, the history renderer, `decide`, the fake
- `docs/CONVENTIONS.md` section "Determinism rules"

## Goal

With the actor backend set to `jev`, the Actor loop from s2-03 picks each action by drawing from Jev's probabilities with the run seed, and every step records what was offered, the probabilities, the confidence and the rolled value.

## Interface

- In: the Actor backend seam from s2-03; `decide` from s2-05; `Observation`, `Action`, `RunStep` and `RunEvent` from `@wayford/core`
- Out: a Jev backend behind the seam in `@wayford/agent`; an optional decision record on `actionPlanned` and `RunStep` in `@wayford/core`, carried by `runResultFromEvents`, with a fixture; `run:one` accepting `--backend jev`
- Files expected to change: `packages/agent/src/**`, `packages/agent/prompts/`, `packages/core/src/run.ts`, `packages/core/src/run.test.ts`, `packages/core/src/fixtures/**`, `docs/adr/0001-jev-actor-backend.md` (the gate table)

## Constraints

- "The persona is a filter, not a prompt" (`AGENTS.md`). Jev receives the goal sentence, the `renderObservationForModel` output, the history from s2-03's history renderer (M1 applies) and one fixed instruction template in `packages/agent/prompts/`. Nothing else.
- Options: one `click` per element ref in the Actor-facing observation, plus `scroll` down, `scroll` up, `back` and `giveUp`. Each description is taken from the Actor-facing observation, so a degraded element is offered under its masked name and a hidden element is never offered. `doubleClick` stays B1's to produce; `type` and `wait` are left out because Jev writes no text.
- More options than Jev's Choice limit of 255 ends the run with `runFailed` naming the count. The list is passed whole: trimming it would be a second, hidden filter.
- The draw: the option is the one the rolled value lands on in the cumulative probabilities, in the order the options were offered. The rolled value comes from a stream of its own, derived from the run seed with `hash` and `rng` from core, so the behaviour dice stream is the same whichever backend runs. Jev's own pick is logged and never used.
- Stage 7 then applies unchanged: B1 may turn the drawn `click` into a `doubleClick`, and B3 and the step cap end the run as in s2-03.
- The decision record holds the options offered, one probability per option, Jev's confidence and the rolled value. It is optional on `actionPlanned` and on both step shapes, `CompleteRunStep` and `IncompleteRunStep`, since a step can be planned and then cut off by a crash or the budget. `runResultFromEvents` copies it from event to step the way it copies `diceRoll`. The LLM backend never sets it.
- A Jev step emits no `narration` event; its `narration` is the empty string the reducer already gives it.
- One backend per run: `modelIds.actor` names the Jev model, and the Jev backend never calls `complete`.
- The confidence is stored and nothing reads it during a run.

## Acceptance

- [ ] `pnpm --filter @wayford/core test` passes; a test folds events carrying a decision record into a `RunResult` whose step carries it, and a record with fewer probabilities than options fails to parse
- [ ] `pnpm --filter @wayford/agent test` passes with the fake `decide` and no network
- [ ] With a fake that puts probability 1 on Your account, then on Delivery address, Ada ends `success` on the easy goal after two actions
- [ ] Same persona, run seed and fake probabilities twice: every step's action and rolled value are equal. With the fake splitting 0.5 and 0.5 between two options, seeds 1 to 20 draw each of them at least once
- [ ] A test shows the B1 rolls of a Jev run equal those of an LLM run with the same seed and the same sequence of clicks
- [ ] On the observation fixture, the request the fake receives offers a degraded element under its masked name and contains no hidden element's name
- [ ] A test builds the first request for all four persona fixtures on the same observation and shows the four are identical and contain no persona name and none of "impaired", "disabled", "blind", "vision", "contrast"
- [ ] An observation with more than 255 options ends the run with `runFailed` and the count in the error
- [ ] With a real key, `pnpm --filter @wayford/agent run:one -- --persona prof_ada --task task_next-parcel --seed 1 --backend jev` ends `success` (output and cost in the PR)
- [ ] With a real key, the gate table in `docs/adr/0001-jev-actor-backend.md` is filled for both backends on the same seeds, with the pass or fail outcome; on a fail, the ADR status says so
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Any LLM call inside a Jev run, and any use of the confidence beyond storing it.
- Narration for Jev steps, after the fact or otherwise.
- Showing the decision record or the confidence in the UI. Week 4, if the gate passes.
- Running the sweep or `seed:demo` on Jev. Week 4.
- Tasks that need typing.

## Notes for the reviewer

- Diff the requests `decide` receives for two personas on the same page: anything that differs besides the observation and the history is a bug.
- Check that the draw has its own stream, that the rolled value is stored, and that nothing trims the option list.
