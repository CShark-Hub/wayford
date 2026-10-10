/**
 * The `deterministic` findings: each route the filter closed for a persona, where it closed and on
 * what, with the steps of the persona's runs that show it
 * (`docs/specs/2026-10-05-s4-04-analyst.md`, "io: deterministic findings").
 *
 * Code decides what is true; the model only words it. The title, the detail, the rules, the
 * evidence and every provenance here are written in code, from the route table's closings and the
 * decisions the runs' stored observations carry. The Analyst only adds a recommendation.
 *
 * Every verdict is clickable through to evidence: a closing with no step of the persona's runs on
 * its page, showing the element cut by one of its rules, is no finding. It is listed as an
 * `UnevidencedClosure` instead, and the route-open number already counts it.
 *
 * The route table's types only: `@wayford/filter/routes` loads Playwright and Vite, which io's
 * barrel must not load.
 */
import {
  decisionState,
  type ElementDecision,
  type EvidenceRef,
  type Finding,
  type FindingBasis,
  type MetricName,
  newId,
  type PerceptionDecision,
  PIPELINE_STAGES,
  type Profile,
  type ProvenanceId,
  RULE_IDS,
  type RuleId,
  type RunResult,
  type RunStep,
  type ScoutLine,
  stageOf,
  type TaskId,
  UnevidencedClosure,
} from "@wayford/core";
import type { RouteClosed } from "@wayford/filter/routes";

/**
 * A finding code wrote, before the Analyst writes its recommendation: a `deterministic` one from
 * here, or an axe-core `measurement` (`analyst-axe.ts`).
 */
export interface Draft {
  /** The id the Analyst's answer names it by (`d1`, `d2`, …), set when the drafts are listed. */
  key: string;
  finding: Omit<Finding, "recommendation">;
  /** The recommendation code writes when the Analyst leaves this one blank. */
  fallback: string;
}

/** The detail's last sentence when Scout did not reach the goal: a finding is read against it. */
const SCOUT_NOT_REACHED =
  "Scout, with full vision, did not reach the goal either: this may be the feature, not the persona.";

/**
 * The provenance of `rule` for `profile`: copied from its threshold, or `folk`.
 *
 * P1 and P2 copy `perception.contrast`'s source, P3 `fontPx`'s and P4 `targetPx`'s. A1, A3, K1,
 * K2, K4 and V2 are `folk`: the profile carries no source for its caps, its pattern lists or its
 * vocabulary (`kai.yaml` says they are folk, and the jargon list is `folk`), and a rule without a
 * source says `folk` (`AGENTS.md`, "Provenance on every threshold"). V2 reads the device, which
 * every profile has.
 *
 * A rule whose input the profile does not set has none, and the caller drops the entry: a
 * perception rule without its threshold, A1 or A3 without the cap, K1 and K4 with no unknown
 * pattern, K2 with no vocabulary. So a hypothesis citing Ada's run under A1 gets no basis from
 * her. Any other rule has none either. The value is code's, never the model's (F8 AC5).
 */
export function provenanceOf(rule: RuleId, profile: Profile): ProvenanceId | undefined {
  const { perception, behaviour, knowledge } = profile;
  const folkIf = (set: boolean) => (set ? "folk" : undefined);
  switch (rule) {
    case "P1":
    case "P2":
      return perception.contrast?.provenance;
    case "P3":
      return perception.fontPx?.provenance;
    case "P4":
      return perception.targetPx?.provenance;
    case "A1":
      return folkIf(behaviour.maxElements !== undefined);
    case "A3":
      return folkIf(behaviour.maxOptions !== undefined);
    case "K1":
    case "K4":
      return folkIf(knowledge.unknownPatterns.length > 0);
    case "K2":
      return folkIf(knowledge.domainVocabulary !== undefined);
    case "V2":
      return "folk";
    default:
      return undefined;
  }
}

/** One route closing at one step, over the seeds it closed there in. */
interface Group {
  routeId: string;
  page: string;
  role: string;
  name: string;
  /** By seed ascending, so the first is the lowest seed. */
  closings: RouteClosed[];
}

/**
 * One persona's closings as findings, or as closures with no evidence.
 *
 * `runs` are the persona's chosen runs, `closings` its `routeClosings` over the same seeds, and
 * `seeds` how many seeds it has. Closings group by route and closing step (page, role and name),
 * by route id and then in the order they first close; each group is one finding about the persona,
 * its rules the union over the group's seeds in pipeline order, as `routeCell` merges them. Its
 * fallback is `fallbackRecommendation` of the group's first closing.
 *
 * A step of `runs` is evidence of a group when it stood on the group's page (its `urlBefore`'s
 * path), its observation holds an element with the group's role and name, every such element is
 * `invisible`, and one carries a decision of the group's rules whose own state is `invisible`: the
 * cut the finding claims, read off what the run got. A run at another scroll position, where V2 or
 * A1 decided differently, is no evidence; nor is a step where the element reached the model
 * degraded. Evidence is ordered by run, the runs by seed, then by step.
 */
