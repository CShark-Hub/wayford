# s3-15 — Target screen: a site and a goal in, every screen out: spec

Task: `tasks/s3-15-target-screen.md` · Branch: `feature/s3-15-target-screen` · Date: 2026-10-07
Status: approved 2026-10-07 (auto)

## Goal

A screen, `/target`, where a person types a site's start URL, a goal in one sentence and how success is checked, gets the goal checked, and from there opens or starts every story screen on that goal.

## Constraints that bind

- "A task must not contain the solution" (`AGENTS.md`): the goal goes through `POST /tasks`, the Extractor's check, exactly as the Race's does. "A goal the check refused cannot start anything" (task).
- "The success condition is the user's, typed. The model never writes it" (task). The screen sends the typed condition as the request's `success`; io's Extractor never writes one.
- "Off the target app every run is on the LLM, and the report is asked for with `backend: "llm"` … The screen offers no backend choice" (task, ADR 0003 D9).
- D10: three seeds by default, ten as the other choice.
- D6: a sweep is not started here.
- "Every verdict clickable through to evidence" (`AGENTS.md`): the screen claims nothing of its own. Its Scout line repeats the ground truth, and its report link opens the Report.
- Out of scope: logins and headers; editing or deleting a stored task; changes inside the Lens and the Race (`s3-16`); starting a sweep.
- `docs/DESIGN.md`: tokens and components only. No text under 16 px, no target under 32 px. Buttons start with a verb, one ink primary per view. The three states: skeleton, empty, fault. `check:self` in Daylight and Night.
- `docs/STACK.md`: web talks to io over HTTP through `/api`, and imports `@wayford/core` only. No new dependency.
- Files another open task owns are left alone. `s3-16` owns `arena/panel-state.ts`, `start-panel.tsx`, `screens/arena.tsx`, `screens/lens.tsx`, `preview/search.ts`, `api/measure.ts` and `api/axe.ts`. `s4-10` (PR #191) owns io's `routes/tasks.ts` and `routes/runs.ts`.

## Design

The screen follows the Race's split (`arena/panel-state.ts`, `panel-calls.ts`, `start-panel.tsx`). The rules are pure functions. Each call to io is a plain function of a `dispatch`, tested with a stubbed `fetch`. The view is drawn from props, so a static render tests it with no DOM, as every web test does today.

### The route and its two modes

`/target`, with `validateSearch: z.object({ task: TaskId.optional().catch(undefined) })`.

- **No `task`: the form.** Start URL, goal sentence, success condition, and "Check the goal".
- **`task=<id>`: the goal view.** The stored task and what can start from it. It is drawn only for a task io holds, and io stores only a goal the check accepted (`routes/tasks.ts`). So no refused goal ever reaches a start.

Checking a goal: on io's 201 the screen writes the task into the query cache under `storedTaskQuery(id)`, then navigates to `?task=<id>`. The goal view therefore fetches nothing to draw it. A reload, or a link, reads it back from `GET /tasks`:

- the task found: the goal view;
- no task under that id: the empty state, whose action is "New goal";
- io failing: the fault banner with "Try again";
- while loading: a skeleton.

The goal view is keyed by task id, so its state starts fresh for each goal. "New goal" goes back to `/target`. The form keeps what was typed, so a second goal on the same site is one edit away; a reload clears it.

### `target/target-state.ts` (pure)

```ts
type SuccessKind = "urlMatches" | "selectorPresent";

/** Where the form's check has got. An accepted goal leaves the form, so it has no state here. */
type FormCheck =
  | { status: "unchecked" }
  | { status: "checking" }
  | { status: "refused"; goal: string; survived: string[]; error: string }
  | { status: "failed"; message: string };

type TargetForm = {
  startUrl: string;          // as typed
  story: string;             // the goal sentence as typed
  successKind: SuccessKind;
  successValue: string;      // the URL pattern or the CSS selector, as typed
  check: FormCheck;
};

type FormAction =
  | { type: "startUrlEdited"; startUrl: string }       // each edit resets the check
  | { type: "storyEdited"; story: string }
  | { type: "successKindChosen"; successKind: SuccessKind }
  | { type: "successValueEdited"; successValue: string }
  | { type: "checkStarted" }
  | { type: "checkAnswered"; extraction: Extraction }  // ok → unchecked, the screen navigates
  | { type: "checkFailed"; message: string };

formReducer(form, action): TargetForm
initialForm(): TargetForm                              // empty, URL pattern, unchecked
formBlocker(form): string | undefined                  // why "Check the goal" cannot run, in words
taskRequestOf(form): TaskRequest                       // trimmed, `success` built from kind + value
```

`formBlocker` checks these in order:

1. a check under way;
2. an empty start URL;
3. a start URL that core's `HttpUrl` refuses;
4. an empty sentence;
5. an empty pattern or selector;
6. a URL pattern that starts with neither `*` nor `http://`/`https://`: core's `matchableUrlPattern`, the rule agent's `checkSuccessCondition` ends such a run `runFailed` by, in the Race's words (`UNMATCHABLE_SUCCESS`). A pattern that starts well but does not compile, a brace left open, passes, and agent refuses it at the start of each run;
7. a selector the browser's own `querySelector` cannot parse, such as Playwright's `text=…`: agent lets any selector through, and the page's error would end every run (PR review). Without a `document`, as in the node tests, every selector parses.

The form's fields sit in a `<fieldset disabled>` while a check runs, so no answer can arrive for a form that has since changed. The Race needs its `for` tag only because its sentence stays editable during a check.

```ts
// api/scout.ts's ScoutAnswer (200 done, 202 running, 404 none, 502 failed), or the first GET in
// flight. A refused POST and a GET that rejected are `failed` too.
type ScoutState = ScoutAnswer | { status: "reading" };

type RunSet =
  | { status: "idle"; error?: string }                          // error: the last start io refused
  | { status: "starting" }
  | { status: "running"; runs: StartedRun[]; ended: RunId[]; pollError?: string }
  // Every run stored, or "Write the report" pressed before then: no run followed from here on.
  | { status: "ended" };

type GoalState = { profileIds: ProfileId[]; seedCount: 3 | 10; scout: ScoutState; runSet: RunSet };

type GoalAction =
  | { type: "personaToggled"; profileId: ProfileId }   // not while starting or running
  | { type: "seedCountChosen"; seedCount: 3 | 10 }     // the same
  | { type: "scoutRead"; scout: ScoutState }
  | { type: "runsStarting" }                            // from idle or ended
  | { type: "runsStarted"; runs: StartedRun[] }
  | { type: "runsFailed"; message: string }
  // One poll's answer: the runs io now has stored, and what failed, if anything. The last run
  // stored ends the set.
  | { type: "runsPolled"; ended: RunId[]; error?: string }
  // "Write the report" while the set runs: it ends there. Anywhere else the same state comes back.
  | { type: "reportAsked" };

goalReducer(state, action): GoalState
initialGoal(): GoalState                     // no persona, 3 seeds, Scout reading, idle
MIN_RUN_SET_PERSONAS = 2
seedsOf(seedCount): Seed[]                   // 3 → [1, 2, 3]; 10 → 1 to 10 (MAX_RUN_SET_SEEDS)
runSetBlocker(state, writing)                // a set under way, a report being written, too few personas
runButtonLabel(state): string                // "Start 6 runs on the LLM"
progressLine(runSet): string | undefined     // "4 of 6 runs ended"
scoutLine(scout): string                     // the Report's words, from the ground truth
runsRequestOf(task, state, profiles)         // { taskId, profileIds (profiles' order), seeds, backend: "llm" }
```

The report is not in the reducer: it is a mutation the Report screen shares (`target-calls.ts`, below), so its state outlives the view.

The Scout line uses the Report's words exactly (`screens/report.tsx`, `scoutLine`):

- "Scout reached it in 4 steps": the steps are the shortest path's;
- "Scout did not reach it in 3 attempts".

### `target/target-calls.ts`

Each function makes one call to io, dispatches what it answered and never rejects. Each is tested with a stubbed `fetch` and a recording dispatch.

- `checkTarget(form, dispatch): Promise<Task | undefined>`. Dispatches `checkStarted`, then sends `extractTask(taskRequestOf(form))` and dispatches `checkAnswered` or `checkFailed`, as the Race's `checkGoal` does. It returns the task on a 201, which the screen caches and navigates to, and `undefined` on a refusal or a failure.
- `dispatchScout(answer, dispatch)` takes `api/scout.ts`'s `readScout(taskId)` or `startScout(taskId)` and dispatches the answer as `scoutRead`, and a rejection, such as io down or the proxy's non-JSON 502, as `failed` with its message ("io answered 502").
- `startRunSet(task, state, profiles, dispatch)` dispatches `runsStarting`, then sends `startRuns(runsRequestOf(…))` and dispatches the race's `runs`.
- `pollRunSet(runSet, dispatch)` asks `fetchRun(id)` for every run of the set not yet ended, in parallel. It dispatches one `runsPolled` with the ids io now has stored. A call that rejects (io down, a body that is not a `RunResult`) counts that run as not ended, and its message goes in `error`. The next tick asks again. The view shows "The last check on the runs failed: <message>. Trying again." while `pollError` is set, and a poll that fully succeeds clears it.
- `reportMutation(client, taskId)`: the mutation options for `analyse(taskId, "llm")`, under the key the Report screen gives its own, `["analyse", taskId]` (`screens/report.tsx`, since #204). While either runs, `useIsMutating` on that key shows it on both screens and on a later visit to either, so neither offers a second paid call. On success the report lands in `reportQuery(taskId)`'s cache, which the goal view's link reads, even once the screen that asked has unmounted (PR review).

### Polling, in the screen

`usePoll(active, intervalMs, tick)`: while `active`, one `tick` at a time, `intervalMs` after the last one settled. It is a `setTimeout` chain, stopped on cleanup. `tick` is an effect event, so it reads the latest state, never a stale closure.

- Scout: `readScout` once on mount, then every 3 s while `scout.status === "running"`.
- Runs: `pollRunSet` every 2 s while `runSet.status === "running"`, the first 2 s after the start.
- The report: one effect calls the mutation's `mutate` when the set turns `ended`. Only the last stored run and "Write the report" end a set, and a mount starts idle, so it posts once per set, StrictMode's second effect run included. "Try again" calls `mutate` again.
- The report's state, all from the one key: `useIsMutating` says it is being written, and `useMutationState`'s last mutation says how the last one ended, so a failure shows on any visit while the cache keeps it. A new set under way sets that failure aside.
- The stored report: `useQuery(reportQuery(taskId))`, so a reload or a later visit draws its link.

Why poll `GET /runs/:id` and not each run's event stream: a run set is up to 5 personas × 10 seeds. A browser holds six HTTP/1.1 connections per origin (`arena/panel-state.ts`, `MAX_PERSONAS`), so one `EventSource` per run would starve every other request. A run in flight is a cheap 404. io stores a run when it ends, a crashed one included (`runner.ts`, `closeOut`). So "stored" is "ended", except for a run that never started or whose save failed, both of which io logs (Risks).

### `api/`

- `api/runs.ts`:
  - `startRuns` takes an optional `backend: "llm" | "jev"`, sent only when given, so the Race's body is unchanged;
  - `storedTaskQuery(id)` is new: key `["tasks", id]`, `GET /tasks` with the one task found or `null`, `retry: false`, as `reportQuery` has, and never stale: a stored task is never edited, and io stores one only under an id it has just minted.
- `api/scout.ts`, new, is `s4-10`'s two routes (`io/src/routes/tasks.ts`):
  - `readScout(taskId)`: GET. 200 parses with core's `GroundTruth`, 202 is running, 404 is none, and 502 is failed with io's `error`. Any other status rejects, as `refusal` words it.
  - `startScout(taskId)`: POST `{}`. 202 is running; anything else rejects.

### `target/target-view.tsx` and `screens/target.tsx`

`TargetForm` and `GoalView` are views of their props, like `StartPanel`.

The form:

- "start URL": an `<input type="url">`. Its hint: "Where every run starts: any http(s) page with no login, cookie wall or bot check."
- "goal": a textarea. Its hint: "What the person wants, not the way there: the check takes out screen names and clicks."
- "success": a `SegmentedControl` of "URL pattern" and "Element on the page", then one input, named by the kind chosen so it says what to type. "success", drawn, is hidden from a screen reader, which hears it as the group's name.
  - A pattern is a Playwright glob (`SuccessCondition`), not a URL, so its input has the placeholder `**/orders/*` and the hint "`**` stands for any part of the URL, `*` for any part between two slashes. It is matched against the whole URL, so it starts with `**` or with `https://`."
  - The selector's placeholder is `#order-history`, and its hint is "A CSS selector, found on the page the run is on."
  - Under both: "Checked after every step. You write it; the model never does."
- "Check the goal", the view's one primary button.
- A status region: "Checking…", or the refusal in the Race's words: the goal still names the way, what still names it, the goal it got to, and io's reasons. A failure is an alert. An accepted goal leaves the form, and the goal view's heading takes focus, so it is read out.
- The blocker line while the button is disabled.

The goal view:

- **Header:**
  - `goal · <task id>` in mono;
  - the goal the personas get, in `display-m`, focused on mount (`tabIndex={-1}`, no focus ring: it is a focus target for a screen reader, not a control);
  - "Rewritten from your sentence: “…”" when the stored `sourceStory` differs from the goal, as the Race says it after a check (branch review);
  - `start · <URL>` and `success · <condition>` in mono, through the Race's exported `successText`;
  - "Taken out: …" or "Nothing taken out";
  - "New goal", outlined.
- **Open it.**
  - "Open in the Lens" is `<a href="/lens?url=<encoded start URL>">`.
  - "Race on this goal" is `<a href="/race?task=<id>">`.
  - Both are drawn as outlined buttons.
  - They are plain anchors, not typed `Link`s: the Lens's and the Race's search params are `s3-16`'s to add, and a typed `Link` to a param they do not declare fails the typecheck.
  - The line above them says so: "Until the Lens and the Race take a goal of their own, each opens on its own default."
- **Scout:**
  - the Scout line, or a skeleton while reading;
  - "Run Scout", or "Run Scout again" once it has a result, disabled while reading or running.
- **Run and report:**
  - a line on what it does;
  - the cast as pressed or unpressed toggles, the Race's markup redrawn here, since its `CastPicker` is private to a file `s3-16` owns;
  - seeds as a `SegmentedControl`: "3 seeds", "10 seeds";
  - the button, "Start 6 runs on the LLM", the view's second ink primary after the form's, since the two never show together. It works from idle, and again after a report, for another set on other personas or seeds;
  - the blocker line, then the status region:
    - while the set runs: the progress line, the poll's fault line while `pollError` is set, and "Keep this page open: the report is written from here once every run has ended.";
    - while the report is being written, here or anywhere: "The Analyst is writing the report. This can take a few minutes.";
    - otherwise, while no set runs and one is stored: "Open the report", a `Link` to `/report/$taskId`, or "Open the last report" beside a newer report's failure. No link while a set runs: one that left the page would drop the set's report.
  - The last report's failure, while no set is under way: an alert with "Try again".
  - "Write the report", outlined, only while a set runs and no report is being written. It is the way out of a set that stalls on a run io never stores: it stops following the set and asks the Analyst over what io has stored, on the LLM. A goal with no runs is offered nothing that can only fail. After a reload mid-set, or for runs started elsewhere, this screen posts no report: the runs carry on in io, and the Report screen's own "Analyse runs" writes it, since #204 on the runs' backend, the LLM off the target app.
  - While Scout has no new result:
    - when it was never run: "Run Scout first, so the report opens with its line.";
    - while it runs: "Scout is still walking the goal: a report written before it ends uses Scout's last result, if any."
- The top bar slot stays empty. The screen shows no measured data of its own to badge, and the button names the backend.

### Top bar, router, self-check

- `components/top-bar.tsx`: a ghost "Target" link to `/target`, beside "Runs", outside the story nav, which stays `01 Cast` to `05 Boundary`.
- `router.tsx`: `targetRoute` added.
- `scripts/self-check.ts`: four entries.
  - `target`, the empty form.
  - `target · refused`: the form filled and checked, with io answering 422.
  - `target · accepted`: the form checked, io answering `POST /tasks` 201, and the goal view drawn from the task the check cached. Only `POST /tasks` is listed, so a goal view that read the task back with `GET /tasks` fails it.
  - `target · report`: `/target?task=task_past-order`, the task read back from `GET /tasks`, then Ada and Vera started. It answers `POST /runs` 202 with a race of six runs, each `GET /runs/<id>` with a stored run, `GET /reports/task_past-order` 404 and `POST /reports/task_past-order` with the fixture report, then waits for "Open the report".
  - An answer can be keyed by a method and its path, such as `POST /tasks`, which answers that method alone and comes before the path's own, which answers any. `self-check.browser.test.ts` holds the rule to it.
  - `self-check.browser.test.ts` also holds what a static render cannot reach: `target · report` posts the report once, after every run is stored; `target · accepted` waits for the goal's heading to take focus; and a check answered after the person went to Runs leaves them there.

## Files

| File | Why |
|---|---|
| `packages/web/src/screens/target.tsx` | New. The route, the two modes, polling, cache seeding, navigation. |
| `packages/web/src/screens/target.test.tsx` | New. The four behaviours the task names, through the calls and the views. |
| `packages/web/src/target/target-state.ts` | New, outside the task's list. Holds the screen's rules as pure functions, the way the Race's `arena/panel-state.ts` does, so they are unit tests. |
| `packages/web/src/target/target-state.test.ts` | New. The reducers, blockers and words. |
| `packages/web/src/target/target-calls.ts` | New, outside the list, for the same reason as `arena/panel-calls.ts`: each call is testable with a stubbed `fetch`. |
| `packages/web/src/target/target-view.tsx` | New, outside the list. The views from props, so a static render tests every state. |
| `packages/web/src/api/runs.ts`, `runs.test.ts` | `startRuns` takes `backend`; `storedTaskQuery`. |
| `packages/web/src/api/scout.ts` | New. Scout over HTTP (`s4-10`). |
| `packages/web/src/api/scout.test.ts` | New. Each status read. |
| `packages/web/src/router.tsx` | The route. |
| `packages/web/src/components/top-bar.tsx`, `top-bar.test.tsx` | The Target link, outside the story nav. |
| `packages/web/scripts/self-check.ts` | Outside the list. `docs/DESIGN.md`, "Checked by": "Each screen task adds its screen to the list". |
| `docs/DESIGN.md` | Outside the list. The Screens table gets a Target row, and the top bar line names Target beside Runs, so the page that lists every route lists this one. Two lines. |
| `tasks/s3-15-target-screen.md` | Boxes ticked with evidence. |

## Acceptance mapping

| Acceptance box | Proven by (test name or command) |
|---|---|
| `target.test.tsx`: a refused goal blocks every start | `target.test.tsx`, "a refused goal blocks every start". `checkTarget` with a 422 stub returns no task. The form drawn at the refusal holds no Lens or Race link and no Scout or run button. `/target` with no stored task draws no goal view. |
| … an accepted goal shows the links with the task id | `target.test.tsx`, "an accepted goal shows the links with the task id". `checkTarget` with a 201 stub returns the task. `/target?task=<id>`, drawn through the router with the task in the cache, shows the id and links to `/lens?url=<start URL>` and `/race?task=<id>`. |
| … the run set's progress line | `target.test.tsx`, "the run set's progress line". `startRunSet` POSTs taskId, profiles in order, seeds `[1, 2, 3]` and `backend: "llm"`. A `pollRunSet` with one run stored and one 404 draws "1 of 2 runs ended". |
| … the report link once the runs end | `target.test.tsx`, "the report link once the runs end". The poll ends the set. `reportMutation` POSTs `{ backend: "llm" }`; while it runs the view says the Analyst is writing, and then links to `/report/<id>`. The effect that calls it as the set ends is a browser's to run: `target · report` in the self-check fails without it. |
| Under `pnpm dev`, a public site, Ada and Vera, three seeds, the report opens | By hand on io and web from the worktree with the real key. Screenshots at each step go in the PR. |
| Once `s4-10` is in: Scout shows its result, and the report opens with its Scout line | PR #191 merged before this PR, so it is checked by hand under `pnpm dev`, on the real key, in the same run as the box above. `api/scout.test.ts` covers the reads against io's statuses. |
| `check:self` passes on `/target` | `pnpm --filter @wayford/web check:self`, with the four entries above, in Daylight and Night. |
| Root `pnpm lint`, `pnpm typecheck`, `pnpm test` | The three commands. |

## Decision log

| Question | Taken | Why |
|---|---|---|
| The form says three to five personas, the `pnpm dev` box runs Ada and Vera | Two to five, `MIN_RUN_SET_PERSONAS = 2`; no cap, since there are five personas | The box cannot pass at three. The Race's three to five comes from its lanes and its one stream per run (F6 AC1, `MAX_PERSONAS`), which a run set without streams lacks. Two is the least that lets the report compare personas. |
| Where the personas are picked | In "Run and report", not in the form | They gate only the run set, and a reload returns to the goal view, which has no form. |
| How the screen knows a run ended | Polls `GET /runs/:id` every 2 s for the runs not yet stored | One `EventSource` per run would take all six of the browser's connections at six runs. io stores every run that started, crashed ones included. |
| Where an accepted goal lives | In the URL as `?task=<id>`, the task seeded into the query cache | Required by the task. Seeding means no fetch right after a check; a reload reads `GET /tasks`. |
| What a reload keeps | The goal, Scout's state, the stored report's link and a report being written, all from io or the query cache. Not the run set's progress, which the running set says to keep the page open for | Run ids in the URL would be up to fifty ids. The runs carry on in io, as a reloaded Race's do (`screens/arena.tsx`). |
| A way to the report without a finished set | "Write the report", outlined, while a set runs | A set stalled on a run io never stores. Idle, a goal with no runs could only fail (PR review); after a reload mid-set, the Report screen's own button reads the runs' backend since #204. |
| How the report is posted once | A mutation keyed `["analyse", taskId]`, the Report screen's key; the effect calls it when the set turns `ended` | Only a set's end turns `ended`, and a mount starts idle, so no attempt counter is needed. The shared key lets each screen see the other's call on any visit, so neither bills the Analyst twice (PR review; `reportAttempt` and its ref are gone). |
| A poll that fails | Its runs count as not ended, its message shows, and the next tick asks again | io restarting, or the proxy's non-JSON 502, must not end the set or crash the screen. |
| A second set on the same goal | Allowed once a set has ended and no report is being written | Three seeds and then ten is the finals' plan (D10). A reload was the only other way. |
| Lens and Race links | Plain `<a href>` | Their search params are `s3-16`'s. A typed `Link` would fail the typecheck or need a change in files `s3-16` owns. |
| Reuse the Race's `CastPicker` and `CheckOutcome` | Redraw them in `target-view.tsx`, and import only what the Race already exports (`successText`, `Extraction`) | Exporting them is a change to `start-panel.tsx`, which `s3-16` owns. The redraw keeps the Race's markup and words. |
| Edits while a check runs | The fieldset is disabled | No stale answer can arrive, so no `for` tag is needed. |
| Seeds | `[1, 2, 3]` or 1 to 10 | The seed set the fixtures and `seed:demo` use; D10 gives the counts. |
| The run button's words | "Start N runs on the LLM" | Verb first (`docs/DESIGN.md`, "Copy"), and it says what it starts (task). |
| The backend | `backend: "llm"` sent on `POST /runs` and `POST /reports` | D9, and io's default may resolve to Jev. |
| Scout's line | The Report's words exactly | One wording for one fact across screens. The "hand-written" suffix was dropped in review: the Report draws none. |
| A source badge | None | The screen shows no measured data. The runs are io's, and the Report badges its own. |
| DESIGN.md | A Target row in Screens, and Target named beside Runs | That page lists every route. Two lines, no new component or token. |
| (build) The first poll | `RUNS_POLL_MS` after the set starts, not right away | A run just started cannot be stored yet, and Scout's first poll would repeat its mount read. |
| (build) The self-check measured a button mid-transition | `checkScreen` emulates reduced motion for every screen, so every duration is 0 | In the refused entry, "Check the goal" is re-enabled as the answer lands. It was measured on its way from the disabled look, at 1.85:1, and this machine's Chromium draws no animation frames to finish the transition. The check is of the state a screen settles in. Every screen passes with it. |
| (build) The stored task's freshness | `storedTaskQuery` never goes stale, a `null` included | A stored task is never edited, and io stores one only under a freshly minted id, so a `null` never turns into a task. Without it, a goal just checked would be read back in the background, which the spec rules out. |
| (build) `GET` and `POST /tasks` in one self-check entry | An answer keyed by a method and its path | `target · accepted` answers `POST /tasks` and must fail on a `GET /tasks`, which a path alone cannot tell apart. |
| (PR review) A check that answers after the person left | The task is cached, but the screen navigates only if the address is still the one the check started from | Leaving during a check, or Back to another goal, must not pull the person away. The form went with the screen, so that goal is checked again, one Extractor call. |
| (PR review) The URL pattern rule | Core's `matchableUrlPattern` (#206), in the Race's words | One rule for the Actor loop, the Race and this screen. |

## Risks

- **Until `s3-16` merges, the two links open the wrong thing.**
  - The Lens's `PreviewSearch` is a non-strict `z.object`. It drops `url=`, so "Open in the Lens" shows the target app's default page.
  - The Race has no `task=` yet, so "Race on this goal" opens its demo goal.
  - The task sets those links' box to wait for `s3-16`, which is under way. Until it lands, the line above the links says each opens on its own default.
  - They are not disabled meanwhile: nothing on the screen can know whether `s3-16` is in.
  - Follow-up for `s3-16`: turn both into typed `Link`s once the params exist, and drop that line.
- **A run io never stores keeps the progress line short of its total.** This happens to a run that never started or whose save failed, and io logs both. It also happens when io restarts mid-set. "Write the report" is the way out: it reports over what io stored.
- **The `pnpm dev` box costs real LLM runs.** It is six runs plus one Analyst call, against a public site that may change or block a headless browser. It uses `s1-07`'s pick (PR #193) if that is in by then, since `s4-08` rehearses from this screen on that site. Otherwise it uses a public site known to load fast.
- **The report is a synchronous `POST` that can take minutes.** The screen shows it running from the shared mutation, on any visit; nothing times it out.

## Review note

Round 1 (`spec-reviewer`): ready after fixes, with no blocking finding. Taken:

- **Links before `s3-16`.** It is now a Risk with a follow-up. Rejected: holding the merge for `s3-16` or drawing the links disabled. The task already sets the links' box to wait for `s3-16`. Nothing on the screen can know whether it is in. `s3-16` lands before the rehearsal (`s4-08`).
- **Posting the report twice.** The report is posted once per `reportAttempt`, which only the reducer counts, and `writeReport` dispatches only its answer.
- **A way out of a stalled set.** "Write the report", while idle or running.
- **Failed polls and Scout reads.** A failed poll counts its runs as not ended and shows its message. A failed Scout read is `failed` with io's words.
- **The pattern's copy.** A placeholder and a hint for the glob, and a placeholder for the selector.
- **Nits.**
  - A second set is allowed after a report.
  - The "hand-written" suffix is gone.
  - The no-Scout-line warning shows when Scout was never run too.
  - `checkTarget` dispatches `checkStarted` first.
  - The `pnpm dev` box uses `s1-07`'s pick if PR #193 is in.

No second round: the first found nothing blocking.

## PR review (2026-10-07)

`/pr-review` on PR #208, after #191, #204 and #206 merged into `main`. Taken:

- **The report outlives the view.** A shared mutation under the Report screen's key, the stored report read for its link, and the attempt counter dropped (decision log).
- **The check's navigation** waits for a person still on `/target`.
- **Success conditions every run refuses**: a selector the page cannot parse, and the pattern rule from core.
- **Copy that claimed more than io reads**: the report covers the latest run of each persona and seed on the goal, and Scout walks the goal three times.
- **An accepted goal is announced**: the goal view's heading takes focus.
- **Cut**: the re-render skipping in the reducer, the Scout call wrappers, the `target · goal` entry, the `.clone()` in `api/scout.ts`, and tests that repeated others.
