/**
 * The report screen's way to io's reports API (`packages/io/src/routes/reports.ts`), through the
 * dev server's `/api` proxy: a task's stored report read back, and the Analyst asked to build it
 * again (s3-08). Both answers are parsed with core's `Report`, and a refusal reads as
 * `api/runs.ts` words it, `io answered <status>: <error>`, since its helpers do the reading.
 *
 * io's `POST` is synchronous and can take minutes, with no job id or progress: the screen shows it
 * running from its own mutation's pending state.
 */
import { queryOptions } from "@tanstack/react-query";
import { Report, type ReportBackend } from "@wayford/core";
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
 * place of the report before it. With no `backend` the body is `{}` and io picks its default,
 * `jev`. io's 201 parses with `Report`; any refusal rejects, a 404 included, since on `POST` it
 * means there are no runs to read, not that no report is stored.
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
