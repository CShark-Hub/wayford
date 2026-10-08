/**
 * The Race (`docs/PLAN.md` F6): a goal in one sentence and three to five personas in, then one
 * lane per run, stacked and live, so the demo shows who gets across and who does not.
 *
 * Three routes. `/race` holds the start panel's state, kept for the page's life (`keptPanel`), so
 * the next race starts from the last one's choices, checked anew. `/race/` is the start panel and
 * the History of every race io keeps (`arena/history.tsx`). `/race/$raceId` is one race, by the id
 * io gave it (issue #194): leaving it for another screen, a run or a report it links to, and coming
 * back, or a reload, opens the same race from io. The Race tab leads back to the race last opened
 * (`arena/shown-race.ts`), and "New race" to the panel.
 *
 * A link may name the goal the panel opens on, `/race?task=<id>`, as the Target screen does for a
 * task io stored (`OpeningGoal`). Only the panel's route reads it, and only the panel asks io for
 * the stored goals; choosing another goal does not write the URL.
 *
 * A race io still runs is followed live, one stream per run (`arena/race.ts`): io streams a run's
 * events from its first, so a race reopened midway shows its lanes as they stand. A finished race
 * is drawn from its runs' stored records, which outlive io's process, as its streams do not. Once
 * over, either leads on to a report (`arena/report-task.ts`).
 *
 * This file holds the state and starts the calls to io; the rest is pure or plain. The start panel's
 * rules live in `arena/panel-state.ts`, its calls to io in `arena/panel-calls.ts` and its view in
 * `arena/start-panel.tsx`; the race's folds and its one stream per run in `arena/race.ts`, its view
 * in `arena/race-view.tsx`.
 */
import { type UseQueryResult, useQueries, useQuery } from "@tanstack/react-query";
import { createRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { type RaceId, type Task, TaskId } from "@wayford/core";
import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useEffect,
  useReducer,
  useState,
} from "react";
import { z } from "zod";
import { Banner } from "#components/banner";
import { Skeleton } from "#components/skeleton";
import { Button, buttonVariants } from "#components/ui/button";
import { type Race, raceQuery } from "../api/races.js";
import { runQuery, tasksQuery } from "../api/runs.js";
import { RaceHistory } from "../arena/history.js";
import { checkGoal, startRace } from "../arena/panel-calls.js";
import {
  DEMO_GOAL,
  type Goal,
  goalLabel,
  initialPanel,
  MAX_PERSONAS,
  type PanelAction,
  type PanelState,
  panelReducer,
  presetOf,
  storedGoalOf,
  storedGoals,
} from "../arena/panel-state.js";
import {
  EMPTY_SNAPSHOT,
  followRace,
  liveLane,
  raceOver,
  storedLane,
  UNSTORED_LANE,
} from "../arena/race.js";
import { RaceView } from "../arena/race-view.js";
import { useReportTask } from "../arena/report-task.js";
import { forgetRace, showRace } from "../arena/shown-race.js";
import { StartPanel, type StoredGoals } from "../arena/start-panel.js";
import { bundledProfiles } from "../bundled-fixtures.js";
import { rootRoute } from "../shell.js";

/** The panel's search: the goal to open on. An id that is no task id reads as absent. */
const ArenaSearch = z.object({ task: TaskId.optional().catch(undefined) });

/**
 * io's stored tasks, as the Race reads them: never retried, so a failure shows at once instead of
 * holding the opening goal for the seconds three retries take. `api/runs.ts`'s `tasksQuery` keeps
 * its key, so the Runs screen and the Race share one cache.
 */
export function storedTasksQuery() {
  return { ...tasksQuery(), retry: false } as const;
}

/** The start panel's state and its dispatch, held by the Race's layout. */
const PanelContext = createContext<{ panel: PanelState; dispatch: Dispatch<PanelAction> } | null>(
  null,
);

function usePanel() {
  const held = useContext(PanelContext);
  if (held === null) throw new Error("the start panel is drawn only under the Race's layout");
  return held;
}

/**
 * The panel's last settled state, kept for the page's life, not the layout's: a link from a race to
 * a run or a report, or another tab, unmounts the Race, and the next race still starts from the
 * last one's choices. Only a panel with no check or start in flight is kept, since an answer that
 * lands once the Race has unmounted reaches no reducer. A reload starts the page anew.
 */
