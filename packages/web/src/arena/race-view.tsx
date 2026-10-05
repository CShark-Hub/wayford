/**
 * The race as the arena draws it (`docs/PLAN.md` F6): the goal and the seed, one tile per run in
 * start order, and the finish order under them. A pure view of a `RaceSnapshot`: `followRace`
 * keeps the snapshot and this draws it, so a test renders any moment of a race without a stream.
 *
 * A tile says what its state rests on: the page a stuck persona left as it was, the outcome a
 * give-up was stored as, a crash's message. The narration is the model's, set in quotes and never
 * read into. Each avatar state is a static variant (`Avatar`'s `state`), swapped as the events
 * come: nothing moves. A run whose stream broke for good before its end shows no live state: its
 * avatar is plain and dimmed, and its tile says what was last seen.
 */
import type { Profile, Seed } from "@wayford/core";
import { Button } from "#components/ui/button";
import { type StartedRun, screenshotUrl } from "../api/runs.js";
import { Avatar } from "../avatar/avatar.js";
import { personaColour } from "../avatar/parts.js";
import { STATE_WORDS } from "../avatar/state.js";
import { formatSeconds } from "../runs/task-results.js";
import { STUCK_STEPS } from "./avatar-state.js";
import {
  finishOrder,
  type RaceSnapshot,
  type RunView,
  raceOver,
  runView,
  streamLost,
} from "./race.js";

const NOTE = "text-xs text-muted-foreground";
const NEW_RACE_LINE_ID = "race-new-race-line";

/** A run's elapsed time, or a dash before its `runStarted`. */
function elapsedText(ms: number | undefined): string {
  return ms === undefined ? "—" : formatSeconds(ms);
}

/**
 * The state in words, then what it rests on: the page the last `STUCK_STEPS` steps left as it was,
 * the outcome a give-up was stored as, `runFailed`'s message. `code`, when there is one, is set in
 * monospace after the words, and `after` follows it. A `lost` run has no live state: the line says
 * the stream was lost, and the state it was last seen in.
 */
function stateLine(
  view: RunView,
  lost: boolean,
): { words: string; code?: string | undefined; after?: string } {
  if (lost) return { words: `Stream lost: last seen ${STATE_WORDS[view.state].toLowerCase()}` };
  const words = STATE_WORDS[view.state];
  switch (view.state) {
    case "stuck":
      return {
        words: `${words}: the last ${STUCK_STEPS} steps left `,
        code: view.stuckOn,
        after: " as it was",
      };
    case "gaveUp":
      return { words: `${words}: `, code: view.ended?.outcome };
    case "error":
      return { words: view.ended?.error ? `${words}: ${view.ended.error}` : words };
    default:
      return { words };
  }
}

/**
 * `run`'s tile at `view`. `lost`: its stream broke for good before its end, so the tile shows what
 * was last seen and the avatar no live state.
 */
