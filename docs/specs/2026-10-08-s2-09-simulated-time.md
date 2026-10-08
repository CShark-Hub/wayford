# s2-09 — Simulated time: click speed and the budget: spec

Task: `tasks/s2-09-simulated-time.md` · Branch: `feature/s2-09-simulated-time` · Date: 2026-10-08
Status: approved 2026-10-08

## Goal

Every run keeps a simulated clock, in which each step costs the time the Keystroke-Level Model and Fitts's law give a person of the persona's pace to decide, point and press. B3 is decided on that clock, so `budgetSeconds` ends a slow persona's run from the seed and the answers, not from model latency or machine load.

## Constraints that bind

- RULES' B3 row changes first, with its sources: pointing by Fitts's law in its Shannon form, `MT = a + b · log2(D / W + 1)` (Fitts 1954, MacKenzie 1992), and per-action operators from the Keystroke-Level Model (Card, Moran and Newell 1983) (task).
- "Persona speeds with no citation behind them say `folk`". The spec decides how a behaviour knob carries its provenance (task; `AGENTS.md`, "Provenance on every threshold").
- "Deterministic: no clock read decides anything. The same seed and answers give the same simulated times and the same outcome." `Date.now()` stamps events and never decides (task; `docs/CONVENTIONS.md`, "Determinism rules").
- "Model latency no longer counts toward the budget. The run still records its wall-clock time, as evidence." Whether a wall-clock safety cap stays is the spec's call (task).
- "If the clock adds any jitter, it is a draw of the behaviour stream, logged like a roll. Otherwise time is a pure function of geometry and the knobs" (task).
- The ring's elapsed time and finish order (F6 AC3) and the median time (F7 AC2) read one of the two clocks, and the screen labels which (task).
- Out of scope: misclicks (s2-08), typing speed, cursor path animation (task).
- Contracts in `packages/core` outrank new shapes. A field added to a stored record is optional, so runs and reports stored before it still parse, and the loop always sends it, as #196 did with `limit` and `maxSteps`.
- Claim less: the clock is a model with sources, not a measurement of a person (`AGENTS.md`, "Traps").

## Why now