let keptPanel: PanelState | undefined;

/** The Race's frame: the page column, the page's one h1, and the panel's state for the children. */
export function ArenaScreen() {
  const [panel, dispatch] = useReducer(panelReducer, undefined, () => keptPanel ?? initialPanel());
  useEffect(() => {
    if (panel.check.status !== "checking" && !panel.starting) keptPanel = panel;
  }, [panel]);
  return (
    // The page column (`docs/DESIGN.md`, "Space, shape and layout"). The reference draws no title
    // row, so the page's one h1 is for a screen reader alone.
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col px-(--space-6)">
      <h1 className="sr-only">Race</h1>
      <PanelContext.Provider value={{ panel, dispatch }}>
        <Outlet />
      </PanelContext.Provider>
    </div>
  );
}

/** The goal a link opens the panel on (none for no goal named), and a line saying why, if any. */
type Opening = { goal?: Goal; notice?: string };

/** Why a failed query failed, in io's words where it gave them. */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The goal `/race?task=` opens on, or `undefined` while it cannot be told yet. No `task`, or a
 * preset's id, opens at once. Another id is a stored task: it opens once io's list holds it, or
 * once the list is neither pending nor fetching, so a cached list fetched before the task was
 * created is not read until its refetch ends. When io holds no such task, or the list failed, no
 * goal opens, under a line naming the id.
 */
function openingOf(task: TaskId | undefined, tasks: UseQueryResult<Task[]>): Opening | undefined {
  if (task === undefined) return {};
  const preset = presetOf(task);
  if (preset !== undefined) return { goal: preset };
  const found = tasks.data?.find((candidate) => candidate.id === task);
  if (found !== undefined) return { goal: storedGoalOf(found) };
  if (tasks.isPending || tasks.isFetching) return undefined;
  const reason = tasks.isError ? reasonOf(tasks.error) : "io holds none";
  return { notice: `No stored goal ${task}: ${reason}` };
}

/** io's list as the panel offers it. */
function storedOf(tasks: UseQueryResult<Task[]>): StoredGoals {
  if (tasks.data !== undefined) return { status: "listed", goals: storedGoals(tasks.data) };
  if (tasks.isError) return { status: "failed", reason: reasonOf(tasks.error) };
  return { status: "loading" };
}

