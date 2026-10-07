# s4-10 — Scout over HTTP and the sweep CLI on any stored task: spec

Task: `tasks/s4-10-scout-sweep-any-task.md` · Branch: `feature/s4-10-scout-sweep-any-task` · Date: 2026-10-07
Status: approved 2026-10-07 (auto)

## Goal

io can Scout any stored task over HTTP, so the Target screen (`s3-15`) can start it, and the sweep CLI runs on a stored foreign task without building the target app. A report on such a task opens with its Scout line.

## Constraints that bind

- `AGENTS.md`: "The Actor has no access to Scout's output." Ground truth goes to the folder the Analyst reads (`readGroundTruth(groundTruthDir, task.id)`) and nowhere a run reads. In io, the runner, the routes and the barrel never load agent's Scout: `server.ts` hands its `ScoutFn` in.
- ADR 0003 D2: whoever serves the app decides whether a task is on it, by origin with the port included. io decides by its configured `targetAppOrigin`, as the runner does today. D3: Scout runs for a foreign task, so the report keeps its Scout line. D9: off the target app every run is on the LLM, and io refuses Jev, whether the request names it or the default resolves to it.
- PLAN F9: the sweep keeps its rules. One capability axis and never a site parameter, softness fixed for the whole sweep, and the same seeds at every value. `runSweep` and `sweepPlan` are unchanged.
- The task: one Scout per task at a time, and a second `POST` while one runs answers 202 with the running one. The target app is never served twice, since `pnpm dev` holds 5174.
- `docs/STACK.md` import rules: agent never imports io. Routes load neither agent's runtime nor Playwright, so agent is imported as types only and the Scout function is handed in, as `measure` is.
- Out of scope: starting a sweep over HTTP; route tables, route-open numbers and closures for any task but the hard goal; cancelling Scout, a run or a sweep; the Target screen.
- No new dependency.

## Design

### agent: `scout.ts` takes a run function, not a browser

```ts
/** `runActor` without the browser, which belongs to whoever built the function. */
export type ScoutRunFn = (options: Omit<RunActorOptions, "browser">) => Promise<RunResult>;

export interface ScoutOptions {
  run: ScoutRunFn;            // replaces `browser: Browser`
  task: Task;
  params?: TargetAppParams;
  dir: string;
  settings: LlmSettings;
  llm?: (logger: Logger) => Llm;
  logger: Logger;
  onEvent?: (event: RunEvent) => void;
}
```

Each attempt calls `options.run({...})` where it called `runActor({ browser, ... })`. io's `RunFn` (`runner.ts`) has exactly this type, so io hands Scout the same `sharedChromium(browser)` its runs use, and a test hands it `fakeRun()`. `run-scout.ts` passes `(o) => runActor({ ...o, browser })`. Nothing else changes in Scout: three attempts on seeds 1 to 3, the `scout` role, `<dir>/<task id>.json`, and attempts under `<dir>/attempts/`.

### agent: `cli.ts`, the target app served only when nothing serves it

```ts
/**
 * The target app on 5174: what already answers there, or a build served on it. `reused` says
 * which: `"dev"` for Vite's dev server (`pnpm dev`), `"build"` for a preview, `false` when this
 * call served the build. `close` closes only what this call served.
 */
export async function targetAppOnFixturePort(options?: {
  port?: number;                          // TARGET_APP_PORT; a test passes a free port
  serve?: () => Promise<TargetApp>;       // serveOnFixturePort
}): Promise<TargetApp & { reused: "dev" | "build" | false }>
```

It probes `http://localhost:<port>/` with `fetch` and a one-second timeout. Any HTTP answer counts as served, and the build is not served a second time. A second probe, `GET /@vite/client`, tells the two apart: it answers 200 on Vite's dev server and 404 on a preview. A refused connection, a timeout or any other fetch error counts as nothing there, so it calls `serve()`. If something does hold the port after all, `serve()` fails with its existing `target_app_unavailable` line ("Stop pnpm dev ..."), so the app is still never served twice. A command that reuses the app prints one line saying so. When it is the dev server, the line warns that `docs/STACK.md` wants a build for seeded runs.

`run-scout.ts` calls it in place of `serveOnFixturePort` and passes `run`.

