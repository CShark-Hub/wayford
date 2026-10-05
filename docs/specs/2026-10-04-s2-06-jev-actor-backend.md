# s2-06 — Jev Actor backend: spec

Task: `tasks/s2-06-jev-actor-backend.md` · Branch: `feature/s2-06-jev-actor-backend` · Date: 2026-10-04
Status: approved 2026-10-04 (auto)

## Goal

With the actor backend set to `jev`, the s2-03 loop picks each action by drawing from Jev's probabilities with a stream of the run seed. Every step records the options offered, one probability per option, Jev's confidence and the rolled value.

## Constraints that bind

- "The persona is a filter, not a prompt" (`AGENTS.md`). Jev gets the goal, `renderObservationForModel`'s text, the M1 history and one fixed instruction template, and nothing else. The options come from the Actor-facing observation: a degraded element is offered under its masked name, and a hidden one is never offered.
- The options are one `click` per ref, plus `scroll` down, `scroll` up, `back` and `giveUp`. No `doubleClick`, `type` or `wait`. Over 255 options ends the run `runFailed` with the count, and the list is never trimmed.
- The draw lands in the cumulative probabilities, in offer order, using a stream of its own derived from the run seed with `hash` and `rng`. The behaviour stream stays the same whichever backend runs. Jev's own pick is logged and never used (`docs/CONVENTIONS.md`, "Determinism rules"; ADR 0001 §3).
- Stage 7 applies unchanged: B1, B3 and the step cap work as in s2-03 and s2-10.
- The record is optional on `actionPlanned`, `CompleteRunStep` and `IncompleteRunStep`, and `runResultFromEvents` carries it. The LLM backend never sets one.
- A Jev step has no `narration` event. `modelIds.actor` is Jev's model, `runStarted` has no `actorSampling`, and the Jev backend never calls `complete`. The confidence is stored and read by nothing.
- The CLI setup is shared in one `packages/agent/src/cli.ts` before `--backend` is added.
- Out of scope: any LLM call in a Jev run, narration, the UI, the sweep and `seed:demo` on Jev, and tasks that need typing.

## Design

### Core: the decision record (`packages/core/src/run.ts`)

```ts
/** One option a decision backend was offered: the action it stands for, and the words it was offered under. */
export const DecisionOption = z.object({ action: Action, description: z.string().min(1) }).strict();

/**
 * How a decision backend chose a step's action (ADR 0001 §4): the options in the order offered,
 * one probability per option as the backend sent it (unnormalised), its confidence, and the value
 * rolled on the run's decision stream. The action is `options[drawOption(probabilities, rolled)]`.
 */
export const DecisionRecord = z
  .object({
    options: z.array(DecisionOption).min(1),
    probabilities: z.array(Probability),
    confidence: Probability,
    rolled: Probability.lt(1),
  })
  .strict()
  .superRefine(/* probabilities.length === options.length; at least one above zero */);

/**
 * The option a rolled value in [0, 1) lands on: the first whose running total exceeds
 * `rolled × total`. Scaled by the total because Jev rounds each probability, so the sum misses 1
 * (s2-05). An option with probability 0 is never drawn. Throws a `RangeError` when nothing can be
 * drawn (a total of 0, or `rolled` outside [0, 1)); `checkDecision` calls it only on a record
 * `DecisionRecord` accepts, so a schema never throws it.
 */
export function drawOption(probabilities: readonly number[], rolled: number): number;
```

- `actionPlanned`, `CompleteRunStep` and `IncompleteRunStep` gain `decision: DecisionRecord.optional()`. `WastedRunStep` does not: a wasted step has no action, and a Jev run never wastes a step, since every option names a shown ref.
- A shared check, `checkDecision`, sits next to `checkDice` in the same `superRefine`. When `decision` is present, the option it draws must equal `proposedAction`, compared with `JSON.stringify` as `checkDice` compares actions. On `IncompleteRunStep`, a `decision` without the audit fields is an issue. The check opens with `if (!DecisionRecord.safeParse(decision).success) return;`. Under zod 4 a failed field check is continuable, so the outer refine still runs on a record with `rolled: 1`, a negative probability or mismatched lengths. The record's own issues report it, and `drawOption` never throws out of a `parse`, which would escape `runResultFromEvents`' `invalid_run_events` contract. This is the `fired === rolled < p` rule of `DiceRoll`, applied to the draw: a stored record that disagrees with its own numbers is rejected.
- The fold: `StepDraft.decision` is set from `actionPlanned` and travels with `planned`, so complete and incomplete steps both carry it. That follows how `dice` travels.
- Fixture: `packages/core/src/fixtures/decision-record.json` is exported as `decisionRecordFixture`. It holds the record for `toActorObservation(observationFixture)`: ten options (e1 to e6, with e6 as `Ar▒▒ive`, then the four fixed ones), Jev-style probabilities rounded to two decimals with a sum of 0.99, and a rolled value that lands on `e3` ("Deliveries"). An agent test checks that `jevOptions` builds exactly these options, so the fixture and the builder cannot drift.

