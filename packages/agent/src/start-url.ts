/**
 * The URL a run opens the target app at: the task's start URL with the app's three parameters on
 * it (issue #51, `packages/target-app/README.md`, "Parameters"). A run on any other site is handed
 * no parameters and opens its start URL as given.
 *
 * The app removes the parameters from the address bar once it has saved them, so after load
 * `page.url()` cannot give them back. The URL built here is the one `goto` receives and the run
 * records, and it carries all three, so no run depends on what its tab saved before.
 */
import { ContrastRatio, type Task, WayfordError } from "@wayford/core";
import { z } from "zod";

/** The target app's three query parameters, in the ranges of its README's Parameters table. */
export const TargetAppParams = z
  .object({
    // `z.number()` already rejects NaN and ±Infinity in zod 4. The contrast range is WCAG's.
    contrast: ContrastRatio,
    fontPx: z.number().min(6).max(72),
    targetPx: z.number().min(8).max(96),
  })
  .strict();
export type TargetAppParams = z.infer<typeof TargetAppParams>;

/**
 * The defaults in the README's Parameters table, which the calibration table in `docs/RULES.md`
 * is written against.
 */
export const TARGET_APP_DEFAULTS = {
  contrast: 2,
  fontPx: 16,
  targetPx: 36,
} as const satisfies TargetAppParams;

// The order they are appended in, so every run spells its start URL the same way.
const PARAM_NAMES = ["contrast", "fontPx", "targetPx"] as const;

/**
 * `task.startUrl` with all three parameters, last and in this order: the URL `goto` receives and
 * the run records. A parameter the task's URL already carries is replaced, duplicates included;
 * any other query parameter and the hash are kept.
 *
 * With no `params` the run is on another site (`docs/adr/0003-any-target.md`, D2 and D3), and the
 * start URL is `task.startUrl` exactly as given, never passed through `URL`, which could respell
 * it.
 *
 * Parameters that are missing, unknown or outside the README's ranges throw a `WayfordError` with
 * code `invalid_target_app_params`. The app would drop or clamp them silently, and the recorded
 * URL would then no longer be the whole setting.
 */
export function startUrlFor(task: Pick<Task, "startUrl">, params?: TargetAppParams): string {
  if (params === undefined) return task.startUrl;
  const parsed = TargetAppParams.safeParse(params);
  if (!parsed.success) {
    throw new WayfordError(
      "invalid_target_app_params",
      `Invalid target app parameters:\n${z.prettifyError(parsed.error)}`,
      { cause: parsed.error },
    );
  }
  const url = new URL(task.startUrl);
  for (const name of PARAM_NAMES) {
    // `set` would keep the first occurrence's place; delete and append moves it to the end.
    url.searchParams.delete(name);
    url.searchParams.append(name, String(parsed.data[name]));
  }
  return url.href;
}
