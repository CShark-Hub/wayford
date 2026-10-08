/**
 * The race: the arena's runs of one goal, followed live, and what each run's tile shows
 * (`docs/PLAN.md` F6). The folds are pure. A lane's clock and the finish order read the simulated
 * time the events carry (B3's clock, `docs/RULES.md`), never a timestamp or the local clock (F6
 * AC3), so the same events always give the same tiles and the same finish order.
 *
 * One `EventSource` per run: io streams each run on its own `GET /runs/:id/events`, and every open
 * stream holds one of the few HTTP/1.1 connections a browser opens per origin. That caps a race
 * followed live at `MAX_PERSONAS` runs; the comment on it in `panel-state.ts` gives the count. A run
 * set started through io's API can be larger, and the screen does not follow it live.
 *
 * The lane folds, below `followRace`, turn one run's events and view into what its `RaceLane`
 * draws: the pips, the place among the runs that got through, the clock, the steps line and the
 * outcome. Each is pure, and formats only what it is given. A race reopened once it has finished
 * is drawn from its runs' stored records instead (`storedLane`), since io streams only the runs its
 * process holds.
 */
import type {
  Action,
  RunEvent,
  RunId,
  RunLimit,
  RunOutcome,
  RunResult,
  RunStep,
  StartedRun,
} from "@wayford/core";
import { type OutcomeKind, outcomeKind } from "#components/outcome";
import type { Pip } from "#components/race-lane";
import { type StreamStatus, subscribeToRunEvents } from "../api/run-events.js";
import type { AvatarState } from "../avatar/state.js";
import { avatarView } from "./avatar-state.js";

/** What a tile shows, folded from one run's events so far. */
export type RunView = {
  state: AvatarState;
  /** The page a stuck persona stayed on, as `avatarView` names it; `undefined` when not stuck. */
  stuckOn: string | undefined;
  /**
   * The run's simulated time so far: the sum of the `simulatedMs` its `actionPlanned` and
   * `stepWasted` events carry, each step's cost to decide, point and press (B3's clock), not the
   * time between the events' timestamps, which measures the model and the machine. `undefined`
   * until the first of them carries one, as on a run recorded before s2-09. Nothing follows the
   * terminal event, so an ended run's time stays there, and a run whose stream stalls shows the
   * steps that came, not a clock ticking on.
   */
  simulatedMs: number | undefined;
  /** The text of the latest `narration` event; `undefined` when there is none, as on a Jev run. */
  narration: string | undefined;
  /** The step of the latest `actionPerformed` that carries a `screenshotPath`. */
  screenshotStep: number | undefined;
  /**
   * From the terminal event: the outcome (`error` for `runFailed`), when, `runFinished`'s limit if
   * it names one, and `runFailed`'s error. A stored run's record keeps the limit, but neither the
   * time of its end nor the error, so `storedLane` leaves those two out.
   */
  ended?: { outcome: RunOutcome; at?: string; limit?: RunLimit; error?: string };
};

/** `events`, one run's events so far in stream order, as its tile shows them. Pure. */
export function runView(events: readonly RunEvent[]): RunView {
  let simulatedMs: number | undefined;
  let narration: string | undefined;
  let screenshotStep: number | undefined;
  let ended: RunView["ended"];
  for (const event of events) {
    switch (event.type) {
      case "actionPlanned":
      case "stepWasted":
        if (event.simulatedMs !== undefined) simulatedMs = (simulatedMs ?? 0) + event.simulatedMs;
        break;
      case "narration":
        narration = event.text;
        break;
      case "actionPerformed":
        if (event.screenshotPath !== undefined) screenshotStep = event.stepIndex;
        break;
      case "runFinished":
        // The limit only when named: a run recorded before #196 names none, and reads Over budget.
        ended = {
          outcome: event.outcome,
          at: event.timestamp,
          ...(event.limit === undefined ? {} : { limit: event.limit }),
        };
        break;
      case "runFailed":
        ended = { outcome: "error", at: event.timestamp, error: event.error };
        break;
    }
  }
  const { state, stuckOn } = avatarView(events);
  return {
    state,
    stuckOn,
    simulatedMs,
    narration,
    screenshotStep,
    ...(ended === undefined ? {} : { ended }),
  };
}

/** A run that has ended, as the finish order lists it. */
export type Finish = {
  run: StartedRun;
  /** From 1. Runs with the same simulated time share a place. */
  place: number;
  /** The state the run ended in, as `runView` decides it. */
  state: AvatarState;
  /** `runView`'s: `undefined` only for a run none of whose steps carries a time. */
  simulatedMs: number | undefined;
};

