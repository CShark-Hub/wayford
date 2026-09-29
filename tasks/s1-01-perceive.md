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
- A degraded element's masked name is a pure function of the run seed, the key and the name: same inputs, same mask, at least one character masked, never all of them. The share masked is its own draw, `hash(run seed, key + ":mask")`, never the element's `rolled` (`docs/RULES.md`, "The mask").
- Monotone per perception rule: for a fixed run seed, raising any threshold never gives any element a better state under that rule (`docs/RULES.md`, "Monotone per perception rule"). It does not hold for the final state once the attention caps of `s1-03` are on, which is why the threshold-sweep test below runs without them. The sweep in week 4 relies on the bound in the RULES calibration row "Sweep on contrast".
- One export line for the new module in core's `index.ts`, alphabetical. Never rewrite the file.

## Acceptance

- [x] `pnpm --filter @wayford/core test` passes and includes `measurement.test.ts`, which validates `measurementFixture`. 12 files and 304 tests pass. `measurement.test.ts` holds 14 of them. Its first, "measurementFixture validates against PageMeasurement", parses the fixture; the others pin the 19 keys to `elementKey` and reject decision fields, `targetPx` on a text block, and a key that drifts from its role and name.
- [x] `pnpm --filter @wayford/filter test` passes and includes `perceive.test.ts`, which runs without a browser. 4 files and 52 tests pass. `perceive.test.ts` imports no Playwright and reads the fixtures from `@wayford/core/fixtures`; it runs in about 0.6 s.
- [x] Same measurement, profile and run seed twice give string-equal `renderObservationForModel(toActorObservation(...))`, for each of the four persona fixtures on `measurementFixture`. The test "same measurement, profile and run seed give the same Actor text" makes two separate calls per persona at run seeds 1 to 100. It also compares the evidence JSON byte for byte.
- [x] Same measurement and run seed with only `profile.seed` changed give string-equal `renderObservationForModel(toActorObservation(...))`, for each of the four persona fixtures on `measurementFixture` at each run seed from 1 to 100 (A20). Covered by "the profile seed never changes the Actor text (A20)", with profile seeds 0, seed + 1 and 2^32 − 1. It also checks that the run seed does change Vera's text, so the comparison is not vacuous. `perceive` takes `Pick<Profile, "perception">`, so the type already keeps the profile seed out.
- [x] Ada on `measurementFixture`: every element inside the viewport is `visible`. Covered by "Ada sees every element inside the viewport": all 19 elements are visible with no decisions, refs run `e1` to `e19`, and both counts are 0.
- [x] A profile with a hard contrast cut of 3.0: the "Order archive" link is absent from `toActorObservation(...)` and present in the evidence as `invisible` with a P1 decision. Covered by "a hard contrast cut of 3.0 removes Order archive". The link is missing from the Actor text. Its evidence decisions are exactly one P1 decision, value 2.006 against threshold 3, `invisible` and with no roll.
- [x] Vera, on her full fixture profile, over seeds 1 to 1000: the "Order archive" link is `degraded` in a share within 0.05 of its band position, `(contrast − 1.5) / 1.5` for the fixture's measured contrast, and `invisible` in the rest. Covered by "Vera sees Order archive degraded at its band position". The link is degraded in 347 of 1000 seeds (0.347) against a band position of 0.3373, and invisible in the other 653. Every degraded seed has `rolled < position` and every invisible one `rolled >= position`.
- [x] Vera over seeds 1 to 1000, on every seed where the "Order archive" link is `degraded`: the same run seed gives the same `maskedName`, between 1 and length − 1 of its characters are masked, and the masked count reads the mask draw `hash(run seed, key + ":mask")`, not `rolled`: its correlation with `rolled` over those seeds is within 0.2 of zero. Covered by "the mask reads its own draw, not the roll", on her full fixture profile. On each of the 347 degraded seeds it perceives twice and gets the same `maskedName`, and the masked count is `1 + floor(hash(run seed, key + ":mask") × (n − 1))`, between 1 and n − 1. The correlation with `rolled` is r = 0.054. The Actor text carries the mask, never the name.
- [x] Over seeds 1 to 200 and contrast thresholds 1.0 to 8.0 in steps of 0.25, no element's state ever improves as the threshold rises, on Vera's profile with `maxElements` and `maxOptions` unset, so the test means the same after `s1-03` adds the attention caps. Covered by "raising the contrast threshold never improves a state". The loop is run seed outer, threshold inner. Each element's state is compared with its state at the previous threshold for the same seed, so only the threshold moves. Her softness is held at 0.5, and it asserts that some state does change. The font and target thresholds get the same sweep, hard and soft, over seeds 1 to 50.
- [x] An element below the viewport is `invisible` with a V2 decision and counted in `belowFoldCount`. Covered by "an element below the viewport is cut by V2 and counted". At viewport height 600, "Order archive" gets V2 `below`, `belowFoldCount` 1 and the text "1 more below, scroll to see them". For Vera it also keeps its P1 decision, after V2. A box starting exactly at the viewport's bottom edge counts as below, and a zero-height box at 0 as inside. "an element above the viewport is cut by V2 and not counted" covers the other side: scrolled 50 px, only the brand link is above.
- [x] A test walks the imports reachable from the `./perceive` entry and fails on anything that is not a relative module or `@wayford/core`. This is `perceive-imports.test.ts`, which starts from `package.json`'s `./perceive` target.
  - Its walker is also run on in-memory sources and flags `node:fs`, `@wayford/core/fixtures`, `playwright`, `zod`, `export * from "fs"`, dynamic imports and missing files.
  - With `import "node:fs";` added to `mask.ts`, the test failed with `src/mask.ts: node:fs`.
  - `tsconfig.perceive.json` also type-checks the entry with no Node or DOM types, and it caught the same line.
