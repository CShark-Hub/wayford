# s2-06 — Jev Actor backend

Stream: s2
Milestone: week 3
Size: L
Depends on: s2-03, s2-05, s2-11 (the gate is filled with `calibrate`)

## Context

Read first, in this order:

- `docs/adr/0001-jev-actor-backend.md` — the decision, the gate, what the backend may not do
- `docs/PLAN.md` F5, and `docs/RULES.md` stages 6 and 7 and "Calibration"
- `packages/core/src/run.ts` — `RunStep`, the `actionPlanned` event, `runResultFromEvents`
- `packages/agent/src/` after s2-03, s2-10 and s2-05 — the Actor backend seam, the history renderer, `decide`, the fake
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
- Stage 7 then applies unchanged: B1 may turn the drawn `click` into a `doubleClick`, and B3 and the step cap end the run as in s2-03 and s2-10.
- The decision record holds the options offered, one probability per option, Jev's confidence and the rolled value. It is optional on `actionPlanned` and on both step shapes, `CompleteRunStep` and `IncompleteRunStep`, since a step can be planned and then cut off by a crash or the budget. `runResultFromEvents` copies it from event to step the way it copies `diceRoll`. The LLM backend never sets it.
- A Jev step emits no `narration` event; its `narration` is the empty string the reducer already gives it.
- One backend per run: `modelIds.actor` names the Jev model, `runStarted` carries no `actorSampling` (Jev takes no temperature and no seed), and the Jev backend never calls `complete`.
- The confidence is stored and nothing reads it during a run.
- Adding `--backend jev` to `run:one` and `calibrate` is the moment to share their setup. Today `run-one.ts` and `calibrate.ts` each hold a copy, and `smoke-run.ts` repeats part of it:
  - the root `.env` and `runs/` paths;
  - `serve()` with its port hint;
  - the Chromium launch with its install hint;
  - digit-only seed parsing.

  Move them into one `packages/agent/src/cli.ts` before adding the flag, so a fourth CLI does not copy them again (`tasks/s2-11-calibration-run.md`, Outcome).

## Acceptance

- [x] `pnpm --filter @wayford/core test` passes; a test folds events carrying a decision record into a `RunResult` whose step carries it, and a record with fewer probabilities than options fails to parse. 14 files, 359 tests. See `run.test.ts`, `describe("DecisionRecord")`: "the fold copies a decision from actionPlanned onto the step, complete or cut off" and "a record with fewer probabilities than options fails to parse".
- [x] `pnpm --filter @wayford/agent test` passes with the fake `decide` and no network. 24 files, 387 tests. `jev-actor.browser.test.ts` stubs `fetch` to throw once the app is up, and `jev-actor.test.ts` builds no real adapter: Jev's model `fake-jev` has no price.
- [x] With a fake that puts probability 1 on Your account, then on Delivery address, Ada ends `success` on the easy goal after two actions. `jev-actor.browser.test.ts`, "Ada reaches the easy goal in two Jev draws, and each request is rebuilt from the stored evidence".
- [x] Same persona, run seed and fake probabilities twice: every step's `actorObservationText`, action, rolled value and B1 roll are equal (F5 AC1). With the fake splitting 0.5 and 0.5 between two options, seeds 1 to 20 draw each of them at least once.
  - The first half: `jev-actor.browser.test.ts`, "Vera on one seed and one fake twice: the same text, actions, rolled values and B1 rolls (F5 AC1)". The fake spreads the probability evenly over the click options, so the draw picks the path. It lands on options 4, 2 and 9 of 17, and B1 rolls on every click.
  - The second half: `jev-actor.test.ts`, "a 0.5 and 0.5 split draws each option at least once over seeds 1 to 20".
- [x] A test shows the B1 rolls of a Jev run equal those of an LLM run with the same seed and the same sequence of clicks. `jev-actor.browser.test.ts`, "a Jev run and an LLM run of Vera on the same seed and clicks roll the same B1 dice": two B1 rolls each, and the texts and proposed actions are equal too.
- [x] A Jev run's `runStarted` and `RunResult` carry no `actorSampling`. Asserted for every Jev run in `jev-actor.browser.test.ts`'s `walkJev`, Ada's included.
- [x] On the observation fixture, the request the fake receives offers a degraded element under its masked name and contains no hidden element's name. `jev-actor.test.ts`, "on the observation fixture the request offers Ar▒▒ive and names no hidden element". It also checks that the request does not contain "Archive", the element's real name.
- [x] A test builds the first request for every persona fixture on the same observation and shows they are identical and contain no persona name and none of "impaired", "disabled", "blind", "vision", "contrast". `jev-actor.browser.test.ts`, "every persona fixture sends Jev the same first request on the same page (F5 AC6)". It runs on the target app. Names are checked on word boundaries, since "vera" sits inside "several". `jev-actor.test.ts`, "Jev's own words hold no banned word (F5 AC6)", greps the instruction file and the option words for every word of `BANNED_ACTOR_WORDS`. The turn text is the LLM's user message, which `llm-actor.test.ts` greps.
- [x] An observation with more than 255 options ends the run with `runFailed` and the count in the error.
  - `jev-actor.browser.test.ts`, "a page with more than 255 options ends runFailed naming the count": 300 links give 304 options, `jev_too_many_options: the page offers 304 options, …`, with nothing asked and nothing billed.
  - `jev-actor.test.ts`, "255 options are asked, 256 fail before any call", covers the boundary.