/**
 * The runs that have ended, shortest simulated time first: each run's own time to decide, point and
 * press through its steps, as `runView` sums it from the events. Not the wall clock, which counts
 * the model's latency and the machine's load, and not the instant a run ended: runs can start at
 * different times, when io's five slots are busy, and the place must agree with the time each tile
 * shows. Runs with the same simulated time share the lower place and keep the start order, and the
 * next place counts them all (1, 1, 3), as a dead heat is ranked. An ended run with no timed step,
 * one recorded before s2-09 or ended before its first plan, has no time and ranks last. A run that
 * has not ended, or has no view in `views`, is not listed. The order the terminal events arrived in
 * decides nothing: each run has its own stream, and nothing orders one stream's events against
 * another's.
 */
export function finishOrder(
  runs: readonly StartedRun[],
  views: ReadonlyMap<RunId, RunView>,
): Finish[] {
  const ended = runs.flatMap((run) => {
    const view = views.get(run.id);
    if (view?.ended === undefined) return [];
    const { state, simulatedMs } = view;
    return [{ run, state, simulatedMs, time: simulatedMs ?? Number.POSITIVE_INFINITY }];
  });
  // `sort` is stable, so runs with one simulated time keep the start order. Two runs with no time
  // compare equal, not `Infinity - Infinity`, which is no number.
  ended.sort((a, b) => (a.time === b.time ? 0 : a.time - b.time));
  return ended.map(({ run, state, simulatedMs, time }) => ({
    run,
    place: 1 + ended.filter((other) => other.time < time).length,
    state,
    simulatedMs,
  }));
}

/**
 * Whether `stream`, a run's, broke for good before the run's terminal event: the arena cannot follow
 * the run any more, though io may still be running it, so its tile shows no live state.
 */
export function streamLost(view: RunView, stream: StreamStatus | undefined): boolean {
  return stream === "failed" && view.ended === undefined;
}

/**
 * Whether io has stored the run `events` are of, so its run detail opens: its terminal event came,
 * and it had sent `runStarted`. io stores a run before it publishes the terminal event, and stores
 * none that never started (`closeOut` in `packages/io/src/runner.ts`). A store that failed there
 * is logged, and run detail then says no such run is stored. Pure.
 */
export function runStored(events: readonly RunEvent[]): boolean {
  return (
    events.some((event) => event.type === "runStarted") &&
    events.some((event) => event.type === "runFinished" || event.type === "runFailed")
  );
}

/**
 * Every run's events so far, in stream order, and where each run's stream stands, by run id. A
 * snapshot handed out is never changed: the next event makes a new one.
 */
export type RaceSnapshot = {
  events: ReadonlyMap<RunId, readonly RunEvent[]>;
  streams: ReadonlyMap<RunId, StreamStatus>;
};

/**
 * A race before any stream has opened: no run in either map. A reader takes a missing run as one
 * with no events whose stream is idle. Shared, so never changed: `followRace` copies its maps.
 */
export const EMPTY_SNAPSHOT: RaceSnapshot = { events: new Map(), streams: new Map() };

/**
 * Whether the arena has nothing more to follow: every run has ended, or its stream broke for good
 * (`failed`) before its end. io cannot cancel a run, so until then a new race would queue its runs
 * behind these ones.
 */
export function raceOver(runs: readonly StartedRun[], snapshot: RaceSnapshot): boolean {
  return runs.every(
    (run) =>
      snapshot.streams.get(run.id) === "failed" ||
      (snapshot.events.get(run.id) ?? []).some(
        (event) => event.type === "runFinished" || event.type === "runFailed",
      ),
  );
}

/**
 * Follow `runs` live: one `subscribeToRunEvents`, so one `EventSource`, per run. Every event and
 * every change of a stream's status makes a new snapshot, from `EMPTY_SNAPSHOT` on, with new
 * maps and a new array for the run that changed, handed to `onChange`, so a screen can keep the
 * latest as its state. Returns the function that closes every stream.
 */
export function followRace(
  runs: readonly StartedRun[],
  onChange: (snapshot: RaceSnapshot) => void,
): () => void {
  let snapshot = EMPTY_SNAPSHOT;
  const handOut = (next: RaceSnapshot) => {
    snapshot = next;
    onChange(next);
  };
  const unsubscribes = runs.map((run) =>
    subscribeToRunEvents(run.id, {
      onEvent: (event) =>
        handOut({
          ...snapshot,
          events: new Map(snapshot.events).set(run.id, [
            ...(snapshot.events.get(run.id) ?? []),
            event,
          ]),
        }),
      onStatus: (status) =>
        handOut({ ...snapshot, streams: new Map(snapshot.streams).set(run.id, status) }),
    }),
  );
  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}

