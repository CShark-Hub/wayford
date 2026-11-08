/**
 * Test and check data, Node only: this file imports `@wayford/core/fixtures`, which reads its files
 * with `node:fs`, so no screen may import it. It holds `demoRace`, a race in progress built from
 * Vera's fixture run, `waitingRace`, the same race while one run still waits for a slot,
 * `eventsOf`, which makes fixture events a run's own, and `droppedBy`, the one event io streams for
 * a run a stop dropped. The race's tests import both races and `droppedBy` from here, and the
 * self-check serves the races, and the races it builds with `eventsOf`, to the Race.
 *
 * A module of its own so the self-check can load it. `check:self` runs under plain `tsx`, not Vite,
 * and `./fixture-race.js` reaches Vite's `import.meta.glob` through `./panel-state.js`. This file
 * imports only core, its fixtures and a type, none of which needs Vite.
 */
import { RunEvent, type RunId, type StartedRun } from "@wayford/core";
import { runEventFixtures } from "@wayford/core/fixtures";

const firstEvent = runEventFixtures[0];
if (firstEvent === undefined) throw new Error("the fixture stream holds no event");

/** The run id every fixture event carries: Vera's run on the hard goal. */
const FIXTURE_RUN_ID: RunId = firstEvent.runId;

/** The seed every run of `demoRace` shares. */
const DEMO_SEED = 1;

/**
 * Fixture events made `run`'s own: every mention of the fixture's run id, its `runId` and the file
 * paths named after it, becomes `run.id`, so no run names another's files, and `runStarted` names
 * `run.profileId` and `run.seed`. What `changes` returns for an event, given it as the fixture has
 * it, is laid over it last. Each is re-parsed, so it is an event core's contract accepts.
 *
 * Nothing else changes: `runStarted` keeps Vera's `startUrl`, her thresholds in its query, and the
 * provider seed drawn from her seed. The race draws neither. Each step keeps Vera's simulated time
 * too, her pace's, which the lane's clock sums.
 */
export function eventsOf(
  run: StartedRun,
  events: readonly RunEvent[],
  changes: (event: RunEvent) => object = () => ({}),
): RunEvent[] {
  return events.map((event) => {
    const renamed = JSON.parse(JSON.stringify(event).replaceAll(FIXTURE_RUN_ID, run.id));
    const started = event.type === "runStarted" ? { profileId: run.profileId, seed: run.seed } : {};
    return RunEvent.parse({ ...renamed, ...started, ...changes(event) });
  });
}

const demoAda: StartedRun = { id: "run_ada-race", profileId: "prof_ada", seed: DEMO_SEED };
const demoKai: StartedRun = { id: "run_kai-race", profileId: "prof_kai", seed: DEMO_SEED };
const demoVera: StartedRun = { id: "run_vera-race", profileId: "prof_vera", seed: DEMO_SEED };

/**
 * Steps 0 and 1 of the fixture, then the goal reached at 6.5 s on the wall clock, billed for those
 * two steps.
 */
const adaGetsThrough = [
  ...runEventFixtures.slice(0, 9),
  RunEvent.parse({
    type: "runFinished",
    runId: FIXTURE_RUN_ID,
    stepIndex: 1,
    timestamp: "2026-09-22T10:00:06.500Z",
    outcome: "success",
    durationMs: 6500,
    cost: { tokensIn: 2320, tokensOut: 440, usd: 0.0068 },
  }),
];

/**
 * The race in progress that the self-check measures and `docs/design/screens/race.html` draws, on
 * the fixture's timeline. Ada, Kai and Vera, in the order the panel sends them, each on seed 1, all
 * started at once. Each lane's clock is the simulated time of its steps so far:
 * - Ada gets through at step 1, in 2 steps, at 0:07.3;
 * - Kai has observed step 4 and nothing more: moving, 5 steps so far, the last under way, 0:13.8;
 * - Vera runs the whole fixture and gives up at step 4, at 0:16.5.
 */
export const demoRace: {
  runs: StartedRun[];
  events: ReadonlyMap<RunId, readonly RunEvent[]>;
} = {
  runs: [demoAda, demoKai, demoVera],
  events: new Map([
    [demoAda.id, eventsOf(demoAda, adaGetsThrough)],
    [demoKai.id, eventsOf(demoKai, runEventFixtures.slice(0, 16))],
    [demoVera.id, eventsOf(demoVera, runEventFixtures)],
  ]),
};

/**
 * The one event io streams for `run` when a stop drops it from its queue before it started (#6): a
 * `runFinished` `cancelled` at step 0, after no time and at no cost, with no `runStarted` before
 * it, dated `timestamp`.
 */
export function droppedBy(run: StartedRun, timestamp = "2026-09-22T10:00:05.000Z"): RunEvent {
  return RunEvent.parse({
    type: "runFinished",
    runId: run.id,
    stepIndex: 0,
    timestamp,
    outcome: "cancelled",
    durationMs: 0,
    cost: { tokensIn: 0, tokensOut: 0, usd: 0 },
  });
}

/**
 * `demoRace` while Vera's run still waits for a slot behind another race's runs (#6). io lists it
 * in the race's `waiting`, and her stream, open, brings nothing, so her lane waits with no step.
 * Ada gets through and Kai is under way, as in `demoRace`, so the race is not over and offers Stop
 * race. `dropped` is what her stream brings once a stop drops her run: its one event, which ends
 * it.
 */
export const waitingRace: {
  runs: StartedRun[];
  waiting: RunId[];
  events: ReadonlyMap<RunId, readonly RunEvent[]>;
  dropped: readonly RunEvent[];
} = {
  runs: demoRace.runs,
  waiting: [demoVera.id],
  // A Map keeps a key where it was first set, so Vera's empty stream keeps her lane third.
  events: new Map([...demoRace.events, [demoVera.id, []]]),
  // Dated after Kai's step 4 was observed, the latest event of the race.
  dropped: [droppedBy(demoVera, "2026-09-22T10:00:14.000Z")],
};