- [x] `pnpm --filter @wayford/filter bench:perceive` prints the average over 100 calls on `measurementFixture`, under 5 ms on a developer laptop. A script, not a unit test, so shared CI runners cannot make it flaky. On the Windows laptop this was built on it printed `perceive on measurementFixture: 100 calls, average 0.037 ms (budget 5 ms, within), 1313 elements shown`, and 0.049 to 0.056 ms on other runs.
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root. Biome checked 107 files. Every package typechecks, filter as two programs. 31 files and 527 tests pass.

## Out of scope

- Measuring a live page. That is s1-02.
- Knowledge, attention and memory rules (K1 to K4, A1 to A3, M1), P2, P5, P6 and colour-vision simulation. `s1-03` (a week 4 stretch) or later; leave them out rather than stub them.
- Behaviour dice (B1 to B4). They act on the Action, not the observation, and belong to the Actor loop.
- Any core change other than the new measurement module. If `Observation` or the random functions miss something, stop and report: the fix belongs in an issue.

## Notes for the reviewer

- Two reviewers: the task adds to the filter contract. One should be whoever picks up s1-02 or s3-01, which build on it next.
- This is the untouchable core. Read the soft-band code against `docs/RULES.md` line by line.
- Check the monotonicity test really sweeps the threshold and not the seed.
- Check the mask share reads its own draw, `hash(run seed, key + ":mask")`, and not the element's `rolled`.

## Outcome

What shipped, for the next reader. The design and every decision are in `docs/specs/2026-09-29-s1-01-perceive.md`.

- **`PageMeasurement`** (`packages/core/src/measurement.ts`).
  - The page holds `url`, `title`, `viewport` and `scroll`. Each element holds `key`, `kind` (`control` or `text`), `role`, `name`, `bbox` and `metrics`.
  - It is strict, so a threshold, state, ref or roll fails to parse. A text block cannot carry `targetPx`, and a key has to end in `//role:name`.
- **Boxes are in viewport coordinates**, as `getBoundingClientRect()` and Playwright's `boundingBox()` give them. The task left the choice to the schema.
  - The Actor's `at x,y` then agrees with its `Viewport` line after a scroll.
  - Page coordinates would show it y values past its viewport, with no scroll in the `Observation` header to relate them to.
  - V2 needs only `bbox` and `viewport`. `scroll` records where on the page the measurement was taken, but `FullObservation` has no field for it, so a stored step does not keep it (Follow-ups).
