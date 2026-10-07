# s3-12 — Race and run detail redesigned: spec

Task: `tasks/s3-12-design-pass-arena-run-detail.md` · Branch: `feature/s3-12-race-run-detail` · Date: 2026-10-06
Status: approved 2026-10-06, with the video player kept

## Goal

The Race and run detail match `docs/design/screens/race.html` and `run-detail.html`. The race reads at a glance, one lane per persona. A step replay puts the screenshot beside the text the model read. Both screens pass `check:self` in Daylight and Night.

## Constraints that bind

- **Look only** (task). Run events, avatar states and the replay's data stay as they are. Nothing changes in `RunEvent`, `RunResult`, `avatarView`, `runView`, `finishOrder`, `raceOver`, `streamLost`, `observedFrom`, `describeAction` or the panel's reducer. The panel still checks the sentence before a start, and `?step=N` is still the replay's permalink.
- **Race setup** (task). One strip, not a form:
  - the goal choice, with its sentence large and its success condition in mono;
  - the cast as avatar toggles, 3 to 5;
  - the seed;
  - `Start the race` as the one primary button.
- **Race lanes** (task). One per persona, stacked full width. Each holds:
  - avatar and name, step pips by kind and the goal post;
  - the latest screenshot;
  - the outcome and the clock in mono;
  - `narration · after the fact`.

  There is no progress bar and no Scout line. Three lanes fit 1280 × 720 with no scroll.
- **Source badges** (task, `docs/DESIGN.md` Principle 6). Each comes from the screen's own data.
  - The Race shows `live` while its streams are open, and no backend tag.
  - Run detail shows `stored`, with its backend.
- **Run detail** (task).
  - Header: `persona | seed | run id` in mono, the facts row and the two downloads.
  - The StepTimeline moves with ← and →.
  - Two columns: the screenshot with the click point in `signal`, and the model's text, line-numbered on `paper-sunken`.
  - Filtered out, Dice and Jev sit under the screenshot.
- **Self-check** (task): both screens join the `check:self` list, served the run fixture and its events.
- **The decision panel** (`s3-10`, done): this task restyles it into `docs/DESIGN.md`'s JevDraw. It keeps s3-10's rules:
  - one segment per option, in offer order;
  - the drawn option is core's `drawOption`, never the top pick;
  - the confidence is labelled as the model's.
- **Design rules** (`docs/DESIGN.md`):
  - tokens only: no `text-[…]`, and no colour, size, radius or shadow outside `index.css`'s token block;
  - 16 px text floor, 32 px targets;
  - `signal` only for measurement lines: the click point and the Jev needle here;
  - persona colour only through the slot (`--p`, `--p-ink`, `--p-soft`);
  - the fixed outcome words: Got through, Gave up, Over budget, Error;
  - no emoji; own glyphs at a 1.75 stroke.
- **Out of scope** (task):
  - live video, avatar motion and a Jev toggle in the Race;
  - Scout's line, and any Scout endpoint;
  - the runs list (`s3-14`).
- **Parallel work.**
  - `s3-11` adds an `exclude` field to `SelfCheckScreen`, and this task adds two. Both touch `scripts/self-check.ts`, so whichever merges second rebases.
  - PR #178 edits `persona-avatar.tsx`. This task does not touch that file.

## Design

### 1. Shared components (`packages/web/src/components/`)

**`outcome.tsx`: Outcome.** A glyph, then a word, as `.wf-outcome` draws it. The glyphs are inline SVGs at 20 px with a 1.75 stroke, copied from `components.html`.

```ts
export type OutcomeKind =
  | "through" | "gaveUp" | "overBudget" | "error"   // a run that ended
  | "waiting" | "moving" | "stuck"                  // a race lane still running
  | "lost";                                         // a lane whose stream broke before its end
export const OUTCOME_WORDS: Record<OutcomeKind, string>;
//   Got through, Gave up, Over budget, Error; Waiting, Moving, Stuck read from
//   avatar/state.ts's STATE_WORDS, which stays the one live vocabulary; Stream lost
export function outcomeKind(outcome: RunOutcome): OutcomeKind;
//   success → through, gave_up → gaveUp, budget_exceeded → overBudget, error → error
export function Outcome({ kind }: { kind: OutcomeKind }): JSX.Element;
```

Colours:

- Gave up and Over budget are `ink-2`.
- Error and Stream lost are `fault`: both are the tool failing, not the persona.
- A live state's glyph takes `var(--p)`, the persona's slot.
- Everything else is `ink`.

The Waiting, Stuck and Stream lost glyphs are not in `components.html`. They are drawn to the same stroke: an open circle for Waiting, a circle with a bar for Stuck, and a broken circle for Stream lost.

**`race-lane.tsx`: RaceLane.** Draws only what it is given. `race-view.tsx` folds the events.

```ts
export type Pip = { kind: "act" | "scroll" | "back" | "wasted" | "now"; word: string };
export function RaceLane(props: {
  headingId: string;                      // aria-labelledby of the <article>
  slot: PersonaSlot;                      // sets --p, --p-ink, --p-soft
  avatar: ReactNode;                      // PersonaAvatar, 64 px
  name: string;                           // <h3>, display-m
  pips: readonly Pip[];
  place: number | undefined;              // 1-based, got-through runs only
  shot: { src: string; alt: string } | undefined;
  outcome: OutcomeKind;                   // an ending raises the lane and closes its track
  clock: string;                          // "0:15.5" or "—"
  steps: string;                          // "5 steps so far" or "5 steps"
  detail: string | ReactElement | undefined; // what a state rests on: stuck page, error text, lost stream
  narration: string | undefined;
}): JSX.Element;
```