function RunTile({
  run,
  view,
  lost,
  profile,
}: {
  run: StartedRun;
  view: RunView;
  lost: boolean;
  profile: Profile | undefined;
}) {
  const { words, code, after } = stateLine(view, lost);
  const name = profile?.label ?? run.profileId;
  // Built from the run id, so the markup depends on the props alone.
  const headingId = `race-${run.id}`;
  return (
    <article
      aria-labelledby={headingId}
      className="flex h-full flex-col gap-4 rounded-xl border border-t-4 bg-card p-4 text-card-foreground"
      // The persona's colour is the tile's one accent, as on its card.
      style={profile ? { borderTopColor: personaColour(profile) } : undefined}
    >
      <div className="flex items-center gap-3">
        {profile === undefined ? null : lost ? (
          <Avatar profile={profile} className="size-20 shrink-0 opacity-50" />
        ) : (
          <Avatar profile={profile} state={view.state} className="size-20 shrink-0" />
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={headingId} className="text-lg font-semibold">
            {name}
          </h3>
          <p className={lost ? "text-sm font-medium text-destructive" : "text-sm"}>
            {words}
            {code === undefined ? null : <span className="font-mono">{code}</span>}
            {after}
          </p>
        </div>
      </div>
      <dl className="flex flex-col gap-3 text-sm">
        <div>
          <dt className={NOTE}>Elapsed</dt>
          <dd className="font-medium tabular-nums">{elapsedText(view.elapsedMs)}</dd>
        </div>
        <div>
          <dt className={NOTE}>Latest screenshot</dt>
          <dd>
            {view.screenshotStep === undefined ? (
              <span className="text-muted-foreground">No screenshot yet</span>
            ) : (
              <img
                src={screenshotUrl(run.id, view.screenshotStep)}
                alt={`${name}, after step ${view.screenshotStep}`}
                className="h-auto w-full rounded-md border"
              />
            )}
          </dd>
        </div>
        <div>
          <dt className={NOTE}>Narration</dt>
          {/* Empty on a run with no narration, as a Jev run: the line keeps its height. */}
          <dd className="min-h-5">{view.narration ? `“${view.narration}”` : null}</dd>
        </div>
      </dl>
    </article>
  );
}

/**
 * The race after `snapshot`: `goal` as the personas got it, the one `seed` every run shares, a tile
 * per run of `runs` in their order, and the finish order. Every run's persona is in `profiles`, the
 * list io checks the ids against; were one not, its id would name it, with no avatar.
 *
 * "New race" calls `onNewRace` once the race is over (`raceOver`): io cannot cancel a run, so a new
 * race started sooner would queue behind this one's runs. Until then it says why it waits.
 */
export function RaceView({
  goal,
  seed,
  runs,
  snapshot,
  profiles,
  onNewRace,
}: {
  goal: string;
  seed: Seed;
  runs: readonly StartedRun[];
  snapshot: RaceSnapshot;
  profiles: readonly Profile[];
  onNewRace: () => void;
}) {
  const profileOf = new Map(profiles.map((profile) => [profile.id, profile]));
  const nameOf = (run: StartedRun) => profileOf.get(run.profileId)?.label ?? run.profileId;
  // Each run folded once per render: its tile and the finish order read the same view.
  const tiles = runs.map((run) => {
    const view = runView(snapshot.events.get(run.id) ?? []);
    return { run, view, lost: streamLost(view, snapshot.streams.get(run.id)) };
  });
  const finishes = finishOrder(runs, new Map(tiles.map(({ run, view }) => [run.id, view])));
  const lost = tiles.filter((tile) => tile.lost).map(({ run }) => run);
  const over = raceOver(runs, snapshot);
  return (
    <section aria-labelledby="race-goal" className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="race-goal" className="text-xl font-semibold">
            {goal}
          </h2>
          <p className="text-sm text-muted-foreground">
            Seed <span className="font-mono">{seed}</span>
          </p>
        </div>
        <div className="flex max-w-sm flex-col items-end gap-1">
          <Button
            type="button"
            variant="outline"
            onClick={onNewRace}
            disabled={!over}
            aria-describedby={over ? undefined : NEW_RACE_LINE_ID}
          >
            New race
          </Button>
          {over ? null : (
            <p id={NEW_RACE_LINE_ID} className={`${NOTE} text-right`}>
              New race opens once every run has ended: io keeps running them, and a new race would
              queue behind them.
            </p>
          )}
        </div>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {tiles.map(({ run, view, lost: isLost }) => (
          <li key={run.id}>
            <RunTile run={run} view={view} lost={isLost} profile={profileOf.get(run.profileId)} />
          </li>
        ))}
      </ul>
      <section aria-labelledby="race-finish-order" className="flex flex-col gap-2">
        <h3 id="race-finish-order" className="text-sm font-semibold">
          Finish order
        </h3>
        {/* The page's one live region: a screen reader hears each run end, not every step of five. */}
        <ol aria-live="polite" className="flex flex-col gap-1 text-sm">
          {finishes.map(({ run, place, state, elapsedMs }) => (
            <li key={run.id} className="flex gap-3">
              <span className="w-6 font-mono tabular-nums">{`${place}.`}</span>
              <span className="font-medium">{nameOf(run)}</span>
              <span>{STATE_WORDS[state]}</span>
              <span className="text-muted-foreground tabular-nums">{elapsedText(elapsedMs)}</span>
            </li>
          ))}
          {/* After the ranked runs, with no place: a lost run has no end to rank. */}
          {lost.map((run) => (
            <li key={run.id} className="flex gap-3 text-muted-foreground">
              <span className="w-6 font-mono">–</span>
              <span className="font-medium">{nameOf(run)}</span>
              <span>Stream lost</span>
            </li>
          ))}
        </ol>
        {finishes.length === 0 && lost.length === 0 ? (
          <p className={NOTE}>No run has ended yet</p>
        ) : null}
      </section>
    </section>
  );
}
