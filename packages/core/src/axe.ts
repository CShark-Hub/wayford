/**
 * An `AxeScan` is what axe-core found on one target-app page at one set of app
 * parameters, scanned once (`docs/PLAN.md` F10). io stores and serves it, web
 * draws it on the preview's card, and the report cites each violation as a
 * `measurement` finding. It is a record at rest beside the seven contracts,
 * and new, so none of them changes.
 *
 * axe is a measurement, never a filter input: nothing in `packages/filter`
 * reads a scan, and the Actor never sees one. The scan is by page, not by run,
 * because the pages are the same for every persona at fixed app parameters.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Tags and impacts
// ---------------------------------------------------------------------------

/**
 * The axe-core tags a scan runs: WCAG 2.0, 2.1 and 2.2 at levels A and AA, as axe-core 4.13 names
 * them (its API.md, "Axe-core Tags"). axe has no `wcag22a` tag: no WCAG 2.2 level A criterion has
 * a rule. The card's words, "WCAG 2.2 A and AA", say exactly this set.
 */
export const AXE_WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] as const;

/** How serious axe-core rates a violation, mildest first. */
export const AXE_IMPACTS = ["minor", "moderate", "serious", "critical"] as const;

// ---------------------------------------------------------------------------
// The key
// ---------------------------------------------------------------------------

/**
 * The page's path and the app's query, with no origin and no hash:
 * `/settings/data?contrast=2&fontPx=16&targetPx=36`. The same build serves the
 * target app on 5174, on a test's free port and in the `analyse` CLI, so a
 * stored scan holds for all three. A leading `//` or `/\` is refused too: a
 * browser reads either as an origin.
 */
export const AxeUrl = z
  .string()
  .regex(/^\/(?![/\\])[^?#]*\?[^#]+$/, "an axe URL is a path and a query, no origin and no hash");
export type AxeUrl = z.infer<typeof AxeUrl>;

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

/** One rule axe-core found violated on the page. */
export const AxeViolation = z
  .object({
    /** axe's rule id, e.g. `color-contrast`. */
    ruleId: z.string().trim().min(1),
    /** axe types it nullable; violations carry one in practice. */
    impact: z.enum(AXE_IMPACTS).nullable(),
    /** The rule's WCAG tags, those starting `wcag`, in axe's order. */
    tags: z.array(z.string().trim().min(1)),
    /** axe's one-line help, for the report's title and fallback. */
    help: z.string().trim().min(1),
    /** How many elements violate it. */
    nodes: z.number().int().positive(),
  })
  .strict();
export type AxeViolation = z.infer<typeof AxeViolation>;

/** One target-app page at one set of app parameters, scanned once. */
export const AxeScan = z
  .object({
    /** The key: the page's path and the app's query. */
    url: AxeUrl,
    /** When it was scanned. A timestamp only. */
    scannedAt: z.iso.datetime(),
    /** axe-core's own `testEngine.version`. */
    axeVersion: z.string().trim().min(1),
    violations: z.array(AxeViolation),
  })
  .strict();
export type AxeScan = z.infer<typeof AxeScan>;
