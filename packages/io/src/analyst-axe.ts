/**
 * The axe-core `measurement` findings: each violation axe-core reports on a page the report's runs
 * stood on (`docs/PLAN.md` F10 AC2, `docs/specs/2026-10-06-s4-06-axe-sidecar.md` §6). A run on the
 * target app has its pages scanned at the app parameters it ran with; a run on any other site has
 * them scanned as it stood on them, at most `MAX_FOREIGN_PAGES` per report
 * (`docs/adr/0003-any-target.md`, D10; `docs/specs/2026-10-07-s4-09-io-any-url.md`, "io: the
 * Analyst").
 *
 * Code writes the finding, and the Analyst only adds a recommendation, as for the deterministic
 * ones (`analyst-closures.ts`). A measurement holds whoever is looking, so it names no persona, and
 * no rule of `RULES.md` produced it, so its basis is empty (`Finding`). Every verdict is clickable
 * through to evidence: the first step of each run that stood on the page.
 *
 * Scans come through the `AxeLookup` handed in, so this module loads neither agent's runtime nor
 * Playwright (s4-03, "The barrel").
 */
import {
  type AxeScan,
  type AxeViolation,
  type EvidenceRef,
  newId,
  type RunResult,
  type TaskId,
  WayfordError,
} from "@wayford/core";
import { TARGET_APP_PATHS } from "@wayford/filter/serve-target-app";
import type { Logger } from "pino";
import type { Draft } from "./analyst-closures.js";
import { plural } from "./analyst-text.js";
import type { AxeLookup } from "./axe.js";
import { nameOf, type PageRef, targetAppPage } from "./page-ref.js";

/**
 * The most pages off the target app one report asks axe-core for: those the most runs stood on
 * (`docs/adr/0003-any-target.md`, D10). Each one not stored yet is loaded and scanned afresh, one
 * after the other, inside the report's request.
 */
const MAX_FOREIGN_PAGES = 10;

/** A page the runs stood on, and the first step of each run on it. */
interface Visited {
  /** The page as the lookup is asked for it, by its whole URL. */
  asked: PageRef;
  evidence: EvidenceRef[];
}

/**
 * One draft per violation axe-core reports on a page `runs` stood on, by page in the order a step
 * first stood on it, runs in the order given, then by violation in the scan's order.
 *
 * A run whose start URL is on `targetAppOrigin`, port included, is on the target app, and within
 * it a step whose page is on that origin and in `TARGET_APP_PATHS` counts. That step stood on its
 * page at the app parameters of its run, the query of the run's start URL, so it asks
 * `targetAppPage(origin, path, search)`, and the finding names the page by its path and those
 * parameters. `http://localhost:8080` is another site, whatever its paths.
 *
 * Any other run is on another site, and each of its steps, on whatever origin, asks the page it
 * stood on, by its whole URL with the hash dropped: a start URL that redirects to `www.` keeps its
 * pages, and a skip link's `#main` is no page of its own. The finding names the page by that URL.
 * Of these pages at most `MAX_FOREIGN_PAGES` are asked, those the most runs stood on, ties to the
 * page stood on first; the rest are logged in one warning and give no finding.
 *
 * A page is its step's `urlBefore`, never its `urlAfter`, so the goal page of a successful run is
 * never asked: the run ends once the action that reached it lands, and no step stands on it. Only a
 * step that stood on a page shows that page in its screenshot and observation, so only such a step
 * is evidence for it (s4-06 spec, decision log, "The goal page").
 *
 * Pages are asked one at a time. A `WayfordError` is logged as a warning naming the URL and its
 * code, and that page gives no finding, so the report is still built. Any other error is a bug,
 * and propagates.
 */
export async function axeDrafts(input: {
  taskId: TaskId;
  /** The chosen runs, in the report's order. */
  runs: readonly RunResult[];
  axe: AxeLookup;
  /** The origin the target app is served on, port included, as `AnalystDeps` has it. */
  targetAppOrigin: string;
  logger: Logger;
}): Promise<Omit<Draft, "key">[]> {
  const { taskId, axe, logger } = input;
  const visited = visitedPages(input.runs, new URL(input.targetAppOrigin).origin);
  const drafts: Omit<Draft, "key">[] = [];
  for (const page of withinCap(visited, logger)) {
    let scan: AxeScan;
    try {
      // One page at a time: a miss scans, and scans share one browser.
      scan = await axe(page.asked);
    } catch (error) {
      if (!(error instanceof WayfordError)) throw error;
      logger.warn(
        { url: page.asked.url, code: error.code },
        "axe-core could not scan a page the runs stood on; it gives no axe finding",
      );
      continue;
    }
    for (const violation of scan.violations) {
      drafts.push(draftOf(taskId, scan, violation, page));
    }
  }
  return drafts;
}

