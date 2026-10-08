/**
 * The race as `docs/design/screens/race.html` draws it (`docs/PLAN.md` F6): the goal strip, then
 * one lane per run in start order, stacked full width. A pure view of each run's `LaneFold`: the
 * screen folds a live race's snapshot with `liveLane` and a finished race's stored runs with
 * `storedLane`, and this turns the folds into each `RaceLane`'s props, so a test renders any moment
 * of a race without a stream.
 *
 * A lane says what its state rests on: the page a stuck persona left as it was, a crash's message,
 * the state a lost stream was last seen in. The narration is the model's, labelled as written after
 * the fact and never read into. Each avatar state is a static variant (`Avatar`'s `state`), swapped
 * as the events come: nothing moves. A run whose stream broke for good before its end shows no
 * live state: its avatar is plain and dimmed, its track has no step under way, and its lane says
 * what was last seen.
 *
 * Every clock on the Race is simulated time (B3's clock): each step's cost from the KLM and
 * Fitts's law at the persona's pace, never the wall clock, which measures the model and the
 * machine. The goal strip says so once, in a caption over the lanes, and each lane's clock says it
 * to a screen reader (`RaceLane`).
 *
 * The finish order stays as a list for screen readers, the page's one live region. It ranks by
 * simulated time and numbers only the runs that got through, with the places their goal posts show
 * to the eye. Every other ended run follows with no number, its outcome word and its clock, and a
 * lost run comes last.
 *
 * Each lane links to its run detail once io holds the run's record (its fold's `stored`), and once
 * the race is `over` the goal strip leads on to a report, whatever the outcomes.
 */
import { Link } from "@tanstack/react-router";
import type { Profile, Seed, StartedRun, Task, TaskId } from "@wayford/core";
import type { ReactElement } from "react";
import { OUTCOME_WORDS } from "#components/outcome";
import { PersonaAvatar } from "#components/persona-avatar";
import { RaceLane } from "#components/race-lane";
import { SourceBadge } from "#components/source-badge";
import { Tag } from "#components/tag";
import { Button, buttonVariants } from "#components/ui/button";
import { screenshotUrl } from "../api/runs.js";
import { slotOf } from "../avatar/slots.js";
import { STATE_WORDS } from "../avatar/state.js";
import { count } from "../components/outcome-words.js";
import { STUCK_STEPS } from "./avatar-state.js";
import {
  clockText,
  finishOrder,
  type LaneFold,
  laneOutcome,
  type RunView,
  throughPlaces,
} from "./race.js";
import { successText } from "./start-panel.js";

const NEW_RACE_LINE_ID = "race-new-race-line";

/**
 * What a lane's state rests on: the state a lost stream was last seen in, `runFailed`'s message, or
 * the page the last `STUCK_STEPS` steps of a stuck run left as it was, its path in mono. Nothing for
 * any other state, whose outcome word says it all.
 */
function detailOf(view: RunView, lost: boolean): string | ReactElement | undefined {
  if (lost) return `${OUTCOME_WORDS.lost}: last seen ${STATE_WORDS[view.state].toLowerCase()}`;
  if (view.ended?.error !== undefined) return view.ended.error;
  if (view.state !== "stuck") return undefined;
  return (
    <>
      {`${STATE_WORDS.stuck}: the last ${STUCK_STEPS} steps left `}
      <span className="mono">{view.stuckOn}</span>
      {" as it was"}
    </>
  );
}

/**
 * "Analyse this race": the race's own report, which starts the Analyst on arrival
 * (`screens/report.tsx`, `?analyse`). io reads the backend the race's runs are on.
 */
function AnalyseLink({
  taskId,
  variant,
  size,
}: {
  taskId: TaskId;
  variant: "default" | "ghost";
  size: "default" | "sm";
}) {
  return (
    <Link
      to="/report/$taskId"
      params={{ taskId }}
      search={{ analyse: true }}
      className={buttonVariants({ variant, size })}
    >
      Analyse this race
    </Link>
  );
}

/** One run as its lane draws it: the run, the name its lane carries, and its fold. */
type Lane = { run: StartedRun; name: string } & LaneFold;