- **`measurementFixture`** is `/deliveries` at the app's defaults, 1280 × 720, measured by hand in Playwright's Chromium: 19 elements, "Order archive" at 2.006:1, 16 px, 36 px. Not measured:
  - the hidden Menu button;
  - the footer's bare text;
  - the two `label`s. A label has no ARIA role to key on, so each checkbox carries its label's text contrast and font size instead. **This deviates from `docs/RULES.md` "What is measured"**; see #117.
- **`perceive(measurement, profile, runSeed)`** from `@wayford/filter` and `@wayford/filter/perceive`. It applies V2, then P1, P3 and P4 on every element, V2-cut ones included, since "every rule an element fails is recorded".
  - One roll per element, `hash(run seed, key)`, drawn only when a soft rule fails and stored on every soft decision, below the floor too.
  - `stepIndex` is 0. The Actor loop stamps its step on the result, and `runResultFromEvents` rejects an observation left unstamped.
  - `hiddenCount` is 0 until `s1-03`.
  - The profile parameter is `Pick<Profile, "perception">`.
  - A run seed outside `Seed` throws `RangeError` whatever the profile.
- **The mask** follows PR #112's "The mask": the share masked is its own draw, `hash(run seed, key + ":mask")`, never `rolled`.
  - `1 + floor(share × (n − 1))` of the `n` non-space characters are masked, each one becoming `▒`. The positions are the lowest `hash(run seed, key + ":mask:" + i)`.
  - A one-character name is masked whole, and an empty name stays as it is.
  - Over Vera's 347 degraded seeds out of 1 to 1000, the masked count reads that draw, and its correlation with `rolled` is r = 0.054. That is PR #112's extra box, met before the PR merges.
- **PR #113** asks the threshold sweep to run on Vera with the attention caps unset, and the Vera share test on her full profile. Both tests already do that.
- **Browser safety has two halves**: the import walk, and `tsconfig.perceive.json`, which type-checks the entry with no Node or DOM types. Filter's main `tsconfig.json` gets Node types, because its tests and the bench read `@wayford/core/fixtures`.
- **Files beyond the list above:**
  - `packages/filter/src/band.ts` and `mask.ts`, with their tests;
  - `packages/filter/scripts/bench-perceive.ts`;
  - `packages/filter/tsconfig.json` and `tsconfig.perceive.json`;
  - `pnpm-lock.yaml`, because filter now declares `@types/node` and `tsx`, which the workspace already used;
  - the placeholder `measuredMetrics` and its test are removed.

## Follow-ups

None block this task.

- **V2 on the horizontal is #116.** RULES says "intersecting the viewport", but `ViewportDecision.side` is only `above` or `below`, so `perceive` checks the vertical only. An element beside the viewport stays shown.
- **Labels are #117.** RULES lists labels as text blocks (issue #49 decided that), but a `<label>` has no ARIA role for `AriaRole` or `getByRole`, a contract gap like #116. `s1-02` or a RULES change decides whether label text rides on the control it names, as here, or gets a role of its own. Riding on the control has a cost `s1-02` should weigh: a checkbox disappears when its label's text fails P1 or P3.
- **`belowFoldCount` can count what perception removed: #118.** An element below the viewport that also fails a perception rule is counted in "N more below", as RULES:43 and `FullObservation`'s own check require. Zoya at a 600 px viewport is told "1 more below", and it is "Order archive", which she cannot see anyway. That contradicts `observation.ts:300-302`, "What perception removed (P1 to P4) is counted nowhere the Actor can see". The two documents need one answer before `s2-02` connects the Actor.
- **A stored step loses the scroll offset: #119.** `perceive` reads `PageMeasurement.scroll` for nothing, and `FullObservation` has no field for it, so after a scroll a stored step's boxes cannot be placed on the page. It matters to run replay (`s3-04`) and the live preview (`s3-05`).
- **For `s1-02`:**
  - A `paragraph` or `listitem` has no accessible name from its content, so `getByRole(role, { name })` cannot find one by its text.
  - The fixture measures a nav `li` and its link as two elements with the same text, as RULES asks, so the Actor reads "Home" twice.
- **Masking below two characters.** "At least one, never all" cannot both hold for a one-character name. It is masked whole; RULES can say otherwise.
- **Merge order.** PRs #112 and #113 edit the Acceptance lines ticked here, so whichever merges second resolves a small conflict in this file.
