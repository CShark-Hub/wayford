/**
 * The archive (`docs/PLAN.md` F7 AC1): every stored run in one table, filtered by task, persona and
 * outcome in the URL. There are no per-task results here: F7 AC2, success and median time per
 * persona, lives on each task's report, which every goal in the table links to. A goal shows them
 * once it has a report, an Analyst run, counted over the latest run per persona and seed.
 *
 * The URL holds the filters (`src/runs/filter.ts`), so a filtered view is a link and a reload
 * opens the same view: each filter is a row of links in the segment look, and its picked chip is
 * the URL's value, even one no chip would otherwise hold. The screen fetches every run once and
 * filters in the browser. Every listed run is stored, so the top bar says `stored` once io has
 * answered with runs; the archive spans backends, so no backend tag goes beside it.
 */
import { useQuery } from "@tanstack/react-query";
import { createRoute, Link } from "@tanstack/react-router";
import { RUN_OUTCOMES, type RunResult, type Task } from "@wayford/core";
import { cn } from "cn";
import type { ReactNode } from "react";
import { runsQuery, tasksQuery } from "../api/runs.js";
import { bundledProfiles } from "../bundled-fixtures.js";
import { Banner } from "../components/banner.js";
import { EmptyState } from "../components/empty-state.js";
import { Outcome, outcomeKind } from "../components/outcome.js";
import { OUTCOME_WORDS } from "../components/outcome-words.js";
import { PersonaName } from "../components/persona-avatar.js";
import { SEGMENT_GROUP, segmentItem } from "../components/segmented-control.js";
import { Skeleton } from "../components/skeleton.js";
import { SourceBadge } from "../components/source-badge.js";
import { TopBarSlot } from "../components/top-bar.js";
import { Button, buttonVariants } from "../components/ui/button.js";
import { EXACT } from "../report/cast-table.js";
import { filterRuns, type RunFilter, RunsSearch } from "../runs/filter.js";
import { formatSeconds, usd } from "../runs/step-replay.js";
import { rootRoute } from "../shell.js";

/**
 * A filter's values: `listed` in its order, then every other id in `seen`, once each and sorted,
 * then `current` when none of them holds it, so the chips show what the URL says: a task or
 * persona io no longer has, or one with no run yet.
 */
function filterOptions(
  listed: readonly string[],
  seen: readonly string[],
  current: string | undefined,
): string[] {
  const known = new Set(listed);
  const ids = [...new Set(seen)].filter((id) => !known.has(id)).sort();
  if (current !== undefined && !known.has(current) && !ids.includes(current)) ids.push(current);
  return [...listed, ...ids];
}

/** One chip of a filter: the search keys its link sets, what it reads, and whether in mono. */
type Chip = { value: string; set: RunFilter; label: ReactNode; mono?: boolean };

/** The Outcome filter's chips: core's outcomes in its order, in the fixed words. */
const OUTCOME_CHIPS: Chip[] = RUN_OUTCOMES.map((outcome) => ({
  value: outcome,
  set: { outcome },
  label: OUTCOME_WORDS[outcome],
}));

/**
 * One filter: its visible label, then a fieldset, a group the label names, of links in the segment
 * look, "All" first. Each link sets its keys and keeps the others, and "All" drops its key. A
 * filter is a place: a click pushes a history entry, so Back returns to the filter before.
 * TanStack marks the link to the URL shown `aria-current="page"`, matched exactly (`EXACT`), so
 * "All", whose search leaves its key out, is not current on every URL.
 */
function FilterRow({
  id,
  label,
  all,
  chips,
}: {
  id: string;
  label: string;
  /** The search "All" sets: this filter's key, undefined. */
  all: RunFilter;
  chips: readonly Chip[];
}) {
  return (
    <>
      <p id={id} className="label text-ink-3">
        {label}
      </p>
      <fieldset
        aria-labelledby={id}
        className={cn(SEGMENT_GROUP, "min-w-0 flex-wrap justify-self-start")}
      >
        {[{ value: "", set: all, label: "All" }, ...chips].map((chip) => (
          <Link
            key={chip.value}
            to="/runs"
            search={(prev) => ({ ...prev, ...chip.set })}
            activeOptions={EXACT}
            className={segmentItem(chip.mono)}
          >
            {chip.label}
          </Link>
        ))}
      </fieldset>
    </>
  );
}

