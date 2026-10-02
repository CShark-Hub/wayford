/**
 * A task's results per persona (`docs/PLAN.md` F7 AC2): how often each persona got there, and how
 * long it took when it did.
 *
 * The rate leaves `error` runs out: `error` is the tool falling over, not the persona
 * (`RunOutcome`), so it is counted on its own. The median is over successful runs only, "median
 * time to success": a median over give-ups and budget cuts would mix how long a persona took to
 * fail with how long it took to arrive.
 */
import type { RunResult } from "@wayford/core";

/** One persona's results on one task. */
export type PersonaStats = {
  profileId: string;
  /** Every run of this persona on this task. */
  runs: number;
  errors: number;
  successes: number;
  /** successes / (runs - errors); undefined when every run errored. */
  successRate: number | undefined;
  /** Median `durationMs` over the successful runs; undefined without a success. */
  medianSuccessMs: number | undefined;
};

/** One task's results, one entry per persona with runs on it. */
export type TaskStats = { taskId: string; personas: PersonaStats[] };

/** Median of a list; the mean of the two middle values for an even count; undefined when empty. */
export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = values.toSorted((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  // One middle value for an odd count, the two middle values for an even one.
  const middle =
    sorted.length % 2 === 1 ? sorted.slice(half, half + 1) : sorted.slice(half - 1, half + 1);
  return middle.reduce((sum, value) => sum + value, 0) / middle.length;
}

/**
 * One entry per task that has runs, by task id. Inside each, one entry per persona with runs on
 * that task: the ids in `personaOrder` first, in that order, then any other id, sorted.
 */
export function taskStats(
  runs: readonly RunResult[],
  personaOrder: readonly string[],
): TaskStats[] {
  // An id outside `personaOrder` ranks after every id in it.
  const rank = (id: string) => {
    const index = personaOrder.indexOf(id);
    return index === -1 ? personaOrder.length : index;
  };
  return [...groupBy(runs, (run) => run.taskId)]
    .toSorted(([a], [b]) => compareIds(a, b))
    .map(([taskId, taskRuns]) => ({
      taskId,
      personas: [...groupBy(taskRuns, (run) => run.profileId)]
        .toSorted(([a], [b]) => rank(a) - rank(b) || compareIds(a, b))
        .map(([profileId, personaRuns]) => personaStats(profileId, personaRuns)),
    }));
}

/** One persona's numbers over its runs on one task. */
function personaStats(profileId: string, runs: readonly RunResult[]): PersonaStats {
  const errors = runs.filter((run) => run.outcome === "error").length;
  const successful = runs.filter((run) => run.outcome === "success");
  const counted = runs.length - errors;
  return {
    profileId,
    runs: runs.length,
    errors,
    successes: successful.length,
    successRate: counted === 0 ? undefined : successful.length / counted,
    medianSuccessMs: median(successful.map((run) => run.durationMs)),
  };
}

/** `runs` grouped by `key`, groups in the order their first run comes, each in the order given. */
function groupBy(
  runs: readonly RunResult[],
  key: (run: RunResult) => string,
): Map<string, RunResult[]> {
  const groups = new Map<string, RunResult[]>();
  for (const run of runs) {
    const group = groups.get(key(run));
    if (group === undefined) groups.set(key(run), [run]);
    else group.push(run);
  }
  return groups;
}

/** Ids compared by code unit, as a bare `.sort()` compares them. */
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
