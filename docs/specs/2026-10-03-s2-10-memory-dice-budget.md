# s2-10 — Actor loop: memory, behaviour dice and budget: spec

Task: `tasks/s2-10-memory-dice-budget.md` · Branch: `feature/s2-10-memory-dice-budget` · Date: 2026-10-03
Status: approved 2026-10-03 (auto)

## Goal

The loop truncates the Actor's history to the persona's memory (M1), rolls B1 from the run seed's behaviour stream, ends a run on its wall-clock budget (B3) and sends one provider seed per run, so personas differ in memory and dice as `docs/RULES.md` says, and a stored run replays its rolls.

## Constraints that bind

- "Behaviour: rolled on every action", "perception: once per element", "knowledge: fully deterministic" (`AGENTS.md`, "Randomness follows three different rules"). Every behaviour roll is "the next draw of one behaviour stream from `rng(run seed)`, never the profile seed (A20)", stored as `{ rule, p, rolled, fired }`; "a wasted step rolls nothing" (task).
- Firing: "draws one number `rolled` in [0, 1) and fires when `rolled < p`"; "a rule that does not apply to the action logs nothing"; "without a fired roll the two actions are identical" (`docs/RULES.md` stage 7). Core already enforces the shape: `DiceRoll`, `checkDice` on `actionPlanned` (`packages/core/src/run.ts:143-198`).
- M1: "truncated to the last `memorySteps` steps, and the earlier steps are replaced by a one-line count. Absent means unlimited. The truncation happens inside the history function s2-03 wrote, so every backend gets the same one" (task). The count line "must not name what was dropped" (task, reviewer note).
- B3: "`budgetSeconds` ends the run `budget_exceeded`. Wall-clock, read from an injectable clock so tests never wait. The run records its elapsed time" (task). `Date.now()` "never influences a decision, only timestamps" (`docs/CONVENTIONS.md`): B3 is the one named exception, and it reads the injected clock.
- Provider seed: `Math.floor(hash(run seed, "provider-seed") * 2 ** 31)`, sent on every `complete` of the run; `runStarted` carries it with the actor's temperature as `actorSampling`; `runResultFromEvents` already copies that (`run.ts:772`).
- The persona reaches a backend only through the observation and the history (`actor-backend.ts`, `docs/PLAN.md` F5 AC6). M1 goes in as a number, never a profile.
- Out of scope: B2, B4, simulated time (`s2-07` to `s2-09`), the Jev backend (`s2-06`). Files: `packages/agent/src/**` only.

## Design

### B1: `packages/agent/src/behaviour.ts` (new, pure)

```ts
/** What stage 7 made of the action the Actor proposed: the action to perform and every roll. */
export interface Behaved { performed: Action; dice: DiceRoll[] }

/** Stage 7 on one proposed action. `draw` is the run's behaviour stream: B1 takes one draw
 *  when it applies and none otherwise. B2 and B4 join here in RULES' table order (s2-07, s2-08). */
export function behave(proposed: Action, behaviour: Pick<Behaviour, "doubleClick">, draw: () => number): Behaved
```

