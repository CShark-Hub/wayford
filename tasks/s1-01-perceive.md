# s1-01 — Perceive: the page measurement, thresholds, soft bands and the seed

Stream: s1
Milestone: week 2
Size: L
Depends on: issue #16 (every decision on an element), PR #71 (`rng` and `hash` in core, from issue #26; merged)

## Context

Read first, in this order:

- `AGENTS.md` sections "Untouchable core", "Persona is a filter, not a prompt" and "Randomness follows three different rules"
- `docs/RULES.md` sections "The pipeline" and "Thresholds, bands and the roll", stages 1 to 3, and the calibration table
- `docs/PLAN.md` section "Filter internals", F2 AC3 and assumption A20
- `packages/core/src/observation.ts` after issue #16, and the core random module from PR #71
- `packages/target-app/README.md` — the `/deliveries` page the new fixture describes

## Goal

The filter's input exists as a core schema with a fixture, and a pure function turns that `PageMeasurement`, a `Profile` and a run seed into the step's `FullObservation`, so the Actor, the preview and the sweep all get their observation from one piece of code.

## Interface

- In: `Profile`, `Seed`, `FullObservation` and the random functions from `@wayford/core`
- Out:
  - `PageMeasurement` and `MeasuredElement` from `@wayford/core`, and `measurementFixture` from `@wayford/core/fixtures`
  - `perceive(measurement, profile, seed): FullObservation`, exported from `@wayford/filter` and from the browser-safe entry `@wayford/filter/perceive`
- Files expected to change: new `packages/core/src/measurement.ts` and its test, new `packages/core/src/fixtures/measurement.json`, `packages/core/src/fixtures/index.ts`, `packages/core/src/index.ts` (one line), `packages/filter/src/**`, `packages/filter/package.json` (the `./perceive` export)

## Constraints

- "Zero LLM in this layer" (`AGENTS.md`). No model, no network, no clock, no `Math.random`. Every random number comes from `hash` in core, keyed by the run seed and the element key.
- `PageMeasurement` is the collector's output before any decision:
  - Per element: key (`elementKey` from core), role, name, bbox, measured `Metrics`, and whether it is a control or a text block. P4 applies to controls only; text blocks are measured too (`docs/RULES.md`, issue #49).
  - Per page: URL, title, viewport, and where the viewport sits on the page, so V2 can be decided from the measurement alone. The schema says which coordinate space a bbox uses.
  - No threshold, state, ref or roll appears in it.
- `measurementFixture` is `/deliveries` of the target app at default parameters, with the app's real labels ("Order archive", "Your account") and its text blocks, measured by hand in a browser. s1-02 replaces the numbers with collector output; its doc comment says so.
- The `./perceive` entry reaches nothing but its own modules and `@wayford/core`: no Node built-in, no Playwright. The web preview (s3-01) runs it in the browser.
- Rules in scope: V2 (outside the viewport), P1 contrast, P3 font size, and P4 target size. Each follows `docs/RULES.md` exactly: `>=` passes, a hard cut never degrades, and the in-band roll and the worst-state combination work as written there. Where the document is silent, stop and ask in the PR rather than choose.
- Every rule an element fails is recorded as a decision with its measured value, threshold and roll, in the shape issue #16 gives `ObservedElement`. An element no rule touches carries no decision.
- Refs `e1..eN` follow measurement order over shown elements only, as `FullObservation` requires.
- A degraded element's masked name is a pure function of the seed, the key and the name: same inputs, same mask, at least one character masked, never all of them.
- Monotone: for a fixed seed, raising any threshold never makes any element more visible. The sweep in week 4 depends on it.
- One export line for the new module in core's `index.ts`, alphabetical. Never rewrite the file.

## Acceptance

- [ ] `pnpm --filter @wayford/core test` passes and includes `measurement.test.ts`, which validates `measurementFixture`
- [ ] `pnpm --filter @wayford/filter test` passes and includes `perceive.test.ts`, which runs without a browser
- [ ] Same measurement, profile and run seed twice give string-equal `renderObservationForModel(toActorObservation(...))`, for each of the four persona fixtures on `measurementFixture`
- [ ] Same measurement and run seed with only `profile.seed` changed give string-equal `renderObservationForModel(toActorObservation(...))`, for each of the four persona fixtures on `measurementFixture` at each run seed from 1 to 100 (A20)
- [ ] Ada on `measurementFixture`: every element inside the viewport is `visible`
- [ ] A profile with a hard contrast cut of 3.0: the "Order archive" link is absent from `toActorObservation(...)` and present in the evidence as `invisible` with a P1 decision
- [ ] Vera over seeds 1 to 1000: the "Order archive" link is `degraded` in a share within 0.05 of its band position, `(contrast − 1.5) / 1.5` for the fixture's measured contrast, and `invisible` in the rest
- [ ] Over seeds 1 to 200 and contrast thresholds 1.0 to 8.0 in steps of 0.25, no element's state ever improves as the threshold rises
- [ ] An element below the viewport is `invisible` with a V2 decision and counted in `belowFoldCount`
- [ ] A test walks the imports reachable from the `./perceive` entry and fails on anything that is not a relative module or `@wayford/core`
- [ ] `pnpm --filter @wayford/filter bench:perceive` prints the average over 100 calls on `measurementFixture`, under 5 ms on a developer laptop. A script, not a unit test, so shared CI runners cannot make it flaky
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root

## Out of scope

- Measuring a live page. That is s1-02.
- Knowledge, attention and memory rules (K1 to K4, A1 to A3, M1), P2, P5, P6 and colour-vision simulation. `s1-03` (a week 4 stretch) or later; leave them out rather than stub them.
- Behaviour dice (B1 to B4). They act on the Action, not the observation, and belong to the Actor loop.
- Any core change other than the new measurement module. If `Observation` or the random functions miss something, stop and report: the fix belongs in an issue.

## Notes for the reviewer

- Two reviewers: the task adds to the filter contract. One should be whoever picks up s1-02 or s3-01, which build on it next.
- This is the untouchable core. Read the soft-band code against `docs/RULES.md` line by line.
- Check the monotonicity test really sweeps the threshold and not the seed.
