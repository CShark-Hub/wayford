# s2-04 — Scout: ground truth per task

Stream: s2
Milestone: week 3
Size: S
Depends on: s2-03. The real-key box runs after s1-04, so the ground truth covers the app as it will be demoed.

## Context

Read first, in this order:

- `AGENTS.md` section "Scout is mandatory"
- `docs/PLAN.md` F4
- `packages/agent/src/` after s2-03 — the loop Scout reuses
- `packages/core/src/task.ts` — a task and its success condition
- `packages/target-app/README.md` section "Goals" and `ROUTES` in `src/pages.ts` after s1-04 — the known routes

## Goal

For each task an unconstrained run records whether the goal is reachable, the path it took and the target element, so the report can tell "the feature is broken" from "the feature works but Vera could not find it".

## Interface

- In: `Task`
- Out: a `GroundTruth` schema and fixture in core (task id, reached or not, the shortest path as URLs and element keys, every successful attempt's path, the target element's key and page); `scout(task)` from `@wayford/agent`; one JSON file per task under `runs/ground-truth/`
- Files expected to change: `packages/agent/src/**`, new `packages/core/src/ground-truth.ts` with its test and fixture, `packages/core/src/fixtures/index.ts`, `packages/core/src/index.ts` (one line)

## Constraints

- Full vision: a profile with no thresholds, no caps, every pattern known, and no behaviour dice. Model role `scout`. Up to 3 attempts; the shortest successful one is the ground truth, and no success is a result too. Every successful attempt is kept with its path, so the report can say a route works even when it is not the shortest.
- Scout's model id goes on the `GroundTruth`, because a run records only the Actor's (`ModelIds` in `packages/core/src/run.ts`). If a Scout attempt goes through `runActor`, its `runStarted` would name Scout's model as `modelIds.actor`. Say in the PR which way it goes: Scout attempts emit no `runStarted`, or they are runs and the `ModelIds` comment changes to say so.
- Run it by hand when the target app changes. No cache and no DOM hash: we own the app and know when it changes.
- "The Actor has no access to Scout's output" (`AGENTS.md`). A test walks the imports from the Actor entry and fails if a Scout module or the ground-truth directory appears (F4 AC3).

## Acceptance

- [x] `pnpm --filter @wayford/core test` and `pnpm --filter @wayford/agent test` pass, and the ground-truth fixture validates. Core: 14 files and 341 tests. Agent: 19 files and 313 tests (s2-11 merged in). Loading the fixture parses it (`fixtures/index.ts`), `ground-truth.test.ts` "the fixture names a task fixture" checks its task, and each `GroundTruth` refine rejects a broken copy. `scout.browser.test.ts` also checks the fixture's attempts against a real scripted run, so its element keys are the ones `collect` gives.
- [x] With a scripted fake, Scout on the hard goal records the path `/`, `/deliveries`, `/deliveries/archive` and the "Order archive" key as the target. Test: `scout.browser.test.ts`, "keeps every success and takes route A as the ground truth". The fake answers by element name: attempt 1 takes route B in 3 steps, attempt 2 route A in 2, and attempt 3 gives up. `shortest` is attempt 2, with path `/`, `/deliveries` and `reachedUrl` `/deliveries/archive`, and the target is `main//link:Order archive` on `/deliveries`. Both successes are kept with their paths. All 6 calls go out on role `scout`, `modelId` is the scout model, the file on disk equals the return value, and each attempt is a run of `prof_scout` with run seeds 1 to 3 under `attempts/`. Two more tests. When no attempt reached the goal and none crashed (three give-ups), the result is written with `reached: false` and no `shortest` or `target`. When none reached it and one crashed (give up, give up, crash), the result is `scout_inconclusive` and no file is written. The tie rule (the earlier attempt wins) lives in one function, core's `groundTruthOf`, and `ground-truth.test.ts` pins it. Scout and the schema both call that function.
- [x] A probe import of the Scout module on the Actor path makes the import test fail; the output is in the PR and the probe is removed. Adding `import "./scout.js";` to `src/actor-loop.ts` turns `pnpm --filter @wayford/agent exec vitest run src/actor-isolation.test.ts` red (exit 1):

  ```
  FAIL  src/actor-isolation.test.ts > no module the Actor runs from reaches Scout or names ground truth (F4 AC3)
  AssertionError: from src/actor-loop.ts: expected [ Array(2) ] to deeply equal []
  +   "src/scout.ts: a Scout module",
  +   "src/scout.ts: names ground truth",
  ```

  With the probe removed it is green again (2 tests, exit 0). The guard starts from every module of the package that is not Scout's own, so `export * from "./scout.js";` added to the barrel `src/index.ts` turns it red too (`from src/index.ts`). The walker's own test keeps the same check permanent with in-memory probes: an import that leads to `./scout.js`, the subpath `@wayford/agent/scout`, a `runs/ground-truth` path reached through the barrel, and `GroundTruth` from core.
