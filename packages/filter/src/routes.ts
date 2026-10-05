/**
 * `@wayford/filter/routes`, the Node-only entry for the routes to the hard goal: the walk, and which
 * routes the filter left open for a persona in each seed of a run set. The report, the sweep and
 * the Analyst read the route-open share from here, so each shows the same number (`docs/PLAN.md`
 * F8 AC6, F9 AC2).
 *
 *   const walks = await walkRoutes(profiles.map((profile) => profile.device));
 *   const routes = routesFor(walks, task.id, profile.device);
 *   const open = routes && routeOpenSeeds(routes, profile, seeds, { jargon });
 *
 * The walk builds and serves the target app and launches a browser, so it takes seconds. Walk once
 * per process, on every device the personas use, and reuse the result for every persona, seed and
 * swept value. It measures the app at its defaults (`TARGET_APP_DEFAULT_QUERY`), so the share is
 * about runs on the defaults.
 *
 * Playwright and Vite sit behind it, so nothing reached from `./perceive` imports this entry.
 */
export {
  type RouteOpenSeed,
  routeOpenSeeds,
  routesFor,
  type WalkedRoute,
  type WalkedStep,
} from "./route-table.js";
export { walkRoutes } from "./route-walk.js";
