/**
 * The route facts a report reads (`RouteFacts`), from the filter's route table: per persona, the
 * routes the filter left open in each seed, and where it closed the others and on what
 * (`docs/specs/2026-10-05-s4-04-analyst.md`, "io: storage, routes, CLI", and decision log, "The
 * walk, and keeping Playwright out of io's barrel").
 *
 * It stays out of io's barrel, as `chromium.ts` does: `@wayford/filter/routes` walks the target
 * app, and loads Playwright and Vite to do it. The app takes the facts as `AppOptions.routes`, so
 * `analyst.ts` and the routes import their type alone. Outside its tests, `server.ts`, the
 * `analyse` CLI and `seed-demo.ts` are its only importers.
 */
import type { DeviceKind } from "@wayford/core";
import {
  hasRouteTable,
  routeClosings,
  routeOpenSeeds,
  routesFor,
  type WalkedRoute,
  walkRoutes,
} from "@wayford/filter/routes";
import type { RouteFacts } from "./analyst-runs.js";

/**
 * The facts over a walk already taken: for a task with a route table, the walk on the persona's
 * device read with `routeOpenSeeds` and `routeClosings` under `jargon`, the list the runs were
 * perceived with; `undefined` for any other task. `walks` holds every device a persona of the
 * hard goal's runs uses, or `routesFor` throws.
 */
export function routeFactsFrom(
  walks: ReadonlyMap<DeviceKind, readonly WalkedRoute[]>,
  jargon: readonly string[],
): RouteFacts {
  return async (taskId, profile, seeds) => {
    const routes = routesFor(walks, taskId, profile.device);
    if (routes === undefined) return undefined;
    return {
      open: routeOpenSeeds(routes, profile, seeds, { jargon }),
      closings: routeClosings(routes, profile, seeds, { jargon }),
    };
  };
}

/**
 * The facts on the target app, walked when first needed. A task with no route table is answered
 * `undefined` at once, with no walk. The first question on one that has a table walks the app on
 * every device of `devices`, which takes tens of seconds; the walk is kept for the process, so
 * questions that arrive together share it, as `filter/routes` asks. A walk that fails is dropped,
 * so the next question walks again.
 */
export function routeFacts({
  devices,
  jargon,
}: {
  /** Every device a persona may run on: the bundled profiles' `device`. */
  devices: readonly DeviceKind[];
  /** The target app's jargon list, which the runs are perceived with (K2). */
  jargon: readonly string[];
}): RouteFacts {
  let walked: Promise<RouteFacts> | undefined;

  function facts(): Promise<RouteFacts> {
    if (walked !== undefined) return walked;
    const fresh = walkRoutes(devices).then((walks) => routeFactsFrom(walks, jargon));
    walked = fresh;
    // `walked` holds `fresh` until this runs: a walk starts again only once it is cleared.
    fresh.catch(() => {
      walked = undefined;
    });
    return fresh;
  }

  return async (taskId, profile, seeds) => {
    if (!hasRouteTable(taskId)) return undefined;
    return (await facts())(taskId, profile, seeds);
  };
}