export function closureFindings(input: {
  taskId: TaskId;
  profile: Profile;
  runs: readonly RunResult[];
  closings: readonly RouteClosed[];
  seeds: number;
  scout: ScoutLine;
}): { drafts: Omit<Draft, "key">[]; unevidenced: UnevidencedClosure[] } {
  const { taskId, profile, seeds, scout } = input;
  const runs = input.runs.toSorted((a, b) => a.seed - b.seed || compareIds(a.id, b.id));
  const drafts: Omit<Draft, "key">[] = [];
  const unevidenced: UnevidencedClosure[] = [];
  for (const group of groupClosings(input.closings)) {
    const [first] = group.closings;
    if (first === undefined) continue;
    const rules = inPipelineOrder(group.closings.flatMap((c) => c.decisions.map((d) => d.rule)));
    const closedIn = new Set(group.closings.map((c) => c.seed)).size;
    const evidence: EvidenceRef[] = runs.flatMap((run) =>
      run.steps
        .filter((step) => showsCut(step, group, rules))
        .map((step) => ({ runId: run.id, stepIndex: step.stepIndex })),
    );
    if (evidence.length === 0) {
      unevidenced.push(
        UnevidencedClosure.parse({
          profileId: profile.id,
          routeId: group.routeId,
          page: group.page,
          role: group.role,
          name: group.name,
          rules,
          seeds: closedIn,
        }),
      );
      continue;
    }
    const basis: FindingBasis[] = rules.flatMap((rule) => {
      const provenance = provenanceOf(rule, profile);
      return provenance === undefined ? [] : [{ rule, provenance }];
    });
    drafts.push({
      finding: {
        id: newId("finding"),
        taskId,
        type: "deterministic",
        title: `The ${group.role} "${group.name}" on ${group.page} is cut by ${rules.join(", ")} for ${profile.label} in ${closedIn} of ${seeds} seeds`,
        detail: detailOf(group, rules, closedIn, profile, scout),
        evidence,
        basis,
        personaIds: [profile.id],
      },
      fallback: fallbackRecommendation(first),
    });
  }
  return { drafts, unevidenced };
}

/**
 * A recommendation written in code from the closing's first decision, for a finding whose
 * recommendation the Analyst left blank. A perception rule names the profile's threshold, which
 * `perceive` copied onto the decision.
 */
export function fallbackRecommendation(closing: RouteClosed): string {
  const [decision] = closing.decisions;
  if (decision === undefined) {
    throw new Error(`route ${closing.routeId} closed in seed ${closing.seed} on no decision`);
  }
  switch (decision.stage) {
    case "perception":
      return RAISE[decision.rule](shown(decision.threshold));
    case "attention":
      return "Make it stand out more on the page, or put fewer things beside it.";
    case "viewport":
      return "Bring it into view without scrolling.";
    case "knowledge":
      return "Give it a visible text label in everyday words.";
  }
}

/** P1 and P2 both compare contrast, so they ask for the same change. */
const raiseContrast = (threshold: string) =>
  `Raise its contrast to at least ${threshold}:1 against its background.`;

/** What to raise, per perception rule, given the threshold as written. */
const RAISE: Record<PerceptionDecision["rule"], (threshold: string) => string> = {
  P1: raiseContrast,
  P2: raiseContrast,
  P3: (threshold) => `Raise its font size to at least ${threshold} px.`,
  P4: (threshold) => `Make its target at least ${threshold} px on its smaller side.`,
};

/** How a metric is named in a detail, and the unit its values are written with. */
const METRIC_WORDS: Record<MetricName, { name: string; unit: string }> = {
  contrast: { name: "contrast", unit: ":1" },
  fontPx: { name: "font size", unit: " px" },
  targetPx: { name: "target size", unit: " px" },
};

/** Closings grouped by route and closing step: by route id, then in the order they first close. */
function groupClosings(closings: readonly RouteClosed[]): Group[] {
  const groups = new Map<string, Group>();
  for (const closing of closings) {
    const { routeId, page, role, name } = closing;
    const key = JSON.stringify([routeId, page, role, name]);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, { routeId, page, role, name, closings: [closing] });
    else group.closings.push(closing);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, closings: group.closings.toSorted((a, b) => a.seed - b.seed) }))
    .toSorted((a, b) => compareIds(a.routeId, b.routeId));
}

