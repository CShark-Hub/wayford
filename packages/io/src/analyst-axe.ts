/**
 * The axe-core `measurement` findings: each violation axe-core reports on a target-app page the
 * report's runs stood on, at the app parameters they ran with (`docs/PLAN.md` F10 AC2,
 * `docs/specs/2026-10-06-s4-06-axe-sidecar.md` §6).
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
import { type AxeLookup, axeUrl } from "./axe.js";

/**
 * The hosts the target app is served on, and the only ones: a run started anywhere else is on
 * another site, whose pages are no target-app page, whatever its start URL's parameters say.
 */
const TARGET_APP_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1"]);

/** A target-app page at one set of app parameters, and the first step of each run on it. */
interface Visited {
  path: string;
  /** The app's query, as the run's start URL holds it: `?contrast=2&fontPx=16&targetPx=36`. */
  search: string;
  evidence: EvidenceRef[];
}

/**
 * One draft per violation axe-core reports on a page `runs` stood on, by page in the order a step
 * first stood on it, runs in the order given, then by violation in the scan's order.
 *
 * A run counts when its start URL is on `localhost` or `127.0.0.1`, and within it a step whose
 * page is on the run's own origin and in `TARGET_APP_PATHS`. That step stood on its page at the
 * app parameters of its run, the query of the run's start URL, so it asks
 * `axeUrl(path, search)`.
 *
 * A page is its step's `urlBefore`, never its `urlAfter`, so the goal page of a successful run is
 * never asked: the run ends once the action that reached it lands, and no step stands on it. Only a
 * step that stood on a page shows that page in its screenshot and observation, so only such a step
 * is evidence for it (spec, decision log, "The goal page").
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
  logger: Logger;
}): Promise<Omit<Draft, "key">[]> {
  const { taskId, axe, logger } = input;
  const drafts: Omit<Draft, "key">[] = [];
  for (const [url, page] of visitedPages(input.runs)) {
    let scan: AxeScan;
    try {
      // One page at a time: a miss scans, and scans share one browser.
      scan = await axe(url);
    } catch (error) {
      if (!(error instanceof WayfordError)) throw error;
      logger.warn(
        { url, code: error.code },
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

/** The target-app pages `runs` stood on, by axe URL, in the order a step first stood on each. */
function visitedPages(runs: readonly RunResult[]): Map<string, Visited> {
  const pages = new Map<string, Visited>();
  for (const run of runs) {
    const start = new URL(run.startUrl);
    if (!TARGET_APP_HOSTS.has(start.hostname)) continue;
    for (const step of run.steps) {
      const before = new URL(step.urlBefore);
      if (before.origin !== start.origin || !TARGET_APP_PATHS.includes(before.pathname)) continue;
      const url = axeUrl(before.pathname, start.search);
      let page = pages.get(url);
      if (page === undefined) {
        page = { path: before.pathname, search: start.search, evidence: [] };
        pages.set(url, page);
      }
      // Runs are read one at a time, so a run already cited on this page is the last one cited.
      if (page.evidence.at(-1)?.runId !== run.id) {
        page.evidence.push({ runId: run.id, stepIndex: step.stepIndex });
      }
    }
  }
  return pages;
}

/**
 * One violation as a `measurement` draft. The detail says the scan ran on desktop: the evidence
 * can be a phone persona's steps, and a rule such as `target-size` can read otherwise at a phone's
 * width.
 */
function draftOf(
  taskId: TaskId,
  scan: AxeScan,
  violation: AxeViolation,
  { path, search, evidence }: Visited,
): Omit<Draft, "key"> {
  const { ruleId, help, impact, tags, nodes } = violation;
  const wcag = tags.length === 0 ? "none" : tags.join(", ");
  return {
    finding: {
      id: newId("finding"),
      taskId,
      type: "measurement",
      title: `axe-core: ${help} (${ruleId}) on ${path}`,
      detail: `axe-core ${scan.axeVersion} reports ${ruleId} on ${path}, scanned on desktop at the app's ${search}: ${plural(nodes, "element")}, impact ${impact ?? "not given"}, WCAG tags ${wcag}. ${evidence.length} of the report's runs stood on the page.`,
      evidence: [...evidence],
      basis: [],
      personaIds: [],
      axeRuleId: ruleId,
    },
    fallback: `Fix what axe-core's ${ruleId} rule reports on ${path}: ${help}.`,
  };
}