- [x] With a real key, `pnpm --filter @wayford/agent run:one -- --persona prof_ada --task task_next-parcel --seed 1 --backend jev` ends `success` (output and cost in the PR). Run on 2026-10-04: `success` in 2 steps and 2.2 s, for 2,516 tokens in and 0.000106 USD. In both steps Jev's own pick matched the draw.
- [x] With a real key, the gate table in `docs/adr/0001-jev-actor-backend.md` is filled for both backends on the same seeds by `calibrate --backend llm|jev` (s2-11), with the pass or fail outcome; on a fail, the ADR status says so. Run on 2026-10-04 on seeds 1 to 10. Outcome: **pass**.

  | Row | LLM | Jev |
  |---|---|---|
  | Ada, easy | 10/10 | 10/10 |
  | Vera hard-cut, hard | 0/10 | 0/10 |

  For Ada's easy goal, Jev's median model time per step was 247 ms against 1,940 ms on Luna, and its median wall time per run 1.6 s against 4.7 s. The full table and the other three rows are in the ADR.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root. 92 files, 1406 tests, 3 skipped.

## Outcome

Built as `docs/specs/2026-10-04-s2-06-jev-actor-backend.md` says. Its decision log has every choice. What a reader of this file should know:

- **The record.**
  - Core gains `DecisionRecord` and `drawOption`, the draw's arithmetic, beside `diceFires`.
  - A refine rejects a stored record whose draw does not land on the proposed action. This is the same rule `DiceRoll.fired` follows.
  - The fixture `decisionRecordFixture` is the observation fixture's page as Jev is offered it. `jev-actor.test.ts` checks the option builder against it.
- **The stream.** `decisionDrawFor(seed)` in `actor-backend.ts` derives it from the run seed under its own key. `runActor` hands it to every backend factory. All three per-run streams come from the seed in the loop and nowhere else: the behaviour stream, the provider seed and the decision stream. A backend never holds the seed.
- **What Jev is sent.**
  - The state is the LLM's own user message, `actor-turn.md` filled. `prompts.ts` now holds the prompt reading both backends share.
  - The question is `prompts/jev-question.md`.
  - The options are `Click [eN], the <role> "<name>"` per shown element, then the four fixed moves. The ref is in the words as well as the key, so two same-named elements are never offered under the same words.
- **One CLI setup.** `packages/agent/src/cli.ts` holds the `.env` and `runs/` paths, the server on 5174, the Chromium launch, the seed, argument and `--backend` reading, the failure line, and each backend's factory and model. The backend names themselves are the setting's, `ActorBackendName` in `llm-settings.ts`.
  - It is used by `run-one`, `calibrate`, `run-scout` (issue #153), `smoke-run`, `smoke-llm` and `smoke-jev`.
  - `run:one` and `calibrate` take `--backend llm|jev`. Without it they read `LLM_ACTOR_BACKEND`.
- **Files beyond the expected list**, all inside `packages/agent/src/**` but one: `history.ts` (`elementName`), `fake-llm.ts` (function entries for `decide`), `prompts.ts`, `cli.ts`, the calibration modules (`backendId`), and `test-support.ts`, the harness both browser suites share, which `actor-loop.browser.test.ts` now imports.
  - The one outside: a comment in `packages/io/src/chromium.ts` pointed at `run-one.ts` for the install hint's wording, which now lives in `cli.ts`.
  - `calibration-run.browser.test.ts` now checks the report's file name for a colon, not its whole path. The whole path starts with `C:` on Windows, where that test failed on `main`.
- **What the gate showed.**
  - Jev passes.
  - Its gain is mostly speed: its model time per step was an eighth of Luna's. The cost gain is smaller. A Jev step sends about 1,270 tokens on the easy row, against Luna's 870, since the options repeat the page, so the easy row cost about half as much, 0.0012 USD against 0.0025 USD.
  - Per ADR 0001, the sweep and `seed:demo` may run on Jev in week 4.
- **Follow-ups.**
  - io builds `llmActor` whatever `LLM_ACTOR_BACKEND` says (`packages/io/src/server.ts`). With `jev` in `.env`, the CLIs run Jev while io runs the LLM. io should refuse or log `jev` until week 4 wires it.

## Out of scope

- Any LLM call inside a Jev run, and any use of the confidence beyond storing it.
- Narration for Jev steps, after the fact or otherwise.
- Showing the decision record or the confidence in the UI. Week 4, if the gate passes.
- Running the sweep or `seed:demo` on Jev. Week 4.
- Tasks that need typing.

## Notes for the reviewer

- Diff the requests `decide` receives for two personas on the same page: anything that differs besides the observation and the history is a bug.
- Check that the draw has its own stream, that the rolled value is stored, and that nothing trims the option list.