### Agent: the seam (`actor-backend.ts`, `actor-loop.ts`)

- `ActorTurn` gains `observation: Observation`, the Actor-facing projection that `observationText` renders. `actorTurn` fills it in. A backend that offers elements as options (Jev) reads only its elements' refs, roles and names, each of which the text already shows. Its other fields, `screenshotPath` included (behind a flag that is off), are read by no backend.
- `ActorAnswer` gains `decision?: DecisionRecord`.
- `ActorBackendFactory`'s input gains `decisionDraw: () => number`. `decisionDrawFor(seed)` makes it, next to `providerSeedFor`:
  ```ts
  /** The run's decision stream (ADR 0001 §3): a stream of its own from the run seed, never the behaviour stream. */
  export function decisionDrawFor(seed: Seed): () => number {
    return rng(Math.floor(hash(seed, "decision-draw") * 2 ** 32));
  }
  ```
  The loop makes all three per-run derivations of the seed in one place: the behaviour stream `rng(seed)`, the provider seed, and this stream. A backend never sees the run seed.
- `runActor` passes `decisionDraw: decisionDrawFor(seed)` to the factory. `walk` emits `actionPlanned` with `...(answer.decision === undefined ? {} : { decision })`. `ask` keeps the accepted retry's decision (`{ ...second, cost }`); Jev never retries, but the seam should not drop the field.

### Agent: the Jev backend (`jev-actor.ts`, `prompts/jev-question.md`)

```ts
export const JEV_MAX_OPTIONS = 255;
/** Core's option, plus the key it is sent under. */
export type JevOption = DecisionOption & { key: string };

/** The options of one turn, in offer order: one click per shown element, then the four fixed moves. */
export function jevOptions(observation: Observation): JevOption[];
/** The `decide` request for one turn. Exported so a test rebuilds a stored step's request. */
export function jevRequest(turn: ActorTurn, options: readonly JevOption[]): DecideRequest;
export function jevActor(options: { settings: LlmSettings; llm?: (logger: Logger) => Llm }): ActorBackendFactory;
```

- **Options.** A click option's key is the ref (`e3`). Its description is `Click [e3], the <role> "<name>"`. The ref is in the words too: nothing shows that Jev reads the criteria keys, and two elements with the same role and name must not be offered under the same words. The `<role> "<name>"` part is worded the way the history names an element. `elementName` is extracted from `history.ts`'s private `target`, exported, and used by both. After the clicks come `scroll_down` "Scroll the page down", `scroll_up` "Scroll the page up", `back` "Go back to the page before", and `give_up` "Stop, because you think you cannot get it done here". No key collides with a ref.
- **Request.** `{ role: "actor", state: turnText(turn), question: { instructions: JEV_QUESTION, options: { key: description, … } } }`. `turnText` is the LLM's user message: `actor-turn.md` filled with the goal, the history and the page. So both backends read the same bytes of turn text. `JEV_QUESTION` is `prompts/jev-question.md`, fixed, with no placeholder. It says what the text holds and how a page line reads, and asks which one thing to do next. `prompts.ts` holds `readPrompt`, `fill` and `turnText`, moved out of `llm-actor.ts`, so one module reads `prompts/`.
- **Answer.** Built per run with the run's logger and `decisionDraw`. Each answer works like this:
  1. A `turn.retry` throws a plain `Error`. Only a bug reaches it: every option names a shown ref, so the loop's ref check never refuses one.
  2. Build `jevOptions(turn.observation)`. More than 255 throws `WayfordError("jev_too_many_options", "the page offers <n> options, more than Jev's Choice limit of 255; the list is never trimmed, since that would be a second filter")` before any call, so nothing is billed.
  3. `decide(jevRequest(turn, options))`. An `LlmError` propagates as it is, and the loop bills its cost.
  4. `probabilities = options.map((o) => decision.probabilities[o.key])` (offer order; `decide` checked that every key is present), `rolled = decisionDraw()`, then `chosen = options[drawOption(probabilities, rolled)]`.
  5. Log `{ jevChoice, drawn, rolled, confidence }` as "jev decision", then return `{ response: { action: chosen.action, narration: "" }, cost: decision.cost, decision: { options (action and description), probabilities, confidence, rolled } }`.
