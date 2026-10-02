/**
 * The dashboard: every stored run, filtered by task, persona and outcome in the URL, with each
 * task's results per persona (`docs/PLAN.md` F7 AC1, AC2).
 *
 * The URL holds the filters (`src/runs/filter.ts`), so a filtered view is a link and a reload
 * opens the same view: each select shows the URL's value, even one no option holds. The screen
 * fetches every run once and filters in the browser. The per-task results take the task filter
 * alone (`TaskResults`); the run list takes all three.
 *
 * Function first: week 4's design pass decides the look (`docs/PLAN.md` "UI"). Until then the
 * output register is sober, monochrome and dense, and the persona colour is the one accent.
 */
import { useQuery } from "@tanstack/react-query";
import { createRoute, Link } from "@tanstack/react-router";
import { RUN_OUTCOMES, type RunResult, type Task } from "@wayford/core";
import { runsQuery, tasksQuery } from "../api/runs.js";
import { bundledProfiles } from "../bundled-fixtures.js";
import { filterRuns, type RunFilter, RunsSearch } from "../runs/filter.js";
import { usd } from "../runs/step-replay.js";
import { formatSeconds, PersonaName, TaskResults } from "../runs/task-results.js";
import { rootRoute } from "../shell.js";

/** One option of a filter: the value the URL holds, and what the select shows for it. */
type Option = { value: string; label: string };

/** The value of a filter's "All" option, which leaves its key out of the URL. */
const ALL = "";

/**
 * A filter's options: `listed` in its order, then every other id in `seen`, once each and sorted,
 * then `current` when none of them holds it, so the select shows what the URL says: a task or
 * persona io no longer has, or one with no run yet. An id nothing lists reads as itself.
 */
function filterOptions(
  listed: readonly Option[],
  seen: readonly string[],
  current: string | undefined,
): Option[] {
  const known = new Set(listed.map((option) => option.value));
  const ids = [...new Set(seen)].filter((id) => !known.has(id)).sort();
  if (current !== undefined && !known.has(current) && !ids.includes(current)) ids.push(current);
  return [...listed, ...ids.map((id) => ({ value: id, label: id }))];
}

/** The Outcome filter's options, the stored values themselves, in core's order. */
const OUTCOME_OPTIONS: Option[] = RUN_OUTCOMES.map((outcome) => ({
  value: outcome,
  label: outcome,
}));

/** One filter: a native select with a visible label and an "All" option first. */
function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string | undefined;
  options: readonly Option[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ALL}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 max-w-xs rounded-md border bg-background px-2 text-sm"
      >
        <option value={ALL}>All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const CELL = "px-3 py-1.5";
const NUMBER_CELL = `${CELL} text-right font-mono tabular-nums`;
const HEAD_CELL = `${CELL} font-medium`;