/** Whether a step shows the group's element cut by one of its rules. See `closureFindings`. */
function showsCut(step: RunStep, group: Group, rules: readonly RuleId[]): boolean {
  if (new URL(step.urlBefore).pathname !== group.page) return false;
  const elements = step.fullObservation.elements.filter(
    (e) => e.role === group.role && e.name === group.name,
  );
  return (
    elements.length > 0 &&
    elements.every((e) => e.state === "invisible") &&
    elements.some((e) =>
      e.decisions.some((d) => rules.includes(d.rule) && decisionState(d) === "invisible"),
    )
  );
}

/**
 * The detail: the route, one clause per rule read from the first seed whose decisions carry it,
 * what that means for the model, and Scout's sentence when Scout did not reach the goal.
 */
function detailOf(
  group: Group,
  rules: readonly RuleId[],
  closedIn: number,
  profile: Profile,
  scout: ScoutLine,
): string {
  const clauses = rules.flatMap((rule) => {
    const decision = group.closings
      .flatMap((closing) => closing.decisions)
      .find((d) => d.rule === rule);
    return decision === undefined ? [] : [clauseOf(decision, profile)];
  });
  const seeds = closedIn === 1 ? "that seed" : `those ${closedIn} seeds`;
  const sentences = [
    `Route ${group.routeId} closes at this step.`,
    ...clauses,
    `In ${seeds} the ${group.role} does not reach the model.`,
  ];
  if (scout.status === "notReached") sentences.push(SCOUT_NOT_REACHED);
  return sentences.join(" ");
}

/**
 * One rule's clause: what it compared, or what cap or side cut the element. A perception rule's
 * threshold is the decision's: `perceive` copies it from the profile that cut the element. The
 * Analyst's case words its cut lines with it too (`analyst-digest.ts`), so both read alike.
 */
export function clauseOf(decision: ElementDecision, profile: Profile): string {
  const { label } = profile;
  switch (decision.stage) {
    case "perception": {
      const { name, unit } = METRIC_WORDS[decision.metric];
      const { threshold } = decision;
      const value = `${measured(decision.value)}${unit}`;
      const clause = `${decision.rule}: ${name} ${value}, below ${label}'s threshold of ${shown(threshold)}${unit}`;
      const softness = profile.perception[decision.metric]?.softness ?? 0;
      if (softness === 0) return `${clause}.`;
      // A threshold with a band below it: inside the band the seed's roll decides between degraded
      // and cut. Worded without "soft", which the report keeps for a folk or llm source.
      const floor = `${shown(threshold * (1 - softness))}${unit}`;
      return `${clause}. ${label}'s cut has a band from ${floor} to ${shown(threshold)}${unit}, inside which the seed's roll decides between degraded and cut.`;
    }
    case "attention":
      return decision.rule === "A1"
        ? `A1: ${label}'s attention cap${cap(profile.behaviour.maxElements, "elements")} cuts it.`
        : `A3: ${label}'s option cap${cap(profile.behaviour.maxOptions, "entries")} cuts it.`;
    case "viewport": {
      const where = decision.side === "left" || decision.side === "right" ? "of " : "";
      return `V2: it lies wholly ${decision.side} ${where}the viewport.`;
    }
    case "knowledge":
      return decision.rule === "K2"
        ? `K2: its name holds a term outside ${label}'s vocabulary.`
        : `${decision.rule}: its pattern is one ${label} does not know.`;
  }
}

/** ` of 20 elements`, or nothing when the profile sets no cap. */
function cap(value: number | undefined, unit: string): string {
  return value === undefined ? "" : ` of ${value} ${unit}`;
}

/**
 * A measured value, truncated to 3 decimals and never rounded up, so a value below a threshold
 * never reads as the threshold (RULES, "What is measured"). The filter's own rule, `truncateRatio`:
 * the 1e-9 only absorbs float noise, so 2.006, which is 2005.9999999999998 thousandths, stays
 * 2.006, while 31.9999996 is 31.999, never 32.
 */
function measured(value: number): string {
  return String(Math.floor(value * 1000 + 1e-9) / 1000);
}

/** A threshold or a band floor, rounded to 3 decimals: 3 × (1 − 0.3) reads 2.1. */
function shown(value: number): string {
  return String(Math.round(value * 1e3) / 1e3);
}

/** Each rule once, by pipeline stage and then rule id: the order `perceive` lists decisions in. */
function inPipelineOrder(rules: readonly RuleId[]): RuleId[] {
  const order = (rule: RuleId) =>
    PIPELINE_STAGES.indexOf(stageOf(rule)) * RULE_IDS.length + RULE_IDS.indexOf(rule);
  return [...new Set(rules)].toSorted((a, b) => order(a) - order(b));
}

/** Ids compared by code unit, as a bare `.sort()` compares them. */
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
