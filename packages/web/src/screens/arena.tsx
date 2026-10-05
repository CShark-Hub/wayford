/**
 * The arena (`docs/PLAN.md` F6): a goal in one sentence and three to five personas in, then the
 * runs side by side, live, so the demo shows who gets across and who does not.
 *
 * This file holds the state and starts the calls to io; the rest is pure or plain. The start panel's
 * rules live in `arena/panel-state.ts`, its calls to io in `arena/panel-calls.ts` and its view in
 * `arena/start-panel.tsx`; the race's folds and its one stream per run in `arena/race.ts`, its view
 * in `arena/race-view.tsx`.
 *
 * The race is not in the URL: a reload returns to the panel. The runs carry on in io either way,
 * and `/runs` lists each once it is stored.
 */
import { createRoute } from "@tanstack/react-router";
import { useEffect, useReducer, useState } from "react";
import { checkGoal, type Race, startRace } from "../arena/panel-calls.js";
import { initialPanel, panelReducer } from "../arena/panel-state.js";
import { EMPTY_SNAPSHOT, followRace } from "../arena/race.js";
import { RaceView } from "../arena/race-view.js";
import { StartPanel } from "../arena/start-panel.js";
import { bundledProfiles } from "../bundled-fixtures.js";
import { rootRoute } from "../shell.js";

/**
 * `race` followed live: its streams open on mount and close on unmount. "New race" is drawn with
 * the race, where the snapshot says whether every run is over, and calls `onNewRace`.
 */
function LiveRace({ race, onNewRace }: { race: Race; onNewRace: () => void }) {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  useEffect(() => followRace(race.runs, setSnapshot), [race.runs]);
  return (
    <RaceView
      goal={race.goal}
      seed={race.seed}
      runs={race.runs}
      snapshot={snapshot}
      profiles={bundledProfiles}
      onNewRace={onNewRace}
    />
  );
}

export function ArenaScreen() {
  const [panel, dispatch] = useReducer(panelReducer, undefined, () => initialPanel());
  const [race, setRace] = useState<Race | undefined>();

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Arena</h1>
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
        // The panel keeps its state, so the next race starts from the last one's choices.
        <LiveRace race={race} onNewRace={() => setRace(undefined)} />
      )}
    </div>
  );
}

export const arenaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/arena",
  component: ArenaScreen,
});
