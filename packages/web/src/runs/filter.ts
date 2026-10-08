/**
 * The runs list's URL contract: which runs `/runs` lists. Each search param, `taskId`, `profileId`
 * and `outcome`, narrows the list, and an absent or invalid one means "every".
 *
 * The names are io's `GET /runs` query names, so a dashboard URL's query reads the same as the
 * API's. The screen fetches every run once and filters here, in the browser: the filters' chips
 * are built from every run whatever the table shows, and a filter change then redraws without a
 * request.
 */
import { ProfileId, RunOutcome, type RunResult, TaskId } from "@wayford/core";
import { z } from "zod";

/**
 * The runs list's search params, validated. Every key ends in `.catch(undefined)`, so a broken link
 * degrades to "every" instead of an error screen, as `PreviewSearch` does. A present but invalid key
 * comes back as `undefined`, which overrides the raw value when TanStack merges the validated search
 * over the query; an absent key stays absent, so a link stays as short as it was written.
 */
export const RunsSearch = z.object({
  taskId: TaskId.optional().catch(undefined),
  profileId: ProfileId.optional().catch(undefined),
  outcome: RunOutcome.optional().catch(undefined),
});
export type RunFilter = z.infer<typeof RunsSearch>;

/** The runs every given key matches, in the order given. No key given keeps every run. */
export function filterRuns(runs: readonly RunResult[], filter: RunFilter): RunResult[] {
  return runs.filter(
    (run) =>
      (filter.taskId === undefined || run.taskId === filter.taskId) &&
      (filter.profileId === undefined || run.profileId === filter.profileId) &&
      (filter.outcome === undefined || run.outcome === filter.outcome),
  );
}
