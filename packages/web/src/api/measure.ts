/**
 * The preview's way to io's `GET /measure` (`packages/io/src/routes/measure.ts`), through the dev
 * server's `/api` proxy: a target-app page measured live on a device, parsed with core's
 * `PageMeasurement` before the screen perceives it (s3-05).
 */
import { queryOptions } from "@tanstack/react-query";
import { type DeviceKind, PageMeasurement } from "@wayford/core";
import { z } from "zod";

/**
 * `GET /api/measure?device=…&page=…`, parsed with `PageMeasurement`. A non-OK answer rejects with
 * io's `error` when it sent one, as for a target app that is down. io answers every failure with
 * one, so an answer without it came from something else, such as the dev server's proxy while io
 * is down, and rejects with its status. A body that is not a measurement rejects with zod's
 * issues on one line, as `collect` words them, since the screen shows the message in a sentence.
 */
export async function fetchMeasurement(device: DeviceKind, page: string): Promise<PageMeasurement> {
  const query = new URLSearchParams({ device, page });
  const response = await fetch(`/api/measure?${query}`);
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(ioError(body) ?? `io did not answer (HTTP ${response.status})`);
  }
  const parsed = PageMeasurement.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`io sent something that is not a measurement: ${issues.join("; ")}`, {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

/** io's answer to a request it refused. */
const IoError = z.object({ error: z.string() });

/** The `error` of io's `{ error }` answer, or `undefined` for any other body. */
function ioError(body: unknown): string | undefined {
  const parsed = IoError.safeParse(body);
  return parsed.success ? parsed.data.error : undefined;
}

/**
 * The page measured on the device, under the key `["measure", device, page]`. The key holds
 * nothing a slider writes, and io keeps a measurement until it restarts, so a measurement once
 * there never goes stale: a slider move, a remount or a refocus never asks io for it again
 * (`tasks/s3-05-live-preview.md`, Constraints). A failure is not retried at once, so the stored
 * page and its banner show without a wait. It holds no data, though, so TanStack counts it stale:
 * a refocus, a return to that page or device, or the screen's Try again asks io again, which is
 * how the preview finds a target app started later. A measurement is never dropped from the cache
 * either: there are at most two devices times three pages.
 */
export function measurementQuery(device: DeviceKind, page: string) {
  return queryOptions({
    queryKey: ["measure", device, page],
    queryFn: () => fetchMeasurement(device, page),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
    retryOnMount: false,
  });
}
