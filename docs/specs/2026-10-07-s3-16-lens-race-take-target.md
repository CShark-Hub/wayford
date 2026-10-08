# s3-16 — The Lens and the Race take a target: spec

Task: `tasks/s3-16-lens-race-take-target.md` · Branch: `feature/s3-16-lens-race-take-target` · Date: 2026-10-07
Status: approved 2026-10-07 (auto)

## Goal

The Lens opens any page by URL and the Race runs any stored goal, both by link, so the Target screen (`s3-15`) can send a person to either.

## Constraints that bind

- The persona is a filter, not a prompt: the Lens still draws only what `perceive` returns (F2 AC3). Nothing here decides an element's visibility.
- `docs/adr/0003-any-target.md` D2: what only the target app has goes to a page only when it is handed it. The Lens decides by its own link, `page=` a target-app page, `url=` any page. Off the target app K2 is off (D3), so `perceive` gets no jargon list.
- D5: io keys what it measures and scans by the whole URL, so web's query keys carry it too.
- A goal's start URL and success come from a preset or a stored task, never from the model (`tasks/s3-03-ring.md`).
- The 90-second demo's beats on the target app look and behave exactly as before. Beats 1 to 4 are `/lens` with `page=` or none, and `/race` on the presets. Two things the task itself asks for do change their look, and the spec says so rather than hide it: the Lens gains a URL row, so its stage is about 52 px shorter at 1280 × 720 and draws the same page slightly smaller; and the Race's goal row gains the stored-goal select. Every element, count, rule and behaviour of beats 1 to 4 stays as it is.
- Out of scope: the form that creates a foreign task (`s3-15`) and io's side (`s4-09`). io already answers `GET /measure?url=`, `GET /axe?url=` and `GET /tasks`.
- web imports core and `@wayford/filter/perceive` only, and talks to io over HTTP (`docs/STACK.md`). No new dependency.
- `s3-15` (PR #208, open) links here as `/lens?url=<encodeURIComponent(start URL)>` and `/race?task=<id>`. Both params are read exactly that way.

## Design

### 1. The Lens's page: a path or a whole URL (`preview/search.ts`)

The Lens names the page it perceives with one string, as io's `nameOf` does: a target-app page by its path, any other page by its whole URL. A path starts with `/`, and a whole URL never does, so the two cannot collide in a key or a message.

```ts
/**
 * A `url=` value: trimmed, spelled as `new URL(…).href`, then core's `AxeUrl`, as io reads it.
 * What `new URL` cannot parse adds a zod issue, as io's `pageUrlParam` does, and never throws: a
 * throw inside a transform escapes `.catch` and would send the route to its error screen.
 */
export const LensUrl = z.string().trim().transform(toHref).pipe(AxeUrl); // web's copy of io's pageUrlParam

export const PreviewSearch = z.object({
  …,                                                   // unchanged
  page: z.enum(PREVIEW_PAGES).optional().catch(undefined),
  url: LensUrl.optional().catch(undefined),            // new
});

export type PreviewState = {
  …,
  /** The page perceived: a `PREVIEW_PAGES` path (`page=`), or a whole URL (`url=`). */
  page: string;
  /** Whether `page` is a target-app page: true for `page=` or no page at all, false for `url=`. */
  onTargetApp: boolean;
};
```

- `resolvePreview`: with a `url`, `page` is that URL and `onTargetApp` is false, whatever `page=` says. A link holding both is read as the URL: it names one page exactly, while `page=` may be a stale picker value. Otherwise `page` is `search.page ?? "/deliveries"` and `onTargetApp` is true.
- `pageSearch(search, page)`: `page` set as today and `url` dropped, so a picker link always leaves a URL page.
- `urlSearch(search, url)`, new: `url` set and `page` dropped, everything else kept. The URL form navigates to it.
- `personaSearch(state, id)`: keeps the page as the URL named it, `page=` for a target-app page and `url=` for any other.
- A `url=` that `LensUrl` refuses reads as absent, like every other bad param: the Lens opens `/deliveries`. `url=nope`, `url=file:///etc/passwd` and `url=123` (a number once parsed) are each a test.

### 2. io's measurement and scan by path or URL (`api/measure.ts`, `api/axe.ts`)

`measurementQuery(device, page)` and `axeQuery(page)` keep their signatures and keys: `["measure", device, page]` and `["axe", page]`. `page` now carries the whole URL for a URL page. The query string is chosen by `pageParams(page)`, new in `measure.ts`: `{ page }` for a path, `{ url: page }` otherwise. io keys both routes by the whole URL already (D5).

### 3. The Lens screen (`screens/lens.tsx`)

- **`perceive`'s options:** `{ jargon: bundledJargon }` when `state.onTargetApp`, `{}` otherwise. A `url=` that points at the target app itself is perceived with no jargon too, as the task file says.
- **The stage** becomes one union, read once:

  ```ts
  type Stage =
    | { kind: "measuring" }
    | { kind: "live"; observation: FullObservation }
    | { kind: "stored"; observation: FullObservation; failure: string } // target-app page only
    | { kind: "failed"; failure: string };                             // URL page only
  ```

  A failed URL page draws no page. It shows a `fault` banner instead: `The page could not be measured: <io's reason>. The Lens draws a page only from its own measurement.` The banner keeps the same "Try again" action. The source badge is absent, since nothing was measured. The strip's three counts read `—` and its rules fired read `none`, never skeletons, which would mean "still loading". The bundled `/deliveries` stays the fallback for a target-app page only, under its stored banner, unchanged.
- **Copy for a URL page:**
  - the measuring line is `Measuring <url> on <device>…`;
  - the live line is `Live: <url> on <device>, opened as given.`;
  - the axe card's note is `Scanned once per page on desktop, opened as given.`
  
  Target-app pages keep every word they have today.
- **The URL field** sits on a row of its own under the header row, so nothing in the header row moves; the stage below gives up the row's height. The row holds:
  - a `<form aria-label="Open a page by URL" noValidate>` with a mono label `url`. `noValidate`, so the browser's own bubble never pre-empts the one alert below for a value such as `example.com`;
  - an `<input type="url" name="url">` that fills the row, showing the current URL on a URL page and empty on a target-app page;
  - an outline `Open` button.

  On submit the value goes through `LensUrl`. A valid one navigates, a push, to `urlSearch(search, href)`. A refused one shows an alert under the row, `Enter a whole http(s) URL, such as https://example.com/`, and navigates nowhere. The input is keyed by the page, so Back or a picker link resets it. The picker keeps its three pages; on a URL page none of them is current.
- **Illustration view:** io pictures only `/deliveries`, so a URL page shows the existing "taken of /deliveries only" line and its link. `pictured` also requires `onTargetApp`. `IllustrationStage`'s `page` prop widens from `PreviewPage` to `string` (`preview/illustration.tsx`), and its link uses `pageSearch`, which now drops `url`.

### 4. The Race's goals (`arena/panel-state.ts`, `arena/start-panel.tsx`, `arena/panel-calls.ts`, `screens/arena.tsx`)

> As designed before #204 to #208 changed the Race. The code follows "The Race on main after #204 to #208 (build)" below: where the two differ, that section holds. `RaceSetup`, `RaceFor` and `initialPanel(goal?)` were dropped there.

```ts
/** A goal the panel offers: a preset from tasks.json, or a task io has stored. */
export type Goal = {
  id: TaskId;
  /** "Easy goal", "Hard goal", or "Stored goal". */
  label: string;
  /** Where the editable sentence starts: the preset's goal, or the stored task's checked goal. */
  sentence: string;
  startUrl: Task["startUrl"];
  success: SuccessCondition;
  /** A stored task: its goal is already checked, so choosing it accepts the check. */
  stored?: Task;
};

export function storedGoalOf(task: Task): Goal; // label "Stored goal", sentence task.goal, stored: task
export function storedGoals(tasks: readonly Task[]): Goal[]; // io's order, a preset's id left out

export type PanelState = { goal: Goal; sentence; profileIds; seed; check; starting; startError? };
// `presetId` becomes `goal`. `presetChosen` becomes:
| { type: "goalChosen"; goal: Goal } // sentence = goal.sentence; check = accepted(goal.stored) or unchecked
export function initialPanel(goal?: Goal): PanelState; // DEMO_GOAL's preset when none is given
```

- **Choosing a goal:** a stored goal's check starts `{ status: "accepted", task: stored, rewritten: false }`, so Start waits only on personas and a seed. Editing its sentence resets the check, as for a preset. The next check posts the new sentence with the stored task's `startUrl` and `success`: `taskRequestOf` reads `state.goal`, never the model.
- **Late answers:** a check answer is tagged `{ goalId, sentence }` and dropped unless both match. `isCurrent` compares `state.goal.id`.
- **`startRace`:** takes its label from `state.goal.label`, and no longer looks up a preset.
- **The panel's view:**
  - The presets stay one segmented control, so beat 4 looks as it does.
  - Beside it, a `<select id="arena-stored-goal">` labelled `stored goal` lists every stored goal as `<host> · <goal>`. Its first option is `Choose a stored goal`, selected while a preset is the goal. On a stored goal the segmented control has no item checked. The select's width is capped (`max-w-100`) and its text truncates: every accepted Race check stores a new task (`packages/io/src/extractor.ts`), so a rehearsal database lists many `localhost:5174 · …` goals.
  - While `GET /tasks` loads, a skeleton stands in the select's place. A failed list shows a line, `Stored goals are unavailable: <reason>. The two target-app goals still work.` An empty list shows `No stored goals yet`.
  - The goal's line under the sentence reads `success · …` as today. For a stored goal it is `start · <startUrl> · success · …`. Presets keep their line unchanged, so beat 4 does not move.
- **`/race?task=<id>`** (`screens/arena.tsx`): the route gets `validateSearch: z.object({ task: TaskId.optional().catch(undefined) })`, and the screen reads `useQuery({ ...tasksQuery(), retry: false })`: a failure shows at once, as `storedTaskQuery` in PR #208 does, and `api/runs.ts` is not touched.
  - With no `task`, or a preset's id, the panel opens at once on that preset, as today.
  - With another id, the opening goal is settled once the list holds that id, or once the query is neither pending nor fetching. A cached list fetched before the task was created is refetched on mount, since it is stale, and is not read until that fetch ends. Until then a status line `Loading the goal <id>…` shows over a skeleton. Then the panel opens on that stored goal. When io holds no task under the id, or the list failed, the panel opens on the demo goal under the line `No stored goal <id>: <reason or "io holds none">`.
  - The reducer and the `race` state move from `ArenaScreen` into a child, `RaceSetup`, that mounts only once the opening goal is known and is keyed by its id, so `useReducer`'s initialiser runs on the opening goal, once per link. `ArenaScreen` keeps only the route, the query and that choice.
  - Choosing another goal does not write the URL: the race is not in the URL (`screens/arena.tsx`), and `?task=` only picks the opening goal.

### 5. The self-check (`scripts/self-check.ts`)

The Race now asks `GET /tasks`, and the live race also posts `POST /tasks`, so a response is looked up by `"<METHOD> <path>"` first, then by `<path>`. This is the same lookup PR #208 adds, copied word for word, so whichever merges second takes the other's hunk unchanged. The entries:

- `race`: adds `"/tasks": [FOREIGN_TASK]`, and its `ready` waits for `#arena-stored-goal`, so the select is measured, not the skeleton before it;
- `race-live`: `"/tasks"` becomes `"POST /tasks"`, and `"/tasks": [FOREIGN_TASK]` is added;
- `race · stored goal`, new: `/race?task=<FOREIGN_TASK.id>`, ready when its `start ·` line shows;
- `lens · url`, new: `/lens?url=https://example.com/`, with the same answers as `lens` and the same `exclude`, ready as `lens` is.

`FOREIGN_TASK` is `taskFixture("task_past-order")` moved to `https://example.com/`, with a ULID id.

## The Race on main after #204 to #208 (build)

§4 and §5 were built on `4ddfaa6`. Since then main changed the Race under them: a goal's success is editable and follows its sentence (#206), a race lives at `/race/$raceId` with the panel's reducer in the `/race` layout and kept for the page's life (#205), and the race leads on to its report (#204). This section is how the Race half lands on that. Where it differs from §4 and §5, this section holds. The Lens half (§1 to §3, and `lens · url`) is unchanged.

**The panel model (`arena/panel-state.ts`).** Main's file is the base. The branch's goal is ported into it:

- `GoalPreset` becomes `Goal`, with `stored?: Task`. `GOAL_PRESETS`, `presetOf`, `presetFor`, `goalLabel` and `presetTaskOf` stay as main has them. The branch's `storedGoalOf(task)` (label `Stored goal`) and `storedGoals(tasks)` are added unchanged.
- `PanelState.presetId` becomes `goal: Goal`. Every `presetIn(state)` reads `state.goal`. `CheckedFor` becomes `{ goalId, sentence, success }`, and `isCurrent` compares all three.
- The action `presetChosen { presetId }` becomes `goalChosen { goal }`. It sets the goal's sentence, the goal's success as the draft, and the check: `{ status: "accepted", task: goal.stored, rewritten: false }` for a stored goal, `unchecked` for a preset. The panel therefore opens on a stored goal checked, with its own `startUrl` and success, and Start waits only on the personas and the seed.
- #196's rule covers every goal, not just a preset. `successAfter` reads `state.goal`: an edit away from the goal's sentence empties a success that is still the goal's, and an edit back refills an empty one. `presetSuccessUsed` and `usesPresetSuccess` become `goalSuccessUsed` and `usesGoalSuccess`. Any edit of the sentence or the success drops the check. The next check posts `POST /tasks` with the edited sentence, the stored task's `startUrl` (`taskRequestOf` reads `state.goal.startUrl`) and the success as the panel holds it.
- A stored success the panel cannot type, an element from the Target screen's `selectorPresent`, is held fixed. `fixedSuccess(goal)` is the goal's condition when it is not `urlMatches`, and `undefined` otherwise. For such a goal, `draftOf` gives `""` instead of throwing, and the preset test still pins every preset to a URL pattern. With a fixed success:
  - `taskRequestOf` sends that condition;
  - neither `startBlocker` nor the check button asks for a pattern;
  - a sentence edit keeps the condition;
  - `goalSuccessUsed` does nothing.
- `initialPanel()` stays as main has it, with no argument. The branch's `initialPanel(goal?)` is dropped, since the link's goal now reaches the panel through `goalChosen`.
- `startSucceeded` spends the check as main does, a stored goal included. The next race on it is checked again, which mints a new task with the stored `startUrl`. It stays selected, and a select fires no change on the option it holds, so it is accepted again only after another goal is chosen and it is chosen back, or after a new check.

**The calls (`arena/panel-calls.ts`).** Main's file is kept. `startRace` returns the `RaceId` and the screen navigates to `/race/$raceId`. The only change is the `checkGoal` comment, which now says "its goal's start URL". The branch's `Race` type and its `label: state.goal.label` are dropped, because main's race header labels a race by `goalLabel(race.task)`. A race on a foreign goal is labelled `Goal`, and its way on is its own report, since `presetTaskOf` names no preset for it.

**The view (`arena/start-panel.tsx`).** Main's file is kept, plus the branch's pieces:

- the `StoredGoals` union and a required `stored` prop on `StartPanel`;
- `StoredGoalChoice`: a select `#arena-stored-goal` of `storedGoalText` options, width capped and text truncated; a skeleton while loading; a line when the list failed; `No stored goals yet` when it is empty;
- the segmented control's value set to `""` on a stored goal, so no preset is checked.

The branch's `goalLine` is replaced. Main draws success as its editable `SuccessField`, so a stored goal gets one more mono line above the field, `start · <startUrl>`, and a preset gets none, so beat 4 does not move. The "Use the …" button reads `Use the preset's` on a preset and `Use the stored goal's` on a stored goal. For a fixed success, the field is replaced by a mono line, `success · <successText>`. The accepted check's own `success · …` line, which main already draws, shows the stored success too.

**`?task=` and the screen (`screens/arena.tsx`).** Main's file is kept: the layout's reducer, `keptPanel`, `StartScreen`, `RaceScreen`, `/race/$raceId`, `forgetRace` and `showRace`.

- `validateSearch: z.object({ task: TaskId.optional().catch(undefined) })` goes on `startRoute`, the setup, and not on `arenaRoute`. A race's URL therefore takes no `?task=`. If a `to: "/race"` link or `navigate` then asks for a `search`, it gets `search={{}}`, as `target.tsx` does.
- `StartScreen` reads `useQuery(storedTasksQuery())`, the branch's `{ ...tasksQuery(), retry: false }`, so only the setup asks `GET /tasks`. `/race/$raceId` never does, and `race-stored` keeps its responses.
- `StartScreen` draws `<OpeningGoal key={task ?? ""} …/>` and then `<RaceHistory />`, so the History stays under the panel in every state. `OpeningGoal` settles the opening once per mount, with the branch's `openingOf` and the same render-phase `setState` as `RaceFor`. The rules are §4's: no `task` opens at once, and so does a preset's id. A stored id waits until the list holds it, or until the list is neither pending nor fetching, so a stale cached list is refetched first. Until then it draws the branch's `OpeningSkeleton` with `Loading the goal <id>…`.
- Once the opening is settled, `OpeningGoal` draws `StartPanel` on `panelReducer(panel, { type: "goalChosen", goal })` at once. An effect then dispatches that same action to the layout's reducer, once, and marks it done. The first paint is already on the goal, the static-render tests can see it, and `keptPanel` keeps it after that.
- When io holds no task under the id, or the list failed, the line `No stored goal <id>: <reason or "io holds none">` shows over the panel, and nothing is dispatched. The panel stands as the layout opened it: the kept panel, or the demo goal on a fresh page.
- With no `task`, nothing is dispatched and the panel behaves exactly as on main. Choosing another goal does not write the URL. Start navigates to `/race/$raceId` as main does.
- The History, the Race tab's return (`useShownRace`, `forgetRace` on the panel's mount, `showRace` on a race's) and `/race/$raceId` are untouched. A Race-tab or "New race" link goes to `/race`, so it never applies a goal again. A Back to `/race?task=<id>` mounts `StartScreen` afresh and applies the goal again, because it is a visit to that link.
- The branch's `RaceFor`, `RaceSetup` and its own `LiveRace` are dropped, because main's layout, `StartScreen` and `RaceScreen` do their work. Kept from the branch: `ArenaSearch`, `storedTasksQuery`, `Opening`, `reasonOf`, `openingOf`, `storedOf` and `OpeningSkeleton`.

**The tests.**

- `fixture-race.ts`: main's file, plus the branch's `foreignTask` (and `Task` imported as a value). The branch's `forOf` is dropped, since main tags answers with `checkedFor`.
- `panel-state.test.ts`: main's tests, with the renames (`goalChosen` given the preset, `state.goal`, `goalId`, `usesGoalSuccess`, `goalSuccessUsed`). Ported from the branch:
  - "storedGoals keeps io's order and leaves a preset's id out", as it is;
  - "a stored goal opens checked, and an edit of its sentence asks a check with its start URL and success", rewritten for #206: a sentence edit empties the stored success, a typed success or "Use the stored goal's" fills it, and `taskRequestOf` carries the stored `startUrl` with that success. Back on a preset, the preset's start and success return.
  
  New:
  - "a stored goal's element success is fixed: a sentence edit keeps it and the check sends it";
  - "a race on a stored goal spends its check, and choosing it back after another goal accepts it".
- `panel-calls.test.ts`: main's tests, renamed. "A stored goal starts with POST /runs alone, no POST /tasks" is ported. io's 202 is `{ raceId, runs }`, and the test expects the `RaceId` back.
- `start-panel.test.tsx`: main's tests, whose render helper passes `stored: { status: "listed", goals: [] }`. Ported: "stored goals are listed by host and goal; loading is a skeleton, a failure a line". The second branch test becomes "a preset draws no start line; a stored goal shows `start · <url>`, its option selected, no preset checked, and Use the stored goal's".
- `arena.test.tsx`: main's tests, with `renderPath(path, seed, client?)` so a test can pass the branch's `clientWith(tasks, fresh)`. The branch's six `?task=` tests are ported against `/race?task=…`. Each also asserts that the History section is still drawn under the panel.

**The self-check (`scripts/self-check.ts`).** Main's file is the base. Its method-aware lookup is the branch's hunk word for word, so it is taken as main has it. Main's `/races`, `/races/<id>`, `/reports/…` and History answers, `race-stored` and the `target · …` entries are all kept. On top of main:

- `Task` is added to the core import, along with the branch's `FOREIGN_TASK` and its comment.
- `race`: `"/tasks": [FOREIGN_TASK]` is added beside main's `/races` and `/reports/task_past-order`, and `ready` becomes `main:has(#arena-stored-goal) >> role=heading[name="finished · 2"s]`, so the select and the History are both measured as drawn.
- `raceScreen` (`race-live`): main's `"/tasks"`, the 201, becomes `"POST /tasks"`, and `"/tasks": [FOREIGN_TASK]` is added. The doc comment says io lists the stored goals too.
- `race · stored goal`: `/race?task=${FOREIGN_TASK.id}`, ready on `text=/^start · /`, with `"/tasks": [FOREIGN_TASK]` and `"/races": []`, since the History under the panel asks for it.
- `lens · url`: as built.

## Files

| File | Why |
|---|---|
| `packages/web/src/preview/search.ts` | `url` param, `LensUrl`, `PreviewState.page` as path or URL with `onTargetApp`, `urlSearch`, `pageSearch` and `personaSearch` for both |
| `packages/web/src/screens/lens.tsx` | URL form, the stage union, no jargon off the target app, URL copy, no fallback for a URL page |
| `packages/web/src/api/measure.ts` | `pageParams`: `page=` for a path, `url=` for a URL; the key carries the whole URL |
| `packages/web/src/api/axe.ts` | the same params for the scan |
| `packages/web/src/arena/panel-state.ts` | `Goal`, stored goals, `goalChosen`; `initialPanel()` stays as main has it |
| `packages/web/src/arena/start-panel.tsx` | the stored-goal select and its states, the start line for a stored goal |
| `packages/web/src/screens/arena.tsx` | `?task=`, the tasks query, the opening goal |
| `packages/web/src/arena/panel-calls.ts` | outside the list: `checkGoal` and `startRace` read `state.goal` instead of looking up a preset |
| `packages/web/src/preview/illustration.tsx` | outside the list: `page` widens to `string`, since a URL page reaches the Illustration view too |
| `packages/web/scripts/self-check.ts` | outside the list: the acceptance box asks `check:self` to pass on `/lens` and `/race`, and the Race now asks `GET /tasks`, which an unlisted request would fail |
| `packages/web/src/arena/fixture-race.ts` | outside the list: test data and a foreign stored task, `foreignTask` |
| tests: `preview/search.test.ts`, `screens/lens.test.tsx`, `api/measure.test.ts`, `api/axe.test.ts`, `arena/panel-state.test.ts`, `arena/start-panel.test.tsx`, `arena/panel-calls.test.ts`, `screens/arena.test.tsx` | the boxes, and the rename |
| `tasks/s3-16-lens-race-take-target.md` | boxes ticked, Outcome |

`packages/web/src/api/runs.ts` is not changed. `tasksQuery` exists, and PR #208 owns that file this week.

## Acceptance mapping

| Acceptance box | Proven by |
|---|---|
| a Lens link with `url=` resolved and measured | `search.test.ts` "a url= link resolves to that page off the target app, and wins over page="; `measure.test.ts` and `axe.test.ts` "a URL page asks io with url=, keyed by the whole URL"; `lens.test.tsx` "a url= link measures and draws that page, live, opened as given" |
| a failed foreign measurement shows no bundled page | `lens.test.tsx` "a failed URL page draws no page, never the stored /deliveries, and says why" |
| a `url=` page perceived for Kai masks no term from the target app's jargon list | `lens.test.tsx` "Kai on a url= page gets no jargon list: Fulfilment ledger is masked on page= and not on url=". The probe on 2026-10-07 found no jargon term on the stored `/deliveries`, so the test builds a measurement holding one |
| a Race link with `task=` preselecting a stored goal and starting with no new check | `arena.test.tsx` "/race?task= opens on the stored goal, checked, with its start and success shown"; `panel-calls.test.ts` "a stored goal starts with POST /runs alone, no POST /tasks" |
| Under `pnpm dev`: the Lens on a public site for Ada and Vera, the Race on a stored foreign goal with three personas, shown in the PR | a manual check under `pnpm dev`, with screenshots in the PR. The Race half needs the Extractor and the Actor on the LLM (D9), so it needs a key in `.env` |
| `check:self` passes on `/lens` and `/race` | `pnpm --filter @wayford/web check:self`, with the `lens · url` and `race · stored goal` entries added |
| `pnpm lint`, `pnpm typecheck`, `pnpm test` pass | the commands |

## Decision log

| Question | Taken | Why |
|---|---|---|
| How the Lens names a page | One string: a path for `page=`, the whole URL for `url=`, plus `onTargetApp` | The keys stay `["measure", device, page]` and carry the whole URL; io's `nameOf` names pages the same way; the least churn in tests |
| `page=` and `url=` both in a link | `url` wins | It names one page exactly; io refuses both together, so web has to pick one |
| Where web reads `url=` | `LensUrl` in `search.ts`: trim, `new URL().href`, core's `AxeUrl` | The same rule io's `pageUrlParam` applies, so the key web caches under is the one io stores under; web may not import io |
| A failed URL page | Fault banner, no page, counts `—`, no badge | The bundled `/deliveries` would be the wrong site, and a skeleton would read as loading |
| Where the URL field sits | A row of its own under the header row | The header row is full at 1280 px (picker, title, View). The cost, said plainly: the stage is about 52 px shorter, so beats 1 to 3 draw the page slightly smaller. `lens.browser.test.ts`'s no-scroll check still holds it at 1280 × 720 |
| Jargon for a `url=` page on the target app | None, as the task file says | The link decides (D2); `page=` is the way to the app's own pages |
| How the Race lists stored goals | Presets stay a segmented control; stored goals go in a native `<select>` beside it, width capped, text truncated | The presets, the sentence and the cast stay as beat 4 shows them; the select is new on the goal row. A dev database holds dozens of stored tasks, which a segmented control cannot fit |
| A stored goal's start URL | Shown on the goal's line for a stored goal only | The task asks for it; the presets' line stays as beat 4 shows it |
| `?task=` naming a preset | Opens that preset, unchecked, as the panel does today | A preset is no stored task; the Target screen links stored ids only |
| `?task=` naming nothing stored | The demo goal, under a line naming the id | A link should not dead-end; the line says what happened |
| Writing the chosen goal back to the URL | No | The race is not in the URL today; `?task=` picks the opening goal only |
| `GET /tasks` retries | `{ ...tasksQuery(), retry: false }` at the call site; the opening goal waits for a settled fetch | A slow failure would hold the panel for about 7 s; a stale cache would miss a task just created. `api/runs.ts` belongs to PR #208 this week |
| Where the panel's state lives | A child `RaceSetup`, keyed by the opening goal | `useReducer`'s initialiser runs once at mount; keying `StartPanel`, a view of props, would reset nothing |
| The self-check's method-aware keys | PR #208's hunk, copied word for word | Both branches need it; identical hunks merge cleanly in either order |
| Where the panel's state lives, as built (build) | `ArenaScreen` keeps the route. A `RaceFor` child, keyed by the link's `?task=`, holds the tasks query and pins the opening goal once the fetch settles. `RaceSetup` holds the reducer under it | Same effect as the row above: the reducer opens once per link on the settled opening goal. A later refetch, on window focus for example, can then never reopen the panel or drop a live race. Moving to another `?task=` remounts, as "once per link" implies: a live race view is dropped, and its runs carry on in io and show in `/runs` |
| The stored task in the fixtures (build, check) | `foreignTask` has a success no preset has (`**/orders/history`) | So the stored-goal test tells the stored task's success from the hard preset's. A copied success let a preset's pass |
| `check:self`'s `lens · url` entry (build, check) | Its measurement is at `https://example.com/`, and it is ready on the URL page's own copy | So the live line names the page asked for, and a refused `url=` that fell back to `/deliveries` cannot pass as this entry |
| Which side of the Race wins the merge (build, merge) | Main's `panel-state.ts`, `panel-calls.ts`, `start-panel.tsx`, `screens/arena.tsx` and `self-check.ts` are the base. The branch's goal, select, `?task=` rules and self-check entries are ported onto them | #204 to #206 rebuilt the panel, the calls and the routes. Porting the smaller s3-16 diff onto them keeps every reviewed main behaviour as it is |
| A stored goal in #206's panel (build, merge) | `PanelState.goal: Goal` replaces `presetId`. `goalChosen` sets the goal's sentence and success draft, and accepts a stored goal's check as stored | Start needs no new check, and the success the field shows is the stored task's own, so it is shown as a preset's is |
| An edit of a stored goal's sentence (build, merge) | #196's rule for every goal. Leaving the goal's sentence empties a success that is still the goal's, and `Use the stored goal's` brings it back. The check carries the stored `startUrl` and the success as the panel holds it | #196's reason, that a reworded goal may arrive elsewhere, holds for a stored goal as much as for a preset. One rule is less to test than two |
| A stored success that is not a URL pattern (build, merge) | Held fixed: shown in words, no field, kept across sentence edits, sent unchanged | The Target screen (#208) stores `selectorPresent` goals and links them here. The panel types URL patterns only, and a new element condition is the Target screen's to make |
| The next race on a stored goal (build, merge) | `startSucceeded` spends its check as main does. Choosing it again in the select accepts it again | Main's rule, so each race gets its own task. Choosing it again is the person's explicit way to reuse the stored task, as the Target screen's run sets do |
| Where `?task=` is read and the list asked (build, merge) | `startRoute`'s `validateSearch` and `StartScreen`'s query, never the `/race` layout | `/race/$raceId` takes no goal and asks no `GET /tasks`, so `race-stored` and the race screen stay as main has them |
| How the link's goal reaches the layout's reducer (build, merge) | A keyed `OpeningGoal` under `StartScreen` settles the opening once per mount. It draws the panel on `goalChosen` at once, and an effect then dispatches the same action once | The reducer lives in the layout and opens from `keptPanel`, so its initialiser cannot take the link's goal. Drawing the reduced state at once means no frame shows the old goal, and the static-render tests see it |
| `?task=` naming nothing stored, or a failed list (build, merge) | The line `No stored goal <id>: …` over the panel as it stood (kept, or the demo goal on a fresh page), and nothing dispatched | Main keeps the panel's last choices for the page's life. A broken link should not throw them away, and on a fresh page this is still the demo goal, as §4 said |
| A Back to `/race?task=` (build, merge) | Applies its goal again | It is a visit to the link. The Race tab and "New race" go to `/race`, so they never apply it |
| The branch's `RaceFor`, `RaceSetup`, `initialPanel(goal?)`, `forOf` and `startRace`'s label (build, merge) | Dropped | Main's layout and `StartScreen`, `initialPanel()`, `checkedFor` and `goalLabel(race.task)` cover them |
| A stored goal's start URL (build, merge) | A mono line `start · <startUrl>` above main's success field, for a stored goal only | Main's success line became an input, so the branch's combined `goalLine` has no place. The preset's strip is unchanged for beat 4 |
| `check:self` on main's Race (build, merge) | `race` adds `/tasks` and waits for `#arena-stored-goal` and main's History heading. `race-live` splits `/tasks` into `POST /tasks` and the `GET` list. `race · stored goal` also answers `/races: []` | The setup now asks `GET /tasks`, and main's History asks `GET /races`, so an unlisted request would fail the check |

## Risks

- **PR #208 merging first.** `self-check.ts` would conflict only outside the copied hunk, in the screen list, where both branches add entries. That is settled inside this task's entries at the merge in phase 9.
- **The `pnpm dev` box.** The Race on a foreign goal needs the Extractor and the LLM Actor, so a key in `.env`, and the worktree has none. The Lens half needs only network. If the key is not linked, that half is left to the user with exact steps.
- **TanStack's search parsing.** A `url=` value is a string that JSON cannot parse, so the default parser keeps it as one. A test pins the round trip, both the plain-anchor form and `encodeURIComponent` as `s3-15` writes it.

## Review note

Round 1 (spec-reviewer, 2026-10-07): ready after fixes, no blocking finding. Every finding was taken:

- should: the opening goal could be read from a stale or slow list. Now `retry: false`, and the goal waits for a settled fetch (§4).
- should: keying the panel reset nothing. The reducer and the race state move into a keyed child, `RaceSetup` (§4).
- should: "nothing moves" overstated it. The Lens stage shrinks by the URL row, and the Race gains the select. Both are now said in Constraints and the decision log, and the select is capped and truncated.
- should: the `race` self-check entry could measure the skeleton. Its `ready` now waits for the select (§5).
- nit: `LensUrl` must add an issue, not throw. Done, with refused-URL tests (§1).
- nit: the browser's URL check pre-empts the alert. The form is now `noValidate` (§3).
