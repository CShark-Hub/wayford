# s3-17 — The nav carries the target: spec

Task: `tasks/s3-17-nav-carries-target.md` · Branch: `feature/s3-17-nav-carries-target` · Date: 2026-10-08
Status: approved 2026-10-08 (auto)

## Goal

The top bar leads the Lens, the Race and the Report to the target last opened on the Target screen, and leads back to that target, until it is cleared.

## Constraints that bind

- D12: one current target, set and cleared only by the Target screen, kept in the tab's `sessionStorage`.
- D13: the nav's links and the goal view's links are the same links; Cast and Boundary do not change; a shown race still wins the Race tab, and a change of target forgets it.
- D14: "The screens still read only their own URL." Nothing a screen draws reads the current target. A typed `/lens` opens the target app's `/deliveries`.
- D15: with no target, nothing changes but the one new nav entry. `/` still opens the Cast.
- Task Out of scope: no change inside the Lens, the Race, the Report or the Boundary; no list of goals; no setter outside the Target screen.
- `docs/DESIGN.md`: no text under 16 px, no arbitrary sizes, `check:self` passes in Daylight and Night at 1280 × 720.
- `theme.ts` precedent: storage can be blocked; a read or write that throws is swallowed.

## Design

### `packages/web/src/target/current-target.ts` (new)

```ts
export const CURRENT_TARGET_STORAGE_KEY = "wayford-target";

/** The stored shape, read back through zod: a broken value reads as nothing. `HttpUrl`, what io
 *  stores as `Task.startUrl`; `LensUrl` applies only to the Lens link (review finding 1). */
export const CurrentTarget = z.object({ taskId: TaskId, startUrl: HttpUrl });
export type CurrentTarget = z.infer<typeof CurrentTarget>;

export function readCurrentTarget(): CurrentTarget | undefined;
export function setCurrentTarget(target: CurrentTarget): void;  // forgetRace() when taskId differs
export function clearCurrentTarget(): void;                 // forgetRace() when one was set
export function useCurrentTarget(): CurrentTarget | undefined;
export function followStoredGoal(taskId: TaskId, stored: Task | null | undefined): void;
export function targetOf(task: Task): CurrentTarget;           // its id and start URL
export function targetLinks(target: CurrentTarget | undefined): TargetLinks;
```

- **Storage access.** Every touch of `sessionStorage`, the global's accessor included, sits in a `try`. A throw on read gives nothing; a throw on write is dropped. In Node there is no `sessionStorage`, so reading the global throws there too: the store reads nothing, and every existing static render is unchanged.
- **Read.** The raw string is read; JSON parse and `CurrentTarget.safeParse` in a `try`; a failure is nothing. The last raw string and its parse are cached, so `useSyncExternalStore`'s snapshot keeps its identity between renders (a fresh object each read would loop).
- **Write.** `setCurrentTarget` compares the new `taskId` with the current read: a different id (from nothing included) calls `forgetRace()`. It writes `JSON.stringify({ taskId, startUrl })` and notifies listeners. `clearCurrentTarget` removes the key, calls `forgetRace()` if a target was set, and notifies. Listeners are notified even if the storage write threw. The cache is keyed by the raw string read, so the hook reflects the storage as it is with no clearing.
- **Hook.** `useCurrentTarget()` is `useSyncExternalStore(subscribe, read, read)`, as `useShownRace` is: a static render reads the same store, so a test sets it (with a stubbed `sessionStorage`) to render both states.
- **`followStoredGoal(taskId, stored)`**, the Target screen's rule (D12): a `Task` sets the current target to it; `null` (io holds none under the id) clears it only when the current target's `taskId` is `taskId`; `undefined` (reading, or io failing) does nothing.
- **`targetLinks(target)`** returns typed TanStack link options (`linkOptions`) for `target`, `lens`, `race` and `report`:

  | Key | No target | With a target |
  |---|---|---|
  | `target` | `{ to: "/target" }` | `{ to: "/target", search: { task: id } }` |
  | `lens` | `{ to: "/lens" }` | `{ to: "/lens", search: { url } }`, `url` the start URL through `LensUrl`; refused, `{ to: "/lens" }` |
  | `race` | `{ to: "/race" }` | `{ to: "/race", search: { task: id } }` |
  | `report` | `/report/$taskId` on `DEMO_GOAL` | `/report/$taskId` on `id` |

  The goal view builds its Lens and Race links from `targetOf(task)`, the task it draws, before the store has been written. The store keeps the task's start URL as io holds it, and `LensUrl` is applied in one place, the `lens` link, so the nav's links from the stored target equal the goal view's from the task by construction, for every URL io stores.