`calibrate` (s2-11) and the any-target passes count the runs the wall clock ends. On our pick (`docs/DEMO.md`, "Second pass"), 10 of 27 runs ran out of their 120 s on the wall clock after 8 to 19 steps (an eleventh `budget_exceeded`, Vera's G1 seed 3, hit the step cap of 20), and the same file says why: "five runs at once on this machine spend part of each persona's 120 s budget (B3) on the heavy page." Those endings measure the machine. Vera's seed 1 success on G3 at 132 s, past her 120 s budget, shows the other flaw: a slow step planned inside the budget lands far past it.

## Design

### The model, in `docs/RULES.md` before the code

A step costs one decision, and its performed action adds the motor operators. All times in ms.

| Operator | Time | Source |
|---|---|---|
| M, decide | 1350 | KLM: mental preparation (Card, Moran and Newell 1980, 1983) |
| P, point | `max(0, a + b · log2(D / W + 1))`, `a = −107`, `b = 223` | Fitts's law, Shannon form (MacKenzie 1992); `a` and `b` are MacKenzie, Sellen and Buxton 1991's mouse pointing fit (r 0.990, CHI '91) |
| B, press or release a button | 100 | KLM, as Kieras' guide (1993) gives it |
| K, a keystroke | 280 | KLM: an average non-secretary typist, about 40 wpm |

Per step:

| Step | Cost |
|---|---|
| wasted (s2-03) | M |
| `giveUp` performed | M |
| `click` | M + P + 2B |
| `doubleClick` | M + P + 4B |
| `type` | M + P + 2B + K × the characters typed (the one line `act.ts` types, counted in code points) |
| `scroll` | M + K: our scroll moves 0.8 of the viewport at once, as Page Down does |
| `back` | M + K: a keystroke such as Alt+Left |
| `wait` | M + the wait's `ms`: the persona chose to wait, and that time passes |

The persona's pace scales the operators (below): `thinkingTime` scales M, and `motorTime` scales P, B and the one K of a scroll or a back. Typed characters are timed at the norm K, unscaled: typing speed is out of scope, so no persona types faster or slower than another. A wait is not scaled. The step's time is `round(thinking × M + motor × (P + presses × B + keys × K) + typed × K + waitMs)`, a whole number of ms, where `keys` is 1 for a scroll or a back and 0 otherwise, and `typed` the characters a `type` types.

**Pointing.** `D` is the distance in CSS px from the cursor's last point to the aim point, and `W` is the aimed element's `targetPx`, the smaller side of the area a click activates. For a text block, which has no `targetPx`, `W` is the smaller side of its box. `W` is at least 1 px. The aim point is the action point `act.ts` presses (`actionPoint`), so the movement ends where the press lands.

- **Aim and landing.** The movement is timed to the element the Actor proposed, since that is where the hand aims. After a fired B4 the press lands on the neighbour, so the cursor's next point is the neighbour's action point, and the next step's movement starts there. This is the time penalty that RULES' B4 row leaves to s2-09.
- **The first point** is the centre of the first observation's viewport (`folk`).
- **Moves without a point.** A scroll, a back or a wait leaves the cursor where it was in the viewport, as the real pointer stays: `restorePointer` puts it back on the last pressed point.
- **The floor.** The intercept is negative, so a very short move would compute below zero; MT is floored at 0. `a` is a regression intercept, not a time.

Worked example, to pin in RULES and in the unit test, computed outside our code (Python's `math.log2`): `D = 400`, `W = 36` (the size of "Order archive") gives `log2(400/36 + 1) = 3.598259` bits and MT 695.4118 ms. An Ada click there costs `round(1350 + 695.4118 + 200)` = 2245 ms. Vera's (2 and 1.5) costs `round(2700 + 1.5 × 895.4118)` = 4043 ms. More pairs: `D = W = 36` gives 116 ms; `D = 0` gives 0 (floored from −107); `600, 20` gives 997.7858; `1000, 10` gives 1377.7812.

**What it gets wrong**, a RULES paragraph:
- The KLM times an expert doing a routine task. It has no reading, no visual search and no waiting for the page, so for a person new to a page the clock understates, and the budget binds later than it would.
- The mouse's constants serve every device: Milo's touch is not timed apart.
- M is one per step, not placed by the KLM's heuristics.
- No time is spent waiting for the page, which the KLM calls R. That time is the machine's, and leaving it out is what makes the clock reproducible.

**Determinism.** No jitter: time is a pure function of the step's evidence, the actions, the cursor's point and the knobs, so the behaviour stream draws nothing new and no dice log changes. `Math.log2` is the engine's own, and RULES' salience section avoids a logarithm for that reason. Here only the Node loop computes the time; the browser reads stored numbers. Each step is rounded to a whole ms, so a last-bit difference between engines could move a step only at an exact half millisecond. B3 then compares integers.

### Core: the knobs, in `packages/core/src/profile.ts`

```ts
/**
 * A pace knob of the simulated clock (B3): how many times the norm's time the persona takes, 1 being
 * the norm, the KLM's average user. `provenance` as on a threshold: a factor no source gives says
 * `folk`.
 */
export const TimeFactor = z.object({ factor: z.number().positive(), provenance: ProvenanceId }).strict();
export type TimeFactor = z.infer<typeof TimeFactor>;

Behaviour = z.object({
  …,
  /** B3: the budget, in simulated seconds (`docs/RULES.md` stage 7). */
  budgetSeconds: …,
  /** B3's clock: the time to decide a step, as a factor of the KLM's M. Absent is 1. */
  thinkingTime: TimeFactor.optional(),
  /** B3's clock: pointing, pressing and keystrokes, as a factor of Fitts's MT and the KLM's B and K. Absent is 1. */
  motorTime: TimeFactor.optional(),
  …
}).strict();
```

- **Provenance.** Each knob carries its own provenance, as a threshold does. Absent is the norm. Its sources are in the code's constants and RULES' table, the way an absent threshold does not gate. `constraintCount` does not count them: it counts thresholds, caps and unknown patterns, and no dice, budget or pace knob.
- **The new source id.** `klm` joins `PROVENANCE_IDS` (`packages/core/src/primitives.ts`) and RULES' registry: Card, Moran, Newell 1980 (CACM 23(7)) and 1983, and Kieras 1993 for B. `fitts`'s citation adds MacKenzie, Sellen and Buxton 1991 for the constants.

The fixtures, all `folk`:

| Persona | `thinkingTime` | `motorTime` | Why |
|---|---|---|---|
| Ada | — | — | The control: the norm, as she has no threshold |
| Kai | — | — | Kai differs from Ada only after perception, in knowledge, attention and memory (RULES' calibration row), and his story keeps that |
| Milo | — | — | Proficient. "In a hurry" is already his 90 s budget |
| Vera | 2 | 1.5 | Little practice with interfaces: decides at half the norm's speed, moves at two thirds of it |
| Zoya | 3 | 2 | The far end of the scale |

**Budgets are unchanged.** At these paces a click step costs Ada about 2.2 s, Vera about 4 s and Zoya about 5.8 s. So Ada's 120 s cover about 53 steps, Vera's about 29, Zoya's 180 s about 30. Under a step cap of 20 the clock ends no walk of clicks and scrolls; only long waits (`MAX_WAIT_MS` is 10 s) or long typed text could. Under io's longer caps (up to 40) it ends Vera's and Zoya's long walks. On a short goal the step cap, not the clock, ends what the wall clock used to end. That is the point: those endings were the machine's. Retuning folk budgets until the clock bites would invent behaviour for the demo, so this spec does not do it, and RULES says it outright.

### Core: the record, in `packages/core/src/run.ts`

- `simulatedMs: z.number().int().nonnegative().optional()` on:
  - **events:** `actionPlanned`, the step's time, decided once its action is planned; and `stepWasted`, the step's M. Optional only for runs recorded before s2-09: the loop always sends it.
  - **stored steps:** `stepBase`, so a complete, wasted or planned-incomplete step carries it. An incomplete step that planned nothing has none.
  - **`RunResult`:** the run's simulated time, which the fold sums from its steps. It is absent when no step has one: a run stored before s2-09, or one that crashed before its first plan.
- `durationMs` stays the wall clock, as evidence, and its docstrings say so. B3's docstrings (`RUN_LIMITS`, `DICE_RULES`) say the clock is simulated. `limit: "clock"` keeps its value and now means the simulated clock; the `RUN_LIMITS` docstring says that a run with no `simulatedMs` was ended by the wall clock, as every run before s2-09 was.
- No refine ties the run's total to its steps. The fold is the record's one producer and its test pins the sum; a refine would make every fixture builder (web's `fixture-runs.ts` varies durations per row) spread a total over steps.

### Core: the report, in `packages/core/src/report.ts`

`PersonaResult` gains `medianSimulatedMs: z.number().nonnegative().nullable().optional()`: the median `simulatedMs` over the successful runs, `null` when there is none or any one of them carries no time (since the PR review; it first took the median over the timed ones alone). It is absent on a report stored before s2-09. The refine adds: it is `null` when there is no success. `medianSuccessMs` stays, unchanged, the wall-clock median. A stored report keeps its meaning, and no screen reads that median any more.

### Agent: `packages/agent/src/simulated-time.ts`, new, pure

```ts
/** KLM and Fitts constants, as RULES' B3 table gives them, ms; private to the module. */
const MENTAL_MS = 1350, PRESS_MS = 100, KEYSTROKE_MS = 280;
const FITTS_INTERCEPT_MS = -107, FITTS_SLOPE_MS_PER_BIT = 223;

/** Fitts's MT in its Shannon form, floored at 0. Unrounded. */
export function movementMs(distancePx: number, widthPx: number): number;

/** The persona's two factors, 1 where the profile sets none. */
export interface Pace { thinking: number; motor: number }
export function paceOf(behaviour: Pick<Behaviour, "thinkingTime" | "motorTime">): Pace;

/** A wasted step's time: one M. */
export function wastedStepMs(pace: Pace): number;

/**
 * A planned step's time, and where the cursor stands after it. `page` is the step's evidence
 * (`FullObservation`), `from` the cursor's last point, or undefined before the first press.
 */
export function plannedStepMs(step: {
  proposed: Action; performed: Action; page: FullObservation; from: Point | undefined; pace: Pace;
}): { ms: number; cursor: Point | undefined };
```

It imports `actionPoint` from `act.ts`, as `misclick.ts` does. `act.ts` exports `Point`, the viewport point `actionPoint` returns, and `misclick.ts` drops its private alias for it. A ref the evidence lacks throws a plain `Error`, since only a bug gets one there.

### Agent: the loop, `packages/agent/src/actor-loop.ts`

- `walk` keeps the run's simulated total and the cursor's point. `ask` emits `stepWasted` with `wastedStepMs`, and the loop adds it. A planned step emits `actionPlanned` with `plannedStepMs`'s `ms`, then adds it, then checks B3. A step whose time takes the run past `budgetSeconds × 1000` stays planned and is never performed, as today. So a success always lands inside the budget. The end-of-step check stays for wasted steps.
- `overBudget` reads the simulated total. `now` stamps events and `durationMs` and decides nothing, and its docstring says so. `ranOut`'s log line gives both clocks.
- **No wall-clock safety cap.** The step cap bounds a run's steps, and every wait inside a step has its own bound: `settle`'s deadline, `ACTION_TIMEOUT_MS`, Jev's 30 s `decide`, and, since the PR review, the LLM Actor's own 60 s per model call (`llm-actor.ts`). Before that, the Actor's calls took the adapter's 300 s, sized for the Analyst, and only the wall-clock B3 cut a slow model short. A timed-out call is not retried and ends the run `error`. A wall cap would be one more ending a seed does not reproduce.
- Comments that call B3 wall-clock change: `cursor.ts` `CURSOR_HOLD_MS` and `scout.ts` `SCOUT_PROFILE`, which keeps its 3600 s.
- **The two CLIs that print a run's time.**
  - `run-one.ts`'s summary prints both clocks, "simulated" and "wall".
  - `calibration.ts`'s `endOf` docstring and its `clock` column say what the clock is. A run with `simulatedMs` was ended by the simulated clock. One without was ended by the wall clock, s2-10's.

### io

- **`analyst-runs.ts`.** `personaResults` sets `medianSimulatedMs` from the successful runs' `simulatedMs`.
- **The Analyst's text** (`analyst-digest.ts`, `analyst-text.ts`, `analyst-prompt.md`):
  - The persona line reads "median simulated time to success".
  - The run header gives the run's simulated seconds, "simulated", or "—" without one.
  - The prompt says the seconds are simulated persona time, not how long the tool took.
- **`test-app.ts`.** Its stored-run builder takes `simulatedMs`.
- Runs are stored as their whole `RunResult` document (`db/schema.ts`), so the new field needs no migration. The `duration_ms` column stays the wall clock.

### web: every time on screen names its clock

| Where | Reads | Label |
|---|---|---|
| Race lane clock (`race.ts` `runView`, live) | the sum of `simulatedMs` on the run's `actionPlanned` and `stepWasted` events so far; "—" until the first of them, as a stored run with no timed step reads | The Race shows one caption, "Simulated time: each step's cost from the KLM and Fitts's law, not the wall clock", and each clock has an `aria-label` "simulated time …" |
| Race finish order (F6 AC3) | the same | sr-only heading "Finish order, by simulated time" |
| Stored lane (`storedLane`) | `run.simulatedMs` | as above; "—" without it |
| Report cast table (F7 AC2) | `medianSimulatedMs` | Header "median simulated time"; "—" with "no run got through" for no success, or "not timed: runs stored before simulated time" for a success with no time |
| Runs list | `run.simulatedMs` | Column "simulated"; "—" without it |
| Run detail header | both | Facts "simulated" and "wall clock" in place of "duration" |
| Events screen (`screens/events.tsx`) | `durationMs` | "after N ms wall clock" |
| Cast, the Patience row (`cast/dimensions.ts`) | `budgetSeconds` alone, as on main | Cut after the PR review (decision log): the pace stays in RULES' persona table, with its provenance |

The fixtures behind these screens and their tests carry the new fields: web's `demo-race.ts`, `fixture-race.ts` and `fixture-runs.ts`, and core's `run-events.json`, `run-result.json` and `reports.json`. Core's `race.json` holds no events and no times, so it does not change. `seed:demo --fake` runs the real loop, so its data carries simulated time with no change.

### docs/PLAN.md

- **A12:** the simulated clock is done, B3 included.
- **F5 AC5:** the budget is simulated, so the same run seed and answers reproduce a run ended on the clock as they reproduce a capped one.
- **F6 AC3, F7 AC2:** both read the simulated clock, and the screen says so.

## Files

- `docs/RULES.md`: the B3 row and a "B3 in detail" section with the model, its sources, the worked example and what it gets wrong. Also the B4 row's time penalty, the persona table's Behaviour column, and the registry (`klm`, `fitts`).
- `docs/PLAN.md`: A12, F5 AC5, F6 AC3, F7 AC2.
- `docs/adr/0001-jev-actor-backend.md` and `docs/adr/0003-any-target.md`: a dated note each. **Not in the task's list.** ADR 0001's consequence "B3 is wall-clock and counts model latency … Budgets and time-based results are compared within one backend only" no longer holds. ADR 0003 D4's reason "the wait would spend the persona's budget (B3)" no longer holds either, though the decision stands: waiting cannot end an endless animation. `AGENTS.md` asks for the matching ADR to be read before changing what it covers; the note keeps it true.
- `packages/core/src/primitives.ts`: `klm`. Its test ties the registry to RULES as it stands. **Not in the task's list.** It is the code copy of RULES' registry, and the KLM is a source the task requires.
- `packages/core/src/profile.ts` and its test: `TimeFactor`, the two knobs, `budgetSeconds`'s docstring.
- `packages/core/src/fixtures/profiles/vera.yaml`, `zoya.yaml`: their knobs.
- `packages/core/src/run.ts` and its test: `simulatedMs` on the two events, the steps and the result; the fold; docstrings.
- `packages/core/src/report.ts` and its test: `medianSimulatedMs`. **Not in the task's list.** F7 AC2 has to read the chosen clock, and a new field keeps stored reports honest.
- `packages/core/src/fixtures/run-events.json`, `run-result.json`, `race.json`, `reports.json`: the new fields ("New shape, new fixture, same PR").
- `packages/agent/src/simulated-time.ts`, new, and its test.
- `packages/agent/src/actor-loop.ts` and `actor-loop.browser.test.ts`: the clock and B3.
- `packages/agent/src/act.ts`, `misclick.ts`: `Point` exported from `act.ts`, `misclick.ts`'s alias dropped.
- `packages/agent/src/cursor.ts`, `scout.ts`: comments.
- `packages/agent/src/run-one.ts`, `calibration.ts`: the run summary prints both clocks; `endOf`'s docstring and the `clock` column say which clock ended a run.
- `packages/io/src/analyst-runs.ts`, `analyst-digest.ts`, `analyst-text.ts`, `analyst-prompt.md`, `test-app.ts`, and their tests.
- `packages/web/src/arena/race.ts`, `race-view.tsx`, `demo-race.ts`, `fixture-race.ts`; `components/race-lane.tsx`; `report/cast-table.tsx`; `screens/runs.tsx`, `run-detail.tsx`, `events.tsx`; `runs/fixture-runs.ts`; and their tests.

## Acceptance mapping

| Acceptance box | Proven by |
|---|---|
| `pnpm --filter @wayford/agent test` and `pnpm --filter @wayford/core test` pass | both commands |
| A unit test pins the movement time for given travel and width against the formula in RULES | `simulated-time.test.ts` "movementMs matches RULES' worked examples": the pairs above, computed in Python, to 1e-9, plus the 2245 and 4043 ms steps |
| Same seed and answers twice, under fake wall clocks running at different speeds: identical simulated times and the same outcome | `actor-loop.browser.test.ts` "simulated time does not read the wall clock": one fake answer list, `now` advancing 1 ms per read, then 60 s per read. Equal `simulatedMs` per step and per run, equal outcome. Under the old code the 60 s clock ends the second run on step 0 |
| With the same answers, a persona whose knobs make it slower ends `budget_exceeded` on a run that Ada's knobs finish | `actor-loop.browser.test.ts` "a slower pace runs out where Ada's finishes": Ada's knobs reach the easy goal; her total sets a budget, in whole seconds, that she meets. The same profile with `thinkingTime` 3 ends `budget_exceeded`, `limit: "clock"`, the step left planned |
| The persona fixtures validate with their new knobs, each with its source or `folk` | `profile.test.ts`: every fixture parses; Vera's and Zoya's knobs carry `folk`; a knob without provenance fails |
| `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root | the three commands |

## Decision log

| Question | Taken | Why |
|---|---|---|
| What a step costs | KLM operators per action, P from Fitts's law | The task names both. The KLM gives each action its operators, and Fitts makes P depend on the step's geometry. |
| Which Fitts constants | MacKenzie, Sellen and Buxton 1991, mouse pointing: `a = −107` ms, `b = 223` ms/bit, MT floored at 0 | A published Shannon-form fit, read off the paper (yorku.ca/mack/CHI91.html), from the author of the formulation the task names. The KLM's own P (Card, English, Burr 1978) is in Welford's form, which the task does not use. |
| How many M a step gets | One, every step, a wasted one included | A step is one look and one decision. The KLM's placement heuristics need a task analysis no run has. |
| Where the movement aims after a fired B4 | At the proposed target; the cursor ends on the neighbour | The hand aims at what the persona chose. The next move starts where the press landed. |
| The first point | The centre of the first viewport | Neutral, deterministic, `folk`. |
| `W` without `targetPx` | The box's smaller side, at least 1 px | A text block is clickable and has a box. |
| Typing | K per character at 0.28 s, unscaled, for every persona | Typing speed is out of scope, so no persona types at its own speed. Free text would understate, so one norm keystroke rate stands in. |
| Scroll and back | One K each | Our scroll is a page at once, like Page Down. Back is a keystroke. Both are `folk` uses of a sourced operator. |
| Jitter | None | The task allows none. Determinism comes for free, and no dice log changes. |
| Rounding | Per step, to a whole ms | Integers in the record, as `durationMs`; B3 compares integers. |
| How the knobs carry provenance | Two `{ factor, provenance }` knobs, `thinkingTime` and `motorTime`; absent is 1 | The shape mirrors a threshold. Thinking and moving are separate capabilities in the persona model. Absent means the norm, as an absent threshold means no gate. |
| Persona values | Vera 2 and 1.5, Zoya 3 and 2, all `folk`; Ada, Kai and Milo absent | No source gives a persona's pace. Kai keeps "differs only after perception". |
| Budgets | Unchanged | Folk numbers tuned until the clock bites would be invented behaviour. RULES says the clock rarely ends a short goal now. |
| Wall-clock cap | None | Every wait in a step is bounded and the step cap bounds the steps. A wall cap would be an ending no seed reproduces. |
| The Actor's model calls (PR review) | Their own 60 s per attempt in `llmActor`; Jev's `decide` keeps its 30 s | The adapter's default, 300 s, was sized for the Analyst, and with B3 off the wall clock a model answering just under it could hold a run for hours. Calibration measured about 2.6 to 3.4 s of model time per step, so 60 s is about twenty times that; Scout, at `max`, took about a minute for six attempts. A wall cap ending `error` was the other option; the per-call bound fixes the cause. |
| Where the step's time is recorded | `simulatedMs` on `actionPlanned` and `stepWasted`, on the stored step, and summed on `RunResult` | Known once the action is planned, where B3 decides. The live race sums the events. |
| A refine tying the total to its steps | No | The fold is the only producer and is tested. Fixture builders keep varying the total freely. |
| Which clock the screens read | Simulated for the Race, the Report and Runs; both in run detail; wall in the events log | The comparison is between personas, so it reads the persona's clock. Wall time measures the model and the machine, and stays as evidence. |
| The report's median | New `medianSimulatedMs`; `medianSuccessMs` stays the wall-clock median | A stored report keeps its meaning, and no screen shows a wall median under a "simulated" label. |
| The Cast | No new row; the Patience reading adds the pace when a persona sets one | The knobs decide B3 endings and carry provenance, so some screen must show them. One line in an existing reading does it, without a new matrix row. |
| Where the Cast shows the pace (build) | On the CastCard only, beside the budget, as softness is; the matrix keeps "120 s" | In the matrix's 186 px cell "120 s, ×2 decide, ×1.5 move" wrapped, and the Cast scrolled 19 px at 1280 × 720 where it fit before. |
| The Cast's pace (PR review) | Cut; the Cast reads `budgetSeconds` alone, as on main | Outside the task's web scope, which is the clock's label on screen. The card showed `folk` factors with no tag beside thresholds that carry one. RULES' persona table names the knobs with their provenance. |
| `medianSimulatedMs` with some successes untimed (PR review) | `null` unless every success carries `simulatedMs` | A median over the timed ones alone could rest on one run of three, under a "got through 3/3". The cast table already reads null beside a success as "not timed". |
| The Race's caption (build) | "Simulated time from the KLM and Fitts's law, not the wall clock", under the goal strip's success line | The spec's 81 characters pass DESIGN's 68-character line. It keeps "simulated" and "not the wall clock". The ended race keeps 6 px to spare at 720. |
| The lane clock's label (build) | `role="timer"` with `aria-label="simulated time 0:16.5"`, its visible text unchanged | ARIA allows no `aria-label` on a plain span. A timer is not announced, so the page keeps one live region. |
| `runView`'s field (build) | `elapsedMs` renamed `simulatedMs` | It is no longer elapsed wall time. The rename stays inside `race.ts`, `race-view.tsx` and their tests. |
| The Analyst's run header (build) | "simulated time 12.3 s", label first | With no time it reads "simulated time —". "— simulated" would read as "not simulated". |
| A web fixture run with no simulated time (build) | `run_vera-hard-3` is stored without one | It stands for a run from before s2-09, so Runs and the Race keep their "—" case under test. |

## Risks

- **Outcomes move.** Runs the wall clock used to end now go to the step cap or succeed. On our pick, Kai's G2 and G3 runs would walk 20 steps, not 8: more wall time and more cost per run set. `seed:demo` data and the any-target rehearsal (`s4-08`) need a rerun after merge. The tables in `docs/DEMO.md` record passes already run and stay as they are.
- **Breadth.** The diff touches core contracts, RULES, the loop, the Analyst's text and five screens, three working days before the merge cutoff on Tuesday 2026-10-13. The task is first on the cut order, so it gets cut back, not widened. If the web half runs late, the label table can land as a smaller second commit, and run detail can show both clocks alone.
- **Screen tests.** The Race, Runs and Report tests pin texts and times from fixtures. Each fixture change ripples into their expectations.
- **Analyst output.** The prompt's wording changes. Fake-Analyst tests are unaffected, and the real one is not exercised in CI.

## Review note

Round 1 (spec-reviewer): ready after fixes, no blocking finding. It rechecked the constants and every worked example. Applied:

- **should:** typed characters are timed at the norm K, unscaled; scroll's and back's one K stays scaled.
- **should:** ADR 0001 and ADR 0003 get a dated note. `run-one.ts` and `calibration.ts` join the files.
- **nits:**
  - the `RUN_LIMITS` docstring names the clock of a run with no `simulatedMs`;
  - "no walk of clicks and scrolls", and 53 steps;
  - the `constraintCount` wording;
  - `race.json` is dropped from the fixtures;
  - the live clock reads "—" until the first timed event;
  - `Point` is exported from `act.ts`;
  - the Cast's Patience reading shows the pace;
  - 10 clock endings, not 11.

None was rejected.