/** The filtered runs, one row each, the run id a link to its detail. */
function RunList({
  runs,
  goals,
}: {
  runs: readonly RunResult[];
  goals: ReadonlyMap<string, string>;
}) {
  return (
    <div className="overflow-x-auto">
      <table aria-labelledby="run-list" className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th scope="col" className={`${HEAD_CELL} text-left`}>
              Persona
            </th>
            <th scope="col" className={`${HEAD_CELL} text-left`}>
              Task
            </th>
            <th scope="col" className={`${HEAD_CELL} text-left`}>
              Outcome
            </th>
            <th scope="col" className={`${HEAD_CELL} text-right`}>
              Seed
            </th>
            <th scope="col" className={`${HEAD_CELL} text-right`}>
              Duration
            </th>
            <th scope="col" className={`${HEAD_CELL} text-right`}>
              Steps
            </th>
            <th scope="col" className={`${HEAD_CELL} text-right`}>
              Cost
            </th>
            <th scope="col" className={`${HEAD_CELL} text-left`}>
              Run
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} className="border-t">
              <td className={CELL}>
                <PersonaName profileId={run.profileId} />
              </td>
              <td className={CELL}>{goals.get(run.taskId) ?? run.taskId}</td>
              <td className={`${CELL} font-mono`}>{run.outcome}</td>
              <td className={NUMBER_CELL}>{run.seed}</td>
              <td className={NUMBER_CELL}>{formatSeconds(run.durationMs)}</td>
              <td className={NUMBER_CELL}>{run.steps.length}</td>
              <td className={NUMBER_CELL}>{usd(run.cost)}</td>
              <td className={`${CELL} font-mono whitespace-nowrap`}>
                <Link
                  to="/runs/$runId"
                  params={{ runId: run.id }}
                  className="underline decoration-muted-foreground underline-offset-2 hover:text-foreground"
                >
                  {run.id}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A line the screen shows in place of what it cannot show yet, or at all. */
function Notice({ children }: { children: string }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/** The stored runs: the filters, the per-task results, then the run list of the runs the filters keep. */
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
  const navigate = runsRoute.useNavigate();
  const goals = new Map(tasks.map((task) => [task.id, task.goal]));

  // A change pushes a history entry, so Back returns to the filter before: a filter is a place.
  // "All" removes the key.
  function change(key: keyof RunFilter, value: string) {
    void navigate({ search: (prev) => ({ ...prev, [key]: value === ALL ? undefined : value }) });
  }

  return (
    <>
      <fieldset aria-label="Filters" className="flex flex-wrap items-end gap-4">
        <FilterSelect
          id="runs-filter-task"
          label="Task"
          value={search.taskId}
          options={filterOptions(
            tasks.map((task) => ({ value: task.id, label: task.goal })),
            runs.map((run) => run.taskId),
            search.taskId,
          )}
          onChange={(value) => change("taskId", value)}
        />
        <FilterSelect
          id="runs-filter-persona"
          label="Persona"
          value={search.profileId}
          options={filterOptions(
            bundledProfiles.map((profile) => ({ value: profile.id, label: profile.label })),
            runs.map((run) => run.profileId),
            search.profileId,
          )}
          onChange={(value) => change("profileId", value)}
        />
        <FilterSelect
          id="runs-filter-outcome"
          label="Outcome"
          value={search.outcome}
          options={OUTCOME_OPTIONS}
          onChange={(value) => change("outcome", value)}
        />
      </fieldset>
      <TaskResults runs={filterRuns(runs, { taskId: search.taskId })} goals={goals} />
      <section aria-labelledby="run-list" className="flex flex-col gap-3">
        <h2 id="run-list" className="font-medium">
          Run list
        </h2>
        {shown.length === 0 ? (
          <Notice>No run matches these filters</Notice>
        ) : (
          <RunList runs={shown} goals={goals} />
        )}
      </section>
    </>
  );
}

export function RunsScreen() {
  const search = runsRoute.useSearch();
  const runs = useQuery(runsQuery());
  // Goals are labels only: until io answers, or when it fails, a task reads as its id.
  const tasks = useQuery(tasksQuery());
  const stored = runs.data;
  const shown = stored === undefined ? [] : filterRuns(stored, search);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">Runs</h1>
        {stored === undefined ? null : (
          <p className="text-sm text-muted-foreground tabular-nums">
            {`${shown.length} of ${stored.length} runs`}
          </p>
        )}
      </header>
      {runs.isError ? (
        <p role="alert" className="text-sm">
          {`Could not load the runs: ${runs.error.message}`}
        </p>
      ) : null}
      {stored === undefined ? (
        runs.isError ? null : (
          <p role="status" className="text-sm text-muted-foreground">
            Loading runs…
          </p>
        )
      ) : stored.length === 0 ? (
        <div className="flex flex-col gap-1">
          <Notice>No runs stored yet</Notice>
          <Notice>A run is stored when it ends.</Notice>
        </div>
      ) : (
        <StoredRuns runs={stored} shown={shown} tasks={tasks.data ?? []} search={search} />
      )}
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