- [x] With a real key, Scout reaches both target-app goals and writes both files (output in the PR). `pnpm --filter @wayford/agent scout` on `openai/gpt-6-luna` (scout role, effort `max`), 2026-10-03, about a minute for both. Both goals were reached in 3 of 3 attempts. The easy goal's shortest path is 2 steps, and its target is "Delivery address" on `/deliveries`. The hard goal's shortest is route A in 2 steps, with the target "Order archive" on `/deliveries`. The third hard attempt detoured through `/account`, and it is kept as a success of 3 steps. Both files parse as `GroundTruth`. The whole run cost 0.0018 USD. In the output below, the `file` paths are shortened to the repository root, and the keys are printed unquoted: the run came before keys were quoted as JSON.

  ```
  task_next-parcel: you want to know where your next parcel is going
    attempt 1  run_01m40xwwdstnsy2q15rsm1m3xh
      success after 2 steps
    attempt 2  run_01m40xx5tj3hcv18hcp3f38zdr
      success after 2 steps
    attempt 3  run_01m40xxcja8gw98vny9n4rj0ft
      success after 2 steps

  task_next-parcel: reached in 3 of 3 attempts
    run_01m40xwwdstnsy2q15rsm1m3xh  success  / —click main//link:Go to deliveries→ /deliveries —click main//link:Delivery address→ /account/address
    run_01m40xx5tj3hcv18hcp3f38zdr  success  / —click main//link:Go to deliveries→ /deliveries —click main//link:Delivery address→ /account/address
    run_01m40xxcja8gw98vny9n4rj0ft  success  / —click main//link:Go to deliveries→ /deliveries —click main//link:Delivery address→ /account/address
  shortest  run_01m40xwwdstnsy2q15rsm1m3xh (2 steps)
  target    main//link:Delivery address on /deliveries
  model     openai/gpt-6-luna
  cost      0.000815 USD
  file      runs/ground-truth/task_next-parcel.json

  task_past-order: you want to see what you ordered three months ago
    attempt 1  run_01m40xxn6n35j401eb14tdaget
      success after 2 steps
    attempt 2  run_01m40xxy5n1jw40dzvafqbhaz3
      success after 2 steps
    attempt 3  run_01m40xy5chy2gpvjr43fvb66ha
      success after 3 steps

  task_past-order: reached in 3 of 3 attempts
    run_01m40xxn6n35j401eb14tdaget  success  / —click banner/navigation:Main//link:Deliveries→ /deliveries —click main//link:Order archive→ /deliveries/archive
    run_01m40xxy5n1jw40dzvafqbhaz3  success  / —click main//link:Go to deliveries→ /deliveries —click main//link:Order archive→ /deliveries/archive
    run_01m40xy5chy2gpvjr43fvb66ha  success  / —click banner/navigation:Main//link:Your account→ /account —click banner/navigation:Main//link:Deliveries→ /deliveries —click main//link:Order archive→ /deliveries/archive
  shortest  run_01m40xxn6n35j401eb14tdaget (2 steps)
  target    main//link:Order archive on /deliveries
  model     openai/gpt-6-luna
  cost      0.001008 USD
  file      runs/ground-truth/task_past-order.json
  exit 0
  ```
- [x] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root: 230 files clean, typecheck clean, 83 test files and 1286 tests, on the branch with main merged in (s1-03 and s2-11 included).

## Out of scope

- Using ground truth in the report, and calling Scout from the runs API. Week 4, with the Analyst.
- Caching, invalidation, a database table.

## Notes for the reviewer

- If a real Scout run fails, the fallback is a hand-written ground-truth file per task: both routes are in `packages/target-app/README.md`. Do not let Scout block anything else.
- Lint does not guard F4 AC3: the Biome rules in `biome.json` work per package and see direct imports only (`docs/STACK.md`, "Package import rules"), so the import-walking test is the guard.

## Outcome

Built as `docs/specs/2026-10-03-s2-04-scout.md` says. Its decision log has every choice. What a reader of this file should know:

- **Scout ships as `@wayford/agent/scout`**, as the fake adapter ships as `./fake`, and not in the barrel. io's runs import `runActor` from `@wayford/agent`, so a barrel export would load Scout wherever the Actor runs. The task's "from `@wayford/agent`" is kept as a subpath. The change came from the branch review.
- **Scout attempts are runs.** Each attempt is `runActor` with Scout's own full-vision profile, `prof_scout`, and `llmActor({ role: "scout" })`. So it emits `runStarted` with Scout's model as `modelIds.actor`, and the `ModelIds` comment in `packages/core/src/run.ts` says so. `GroundTruth.modelId` repeats the model.
- **All Scout output sits in one directory.** That is `runs/ground-truth/<task id>.json`, plus each attempt's run folder under `runs/ground-truth/attempts/`. It is gitignored like every run. Run it with `pnpm --filter @wayford/agent scout`.
- **Every attempt runs.** There are three, seeds 1 to 3. The shortest is the fewest actions that ran, and the earlier attempt wins a tie. When no attempt reached the goal and one crashed, Scout throws `scout_inconclusive` and writes no file, and the schema refuses such a file too.
- **A hand-written fallback file** says `modelId: "hand"`, and its run ids are `run_hand-*` (doc comment in `packages/core/src/ground-truth.ts`).
- **The F4 AC3 guard** is `packages/agent/src/actor-isolation.test.ts`. It walks from every module of the package that is not Scout's own, the barrel included. It follows relative imports, and the package's own name through its `exports`.
- **For s2-10.** `actorSampling` must take the temperature from the backend's role (`settings.roles[role]`), not from `settings.roles.actor`. Otherwise a Scout attempt records the Actor's temperature beside Scout's model.
