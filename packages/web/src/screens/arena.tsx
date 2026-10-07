/**
 * The Race (`docs/PLAN.md` F6): a goal in one sentence and three to five personas in, then one
 * lane per run, stacked and live, so the demo shows who gets across and who does not.
 *
 * This file holds the state and starts the calls to io; the rest is pure or plain. The start panel's
 * rules live in `arena/panel-state.ts`, its calls to io in `arena/panel-calls.ts` and its view in
 * `arena/start-panel.tsx`; the race's folds and its one stream per run in `arena/race.ts`, its view
 * in `arena/race-view.tsx`.
 *
 * The race is not in the URL: a reload returns to the panel. The runs carry on in io either way,
 * and `/runs` lists each once it is stored. Within the app the race outlives the screen (`kept`),
 * so Back from a run or a report it links to finds it again.
 */
import { useQuery } from "@tanstack/react-query";
import { createRoute } from "@tanstack/react-router";
import { useEffect, useReducer, useState } from "react";
import { reportQuery } from "../api/reports.js";
import { checkGoal, type Race, startRace } from "../arena/panel-calls.js";
import { initialPanel, type PanelState, panelReducer } from "../arena/panel-state.js";
import { EMPTY_SNAPSHOT, followRace } from "../arena/race.js";
import { RaceView } from "../arena/race-view.js";
import { StartPanel } from "../arena/start-panel.js";
import { bundledProfiles } from "../bundled-fixtures.js";
import { rootRoute } from "../shell.js";

/**
 * `race` followed live: its streams open on mount and close on unmount. "New race" is drawn with
 * the race, where the snapshot says whether every run is over, and calls `onNewRace`.
 *
 * The preset task's report is read as the race starts, so it is known by the race's end. The race
 * leads to it only once io answers with one: a database `seed:demo` never filled holds none.
 */
function LiveRace({ race, onNewRace }: { race: Race; onNewRace: () => void }) {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  useEffect(() => followRace(race.runs, setSnapshot), [race.runs]);
  const { presetTask } = race;
  const preset = useQuery({
    ...reportQuery(presetTask ?? ""),
    enabled: presetTask !== undefined,
  });
  const reportTask = preset.data == null ? undefined : presetTask;
  return (
    <RaceView
      task={race.task}
      label={race.label}
      seed={race.seed}
      runs={race.runs}
      snapshot={snapshot}
      profiles={bundledProfiles}
      reportTask={reportTask}
      onNewRace={onNewRace}
    />
  );
}

/**
 * The race on screen and the panel it started from, kept for the page's life, not the screen's: a
 * link from the race to a run or a report unmounts the screen, and Back must find the race where
 * it was. io replays each run's events from its start, so the race followed again shows them all.
 * Set only while a race is on screen, so the panel kept has settled: started, nothing in flight.
 * "New race" clears it, and a reload, which starts the page anew.
 */
let kept: { race: Race; panel: PanelState } | undefined;

export function ArenaScreen() {
  const [panel, dispatch] = useReducer(
    panelReducer,
    undefined,
    () => kept?.panel ?? initialPanel(),
  );
  const [race, setRace] = useState<Race | undefined>(() => kept?.race);
  useEffect(() => {
    kept = race === undefined ? undefined : { race, panel };
  }, [race, panel]);

  return (
    // The page column (`docs/DESIGN.md`, "Space, shape and layout"). The reference draws no title
    // row, so the page's one h1 is for a screen reader alone.
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col px-(--space-6)">
      <h1 className="sr-only">Race</h1>
      {race === undefined ? (
        <StartPanel
          state={panel}
          profiles={bundledProfiles}
          onAction={dispatch}
          onCheck={() => void checkGoal(panel, dispatch)}
          onStart={() =>
            void startRace(panel, bundledProfiles, dispatch).then((started) => {
              if (started !== undefined) setRace(started);
            })
          }
        />
      ) : (
        // The panel keeps its choices, so the next race starts from the last one's, checked anew.
        <LiveRace race={race} onNewRace={() => setRace(undefined)} />
      )}
    </div>
  );
}

export const arenaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/race",
  component: ArenaScreen,
});
