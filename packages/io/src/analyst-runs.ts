/**
 * Which stored runs a report reads, and the per-persona numbers it gives them
 * (`docs/specs/2026-10-05-s4-04-analyst.md`, "io: choosing the runs").
 *
 * A report reads one run set: per persona and seed, the latest run on one backend that is no
 * sweep run (A22). Everything else stored for the task is left out and counted, so a reader knows
 * it exists. The numbers are code's, never the model's: runs, successes and errors from the runs'
 * outcomes, the route-open seeds from the filter's route table (s1-06), and the median time to
 * success by web's formula, so the report and the dashboard show one number.
 *
 * The route facts are only typed here. `@wayford/filter/routes` loads Playwright and Vite, and io's
 * barrel must load neither, so this module imports its types alone and the facts are computed
 * elsewhere and handed in.
 */
import {
  PersonaResult,
  type Profile,
  type ProfileId,
  type Report,
  type ReportBackend,
  type RunResult,
  type Seed,
  type TaskId,
  WayfordError,
} from "@wayford/core";
import { profileFixtures } from "@wayford/core/fixtures";
import type { RouteClosed, RouteOpenSeed } from "@wayford/filter/routes";

/**
 * What the route table says for one persona over its seeds: the routes left open in each, and
 * where each other one closed and on what.
 */
export interface RouteFactsOf {
  open: RouteOpenSeed[];
  closings: RouteClosed[];
}

/** The route facts of a persona on a task; undefined for a task with no route table. */
export type RouteFacts = (
  taskId: TaskId,
  profile: Profile,
  seeds: readonly Seed[],
) => Promise<RouteFactsOf | undefined>;

/**
 * The backend a stored run ran on: Jev when `modelIds.actor` is Jev's model (ADR 0001, decision
 * 1) or a step carries a `decision`, so a run from before a pinned-version bump still reads as Jev.
 *
 * One gap is accepted: a run under an earlier Jev version that crashed before its first planned
 * action carries no `decision`, so it reads as LLM. An absent `actorSampling` would catch it, but
 * io's fake LLM runs lack one too, so it cannot tell the backends apart.
 */
export function backendOf(run: RunResult, jevModel: string): ReportBackend {
  if (run.modelIds.actor === jevModel) return "jev";
  return run.steps.some((step) => "decision" in step && step.decision !== undefined)
    ? "jev"
    : "llm";
}

/**
 * The backend a report reads when its request names none: the one every run of `runs` that is no
 * sweep run is on, so a race on the LLM gets its report. Jev, which `seed:demo` runs on, when the
 * runs are on both backends or there is none.
 */
export function defaultBackend(runs: readonly RunResult[], jevModel: string): ReportBackend {
  const backends = new Set(
    runs.filter((run) => run.sweep === undefined).map((run) => backendOf(run, jevModel)),
  );
  const [only, ...more] = backends;
  return only !== undefined && more.length === 0 ? only : "jev";
}

/**
 * The latest run per persona and seed on `backend` that is no sweep run, and what was left out.
 *
 * `runs` come newest first, as `listRuns` returns them, so the first run met per persona and seed
 * is the latest. Each run left out is counted once, under the first reason that holds, in this
 * order: a sweep run (`sweep` set), a run on the other backend, an older run of a persona and seed
 * already chosen.
 *
 * `chosen` is in the order met; `byPersona` gives the order the report lists them in.
 */
export function selectRuns(
  runs: readonly RunResult[],
  backend: ReportBackend,
  jevModel: string,
): { chosen: RunResult[]; leftOut: Report["leftOut"] } {
  const leftOut = { olderRuns: 0, otherBackend: 0, sweepRuns: 0 };
  const seen = new Set<string>();
  const chosen: RunResult[] = [];
  for (const run of runs) {
    if (run.sweep !== undefined) {
      leftOut.sweepRuns += 1;
      continue;
    }
    if (backendOf(run, jevModel) !== backend) {
      leftOut.otherBackend += 1;
      continue;
    }
    // A profile id holds no colon, so the key names one persona and seed.
    const key = `${run.profileId}:${run.seed}`;
    if (seen.has(key)) {
      leftOut.olderRuns += 1;
      continue;
    }
    seen.add(key);
    chosen.push(run);
  }
  return { chosen, leftOut };
}

/** One persona's chosen runs, by seed ascending. */
export interface PersonaRuns {
  profile: Profile;
  runs: RunResult[];
}

/**
 * The chosen runs by persona, in `profileFixtures` order, each persona's runs by seed ascending:
 * the order the report lists them in, whatever order they were stored in. A persona with no run is
 * left out. A run whose profile is not bundled throws `WayfordError("unknown_profile")`:
 * `POST /runs` takes bundled profiles only, so such a run is bad stored data, not a case to count.
 */
export function byPersona(chosen: readonly RunResult[]): PersonaRuns[] {
  for (const run of chosen) {
    if (!profileFixtures.some((profile) => profile.id === run.profileId)) {
      throw new WayfordError(
        "unknown_profile",
        `run ${run.id} names ${run.profileId}, which is not a bundled profile`,
      );
    }
  }
  return profileFixtures.flatMap((profile) => {
    const runs = chosen
      .filter((run) => run.profileId === profile.id)
      .toSorted((a, b) => a.seed - b.seed);
    return runs.length === 0 ? [] : [{ profile, runs }];
  });
}

/**
 * One `PersonaResult` per group of `byPersona`, in its order.
 *
 * `facts` holds the route facts of each persona that has them; a persona absent from it has no
 * route table (a goal without one) and gets `null` route-open numbers, which a screen reads as
 * "—", never 0.
 */
export function personaResults(
  groups: readonly PersonaRuns[],
  facts: ReadonlyMap<ProfileId, RouteFactsOf>,
): PersonaResult[] {
  return groups.map(({ profile, runs }) => {
    const personaFacts = facts.get(profile.id);
    const seeds = runs.map((run) => ({
      seed: run.seed,
      runId: run.id,
      outcome: run.outcome,
      openRoutes: personaFacts === undefined ? null : openIn(personaFacts, run),
    }));
    const successful = runs.filter((run) => run.outcome === "success");
    return PersonaResult.parse({
      profileId: profile.id,
      runs: runs.length,
      errors: runs.filter((run) => run.outcome === "error").length,
      successes: successful.length,
      routeOpenSeeds:
        personaFacts === undefined
          ? null
          : seeds.filter((s) => s.openRoutes !== null && s.openRoutes.length > 0).length,
      medianSuccessMs: median(successful.map((run) => run.durationMs)) ?? null,
      seeds,
    });
  });
}

/** The routes the facts leave open in the run's seed. Facts without that seed are a bug. */
function openIn(facts: RouteFactsOf, run: RunResult): string[] {
  const seed = facts.open.find((entry) => entry.seed === run.seed);
  if (seed === undefined) {
    throw new Error(`the route facts hold no seed ${run.seed}, the seed of run ${run.id}`);
  }
  return seed.open;
}

/**
 * Median of a list; the mean of the two middle values for an even count; undefined when empty.
 * Web's `median` (`packages/web/src/runs/stats.ts`), copied, since io does not import web: one
 * formula for one number on two screens.
 */
function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = values.toSorted((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  // One middle value for an odd count, the two middle values for an even one.
  const middle =
    sorted.length % 2 === 1 ? sorted.slice(half, half + 1) : sorted.slice(half - 1, half + 1);
  return middle.reduce((sum, value) => sum + value, 0) / middle.length;
}