/** While the goal a link names is looked up: a status line over the strip's place. */
function OpeningSkeleton({ task }: { task: TaskId }) {
  return (
    <div className="flex flex-col gap-(--space-4) pt-(--space-5) pb-(--space-6)">
      <p role="status" className="body text-ink-2">
        {`Loading the goal ${task}…`}
      </p>
      <Skeleton className="h-(--control-h) w-120 rounded-sm" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

/**
 * The start panel for one link: `StartScreen` keys it by the link's `task`, so a link to another
 * task mounts it afresh, and its query refetches a stale list on mount. The opening goal is settled
 * once per mount: a later refetch (the window regaining focus) never reopens it. Once settled, a
 * goal is drawn at once, the panel reduced on `goalChosen`, so no frame shows the goal before it,
 * and an effect then hands the layout's reducer the same action, once, for the panel to keep. With
 * no goal to open, the panel stands as the layout holds it, under the line saying why, if any.
 */
function OpeningGoal({
  task,
  onStarted,
}: {
  task: TaskId | undefined;
  onStarted: (raceId: RaceId) => void;
}) {
  const { panel, dispatch } = usePanel();
  const tasks = useQuery(storedTasksQuery());
  const [settled, setSettled] = useState<Opening>();
  let opening = settled;
  if (opening === undefined) {
    opening = openingOf(task, tasks);
    // A render-phase update of this component's own state: React renders again at once.
    if (opening !== undefined) setSettled(opening);
  }
  const goal = opening?.goal;
  const [applied, setApplied] = useState(false);
  useEffect(() => {
    if (goal === undefined || applied) return;
    dispatch({ type: "goalChosen", goal });
    setApplied(true);
  }, [goal, applied, dispatch]);

  // `openingOf` waits only on a link that names a task.
  if (opening === undefined) return <OpeningSkeleton task={task ?? DEMO_GOAL} />;
  const shown =
    goal === undefined || applied ? panel : panelReducer(panel, { type: "goalChosen", goal });
  return (
    <>
      {opening.notice === undefined ? null : (
        <p role="status" className="pt-(--space-5) body text-ink-2">
          {opening.notice}
        </p>
      )}
      <StartPanel
        state={shown}
        profiles={bundledProfiles}
        stored={storedOf(tasks)}
        onAction={dispatch}
        onCheck={() => void checkGoal(shown, dispatch)}
        onStart={() =>
          void startRace(shown, bundledProfiles, dispatch).then((raceId) => {
            if (raceId !== undefined) onStarted(raceId);
          })
        }
      />
    </>
  );
}

/**
 * `/race/`: the start panel, which opens the race io started, and the History under it. A link's
 * `?task=` names the goal the panel opens on (`OpeningGoal`).
 */
export function StartScreen() {
  const { task } = startRoute.useSearch();
  const navigate = useNavigate();
  // The panel is open, so the Race tab leads here again.
  useEffect(() => forgetRace(), []);
  return (
    <>
      {/* Keyed by the link as given: `/race` and each `?task=` open afresh. */}
      <OpeningGoal
        key={task ?? ""}
        task={task}
        onStarted={(raceId) => void navigate({ to: "/race/$raceId", params: { raceId } })}
      />
      <RaceHistory />
    </>
  );
}

/** What a race shows above its lanes, from io's record of it. */
function headerOf(race: Race) {
  return {
    task: race.task,
    label: goalLabel(race.task),
    seeds: [...new Set(race.runs.map((run) => run.seed))],
    runs: race.runs,
    profiles: bundledProfiles,
  };
}

/** A race io still runs, followed live: its streams open on mount and close on unmount. */
function LiveRace({ race, onNewRace }: { race: Race; onNewRace: () => void }) {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  useEffect(() => followRace(race.runs, setSnapshot), [race.runs]);
  const reportTask = useReportTask(race.task);
  return (
    <RaceView
      {...headerOf(race)}
      foldOf={(run) => liveLane(snapshot, run.id)}
      source="live"
      over={raceOver(race.runs, snapshot)}
      reportTask={reportTask}
      onNewRace={onNewRace}
    />
  );
}

/**
 * A finished race, drawn from its runs' stored records: a run io holds no record of is drawn as
 * `UNSTORED_LANE`. While a record loads, the lanes wait as skeletons; a record io fails to send is
 * a fault, with "Try again".
 */
function StoredRace({ race, onNewRace }: { race: Race; onNewRace: () => void }) {
  const records = useQueries({ queries: race.runs.map((run) => runQuery(run.id)) });
  const reportTask = useReportTask(race.task);
  const failed = records.find((record) => record.isError && record.data === undefined);
  if (failed !== undefined) {
    return (
      <Fault
        what="This race's runs"
        message={failed.error?.message ?? ""}
        retry={() => {
          for (const record of records) if (record.isError) void record.refetch();
        }}
      />
    );
  }
  if (records.some((record) => record.data === undefined))
    return <Loading lanes={race.runs.length} />;
  // In `race.runs`' order; `null` for a run io answered 404 for.
  const recordOf = new Map(race.runs.map((run, index) => [run.id, records[index]?.data]));
  return (
    <RaceView
      {...headerOf(race)}
      foldOf={(run) => {
        const record = recordOf.get(run.id);
        return record ? storedLane(record) : UNSTORED_LANE;
      }}
      source="stored"
      over
      reportTask={reportTask}
      onNewRace={onNewRace}
    />
  );
}

/** A race loading: the goal strip and `lanes` lanes, as skeletons. */
function Loading({ lanes }: { lanes: number }) {
  return (
    <div className="flex flex-col gap-2.5 pt-(--space-4) pb-(--space-4)">
      <p role="status" className="sr-only">
        Loading race
      </p>
      <Skeleton className="h-6 w-40" />
      <Skeleton className="mb-(--space-2) h-10 w-full max-w-200" />
      {Array.from({ length: lanes }, (_, lane) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders with nothing else to key on
        <Skeleton key={lane} className="h-24 w-full rounded-md" />
      ))}
    </div>
  );
}

/** io failing to send `what`, with its message and "Try again". */
function Fault({ what, message, retry }: { what: string; message: string; retry: () => void }) {
  return (
    <div className="pt-(--space-4)">
      <Banner
        kind="fault"
        action={
          <Button variant="outline" onClick={retry}>
            Try again
          </Button>
        }
      >
        {`${what} could not be read from io. `}
        <span className="block mono whitespace-pre-wrap">{message}</span>
      </Banner>
    </div>
  );
}

/** io keeps no race under the URL's id, with the way back to the panel and its History. */
function NoRace({ raceId, children }: { raceId: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-(--space-3) pt-(--space-5)">
      <h2 className="readout wrap-anywhere text-ink">{raceId}</h2>
      <p className="body text-ink-2">{`io keeps no race ${raceId}.`}</p>
      {children}
    </div>
  );
}

/**
 * A running race of more runs than the browser can follow at once: one stream per run, and a
 * browser opens few connections per origin (`MAX_PERSONAS` in `arena/panel-state.ts`). Only a run
 * set started through io's API can be one; the start panel takes at most `MAX_PERSONAS`.
 */
function TooManyToFollow({ race, onNewRace }: { race: Race; onNewRace: () => void }) {
  return (
    <section
      aria-labelledby="race-goal"
      className="flex flex-col items-start gap-(--space-3) pt-(--space-5)"
    >
      <h2 id="race-goal" className="display-m text-balance text-ink">
        <q>{race.task.goal}</q>
      </h2>
      <p className="max-w-170 body text-pretty text-ink-2">
        {`This race has ${race.runs.length} runs, more than the ${MAX_PERSONAS} a browser can follow live at once. Open it again once it has finished to see it drawn from its runs' records, and each run is under Runs once it is stored.`}
      </p>
      <Button type="button" variant="outline" onClick={onNewRace}>
        New race
      </Button>
    </section>
  );
}

/**
 * `race` as io said it stands when the screen asked: live while io runs it, from its runs' records
 * once it has finished. io is asked again when the screen opens, not while it shows the race, so a
 * race that finishes on screen stays live, its streams having brought every event. A race opened
 * again later, or after io restarted, which ends every run under way, is drawn from its records.
 */
function OpenedRace({ race, onNewRace }: { race: Race; onNewRace: () => void }) {
  if (race.status === "finished") return <StoredRace race={race} onNewRace={onNewRace} />;
  if (race.runs.length > MAX_PERSONAS) return <TooManyToFollow race={race} onNewRace={onNewRace} />;
  return <LiveRace race={race} onNewRace={onNewRace} />;
}

/**
 * `/race/$raceId`: the race io keeps under the id (`OpenedRace`). Opening it makes it the race the
 * Race tab leads back to.
 */
export function RaceScreen() {
  const { raceId } = raceRoute.useParams();
  const navigate = useNavigate();
  const race = useQuery(raceQuery(raceId));
  const missing = race.data === null;
  useEffect(() => {
    if (missing) forgetRace();
    else showRace(raceId);
  }, [raceId, missing]);
  const onNewRace = () => void navigate({ to: "/race" });

  // Before a not-found too: io failing after a 404 says nothing about whether the race is kept.
  if (race.isError && !race.data) {
    return <Fault what="The race" message={race.error.message} retry={() => void race.refetch()} />;
  }
  if (race.data === undefined) return <Loading lanes={3} />;
  if (race.data === null) {
    return (
      <NoRace raceId={raceId}>
        <Link to="/race" className={buttonVariants({ variant: "outline" })}>
          Open the races
        </Link>
      </NoRace>
    );
  }
  // Keyed by the race and its status: another race's URL opens afresh, and a race io says has
  // finished since the screen last asked is drawn from its records.
  return (
    <OpenedRace
      key={`${race.data.id} ${race.data.status}`}
      race={race.data}
      onNewRace={onNewRace}
    />
  );
}

export const arenaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/race",
  component: ArenaScreen,
});

export const startRoute = createRoute({
  getParentRoute: () => arenaRoute,
  path: "/",
  validateSearch: ArenaSearch,
  component: StartScreen,
});

export const raceRoute = createRoute({
  getParentRoute: () => arenaRoute,
  path: "$raceId",
  component: RaceScreen,
});

/** The Race's routes, as the router's tree takes them. */
export const arenaRoutes = arenaRoute.addChildren([startRoute, raceRoute]);