/** The pages `runs` stood on, each once by its whole URL, in the order a step first stood on it. */
function visitedPages(runs: readonly RunResult[], targetAppOrigin: string): Visited[] {
  const pages = new Map<string, Visited>();
  for (const run of runs) {
    const start = new URL(run.startUrl);
    const onTargetApp = start.origin === targetAppOrigin;
    for (const step of run.steps) {
      const asked = pageOf(step.urlBefore, start, onTargetApp);
      if (asked === undefined) continue;
      let page = pages.get(asked.url);
      if (page === undefined) {
        page = { asked, evidence: [] };
        pages.set(asked.url, page);
      }
      // Runs are read one at a time, so a run already cited on this page is the last one cited.
      if (page.evidence.at(-1)?.runId !== run.id) {
        page.evidence.push({ runId: run.id, stepIndex: step.stepIndex });
      }
    }
  }
  return [...pages.values()];
}

/**
 * The page a step stood on, of a run started at `start`, or `undefined` on the target app when it
 * gives none: a page off the run's origin or outside `TARGET_APP_PATHS`.
 */
function pageOf(urlBefore: string, start: URL, onTargetApp: boolean): PageRef | undefined {
  const before = new URL(urlBefore);
  if (onTargetApp) {
    if (before.origin !== start.origin || !TARGET_APP_PATHS.includes(before.pathname)) {
      return undefined;
    }
    return targetAppPage(start.origin, before.pathname, start.search);
  }
  before.hash = "";
  return { url: before.href, onTargetApp: false };
}

/**
 * `pages` as asked, in the order given: every target-app page, and of the others the
 * `MAX_FOREIGN_PAGES` the most runs stood on, ties to the page stood on first. The rest are logged
 * once, each by its URL and how many runs stood on it, since the report is short of what they
 * would have found.
 */
function withinCap(pages: readonly Visited[], logger: Logger): Visited[] {
  // `sort` is stable, so pages stood on by as many runs keep the order a step first stood on each.
  const ranked = pages
    .filter((page) => !page.asked.onTargetApp)
    .sort((a, b) => b.evidence.length - a.evidence.length);
  const skipped = new Set(ranked.slice(MAX_FOREIGN_PAGES));
  if (skipped.size > 0) {
    logger.warn(
      {
        skipped: [...skipped].map((page) => ({ url: page.asked.url, runs: page.evidence.length })),
      },
      `axe-core scans the ${MAX_FOREIGN_PAGES} pages off the target app the most runs stood on; these give no axe finding`,
    );
  }
  return pages.filter((page) => !skipped.has(page));
}

/**
 * One violation as a `measurement` draft, naming its page as `nameOf` does: a target-app page by
 * its path, any other page by its whole URL. The detail says the scan ran on desktop, and on the
 * target app at which of the app's parameters, its run's query: the evidence can be a phone
 * persona's steps, and a rule such as `target-size` can read otherwise at a phone's width.
 */
function draftOf(
  taskId: TaskId,
  scan: AxeScan,
  violation: AxeViolation,
  { asked, evidence }: Visited,
): Omit<Draft, "key"> {
  const { ruleId, help, impact, tags, nodes } = violation;
  const name = nameOf(asked);
  const scannedOn = asked.onTargetApp
    ? `desktop at the app's ${new URL(asked.url).search}`
    : "desktop";
  const wcag = tags.length === 0 ? "none" : tags.join(", ");
  return {
    finding: {
      id: newId("finding"),
      taskId,
      type: "measurement",
      title: `axe-core: ${help} (${ruleId}) on ${name}`,
      detail: `axe-core ${scan.axeVersion} reports ${ruleId} on ${name}, scanned on ${scannedOn}: ${plural(nodes, "element")}, impact ${impact ?? "not given"}, WCAG tags ${wcag}. ${evidence.length} of the report's runs stood on the page.`,
      evidence: [...evidence],
      basis: [],
      personaIds: [],
      axeRuleId: ruleId,
    },
    fallback: `Fix what axe-core's ${ruleId} rule reports on ${name}: ${help}.`,
  };
}
