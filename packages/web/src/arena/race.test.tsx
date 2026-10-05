import { RunEvent, type RunId, type RunOutcome, runResultFromEvents } from "@wayford/core";
import { profileFixtures, runEventFixtures } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FakeEventSource } from "../api/fake-event-source.js";
import type { StreamStatus } from "../api/run-events.js";
import type { StartedRun } from "../api/runs.js";
import { attributesOf, lineOf } from "../preview/rendered-markup.js";
import { avatarStateOf, finished, GOAL, shifted, stuckRun, tileOf } from "./fixture-race.js";
import {
  EMPTY_SNAPSHOT,
  finishOrder,
  followRace,
  type RaceSnapshot,
  type RunView,
  raceOver,
  runView,
} from "./race.js";
import { RaceView } from "./race-view.js";

/** The fixture's run id, which its events and its file paths carry. */
const FIXTURE_RUN = "run_vera-hard-1";
const SEED = 424242;

/**
 * Fixture events rewritten as `run`'s: every mention of the fixture's run id, its `runId` and its
 * file paths, becomes `run.id`, `runStarted` names `run.profileId`, and every timestamp moves
 * `shiftMs` later. Each is re-parsed, so it is an event core's contract accepts.
 */
function rewritten(events: readonly RunEvent[], run: StartedRun, shiftMs: number): RunEvent[] {
  return events.map((event) => {
    const renamed = JSON.parse(JSON.stringify(event).replaceAll(FIXTURE_RUN, run.id));
    const profile = event.type === "runStarted" ? { profileId: run.profileId } : {};
    return RunEvent.parse({
      ...renamed,
      ...profile,
      timestamp: shifted(event.timestamp, shiftMs),
    });
  });
}

/** Steps 0 to 2 of the fixture, then the goal reached at 9.5 s. */
const reachesTheGoal = [
  ...runEventFixtures.slice(0, 13),
  RunEvent.parse({
    ...finished,
    stepIndex: 2,
    timestamp: "2026-09-22T10:00:09.500Z",
    outcome: "success",
    durationMs: 9500,
  }),
];

/** Step 0 of the fixture and step 1's observation, then a crash at 4.5 s. */
const crashes = [
  ...runEventFixtures.slice(0, 6),
  RunEvent.parse({
    type: "runFailed",
    runId: FIXTURE_RUN,
    stepIndex: 1,
    timestamp: "2026-09-22T10:00:04.500Z",
    error: "Target page, context or browser has been closed",
    durationMs: 4500,
    cost: finished.cost,
  }),
];

const ada: StartedRun = { id: "run_ada-race-1", profileId: "prof_ada", seed: SEED };
const kai: StartedRun = { id: "run_kai-race-1", profileId: "prof_kai", seed: SEED };
const vera: StartedRun = { id: "run_vera-race-1", profileId: "prof_vera", seed: SEED };

/**
 * Three runs of one race, started in the order Ada, Kai, Vera, 100 ms apart. Ada reaches the goal
 * after 9.5 s, Kai crashes after 4.5 s, and Vera, stuck on /settings after two wasted steps, gives
 * up after 18.5 s (`stuckRun`): Kai ends first, though he started second. The fixture's steps are
 * 500 ms apart, so no two runs share a timestamp.
 */
const RACE: { run: StartedRun; events: RunEvent[]; outcome: RunOutcome }[] = [
  { run: ada, events: rewritten(reachesTheGoal, ada, 100), outcome: "success" },
  { run: kai, events: rewritten(crashes, kai, 200), outcome: "error" },
  { run: vera, events: rewritten(stuckRun, vera, 300), outcome: "gave_up" },
];
const runs = RACE.map(({ run }) => run);

/** One event as a stream delivers it: its run, and its index in that run, which io sends as `id`. */
type Delivery = { run: StartedRun; event: RunEvent; index: number };

function isTerminal(event: RunEvent): boolean {
  return event.type === "runFinished" || event.type === "runFailed";
}

