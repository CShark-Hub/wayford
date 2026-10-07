/**
 * The Lens's way to io's `GET /illustration` (`packages/io/src/routes/illustration.ts`), through
 * the dev server's `/api` proxy: `/deliveries` as a PNG taken under the persona's Chrome vision
 * emulation, on the persona's device (s3-06). The picture illustrates and never decides
 * (`docs/RULES.md`, P6): nothing here reaches `perceive`, the readout or the drawing.
 *
 * It is fetched rather than left to an `<img src>`, so a fetch spy sees it and the query's failed
 * state can show the stored picture, as the measurement's does.
 */
import { queryOptions } from "@tanstack/react-query";
import type { DeviceKind, VisionDeficiency } from "@wayford/core";
import { IO_CACHE, ioError } from "./measure.js";

/**
 * `GET /api/illustration?device=…&emulation=…`, as an object URL of the PNG. A non-OK answer
 * rejects as `getFromIo` rejects one: with io's `error`, or with its status when the answer came
 * from something else, such as the dev server's proxy while io is down. An OK answer that is not a
 * PNG, such as the page Vite serves when the proxy is missing, rejects too.
 *
 * The object URL is kept for the page's life, as the query's cache keeps it: there is at most one
 * per device and emulation the fixture personas use.
 */
export async function fetchIllustration(
  device: DeviceKind,
  emulation: VisionDeficiency,
): Promise<string> {
  const response = await fetch(`/api/illustration?${new URLSearchParams({ device, emulation })}`);
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    throw new Error(ioError(body) ?? `io did not answer (HTTP ${response.status})`);
  }
  if (response.headers.get("content-type") !== "image/png") {
    throw new Error("io sent something that is not a PNG");
  }
  return URL.createObjectURL(await response.blob());
}

/**
 * The picture for the device and emulation, under the key `["illustration", device, emulation]`,
 * cached with `IO_CACHE`, as `measurementQuery` caches. The key holds nothing a slider writes, and
 * the screen enables the query only in the Illustration view, so no other view and no slider move
 * asks io for a picture. io keeps each picture until it restarts, so a picture once here never
 * goes stale; a failure is not retried at once, so the stored picture shows without a wait.
 */
export function illustrationQuery(device: DeviceKind, emulation: VisionDeficiency) {
  return queryOptions({
    queryKey: ["illustration", device, emulation],
    queryFn: () => fetchIllustration(device, emulation),
    ...IO_CACHE,
  });
}

/**
 * The stored picture for the device and emulation, served from `public/illustration/`, which
 * io's `capture:illustrations` writes for every pair the fixture personas use.
 */
export function storedIllustration(device: DeviceKind, emulation: VisionDeficiency): string {
  return `/illustration/${device}-${emulation}.png`;
}
