/**
 * The race: the arena's runs of one goal, followed live, and what each run's tile shows
 * (`docs/PLAN.md` F6). The folds are pure and read the events' own timestamps, never the local
 * clock (F6 AC3), so the same events always give the same tiles and the same finish order.
 *
 * One `EventSource` per run: io streams each run on its own `GET /runs/:id/events`, and every open
 * stream holds one of the few HTTP/1.1 connections a browser opens per origin. That caps a race at
 * `MAX_PERSONAS` runs; the comment on it in `panel-state.ts` gives the count.
 *
 * The lane folds, below `followRace`, turn one run's events and view into what its `RaceLane`
 * draws: the pips, the place among the runs that got through, the clock, the steps line and the
 * outcome. Each is pure, and formats only what it is given.
 */
import type { Action, RunEvent, RunId, RunOutcome } from "@wayford/core";
import { type OutcomeKind, outcomeKind } from "#components/outcome";
import type { Pip } from "#components/race-lane";
import { type StreamStatus, subscribeToRunEvents } from "../api/run-events.js";
import type { StartedRun } from "../api/runs.js";
import type { AvatarState } from "../avatar/state.js";
import { avatarView } from "./avatar-state.js";

/** What a tile shows, folded from one run's events so far. */
export type RunView = {
  state: AvatarState;
  /** The page a stuck persona stayed on, as `avatarView` names it; `undefined` when not stuck. */
  stuckOn: string | undefined;
  /**
   * The latest event's timestamp less `runStarted`'s; `undefined` before `runStarted`. Nothing
   * follows the terminal event, so an ended run's time stays there, and a run whose stream stalls
   * shows when its last event came, not a clock ticking on.
   */
  elapsedMs: number | undefined;
  /** The text of the latest `narration` event; `undefined` when there is none, as on a Jev run. */
  narration: string | undefined;
  /** The step of the latest `actionPerformed` that carries a `screenshotPath`. */
  screenshotStep: number | undefined;
  /** From the terminal event: the outcome (`error` for `runFailed`), when, and `runFailed`'s error. */
  ended?: { outcome: RunOutcome; at: string; error?: string };
};

/** `events`, one run's events so far in stream order, as its tile shows them. Pure. */
export function runView(events: readonly RunEvent[]): RunView {
  let startedAt: string | undefined;
  let narration: string | undefined;
  let screenshotStep: number | undefined;
  let ended: RunView["ended"];
  for (const event of events) {
    switch (event.type) {
      case "runStarted":
        startedAt = event.timestamp;
        break;
      case "narration":
        narration = event.text;
        break;
      case "actionPerformed":
        if (event.screenshotPath !== undefined) screenshotStep = event.stepIndex;
        break;
      case "runFinished":
        ended = { outcome: event.outcome, at: event.timestamp };
        break;
      case "runFailed":
        ended = { outcome: "error", at: event.timestamp, error: event.error };
        break;
    }
  }
  // Nothing follows the terminal event, so an ended run's latest event is its end.
  const latest = events.at(-1)?.timestamp;
  const elapsedMs =
    startedAt === undefined || latest === undefined
      ? undefined
      : Date.parse(latest) - Date.parse(startedAt);
  const { state, stuckOn } = avatarView(events);
  return {
    state,
    stuckOn,
    elapsedMs,
    narration,
    screenshotStep,
    ...(ended === undefined ? {} : { ended }),
  };
}

/** A run that has ended, as the finish order lists it. */
export type Finish = {
  run: StartedRun;
  /** From 1. Runs with the same elapsed time share a place. */
  place: number;
  /** The state the run ended in, as `runView` decides it. */
  state: AvatarState;
  /** `runView`'s: `undefined` only for a stream that never sent its `runStarted`. */
  elapsedMs: number | undefined;
};

/**
 * The runs that have ended, shortest elapsed time first: each run's own time from its `runStarted`
 * to its terminal event, as `runView` reads them off the event timestamps. Not the instant a run
 * ended: runs can start at different times, when io's five slots are busy, and the place must agree
 * with the time each tile shows. Runs with the same elapsed time share the lower place and keep the
 * start order, and the next place counts them all (1, 1, 3), as a dead heat is ranked. An ended run
 * with no `runStarted`, which io never sends, has no time and ranks last. A run that has not ended,
 * or has no view in `views`, is not listed. The order the terminal events arrived in decides
 * nothing: each run has its own stream, and nothing orders one stream's events against another's.
 */
export function finishOrder(
  runs: readonly StartedRun[],
  views: ReadonlyMap<RunId, RunView>,
): Finish[] {
  const ended = runs.flatMap((run) => {
    const view = views.get(run.id);
    if (view?.ended === undefined) return [];
    const { state, elapsedMs } = view;
    return [{ run, state, elapsedMs, time: elapsedMs ?? Number.POSITIVE_INFINITY }];
  });
  // `sort` is stable, so runs with one elapsed time keep the start order. Two runs with no time
  // compare equal, not `Infinity - Infinity`, which is no number.
  ended.sort((a, b) => (a.time === b.time ? 0 : a.time - b.time));
  return ended.map(({ run, state, elapsedMs, time }) => ({
    run,
    place: 1 + ended.filter((other) => other.time < time).length,
    state,
    elapsedMs,
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
 * A lane's clock: `ms` as m:ss.d, such as "0:15.5", or a dash before `runStarted`. The time is
 * rounded to tenths once, before it is split, so 59.96 s reads "1:00.0", never "0:60.0".
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
  const count = `${begun} ${begun === 1 ? "step" : "steps"}`;
  return ended ? count : `${count} so far`;
}

/**
 * How a lane stands. A `lost` stream is Stream lost, never a live state: a broken stream says
 * nothing about now. A run that ended is its stored outcome, so Over budget is told from Gave up.
 * A run still going is its live state. Pure.
 */
export function laneOutcome(view: RunView, lost: boolean): OutcomeKind {
  if (lost) return "lost";
  if (view.ended !== undefined) return outcomeKind(view.ended.outcome);
  switch (view.state) {
    case "idle":
      return "waiting";
    case "moving":
      return "moving";
    case "stuck":
      return "stuck";
    // `runView` gives these three states only with `ended`, whose outcome decides above. Were one
    // to come without it, the state is the nearest word: Gave up stands for Over budget too.
    case "done":
      return "through";
    case "gaveUp":
      return "gaveUp";
    case "error":
      return "error";
  }
}