/** Every event of the race, in timestamp order. */
const byTimestamp: Delivery[] = RACE.flatMap(({ run, events }) =>
  events.map((event, index) => ({ run, event, index })),
).sort((a, b) => Date.parse(a.event.timestamp) - Date.parse(b.event.timestamp));

/**
 * The order the streams deliver the race in: by timestamp, except Kai's crash, the first run to
 * end, which arrives after everything else. Each run has its own stream, so nothing orders one
 * run's events against another's.
 */
const delivery: Delivery[] = [
  ...byTimestamp.filter(({ run, event }) => !(run === kai && isTerminal(event))),
  ...byTimestamp.filter(({ run, event }) => run === kai && isTerminal(event)),
];

/** The fake source `followRace` opened for `run`. */
function sourceOf(run: StartedRun): FakeEventSource {
  return FakeEventSource.byUrl(`/api/runs/${run.id}/events`);
}

/** Send `delivered` down its run's stream, numbered as io numbers it. */
function deliver({ run, event, index }: Delivery) {
  sourceOf(run).emit(event.type, JSON.stringify(event), String(index));
}

/** The race drawn from `snapshot`. */
function render(snapshot: RaceSnapshot): string {
  return renderToStaticMarkup(
    <RaceView
      goal={GOAL}
      seed={SEED}
      runs={runs}
      snapshot={snapshot}
      profiles={profileFixtures}
      onNewRace={() => {}}
    />,
  );
}

/** Each tile's heading text, in the order the tiles are drawn. */
function tileNames(html: string): string[] {
  return [...html.matchAll(/<article [^>]*aria-labelledby="([^"]+)"/g)].map(([, id]) =>
    lineOf(html.match(new RegExp(`<h3 [^>]*id="${id}"[^>]*>(.*?)</h3>`, "s"))?.[1] ?? ""),
  );
}

/** Each run's avatar state, in start order. */
function avatarStates(html: string): string[] {
  return runs.map((run) => avatarStateOf(html, run));
}

/** Each entry of the live finish order list, on one line. */
function finishLines(html: string): string[] {
  const list = html.match(/<ol [^>]*aria-live="polite"[^>]*>(.*?)<\/ol>/s)?.[1];
  if (list === undefined) throw new Error("no live finish order list");
  return [...list.matchAll(/<li(?:\s[^>]*)?>(.*?)<\/li>/gs)].map(([, item]) => lineOf(item ?? ""));
}

/** `states` with each run of one repeated state kept once. */
function changes(states: readonly string[]): string[] {
  return states.filter((state, i) => i === 0 || state !== states[i - 1]);
}

