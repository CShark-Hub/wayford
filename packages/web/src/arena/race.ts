/**
 * The race: the arena's runs of one goal, followed live, and what each run's tile shows
 * (`docs/PLAN.md` F6). The folds are pure and read the events' own timestamps, never the local
 * clock (F6 AC3), so the same events always give the same tiles and the same finish order.
 *
 * One `EventSource` per run: io streams each run on its own `GET /runs/:id/events`, and every open
 * stream holds one of the few HTTP/1.1 connections a browser opens per origin. That caps a race at
 * `MAX_PERSONAS` runs; the comment on it in `panel-state.ts` gives the count.
 */
import type { RunEvent, RunId, RunOutcome } from "@wayford/core";
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