### `components/top-bar.tsx`

- `STORY_NAV` gains `{ number: "00", label: "Target", to: "/target" }` first. Each entry keeps its `to` (and `params`) as its link with no target: `/target`, `/cast`, `/lens`, `/race`, `/report/$taskId` on `DEMO_GOAL`, `/boundary`. So the test's `pathOf(entry)` and the per-entry "only X is current" `test.each` keep working, now with `00 Target` current on `/target` and on `/target?task=<other>`. `targetLinks` lives in `current-target.ts`; the four entries that carry a target are marked `carries` with their key into it.
- `TopBar` reads `useCurrentTarget()` and `useShownRace()`. Each entry's link: `race` with a shown race → `/race/$raceId`; `target`, `lens`, `race`, `report` → `targetLinks(current)[key]`; else its fixed link.
- Every nav `Link` gets `activeOptions={{ includeSearch: false }}`. TanStack marks a link current only when its search is a subset of the location's (`deepEqual(..., partial)`), so `/lens?url=X` would lose `aria-current` on a plain `/lens`. A nav entry is current on its screen's path, whatever the search, as today.
- With a target, `00 Target` draws the host (`new URL(startUrl).host`) after its label in a mono span, `max-w-` on the spacing scale with `truncate`, not `aria-hidden`, so the link's name is "Target example.com". The host span carries `title={host}` for the cut case.
- The right-hand `Target` button is removed; `Runs` stays.

### `screens/target.tsx` and `target/target-view.tsx`

- `StoredGoal`: `useEffect(() => followStoredGoal(taskId, stored), [taskId, stored])`. It sets on a held task, which is when `LiveGoal` draws, and clears on io's not-found.
- `GoalView` gets `onClearTarget: () => void`. A "Clear target" outline button sits beside "New goal". The screen's handler: `clearCurrentTarget()`, then navigate to `/target` with `search: {}`, the form.
- "Open in the Lens" and "Race on this goal" become `<Link {...links.lens}>` and `<Link {...links.race}>` with `links = targetLinks(targetOf(task))`. The comment about plain anchors goes.

### Data flow

Check a goal → URL takes `?task=id` → `StoredGoal` reads the task → effect `followStoredGoal` → `setCurrentTarget` (forgets the race if the id changed) → listeners → `TopBar` re-renders with the target's links and host. Reload → `sessionStorage` still holds it → the bar reads it on first render. "Clear target" → `clearCurrentTarget` → bar back to today's links → the form.

## Files