beforeEach(() => {
  FakeEventSource.reset();
  vi.stubGlobal("EventSource", FakeEventSource);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

test("each run built from the fixture is a whole run that folds to its outcome", () => {
  for (const { run, events, outcome } of RACE) {
    const result = runResultFromEvents(events);
    expect(result.id).toBe(run.id);
    expect(result.profileId).toBe(run.profileId);
    expect(result.outcome).toBe(outcome);
  }
});

test("replays the fixture events as three runs through a stubbed EventSource: three tiles, avatars change state, the finish order matches the event timestamps", () => {
  const snapshots: RaceSnapshot[] = [];
  followRace(runs, (snapshot) => snapshots.push(snapshot));
  const latest = () => {
    const snapshot = snapshots.at(-1);
    if (snapshot === undefined) throw new Error("followRace handed out no snapshot");
    return snapshot;
  };

  // One EventSource per run, on the run's own stream.
  expect(FakeEventSource.instances.map((source) => source.url)).toStrictEqual([
    "/api/runs/run_ada-race-1/events",
    "/api/runs/run_kai-race-1/events",
    "/api/runs/run_vera-race-1/events",
  ]);
  for (const run of runs) sourceOf(run).emit("open");

  const start = render(latest());
  expect(tileNames(start)).toStrictEqual(["Ada", "Kai", "Vera"]);
  expect(avatarStates(start)).toStrictEqual(["idle", "idle", "idle"]);
  expect(finishLines(start)).toStrictEqual([]);

  // The terminal events arrive in an order unlike their timestamps.
  const terminals = (deliveries: Delivery[]) =>
    deliveries.filter(({ event }) => isTerminal(event)).map(({ run }) => run.id);
  expect(terminals(byTimestamp)).toStrictEqual([kai.id, ada.id, vera.id]);
  expect(terminals(delivery)).toStrictEqual([ada.id, vera.id, kai.id]);

  /** The race as drawn after each delivery, by `<run id>#<index>`. */
  const after = new Map<string, string>();
  const states: string[][] = [avatarStates(start)];
  for (const delivered of delivery) {
    deliver(delivered);
    const html = render(latest());
    after.set(`${delivered.run.id}#${delivered.index}`, html);
    states.push(avatarStates(html));
  }
  const at = (run: StartedRun, index: number): string => {
    const html = after.get(`${run.id}#${index}`);
    if (html === undefined) throw new Error(`${run.id} delivered no event ${index}`);
    return html;
  };

  // Mid-race: each run's step 0 has landed, the last of them Vera's.
  expect(avatarStates(at(vera, 4))).toStrictEqual(["moving", "moving", "moving"]);
  // Vera's give-up lands on /settings, where she has been stuck since step 5's observation: steps 3
  // and 4 both left the page as it was. Ada is done, and Kai's crash has not arrived yet.
  expect(avatarStates(at(vera, 17))).toStrictEqual(["done", "moving", "stuck"]);
  expect(avatarStates(at(vera, 20))).toStrictEqual(["done", "moving", "stuck"]);
  // The end.
  const end = render(latest());
  expect(avatarStates(end)).toStrictEqual(["done", "error", "gaveUp"]);

  // Each avatar changed state, one static variant at a time.
  expect(runs.map((_, i) => changes(states.map((tiles) => tiles[i] ?? "")))).toStrictEqual([
    ["idle", "moving", "done"],
    ["idle", "moving", "error"],
    ["idle", "moving", "stuck", "gaveUp"],
  ]);

  // The finish order follows each run's elapsed time, from its own timestamps, whatever order the
  // terminal events arrived in.
  expect(finishLines(at(ada, 13))).toStrictEqual(["1. Ada Done 9.5 s"]);
  expect(finishLines(at(vera, 21))).toStrictEqual(["1. Ada Done 9.5 s", "2. Vera Gave up 18.5 s"]);
  expect(finishLines(end)).toStrictEqual([
    "1. Kai Error 4.5 s",
    "2. Ada Done 9.5 s",
    "3. Vera Gave up 18.5 s",
  ]);

  // Every stream closed on its run's last event.
  expect([...latest().streams.values()]).toStrictEqual(["ended", "ended", "ended"]);
  for (const source of FakeEventSource.instances) {
    expect(source.readyState).toBe(FakeEventSource.CLOSED);
  }
});

test("a snapshot once handed out never changes: each event and each status makes a new one", () => {
  const handedOut: { snapshot: RaceSnapshot; copy: RaceSnapshot }[] = [];
  followRace(runs, (snapshot) => handedOut.push({ snapshot, copy: structuredClone(snapshot) }));
  for (const run of runs) sourceOf(run).emit("open");
  for (const delivered of delivery) deliver(delivered);

  for (const { snapshot, copy } of handedOut) expect(snapshot).toStrictEqual(copy);
  // Connecting, open and ended for each run, and one per event.
  const eventCount = RACE.reduce((sum, { events }) => sum + events.length, 0);
  expect(handedOut).toHaveLength(3 * runs.length + eventCount);
  expect(new Set(handedOut.map(({ snapshot }) => snapshot)).size).toBe(handedOut.length);
});

test("a stream lost mid-run: its tile says what was last seen, its avatar has no state, and it is listed after the ranked runs", () => {
  const snapshots: RaceSnapshot[] = [];
  followRace(runs, (snapshot) => snapshots.push(snapshot));
  for (const run of runs) sourceOf(run).emit("open");
  // Kai's step 0 lands, then his stream fails for good. Ada and Vera run to their ends.
  for (const delivered of delivery.filter(({ run, index }) => run === kai && index <= 4)) {
    deliver(delivered);
  }
  sourceOf(kai).fail();
  for (const delivered of delivery.filter(({ run }) => run !== kai)) deliver(delivered);

  const snapshot = snapshots.at(-1);
  if (snapshot === undefined) throw new Error("followRace handed out no snapshot");
  expect(Object.fromEntries(snapshot.streams)).toStrictEqual({
    [ada.id]: "ended",
    [kai.id]: "failed",
    [vera.id]: "ended",
  });
  const html = render(snapshot);
  const tile = tileOf(html, kai);
  expect(lineOf(tile)).toContain("Stream lost: last seen moving");
  // No live state: the avatar is plain, with no badge and no `data-state`, and dimmed.
  const avatar = attributesOf(tile.match(/<svg[^>]*>/)?.[0] ?? "");
  expect(avatar).not.toHaveProperty("data-state");
  expect(avatar.class).toContain("opacity-50");
  expect(tile).not.toContain('data-part="state"');
  // The others carry on to their ends, ranked; the lost run comes after them, with no place.
  expect(avatarStateOf(html, ada)).toBe("done");
  expect(avatarStateOf(html, vera)).toBe("gaveUp");
  expect(finishLines(html)).toStrictEqual([
    "1. Ada Done 9.5 s",
    "2. Vera Gave up 18.5 s",
    "– Kai Stream lost",
  ]);
  // Nothing more will come from any stream, so the race is over.
  expect(raceOver(runs, snapshot)).toBe(true);
});

test("the function followRace returns closes every stream", () => {
  const stop = followRace(runs, () => {});
  for (const run of runs) sourceOf(run).emit("open");
  for (const delivered of delivery.slice(0, 6)) deliver(delivered);
  expect(FakeEventSource.instances).toHaveLength(runs.length);
  for (const source of FakeEventSource.instances) {
    expect(source.readyState).toBe(FakeEventSource.OPEN);
  }

  stop();
  for (const source of FakeEventSource.instances) {
    expect(source.readyState).toBe(FakeEventSource.CLOSED);
  }
});

/** Each run's view, folded from its events. */
function viewsOf(events: ReadonlyMap<RunId, readonly RunEvent[]>): Map<RunId, RunView> {
  return new Map([...events].map(([id, runEvents]) => [id, runView(runEvents)]));
}

describe("finishOrder", () => {
  /** `RACE`'s events, every run's in full or only the ones before its end. */
  function eventsOf(cut: readonly StartedRun[] = []): Map<RunId, RunEvent[]> {
    return new Map(
      RACE.map(({ run, events }) => [run.id, cut.includes(run) ? events.slice(0, -1) : events]),
    );
  }

  test("lists the runs that ended, shortest elapsed time first, with end state and time", () => {
    expect(finishOrder(runs, viewsOf(eventsOf()))).toStrictEqual([
      { run: kai, place: 1, state: "error", elapsedMs: 4500 },
      { run: ada, place: 2, state: "done", elapsedMs: 9500 },
      { run: vera, place: 3, state: "gaveUp", elapsedMs: 18_500 },
    ]);
  });

  test("a run that has not ended, or has no events yet, is not listed", () => {
    expect(finishOrder(runs, viewsOf(eventsOf([kai]))).map(({ run }) => run)).toStrictEqual([
      ada,
      vera,
    ]);
    expect(finishOrder(runs, new Map())).toStrictEqual([]);
  });

  test("a run that started late and ran shorter ranks first, though it ended later", () => {
    // Ada starts at once and gives up after 15.5 s. Kai waits 10 s for a slot in io, then reaches
    // the goal in 9.5 s: he ends at 19.5 s, after Ada, and still ranks first.
    const views = viewsOf(
      new Map([
        [ada.id, rewritten(runEventFixtures, ada, 0)],
        [kai.id, rewritten(reachesTheGoal, kai, 10_000)],
      ]),
    );
    const endOf = (run: StartedRun) => Date.parse(views.get(run.id)?.ended?.at ?? "");
    expect(endOf(kai)).toBeGreaterThan(endOf(ada));
    expect(finishOrder([ada, kai], views)).toStrictEqual([
      { run: kai, place: 1, state: "done", elapsedMs: 9500 },
      { run: ada, place: 2, state: "gaveUp", elapsedMs: 15_500 },
    ]);
  });

  test("runs with the same elapsed time share the lower place, in start order; the next counts both", () => {
    // Milo and Zoya run Vera's fixture, 15.5 s each, Zoya starting a second later, so they end at
    // different instants. Ada ends first, and Kai crashes after 20 s.
    const milo: StartedRun = { id: "run_milo-race-1", profileId: "prof_milo", seed: SEED };
    const zoya: StartedRun = { id: "run_zoya-race-1", profileId: "prof_zoya", seed: SEED };
    const late = RunEvent.parse({ ...crashes.at(-1), timestamp: "2026-09-22T10:00:20.000Z" });
    const views = viewsOf(
      new Map([
        // The map's order is not the start order: the start order decides a tie.
        [kai.id, rewritten([...crashes.slice(0, -1), late], kai, 0)],
        [zoya.id, rewritten(runEventFixtures, zoya, 1000)],
        [milo.id, rewritten(runEventFixtures, milo, 0)],
        [ada.id, rewritten(reachesTheGoal, ada, 0)],
      ]),
    );
    expect(
      finishOrder([milo, kai, zoya, ada], views).map(({ run, place }) => [run.profileId, place]),
    ).toStrictEqual([
      ["prof_ada", 1],
      ["prof_milo", 2],
      ["prof_zoya", 2],
      ["prof_kai", 4],
    ]);
  });

  test("an ended run with no runStarted has no time and ranks last", () => {
    // io always opens a stream with runStarted; were it missing, Ada's 9.5 s could not be told.
    const views = viewsOf(
      new Map([
        [ada.id, rewritten(reachesTheGoal, ada, 0).slice(1)],
        [vera.id, rewritten(stuckRun, vera, 0)],
      ]),
    );
    expect(finishOrder([ada, vera], views)).toStrictEqual([
      { run: vera, place: 1, state: "gaveUp", elapsedMs: 18_500 },
      { run: ada, place: 2, state: "done", elapsedMs: undefined },
    ]);
  });
});

describe("raceOver", () => {
  /** A snapshot of `RACE` with `cut` runs not yet ended, and the given stream statuses. */
  function snapshotOf(
    cut: readonly StartedRun[],
    streams: readonly [StartedRun, StreamStatus][] = [],
  ): RaceSnapshot {
    return {
      events: new Map(
        RACE.map(({ run, events }) => [run.id, cut.includes(run) ? events.slice(0, -1) : events]),
      ),
      streams: new Map(streams.map(([run, status]) => [run.id, status])),
    };
  }

  test("is over once every run has ended or lost its stream for good, and not before", () => {
    expect(raceOver(runs, EMPTY_SNAPSHOT)).toBe(false);
    expect(raceOver(runs, snapshotOf([]))).toBe(true);
    // Kai is still running, his stream open or reconnecting: io runs him on.
    expect(raceOver(runs, snapshotOf([kai], [[kai, "open"]]))).toBe(false);
    expect(raceOver(runs, snapshotOf([kai], [[kai, "connecting"]]))).toBe(false);
    // Kai's stream failed for good before his end: nothing more will come from it.
    expect(raceOver(runs, snapshotOf([kai], [[kai, "failed"]]))).toBe(true);
    // A stream that fails after its run's end changes nothing.
    expect(raceOver(runs, snapshotOf([], [[kai, "failed"]]))).toBe(true);
    // One lost stream does not end the others' runs.
    expect(raceOver(runs, snapshotOf([ada, kai], [[kai, "failed"]]))).toBe(false);
  });
});
