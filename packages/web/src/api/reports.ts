/**
 * The report screen's way to io's reports API (`packages/io/src/routes/reports.ts`), through the
 * dev server's `/api` proxy: a task's stored report read back, and the Analyst asked to build it
 * again (s3-08). Both answers are parsed with core's `Report`, and a refusal reads as
 * `api/runs.ts` words it, `io answered <status>: <error>`, since its helpers do the reading.
 *
 * io's `POST` is synchronous and can take minutes, with no job id or progress: both screens show it
 * running from the pending state of the goal's latest analysis, through `useAnalysis`.
 */
import { queryOptions, useMutationState } from "@tanstack/react-query";
import { Report, ReportBackend } from "@wayford/core";
import { parseResponse, postJson } from "./runs.js";

/** A task's own path under io's `/reports`, its id encoded. */
function reportPath(taskId: string): string {
  return `/api/reports/${encodeURIComponent(taskId)}`;
}

/** `GET /api/reports/:taskId`, parsed with `Report`; `null` on 404 (no report on that task yet). */
export async function fetchReport(taskId: string): Promise<Report | null> {
  const response = await fetch(reportPath(taskId));
  if (response.status === 404) return null;
  return parseResponse(response, Report, "a report");
}

/**
 * `POST /api/reports/:taskId`: the Analyst over the task's stored runs on `backend`, stored in
 * place of the report before it. With no `backend` the body is `{}` and io reads the backend the
 * task's runs are on, `jev` when they are on both. io's 201 parses with `Report`; any refusal
 * rejects, a 404 included, since on `POST` it means there are no runs to read, not that no report
 * is stored.
 */
export async function analyse(taskId: string, backend?: ReportBackend): Promise<Report> {
  return parseResponse(await postJson(reportPath(taskId), { backend }), Report, "a report");
}

/**
 * A task's stored report, or `null` when io has none, under the key `["reports", taskId]`. A
 * failure is not retried, as `api/measure.ts`'s `IO_CACHE` does it, so the screen's fault shows at
 * once while io is down. `analyse`'s result is written here with `setQueryData`.
 */
export function reportQuery(taskId: string) {
  return queryOptions({
    queryKey: ["reports", taskId],
    queryFn: () => fetchReport(taskId),
    retry: false,
  });
}

/**
 * The key a goal's analysis runs under, on the Report screen and the Target screen alike, so
 * either shows the other's as running, and neither offers a second paid call while one runs.
 */
export function analysisKey(taskId: string) {
  return ["analyse", taskId] as const;
}

/**
 * The latest analysis of `taskId` in the mutation cache, whichever screen or visit asked for it
 * (#237): whether it runs, since when (ms), how it ended, and the backend it asked for, so Try
 * again repeats it on either screen; none when it asked for io's default. Only one runs at a time,
 * since both screens hold their button while one does, so the latest is the one running.
 */
export function useAnalysis(taskId: string): {
  pending: boolean;
  succeeded: boolean;
  since: number | undefined;
  error: Error | null | undefined;
  backend: ReportBackend | undefined;
} {
  const latest = useMutationState({
    filters: { mutationKey: analysisKey(taskId) },
    select: ({ state }) => ({
      status: state.status,
      submittedAt: state.submittedAt,
      error: state.error,
      backend: ReportBackend.safeParse(state.variables).data,
    }),
  }).at(-1);
  return {
    pending: latest?.status === "pending",
    succeeded: latest?.status === "success",
    since: latest?.status === "pending" ? latest.submittedAt : undefined,
    error: latest?.error,
    backend: latest?.backend,
  };
}