- The backend's `modelId` is `settings.jevModel` and its `sampling` is `undefined`.
- `fake-llm.ts`: `decide` accepts a function entry, as `complete` does. The function is called with the request as recorded, and what it returns is checked as Jev's answer. That way a test can put probability 1 on an element by its name, since refs differ per persona.

### Agent: the shared CLI setup (`cli.ts`)

No top-level side effects, and not in the barrel. It holds:

- `ENV_FILE` and `RUNS_DIR`: the root `.env` and `runs/`, found from this file.
- `loadRootEnv()`: loads `.env` when present. Node's loader keeps a variable the shell already set.
- `TARGET_APP_PORT` (5174) and `serveOnFixturePort()`: `serveTargetApp` on 5174, with the one-line port hint.
- `launchChromium()`: launches Chromium, with the install hint.
- `parseSeed(text)`: digits only, then `Seed`.
- `scriptArgs(argv)`: drops pnpm's forwarded `--`.
- `printFailure(error)`: a `WayfordError` prints as `code: message`, anything else whole. Never the settings.
- `ACTOR_BACKENDS` (`["llm", "jev"]`), `parseBackend(text)`, and `backendFactory(name, settings)`, which returns `llmActor` or `jevActor`.

These use it:

- `run-one.ts`, `calibrate.ts` and `run-scout.ts` (issue #153) use all of it that applies. `run-scout.ts` builds its directory as `join(RUNS_DIR, "ground-truth")`, so `cli.ts` never names ground truth, as `actor-isolation.test.ts` requires.
- `smoke-run.ts` uses `launchChromium` and `printFailure`, and keeps its free port.
- `smoke-llm.ts` and `smoke-jev.ts` use `loadRootEnv` and `printFailure`, so the `.env` path has one copy.

### `run:one` and `calibrate` with `--backend`

- `run:one -- … [--backend llm|jev]`. Without the flag, it uses `settings.actorBackend` (`LLM_ACTOR_BACKEND`, default `llm`). A Jev step prints `click e3 (rolled 0.412 → p 0.84 of 10 options; 476 in, 0 out, 0.000020 USD)`, without the confidence, which nothing reads during a run. There is no narration line, since Jev writes none.
- `calibrate -- [--seeds a-b] [--max-usd n] [--backend llm|jev]` follows the same default and drops s2-11's refusal of `jev`.
  - `CalibrateOptions` gains `backendId: "llm" | "jev"`, and `ReportHeader.backendId` widens to match.
  - For `jev`, the model is `settings.jevModel`, the estimate uses Jev's price, and the header's effort line reads `n/a`.
- **The gate.** Run `calibrate -- --backend llm --seeds 1-10`, then `--backend jev --seeds 1-10`. Take the rows "Ada, easy" and "Vera hard-cut, hard" into ADR 0001's table: successes, median steps, the row's total cost and median wall time per run. Then write the pass or fail line (Jev passes with ≥ 8/10 for Ada and 0/10 under the hard cut).
  - The outcome is read from those two rows only, never from calibrate's own go/no-go line, which also judges "Ada, hard".
  - The default `--max-usd 2` covers both sets. The LLM set's estimate is 50 runs × 20 steps × (2,000 in × 0.10 + 500 out × 0.50) / 1M = 0.45 USD; s2-11 spent 0.0375 USD on 25 runs.
  - On a fail, the ADR's status says so, with the numbers.

## Files

- `packages/core/src/run.ts`: `DecisionOption`, `DecisionRecord`, `drawOption`, `checkDecision`, the optional field on `actionPlanned` and both step shapes, and the fold.
- `packages/core/src/run.test.ts`: the record, the draw, the event check and the fold.
- `packages/core/src/fixtures/decision-record.json` (new) and `fixtures/index.ts`: `decisionRecordFixture`.
- `packages/agent/src/actor-backend.ts` and `actor-backend.test.ts`: `ActorTurn.observation`, `ActorAnswer.decision`, the factory's `decisionDraw`, and `decisionDrawFor`.
- `packages/agent/src/actor-loop.ts`: passes the stream, emits the record, keeps it on an accepted retry.
- `packages/agent/src/jev-actor.ts` (new), `jev-actor.test.ts` (new, unit) and `jev-actor.browser.test.ts` (new, runs on the target app).
- `packages/agent/prompts/jev-question.md` (new): the one instruction template.
- `packages/agent/src/prompts.ts` (new): `readPrompt`, `fill` and `turnText`, moved from `llm-actor.ts`, which now imports them.
- `packages/agent/src/history.ts`: `elementName` extracted from `target` and exported.
- `packages/agent/src/fake-llm.ts` and `fake-llm.test.ts`: function entries for `decide`.
- `packages/agent/src/llm-actor.test.ts`: the direct factory calls pass `decisionDraw`.
- `packages/agent/src/cli.ts` (new) and `cli.test.ts` (new), plus `run-one.ts`, `calibrate.ts`, `run-scout.ts`, `smoke-run.ts`, `smoke-llm.ts` and `smoke-jev.ts`: the shared setup and `--backend`.
- `packages/agent/src/calibration-run.ts`, `calibration.ts`, `calibration.test.ts` and `calibration-run.browser.test.ts`: `backendId` and the effort line. The test's report-path assertion checks the file name for a colon, not the whole path, which holds `C:` on Windows and fails there on `main` today.
- `packages/agent/src/index.ts`: one barrel line, `./jev-actor.js`.
- `packages/agent/src/test-support.ts` (new, PR review): the served app, Chromium, the runs folder and the run readers both browser suites share, so `actor-loop.browser.test.ts` imports them too.
- `packages/io/src/chromium.ts` (PR review): one comment, which named `run-one.ts` for wording that now lives in `cli.ts`.
- `docs/adr/0001-jev-actor-backend.md`: the gate table, and the status on a fail.
- `tasks/s2-06-jev-actor-backend.md`: ticked boxes and an Outcome section. `tasks/BOARD.md`: the status.

Outside the task's list: `history.ts`, `fake-llm.ts`, `prompts.ts`, `cli.ts` and the CLIs sit inside `packages/agent/src/**`, which the task lists. Nothing outside `packages/agent`, `packages/core` and the ADR changes, but the one comment in io's `chromium.ts`.

## Acceptance mapping

| Acceptance box | Proven by (test name or command) |
|---|---|
| core test: events with a decision fold into a step carrying it; fewer probabilities than options fails | `pnpm --filter @wayford/core test`. `run.test.ts`, `describe("DecisionRecord")`: "a record with fewer probabilities than options fails to parse"; "the fold copies a decision from actionPlanned onto the step, complete or cut off"; plus the draw and event-check tests |
| agent tests with the fake `decide`, no network | `pnpm --filter @wayford/agent test`. The new browser file stubs `fetch` to throw, as `actor-loop.browser.test.ts` does |
| p = 1 on Your account, then Delivery address: Ada `success` after two actions | `jev-actor.browser.test.ts`: "Ada reaches the easy goal in two Jev draws, and each request is rebuilt from the stored evidence" |
| same persona, seed and fake twice: equal text, action, rolled value, B1 roll; 0.5/0.5 draws each option on seeds 1 to 20 | browser: "Vera on one seed and one fake twice: the same text, actions, rolled values and B1 rolls (F5 AC1)". Unit: `jev-actor.test.ts`, "a 0.5 and 0.5 split draws each option at least once over seeds 1 to 20" |
| B1 rolls of a Jev run equal an LLM run's with the same seed and clicks | browser: "a Jev run and an LLM run of Vera on the same seed and clicks roll the same B1 dice". Vera's `doubleClick` is 0.8, and the test asserts B1 rolled on both clicks, so the arrays are not empty |
| no `actorSampling` on a Jev run | browser, `walkJev`, for every Jev run: `events[0]` has no `actorSampling` key and neither does the result; `modelIds.actor` is the Jev model |
| the observation fixture: masked name offered, no hidden name | unit: "on the observation fixture the request offers Ar▒▒ive and names no hidden element". It also asserts that the degraded element's real name, "Archive", is absent |
| every persona's first request identical; no persona name, no impaired/disabled/blind/vision/contrast | browser: "every persona fixture sends Jev the same first request on the same page (F5 AC6)", with names checked on word boundaries. Unit: "Jev's own words hold no banned word", run on blanked page strings over `BANNED_ACTOR_WORDS`, which covers the five, on the instruction file and the option words; the turn text is the LLM's user message, which `llm-actor.test.ts` greps |
| more than 255 options: `runFailed` with the count | browser: "a page with more than 255 options ends runFailed naming the count". Unit: "255 options are asked, 256 fail before any call" |
| real key: `run:one … --backend jev` ends `success` | run by hand, output and cost in the PR |
| real key: the gate table, both backends, seeds 1–10, with the outcome | `calibrate -- --backend llm --seeds 1-10` and `--backend jev --seeds 1-10`; the table in ADR 0001, the printouts in the PR |
| root `pnpm lint`, `pnpm typecheck`, `pnpm test` | the three commands |

## Decision log

| Question | Taken | Why |
|---|---|---|
| Where the draw happens | In the Jev backend, from a stream the loop hands it | The backend knows the options. The loop only needs the action and the record. One `answer()` shape for both backends. |
| Where the stream comes from | `decisionDrawFor(seed)` in `actor-backend.ts`, made by `runActor`, passed as `decisionDraw` | Every per-run derivation of the seed (behaviour, provider seed, decision) sits in one place a reviewer can check. A backend never holds the run seed. |
| Hash key | `"decision-draw"` | Distinct from `"provider-seed"`. Perception keys are element keys, which hold `//` and never equal it. |
| How the backend gets the elements | `ActorTurn.observation`, the Actor-facing `Observation` | Options need refs, roles and names. Parsing our own rendered text back would be fragile. It is the projection the text renders, so nothing new reaches a backend. |
| Option keys | the ref for a click; `scroll_down`, `scroll_up`, `back`, `give_up` | The fixed keys cannot collide with `e<n>`. |
| Option words | `Click [e3], the <role> "<name>"`, the history's naming through one exported `elementName`, with the ref | The ref in the words ties the option to its page line whether or not Jev reads the keys, and it keeps two same-named elements apart (spec review). Position and legibility are on the page line in the state. |
| Fixed options on every page | all four, always | The task lists them without conditions. Offering `scroll_down` only when something is below would be a rule the task does not hold. |
| The state text | `actor-turn.md` filled, the LLM's user message, through a shared `turnText` | ADR 0001 §2, "same input as the LLM, nothing more". The one Jev-only template is the question's instructions. |
| Where prompt reading lives | a new `prompts.ts` (`readPrompt`, `fill`, `turnText`) | Both backends read `prompts/`. One module does it, and neither backend imports the other. |
| What the record stores per option | the action and its description | Enough to replay the draw and read what Jev was offered. The key is a function of the action. |
| A check that the record matches the action | `checkDecision` beside `checkDice`, using core's `drawOption` | The stored record replays to its action (ADR 0001 §4). The same pattern as `DiceRoll.fired`. The draw's arithmetic lives in core, as `diceFires` does. |
| Normalising the probabilities | none stored; the draw scales `rolled` by their sum | Jev's numbers are stored as sent (s2-05's decision). |
| The 255 limit in core | no, in agent (`JEV_MAX_OPTIONS`) | It is Jev's API limit, not a property of a decision record. |
| Too many options | `WayfordError("jev_too_many_options")` before any call | The loop turns it into `runFailed` `<code>: <message>`, which carries the count. Nothing is billed. |
| `--backend` default | `settings.actorBackend` (`LLM_ACTOR_BACKEND`) | The setting exists since s2-05. The flag overrides it for one command. |
| Scope of `cli.ts` | `run-one`, `calibrate`, `run-scout` (#153), `smoke-run`; `smoke-llm` and `smoke-jev` for the `.env` path and the failure line | The task asks for one copy, and #153 names `run-scout`. Both smokes hold the same `.env` copy. |
| The effort line for Jev in the calibration table | `n/a` | Jev takes no effort. "default" would read as the endpoint's own. |
| The gate's "wall time" | the row's median wall time per run | The report measures each run's `durationMs`. The set runs five at a time, so no total belongs to one row. |
| The Windows-only `:` assertion | check the report's file name, not its path | It fails on `main` on Windows (`C:`), and CI on Linux is green. The test is in a file this task changes anyway. |
| Pinning the decision stream | (build) `decisionDrawFor(7)`'s first three values are pinned in `actor-backend.test.ts`, as `providerSeedFor(7)` is | A change to it moves the rolled value of every stored decision. |
| Where the backend names live | (build, branch review) `llm-settings.ts` exports the enum as `ActorBackendName`. `cli.ts` has `readBackend` and `BACKEND_USAGE` beside `backendFactory`, in place of the spec's `ACTOR_BACKENDS` and `parseBackend` | One list of names, the setting's. `ActorBackend` is taken: it is the seam's interface, in the same barrel. |
| io's backend | unchanged: `llmActor` | The runs API on Jev is the sweep and `seed:demo`, week 4 (Out of scope). The PR names the follow-up: io builds `llmActor` whatever `LLM_ACTOR_BACKEND` says (`packages/io/src/server.ts:55`), so with `jev` set the CLIs run Jev while io runs the LLM. io should refuse, or log, `jev` until week 4 wires it. |

## Risks

- **Real-key boxes.** They need `.env` in this worktree's root. The user places it, and the agent never reads or copies it. I ask early in the build. Without it, the two boxes stay open and the rest ships.
- **The gate can fail.** That is a result, not a blocker: the ADR records it and `llm` stays the default.
- **Jev in early access** may answer 403 or a changed shape. s2-05's smoke passed on 2026-10-01. A failure blocks only the real-key boxes.
- **Windows load flakes** in the browser suites (known): rerun alone, and let CI decide.
- **Typing an extra required field** on the factory input touches every direct factory call in tests. There are about seven, all in `llm-actor.test.ts`.

## Review note

Round 1 (spec-reviewer), "ready after fixes", nothing blocking. All nine findings were taken:

- `checkDecision` opens with a `DecisionRecord.safeParse` guard. Under zod 4 the outer refine runs past a failed field check, so `drawOption` could have thrown out of `RunEvent.parse` (should).
- The B1 row names Vera and asserts non-empty dice. On Ada it would have compared two empty arrays (should).
- Option words carry the ref, `Click [e3], the …` (should).
- The gate is read from its two rows only, and the `--max-usd` estimate is stated (nit).
- `ActorTurn.observation`'s claim is reworded around `screenshotPath` (nit).
- `elementName` is "extracted", not "exported" as if it existed (nit).
- `JevOption` is `DecisionOption & { key }` (nit).
- The io follow-up is named concretely (nit).
- The fixture test also asserts "Archive" is absent (nit).

No blocking findings, so no second round.

Branch review (build), "merge after fixes", nothing blocking. The security review found nothing.

These were taken:

- The F5 AC6 Jev test asserts on the terminal event, so a run that failed prints its `runFailed` error (should; it flaked once under a full Windows run).
- The backend names live once, as `ActorBackendName` (cut list; decision log).
- Two core tests that repeated others are gone, and the `drawOption` tests are one table (cut list).
- `cli.ts`'s module comment says what importing it does read, the prompt files (nit).

The simplify pass then added:

- one `checkPlanned` and `sameAction` in core;
- `readBackend` and `backendModel` in `cli.ts`;
- `ActorBackendName` in the calibration types;
- `launchChromium` and `elementName` in the Jev browser test;
- a run helper in `llm-actor.test.ts`, and fewer repeated assertions.

Left, with the reason:

- A backend descriptor, and `backendFactory` exported from the barrel: they serve a third backend or io, which is week 4.
- One test harness shared by both browser files: it would edit `actor-loop.browser.test.ts`, which this task does not touch.
- Dropping `ActorTurn.observationText`: the field predates the task, and the turn keeps the exact text sent.
- Loading Playwright lazily for the smoke scripts: about 0.4 s at the start of a by-hand script.
- Skipping `checkDecision`'s second parse: about 10 µs per step on a normal page.

PR review (Marcin, 2026-10-05, on #158), "merge after fixes", nothing blocking. These were taken:

- `run:one` no longer prints Jev's confidence, so nothing reads it during a run, as the comments, the task and the PR say. `result.json` keeps it (should).
- `test-support.ts` holds the harness both browser suites copied: the hooks, the fake's bill, the scripted clicks and the run readers. The reason above for leaving it no longer holds, since the task lists `packages/agent/src/**` (should).
- The Jev banned-word unit test greps Jev's own words only, the instruction file and the options. The turn text is the LLM's user message, which `llm-actor.test.ts` greps (cut list).
- `backendModel` is gone: `calibrate.ts` picks the model with one ternary, as before the simplify pass (cut list).
- Three core tests that repeated others are gone, the `scriptArgs` tests are one table, the `BACKEND_USAGE` test is gone, and the Ada browser test no longer re-checks `actorSampling`, which `walkJev` checks for every run (cut list).
- `drawOption` lands on the last option that adds to the total when a subnormal total rounds `rolled × total` up to it, instead of returning -1 (nit).
- The task's Outcome says the gain is mostly speed and the cost gain smaller, as its numbers show (nit).
- io's `chromium.ts` names `cli.ts` for the install hint's wording (question).