### io: `runner.ts`, the Jev refusal and the origin check

```ts
/** Whether `task` starts on the target app at `targetAppOrigin`, port included (ADR 0003 D2). */
export function onTargetApp(task: Pick<Task, "startUrl">, targetAppOrigin: string): boolean

/**
 * Throws `WayfordError("jev_off_target_app")` for Jev on a task off the target app, naming
 * `docs/adr/0003-any-target.md` D9: Jev's gate covered the target app only.
 */
export function refuseJevOffTargetApp(task: Task, backend: ActorBackendName, targetAppOrigin: string): void
```

`createRunner` uses `onTargetApp` where it compares origins today. `start` resolves the backend name (the set's, else `defaultBackend`) and calls `refuseJevOffTargetApp` before it mints an id. A refused set throws, starts nothing and stores nothing, for every caller.

### io: `routes/runs.ts`

`POST /runs` catches `jev_off_target_app` from `runner.start` and answers **422 `{ error }`** with the message, which names D9. Any other throw propagates as before.

### io: `scout-jobs.ts` (new), one Scout per task, in memory

Imports agent as types only, so it loads neither agent's runtime nor Playwright.

```ts
/**
 * Scouts `task`, with the target app's parameters when it is on the app, and writes
 * `<dir>/<task id>.json`.
 */
export type ScoutFn = (options: {
  task: Task;
  params: TargetAppParams | undefined;
  dir: string;
}) => Promise<GroundTruth>;

export type ScoutJob =
  | { taskId: TaskId; status: "running" }
  | { taskId: TaskId; status: "failed"; error: string };

export interface ScoutJobs {
  /** Starts Scout on `task`, or returns the one already running. Never rejects. */
  start(task: Task): ScoutJob & { status: "running" };
  /** The job this process last started on `taskId`, while it runs or after it failed; else undefined. */
  job(taskId: TaskId): ScoutJob | undefined;
}

export function createScoutJobs(options: {
  scout: ScoutFn;
  targetAppOrigin: string;
  params: TargetAppParams;
  groundTruthDir: string;
  logger: Logger;
}): ScoutJobs
```

`start` hands `params` to `scout` only when `onTargetApp(task, targetAppOrigin)`. It always hands `dir: groundTruthDir`, so the folder Scout writes is the one `GET` and the report read: one setting, `AppOptions.groundTruthDir`. On success the job is removed, since the file now answers. On failure the job keeps `failed` with `"<code>: <message>"` for a `WayfordError`, else `String(error)`, and logs the whole error. The next `start` replaces it.

### io: `scout-task.ts` (new), agent's Scout as a `ScoutFn`

```ts
export function scoutTask(deps: {
  run: RunFn;
  settings: LlmSettings;
  logger: Logger;
  llm?: (logger: Logger) => Llm;       // tests: the fake adapter
}): ScoutFn
```

`server.ts` imports it, and so do the tests. It is out of the barrel, like `chromium.ts`.

### io: `routes/tasks.ts`, the Scout routes

`tasksRoute` also takes `{ scouts: ScoutJobs, groundTruthDir }`.

- `POST /tasks/:id/scout`, with the body `{}`:
  - **400** `{ error }`: `:id` is not a `TaskId`, or the body is not `{}`.
  - **404** `{ error }`: neither a stored task nor a core fixture task has that id. Nothing starts.
  - **202** `ScoutJob` (`status: "running"`): Scout started, or the one already running on that task.
  - **415** comes from `createApp` when the body is not JSON.
- `GET /tasks/:id/scout`:
  - **202** `ScoutJob`: Scout runs on that task.
  - **502** `{ error }`: this process's last Scout on that task failed, with its error. This holds until the next `POST`.
  - **200** `GroundTruth`: `readGroundTruth(groundTruthDir, id)` found the file, whichever process or CLI wrote it.
  - **404** `{ error }`: none was started, and there is no file.
  - **400** for an `:id` that is not a `TaskId`; **500** from `onError` for a file that is no ground truth (`invalid_ground_truth`), as `POST /reports` already does.

The task is looked up with `loadTaskOrFixture`, as the Analyst looks one up. So the two goals in `tasks.json` can be scouted too, and a report reads what was written.

### io: `db/tasks.ts`

```ts
/** A stored task, else core's fixture task with that id, else undefined. Fixtures are not stored. */
export async function loadTaskOrFixture(db: Db, id: string): Promise<Task | undefined>
```

`sweep-cli.ts`'s local `findTask` becomes a call to this function. The Analyst's own copy is left alone: `s4-09` is changing `analyst.ts` for axe on any URL right now, and a one-line tidy there is not worth a conflict.

### io: `app.ts`, `server.ts`, `test-app.ts`

- `AppOptions` gains `scout: ScoutFn`. `createApp` builds one `createScoutJobs` from `{ scout, targetAppOrigin, params, groundTruthDir, logger }` and hands it to `tasksRoute` with `groundTruthDir`.
- `server.ts` builds `const run = sharedChromium(browser)` once for the runner and for `scout: scoutTask({ run, settings, logger })`. Its ground-truth folder stays `runs/ground-truth`, where `pnpm --filter @wayford/agent scout` writes too.
- `test-app.ts` gains `noScout`, a `ScoutFn` that throws, as the default, and `testApp` passes it.

### io: `sweep-cli.ts` on any task

The order follows "cheapest first":

1. Arguments and env, as before.
2. The task, by `loadTaskOrFixture`, and the persona.
3. **New:** `refuseJevOffTargetApp(task, backend, TARGET_APP_ORIGIN)`, before the plan and the estimate. It is a refusal, so the exit code is 1.
4. The plan and the estimate, as before.
5. Serving:
   - Off the target app, nothing is served and nothing is built.
   - On it, `targetAppOnFixturePort()`: the running app is reused, or a build is served.

   The route walk stays as it is, since `hasRouteTable` is false off the hard goal.
6. A header line `site       <origin>, ...`:
   - `target app, served here` when this command served the build;
   - `target app, already served on 5174` when it reused a preview;
   - `target app, the dev server on 5174 (pnpm dev): docs/STACK.md wants a build for a sweep` when it reused `pnpm dev`;
   - `not the target app: no parameters, no jargon list` off the app.

The runner keeps deciding parameters and jargon by origin.

`TARGET_APP_ORIGIN` is `http://localhost:${TARGET_APP_PORT}`, which the CLI already builds inline for the runner.

### io: `scout-cli.ts` (new), `pnpm --filter @wayford/io scout -- --task <id>`

agent's `scout` CLI cannot read io's database (agent never imports io), so a stored task is scouted from io. It does what the route does, without the server:

1. It loads the env, the settings and the database, and finds the task with `loadTaskOrFixture`.
2. It serves the target app only for a task on it, with `targetAppOnFixturePort()`.
3. It launches Chromium, runs agent's `scout` on it with `dir: runs/ground-truth`, and prints:
   - `<task id>: reached in n of 3 attempts`;
   - the shortest path's length;
   - the model;
   - the file.

Exit 0 when the file is written, 1 for a failure, 2 for usage. agent's no-argument `scout` stays for the fixture pair.

### Data flow

```
s3-15 ─POST /tasks/:id/scout─▶ tasksRoute ─▶ ScoutJobs.start ─▶ scoutTask ─▶ agent scout ─▶ run × 3 (sharedChromium)
                                                     │                                   └─▶ runs/ground-truth/<id>.json
s3-15 ─GET  /tasks/:id/scout─▶ job? 202/502 : readGroundTruth ─▶ 200 / 404
POST /reports/:taskId ─▶ analyseAndStore ─▶ readGroundTruth(same dir) ─▶ report.scout
```

## Files

| File | Why |
|---|---|
| `packages/agent/src/scout.ts` | `run` in place of `browser`, so io's runs function, fake or real, drives Scout. Outside the task's list, but needed for the fake-run box and for one shared Chromium. |
| `packages/agent/src/scout.browser.test.ts` | Passes `run` in place of `browser`. |
| `packages/agent/src/run-scout.ts` | Passes `run`, and serves the app only when nothing serves it. |
| `packages/agent/src/cli.ts`, `cli.test.ts` | `targetAppOnFixturePort`, and its test. |
| `packages/io/src/runner.ts`, `runner.test.ts` | Outside the task's list. `onTargetApp`, `refuseJevOffTargetApp`, and the refusal in `start`. |
| `packages/io/src/routes/runs.ts`, `runs.test.ts` | 422 for Jev off the target app. |
| `packages/io/src/scout-jobs.ts` (new) | Outside the task's list. One Scout per task, in memory. |
| `packages/io/src/scout-task.ts` (new) | Outside the task's list. agent's Scout as a `ScoutFn`, for the server. |
| `packages/io/src/routes/tasks.ts`, `tasks.test.ts` | The Scout routes and the acceptance test. |
| `packages/io/src/db/tasks.ts` | `loadTaskOrFixture`, shared by the route and both CLIs. Outside the task's list. It is one function. |
| `packages/io/src/app.ts`, `test-app.ts` | Outside the task's list. `scout` option, `noScout` default. `app.ts` mounts the jobs. |
| `packages/io/src/server.ts` | Wires `scoutTask` on the shared runs function. |
| `packages/io/src/sweep-cli.ts` | Any task: the Jev refusal, serving only on the app, and the `site` line. |
| `packages/io/src/scout-cli.ts` (new), `packages/io/package.json` | Outside the task's list. The stored-task Scout CLI and its `scout` script. |
| `tasks/s4-10-scout-sweep-any-task.md` | Boxes ticked, Outcome. |

## Acceptance mapping

| Acceptance box | Proven by |
|---|---|
| io test: `POST /tasks/:id/scout` writes ground truth that `GET` serves and the report reads | `tasks.test.ts`, "POST scout writes ground truth that GET serves and the report opens with": real agent `scout` over `fakeRun(() => ({ step: true, gate }))`, so each attempt has one step and its path parses, and the fake adapter. Gated, `GET` answers 202 first, then 200 with the file. The test then stores an `llm` run of the task with `storedRun`, gives the fake Analyst one answer, and `POST /reports/:taskId` `{ backend: "llm" }` has `scout.reached` true. The same file also checks a second `POST` while running (one Scout call, the same job), 404s, 502 after a failure, and 200 for a file written before this process. |
| io test: Jev off the target app refused by `POST /runs`, runs nothing | `runs.test.ts`: 422 naming D9 for `backend: "jev"` and for a default of `jev`, with `fakeRun().calls` empty and `GET /runs` empty. LLM off the app and Jev on it still give 202. `runner.test.ts`: `start` throws, and no run is called or stored. |
| `sweep -- --task <stored foreign task>` on the LLM, no target-app build, table in PR, Boundary opens it | Manual, on a real key: one foreign task stored through `POST /tasks`, then e.g. `--axis contrast --from 3 --to 4.5 --step 1.5 --seeds 1 --backend llm`. The log shows no Vite build, the header says `not the target app`, and `/boundary/<sweep id>` under `pnpm dev` opens it. A screenshot goes in the PR. A unit test covers the Jev refusal's message. |
| Once `s4-09` is in: report on a public-site task with its Scout line and axe findings | Waits on `s4-09`. Left unticked if it has not merged by the PR, noted in the Outcome. |
| Root `pnpm lint`, `pnpm typecheck`, `pnpm test` | Run in verify. |

## Decision log

| Question | Taken | Why |
|---|---|---|
| How io drives Scout with a fake run function | Scout takes `run: ScoutRunFn` in place of `browser` | io's `RunFn` is that type already. The test drives the real Scout over `fakeRun()`, and the server shares one Chromium. An io-side fake `ScoutFn` would test nothing of Scout's file. |
| Where the stored-task Scout CLI lives | New io `scout-cli.ts`. agent's `scout` keeps the fixture pair | agent may not import io, so only io can read a stored task. |
| Status of `GET` after a failed Scout | 502 `{ error }` until the next `POST` | The task names 200, 202 and 404 only, and none fits a failure. Without it, the screen would poll 202 or read 404 for "never started". 502 is io's existing status when what it called failed. |
| `GET` with a file but no Scout started in this process | 200 with the file | The CLI or an earlier process wrote it, and the report reads it. "404 when none was started" holds when there is no file either. |
| Which tasks Scout takes | Stored, else a core fixture, as the Analyst looks tasks up | A report reads ground truth for both, and the fixture goals can then be scouted over HTTP too. |
| Where the Jev refusal lives | `refuseJevOffTargetApp` in `runner.ts`, called by `runner.start`, plus early in the sweep CLI | One rule for every caller. `start` throws before minting, so nothing runs. The sweep CLI calls it before `runSweep` saves a sweep row. |
| HTTP status of the refusal | 422 `{ error }` | The body is valid, but the request is refused on its meaning, as the tasks route's 422. |
| Jev refusal for Scout | None needed | Scout always runs on the LLM's `scout` role and takes no backend, so D9 already holds. |
| "Nothing already serves it" | Probe `localhost:5174` with `fetch` and reuse the answer only when its home page names `Quillmere`, the target app's `<title>`, with `/@vite/client` telling the dev server from a build. Anything else answering there is refused with `target_app_unavailable` | The task asks for it, and it never builds a second copy beside `pnpm dev`. Another project Vite moved to 5174 would otherwise be billed and stored as the target app (PR review). |
| Reusing the dev server reverses s4-05 ("a sweep should not depend on a dev server being up") and `docs/STACK.md` ("sweeps ... use a production build on 5174") | Accepted, and named every time: the header and the Scout CLI print "the dev server" when it is one | The task's interface asks for it. The operator who wants the strict build stops `pnpm dev` first, as today. Refusing the dev server was the stricter option, and it would break the "pnpm dev holds 5174" case the task names. |
| One Scout per task "at a time" | Per io process, in memory | The jobs live with the app's runner. A CLI Scout and a server Scout on one task can still overlap, and the later write wins, as two CLI runs would. |
| A new Scout while an old file exists | The old file stays until the new one replaces it | `GET` answers 202 while it runs, so the screen shows the new one. Deleting first would lose ground truth on a failed rerun. |
| POST body | `{}` strictly | `createApp` demands JSON on every `POST`, and a strict empty object keeps typos visible. |

## Risks

- **Real-key boxes.** The sweep box and the report box need the root `.env` key, linked into the worktree only on the user's yes, and a foreign task stored through the Extractor. They may land as manual steps listed for the user.
- **`s4-09` is in flight** and will touch `server.ts` and `app.ts` (measure and axe on any URL). The changes here are additive lines in both, so a merge conflict should be small.
- **Scout spends without a cap.** That is three attempts of at most 20 steps on the `scout` role, the same as the CLI today. io serves localhost only.
- **Scout skips the runner's slots.** Its attempts go through the shared `run` but not through the five-slot queue. Scout runs one attempt at a time, so each task being scouted opens one context more on the one Chromium, unbounded across tasks: Scouts started on k tasks beside a run set open 5 + k at once. Accepted: a Scout is started by hand, one goal at a time from the Target screen.
- **Ground-truth file write is not atomic.** A report read during the write could see half a file and answer 500. The window is milliseconds. Left as is, since the change would be in `scout.ts`'s write path.

## Review note

Round 1 (spec-reviewer): ready after fixes, no blocking findings. All taken:

- should: the dev-server reuse is named, told apart by `/@vite/client`, and its reversal of s4-05 and STACK is logged.
- should: the acceptance test names the `fakeRun` script with one step, the stored `llm` run and the Analyst answer.
- nit: the ground-truth folder is set once, and the jobs hand it to `ScoutFn`.
- nit: the six contexts are in Risks.
- nit: the Files table marks every file outside the task's list.
- nit: the Analyst's copy now gives the real reason, s4-09.
- nit: what a probe error means is stated.

Branch review (build), cold review round 1. Taken:

- `scout-isolation.test.ts` is deleted. It grepped `index.ts` for a name, so an import through `app.ts` or a route passed it. The rule it claimed was also not F4 AC3, which agent's `actor-isolation.test.ts` already guards: io reading the ground-truth file is the point. The route and runner still load no Scout code, since `ScoutFn` is handed in.
- The Scout CLI calls agent's `scout` directly with its own `onEvent`, so `scout-task.ts` serves `server.ts` and the tests only. The attempt lines both Scout commands print live in agent's `cli.ts` as `attemptLine`.
