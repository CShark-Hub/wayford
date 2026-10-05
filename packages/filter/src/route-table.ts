/**
 * The route table of `docs/RULES.md` (the calibration row "What the filter leaves on each route"),
 * computed with no model: what the filter does to each step of each route to the hard goal, for
 * one persona over run seeds 1 to 100, and where each route closes.
 *
 * Pure: the page measurements come in, taken by `route-walk.ts` where a person reaches each step,
 * and `perceive` decides, with the options it is given: the target app's jargon list, so K2 is in
 * the table. `scripts/routes.ts` prints the tables, and `routes.browser.test.ts` holds them against
 * RULES. `routeOpenSeeds` reads the same closing rule over a run set's seeds, for `./routes`.
 *
 * A step's outcome is what the filter did to the step's element: shown, renamed (K1, K2, K4),
 * masked (the rules that degraded it) or cut (the rules that made it invisible: V2, P1, P3, P4, A1). When
 * several elements share the step's role and name, as the nav and card "Your account" links on
 * `/`, the best outcome wins: shown, then renamed or masked, then cut. A tie goes to the one the
 * persona reads first: the more salient under a cap, the first measured without one. A route
 * closes at its first cut step: a step on `/` is home, the last step the final link, any other
 * the entrance.
 */
import {
  type AriaRole,
  type DeviceKind,
  decisionState,
  type ElementDecision,
  type ObservedElement,
  type PageMeasurement,
  type PerceptionState,
  PIPELINE_STAGES,
  RULE_IDS,
  type RuleId,
  type Seed,
  stageOf,
  type TaskId,
  worstState,
} from "@wayford/core";
import { type PerceiveOptions, type PerceiveProfile, perceive } from "./perceive.js";

/** Run seeds 1 to 100, the seeds the RULES route table is computed over. */
export const ROUTE_SEEDS: readonly Seed[] = Array.from({ length: 100 }, (_, i) => i + 1);

/** A control clicked on a page before it was measured: a menu toggle, or the step before. */
interface Clicked {
  role: AriaRole;
  name: string;
}

/** One step of a route, with the page measurement taken where a person reaches it. */
export interface WalkedStep {
  /** The path of the page the step is taken on. */
  page: string;
  role: AriaRole;
  /** Accessible name, as the measurement holds it. */
  name: string;
  /** What was clicked on the page before it was measured, in order; empty for the page as loaded. */
  after: readonly Clicked[];
  measurement: PageMeasurement;
}

export interface WalkedRoute {
  id: string;
  steps: readonly WalkedStep[];
}

/** Where a step sits on its route. */
type StepPlace = "home" | "entrance" | "final link";

/** What the filter did to a step's element. */
type Outcome = "shown" | "renamed" | "masked" | "cut";

/** One step in one seed. */
interface StepResult {
  outcome: Outcome;
  /**
   * The rules behind the outcome, in pipeline order: K1, K2 and K4 when renamed, those whose
   * decision is `degraded` when masked, those whose decision is `invisible` when cut. None when
   * shown.
   */
  rules: RuleId[];
  /**
   * The A1 rank, `r of n`: the element's place among the elements stages 1 to 3 left shown, in
   * salience order. `-` when the profile sets no cap, so A1 does not apply, or when stages 1 to 3
   * removed the element.
   */
  rank: string;
}

/** How many seeds gave one value. */
export interface Tally {
  value: string;
  seeds: number;
}

/** One step over all seeds. Tallies list each value once, in the order it first came up. */
interface StepSummary {
  place: StepPlace;
  step: Omit<WalkedStep, "measurement">;
  /** `shown`, or the outcome with its rules, such as `masked (P1)`. */
  outcomes: Tally[];
  ranks: Tally[];
}

/** One route over all seeds. */
interface RouteSummary {
  id: string;
  /**
   * The route's cell in the RULES table: `open`, `closed at <place> (<rules>)` when every seed
   * closes it at the same place, or `per seed (<rules>): open in k of n, ...` otherwise. The
   * rules are those of every seed's closing step, together.
   */
  cell: string;
  steps: StepSummary[];
}

/** Lower is better: shown, then renamed or masked, then cut. */
const OUTCOME_RANK: Record<Outcome, number> = { shown: 0, renamed: 1, masked: 1, cut: 2 };