/**
 * `lane`'s `RaceLane`. `place` is its place among the runs that got through. Its avatar shows the
 * live state, or, on a lost lane, no state and dimmed, and a lost lane's track no step under way.
 */
function LaneOf({
  lane: { run, name, view, pips, steps, lost, note, stored },
  profile,
  place,
}: {
  lane: Lane;
  profile: Profile | undefined;
  place: number | undefined;
}) {
  const avatar =
    profile === undefined ? null : lost ? (
      <PersonaAvatar profile={profile} className="size-16 shrink-0 opacity-50" />
    ) : (
      <PersonaAvatar profile={profile} state={view.state} className="size-16 shrink-0" />
    );
  return (
    <RaceLane
      // Built from the run id, so the markup depends on the props alone.
      headingId={`race-${run.id}`}
      slot={slotOf(run.profileId)}
      avatar={avatar}
      name={name}
      pips={pips}
      place={place}
      shot={
        view.screenshotStep === undefined
          ? undefined
          : {
              src: screenshotUrl(run.id, view.screenshotStep),
              alt: `${name}, after step ${view.screenshotStep}`,
            }
      }
      outcome={laneOutcome(view, lost)}
      clock={clockText(view.simulatedMs)}
      steps={steps}
      detail={note ?? detailOf(view, lost)}
      narration={view.narration}
      runId={stored ? run.id : undefined}
    />
  );
}

/**
 * The race with each run's lane as `foldOf` folds it: `task`'s goal as the personas got it, under
 * its preset's `label`, the `seeds` its runs share, a lane per run of `runs` in their order, and the
 * finish order for screen readers. Every run's persona is in `profiles`, the list io checks the
 * ids against; were one not, its id would name it, with no avatar. A race on more than one seed
 * names each lane's seed after its persona, since each persona then has a lane per seed.
 *
 * `source` is where the folds come from. The header's badge reads `live` while a live race is not
 * `over`, so a stream can still bring an event, and nothing once it is: the screen holds no record,
 * only what the streams brought. A race drawn from its runs' records reads `stored`.
 *
 * "New race" calls `onNewRace` at any time: several races can run at once. io cannot cancel a run,
 * so while the race is not `over` it says that a new race's runs queue behind these.
 *
 * Once the race is over, a line under the buttons says how many runs got through, in k/n, and how
 * many streams were lost, and the strip leads on to a report. Every race is checked anew, and the
 * check mints a task, so this race's own report does not exist until its runs are analysed, which
 * takes minutes and a model call:
 * - With `reportTask`, a stored report is on the same goal: the preset's own task's, the one
 *   `seed:demo` writes. "See the report" opens it, and a line says this race is not in it.
 *   "Analyse this race" follows as the quiet action.
 * - With none, the goal was edited or no report is stored on it, and "Analyse this race" is the
 *   way on.
 */
