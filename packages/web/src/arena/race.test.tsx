import { createMemoryHistory, RouterContextProvider } from "@tanstack/react-router";
import {
  type Action,
  RunEvent,
  type RunId,
  type RunLimit,
  type RunOutcome,
  runResultFromEvents,
} from "@wayford/core";
import { profileFixtures, runEventFixtures } from "@wayford/core/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { OutcomeKind } from "#components/outcome";
import type { Pip } from "#components/race-lane";
import { FakeEventSource } from "../api/fake-event-source.js";
import type { StreamStatus } from "../api/run-events.js";
import type { StartedRun } from "../api/runs.js";
import { attributesOf, lineOf } from "../preview/rendered-markup.js";
import { createAppRouter } from "../router.js";
import { demoRace } from "./demo-race.js";
import {
  atStep,
  avatarStateOf,
  beforeEnd,
  failed,
  finished,
  fixtureEvent,
  hardTask,
  shifted,
  stuckRun,
  tileOf,
} from "./fixture-race.js";
import {
  clockText,
  EMPTY_SNAPSHOT,
  finishOrder,
  followRace,
  laneOutcome,
  type RaceSnapshot,
  type RunView,
  raceOver,
  runStored,
  runView,
  stepPips,
  stepsText,
  throughPlaces,
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

/** The race drawn from `snapshot`, inside the app's router, so its links build their hrefs. */
function render(snapshot: RaceSnapshot): string {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ["/race"] }) });
  return renderToStaticMarkup(
    <RouterContextProvider router={router}>
      <RaceView
        task={hardTask}
        label="Hard goal"
        seed={SEED}
        runs={runs}
        snapshot={snapshot}
        profiles={profileFixtures}
        reportTask={hardTask.id}
        onNewRace={() => {}}
      />
    </RouterContextProvider>,
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
  // terminal events arrived in. Only a run that got through is numbered, as its post is; the others
  // follow it with no number.
  expect(finishLines(at(ada, 13))).toStrictEqual(["1. Ada Got through 0:09.5"]);
  expect(finishLines(at(vera, 21))).toStrictEqual([
    "1. Ada Got through 0:09.5",
    "– Vera Gave up 0:18.5",
  ]);
  expect(finishLines(end)).toStrictEqual([
    "1. Ada Got through 0:09.5",
    "– Kai Error 0:04.5",
    "– Vera Gave up 0:18.5",
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

test("a stream lost mid-run: its tile says what was last seen, its avatar has no state, and it is listed after the runs that ended", () => {
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
  // No live state: the avatar is plain, with no badge and no `data-state`, and dimmed on its tile.
  const avatar = attributesOf(tile.match(/<svg[^>]*>/)?.[0] ?? "");
  expect(avatar).not.toHaveProperty("data-state");
  const avatarTile = attributesOf(tile.match(/<div[^>]*>(?=<svg)/)?.[0] ?? "");
  expect(avatarTile.class).toContain("opacity-50");
  expect(tile).not.toContain('data-part="state"');
  // The others carry on to their ends, listed; the lost run comes after them, with no place.
  expect(avatarStateOf(html, ada)).toBe("done");
  expect(avatarStateOf(html, vera)).toBe("gaveUp");
  expect(finishLines(html)).toStrictEqual([
    "1. Ada Got through 0:09.5",
    "– Vera Gave up 0:18.5",
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

describe("runStored", () => {
  test("holds once a run that started has its terminal event, runFinished or runFailed", () => {
    expect(runStored(runEventFixtures)).toBe(true);
    expect(runStored([...beforeEnd, failed])).toBe(true);
  });

  test("does not hold before the terminal event, nor for a run that never sent runStarted", () => {
    expect(runStored([])).toBe(false);
    expect(runStored(beforeEnd)).toBe(false);
    expect(runStored([failed])).toBe(false);
  });
});

/** The pips Vera's fixture steps make once each has landed or been wasted. */
const CLICK: Pip = { kind: "act", word: "click" };
const SCROLL: Pip = { kind: "scroll", word: "scroll" };
const DOUBLE_CLICK: Pip = { kind: "act", word: "doubleClick" };
const WASTED: Pip = { kind: "wasted", word: "wasted" };
/** The step under way: observed, neither landed nor wasted, in a run that has not ended. */
const NOW: Pip = { kind: "now", word: "under way" };

/** `events` cut after each of them: the first none, the first one, and so on to all. */
function prefixes(events: readonly RunEvent[]): RunEvent[][] {
  return Array.from({ length: events.length + 1 }, (_, n) => events.slice(0, n));
}

/** Steps 0 and 1 of the fixture, then the budget runs out at 7.5 s, once step 2 is observed. */
const overBudget = [
  ...runEventFixtures.slice(0, 10),
  RunEvent.parse({
    ...finished,
    stepIndex: 2,
    timestamp: "2026-09-22T10:00:07.500Z",
    outcome: "budget_exceeded",
    durationMs: 7500,
  }),
];

/** `overBudget` with the limit that cut it off, as the loop has recorded it since #196. */
function cutOffBy(limit: RunLimit): RunEvent[] {
  return [...overBudget.slice(0, -1), RunEvent.parse({ ...overBudget.at(-1), limit })];
}

/** `demoRace`'s events for `run`. */
function demoEventsOf(run: StartedRun): readonly RunEvent[] {
  const events = demoRace.events.get(run.id);
  if (events === undefined) throw new Error(`demoRace has no events for ${run.id}`);
  return events;
}

describe("stepPips", () => {
  test("Vera's run, cut after each of its events: one pip per step, in step order", () => {
    expect(prefixes(runEventFixtures).map((events) => stepPips(events, false))).toStrictEqual([
      // No event, then runStarted: no step has begun.
      [],
      [],
      // Step 0 observed, narrated and planned: under way until its click lands.
      [NOW],
      [NOW],
      [NOW],
      [CLICK],
      // Step 1, a scroll.
      [CLICK, NOW],
      [CLICK, NOW],
      [CLICK, NOW],
      [CLICK, SCROLL],
      // Step 2, a click the dice made a double click: the performed action names the pip.
      [CLICK, SCROLL, NOW],
      [CLICK, SCROLL, NOW],
      [CLICK, SCROLL, NOW],
      [CLICK, SCROLL, DOUBLE_CLICK],
      // Step 3, observed, then wasted.
      [CLICK, SCROLL, DOUBLE_CLICK, NOW],
      [CLICK, SCROLL, DOUBLE_CLICK, WASTED],
      // Step 4 observed, narrated, the give-up planned; once the give-up lands, it makes no pip.
      [CLICK, SCROLL, DOUBLE_CLICK, WASTED, NOW],
      [CLICK, SCROLL, DOUBLE_CLICK, WASTED, NOW],
      [CLICK, SCROLL, DOUBLE_CLICK, WASTED, NOW],
      [CLICK, SCROLL, DOUBLE_CLICK, WASTED],
      // runFinished.
      [CLICK, SCROLL, DOUBLE_CLICK, WASTED],
    ]);
  });

  test("Kai's run, cut once step 4 is observed, ends on the step under way", () => {
    const [, kaiRun] = demoRace.runs;
    if (kaiRun === undefined) throw new Error("demoRace has no second run");
    expect(stepPips(demoEventsOf(kaiRun), false)).toStrictEqual([
      CLICK,
      SCROLL,
      DOUBLE_CLICK,
      WASTED,
      NOW,
    ]);
  });

  test("once the run has ended, a step observed but never landed makes no pip", () => {
    // Step 1 is observed, then the run crashes; until the crash, step 1 is under way.
    expect(stepPips(crashes.slice(0, -1), false)).toStrictEqual([CLICK, NOW]);
    expect(stepPips(crashes, false)).toStrictEqual([CLICK]);
    // Step 2 is observed, then the budget runs out.
    expect(stepPips(overBudget.slice(0, -1), false)).toStrictEqual([CLICK, SCROLL, NOW]);
    expect(stepPips(overBudget, false)).toStrictEqual([CLICK, SCROLL]);
  });

  test("the performed action names the pip: click, double click and type act; scroll and wait scroll; back goes back; a give-up makes none", () => {
    const cases: [Action, Pip[]][] = [
      [{ type: "click", ref: "e3" }, [{ kind: "act", word: "click" }]],
      [{ type: "doubleClick", ref: "e3" }, [{ kind: "act", word: "doubleClick" }]],
      [{ type: "type", ref: "e3", text: "order" }, [{ kind: "act", word: "type" }]],
      [{ type: "scroll", direction: "up" }, [{ kind: "scroll", word: "scroll" }]],
      [{ type: "wait", ms: 500 }, [{ kind: "scroll", word: "wait" }]],
      [{ type: "back" }, [{ kind: "back", word: "back" }]],
      [{ type: "giveUp" }, []],
    ];
    /** The fixture's steps 0 and 1, step 1's scroll replaced by `action`, landed. */
    const withStep1 = (action: Action) => [
      ...runEventFixtures.slice(0, 7),
      atStep(fixtureEvent(7), 1, { proposedAction: action, performedAction: action }),
      fixtureEvent(8),
    ];
    expect(cases.map(([action]) => stepPips(withStep1(action), false))).toStrictEqual(
      cases.map(([, step1]) => [CLICK, ...step1]),
    );
  });
});

describe("throughPlaces", () => {
  const milo: StartedRun = { id: "run_milo-race-1", profileId: "prof_milo", seed: SEED };
  const zoya: StartedRun = { id: "run_zoya-race-1", profileId: "prof_zoya", seed: SEED };
  /** Vera's fixture run with the goal reached where she gave up, at 15.5 s. */
  const reachesItLate = [
    ...runEventFixtures.slice(0, -1),
    RunEvent.parse({ ...finished, outcome: "success" }),
  ];

  test("ranks the runs that got through among themselves: equal times share the lower place, and the next counts both", () => {
    // Kai crashes after 4.5 s and Vera runs over budget after 7.5 s, before anyone gets through:
    // neither counts. Ada and Milo get through in 9.5 s each, Zoya in 15.5 s.
    const views = viewsOf(
      new Map([
        [kai.id, rewritten(crashes, kai, 0)],
        [ada.id, rewritten(reachesTheGoal, ada, 0)],
        [vera.id, rewritten(overBudget, vera, 0)],
        [milo.id, rewritten(reachesTheGoal, milo, 1000)],
        [zoya.id, rewritten(reachesItLate, zoya, 0)],
      ]),
    );
    expect([...throughPlaces([kai, ada, vera, milo, zoya], views)]).toStrictEqual([
      [ada.id, 1],
      [milo.id, 1],
      [zoya.id, 3],
    ]);
  });

  test("no run got through: no places", () => {
    expect(throughPlaces(runs, new Map())).toStrictEqual(new Map());
    const views = viewsOf(new Map([[kai.id, RACE[1]?.events ?? []]]));
    expect(finishOrder(runs, views).map(({ state }) => state)).toStrictEqual(["error"]);
    expect(throughPlaces(runs, views)).toStrictEqual(new Map());
  });
});

describe("clockText", () => {
  test("m:ss.d from the elapsed time rounded to tenths once, or a dash before runStarted", () => {
    const cases: [number | undefined, string][] = [
      [undefined, "—"],
      [0, "0:00.0"],
      [3000, "0:03.0"],
      [9449, "0:09.4"],
      [9450, "0:09.5"],
      [15_500, "0:15.5"],
      [75_400, "1:15.4"],
      // Rounded once, not seconds and tenths apart, so never "0:60.0".
      [59_960, "1:00.0"],
      [600_000, "10:00.0"],
    ];
    expect(cases.map(([ms]) => clockText(ms))).toStrictEqual(cases.map(([, text]) => text));
  });
});

describe("stepsText", () => {
  test("counts the steps begun, the give-up's included: so far while the run runs", () => {
    expect(stepsText([], false)).toBe("0 steps so far");
    expect(stepsText(runEventFixtures.slice(0, 1), false)).toBe("0 steps so far");
    expect(stepsText(runEventFixtures.slice(0, 2), false)).toBe("1 step so far");
    expect(stepsText(runEventFixtures.slice(0, 16), false)).toBe("5 steps so far");
  });

  test("once the run has ended, the count alone, a step observed but never landed included", () => {
    expect(stepsText(runEventFixtures, true)).toBe("5 steps");
    expect(stepsText(crashes, true)).toBe("2 steps");
    const crashOnStep0 = RunEvent.parse({
      ...crashes.at(-1),
      stepIndex: 0,
      timestamp: "2026-09-22T10:00:01.500Z",
      durationMs: 1500,
    });
    expect(stepsText([...runEventFixtures.slice(0, 2), crashOnStep0], true)).toBe("1 step");
  });

  test("a step observed twice is one step", () => {
    expect(stepsText([...runEventFixtures.slice(0, 2), fixtureEvent(1)], false)).toBe(
      "1 step so far",
    );
  });
});

describe("laneOutcome", () => {
  const idle = runView(runEventFixtures.slice(0, 2));
  const moving = runView(runEventFixtures.slice(0, 6));
  // Step 5 observed: steps 3 and 4 both left /settings as it was.
  const stuck = runView(stuckRun.slice(0, 18));

  test("a run still running: its live state", () => {
    expect(
      [idle, moving, stuck].map((view) => [view.state, laneOutcome(view, false)]),
    ).toStrictEqual([
      ["idle", "waiting"],
      ["moving", "moving"],
      ["stuck", "stuck"],
    ]);
  });

  test("a run that ended: its stored outcome, a budget run out told from Gave up and by its limit", () => {
    const ended: [readonly RunEvent[], OutcomeKind][] = [
      [reachesTheGoal, "through"],
      [runEventFixtures, "gaveUp"],
      [cutOffBy("steps"), "stepCap"],
      [cutOffBy("clock"), "outOfTime"],
      // No limit on its runFinished, as before #196: Over budget.
      [overBudget, "overBudget"],
      [crashes, "error"],
    ];
    expect(ended.map(([events]) => laneOutcome(runView(events), false))).toStrictEqual(
      ended.map(([, kind]) => kind),
    );
  });

  test("a lost stream: Stream lost, never a live state", () => {
    expect([idle, moving, stuck].map((view) => laneOutcome(view, true))).toStrictEqual([
      "lost",
      "lost",
      "lost",
    ]);
  });
});