/** A step on `/` is home, the route's last step the final link, any other the entrance. */
function stepPlace(route: WalkedRoute, index: number): StepPlace {
  if (route.steps[index]?.page === "/") return "home";
  return index === route.steps.length - 1 ? "final link" : "entrance";
}

/**
 * What the filter does to one step in one seed. Throws when the step's page holds no element with
 * its role and name: the walk measured the wrong page.
 */
function stepResult(
  step: WalkedStep,
  profile: PerceiveProfile,
  runSeed: Seed,
  options: PerceiveOptions,
): StepResult {
  const observation = perceive(step.measurement, profile, runSeed, options);
  let best: { element: ObservedElement; outcome: Outcome; rules: RuleId[] } | undefined;
  // In the order the persona reads, and a later element replaces the best only when it does
  // strictly better.
  for (const element of observation.elements) {
    if (element.role !== step.role || element.name !== step.name) continue;
    const judged = { element, ...judge(element) };
    if (best === undefined || OUTCOME_RANK[judged.outcome] < OUTCOME_RANK[best.outcome]) {
      best = judged;
    }
  }
  if (best === undefined) {
    throw new Error(`${step.role} "${step.name}" is not measured on ${step.page}`);
  }
  return {
    outcome: best.outcome,
    rules: best.rules,
    rank: a1Rank(observation.elements, best.element, profile),
  };
}

/** `shown`, or the outcome with its rules: `renamed (K1, K2, K4)`, `cut (P3, P4)`. */
function describeOutcome(result: Pick<StepResult, "outcome" | "rules">): string {
  return result.rules.length === 0
    ? result.outcome
    : `${result.outcome} (${result.rules.join(", ")})`;
}

/** Each step of the route in one seed, in route order. */
function routeInSeed(
  route: WalkedRoute,
  profile: PerceiveProfile,
  runSeed: Seed,
  options: PerceiveOptions,
): StepResult[] {
  return route.steps.map((step) => stepResult(step, profile, runSeed, options));
}

/**
 * Where a route closes in one seed: the index of its first cut step, or -1 when no step is cut and
 * the route is open. The one place that decides it: the table's cells and `routeOpenSeeds` both
 * read it.
 */
function closingStep(steps: readonly StepResult[]): number {
  return steps.findIndex((result) => result.outcome === "cut");
}

/**
 * One route for one persona over `ROUTE_SEEDS`: every step's outcomes and ranks, and the route's
 * cell. `options` go to `perceive` as they are.
 */
export function routeSummary(
  route: WalkedRoute,
  profile: PerceiveProfile,
  options: PerceiveOptions,
): RouteSummary {
  // One row per seed: each step's result in it, in route order.
  const rows = ROUTE_SEEDS.map((seed) => routeInSeed(route, profile, seed, options));
  // A seed closes the route at its first cut step, if it has one.
  const closings = rows.flatMap((row) => {
    const index = closingStep(row);
    const closing = row[index];
    return closing === undefined ? [] : [{ place: stepPlace(route, index), rules: closing.rules }];
  });
  return {
    id: route.id,
    cell: routeCell(closings, ROUTE_SEEDS.length),
    steps: route.steps.map(({ measurement: _, ...step }, index) => {
      // The step's result in each seed, in seed order.
      const column = rows.flatMap((row) => row[index] ?? []);
      return {
        place: stepPlace(route, index),
        step,
        outcomes: tally(column.map((result) => describeOutcome(result))),
        ranks: tally(column.map((result) => result.rank)),
      };
    }),
  };
}

/** One seed of a run set, and the routes the filter left open in it. */
export interface RouteOpenSeed {
  seed: Seed;
  /** The ids of the routes no step of which was cut, in walk order. Empty when every one closed. */
  open: string[];
}

/**
 * Per seed, in the order of `seeds`, the routes of `walked` the filter left open for `profile`. A
 * route is open in a seed when no step of it is cut, the rule the table's cells follow. `walked` is
 * the walk on the persona's device (`routesFor`). `options` go to `perceive` as they are: pass the
 * jargon the runs were given, so the number is about the observations they got.
 */