/**
 * The pip a landed step makes, named by its performed action, the one that ran after the dice: a
 * click the dice made a double click is a double click. A give-up makes none: the track's end mark
 * stands for it.
 */
function pipOf(action: Action): Pip | undefined {
  switch (action.type) {
    case "click":
    case "doubleClick":
    case "type":
      return { kind: "act", word: action.type };
    case "scroll":
      return { kind: "scroll", word: "scroll" };
    case "wait":
      return { kind: "scroll", word: "wait" };
    case "back":
      return { kind: "back", word: "back" };
    case "giveUp":
      return undefined;
  }
}

/**
 * A lane's track, one pip per step begun (every `stepObserved`), in step order. A step whose action
 * landed is named by `pipOf`; a wasted step is `wasted`. The step observed last, neither landed nor
 * wasted, is `now` while the run has not ended and its stream is not `lost`. Once the run has
 * ended, such a step, which the run stopped in, makes no pip: nothing ran in it. On a lost stream
 * it makes none either: a broken stream says nothing about now, as `laneOutcome` holds. Pure.
 */
export function stepPips(events: readonly RunEvent[], lost: boolean): Pip[] {
  const observed = new Set<number>();
  const performed = new Map<number, Action>();
  const landed = new Set<number>();
  const wasted = new Set<number>();
  let latest: number | undefined;
  let ended = false;
  for (const event of events) {
    switch (event.type) {
      case "stepObserved":
        observed.add(event.stepIndex);
        latest = event.stepIndex;
        break;
      case "actionPlanned":
        performed.set(event.stepIndex, event.performedAction);
        break;
      case "actionPerformed":
        landed.add(event.stepIndex);
        break;
      case "stepWasted":
        wasted.add(event.stepIndex);
        break;
      case "runFinished":
      case "runFailed":
        ended = true;
        break;
    }
  }
  return [...observed]
    .sort((a, b) => a - b)
    .flatMap((step): Pip[] => {
      if (landed.has(step)) {
        // io plans every action before it lands, so a landed step always has its action.
        const action = performed.get(step);
        const pip = action === undefined ? undefined : pipOf(action);
        return pip === undefined ? [] : [pip];
      }
      if (wasted.has(step)) return [{ kind: "wasted", word: "wasted" }];
      if (step === latest && !ended && !lost) return [{ kind: "now", word: "under way" }];
      return [];
    });
}

/**
 * The place of each of `runs` that got through, among those runs alone, by run id: the place its
 * lane's goal post carries. `finishOrder` ranks them, so equal times share the lower place (1, 1,
 * 3) and a run with no time comes last. A run that ended any other way, or has not ended, has no
 * place here.
 */
export function throughPlaces(
  runs: readonly StartedRun[],
  views: ReadonlyMap<RunId, RunView>,
): ReadonlyMap<RunId, number> {
  const through = runs.filter((run) => views.get(run.id)?.state === "done");
  return new Map(finishOrder(through, views).map(({ run, place }) => [run.id, place]));
}

/**
 * A lane's clock: `ms` as m:ss.d, such as "0:15.5", or a dash with no time, before the run's first
 * timed step. The time is rounded to tenths once, before it is split, so 59.96 s reads "1:00.0",
 * never "0:60.0".
 */
