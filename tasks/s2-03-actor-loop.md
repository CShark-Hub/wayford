# s2-03 — Actor loop: observe, act, record

Stream: s2
Milestone: week 3
Size: M (split on 2026-10-01: memory, the behaviour dice, the budget and the provider seed moved to `s2-10`, so `s4-03` can start on the bare loop)
Depends on: s1-02, s2-01, s2-02 (issues #19, #31 and #114 are fixed)

## Context

Read first, in this order:

- `AGENTS.md` sections "Persona is a filter, not a prompt", "Separated LLM roles" and "Traps already identified"
- `docs/PLAN.md` F5 and F12, and `docs/RULES.md` stages 6 and 7
- `packages/core/src/run.ts` — `RunEvent`, `runResultFromEvents`, `RunResult`
- `packages/agent/src/` after s2-01 and s2-02 — `complete`, the fake adapter, the run context
- `packages/filter/src/` after s1-02 — `collect` and `perceive`

## Goal

One command runs one persona on one task with one seed against the target app: the loop observes through the filter, asks the model for one action, acts, records evidence, emits every `RunEvent`, and leaves a `RunResult`, a `webm` and a `trace.zip` on disk. `s2-10` then adds memory, the behaviour dice, the budget and the provider seed to the same loop.

## Interface

- In: `Profile`, `Task`, `Seed`, the target-app parameters, and an optional `RunId`: io passes the one it minted for `POST /runs` (s4-03); when it is absent, as from the CLI, `runActor` mints one
- Out: `runActor(...)` from `@wayford/agent`, which emits `RunEvent`s as they happen and returns the `RunResult`; the CLI `pnpm --filter @wayford/agent run:one -- --persona prof_vera --task task_past-order --seed 7`; files under `runs/<run id>/`
- Files expected to change: `packages/agent/src/**`, `packages/agent/package.json`, new `packages/agent/prompts/`; in core only `packages/core/src/fixtures/index.ts` and `packages/core/src/observation.test.ts`, to move the banned-word list (see Acceptance)

## Constraints

- "The Actor must be our own loop" (`AGENTS.md`). Each step: `collect`, `perceive`, `toActorObservation`, `renderObservationForModel`, then the model. The model gets nothing else from the page.
- Each step calls `collect(page, { isMobile })` with the mobile flag of the context s2-02 opened. A page cannot tell it is emulating a phone, so without the flag Milo's runs (`device: mobile`) record `isMobile: false`.
- Before each `collect`, the page settles: its fonts are loaded (`document.fonts.ready`) and no CSS animation or transition is running (`document.getAnimations()`). In the s1-02 review a one-second colour animation measured one key at contrast 1.16, 2.46 and 21 at three delays, so one run seed gave three perception decisions.
- The prompt template is identical for every persona: the goal sentence, the observation, the history, the actions it may take. No persona name, trait, threshold or impairment reaches it (F5 AC6).
- One function renders the history, so every backend gets the same one, and `s2-10` truncates it there (M1). The history names every element as the Actor read it, its masked or renamed name, never the name in the evidence: a history that repeats the real name of an element the filter masked hands the persona what the filter took away.
- The model sits behind one seam, the Actor backend: goal sentence, Actor-facing observation text and rendered history in; an `Action` and optional narration out. The LLM backend is the only one here; s2-06 adds Jev behind the same seam (`docs/adr/0001-jev-actor-backend.md`).
- The model answers with `ActorResponse`. A ref the observation does not contain is a typed failure: one retry carrying the error, then the step is wasted. Never a Playwright crash. A wasted step emits `stepWasted` in place of `actionPlanned` and `actionPerformed`, with both answers exactly as parsed and the step's cost. A refused answer rolls no dice and gets no `narration` event; its narration stays on the answer. The next step observes again under `stepIndex + 1` (`packages/core/src/run.ts`, `WastedRunStep`).
- Acting: the cursor moves to the element's box first and the action lands at that point, so what the persona clicked is what the video shows.
- Ends: a `giveUp` ends `gave_up`, and a step cap from config ends `budget_exceeded` (`docs/PLAN.md` F5 AC5). The cap is checked at the end of every step, a wasted one included; on a step whose action landed it comes after the success check, so the last allowed step can still end `success` and the same seed and answers reproduce a capped run. No dice are rolled here, so a step's rolls are empty; B1 and B3 are `s2-10`.
- Success is checked against the task's `SuccessCondition` after every action, deterministically, never by asking the model.
- Every event passes the `RunEvent` schema, and the `RunResult` written is `runResultFromEvents` of the events emitted. A crash ends with `runFailed` and the partial step stored.
- The run seed drives perception (`docs/PLAN.md` A20). The provider seed and `actorSampling` are `s2-10`.

## Acceptance

- [ ] `pnpm --filter @wayford/agent test` passes with a scripted fake adapter and no network
- [ ] With a fake that walks Home, Your account, Delivery address, Ada ends `success` on the easy goal after two actions
- [ ] Vera, one task, one run seed and the same fake Actor answers, twice: every step's `actorObservationText` is equal (F5 AC1; `s2-10` adds the rolls)
- [ ] Vera on `task_past-order` at the target app's defaults, one run seed and the same fake Actor answers (`click` the Deliveries nav link, then `giveUp` on `/deliveries`), with only `profile.seed` changed: every step's `actorObservationText` and every `rolled` in its `fullObservation` are equal (A20)
- [ ] A click on a degraded element appears in the next step's history under its masked name, and the real name appears nowhere in that prompt
- [ ] With a hard contrast cut of 3.0, no step's `actorObservationText` contains "Order archive"
- [ ] A fake that answers `giveUp` ends `gave_up`; one that throws ends `runFailed` with the partial step stored
- [ ] Step cap (F5 AC5): a fake that answers only refs the observation contains and never reaches the goal or gives up ends `budget_exceeded` after exactly the cap's number of steps, every step complete, and two runs on the same seed and answers end the same way; a fake that reaches the goal on exactly the cap-th step ends `success`; a fake that only answers refs the observation lacks ends `budget_exceeded` after exactly the cap's number of steps, every step wasted
- [ ] A fake answering a ref the observation lacks gets one retry; when the retry misses too, the step is stored as wasted with both answers, the run continues, and the `RunResult` parses
- [ ] A test renders the first prompt for every persona fixture on the same observation and shows they are identical, and that the template's own words (the prompt with the goal sentence and every page string blanked) contain none of the banned words (F5 AC6). The words are `BANNED` in `packages/core/src/observation.test.ts`, a test file no other package can import: move the list to `@wayford/core/fixtures`, where the persona fixtures come from, export it, and import it in both tests, so there is one list and no copy
- [ ] `runs/<run id>/result.json` validates as `RunResult` and deep-equals `runResultFromEvents` of the emitted events; the `webm` and the `trace.zip` exist
- [ ] With a real key, `run:one` for Ada on the easy goal ends `success` (output and cost in the PR)
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- M1 memory, B1 double click, B3 budget and the provider seed: `s2-10`.
- Scout (s2-04), storing runs in the database and HTTP (s4-03), the Analyst (week 4).
- Knowledge and attention stages: s1-03 adds them inside `perceive`, and the loop only calls `perceive`.
- B2 `scrollWhenStuck` and B4 misclick. Live video (cut in `m0-08`).
- The Jev backend and the decision record on the step. That is s2-06.

## Notes for the reviewer

- Read the prompt template first. Any line that differs between personas is a bug.
- Watch the `webm` of the real run: the cursor before every click and no other overlay of ours.
- How the history shows a wasted step is this task's call: one line, the same for every persona, like the rest of the template.
- An action can land off http(s): in Chromium a `back` from the first page lands on `about:blank`, and a link to a dead host on `chrome-error://chromewebdata/`. `actionPerformed.urlAfter` takes either (`packages/core/src/run.ts`), but `FullObservation.url` is an `HttpUrl`, so the next step cannot observe that page. Check what the loop does then. If the observation just fails its schema, a persona who went back past the start page ends the run as `error`, the outcome for a crash.
