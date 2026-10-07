/**
 * An `AxeScan` is what axe-core found on one page, scanned once (`docs/PLAN.md`
 * F10): a target-app page at one set of app parameters, or any page by its URL
 * (s4-09). io stores and serves it, web draws it on the preview's card, and
 * the report cites each violation as a `measurement` finding. It is a record
 * at rest beside the seven contracts, and new, so none of them changes.
 *
 * axe is a measurement, never a filter input: nothing in `packages/filter`
 * reads a scan, and the Actor never sees one. The scan is by page, not by run,
 * because a page is the same for every persona at fixed app parameters.
 */
import { z } from "zod";
import { HttpUrl } from "./primitives.js";

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
 * The page's whole URL, as `new URL(…).href` spells it: an `HttpUrl`, the URL
 * a run's step stands on, with no user and no password, its query and its
 * hash kept. One page has one key, so a spelling `new URL` would change is
 * refused. The origin is in the key since s4-09: the same path on two sites is
 * two pages (`docs/adr/0003-any-target.md`, D5). A target-app page carries the
 * app's query, on the target-app origin io is configured with:
 * `http://localhost:5174/settings/data?contrast=2&fontPx=16&targetPx=36`.
 *
 * io's `url=` is read through it too, so its messages name a page URL, not a
 * scan's.
 */
export const AxeUrl = HttpUrl.superRefine(
  (value, ctx) => {
    const refuse = (message: string) => ctx.addIssue({ code: "custom", message });
    const url = parseUrl(value);
    if (url.username !== "" || url.password !== "") {
      return refuse("a page URL names no user and no password");
    }
    if (url.href !== value) {
      return refuse(`a page URL is spelled as new URL spells it: ${url.href}`);
    }
  },
  // `HttpUrl`'s own refusal does not stop the checks after it, and `new URL` would throw on what
  // it refused.
  { when: (payload) => payload.issues.length === 0 },
);
export type AxeUrl = z.infer<typeof AxeUrl>;

/** What `AxeUrl` reads of a parsed URL. */
interface ParsedUrl {
  username: string;
  password: string;
  href: string;
}

/**
 * `new URL(value)`, on a value `HttpUrl` has already parsed. `URL` is a global in Node and in every
 * browser, but filter's `tsconfig.perceive.json` compiles core with no DOM and no Node types, so
 * nothing declares it there, as `id.ts` finds for `crypto`. Read through one cast, at call time.
 */
function parseUrl(value: string): ParsedUrl {
  const { URL } = globalThis as unknown as { URL: new (url: string) => ParsedUrl };
  return new URL(value);
}

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

/** One page, scanned once. */
export const AxeScan = z
  .object({
    /** The key: the page's whole URL. */
    url: AxeUrl,
    /** When it was scanned. A timestamp only. */
    scannedAt: z.iso.datetime(),
    /** axe-core's own `testEngine.version`. */
    axeVersion: z.string().trim().min(1),
    violations: z.array(AxeViolation),
  })
  .strict();
export type AxeScan = z.infer<typeof AxeScan>;