export function clockText(ms: number | undefined): string {
  if (ms === undefined) return "—";
  const tenths = Math.round(ms / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths % 10}`;
}

/**
 * A lane's steps line: the steps begun, each `stepObserved` step once, the give-up's included, as
 * the track's label counts them. "5 steps" once the run has `ended`, "5 steps so far" while it
 * runs.
 */
export function stepsText(events: readonly RunEvent[], ended: boolean): string {
  const begun = new Set(
    events.flatMap((event) => (event.type === "stepObserved" ? [event.stepIndex] : [])),
  ).size;
  return stepsLine(begun, ended);
}

/** `begun` steps in words, "so far" while the run has not `ended`. */
function stepsLine(begun: number, ended: boolean): string {
  const count = `${begun} ${begun === 1 ? "step" : "steps"}`;
  return ended ? count : `${count} so far`;
}

/**
 * How a lane stands. A `lost` stream is Stream lost, never a live state: a broken stream says
 * nothing about now. A run that ended is its stored outcome, so a budget run out is told from Gave
 * up, and by the limit its `runFinished` names, as run detail tells it. A run still going is its
 * live state. Pure.
 */
export function laneOutcome(view: RunView, lost: boolean): OutcomeKind {
  if (lost) return "lost";
  if (view.ended !== undefined) return outcomeKind(view.ended.outcome, view.ended.limit);
  switch (view.state) {
    case "idle":
      return "waiting";
    case "moving":
      return "moving";
    case "stuck":
      return "stuck";
    // `runView` gives these three states only with `ended`, whose outcome decides above. Were one
    // to come without it, the state is the nearest word: Gave up stands for a budget run out too.
    case "done":
      return "through";
    case "gaveUp":
      return "gaveUp";
    case "error":
      return "error";
  }
}

/**
 * What one lane draws, folded from its run's live events (`liveLane`) or from its stored record
 * (`storedLane`): the run's view, the track's pips, the steps line, and whether the arena lost the
 * run. `note`, when set, is the lane's detail line in place of the one its view gives.
 */
export type LaneFold = {
  view: RunView;
  pips: Pip[];
  steps: string;
  /** The run's stream broke for good before its end, or io kept no record of it. */
  lost: boolean;
  /** io holds the run's record, so its lane links to its run detail (`runStored`). */
  stored: boolean;
  note?: string;
};

/** Run `id`'s lane after `snapshot`: its events so far and its stream's status, folded. Pure. */
export function liveLane(snapshot: RaceSnapshot, id: RunId): LaneFold {
  const events = snapshot.events.get(id) ?? [];
  const view = runView(events);
  const lost = streamLost(view, snapshot.streams.get(id));
  return {
    view,
    pips: stepPips(events, lost),
    steps: stepsText(events, view.ended !== undefined),
    lost,
    stored: runStored(events),
  };
}

/** The avatar's state for a stored outcome, as `avatarView` gives it at the terminal event. */
const ENDED_STATES: Record<RunOutcome, AvatarState> = {
  success: "done",
  gave_up: "gaveUp",
  budget_exceeded: "gaveUp",
  error: "error",
};

/**
 * Whether a stored step's action landed: it reached `urlAfter`, which only `actionPerformed` sets.
 * A complete step always has; a cut-short run's last step has only if its action landed before the
 * end; a wasted step ran nothing.
 */
function landed(step: RunStep): step is RunStep & { performedAction: Action } {
  return !("wasted" in step) && step.urlAfter !== undefined && step.performedAction !== undefined;
}

/**
 * A finished run's lane, from its stored record: what its live lane showed at its end, as far as
 * the record keeps it. The fold of the stream is the record (`runResultFromEvents`), so the pips,
 * the steps, the clock, the latest screenshot and narration, and the outcome come out as the live
 * lane drew them, the limit that ended a budget run out included. The clock is the record's
 * `simulatedMs`, the sum of its steps' as the live lane summed them, and none on a run recorded
 * before s2-09; its `durationMs` is the wall clock, which no lane shows. The record keeps no error
 * text and no end time, so an Error lane has no detail line and `ended` no `at`. Pure.
 */
export function storedLane(run: RunResult): LaneFold {
  const steps = run.steps.toSorted((a, b) => a.stepIndex - b.stepIndex);
  const narration = steps.findLast((step) => step.narration !== "")?.narration;
  const screenshotStep = steps.findLast((step) => step.screenshotPath !== undefined)?.stepIndex;
  return {
    view: {
      state: ENDED_STATES[run.outcome],
      stuckOn: undefined,
      simulatedMs: run.simulatedMs,
      narration,
      screenshotStep,
      // The limit only when the record names one, as `runView` reads it off `runFinished`.
      ended: { outcome: run.outcome, ...(run.limit === undefined ? {} : { limit: run.limit }) },
    },
    // As `stepPips` draws an ended run: a wasted step hatched, a landed one named by its action,
    // and the step the run stopped in, which never landed, none.
    pips: steps.flatMap((step): Pip[] => {
      if ("wasted" in step) return [{ kind: "wasted", word: "wasted" }];
      const pip = landed(step) ? pipOf(step.performedAction) : undefined;
      return pip === undefined ? [] : [pip];
    }),
    steps: stepsLine(steps.length, true),
    lost: false,
    stored: true,
  };
}

/**
 * The lane of a finished race's run that io kept no record of: the run never started, which io
 * stores none of (`closeOut` in `packages/io/src/runner.ts`), or io stopped while it was under
 * way, or could not store it. Nothing is known of it but its persona and seed, so it is drawn as a
 * lost stream, and its note names what may have happened.
 */
export const UNSTORED_LANE: LaneFold = {
  view: runView([]),
  pips: [],
  steps: "no steps stored",
  lost: true,
  stored: false,
  note: "No record: the run never started, or io stopped or failed to store it",
};