The lane derives everything else from `outcome`. An ending (`isEnding`) raises the lane, an ending short of the goal (`markedEnding`) closes the track on its glyph, Got through reaches the post, and a detail line is in `fault` when the outcome is Error or Stream lost.

The layout follows `.wf-lane`:

- **Grid:** `236px | 1fr | 168px | 168px`, two rows, with gaps of `space-2` and `space-5`, and padding of `space-3` and `space-5`.
  - Row 1: who, track.
  - Row 2: the detail line, when there is one, then the narration, spanning columns 1 and 2.
  - The screenshot and the right column span both rows.

  This differs from the reference, whose narration row runs under the screenshot too. Here it sits beside the screenshot, so row 2's two lines cost no height. Row 1 is 64 px and row 2 is 48 px in every state, so a lane is 146 px with its padding and border, and three lanes fit 720 (see the narration row of the decision log).
- **Box:** `surface`, a hairline `line` border and `radius-md`. A finished lane adds `shadow-raised`.
- **Track:** 40 px tall, with a 2 px `line` rule through the middle. Each pip is 16 px:
  - `act` is filled with `--p`;
  - `scroll` is outlined in `--p`;
  - `back` is a circle outlined in `ink-3`;
  - `wasted` is hatched in `ink-3` (main's `hatch` utility, with `--hatch-line` set to ink-3; see below);
  - `now` is 20 px, ringed in `--p`.

  After the pips comes the end mark: the outcome glyph for Gave up, Over budget and Error. Last, at the right, the goal post: a 3 px `ink` post with a flag, filled `--p` once reached, carrying the ordinal tag ("1st") for a got-through run.

  The track is `role="img"`. Its `aria-label` counts every step, the give-up included, as the right column does: "5 steps: click, scroll, doubleClick, wasted, gave up".
- **Detail line:** in `ink-2`, or in `fault` when the outcome is Error or Stream lost.
- **Screenshot:** `<img>`, 168 px wide at 16:10, `object-fit: cover`, top-aligned. Before the first screenshot, a sunken empty box reads "No screenshot yet".
- **Right column:** Outcome, then the clock in `readout`, then `steps` in `mono` `ink-3`.
- **Narration:** the label `narration · after the fact` in `mono-label` `ink-3`, followed by the text in `ink-2`. The text is clamped in CSS only, so the DOM keeps all of it: to two lines with no detail line, and to one under a detail line (review). The label stays when there is no narration.

**`step-timeline.tsx`: StepTimeline and its keys.**

```ts
export function StepTimeline(props: {
  runId: RunId;
  steps: readonly RunStep[];   // sorted by stepIndex
  position: number;            // index into steps, -1 when none is current
}): JSX.Element;
/** -1 for ←, 1 for →, undefined for any other key, a modified one, or one already handled. */
export function stepKeyDelta(event: Pick<KeyboardEvent,
  "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "defaultPrevented"> & {
  target: { tagName?: string; isContentEditable?: boolean } | null }): -1 | 1 | undefined;
/** The step before or after; undefined past either end; the first step at -1. */
export function neighbourStep(steps: readonly RunStep[], position: number, delta: -1 | 1): RunStep | undefined;
```

`useStepKeys`, the hook that turns the keys into a move, is private to the file: `StepTimeline` calls it, so a page with the timeline has its keys.

- `role="group"`, labelled "Steps". Each step is a 40 px link, the existing `createLink` anchor. Its `href` is `?step=N`, it sets `aria-current="step"` on the current entry, and its `aria-label` reads "step 2: /deliveries · doubleClick e2".
- Current: `ink` fill. Wasted: hatched. The last step: a 2 px `ink` border, with the outcome glyph after its number when the run ended in Gave up, Over budget or Error.
- `useStepKeys` adds one `keydown` listener on `window` and removes it on unmount.
  - It skips a key with a modifier, a target that is an input, textarea, select or contenteditable, and an event already handled. A Radix tab or toggle that moves on arrows calls `preventDefault`, and React's root listener runs before `window`'s.
  - Otherwise it calls `navigate({ to: "/runs/$runId", params, search: { step } })` for the neighbour `neighbourStep(steps, position, delta)` returns: the step before or after. At either end it returns nothing and nothing happens. At position -1, after a `?step` no step holds, either key opens the first step.
- After the timeline, two `wf-kbd` hints, ← and →, marked `aria-hidden`.

**`jev-draw.tsx`: JevDraw.**

```ts
export function JevDraw({ decision }: { decision: DecisionRecord }): JSX.Element;
```

- **Bar:** 36 px, the options end to end in offer order. Each segment's width is `drawScale`'s range. Segments alternate `paper-sunken` and `surface`, and the drawn one is filled with `--p`.
- **Needle:** a 3 px `signal` post at `rolled`, flagged "rolled 0.4" in `mono` on `signal`, with `on-signal` text.
- **Labels under the bar:** the drawn option's action, as `describeAction` writes it, plus "0" and "1" at the ends.
- The bar is `role="img"`, with an `aria-label` such as "10 options, rolled 0.4, drew click e3". Each segment carries a `title`: "click e3 · 0.62".

`drawScale` moves from `runs/decision-panel.tsx` into `jev-draw.tsx`, unchanged. `decision-panel.tsx` imports it from there, so there is no import cycle. JevDraw and StepTimeline still import `describeAction` from `runs/replay.ts`, a leaf that imports only core and zod.

**The `hatch` utility** (`index.css`). A degraded or wasted thing is hatched: the wasted pip, the wasted step and, in `s3-11`, a degraded Lens element. The stripes need px stops, and `docs/DESIGN.md` allows sizes only in the token block, so one utility holds them. The plan was for whichever of this task and `s3-11` merged first to own it.

`s3-11` merged first, with `@utility hatch` in `--hatch-line` (default `--line`, 2 px stripes in 7). This task adds none and does not change `index.css`. The wasted pip sets `[--hatch-line:var(--ink-3)]`, as the reference draws it; the wasted step keeps the default `--line`, as `run-detail.html`'s `.wf-step--wasted` draws it.

### 2. The Race (`screens/arena.tsx`, `arena/**`)

- **`Race`** (`arena/panel-calls.ts`) changes from `{ goal, seed, runs }` to `{ task: Task; label: string; seed: Seed; runs: StartedRun[] }`.
  - `task` is the task the check accepted, so the strip shows its id, its goal and its success condition.
  - `label` is the preset's label ("Hard goal").
  - `startRace` fills both from state it already holds.
- **`StartPanel`** (`arena/start-panel.tsx`): the setup strip. It dispatches the same `PanelAction`s, and keeps the sentence textarea, the seed input, every status and alert, and every id a `aria-describedby` points to. So `panel-state.ts` and its rules are untouched. The goal choice and the cast change control, as below, and four label texts change.

  A control that is hidden, even visually only, is never measured by `collect` (it skips anything not seen, 1 × 1 `sr-only` boxes included). A hidden checkbox or radio would therefore escape the self-check. So every control in the strip is a control a sighted person sees:
  - **Goal choice:** the existing SegmentedControl (Radix `ToggleGroup`), labelled `goal`, one item per preset, named by the preset's label. Tests find an item by that name and read its pressed state. Only the chosen goal's sentence and success condition are drawn below it, large.
  - **Sentence:** the textarea is drawn in `display-m` on `paper`, with a `line-strong` underline, two rows and no resize. Under it, `success · ` and `successText`, today's exhaustive helper for all three `SuccessCondition` types, in `mono` `ink-3`. The race's goal strip uses the same helper.
  - **Check:** "Check the goal", an outline button, with the status region beside it.
  - **Cast:** the five personas as avatar toggles, as `components.css` draws `button.wf-avatar[aria-pressed]`. Each is a `<button type="button" aria-pressed>` with the id `arena-persona-<profile id>`, holding a 56 px `PersonaAvatar` and the name, which names it. A click dispatches `personaToggled`, as the checkbox did.
    - Pressed: a 2 px `paper` gap, then a 2 px `--p` ring around the avatar.
    - Disabled (a sixth at five chosen): the avatar at 50 % opacity and the name in `ink-3`, which holds 4.5:1. The button itself keeps full opacity, so its name is measured as drawn.
    - The 3-to-5 line follows the toggles, and the group (`role="group"`, labelled `cast`) is described by it.
  - **Seed:** a 40 px mono input with its `seed` label.
  - **Start:** `Start the race`, the one primary button, with its blocker line and alert under it.
  - **Labels:** lowercase `mono-label`, as instrument labels are. Today's "Goal", "Sentence", "Personas" and "Seed" become `goal`, `sentence`, `cast` and `seed`, so these accessible names change.
- **`RaceView`** (`arena/race-view.tsx`) takes `task` and `label` where it took `goal`.
  - **Goal strip:** the `label` Tag and the task id in `mono-label` `ink-3`. Then the goal sentence as the `<h2>`, in `display-m`, between curly quotes. Then `success · URL matches …` in `mono`.
  - **Right of the strip:** the seed in a 40 px mono box (`seed 1`), "New race" as an outline button, and its waiting line, unchanged.
  - **Lanes:** an `<ol>` of RaceLane, one per run, in `runs` order. Pips come from a new pure fold, `stepPips(events, lost)` in `arena/race.ts`:
    - landed click, doubleClick or type → `act`;
    - landed scroll or wait → `scroll`;
    - landed back → `back`;
    - `stepWasted` → `wasted`;
    - a step observed but not landed while the run has not ended and its stream is not lost → `now`;
    - a landed `giveUp` makes no pip: the end mark stands for it.
  - **Ordinals:** `throughPlaces(finishes)` in `arena/race.ts` ranks the got-through runs among themselves, from `finishOrder`'s order. Ties share a place.
  - **Clock:** `clockText(ms)` in `arena/race.ts` writes m:ss.d, such as `0:15.5`, or "—" before `runStarted`.
  - **Steps line:** `stepsText(events, ended)` in `arena/race.ts`. It counts the steps begun, every `stepObserved` index, the give-up's included: "5 steps" once the run has ended, and "5 steps so far" while it runs.
  - **Outcome:** `laneOutcome(view, lost)` in `arena/race.ts`, pure and tested over every case:
    - `lost` → `lost`, never a live state, since a broken stream says nothing about now;
    - ended → `outcomeKind(view.ended.outcome)`;
    - otherwise idle → `waiting`, moving → `moving`, stuck → `stuck`.

    The end mark on the track is the same kind, for an ended run that did not get through.
  - **Detail line:**
    - stuck → "Stuck: the last 2 steps left `/settings` as it was" (the path in mono, as now);
    - error → `runFailed`'s message, in `fault`;
    - lost stream → "Stream lost: last seen moving", in `fault`, with the avatar plain and at 50 % opacity, as now.

    Gave up no longer prints the stored outcome after it. Over budget now has its own word.
  - **Finish order:** the list stays, with its heading and its one `aria-live` region. It is visually hidden (`sr-only`), because a fifth row would break the 720 px fit; to the eye, the goal posts give the places of the runs that got through, and the clocks the times. It numbers only the runs that got through, with the places their goal posts show ("1. Ada Got through 0:06.5"); the other ended runs follow unnumbered, then the lost ones.
  - **Badge:** `TopBarSlot` holds `<SourceBadge source="live" />` while `!raceOver(runs, snapshot)`. Once the race is over the slot is empty: the streams are closed, and the screen holds nothing stored. A browser test checks the slot during and after a race.
- **`ArenaScreen`:** the page column is `content-max`, with `space-6` gutters. The `<h1>Race</h1>` stays as the page's one h1, visually hidden, since the reference shows no title row. The strip's `<h2>Start a race</h2>` is hidden the same way.

### 3. Run detail (`screens/run-detail.tsx`, `runs/step-replay.tsx`, `runs/decision-panel.tsx`)

- **Badge:** `TopBarSlot` holds `<SourceBadge source="stored" />` and `<Tag variant="plain">{backendOf(run)}</Tag>`. `backendOf` is unchanged: a step carrying a decision means `jev`. The task says "the backend its Actor model names", but web cannot tell Jev's model id from any other, and s3-10 settled the rule. The model id itself is in the facts row.
- **Header:**
  - The root carries the slot style (`slotStyle(slotOf(run.profileId))`).
  - Row 1: a 48 px `PersonaAvatar` beside the `<h1>`, set in `readout`. The h1 still reads `Vera | 424242 | run_vera-hard-1`, with the pipes in `ink-3`; the persona and seed are in `ink`, the run id in `ink-3`.
  - Row 1 holds only the avatar and the h1, and never wraps: a long id wraps inside the h1 (review: a ULID id put the h1 under the avatar).
  - Row 2 holds the facts and, on their right, two outline buttons, "Download video" and "Download trace", each with a download icon and `download`. A file not recorded shows no button.
  - Facts: a `<dl>` row in `mono`, which wraps:
    - outcome (Outcome)
    - duration (`formatSeconds`)
    - steps
    - cost (`costLine`)
    - actor (the model id)
    - task (its id)
    - start (the start URL)
  - The task's goal sentence goes from the header, and with it the `GET /tasks` fetch.
- **Steps strip:** between two hairlines:
  - the StepTimeline and its key hints;
  - the step caption, such as `step 1 on /deliveries · scroll down → /deliveries` or `step 3 on /settings · wasted: no action ran`. It names the target when the action has a ref, such as `click e3 link "Deliveries"`;
  - the `?step` notice, "This run has no step 9", which keeps its `role="status"`.
- **Body:** two columns, `640px | minmax(0, 1fr)` with a `space-5` gap.
  - **Left column:**
    - The head: "Screenshot", the observed URL in `mono` `ink-3`, and a SegmentedControl, Observed and After, where Observed is the default.
    - Both figures stay in the DOM, and the one not picked is `hidden`. Their captions and placeholders are today's.
    - The click point is drawn on Observed, image or placeholder, for a landed step whose performed action has a ref the observation holds. A wasted step, or an incomplete one whose action never landed, gets none. It sits at the element's `bbox` over the `viewport`, in percent:
      - four `signal` corner ticks;
      - a `signal` crosshair at the centre;
      - a flag under it, "click e6", in `mono` on `signal`.

      The observation stores boxes in viewport coordinates (`observation.ts`, #119), the same frame as the screenshot.
    - Then Radix `Tabs`, styled as `.wf-seg`:
      - "Filtered out (n)", the default on an LLM step;
      - "Dice (n)";
      - "Jev", only on a step with a decision, and the default there.

      Every panel is force-mounted and hidden while inactive, so the static render, and the tests, hold all of them.
    - **Filtered out:** the elements that carry at least one decision, in stored order. The columns are ref, role, name, state, Actor read, metrics and decisions, as today's evidence table has them. Above the table, the counts "Hidden (A1, A3)" and "Below the fold (V2)".
    - **Dice:** Proposed, Performed or Planned, and Cost, then the rolls table, as today's Action section has them. A wasted step lists its refused answers, "Refs the Actor was not shown", and its cost.
    - **Jev:** JevDraw. Beside the tabs, `confidence 0.71 · the model's, not Vera's`. Then the options in offer order, in two columns, each with its action, description, probability bar and probability as stored. The drawn one is marked "drawn" in words.
  - **Right column:**
    - **"What the model read"**, a `wf-panel`. Its head carries the meta in the text's own terms, so the two never disagree: "5 shown · 2 more below". These are the elements with a ref, then `hiddenCount` and `belowFoldCount`, each only when above 0, as the text prints its own lines for them (verify: so the meta fits beside the title at 1280). What perception removed is counted nowhere the model reads (#118), so it is not counted here either: the "Filtered out (n)" tab holds it.
    - Its body is an `<ol>` on `paper-sunken` in `mono`, one `<li>` per line of `actorObservationText`, with the line number in `ink-3`. Joined with "\n", the lines are the stored text, byte for byte.
    - The line that begins `[<ref>]` for the ref of a landed step's performed action gets the `surface` band and a mark: "drawn" on a Jev step, the action's type otherwise. Same rule as the click point.
    - A one-line note: "The page part of the prompt, as stored."
    - **Narration**, a section whose `<h3>` reads `narration · after the fact` in `mono-label`. It holds today's narration text. A wasted step lists "Answer N, not shown: click e3" with each narration. A step with no narration says "Jev writes no narration" on a Jev run, and "No narration" otherwise.
- **Recording**, kept at gate 1. Under the two columns, a section headed "Recording" (`<h2>`, `title`) holds the run's `<video controls muted preload="metadata">` at the left column's 640 px. Playwright records no sound, so there is nothing to caption. It also holds a `<dl>`, Video and Trace, which says `not recorded` for a file the run lacks, as today. The downloads stay in the header. The section sits below the replay's main moment, so the page scrolls to it, and the 1280 × 720 view is the reference's.
- **States:**
  - Loading: a Skeleton in the shape of the header and the two columns, with the run id still as the h1.
  - Not found: "No run run_missing is stored. A run is stored when it ends."
  - io down: a fault Banner, as `docs/DESIGN.md` "States" asks. It holds "This run could not be read from io.", io's message in `mono` (which carries the HTTP status, "io answered 502"), and a "Try again" button that calls the query's `refetch`.

  The text stays as the tests read it today.

### 4. Self-check (`scripts/self-check.ts`)

`SelfCheckScreen` gains one optional field, `act`, beside `s3-11`'s `exclude` (merged first), and answers that are not a 200 JSON body. Existing entries, and the ones `s3-08` and `s3-09` are adding, compile unchanged:

```ts
/** An answer that is not a 200 JSON body: io's status, an event stream, an image. */
export class SelfCheckAnswer {
  constructor(readonly status: number, readonly contentType: string, readonly body: string | Buffer) {}
}
/** `body` as JSON under `status`, such as io's 201 for a checked goal. Private to the module. */
function jsonAnswer(body: unknown, status: number): SelfCheckAnswer;
/** io's SSE framing (`id:` index, `event:` type, `data:` JSON), led by a one-hour `retry:` so a
 *  stream with no terminal event is not replayed by a reconnect while the screen is measured. */
export function eventStreamAnswer(events: readonly RunEvent[]): SelfCheckAnswer;
/** A 1 × 1 PNG, for a screenshot route. */
export const PNG_ANSWER: SelfCheckAnswer;

interface SelfCheckScreen {
  …;
  responses: Record<string, unknown>;   // a plain value: a 200 JSON body; a SelfCheckAnswer: as it says
  /** Clicks that bring the screen to the state measured, run after it opens, before `ready`. */
  act?: (page: Page) => Promise<void>;
}
```

`checkScreen` runs `act`, then waits for `ready`, both inside the race against `firstUnlisted`. A `SelfCheckAnswer` is fulfilled with its own status, content type and body.

The new screens:

| name | path | act | ready | served |
|---|---|---|---|---|
| `race` | `/race` | none | the "Start the race" button | nothing: presets and personas are bundled |
| `race-live` | `/race` | check the goal; pick Ada, Kai and Vera; start; then wait until each lane shows its last event: Ada's "1st", Kai's "5 steps so far", Vera's "5 steps" | Vera's lane outcome, "Gave up" | `/tasks` 201 `{ task: task_past-order, rewritten: false }`; `/runs` 202 with three runs; each run's `/events` stream; each run's latest `/steps/N/screenshot` |
| `run-detail` | `/runs/run_vera-hard-1?step=1` | none | the h1 | `/runs/run_vera-hard-1`: `runResultFixture`; step 0's and step 1's screenshots; `/video`, an empty `video/webm` |
| `run-detail-jev` | `/runs/run_vera-hard-jev` | none | the h1 | `fixtureJevRun`; step 0's screenshot; `/video`, an empty `video/webm` |

The player asks for its video as it loads (`preload="metadata"`), so the video route is answered. An empty body leaves the player on its error frame, which is fine for a check of text and controls. `collect` does not measure a `<video>`: it has no role it knows, and its controls are the browser's own shadow tree.

`act` does the waiting for race-live, since one `ready` locator cannot prove that three streams have delivered.

`scripts/self-check.browser.test.ts` gains tests on these screens, and on two races built only for them: `race-detail`, with a detail line in every lane, and `race-ended`, with every run ended. Each reads the top bar's slot, not the measurement (see the decision log):

- **The badges.** race-live and race-detail hold `live` and no `stored`, and race-ended holds no badge. run-detail holds `stored` and `llm`, and run-detail-jev holds `stored` and `jev`.
- **The fit.** race-live and race-detail at 1280 × 720, in both themes, have `document.scrollingElement.scrollHeight <= 720`, so the three-lane fit stays tested with and without detail lines. The 1 × 1 PNG does not change the layout: the lane's screenshot box has a fixed size.

The race's three runs live in `arena/demo-race.ts` as `demoRace`: Ada, Kai and Vera, built from Vera's fixture events with each `runId` and `runStarted.profileId` rewritten.

- **Ada:** events 0 to 8, then `runFinished` `success` at step 1. Ada gets through in 2 steps, at 0:06.5.
- **Kai:** events 0 to 15. Step 4 is observed and nothing more, so the lane reads Moving, 5 steps so far (step 4, 0-based, is under way), on the `now` pip.
- **Vera:** all 20 events. Vera gives up at 0:15.5.

This is the reference's mid-race moment, on the fixture's timeline.

## Files

| File | Why |
|---|---|
| `src/components/outcome.tsx`, `outcome.test.tsx` | New: Outcome |
| `src/components/race-lane.tsx`, `race-lane.test.tsx` | New: RaceLane |
| `src/components/step-timeline.tsx`, `step-timeline.test.tsx` | New: StepTimeline, `stepKeyDelta`, `neighbourStep`, and the private `useStepKeys` |
| `src/components/jev-draw.tsx`, `jev-draw.test.tsx` | New: JevDraw and `drawScale`, moved here (`docs/DESIGN.md` assigns JevDraw to `s3-10`, which shipped a table; its task says `s3-12` restyles it) |
| `src/arena/race.ts`, `race.test.tsx` | `stepPips`, `throughPlaces`, `clockText`, `stepsText`, `laneOutcome`: pure folds for the lane (simplify: `raceSource` went, the badge reads `raceOver`) |
| `src/index.css` | Unchanged after the merge: `s3-11`'s `hatch` utility serves this task too (see "The `hatch` utility") |
| `src/arena/race-view.tsx`, `race-view.test.tsx` | Lanes, goal strip, hidden finish order, live badge |
| `src/arena/start-panel.tsx`, `start-panel.test.tsx` | The setup strip |
| `src/arena/panel-calls.ts`, `panel-calls.test.ts` | `Race` carries `task` and `label` |
| `src/arena/fixture-race.ts` | Test data; the race's tests read `demoRace` from `demo-race.ts` |
| `src/arena/demo-race.ts` | `demoRace` and `eventsOf`, for the tests and the self-check (build: its own module, see the decision log) |
| `src/screens/arena.tsx`, `arena.test.tsx` | Page column, the hidden h1 |
| `src/screens/run-detail.tsx`, `run-detail.test.tsx` | Header, facts, downloads, steps strip, badge, the Recording section, states |
| `src/runs/step-replay.tsx`, `step-replay.test.tsx` | Two columns, tabs, click point, numbered text, narration |
| `src/runs/decision-panel.tsx`, `decision-panel.test.tsx` | The Jev tab: JevDraw, confidence, options (s3-12's task, Depends on) |
| `src/runs/details.tsx` | Its notes and tables move to tokens (`text-ink-3`, `border-line`), still shared |
| `scripts/self-check.ts`, `self-check.browser.test.ts` | Answers that are not 200 JSON, `act`, the four screens. Not in the task's file list, but its Constraints put the screens on this list |
| `tasks/s3-12-design-pass-arena-run-detail.md` | Ticked boxes and an Outcome section, at verify |

Every value the lanes and the replay need is a token already, `hatch` included. The corner ticks and the ring are drawn with Tailwind utilities over existing tokens, as `components.css` draws them.

## Acceptance mapping

| Acceptance box | Proven by |
|---|---|
| `pnpm --filter @wayford/web test` passes | The suite. New tests:<br>- `outcome.test.tsx`: each kind's word; `outcomeKind` for each `RunOutcome` and its coverage of `RUN_OUTCOMES`; `isEnding` and `markedEnding`; one glyph per kind, with no colour value written in it; the glyph alone, as the outcome draws it.<br>- `race-lane.test.tsx`: pip kinds and order, end marks, the place on a reached post, the track's label, "No screenshot yet", the narration label with and without text, and its clamp with and without a detail line.<br>- `race.test.tsx`: `stepPips` on every prefix of Vera's run, on Kai's partial run and on runs that ended mid-step; `throughPlaces` ties; `clockText`; `stepsText`; `laneOutcome` over the live states, the ended outcomes and lost.<br>- `race-view.test.tsx`, beside its rewritten tests: a lost lane draws no step under way.<br>- `step-timeline.test.tsx`: current, wasted, end, hrefs, aria-labels; the key hints, hidden, after the steps; `stepKeyDelta`'s guards as one table; `neighbourStep` at both ends and at -1.<br>- `jev-draw.test.tsx`: widths, a zero-probability segment, the needle, the drawn segment from `drawOption`.<br>- In `scripts/self-check.browser.test.ts`: the `live` badge during a race and gone after it, the stored badges, the 720 fit of the live race and of a race with a detail line in every lane, and real ← and → presses.<br>The existing race, panel, run detail, replay and decision tests keep the behaviour they pinned, rewritten only where the markup they read changed, with three deliberate drops: the old evidence table gave every observed element a row, and Filtered out lists only the elements a rule touched; the Previous step and Next step links are gone, since the timeline's links and ← → do their job; and the header's task goal, with its fallback to the task id, is gone (the task id is in the facts). |
| `check:self` passes with the Race and run detail listed, in both themes | `pnpm --filter @wayford/web check:self`: four new screens × 2 themes, 0 shortfalls, exit 0. The same runs in `scripts/self-check.browser.test.ts`, which also gets new tests:<br>- an `act` that waits on an unlisted `/api` path fails at once (race-live, race-detail and race-ended prove the event streams and `act` end to end);<br>- the badges: `live` on race-live and race-detail and gone on race-ended; `stored`, with the backend, on run-detail and run-detail-jev;<br>- the 720 fit on race-live and race-detail, in both themes;<br>- run detail's crop: the click point and its flag inside the 180 px crop near the top, mid-page and low on the page, centred mid-crop, and the frame covering the crop at both clamped edges;<br>- the Jev label row ending inside 720 on run-detail-jev. |
| The PR shows a race in progress and a step replay at 1280 × 720 beside the two reference screens, and the reviewer approves the look | Screenshots in both themes from a throwaway script (scratchpad, not committed). It serves `demoRace` and the run fixture the way the self-check does, with screenshots of the real target app (5174) in place of the 1 × 1 PNG. The reference screens are taken from `docs/design/screens/*.html` at 1280 × 720. Images go to an `assets/s3-12-screenshots` branch, as s3-10 and s3-13 did. Approval is the reviewer's. |
| `pnpm lint`, `pnpm typecheck` and `pnpm test` pass at the root | Root commands at verify |

## Decision log

| Question | Taken | Why |
|---|---|---|
| The task says tests change "only where a test reads a class name or a file path", but the references change copy and structure. | Tests change where the new markup changes what they read: the outcome words of `docs/DESIGN.md` "Copy", the clock format, tabs in place of sections, toggle buttons in place of checkboxes. Every behaviour they pin stays pinned: states, permalinks, `observedFrom`, the narration only under narration, `drawOption`, the backend rule. | The task's Context lists "Copy" and the references, and those cannot be met with the old markup. The behaviour assertions are what the line protects. |
| How does the self-check reach a race in progress, which is not in the URL? | Two optional `SelfCheckScreen` fields: answers that are not 200 JSON, and `act` | A race URL would change behaviour, and "look only" forbids it. The harness is the one place that can click. |
| A stream with no terminal event (Kai) reconnects, and the same body would replay. | `retry: 3600000` leads each fixture stream | One line; the check measures within seconds |
| Screenshots in the self-check | A 1 × 1 PNG | The check measures text and controls, never images. Real pictures are only for the PR. |
| The lane's dimension line ("contrast 3.0:1", "attention 11") | Left out | `docs/DESIGN.md`'s RaceLane row does not list it, and choosing one dimension per persona is a judgement no profile field holds |
| The finish order list | Kept, with its live region, visually hidden. It numbers only the runs that got through, with the places their goal posts show; the other ended runs follow unnumbered. | F6 AC3 stays visible through the ordinals and clocks, and a screen reader still hears each end. One ranking for the eye and the ear: numbering a give-up would make a run that got through later read 1st on its post and 2nd in the list (review). A visible list would break the three-lane fit, and the reference shows "1st" only at a reached post. |
| Clock size | `readout` (44 px) | `docs/DESIGN.md`'s type table assigns `readout` to "elapsed time in the race". The reference's 32 px mono is no token, and arbitrary sizes are banned. The right column widens to 168 px to hold it. |
| Clock format | `0:15.5` (m:ss.d) in lanes; run detail duration stays "15.5 s" | As each reference draws it |
| "Gave up: gave_up" in a tile | The word alone, and Over budget for `budget_exceeded` | Outcome words now tell the two apart, so the stored code was a stand-in |
| Narration length in a lane | Two lines with no detail line, and one under it, clamped in CSS only. The narration sits beside the screenshot, in columns 1 and 2, not under it. | The fixture's narrations run 74 to 98 characters and DEMO beat 4 reads them aloud, so a lane with no detail line keeps two lines. Row 2 holds two lines in every state, so a lane is 146 px and three fit 720 (a detail line plus two narration lines put three stuck lanes of a live race at 750 px). Under a detail line the longer narrations are cut on screen (`race-lane.tsx`'s header gives the figure). The self-check browser tests measure the fit with and without detail lines, and the full text stays in the DOM for a screen reader. |
| A lane whose stream was lost | Outcome "Stream lost", in `fault`, never a live state | Its stream says nothing about now, and `fault` marks the tool failing, as `docs/DESIGN.md` defines it |
| The meta over the model's text | Its own terms: shown, then `hiddenCount`, then `belowFoldCount` | A count of every element without a ref would contradict the text's "N more elements not shown" line in the same panel, and would count the perception removals #118 keeps out of the model's view |
| The hatch | `s3-11`'s `hatch` utility (`--hatch-line`), which merged first; the wasted pip sets it to ink-3 | It needs px stops, and sizes live only in the token block; one utility serves both tasks |
| The backend tag's rule | `backendOf`, as s3-10 left it: a step with a decision means `jev` | Web cannot tell Jev's model id from any other. The model id is in the facts row. |
| io down on run detail | A fault Banner with io's message in mono and "Try again", which calls `refetch` | `docs/DESIGN.md` "States". The message already carries the HTTP status. |
| Run detail h1 text | `Vera \| 424242 \| run_vera-hard-1` (the reference shows "seed 1") | The task says "persona \| seed \| run id", as F7 AC4 does |
| Download labels | "Download video", "Download trace" (the reference shows the file names) | `docs/DESIGN.md` "Copy": buttons start with a verb, and "Download trace" is its own example |
| The video player | Kept, in a Recording section under the two columns, with the downloads in the header | Asked at gate 1. Below the main moment, so the 1280 × 720 view stays the reference's. |
| Avatar toggles and the goal choice | `aria-pressed` buttons and the SegmentedControl, in place of the native checkboxes and radios (gate 1 revision) | `collect` skips controls nobody sees, so visually hidden inputs would escape the self-check. The reference draws the cast as `button.wf-avatar[aria-pressed]`. The reducer and its actions are unchanged. |
| The task goal in run detail's header | Removed, and the task id kept in the facts. This drops the `GET /tasks` fetch. | Not in the reference's facts, and the run detail's 1280 width holds no sentence more |
| Evidence for elements no rule touched | Not in the Filtered out tab. Each one is a line of "What the model read", verbatim. | The tab is named for what the filter did. The metrics of an untouched element are the Lens's evidence, not the replay's. |
| The Filtered out count | Elements with at least one decision, degraded and renamed included | Degraded is the demo's beat ("Order archive"): leaving it out would hide P1 and its roll |
| The Jev option list | Every option, in offer order. The reference's sorted "+8 more" is not used. The range column goes, with the range moved to each segment's title. | s3-10: "in offer order"; nothing stored is hidden |
| Colouring the model's text by token (ref, role, name) | Not done: plain `ink` lines with `ink-3` numbers | It would parse core's rendering format in web for looks alone |
| ← → scope | Page-wide on run detail, skipping form fields, modified keys and events a Radix widget handled | "The StepTimeline moves with ← and →", and the hints sit beside it as page keys |
| The "cited by" chip in the reference's steps strip | Left out | Run detail has no report data, and the report is `s3-08` |
| Where `demoRace` lives (build) | `src/arena/demo-race.ts`, imported directly by the tests and the self-check | `check:self` runs under plain tsx, and `fixture-race.ts` reaches Vite's `import.meta.glob` through `panel-state.ts` |
| How the badge tests read the badge (build) | From the top bar slot's `data-source` and the tag's text, not from the measurement | `collect` measures text blocks and controls, and the badge is a `span`. Side effect: `check:self` does not hold the badge and the backend tag to the floors. |
| The screenshot box in the replay (build) | A 180 px crop of a viewport-shaped frame. The frame moves up to bring the click point into the crop, but never past the page's edges. | Shown at full height (640 × 400), the screenshot pushed the tabs below 720, which the review marked blocking. The reference crops to 178 px. |
| Run detail's header at 1280 (build, review) | Row 1 is the avatar and the h1 alone, row 2 the facts with the downloads on their right | `readout` at 44 px leaves no room for the buttons beside a real run id. With a ULID id and a seed of up to 4 digits the h1 holds one line and the Jev draw bar sits inside 720; a longer seed wraps the h1, and the bar's lower edge passes the fold. |
| Who installs ← and → (build) | `StepTimeline` calls `useStepKeys` itself, and a focused `<video>` keeps its own arrows | Any page with the timeline gets the keys. The kept video player seeks on arrows. |
| Group elements (build) | The steps and the cast are `<fieldset>`s, not `div role="group"` | Biome's `useSemanticElements` refuses the role on a `div`, and a fieldset is a group already |
| Pip spacing (build) | 6 px | A 20-step track (the step cap) with its end mark fits the track column at 1280. At the reference's 10 px it would not. |
| The ordinal tag's type (build) | `label` | The reference's 18 px display has no type token |
| The roll on the Jev needle (build) | Three places on the flag, such as `rolled 0.4`. The exact roll is in its title and the bar's label. | A stored roll can run to 17 digits |
| `backendOf`'s home (build) | `runs/step-replay.tsx`, imported by `run-detail.tsx` | The narration needs it, and keeping it in the screen file would cause an import cycle |
| `OutcomeGlyph` (build) | Exported beside `Outcome` | The lane's end mark and the timeline's last step need the glyph without its word |
| The Previous step and Next step links (build) | Removed from run detail | The StepTimeline's step links and the ← → keys do the same job, and the reference draws neither link |
| Jev's options above the fold (review, the author's call) | Under the bar, one row names at most three options, each with the probability Jev gave it: the top three with at least 5 % of the draw, or the top two and the drawn one when the drawn one is not among them: `0 click e3 0.62 · click e6 0.12 · scroll down 0.08 1`. The full list stays below. | DEMO beat 5 reads "Jev's options with their probabilities", and at 1280 × 720 the list falls below the fold. A label pinned under each segment would fit only the widest, and a fourth label overflowed the 640 px column (review). |
| The "drawn" mark and a misclick (review) | "drawn" only when the performed action's ref is the ref Jev drew; otherwise the action's type | B4 (s2-08, not built yet) can move a click to a neighbour, and the mark would then name an element Jev did not draw |
| The Jev fixture's narration (review) | Empty on every step of `fixtureJevRun` | Jev writes no narration, so the self-checked Jev screen shows "Jev writes no narration", as a real Jev run does |

## Risks

- **Playwright and SSE.** Whether `route.fulfill` with a `text/event-stream` body reaches `EventSource` as events is checked first, in the self-check's fake-page test. If it does not, the fallback is a small Node SSE server started by the self-check, with `/api/runs/*/events` routed to it. That is more code, but it stays inside `scripts/`.
- **The 720 px fit** depends on Geist's metrics and the narration clamp. It is measured with the self-check's own Chromium at 1280 × 720, using `document.scrollingElement.scrollHeight <= 720`, in `self-check.browser.test.ts`.
- **Visually hidden text** (the h1, the strip's h2 and the finish order) is not measured: `collect` skips anything a sighted person does not see, the 1 × 1 `sr-only` box included (`measure-page.ts`, `seen`). That is why the strip's controls must not be hidden inputs.
- **Test churn** in `race-view.test.tsx`, `run-detail.test.tsx` and `step-replay.test.tsx` is large. Each rewritten assertion keeps its behaviour, and the PR lists the copy changes.
- **`s3-11`** edits `self-check.ts` at the same time. The conflict is in the interface and `checkScreen`, and is small.

## Review note

The spec review, the branch review, the security review, the simplify pass and the PR reviews are told in PR #181, its description and its comments; the decisions they changed are in the decision log above. Cleanups still open, each needing a file this task does not own or a rule change:

- one `pathOf` in `runs/replay.ts`;
- one cut-short test builder in `runs/fixture-runs.ts`, outside the task's file list (this PR edits that file only to silence the Jev fixture's narration);
- answering unlisted image requests in the self-check, which `docs/DESIGN.md` "Checked by" would have to allow first.