/**
 * The three filters. Task: the tasks the runs carry, by goal in io's order, then any other the
 * runs carry by id: a stored task with no run would open an empty table. Persona: the bundled
 * personas, then any other id the runs carry. Outcome: the four stored outcomes.
 */
function Filters({
  runs,
  goals,
  search,
}: {
  runs: readonly RunResult[];
  /** io's tasks' goals by id, in io's order. */
  goals: ReadonlyMap<string, string>;
  search: RunFilter;
}) {
  const carried = new Set(runs.map((run) => run.taskId));
  const taskChips = filterOptions(
    [...goals.keys()].filter((taskId) => carried.has(taskId)),
    [...carried],
    search.taskId,
  ).map((taskId): Chip => {
    const goal = goals.get(taskId);
    return { value: taskId, set: { taskId }, label: goal ?? taskId, mono: goal === undefined };
  });
  const personaChips = filterOptions(
    bundledProfiles.map((profile) => profile.id),
    runs.map((run) => run.profileId),
    search.profileId,
  ).map(
    (profileId): Chip => ({
      value: profileId,
      set: { profileId },
      label: <PersonaName profileId={profileId} />,
    }),
  );
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-(--space-4) gap-y-(--space-3)">
      <FilterRow id="runs-filter-task" label="Task" all={{ taskId: undefined }} chips={taskChips} />
      <FilterRow
        id="runs-filter-persona"
        label="Persona"
        all={{ profileId: undefined }}
        chips={personaChips}
      />
      <FilterRow
        id="runs-filter-outcome"
        label="Outcome"
        all={{ outcome: undefined }}
        chips={OUTCOME_CHIPS}
      />
    </div>
  );
}

/** The table's columns, in order; a number sits right. */
const COLUMNS = [
  { name: "Persona", number: false },
  { name: "Goal", number: false },
  { name: "Outcome", number: false },
  { name: "Seed", number: true },
  { name: "Duration", number: true },
  { name: "Steps", number: true },
  { name: "Cost", number: true },
  { name: "Run", number: false },
] as const;

// Tight padding, so the eight columns fit 1232 px; the goal may wrap. Every cell's text sits in a
// `<p>`, headers too, so `check:self` measures it.
const HEAD = "px-(--space-2) py-(--space-2) align-bottom whitespace-nowrap label text-ink-3";
const CELL = "px-(--space-2) py-(--space-1)";
const NUMBER = cn(CELL, "text-right");
/** A text link: underlined, and a 32 px target at least. */
const TEXT_LINK =
  "inline-flex min-h-(--target-min) items-center text-ink underline underline-offset-4";

/**
 * One run. The row holds the run's record, so a budget run out names its limit. The goal opens its
 * task's report, where success and median time per persona live; the run id opens the run.
 */
function RunRow({ run, goal }: { run: RunResult; goal: string | undefined }) {
  return (
    <tr className="border-b border-line">
      <td className={CELL}>
        <p className="body text-ink">
          <PersonaName profileId={run.profileId} />
        </p>
      </td>
      <td className={CELL}>
        <p className={goal === undefined ? "mono" : "body"}>
          <Link to="/report/$taskId" params={{ taskId: run.taskId }} className={TEXT_LINK}>
            {goal ?? run.taskId}
          </Link>
        </p>
      </td>
      <td className={CELL}>
        {/* A flex box, so the glyph and word sit on the row's middle, not on a text baseline. */}
        <p className="flex">
          <Outcome kind={outcomeKind(run.outcome, run.limit)} />
        </p>
      </td>
      <td className={NUMBER}>
        <p className="mono text-ink">{run.seed}</p>
      </td>
      <td className={NUMBER}>
        <p className="mono text-ink">{formatSeconds(run.durationMs)}</p>
      </td>
      <td className={NUMBER}>
        <p className="mono text-ink">{run.steps.length}</p>
      </td>
      <td className={NUMBER}>
        <p className="mono text-ink">{usd(run.cost)}</p>
      </td>
      <td className={CELL}>
        <p className="mono whitespace-nowrap">
          <Link to="/runs/$runId" params={{ runId: run.id }} className={TEXT_LINK}>
            {run.id}
          </Link>
        </p>
      </td>
    </tr>
  );
}

