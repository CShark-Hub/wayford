/**
 * Prints the route table of `docs/RULES.md` with no model involved: the target app at its
 * defaults, each persona on its own device, run seeds 1 to 100, with the target app's jargon list.
 *
 *   pnpm --filter @wayford/filter routes
 *
 * Two tables, in Markdown so they paste into a PR. The first is persona × route, each cell as RULES
 * states it, with a note after the colon where the seeds disagree. The second is every step behind
 * it: what the filter did to the step's element, and the element's A1 rank. Page paths only, never
 * the origin: the port changes from run to run.
 */
import { profileFixtures, targetAppJargon } from "@wayford/core/fixtures";
import { ROUTE_SEEDS, routeSummary, type Tally, type WalkedStep } from "../src/route-table.js";
import { walkRoutes } from "../src/route-walk.js";

const walks = await walkRoutes(profileFixtures.map((profile) => profile.device));
const personas = profileFixtures.map((profile) => {
  const routes = walks.get(profile.device);
  if (!routes) throw new Error(`the routes were not walked on ${profile.device}`);
  return {
    profile,
    routes: routes.map((route) => routeSummary(route, profile, { jargon: targetAppJargon })),
  };
});
const routeIds = personas[0]?.routes.map((route) => route.id) ?? [];

const row = (cells: readonly string[]) => `| ${cells.join(" | ")} |`;
const rule = (columns: number) => row(Array.from({ length: columns }, () => "---"));
/** One value, or each value with the number of seeds that gave it. */
const tallied = (tallies: readonly Tally[]) =>
  tallies.length === 1
    ? (tallies[0]?.value ?? "")
    : tallies.map((t) => `${t.value} in ${t.seeds}`).join("; ");
const where = (step: Omit<WalkedStep, "measurement">) =>
  [step.page, ...step.after.map((c) => `after ${c.role} "${c.name}"`)].join(", ");

const lines = [
  `Routes to the hard goal: the target app at its defaults, run seeds ${ROUTE_SEEDS[0]} to ${ROUTE_SEEDS.at(-1)}.`,
  ...personas.map(
    ({ profile }) =>
      `- ${profile.label}: ${profile.device}, ${profile.behaviour.maxElements === undefined ? "no attention cap" : `maxElements ${profile.behaviour.maxElements}`}`,
  ),
  "",
  row(["Route", ...personas.map(({ profile }) => profile.label)]),
  rule(personas.length + 1),
  ...routeIds.map((id) =>
    row([id, ...personas.map(({ routes }) => routes.find((r) => r.id === id)?.cell ?? "")]),
  ),
  "",
  "Steps. Outcome: shown, renamed (K1, K2, K4), masked (the rules that degraded it) or cut (the rules " +
    "that removed it). A1 rank: the element's place among the elements stages 1 to 3 left shown, " +
    "in salience order; - when the persona has no attention cap or the element was not left shown.",
  "",
  row(["Persona", "Route", "Step", "Page", "Element", "Outcome", "A1 rank"]),
  rule(7),
  ...personas.flatMap(({ profile, routes }) =>
    routes.flatMap((route) =>
      route.steps.map((s) =>
        row([
          profile.label,
          route.id,
          s.place,
          where(s.step),
          `${s.step.role} "${s.step.name}"`,
          tallied(s.outcomes),
          tallied(s.ranks),
        ]),
      ),
    ),
  ),
];
console.log(lines.join("\n"));
