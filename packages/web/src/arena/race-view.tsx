/**
 * The race as `docs/design/screens/race.html` draws it (`docs/PLAN.md` F6): the goal strip, then
 * one lane per run in start order, stacked full width. A pure view of a `RaceSnapshot`:
 * `followRace` keeps the snapshot and this folds it into each `RaceLane`'s props, so a test renders
 * any moment of a race without a stream.
 *
 * A lane says what its state rests on: the page a stuck persona left as it was, a crash's message,
 * the state a lost stream was last seen in. The narration is the model's, labelled as written after
 * the fact and never read into. Each avatar state is a static variant (`Avatar`'s `state`), swapped
 * as the events come: nothing moves. A run whose stream broke for good before its end shows no
 * live state: its avatar is plain and dimmed, its track has no step under way, and its lane says
 * what was last seen.
 *
 * The finish order stays as a list for screen readers, the page's one live region. It numbers only
 * the runs that got through, with the places their goal posts show to the eye. Every other ended
 * run follows with no number, its outcome word and its clock, and a lost run comes last.
 */
import type { Profile, RunEvent, Seed, Task } from "@wayford/core";
import type { ReactElement } from "react";
import { OUTCOME_WORDS } from "#components/outcome";
import { PersonaAvatar } from "#components/persona-avatar";
import { RaceLane } from "#components/race-lane";
import { SourceBadge } from "#components/source-badge";
import { Tag } from "#components/tag";
import { TopBarSlot } from "#components/top-bar";
import { Button } from "#components/ui/button";
import { type StartedRun, screenshotUrl } from "../api/runs.js";
import { slotOf } from "../avatar/slots.js";
import { STATE_WORDS } from "../avatar/state.js";
import { STUCK_STEPS } from "./avatar-state.js";
import {
  clockText,
  finishOrder,
  laneOutcome,
  type RaceSnapshot,
  type RunView,
  raceOver,
  runView,
  stepPips,
  stepsText,
  streamLost,
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
 * One run as its lane folds it: the persona's name, the run's events so far, their view, and
 * whether its stream was lost.
 */
type Lane = {
  run: StartedRun;
  name: string;
  events: readonly RunEvent[];
  view: RunView;
  lost: boolean;
};

/**
 * `lane`'s `RaceLane`. `place` is its place among the runs that got through. Its avatar shows the
 * live state, or, on a lost lane, no state and dimmed, and a lost lane's track no step under way.
 */
function LaneOf({
  lane: { run, name, events, view, lost },
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
      pips={stepPips(events, lost)}
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
      clock={clockText(view.elapsedMs)}
      steps={stepsText(events, view.ended !== undefined)}
      detail={detailOf(view, lost)}
      narration={view.narration}
    />
  );
}

/**
 * The race after `snapshot`: `task`'s goal as the personas got it, under its preset's `label`, the
 * one `seed` every run shares, a lane per run of `runs` in their order, and the finish order for
 * screen readers. Every run's persona is in `profiles`, the list io checks the ids against; were
 * one not, its id would name it, with no avatar.
 *
 * The top bar's badge reads `live` while a stream can still bring an event, and nothing once the
 * race is over (`raceOver`): the race holds nothing stored.
 *
 * "New race" calls `onNewRace` once the race is over (`raceOver`): io cannot cancel a run, so a new
 * race started sooner would queue behind this one's runs. Until then it says why it waits.
 */
export function RaceView({
  task,
  label,
  seed,
  runs,
  snapshot,
  profiles,
  onNewRace,
}: {
  task: Task;
  label: string;
  seed: Seed;
  runs: readonly StartedRun[];
  snapshot: RaceSnapshot;
  profiles: readonly Profile[];
  onNewRace: () => void;
}) {
  const profileOf = new Map(profiles.map((profile) => [profile.id, profile]));
  // Each run folded once per render: its lane and the finish order read the same view.
  const lanes: Lane[] = runs.map((run) => {
    const events = snapshot.events.get(run.id) ?? [];
    const view = runView(events);
    return {
      run,
      name: profileOf.get(run.profileId)?.label ?? run.profileId,
      events,
      view,
      lost: streamLost(view, snapshot.streams.get(run.id)),
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
  const over = raceOver(runs, snapshot);
  return (
    <section aria-labelledby="race-goal" className="flex flex-col pb-(--space-4)">
      <TopBarSlot>{over ? null : <SourceBadge source="live" />}</TopBarSlot>
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-(--space-6) pt-(--space-4) pb-(--space-4)">
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-(--space-3)">
            <Tag>{label}</Tag>
            <span className="mono-label text-ink-3">{task.id}</span>
          </div>
          <h2 id="race-goal" className="my-1.5 display-m text-balance text-ink">
            <q>{task.goal}</q>
          </h2>
          <p className="mono text-ink-3">{`success · ${successText(task.success)}`}</p>
        </div>
        <div className="flex flex-col items-end gap-(--space-1)">
          <div className="flex items-center gap-(--space-2)">
            <span className="inline-flex h-(--control-h) items-center gap-(--space-2) rounded-sm border border-line-strong bg-surface px-3.5 mono text-ink">
              <span className="text-ink-3">seed</span>
              {seed}
            </span>
            <Button
              type="button"
              variant="outline"
              onClick={onNewRace}
              disabled={!over}
              aria-describedby={over ? undefined : NEW_RACE_LINE_ID}
            >
              New race
            </Button>
          </div>
          {over ? null : (
            <p id={NEW_RACE_LINE_ID} className="max-w-80 text-right body text-ink-3">
              New race opens once every run has ended: io keeps running them, and a new race would
              queue behind them.
            </p>
          )}
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
        <h3 id="race-finish-order">Finish order</h3>
        {/* The page's one live region: a screen reader hears each run end, not every step of five. */}
        <ol aria-live="polite">
          {listed.map(({ run, elapsedMs }) => {
            // `finishOrder` lists only runs `views` holds, so each has its lane, and only once they
            // ended: a listed run's stream was not lost before its end.
            const lane = laneOf.get(run.id);
            if (lane === undefined) return null;
            const place = places.get(run.id);
            const mark = place === undefined ? "–" : `${place}.`;
            const words = OUTCOME_WORDS[laneOutcome(lane.view, false)];
            return <li key={run.id}>{`${mark} ${lane.name} ${words} ${clockText(elapsedMs)}`}</li>;
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
