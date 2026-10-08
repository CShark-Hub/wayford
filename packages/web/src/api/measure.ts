/**
 * The preview's way to io's `GET /measure` (`packages/io/src/routes/measure.ts`), through the dev
 * server's `/api` proxy: a page measured live on a device, parsed with core's `PageMeasurement`
 * before the screen perceives it (s3-05). The page is a target-app page by its path or any page by
 * its whole URL (s3-16). `api/axe.ts` asks io through `getFromIo` and `pageParams`, and caches with
 * `IO_CACHE` too.
 */
import { queryOptions } from "@tanstack/react-query";
import { type DeviceKind, PageMeasurement } from "@wayford/core";
import { type ZodType, z } from "zod";

/**
 * How io's `/measure` and `/axe` are asked for `page`, named as the preview names it
 * (`preview/search.ts`): `{ page }` for a target-app path, which starts with `/`, and `{ url }` for
 * any other page, by its whole URL, which never does. io keys both routes by the whole URL
 * (`docs/adr/0003-any-target.md`, D5), so the query's key and io's agree.
 */
export function pageParams(page: string): { page: string } | { url: string } {
  return page.startsWith("/") ? { page } : { url: page };
}

/**
 * `GET /api/measure?device=…&page=…`, or `&url=…` for a URL page, parsed with `PageMeasurement` as
 * `getFromIo` parses.
 */
export function fetchMeasurement(device: DeviceKind, page: string): Promise<PageMeasurement> {
  return getFromIo(
    "measure",
    new URLSearchParams({ device, ...pageParams(page) }),
    PageMeasurement,
    "a measurement",
  );
}

/**
 * `GET /api/<path>?<query>`, parsed with `schema`. A non-OK answer rejects with io's `error` when
 * it sent one, as for a target app that is down. io answers every failure with one, so an answer
 * without it came from something else, such as the dev server's proxy while io is down, and
 * rejects with its status. A body `schema` refuses rejects with "io sent something that is not
 * <what>" and zod's issues on one line, as `collect` words them, since the screen shows the
 * message in a sentence.
 */
export async function getFromIo<T>(
  path: string,
  query: URLSearchParams,
  schema: ZodType<T>,
  what: string,
): Promise<T> {
  const response = await fetch(`/api/${path}?${query}`);
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(ioError(body) ?? `io did not answer (HTTP ${response.status})`);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`io sent something that is not ${what}: ${issues.join("; ")}`, {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

/** io's answer to a request it refused. */
const IoError = z.object({ error: z.string() });

/**
 * The `error` of io's `{ error }` answer, or `undefined` for any other body. `api/illustration.ts`
 * words a refused picture with it too.
 */
export function ioError(body: unknown): string | undefined {
  const parsed = IoError.safeParse(body);
  return parsed.success ? parsed.data.error : undefined;
}

/**
 * How io's queries cache, `measurementQuery`, `api/axe.ts`'s `axeQuery` and
 * `api/illustration.ts`'s `illustrationQuery`: an answer never goes stale and is never dropped,
 * and a failure is retried neither at once nor on mount.
 */
export const IO_CACHE = {
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: Number.POSITIVE_INFINITY,
  retry: false,
  retryOnMount: false,
};

/**
 * The page measured on the device, under the key `["measure", device, page]`, cached with
 * `IO_CACHE`. A URL page's key holds its whole URL, as io's does. The key holds nothing a slider
 * writes, and io keeps a measurement until it restarts, so a measurement once there never goes
 * stale: a slider move, a remount or a refocus never asks io for it again
 * (`tasks/s3-05-live-preview.md`, Constraints). A failure is not retried at once, so the stored
 * page and its banner show without a wait. It holds no data, though, so TanStack counts it stale:
 * a refocus, a return to that page or device, or the screen's Try again asks io again, which is how
 * the preview finds a target app started later. A measurement is never dropped from the cache
 * either: there are two devices times the three pages, and the few URLs a person opens in one
 * session.
 */
export function measurementQuery(device: DeviceKind, page: string) {
  return queryOptions({
    queryKey: ["measure", device, page],
    queryFn: () => fetchMeasurement(device, page),
    ...IO_CACHE,
  });
}