/** The runs the filters keep, one row each, under the screen's title. */
function RunTable({
  runs,
  goals,
}: {
  runs: readonly RunResult[];
  goals: ReadonlyMap<string, string>;
}) {
  return (
    <div className="overflow-x-auto">
      <table aria-labelledby="runs-title" className="w-full border-collapse">
        <thead>
          <tr className="border-b border-line-strong">
            {COLUMNS.map(({ name, number }) => (
              <th key={name} scope="col" className={cn(HEAD, number ? "text-right" : "text-left")}>
                <p>{name}</p>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <RunRow key={run.id} run={run} goal={goals.get(run.taskId)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

const LOADING_FILTERS = ["task", "persona", "outcome"];
const LOADING_ROWS = [1, 2, 3, 4, 5, 6, 7, 8];

/** Placeholders in the screen's shape: the three filter rows, then eight table rows. */
function RunsSkeleton() {
  return (
    <>
      <p role="status" className="sr-only">
        Loading the runs.
      </p>
      <div className="grid gap-(--space-3)">
        {LOADING_FILTERS.map((filter) => (
          <Skeleton key={filter} className="h-10 w-full max-w-200" />
        ))}
      </div>
      <div className="grid gap-(--space-2)">
        {LOADING_ROWS.map((row) => (
          <Skeleton key={row} className="h-10 w-full" />
        ))}
      </div>
    </>
  );
}

/** The fault banner: io's message in mono, and Try again, which asks io again. */
function Fault({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Banner
      kind="fault"
      action={
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      }
    >
      {"The runs could not be read from io. "}
      <span className="mono">{message}</span>
    </Banner>
  );
}

/**
 * The stored runs: the filters, then the table of the runs they keep, or a line saying none. The
 * top bar says `stored` exactly while they are drawn; the archive spans backends, so no backend
 * tag goes beside it.
 */
function StoredRuns({
  runs,
  shown,
  tasks,
  search,
}: {
  runs: readonly RunResult[];
  /** `runs` as the filters keep them. */
  shown: readonly RunResult[];
  tasks: readonly Task[];
  search: RunFilter;
}) {
  // Goals are labels only: until io answers, or when it fails, a task reads as its id.
  const goals = new Map(tasks.map((task) => [task.id, task.goal]));
  return (
    <>
      <TopBarSlot>
        <SourceBadge source="stored" />
      </TopBarSlot>
      <Filters runs={runs} goals={goals} search={search} />
      {shown.length === 0 ? (
        <div className="grid justify-items-start gap-(--space-1)">
          <p className="body text-ink-2">No run matches these filters.</p>
          <p className="body">
            <Link to="/runs" search={{}} activeOptions={EXACT} className={TEXT_LINK}>
              Show every run
            </Link>
          </p>
        </div>
      ) : (
        <RunTable runs={shown} goals={goals} />
      )}
    </>
  );
}

export function RunsScreen() {
  const search = runsRoute.useSearch();
  const runs = useQuery(runsQuery());
  const tasks = useQuery(tasksQuery());
  const stored = runs.data;
  // Runs held: io answered with at least one. The count and the table speak of them alone.
  const held = stored !== undefined && stored.length > 0 ? stored : undefined;
  const shown = held === undefined ? [] : filterRuns(held, search);

  let body: ReactNode;
  if (held !== undefined) {
    body = <StoredRuns runs={held} shown={shown} tasks={tasks.data ?? []} search={search} />;
  } else if (stored !== undefined) {
    body = (
      <EmptyState
        label="no runs stored"
        sentence="No runs stored yet."
        line="A run is stored when it ends. Start a race, or seed the demo data with pnpm seed:demo."
        action={
          <Link to="/race" className={buttonVariants({ variant: "outline" })}>
            Start a race
          </Link>
        }
      />
    );
  } else if (!runs.isError) {
    body = <RunsSkeleton />;
  }

  return (
    <div className="mx-auto grid max-w-(--content-max) gap-(--space-4) px-(--space-6) pt-(--space-5) pb-(--space-6)">
      <header className="flex flex-wrap items-baseline gap-x-(--space-4) gap-y-(--space-2)">
        <h1 id="runs-title" className="display-l text-balance text-ink">
          Runs
        </h1>
        {held === undefined ? null : (
          <p className="mono text-ink-2">{`${shown.length} of ${held.length} runs`}</p>
        )}
      </header>
      {runs.isError ? (
        <Fault message={runs.error.message} onRetry={() => void runs.refetch()} />
      ) : null}
      {body}
    </div>
  );
}

export const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs",
  // A zod schema is a Standard Schema, which TanStack validates with directly.
  validateSearch: RunsSearch,
  component: RunsScreen,
});