export function routeOpenSeeds(
  walked: readonly WalkedRoute[],
  profile: PerceiveProfile,
  seeds: readonly Seed[],
  options: PerceiveOptions = {},
): RouteOpenSeed[] {
  return seeds.map((seed) => ({
    seed,
    open: walked
      .filter((route) => closingStep(routeInSeed(route, profile, seed, options)) === -1)
      .map((route) => route.id),
  }));
}

/** The one task with a route table: the hard goal, the order archive the three routes lead to. */
const HARD_GOAL_TASK_ID = "task_past-order";

/**
 * The walked routes to a task's goal on one device: the walk on `device` for the hard goal, and
 * `undefined` for any other task, which has no route table. A screen shows `undefined` as "—",
 * never as 0. Throws when the hard goal's routes were not walked on `device`.
 */
export function routesFor(
  walks: ReadonlyMap<DeviceKind, readonly WalkedRoute[]>,
  taskId: TaskId,
  device: DeviceKind,
): readonly WalkedRoute[] | undefined {
  if (taskId !== HARD_GOAL_TASK_ID) return undefined;
  const routes = walks.get(device);
  if (routes === undefined) throw new Error(`the routes were not walked on ${device}`);
  return routes;
}

/**
 * One element's outcome and the rules behind it. A rename wins over a mask, as it does in the
 * Actor's text (`toActorObservation`).
 */
function judge(element: ObservedElement): Pick<StepResult, "outcome" | "rules"> {
  const { decisions, state } = element;
  if (state === "invisible") return { outcome: "cut", rules: rulesFor(decisions, state) };
  if (element.renamedName !== undefined) {
    const knowledge = decisions.filter((d) => d.stage === "knowledge").map((d) => d.rule);
    return { outcome: "renamed", rules: knowledge };
  }
  if (state === "degraded") return { outcome: "masked", rules: rulesFor(decisions, state) };
  return { outcome: "shown", rules: [] };
}

/** The rules whose own decision gives `state`. `perceive` lists decisions in pipeline order. */
function rulesFor(decisions: readonly ElementDecision[], state: PerceptionState): RuleId[] {
  return decisions.filter((d) => decisionState(d) === state).map((d) => d.rule);
}

/** The element's A1 rank: see `StepResult.rank`. With a cap, the evidence is in salience order. */
function a1Rank(
  elements: readonly ObservedElement[],
  element: ObservedElement,
  profile: PerceiveProfile,
): string {
  if (profile.behaviour.maxElements === undefined) return "-";
  const leftShown = elements.filter(
    (e) => worstState(e.decisions.filter((d) => d.stage !== "attention")) !== "invisible",
  );
  const place = leftShown.indexOf(element);
  return place === -1 ? "-" : `${place + 1} of ${leftShown.length}`;
}

/** The route's cell, from the place and rules each closed seed closed at. See `RouteSummary.cell`. */
function routeCell(
  closings: readonly { place: StepPlace; rules: RuleId[] }[],
  seeds: number,
): string {
  if (closings.length === 0) return "open";
  const rules = inPipelineOrder(closings.flatMap((closing) => closing.rules)).join(", ");
  const places = tally(closings.map(({ place }) => (place === "home" ? "home" : `the ${place}`)));
  const [only] = places;
  if (closings.length === seeds && places.length === 1 && only !== undefined) {
    return `closed at ${only.value} (${rules})`;
  }
  const notes = [`open in ${seeds - closings.length} of ${seeds}`];
  for (const place of places) notes.push(`closed at ${place.value} in ${place.seeds}`);
  return `per seed (${rules}): ${notes.join(", ")}`;
}

/** Each rule once, by pipeline stage and then rule id, the order `perceive` lists decisions in. */
function inPipelineOrder(rules: readonly RuleId[]): RuleId[] {
  const order = (rule: RuleId) =>
    PIPELINE_STAGES.indexOf(stageOf(rule)) * RULE_IDS.length + RULE_IDS.indexOf(rule);
  return [...new Set(rules)].sort((a, b) => order(a) - order(b));
}

/** How many seeds gave each of `values`, each value once, in the order it first came up. */
function tally(values: readonly string[]): Tally[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([value, seeds]) => ({ value, seeds }));
}