- B1 applies when `proposed.type === "click"` and `behaviour.doubleClick !== undefined`. Then `rolled = draw()`, `fired = diceFires(p, rolled)` (core's), the roll is pushed, and a fired roll performs `{ type: "doubleClick", ref: proposed.ref }`.
- Otherwise no draw and `dice: []`, `performed` is `proposed` itself.

The loop makes the stream once per run, `const draw = rng(seed)` (core), right after the input checks, and keeps it on `Loop`. In `walk`, between the answer and `actionPlanned`:

```ts
const { performed, dice } = behave(proposed, loop.profile.behaviour, loop.draw);
emit actionPlanned { proposedAction: proposed, performedAction: performed, dice, cost }
if (loop.overBudget()) return ranOut(loop, k);          // B3, below: planned, never performed
const arrival = await performAction(run, performed, shown);
…
history.push({ observation: shown, proposed });          // proposed, as s2-03 decided
if (met) return "success";
if (performed.type === "giveUp") return "gave_up";      // performed: B2 will turn a giveUp into a scroll
```

A wasted step never reaches `behave`, so it draws nothing. `RunEvent.parse` in `emit` runs `checkDice`, so a malformed roll fails the run as a bug.

### M1: `history.ts` and `actor-backend.ts`

```ts
export function renderHistory(steps: readonly HistoryStep[], memorySteps?: number): string
export function actorTurn(goal: string, observation: Observation, history: readonly HistoryStep[], memorySteps?: number): ActorTurn
```

- `kept = steps.slice(Math.max(0, steps.length - memorySteps))`. With `memorySteps` absent, every step.
- When `dropped = steps.length - kept.length > 0`, the first line is `- 2 earlier steps not shown.` (`- 1 earlier step not shown.` for one), then the kept lines as today. The wording mirrors the observation's own `N more elements not shown` (A1, `observation.ts:483`). It names no URL, element or action, and says nothing about the persona.
- A wasted step is a step: it has a history line, so it counts toward `memorySteps`.
- No steps: `Nothing yet.`, as today.
- The loop's `ask` calls `actorTurn(goal, shown, history, loop.profile.behaviour.memorySteps)`. The kept lines are rendered from the observation the Actor was shown at that step, so a name stays as the Actor read it.

### B3: the budget and the clock

`RunActorOptions` gains `now?: () => number` (milliseconds since the epoch, `Date.now` when absent). `runActor` reads every time through it: `t0`, every event's timestamp, `endMs`, and so `durationMs`. Under a fake clock the record stays self-consistent: `durationMs` is still the last timestamp minus the first, as the existing Ada test asserts.

`Loop` gains `now`, `t0` and `budgetMs = profile.behaviour.budgetSeconds * 1000`, and an `overBudget()` that reads `now() - t0 > budgetMs`. The clock is read at two points of a step:

1. **Before the action is performed**, right after `actionPlanned`. When the budget has run out while the model was answering, the run ends `budget_exceeded` there. The step is stored planned but not performed (`IncompleteRunStep` with the audit fields and no `urlAfter`), which core allows as the last step of a `budget_exceeded` run (`run.ts:333`, `:394`). That is F5 AC4's "the run stopped mid-step", and `calibration.ts`'s `endOf` already sorts it as the clock. The answer, its narration and its B1 roll stay in the record. A persona whose time is up performs nothing more, `giveUp` included, so no `success` is recorded past the budget.
2. **At the end of every step**, wasted ones included, with the cap, after the success and give-up checks. This catches a run of wasted steps, which never plan an action, and a budget that ran out while an action landed, before another model call is billed.

```ts
if (k + 1 >= loop.maxSteps || loop.overBudget()) return ranOut(loop, k);   // logs { step, elapsedMs, limit: "steps" | "budget" }
```

An answer that came in time is performed, and its success counts even when landing took the run past the budget, as success on the cap's last step does.

The run records its elapsed time as `durationMs`, which core already has. The step count, the last step's kind and `durationMs` show which limit ended a `budget_exceeded` run (`endOf`), and the log line names it.

### Provider seed and `actorSampling`: `actor-backend.ts`, `llm-actor.ts`

```ts
/** The provider seed every model call of a run is sent (`docs/PLAN.md` A20): from the run seed,
 *  31 bits, since some providers type `seed` as a signed 32-bit integer. */
export function providerSeedFor(seed: Seed): number   // Math.floor(hash(seed, "provider-seed") * 2 ** 31)

export type ActorBackendFactory = (run: { logger: Logger; providerSeed: number }) => ActorBackend;

export interface ActorBackend {
  readonly modelId: string;
  /** `runStarted.actorSampling`: the temperature and provider seed every call of the run is
   *  sent, known before the first call. `undefined` for a backend that sends neither (Jev,
   *  s2-06). Required, so a wrapper that rebuilds a backend cannot drop it unseen. */
  readonly sampling: Sampling | undefined;
  answer(turn: ActorTurn): Promise<ActorAnswer>;
}
```

- `runActor` builds the backend with `options.backend({ logger, providerSeed: providerSeedFor(seed) })` and puts `actorSampling: backend.sampling` on `runStarted` when it is defined.
- `llmActor` sets `sampling: samplingOf(settings.roles.actor.temperature, providerSeed)` (the adapter's own builder, `llm.ts:125`) and passes `seed: providerSeed` on every `complete`, retries included.
- `calibration-run.ts`'s `timed` wrapper builds a new backend from `modelId` and `answer` only. It forwards `sampling` too, or calibration runs would lose `actorSampling`. With the field required, the compiler finds this wrapper and the three hand-built backends in `calibration-run.browser.test.ts` (`:249`, `:399`, `:447`).

No core change: `Sampling`, `runStarted.actorSampling`, `RunResult.actorSampling`, `DiceRoll`, `checkDice` and `durationMs` all exist.

## Files

| File | Why |
|---|---|
| `packages/agent/src/behaviour.ts` (new) | `behave`: stage 7, B1 |
| `packages/agent/src/behaviour.test.ts` (new) | B1 boundaries with a scripted draw |
| `packages/agent/src/history.ts` | `renderHistory(steps, memorySteps)`, the count line |
| `packages/agent/src/history.test.ts` | M1 truncation, count line, unlimited |
| `packages/agent/src/actor-backend.ts` | `actorTurn(…, memorySteps)`, `providerSeedFor`, `sampling` on the backend, `providerSeed` on the factory's run argument |
| `packages/agent/src/actor-backend.test.ts` (new) | `providerSeedFor`: range, pinned value, seeds differ |
| `packages/agent/src/llm-actor.ts` | `sampling`, `seed` on every call |
| `packages/agent/src/llm-actor.test.ts` | the seed on every call, `sampling`; factory calls take `providerSeed` |
| `packages/agent/src/actor-loop.ts` | the stream, B1 between answer and plan, M1 into `actorTurn`, `now`, B3, `actorSampling` |
| `packages/agent/src/actor-loop.browser.test.ts` | the loop boxes; `walk`'s rebuild of each request passes the persona's `memorySteps` |
| `packages/agent/src/calibration-run.ts` | the `timed` wrapper forwards `sampling` |
| `packages/agent/src/calibration-run.browser.test.ts` | only where a hand-built factory or backend needs the new argument (build) |

## Acceptance mapping

| Acceptance box | Proven by |
|---|---|
| agent tests pass with a scripted fake adapter and no network | `pnpm --filter @wayford/agent test`. The browser tests stub `fetch` to throw once the app is up |
| `memorySteps` 2: step 4's prompt holds steps 2 and 3 and one count line; Ada holds every step | `history.test.ts` "keeps the last memorySteps steps after one count line"; browser test "Kai's prompt at step 4 holds steps 2 and 3 after a count line, Ada's every step", with `maxSteps` 5 and a script whose dropped steps the kept ones never revisit: step 0 clicks "Your account" on `/`, step 1 "Deliveries" on `/account`, step 2 "Home" on `/deliveries`, step 3 scrolls on `/`, step 4 gives up. Kai's history section holds neither "Your account" nor `/account` |
| Vera, same task, seed and answers twice: equal `actorObservationText` and B1 rolls (F5 AC1) | browser test "Vera reads the same text…" extended: B1 rolls equal across runs, and at least one rolled |
| only `profile.seed` changed: B1 rolls and every call's provider seed equal (A20) | same test, its third run (profile seed + 1): equal B1 rolls, every call's `seed` equal to run a's |
| click → `doubleClick` exactly when `rolled < p`, roll stored; wasted step uses no roll | `behaviour.test.ts` (p 0.5 with rolled 0.5 and just under; p 0 and 1; non-click and no knob draw nothing); browser test "B1 draws the behaviour stream in order, and a wasted step draws nothing": the stored rolls are `rng(seed)`'s first draws in order across a wasted step and a scroll, with `p` set between them so one fires (performs `doubleClick`) and one does not |
| same provider seed on every call, `actorSampling` holds it with the temperature, seeds 1 and 2 differ | `llm-actor.test.ts` (every answer, retry included, sends the factory's seed; `sampling`); `actor-backend.test.ts` (seeds 1 and 2 differ, 31-bit); browser test: every call of a run gets `providerSeedFor(seed)`, `result.actorSampling` is `{ temperature, providerSeed }` |
| fake clock: `budget_exceeded` past the budget without waiting; elapsed time recorded | browser tests "the budget ends a run on its clock", each answer moving a fake clock 50 s, Ada (120 s) with a cap of 20: (a) clicks: `budget_exceeded` with steps 0 and 1 complete and step 2 planned but not performed (incomplete, no `urlAfter`), `durationMs` 150 000; (b) only missing refs: `budget_exceeded` at the end of the step whose answers pass the budget, every step wasted, fewer than 20 |
| `pnpm lint`, `pnpm typecheck`, `pnpm test` | the commands |

## Decision log

| Question | Taken | Why |
|---|---|---|
| Where the behaviour stream comes from | `rng(run seed)`, made once per run in `runActor` | The task says so. Perception keys `hash(seed, element key)` and the provider seed `hash(seed, "provider-seed")`, so neither shares its state |
| When B1 applies | a proposed `click` and a profile that sets `doubleClick`, 0 included | RULES: a rule that does not apply logs nothing. Ada, with no knob, rolls nothing. A knob of 0 rolls and never fires, so the log shows it was checked |
| Where stage 7 lives | `behaviour.ts`, a pure `behave` taking the draw as a function | Unit-tests the `rolled < p` boundary exactly. s2-07 and s2-08 add B2 and B4 there in table order |
| Which action ends a give-up | the performed one | Same as the proposed one under B1. Correct once B2 performs a scroll in its place (RULES "B2 in the log") |
| The count line's words | `- N earlier steps not shown.`, first, singular for 1 | The observation's register for A1 (`N more elements not shown`); names nothing dropped, says nothing about the persona |
| Does a wasted step count toward `memorySteps` | yes | It is a history line, and "the last `memorySteps` steps" counts steps |
| How M1 reaches the turn | `actorTurn(…, memorySteps)`, a number | `actorTurn` takes no profile, so the persona has no other way into a backend |
| Where B3 is checked | before the planned action is performed, and at the end of every step with the cap | The first keeps a persona whose time is up from acting, so no late `success` is recorded (claim less), and needs no abort plumbing: an in-flight model call or browser action is never cut. The second catches wasted steps and avoids billing another call. s2-09 replaces the wall clock with a simulated one |
| Budget comparison | `elapsed > budgetSeconds × 1000` | "Exceeded" and "passes the budget" (task) both read as strictly over |
| Where the budget is counted from | `runStarted`'s `t0`, the origin of `durationMs` | The decision and the recorded elapsed time are the same number |
| What the clock drives | `now` drives `t0`, every timestamp, the budget and `durationMs` | One clock keeps a fake-clock record consistent: `durationMs` stays last minus first timestamp |
| Which limit ended a `budget_exceeded` run | a log line; no core field | The record already shows it (step count against `durationMs`). A core field is a contract change the task does not ask for |
| How the provider seed reaches the backend | the factory's run argument `{ logger, providerSeed }`; the backend reports `sampling` | The temperature is the backend's config, and Jev (s2-06) sends neither. `sampling` is known before the first call, like `modelId`, because `runStarted` needs it |
| `sampling` optional or required | required, `Sampling \| undefined` | An optional field is dropped silently by any wrapper that rebuilds a backend, as `timed` did; required, the compiler finds them |
| Where `providerSeedFor` lives | `actor-backend.ts`, the seam | It is what a run hands its backend |

## Risks

- **Existing Vera tests now roll B1 (`doubleClick: 0.8`).** A fired roll double-clicks a link (`act.ts:156`), and no test has yet double-clicked a link that navigates. The first click starts the navigation and the second should land on the same document, so the run should end on the same page. Affected: "Vera reads the same text…" and "a clicked degraded link is remembered masked" in `actor-loop.browser.test.ts`, and the Vera rows of `calibration-run.browser.test.ts` (seeds 1 and 2 on `task_past-order`, which assert step counts and the route). If a pinned-seed test lands elsewhere, the test changes its seed or answers, never the dice.
- **PR #152 (Scout) changes `llmActor`** to take a `role`. Whichever merges second resolves a small conflict in the factory body. Scout runs then send the provider seed too.
- **Wall-clock B3 can overrun by one model call or one action**: an answer that arrives late is not acted on, but nothing in flight is cut. The step cap still bounds the run.

## Review note

Round 1 (spec-reviewer, "ready after fixes", no blocking finding). All four findings taken:

- should: an answer arriving past the budget was still acted on and could record `success`. The clock is now also read before the action is performed, and that step stays planned but not performed. The fake-clock row now covers both check points.
- nit: `ActorBackend.sampling` is required (`Sampling | undefined`), so the compiler finds every wrapper.
- nit: the B1 risk names the "clicked degraded link" test and the Vera rows of the calibration test.
- nit: the Kai box names a script whose dropped steps the kept ones never revisit, with `maxSteps` 5.

No second round: round 1 found no blocking finding.