export function RaceView({
  task,
  label,
  seeds,
  runs,
  foldOf,
  source,
  over,
  profiles,
  reportTask,
  onNewRace,
}: {
  task: Task;
  label: string;
  seeds: readonly Seed[];
  runs: readonly StartedRun[];
  foldOf: (run: StartedRun) => LaneFold;
  source: "live" | "stored";
  over: boolean;
  profiles: readonly Profile[];
  reportTask: TaskId | undefined;
  onNewRace: () => void;
}) {
  const profileOf = new Map(profiles.map((profile) => [profile.id, profile]));
  const lanes: Lane[] = runs.map((run) => {
    const persona = profileOf.get(run.profileId)?.label ?? run.profileId;
    return {
      run,
      name: seeds.length > 1 ? `${persona}, seed ${run.seed}` : persona,
      ...foldOf(run),
    };
  });
  const laneOf = new Map(lanes.map((lane) => [lane.run.id, lane]));
  const views = new Map(lanes.map(({ run, view }) => [run.id, view]));
  const places = throughPlaces(runs, views);
  // Every ended run once, in `finishOrder`'s order: those that got through first, each numbered with
  // the place its goal post shows, then the others with none. `finishOrder` ranks every ended run,
  // so its own place would put a give-up ahead of a later success that the post calls 1st.
  const finishes = finishOrder(runs, views);
  const listed = [
    ...finishes.filter(({ run }) => places.has(run.id)),
    ...finishes.filter(({ run }) => !places.has(run.id)),
  ];
  const lost = lanes.filter((lane) => lane.lost);
  return (
    <section aria-labelledby="race-goal" className="flex flex-col pb-(--space-4)">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-(--space-6) pt-(--space-4) pb-(--space-4)">
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-(--space-3)">
            <Tag>{label}</Tag>
            <span className="mono-label text-ink-3">{task.id}</span>
            {source === "stored" ? (
              <SourceBadge source="stored" />
            ) : over ? null : (
              <SourceBadge source="live" />
            )}
          </div>
          <h2 id="race-goal" className="my-1.5 display-m text-balance text-ink">
            <q>{task.goal}</q>
          </h2>
          <p className="mono text-ink-3">{`success · ${successText(task.success)}`}</p>
          {/* Last in the strip, so it sits over the lanes whose clocks it names. */}
          <p className="body text-ink-3">
            Simulated time from the KLM and Fitts's law, not the wall clock
          </p>
        </div>
        <div className="flex flex-col items-end gap-(--space-1)">
          <div className="flex items-center gap-(--space-2)">
            <span className="inline-flex h-(--control-h) items-center gap-(--space-2) rounded-sm border border-line-strong bg-surface px-3.5 mono text-ink">
              <span className="text-ink-3">{seeds.length > 1 ? "seeds" : "seed"}</span>
              {seeds.join(", ")}
            </span>
            <Button
              type="button"
              variant="outline"
              onClick={onNewRace}
              aria-describedby={over ? undefined : NEW_RACE_LINE_ID}
            >
              New race
            </Button>
            {!over ? null : reportTask === undefined ? (
              <AnalyseLink taskId={task.id} variant="default" size="default" />
            ) : (
              <Link
                to="/report/$taskId"
                params={{ taskId: reportTask }}
                className={buttonVariants({ variant: "default" })}
              >
                See the report
              </Link>
            )}
          </div>
          {over ? (
            <div className="flex items-center gap-(--space-3)">
              <p className="body text-ink-2">
                <span className="mono text-ink">{`${places.size}/${runs.length}`}</span>
                {` got through${lost.length === 0 ? "" : `, ${count(lost.length, "stream")} lost`}`}
              </p>
              {reportTask === undefined ? null : (
                <AnalyseLink taskId={task.id} variant="ghost" size="sm" />
              )}
            </div>
          ) : (
            <p id={NEW_RACE_LINE_ID} className="max-w-80 text-right body text-ink-3">
              io keeps running this race, and the Race tab brings you back to it. A new race queues
              its runs behind these.
            </p>
          )}
          {over && reportTask !== undefined ? (
            <p className="text-right body text-ink-3">This race is not in the stored report.</p>
          ) : null}
        </div>
      </header>
      <ol className="flex flex-col gap-2.5">
        {lanes.map((lane) => (
          <li key={lane.run.id}>
            <LaneOf
              lane={lane}
              profile={profileOf.get(lane.run.profileId)}
              place={places.get(lane.run.id)}
            />
          </li>
        ))}
      </ol>
      <section aria-labelledby="race-finish-order" className="sr-only">
        <h3 id="race-finish-order">Finish order, by simulated time</h3>
        {/* The page's one live region: a screen reader hears each run end, not every step of five. */}
        <ol aria-live="polite">
          {listed.map(({ run, simulatedMs }) => {
            // `finishOrder` lists only runs `views` holds, so each has its lane, and only once they
            // ended: a listed run's stream was not lost before its end.
            const lane = laneOf.get(run.id);
            if (lane === undefined) return null;
            const place = places.get(run.id);
            const mark = place === undefined ? "–" : `${place}.`;
            const words = OUTCOME_WORDS[laneOutcome(lane.view, false)];
            return (
              <li key={run.id}>{`${mark} ${lane.name} ${words} ${clockText(simulatedMs)}`}</li>
            );
          })}
          {/* Last, with no place: a lost run has no end to list. */}
          {lost.map(({ run, name }) => (
            <li key={run.id}>{`– ${name} ${OUTCOME_WORDS.lost}`}</li>
          ))}
        </ol>
        {listed.length === 0 && lost.length === 0 ? <p>No run has ended yet</p> : null}
      </section>
    </section>
  );
}