- `packages/web/src/target/current-target.ts` (new): the store, the hook, `followStoredGoal` and `targetLinks`.
- `packages/web/src/target/current-target.test.ts` (new): the store's boxes.
- `packages/web/src/components/top-bar.tsx`, `top-bar.test.tsx`: `00 Target`, the links, the host, no right-hand Target.
- `packages/web/src/screens/target.tsx`, `target/target-view.tsx`, `screens/target.test.tsx`: set, clear, the button, typed links.
- `packages/web/scripts/self-check.ts`: a `target · nav` entry. Only the Target screen sets the target (D12), so it opens the goal view: path `/target?task=<id>`, `/tasks` answers `[LONG_HOST_TASK]` (the hard goal on a long host such as `https://checkout-and-order-history.a-rather-long-subdomain.example-shop.co.uk/`, under its own ULID id), Scout and the report answer as `target · report`'s do, keyed by that id, and `ready` waits for the goal view and for the host in the bar's `00 Target` link. It measures the floors (text, contrast, target size) on the bar with a host; the fit at 1280 px is asserted in the browser test, since `check:self` does not measure overflow.
- `packages/web/scripts/target.browser.test.ts` (new, not in the task's list): only what static renders cannot reach, with io answered per path for the Target screen alone: the goal view's effect sets the bar's hrefs and host; a reload keeps them; "Clear target" brings back today's hrefs; a race opened, then "New goal" keeps the target and the race until the form's next goal is accepted, and that goal set leads the Race tab to it; a typed `/lens` opens `/deliveries` (D14); the host's width keeps the story nav inside its column at 1280 px in both themes.
- `docs/DESIGN.md`: the top bar's nav and the `/target` row.
- `tasks/s3-17-nav-carries-target.md`: boxes ticked at verify.
- `tasks/BOARD.md`: `review` with the PR, committed to `main` as the claim was (not on this branch).

## Acceptance mapping

| Acceptance box | Proven by (test name or command) |
|---|---|
| current-target: set read back, cleared reads nothing | `current-target.test.ts` "a target set is read back, and a cleared one reads as nothing" |
| current-target: broken value reads nothing | "a broken stored value reads as nothing" (bad JSON, bad id, refused URL) |
| current-target: throwing storage | "a storage that throws reads as nothing, and setting a target does not throw" (getter and methods throw) |
| current-target: forget race | "setting a new task forgets the shown race, and setting the same task does not" |
| top-bar: numbering, no Target button | `top-bar.test.tsx` "the nav numbers Target, Cast, Lens, Race, Report and Boundary, 00 to 05, and the right of the bar holds no Target button" |
| top-bar: no target, today's links | "with no target, every link is today's" |
| top-bar: with target, four carry it | "with a target, Target, Lens, Race and Report carry it, and Cast and Boundary do not" (and the host in the Target link's name) |
| top-bar: shown race wins | "a shown race still wins the Race tab" (with a target set) |
| target: goal view sets | `target.test.tsx` "the goal view sets the current target" (`followStoredGoal` with a task) and `target.browser.test.ts` (the effect, live) |
| target: not held clears only same id | "an id io does not hold clears the current target when it is that id, and leaves another one" |
| target: Clear target clears | "Clear target clears it": the button beside New goal in the markup, `onClearTarget` wired; `target.browser.test.ts` clicks it |
| target: goal view links equal nav's | "the goal view's Lens and Race links equal the nav's" |
| `pnpm dev` steps 1 to 6 | A documented manual check (`docs/CONVENTIONS.md`, "Tests"): the six steps with exact clicks in the task's Outcome and the PR, since checking a goal calls the Extractor and needs a key. Steps 4 to 6 and the reviewer's notes are also covered by `target.browser.test.ts` with io answered per path; steps 1 to 3 rest on `s3-16`'s screens, which take a target by link, and on the nav's hrefs asserted in `top-bar.test.tsx`. Screenshots of the bar with and without a target go in the PR. |
| Demo beats 1 to 4 unchanged | "with no target, every link is today's", the existing Lens, Race and self-check browser tests unchanged and green |
| `check:self` with new entry | `pnpm --filter @wayford/web check:self`: `target · nav` in Daylight and Night |
| root lint, typecheck, test | `pnpm lint`, `pnpm typecheck`, `pnpm test` |

## Decision log

| Question | Taken | Why |
|---|---|---|
| How do static tests prove effects and clicks? | The rules are pure functions (`followStoredGoal`, `targetLinks`) tested in `target.test.tsx`; a new `target.browser.test.ts` drives the live wiring | The web package renders statically in Node, with no DOM; the repo already puts click flows in `.browser.test.ts` (`docs/CONVENTIONS.md`, "Tests") |
| Where does the set happen? | One effect in `StoredGoal`, over `followStoredGoal` | It is the one place that knows both "held" and "not held"; `LiveGoal` draws only when held, so this is "when it draws a task io holds" |
| Does clearing forget the shown race? | Yes, when a target was set | D13: "a change of current target forgets it"; box 6, every tab where it leads today, then holds for a race on the cleared site |
| Is a nav tab current when the URL's search differs? | `activeOptions.includeSearch: false` on every nav link | TanStack matches search by subset, so `/lens?url=X` would not be current on `/lens`; today every tab is current on its path |
| Storage value shape | JSON `{ taskId, startUrl }` under `wayford-target` | Matches the `wayford-theme` key style; one key per D12 |
| How is the stored start URL read back? | Core `HttpUrl`, what io stores as `Task.startUrl`; `LensUrl` only inside the `lens` link, which falls back to `/lens` when it refuses | Deviation from the task's "as `TaskId` and `LensUrl`": a URL with a user and a password is a valid task in io, and reading it through `LensUrl` would drop the whole target from Target, Race and Report while the goal view still carried it (review finding 1) |
| Snapshot identity for `useSyncExternalStore` | Cache by raw string | A fresh parse per read would re-render forever |
| Host width | `max-w-` on the spacing scale plus `truncate`, measured in the browser test at 1280 px | `docs/DESIGN.md` bans arbitrary sizes; the bar already scrolls sideways as a last resort |
| Screenshots for the PR | Taken from the browser test's page and attached by a human | `gh` cannot attach images; committing them adds binaries for one review |
| `lens.test.tsx` lists the whole nav, so `00 Target` fails it (build) | Add `Target` as its first row and read the Lens at index 2 | A test of the bar's list, not a change inside the Lens; the Out of scope covers the screen, not this assertion |
| The host's width (build) | `max-w-36` with `truncate`, measured at 1280 px with the long host on the Target screen (empty slot) and on a stored Report (badge and tag): the nav does not scroll | On the spacing scale. `max-w-40` overflowed the nav by 3 px beside a full slot (branch review) |
| What the bar names (build) | `URL.host`, the host with its port | Two targets on one machine, such as `localhost:5174` and `localhost:5175`, read apart (branch review) |
| The link's name with the host (build) | A space before the host span, so the name reads "Target example.com" | In a flex row the space draws nothing |
| Where "Clear target" sits (build) | After "New goal", in the same row | The spec says "beside" |

## Risks

- TanStack `linkOptions` typing with a union of search shapes in one `Link` spread: if inference fails, each nav entry renders its own `<Link>` branch, as the shown-race branch does today.
- The self-check's top-bar row at 1280 px with a long host and a full slot (badge and tag): the host's max width is tuned in the browser test.
- Browser tests are slow under load (two timed out in the baseline and passed on rerun); the new file keeps to one Vite server and one Chromium.

## Review note

Round 1 (`spec-reviewer`): ready after fixes, no blocking finding. All five taken: the store reads `startUrl` as `HttpUrl` and applies `LensUrl` only to the Lens link (1); the browser test is cut to what static renders cannot reach, and steps 1 to 6 are a documented manual check (2); `STORY_NAV` keeps `to` as each entry's no-target link (3); the `target · nav` entry is spelled out and the fit check placed in the browser test (4); `tasks/BOARD.md` listed (5). No second round: no blocking finding.

Branch review (`branch-reviewer`): merge after fixes, no blocking finding. Taken: the two static Target tests renamed to what they check, the live set and click left to `target.browser.test.ts`; the fit measured beside a full slot too, and the host narrowed to `max-w-36`; `TargetOf` folded into `CurrentTarget`; `hostOf` inlined; the store's duplicate link and rule tests cut; `URL.host` for the port; the not-found comment made exact. Security review: no findings.

Simplify (four angles): the bar's four no-target links come from `targetLinks(undefined)`, marked `carries`, so they are written once; `targetOf(task)` maps a task for the store and the goal view; one `stubSessionStorage` in `target/test-support.ts`; the browser test starts the app with the self-check's `startWebApp` and so moved to `scripts/`, as `cast.browser.test.ts` sits there; `goalResponses` in the self-check; repeated test halves cut. Deferred: tying a shown race to its goal instead of `forgetRace()` needs the Race screen's `showRace`, outside this task.

Rebase onto `main` after s3-18 (#213): the top bar lost its slot, so the badge-and-tag measurements above are history. The bar now holds the nav, Runs and the theme toggle on every screen, and `max-w-36` keeps more room than it was measured with. The long-host browser test no longer reads a slot on the stored Report; it checks the bar draws no source badge there and still fits (that half cut in the PR review, below).

PR review (#216, dawidtheshark): merge after fixes, no blocking finding. Taken: the browser race test checks that "New goal" keeps the target and the race (the Interface's rule had no test); the long-host test measures the Target screen alone and the story nav alone, since the bar is one bar on every screen and the nav is the header's `minmax(0,1fr)` column; the race test waits on the nav's Race link, not on run events; the reload after "Clear target" and the copied fixtures cut; `storage()` cut, as a missing `sessionStorage` throws inside the same `try`; the `targetLinks` and D14 comments made exact; this Design section brought in line with the code.
